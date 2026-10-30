import { createDecipheriv, scryptSync } from 'node:crypto'
import { constants } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Usage: CONTENT_STUDIO_OPERATOR_TOKEN=... node scripts/decrypt-d1-recovery.mjs <recovery.enc> <recovery.json>')
  process.exit(1)
}
const secret = process.env.CONTENT_STUDIO_OPERATOR_TOKEN ?? ''
if (secret.length < 32) throw new Error('CONTENT_STUDIO_OPERATOR_TOKEN must be at least 32 characters')

const bundle = JSON.parse(await readFile(input, 'utf8'))
if (bundle.format !== 'curio-d1-recovery-v1' || bundle.kdf !== 'scrypt' || bundle.cipher !== 'aes-256-gcm') {
  throw new Error('Unsupported recovery bundle')
}
const key = scryptSync(secret, Buffer.from(bundle.salt, 'base64'), 32)
try {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(bundle.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(bundle.tag, 'base64'))
  const plaintext = gunzipSync(Buffer.concat([
    decipher.update(Buffer.from(bundle.ciphertext, 'base64')),
    decipher.final(),
  ]))
  await writeFile(output, plaintext, { mode: 0o600, flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY })
} finally {
  key.fill(0)
}
