import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'
import { parseDocument } from 'yaml'
import { TARGET, digest, dispatchGuard, environmentGuard, configGuard, identityGuard, workerGuard, preflightGuard, verificationGuard, backupUrls, encryptRecovery } from '../scripts/d1-migration/guards.mjs'
import { migrate, auditApproval, transferRecovery } from '../scripts/d1-migration/run.mjs'

// Pure fixtures + local SQLite only. A real request would fail this suite.
globalThis.fetch = async () => { throw new Error('No network permitted by migration tests') }
const keys = generateKeyPairSync('rsa', { modulusLength: 3072 })
const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' })
const fingerprint = digest(keys.publicKey.export({ type: 'spki', format: 'der' }))
const sha = 'a'.repeat(40), account = 'b'.repeat(32)
const env = { GITHUB_REPOSITORY: 'pipekoder/curio', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1', REVIEWED_SHA: sha, GITHUB_SHA: sha, GITHUB_RUN_ID: '123', GITHUB_ACTOR_ID: '1', MIGRATION_CONFIRMATION: 'MIGRATE curio-catalog 0001', GH_TOKEN: 'FAKE_GITHUB_SECRET', CLOUDFLARE_API_TOKEN: 'FAKE_CLOUDFLARE_SECRET', CLOUDFLARE_ACCOUNT_ID: account, D1_EXPECTED_ACCOUNT_NAME: 'Fixture account', D1_BACKUP_HOST: 'private-backup.example.com', D1_BACKUP_PRIVATE_CONFIRMED: 'true', D1_BACKUP_UPLOAD_URL: 'https://private-backup.example.com/unique.enc?write=SENSITIVE', D1_BACKUP_DOWNLOAD_URL: 'https://private-backup.example.com/unique.enc?read=SENSITIVE', D1_BACKUP_PUBLIC_KEY: publicPem, D1_BACKUP_KEY_SHA256: fingerprint }
const policy = { id: 7, protection_rules: [{ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User', reviewer: { id: 2 } }] }], deployment_branch_policy: { custom_branch_policies: true } }
const branches = { branch_policies: [{ name: 'main', type: 'branch' }] }
const approvals = [{ state: 'approved', user: { id: 2 }, environments: [{ id: 7 }] }]
const worker = { resources: { bindings: [{ name: 'CATALOG_OPERATOR_ENABLED', type: 'plain_text', text: 'false' }, { name: TARGET.binding, type: 'd1', id: TARGET.id }] } }
const migration = await readFile('migrations/0001_catalog.sql')
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'))

for (const override of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/evil' }, { GITHUB_REPOSITORY: 'other/curio' }, { GITHUB_RUN_ATTEMPT: '2' }, { REVIEWED_SHA: 'c'.repeat(40) }, { MIGRATION_CONFIRMATION: 'yes' }, { RUNNER_DEBUG: '1' }]) test(`dispatch fails closed: ${Object.keys(override)[0]}`, () => assert.throws(() => dispatchGuard({ ...env, ...override })))
test('only a protected main environment and a real independent approval pass', () => {
  environmentGuard(policy, branches, approvals, '1')
  for (const p of [{ ...policy, protection_rules: [] }, { ...policy, protection_rules: [{ ...policy.protection_rules[0], prevent_self_review: false }] }]) assert.throws(() => environmentGuard(p, branches, approvals, '1'))
  for (const review of [[], [{ ...approvals[0], state: 'rejected' }], [{ ...approvals[0], user: { id: 1 } }], [{ ...approvals[0], user: { id: 99 } }], [{ ...approvals[0], environments: [{ id: 99 }] }]]) assert.throws(() => environmentGuard(policy, branches, review, '1'))
  assert.throws(() => environmentGuard(policy, { branch_policies: [{ name: '*', type: 'branch' }] }, approvals, '1'))
})
test('approval audit uses read-only GitHub routes and binds main SHA', async () => {
  const calls = []
  await auditApproval(env, true, async url => { calls.push(url); if (url.endsWith('/approvals')) return approvals; if (url.endsWith('/deployment-branch-policies')) return branches; if (url.endsWith('/main')) return { object: { sha } }; return policy })
  assert.equal(calls.length, 4)
  await assert.rejects(auditApproval(env, true, async url => url.endsWith('/main') ? { object: { sha: 'wrong' } } : url.endsWith('/deployment-branch-policies') ? branches : policy), /main_changed/)
})
test('account, database, configured binding, exact SQL and only one migration are pinned', () => {
  configGuard(config, migration, [TARGET.migration])
  assert.throws(() => configGuard(config, Buffer.from('modified SQL'), [TARGET.migration]))
  assert.throws(() => configGuard(config, migration, [TARGET.migration, '0002.sql']))
  assert.throws(() => configGuard({ ...config, vars: { ...config.vars, CATALOG_OPERATOR_ENABLED: 'true' } }, migration, [TARGET.migration]))
  const a = { id: account, name: env.D1_EXPECTED_ACCOUNT_NAME }, d = { uuid: TARGET.id, name: TARGET.name, version: 'production' }
  identityGuard(a, d, account, env.D1_EXPECTED_ACCOUNT_NAME)
  assert.throws(() => identityGuard(a, { ...d, uuid: 'wrong' }, account, env.D1_EXPECTED_ACCOUNT_NAME))
  assert.throws(() => identityGuard({ ...a, id: 'wrong' }, d, account, env.D1_EXPECTED_ACCOUNT_NAME))
  workerGuard(worker)
  assert.throws(() => workerGuard({ resources: { bindings: [{ name: 'CATALOG_OPERATOR_ENABLED', type: 'plain_text', text: 'true' }] } }))
})
test('preflight permits only internal KV and empty optional history, never creates tables', () => {
  preflightGuard([{ type: 'table', name: '_cf_KV' }], [])
  preflightGuard([{ type: 'table', name: 'd1_migrations' }, { type: 'index', name: 'sqlite_autoindex_d1_migrations_1' }], [])
  assert.throws(() => preflightGuard([{ type: 'table', name: 'brand_sources' }], []))
  assert.throws(() => preflightGuard([{ type: 'table', name: 'unknown' }], []))
  assert.throws(() => preflightGuard([], [{ name: TARGET.migration }]))
})
test('backup URLs require owner-confirmed private storage and exact HTTPS host', () => {
  assert.equal(backupUrls(env).length, 2)
  for (const change of [{ D1_BACKUP_PRIVATE_CONFIRMED: 'false' }, { D1_BACKUP_UPLOAD_URL: 'http://private-backup.example.com/x' }, { D1_BACKUP_DOWNLOAD_URL: 'https://elsewhere.example.com/x' }, { D1_BACKUP_UPLOAD_URL: 'https://user:password@private-backup.example.com/x' }]) assert.throws(() => backupUrls({ ...env, ...change }))
})
function decrypt(bytes) {
  const e = JSON.parse(bytes)
  const key = privateDecrypt({ key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(e.wrappedKey, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64')); decipher.setAAD(Buffer.from(e.format)); decipher.setAuthTag(Buffer.from(e.tag, 'base64'))
  return JSON.parse(gunzipSync(Buffer.concat([decipher.update(Buffer.from(e.ciphertext, 'base64')), decipher.final()])))
}
test('backup roundtrip is authenticated, fingerprint pinned and contains no plaintext', () => {
  const value = { sql: 'SECRET-EXPORT', recovery: { bookmark: 'SENSITIVE-BOOKMARK' } }, bytes = encryptRecovery(value, publicPem, fingerprint)
  assert.deepEqual(decrypt(bytes), value)
  assert.equal(bytes.toString().includes('SECRET-EXPORT'), false)
  assert.equal(bytes.toString().includes('SENSITIVE-BOOKMARK'), false)
  assert.throws(() => encryptRecovery(value, publicPem, '0'.repeat(64)))
  const envelope = JSON.parse(bytes); envelope.tag = Buffer.alloc(16).toString('base64')
  assert.throws(() => decrypt(Buffer.from(JSON.stringify(envelope))))
})
test('offline recovery helper decrypts a fixture privately and refuses overwrites', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'curio-offline-fixture-'))
  try {
    const value = { sql: 'PRIVATE-FIXTURE', recovery: { bookmark: 'FIXTURE-BOOKMARK' } }
    await writeFile(join(temp, 'bundle.enc'), encryptRecovery(value, publicPem, fingerprint), { mode: 0o600 })
    await writeFile(join(temp, 'key.pem'), keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
    const args = ['scripts/d1-migration/decrypt.mjs', join(temp, 'bundle.enc'), join(temp, 'key.pem'), join(temp, 'recovery.json')]
    assert.equal(spawnSync(process.execPath, args).status, 0)
    assert.deepEqual(JSON.parse(await readFile(join(temp, 'recovery.json'), 'utf8')), value)
    assert.notEqual(spawnSync(process.execPath, args).status, 0)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
test('private backup requires successful upload and byte-identical readback; no redirects', async () => {
  const bytes = Buffer.from('encrypted fixture')
  for (const failure of ['upload','readback','redirect']) {
    let calls = 0
    await assert.rejects(transferRecovery(bytes, backupUrls(env), async (url, options) => {
      calls++; assert.equal(options.redirect, 'error'); assert.equal(options.headers?.Authorization, undefined)
      if (failure === 'upload') return new Response('', { status: 403 })
      if (failure === 'redirect') return new Response('', { status: 302 })
      return new Response(calls === 1 ? '' : 'wrong bytes')
    }), /backup_persistence_failed/)
  }
  let calls = 0
  await transferRecovery(bytes, backupUrls(env), async () => new Response(++calls === 1 ? '' : bytes))
  assert.equal(calls, 2)
})
async function exercise(options = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'curio-migration-test-')), db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _cf_KV(key TEXT,value BLOB);')
  if (options.unexpectedTable) db.exec('CREATE TABLE surprise(x TEXT);')
  const commands = []; let backedUp = false, backupPayload, apiCount = 0
  const deps = {
    auditApproval: async () => { if (options.noApproval) throw new Error('approval') },
    api: async (url, token, request) => {
      apiCount++; assert.equal(token, env.CLOUDFLARE_API_TOKEN)
      let result
      if (url.endsWith(`/accounts/${account}`)) result = { id: options.wrongAccount ? 'wrong' : account, name: env.D1_EXPECTED_ACCOUNT_NAME }
      else if (url.endsWith(`/database/${TARGET.id}`)) result = { uuid: TARGET.id, name: TARGET.name, version: 'production' }
      else if (url.endsWith('/deployments')) result = { deployments: [{ versions: [{ version_id: 'fixture-version', percentage: 100 }] }] }
      else if (url.endsWith('/versions/fixture-version')) result = options.enabledOperator ? {} : worker
      else if (url.endsWith('/query')) {
        const { sql } = JSON.parse(request.body)
        assert.match(sql, /^(SELECT|PRAGMA (foreign_key_check|integrity_check))/)
        result = [{ success: true, results: db.prepare(sql).all() }]
      } else throw new Error('Unexpected API route')
      return { success: true, result }
    },
    wrangler: async (args, childEnv) => {
      assert.equal(childEnv.D1_BACKUP_UPLOAD_URL, undefined)
      assert.equal(childEnv.GH_TOKEN, undefined)
      assert.equal(childEnv.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_API_TOKEN)
      const isolatedConfig = JSON.parse(await readFile(args[args.indexOf('--config') + 1], 'utf8'))
      assert.equal(isolatedConfig.account_id, account)
      assert.equal(isolatedConfig.d1_databases[0].database_id, TARGET.id)
      assert.deepEqual(await readdir(isolatedConfig.d1_databases[0].migrations_dir), [TARGET.migration])
      commands.push(args.slice(0, 3).join(' '))
      if (args[1] === 'time-travel') return JSON.stringify({ bookmark: 'SENSITIVE-BOOKMARK' })
      if (args[1] === 'export') { if (options.exportFailure) throw new Error('private error must not leak'); await writeFile(args[args.indexOf('--output') + 1], 'SECRET-EXPORT'); return '' }
      assert.deepEqual(args.slice(0, 3), ['d1','migrations','apply']); assert.equal(backedUp, true)
      if (options.applyFailure) throw new Error('unknown migration state')
      db.exec(migration.toString()); db.exec(`CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO d1_migrations VALUES(1,'0001_catalog.sql');`)
      if (options.verificationFailure) db.exec('DROP TRIGGER permission_audit;')
      return ''
    },
    transferRecovery: async bytes => { if (options.backupFailure) throw new Error('backup not durable'); backupPayload = decrypt(bytes); backedUp = true },
  }
  let failure
  try { await migrate({ ...env, RUNNER_TEMP: temp }, deps) } catch (error) { failure = error }
  const evidence = JSON.parse(await readFile(join(temp, 'curio-d1-evidence/verification.json'), 'utf8'))
  const files = await readdir(temp)
  assert.deepEqual(files, ['curio-d1-evidence'], 'all private runner recovery files removed')
  const raw = JSON.stringify(evidence)
  for (const secret of ['SENSITIVE','SECRET','bookmark','private-backup',env.CLOUDFLARE_API_TOKEN,env.GH_TOKEN]) assert.equal(raw.includes(secret), false)
  db.close(); await rm(temp, { recursive: true, force: true })
  return { commands, failure, evidence, apiCount, backupPayload }
}
test('full mocked orchestration verifies actual local migration and persists backup first', async () => {
  const r = await exercise()
  assert.equal(r.failure, undefined)
  assert.deepEqual(r.commands, ['d1 time-travel info','d1 export curio-catalog','d1 migrations apply'])
  assert.equal(r.evidence.outcome, 'verified'); assert.equal(r.evidence.tablesVerified, 10); assert.equal(r.evidence.indexesVerified, 6)
  assert.equal(r.backupPayload.recovery.bookmark, 'SENSITIVE-BOOKMARK')
})
for (const option of ['noApproval','wrongAccount','enabledOperator','unexpectedTable','exportFailure','backupFailure']) test(`no migration write on ${option}`, async () => {
  const r = await exercise({ [option]: true })
  assert.ok(r.failure); assert.equal(r.commands.includes('d1 migrations apply'), false); assert.equal(r.evidence.migrationAttempted, false)
})
for (const option of ['applyFailure','verificationFailure']) test(`requires inspection without automatic rollback on ${option}`, async () => {
  const r = await exercise({ [option]: true })
  assert.ok(r.failure); assert.equal(r.evidence.privateBackupVerified, true); assert.equal(r.evidence.outcome, 'needs-inspection')
  assert.equal(r.commands.length, 3)
})
test('post-verification rejects incomplete history and integrity results', () => {
  assert.throws(() => verificationGuard([], [], [], [{ integrity_check: 'ok' }]))
})
test('workflow has dispatch only, exact environment, minimal permissions, pins and single safe artifact', async () => {
  const doc = parseDocument(await readFile('.github/workflows/d1-migrate-0001.yml', 'utf8'))
  assert.deepEqual(doc.errors, [])
  const w = doc.toJS(); assert.deepEqual(Object.keys(w.on), ['workflow_dispatch'])
  assert.equal(w.jobs.migrate.environment, TARGET.environment)
  assert.equal(w.jobs.migrate.needs, 'approval-policy'); assert.equal(w.concurrency['cancel-in-progress'], false)
  assert.deepEqual(w.permissions, { contents: 'read' })
  for (const job of Object.values(w.jobs)) {
    assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' })
    for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/)
  }
  const artifacts = w.jobs.migrate.steps.filter(s => s.uses?.startsWith('actions/upload-artifact'))
  assert.equal(artifacts.length, 1); assert.equal(artifacts[0].with.path, '${{ runner.temp }}/curio-d1-evidence/verification.json')
  assert.equal(w.jobs.migrate.steps.find(s => s.run?.startsWith('npm ci')).env, undefined)
})
