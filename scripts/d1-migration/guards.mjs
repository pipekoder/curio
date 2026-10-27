import { createHash, createPublicKey, publicEncrypt, randomBytes, createCipheriv, constants } from 'node:crypto'
import { gzipSync } from 'node:zlib'

export const TARGET = Object.freeze({ name: 'curio-catalog', id: 'b39c4f63-74ee-47f6-bb1d-7388ecc88bc7', binding: 'CATALOG_DB', environment: 'production-d1-migration', migration: '0001_catalog.sql', hash: '61ece1ec93c0123324b0a9af7ccb9fdefc5b465e63355817c84f756dfce827c2' })
export const tables = ['brand_sources','catalog_assets','asset_versions','asset_discoveries','asset_permissions','permission_history','asset_intelligence','editorial_facts','object_regions','catalog_imports']
export const indexes = { versions_asset: 'asset_versions', discoveries_source: 'asset_discoveries', permissions_status: 'asset_permissions', intelligence_version: 'asset_intelligence', facts_source: 'editorial_facts', regions_version: 'object_regions' }
export const digest = value => createHash('sha256').update(value).digest('hex')
export function check(condition, code) { if (!condition) throw new Error(code) }
export function dispatchGuard(env) {
  check(env.GITHUB_REPOSITORY === 'pipekoder/curio' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main', 'untrusted_dispatch')
  check(env.GITHUB_RUN_ATTEMPT === '1', 'fresh_dispatch_required')
  check(/^[a-f0-9]{40}$/.test(env.REVIEWED_SHA ?? '') && env.REVIEWED_SHA === env.GITHUB_SHA, 'reviewed_commit_mismatch')
  check(env.MIGRATION_CONFIRMATION === 'MIGRATE curio-catalog 0001', 'confirmation_mismatch')
  check(env.ACTIONS_STEP_DEBUG !== 'true' && env.ACTIONS_RUNNER_DEBUG !== 'true' && env.RUNNER_DEBUG !== '1', 'debug_logging_forbidden')
}
export function environmentGuard(policy, branches, approvals, actorId) {
  const required = policy.protection_rules?.find(r => r.type === 'required_reviewers')
  const reviewers = required?.reviewers?.filter(r => r.type === 'User' && Number.isInteger(r.reviewer?.id)).map(r => String(r.reviewer.id)) ?? []
  check(Number.isInteger(policy.id) && required?.prevent_self_review === true && reviewers.length > 0, 'environment_review_required')
  check(policy.deployment_branch_policy?.custom_branch_policies === true && branches.branch_policies?.length === 1 && branches.branch_policies[0].name === 'main' && branches.branch_policies[0].type === 'branch', 'environment_main_only_required')
  if (approvals !== undefined) check(approvals.some(a => a.state === 'approved' && reviewers.includes(String(a.user?.id)) && String(a.user?.id) !== String(actorId) && a.environments?.some(e => e.id === policy.id)), 'actual_environment_approval_required')
}
export function configGuard(config, sql, migrationFiles) {
  const binding = config.d1_databases?.find(b => b.binding === TARGET.binding)
  check(config.name === 'curio' && binding?.database_name === TARGET.name && binding.database_id === TARGET.id && binding.migrations_dir === 'migrations' && config.vars?.CATALOG_OPERATOR_ENABLED === 'false', 'repository_target_mismatch')
  check(migrationFiles.length === 1 && migrationFiles[0] === TARGET.migration && digest(sql) === TARGET.hash, 'migration_review_required')
}
export function identityGuard(account, database, accountId, accountName) {
  check(/^[a-f0-9]{32}$/.test(accountId ?? '') && accountName?.length > 0 && account.id === accountId && account.name === accountName, 'account_mismatch')
  check(database.uuid === TARGET.id && database.name === TARGET.name && database.version === 'production', 'database_mismatch')
}
export function workerGuard(version) {
  const bindings = version.resources?.bindings ?? []
  check(bindings.some(b => b.name === 'CATALOG_OPERATOR_ENABLED' && b.type === 'plain_text' && b.text === 'false'), 'operator_not_disabled')
  check(bindings.some(b => b.name === TARGET.binding && b.type === 'd1' && b.id === TARGET.id), 'production_binding_mismatch')
}
export function preflightGuard(schema, history) {
  check(schema.every(o => o.name.startsWith('sqlite_') || o.type === 'table' && ['_cf_KV','d1_migrations'].includes(o.name)), 'schema_not_empty_or_already_applied')
  check(history.length === 0, 'migration_history_not_empty')
}
export function verificationGuard(schema, history, foreignKeys, integrity) {
  for (const name of tables) check(schema.some(o => o.type === 'table' && o.name === name), 'missing_catalog_table')
  for (const [name, table] of Object.entries(indexes)) check(schema.some(o => o.type === 'index' && o.name === name && o.tbl_name === table), 'missing_catalog_index')
  check(schema.some(o => o.type === 'trigger' && o.name === 'permission_audit' && o.tbl_name === 'asset_permissions'), 'missing_audit_trigger')
  check(history.length === 1 && history[0].name === TARGET.migration, 'migration_history_mismatch')
  check(foreignKeys.length === 0 && integrity.length === 1 && Object.values(integrity[0])[0] === 'ok', 'database_integrity_failed')
}
export function backupUrls(env) {
  check(env.D1_BACKUP_PRIVATE_CONFIRMED === 'true' && /^[a-z0-9.-]+$/.test(env.D1_BACKUP_HOST ?? '') && !/cloudflare\.com$|github\.com$/.test(env.D1_BACKUP_HOST), 'private_backup_setup_required')
  return ['D1_BACKUP_UPLOAD_URL','D1_BACKUP_DOWNLOAD_URL'].map(key => {
    let url; try { url = new URL(env[key]) } catch { throw new Error('backup_url_invalid') }
    check(url.protocol === 'https:' && url.hostname === env.D1_BACKUP_HOST && !url.username && !url.password && !url.port && !url.hash, 'backup_url_invalid')
    return url.href
  })
}
export function encryptRecovery(payload, pem, expectedFingerprint) {
  let key; try { key = createPublicKey(pem) } catch { throw new Error('backup_key_invalid') }
  check(key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails.modulusLength >= 3072 && digest(key.export({ type: 'spki', format: 'der' })) === expectedFingerprint, 'backup_key_invalid')
  const secret = randomBytes(32), iv = randomBytes(12), aad = Buffer.from('curio-d1-recovery-v1')
  try {
    const cipher = createCipheriv('aes-256-gcm', secret, iv); cipher.setAAD(aad)
    const encrypted = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(payload)))), cipher.final()])
    return Buffer.from(JSON.stringify({ format: 'curio-d1-recovery-v1', wrappedKey: publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, secret).toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') }))
  } finally { secret.fill(0) }
}
