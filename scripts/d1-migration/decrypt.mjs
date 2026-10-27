// OFFLINE recovery helper. Never run in Actions or place the private key in Git.
import { readFile, writeFile } from 'node:fs/promises'
import { createPrivateKey, privateDecrypt, createDecipheriv, constants } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
const [bundle, keyPath, output] = process.argv.slice(2)
if (!bundle || !keyPath || !output) throw new Error('Usage: decrypt.mjs bundle.json.enc offline-private.pem recovery.json')
process.umask(0o077)
const envelope = JSON.parse(await readFile(bundle, 'utf8'))
if (envelope.format !== 'curio-d1-recovery-v1') throw new Error('Unsupported recovery format')
const key = privateDecrypt({ key: createPrivateKey(await readFile(keyPath)), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(envelope.wrappedKey, 'base64'))
try {
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
  cipher.setAAD(Buffer.from(envelope.format)); cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  const plaintext = gunzipSync(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]), { maxOutputLength: 96 * 1024 * 1024 })
  await writeFile(output, plaintext, { mode: 0o600, flag: 'wx' })
} finally { key.fill(0) }
