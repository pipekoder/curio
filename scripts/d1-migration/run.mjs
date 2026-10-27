import { readFile, writeFile, mkdir, mkdtemp, readdir, lstat, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { TARGET, tables, indexes, check, digest, dispatchGuard, environmentGuard, configGuard, identityGuard, workerGuard, preflightGuard, verificationGuard, backupUrls, encryptRecovery } from './guards.mjs'

// Static errors only: never print upstream bodies, child output, URLs or bookmarks.
async function boundedBody(response, limit = 4 * 1024 * 1024) {
  const reader = response.body?.getReader(); check(reader, 'response_missing')
  const parts = []; let size = 0
  try { while (true) { const r = await reader.read(); if (r.done) break; size += r.value.byteLength; check(size <= limit, 'response_too_large'); parts.push(r.value) } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  return Buffer.concat(parts)
}
async function api(url, token, options = {}) {
  let response
  try { response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(30000) }) }
  catch { throw new Error('api_unavailable') }
  check(response.ok, 'api_request_failed')
  try { return JSON.parse((await boundedBody(response)).toString()) } catch { throw new Error('api_response_invalid') }
}
export async function auditApproval(env, approved, get = api) {
  dispatchGuard(env); check(env.GH_TOKEN, 'github_audit_token_missing')
  const base = 'https://api.github.com/repos/pipekoder/curio'
  const policy = await get(`${base}/environments/${TARGET.environment}`, env.GH_TOKEN)
  const branches = await get(`${base}/environments/${TARGET.environment}/deployment-branch-policies`, env.GH_TOKEN)
  const main = await get(`${base}/git/ref/heads/main`, env.GH_TOKEN)
  check(main.object?.sha === env.REVIEWED_SHA, 'main_changed_since_dispatch')
  const approvals = approved ? await get(`${base}/actions/runs/${env.GITHUB_RUN_ID}/approvals`, env.GH_TOKEN) : undefined
  environmentGuard(policy, branches, approvals, env.GITHUB_ACTOR_ID)
}
function childEnv(env, privateDir) {
  const allowed = ['PATH','HOME','TMPDIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']
  return { ...Object.fromEntries(allowed.filter(k => env[k]).map(k => [k, env[k]])), CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID, CI: 'true', WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: privateDir, WRANGLER_LOG_PATH: join(privateDir, 'wrangler.log') }
}
async function wrangler(args, env) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], { cwd: env.XDG_CONFIG_HOME, env, stdio: ['ignore','pipe','pipe'] })
    let size = 0; const output = []; const timeout = setTimeout(() => child.kill('SIGTERM'), 240000)
    child.stdout.on('data', d => { size += d.length; if (size > 4 * 1024 * 1024) child.kill('SIGTERM'); else output.push(d) })
    child.stderr.on('data', () => {}) // Suppressed: Wrangler may print recovery data or signed export URLs.
    child.on('error', () => { clearTimeout(timeout); reject(new Error('wrangler_failed')) })
    child.on('close', code => { clearTimeout(timeout); code === 0 && size <= 4 * 1024 * 1024 ? accept(Buffer.concat(output).toString()) : reject(new Error('wrangler_failed')) })
  })
}
export async function transferRecovery(bytes, urls, send = fetch) {
  try {
    const uploaded = await send(urls[0], { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes, redirect: 'error', signal: AbortSignal.timeout(60000) })
    check(uploaded.ok, 'backup_upload_failed'); await uploaded.body?.cancel()
    const downloaded = await send(urls[1], { redirect: 'error', signal: AbortSignal.timeout(60000) })
    check(downloaded.ok && digest(await boundedBody(downloaded, 96 * 1024 * 1024)) === digest(bytes), 'backup_readback_failed')
  } catch { throw new Error('backup_persistence_failed') }
}
export async function migrate(env, dependencies = {}) {
  const deps = { api, wrangler, transferRecovery, auditApproval, ...dependencies }
  check(env.RUNNER_TEMP && !resolve(env.RUNNER_TEMP).startsWith(`${process.cwd()}/`) && resolve(env.RUNNER_TEMP) !== process.cwd(), 'private_temp_required')
  const evidence = { format: 1, commit: /^[a-f0-9]{40}$/.test(env.REVIEWED_SHA ?? '') ? env.REVIEWED_SHA : null, migrationSha256: TARGET.hash, accountVerified: false, targetVerified: false, operatorDisabled: false, readOnlyPreflightPassed: false, privateBackupVerified: false, migrationAttempted: false, migrationApplied: false, schemaVerified: false, outcome: 'blocked' }
  const evidenceDir = join(env.RUNNER_TEMP, 'curio-d1-evidence')
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 })
  const privateDir = await mkdtemp(join(env.RUNNER_TEMP, 'curio-d1-private-'))
  try {
    await deps.auditApproval(env, true)
    check(env.CLOUDFLARE_API_TOKEN && env.D1_EXPECTED_ACCOUNT_NAME, 'cloudflare_setup_missing')
    const urls = backupUrls(env)
    // Validate the recipient and pin before export, not after touching recovery data.
    encryptRecovery({ probe: true }, env.D1_BACKUP_PUBLIC_KEY, env.D1_BACKUP_KEY_SHA256)
    const source = await readFile('migrations/0001_catalog.sql')
    check((await lstat('migrations/0001_catalog.sql')).isFile(), 'migration_must_be_regular_file')
    configGuard(JSON.parse(await readFile('wrangler.jsonc', 'utf8')), source, await readdir('migrations'))
    const accountId = env.CLOUDFLARE_ACCOUNT_ID
    check(/^[a-f0-9]{32}$/.test(accountId ?? ''), 'account_setup_invalid')
    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`
    const cf = async (path, options) => {
      const response = await deps.api(`${base}${path}`, env.CLOUDFLARE_API_TOKEN, options)
      check(response.success === true, 'cloudflare_request_failed'); return response.result
    }
    const query = async sql => {
      const result = await cf(`/d1/database/${TARGET.id}/query`, { method: 'POST', body: JSON.stringify({ sql }) })
      check(result.length === 1 && result[0].success === true && Array.isArray(result[0].results), 'd1_query_failed'); return result[0].results
    }
    identityGuard(await cf(''), await cf(`/d1/database/${TARGET.id}`), accountId, env.D1_EXPECTED_ACCOUNT_NAME)
    evidence.accountVerified = true; evidence.targetVerified = true
    const operatorCheck = async () => {
      const deployment = await cf('/workers/scripts/curio/deployments')
      const active = deployment.deployments?.[0]?.versions
      check(active?.length > 0, 'production_deployment_missing')
      for (const v of active) if (v.percentage > 0) workerGuard(await cf(`/workers/scripts/curio/versions/${v.version_id}`))
      check(active.some(v => v.percentage > 0), 'production_deployment_missing')
    }
    await operatorCheck(); evidence.operatorDisabled = true
    const inspect = async () => {
      const schema = await query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name;')
      const history = schema.some(o => o.type === 'table' && o.name === 'd1_migrations') ? await query('SELECT name FROM d1_migrations ORDER BY id;') : []
      preflightGuard(schema, history)
    }
    await inspect(); evidence.readOnlyPreflightPassed = true
    const migrationDir = join(privateDir, 'migrations'); await mkdir(migrationDir, { mode: 0o700 })
    await writeFile(join(migrationDir, TARGET.migration), source, { mode: 0o600 })
    const config = join(privateDir, 'wrangler.json')
    await writeFile(config, JSON.stringify({ name: 'curio-catalog-migration-only', account_id: accountId, d1_databases: [{ binding: TARGET.binding, database_name: TARGET.name, database_id: TARGET.id, migrations_dir: migrationDir }] }), { mode: 0o600 })
    const args = ['--config', config], safeEnv = childEnv(env, privateDir), exportPath = join(privateDir, 'before.sql')
    const recovery = JSON.parse(await deps.wrangler(['d1','time-travel','info',TARGET.name,'--json',...args], safeEnv))
    check(typeof recovery.bookmark === 'string' && recovery.bookmark.length > 0 && recovery.bookmark.length <= 512, 'recovery_bookmark_missing')
    await deps.wrangler(['d1','export',TARGET.name,'--remote','--output',exportPath,...args], safeEnv)
    const stat = await lstat(exportPath); check(stat.isFile() && stat.size > 0 && stat.size <= 64 * 1024 * 1024, 'backup_export_invalid')
    const sql = await readFile(exportPath, 'utf8')
    const encrypted = encryptRecovery({ sql, recovery, accountId, databaseId: TARGET.id, commit: env.REVIEWED_SHA, createdAt: new Date().toISOString() }, env.D1_BACKUP_PUBLIC_KEY, env.D1_BACKUP_KEY_SHA256)
    await deps.transferRecovery(encrypted, urls); evidence.privateBackupVerified = true
    // Recheck approval, live operator flag and empty schema after backup, before the only write.
    await deps.auditApproval(env, true); await operatorCheck(); await inspect()
    check(digest(await readFile(join(migrationDir, TARGET.migration))) === TARGET.hash, 'staged_migration_changed')
    evidence.migrationAttempted = true
    await deps.wrangler(['d1','migrations','apply',TARGET.name,'--remote',...args], safeEnv)
    evidence.migrationApplied = true
    const schema = await query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name;')
    const history = await query('SELECT name FROM d1_migrations ORDER BY id;')
    verificationGuard(schema, history, await query('PRAGMA foreign_key_check;'), await query('PRAGMA integrity_check;'))
    await operatorCheck(); evidence.schemaVerified = true; evidence.outcome = 'verified'
    evidence.tablesVerified = tables.length; evidence.indexesVerified = Object.keys(indexes).length; evidence.auditTriggerVerified = true
  } finally {
    if (evidence.migrationAttempted && !evidence.schemaVerified) evidence.outcome = 'needs-inspection'
    await writeFile(join(evidenceDir, 'verification.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 })
    await rm(privateDir, { recursive: true, force: true })
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077)
  try {
    if (process.argv[2] === 'gate') await auditApproval(process.env, false)
    else if (process.argv[2] === 'migrate') await migrate(process.env)
    else throw new Error('unknown_mode')
    console.log('D1 workflow checks completed. See sanitized verification evidence.')
  } catch { console.error('D1 workflow stopped. No automatic retry or rollback. Inspect sanitized evidence and follow the recovery runbook.'); process.exitCode = 1 }
}
