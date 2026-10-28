import { build } from 'esbuild'
import { spawn } from 'node:child_process'
await build({entryPoints:['discovery/acceptance.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.wrangler/discovery-acceptance.mjs'})
const child=spawn(process.execPath,['.wrangler/discovery-acceptance.mjs'],{stdio:'inherit',env:process.env});child.on('error',()=>{process.exitCode=1});child.on('exit',code=>{process.exitCode=code??1})
