import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { appendFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { gzipSync } from 'node:zlib'

const target = { name: 'curio-catalog', id: 'b39c4f63-74ee-47f6-bb1d-7388ecc88bc7' }
const migrations = ['0001_catalog.sql', '0002_asset_intelligence.sql', '0003_discovery_content.sql', '0004_media_studio.sql']
const existingTables = [
  'brand_sources', 'catalog_assets', 'asset_versions', 'asset_discoveries', 'asset_permissions',
  'permission_history', 'asset_intelligence', 'editorial_facts', 'object_regions', 'catalog_imports',
  'source_observations', 'discovered_images', 'publisher_metadata', 'asset_access_checks',
  'source_identity_reviews', 'reader_asset_reviews', 'asset_analysis_jobs',
]
const addedTables = [
  'discovery_runs', 'content_nodes', 'content_versions', 'content_sightings', 'content_edges',
  'content_reviews', 'content_catalog_links', 'catalog_publications', 'media_import_batches',
  'media_brands', 'media_products', 'media_campaigns', 'media_objects', 'media_product_images',
  'media_brand_images', 'media_campaign_images',
]

function check(value, message) {
  if (!value) throw new Error(message)
}

function wrangler(args, capture = true) {
  return new Promise((resolvePromise, reject) => {
    const childEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
    delete childEnv.CONTENT_STUDIO_OPERATOR_TOKEN
    const child = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], {
      env: childEnv,
      stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    })
    const output = []
    child.stdout?.on('data', chunk => output.push(chunk))
    child.on('error', reject)
    child.on('close', code => {
      const stdout = Buffer.concat(output).toString()
      if (code === 0) return resolvePromise(stdout)
      // Wrangler sometimes writes API/permission failures to stdout even in --json mode.
      // Do not expose raw provider output: it may contain credentials, URLs or data rows.
      const patterns = [
        [/authentication|not authenticated|invalid api token|token.*invalid|unauthorized|error 10000/i, 'Cloudflare authentication failed; check API token validity and account scope.'],
        [/permission|forbidden|not authorized|access denied|error 10001/i, 'Cloudflare denied permission; check D1/Workers token permissions and account scope.'],
        [/database.*not found|could not find.*database|no database/i, 'Target D1 database was not found or is inaccessible.'],
        [/unknown (argument|option|command)|unexpected argument/i, 'Wrangler CLI command or option is not supported.'],
        [/network|fetch failed|timed out|connection refused/i, 'Network request to Cloudflare failed.'],
      ]
      const category = patterns.find(([pattern]) => pattern.test(stdout))?.[1] ?? 'See the failing Wrangler command and check account access, CLI compatibility and D1 state.'
      const operation = args.slice(0, 3).filter(v => !v.startsWith('-')).join(' ')
      reject(new Error(`Wrangler operation failed: ${operation} (exit ${code ?? 'unknown'}). ${category}`))
    })
  })
}

function rows(json) {
  const result = JSON.parse(json)
  check(Array.isArray(result) && result.every(item => item.success), 'Unexpected D1 response')
  return result.flatMap(item => item.results ?? [])
}

async function query(sql) {
  return rows(await wrangler(['d1', 'execute', target.name, '--remote', '--config', 'wrangler.jsonc', '--command', sql, '--json']))
}

async function history() {
  return (await query('SELECT name FROM d1_migrations ORDER BY id;')).map(row => row.name)
}

async function counts(names) {
  const sql = names.map((name, index) => `${index ? 'UNION ALL ' : ''}SELECT '${name}' AS name, COUNT(*) AS count FROM ${name}`).join(' ')
  return Object.fromEntries((await query(sql)).map(row => [row.name, Number(row.count)]))
}

async function createRecoveryBundle() {
  const secret = process.env.CONTENT_STUDIO_OPERATOR_TOKEN ?? ''
  check(secret.length >= 32, 'CONTENT_STUDIO_OPERATOR_TOKEN must be at least 32 characters')
  const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'curio-d1-backup-'))
  const exportPath = join(directory, 'curio-catalog.sql')
  try {
    const bookmarkResponse = JSON.parse(await wrangler(['d1', 'time-travel', 'info', target.name, '--config', 'wrangler.jsonc', '--json']))
    check(typeof bookmarkResponse.bookmark === 'string' && bookmarkResponse.bookmark.length > 0, 'D1 recovery bookmark was not returned')
    await wrangler(['d1', 'export', target.name, '--remote', '--config', 'wrangler.jsonc', '--output', exportPath], false)
    const exportInfo = await stat(exportPath)
    check(exportInfo.size > 0 && exportInfo.size <= 512 * 1024 * 1024, 'D1 export is empty or exceeds the protected workflow limit')

    const payload = gzipSync(Buffer.from(JSON.stringify({
      format: 'curio-d1-recovery-v1',
      database: target.name,
      databaseId: target.id,
      commit: process.env.GITHUB_SHA,
      createdAt: new Date().toISOString(),
      bookmark: bookmarkResponse.bookmark,
      sql: await readFile(exportPath, 'utf8'),
    })))
    const salt = randomBytes(16)
    const iv = randomBytes(12)
    const key = scryptSync(secret, salt, 32)
    try {
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
      await writeFile(join(process.env.RUNNER_TEMP, 'curio-d1-recovery.enc'), JSON.stringify({
        format: 'curio-d1-recovery-v1',
        kdf: 'scrypt',
        cipher: 'aes-256-gcm',
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      }), { mode: 0o600 })
    } finally {
      key.fill(0)
      payload.fill(0)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function main() {
  check(process.env.GITHUB_REPOSITORY === 'pipekoder/curio', 'Unexpected repository')
  check(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Manual dispatch required')
  check(process.env.GITHUB_REF === 'refs/heads/main', 'Run this workflow from main')
  check(process.env.REVIEWED_SHA === process.env.GITHUB_SHA, 'Reviewed SHA does not match the checked-out commit')
  check(process.env.RELEASE_CONFIRMATION === 'MIGRATE AND DEPLOY CURIO MEDIA', 'Confirmation text does not match')
  check((process.env.CLOUDFLARE_API_TOKEN ?? '').length > 0, 'CLOUDFLARE_API_TOKEN is missing')
  check(/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID ?? ''), 'CLOUDFLARE_ACCOUNT_ID is invalid')
  check((process.env.CONTENT_STUDIO_OPERATOR_TOKEN ?? '').length >= 32, 'CONTENT_STUDIO_OPERATOR_TOKEN must be at least 32 characters')
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'))
  const binding = config.d1_databases?.find(item => item.binding === 'CATALOG_DB')
  check(config.name === 'curio', 'Unexpected Worker name')
  check(binding?.database_name === target.name && binding.database_id === target.id, 'Unexpected D1 target')
  check(config.r2_buckets?.some(item => item.binding === 'MEDIA_BUCKET' && item.bucket_name === 'curio-media'), 'Expected R2 binding is missing')
  check(config.vars?.PUBLIC_APP_ORIGIN === 'https://curio.shuang-han807.workers.dev', 'Unexpected public origin')
  check(config.vars?.MAGAZINE_AI_ENABLED === 'false', 'Magazine AI must remain disabled')
  check(config.vars?.ASSET_AI_ENABLED === 'false', 'Asset AI must remain disabled')
  check(config.vars?.SAM_DECODER_ENABLED === 'false', 'SAM must remain disabled')

  const info = JSON.parse(await wrangler(['d1', 'info', target.name, '--config', 'wrangler.jsonc', '--json']))
  const identity = JSON.stringify(info)
  check(identity.includes(target.name) && identity.includes(target.id), 'Cloudflare returned a different D1 database')

  const before = await history()
  check(before.length >= 2 && before.length <= 4, `Unexpected migration history: ${before.join(', ')}`)
  check(before.every((name, index) => name === migrations[index]), `Migration history is not the expected prefix: ${before.join(', ')}`)
  const beforeCounts = await counts(existingTables)
  const pending = migrations.slice(before.length)

  console.log(`Applied before run: ${before.join(', ')}`)
  console.log(`Pending in order: ${pending.length ? pending.join(', ') : 'none'}`)
  await createRecoveryBundle()
  check(JSON.stringify(await history()) === JSON.stringify(before), 'Migration history changed while the backup was created')
  if (pending.length) {
    await wrangler(['d1', 'migrations', 'apply', target.name, '--remote', '--config', 'wrangler.jsonc'], false)
  }

  const after = await history()
  check(JSON.stringify(after) === JSON.stringify(migrations), `Final migration history is unexpected: ${after.join(', ')}`)
  check(JSON.stringify(await counts(existingTables)) === JSON.stringify(beforeCounts), 'Existing table row counts changed')
  const schema = await query("SELECT type, name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;")
  const names = new Set(schema.map(row => row.name))
  for (const table of addedTables) check(names.has(table), `Expected table is missing: ${table}`)
  check((await query('PRAGMA foreign_key_check;')).length === 0, 'Foreign-key validation failed')
  const integrity = await query('PRAGMA quick_check;')
  check(integrity.length === 1 && Object.values(integrity[0])[0] === 'ok', 'D1 integrity check failed')

  await appendFile(process.env.GITHUB_STEP_SUMMARY, [
    '## Production D1 migration', '',
    `- Database: \`${target.name}\` (\`${target.id}\`)`,
    `- Applied before run: ${before.map(name => `\`${name}\``).join(', ')}`,
    `- Applied by this run: ${pending.length ? pending.map(name => `\`${name}\``).join(', ') : 'none'}`,
    `- Final history: ${after.map(name => `\`${name}\``).join(', ')}`,
    '- Pre-migration SQL export and Time Travel bookmark: encrypted recovery artifact created',
    '- Existing table row counts: preserved',
    '- Foreign keys: valid',
    '- Integrity: ok', '',
  ].join('\n'))
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
