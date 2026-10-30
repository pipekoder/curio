import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

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
    const child = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], {
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    })
    const output = []
    child.stdout?.on('data', chunk => output.push(chunk))
    child.on('error', reject)
    child.on('close', code => code === 0
      ? resolvePromise(Buffer.concat(output).toString())
      : reject(new Error(`Wrangler exited with code ${code}`)))
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

async function main() {
  check(process.env.GITHUB_REPOSITORY === 'pipekoder/curio', 'Unexpected repository')
  check(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Manual dispatch required')
  check(process.env.GITHUB_REF === 'refs/heads/main', 'Run this workflow from main')
  check(process.env.REVIEWED_SHA === process.env.GITHUB_SHA, 'Reviewed SHA does not match the checked-out commit')
  check(process.env.RELEASE_CONFIRMATION === 'MIGRATE AND DEPLOY CURIO MEDIA', 'Confirmation text does not match')
  check((process.env.CLOUDFLARE_API_TOKEN ?? '').length > 0, 'CLOUDFLARE_API_TOKEN is missing')
  check(/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID ?? ''), 'CLOUDFLARE_ACCOUNT_ID is invalid')
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
    '- Existing table row counts: preserved',
    '- Foreign keys: valid',
    '- Integrity: ok', '',
  ].join('\n'))
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
