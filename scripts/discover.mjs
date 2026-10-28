import { build } from 'esbuild'
import { spawn } from 'node:child_process'
await build({entryPoints:['discovery/cli.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.wrangler/discovery-cli.mjs'})
const child=spawn(process.execPath,['.wrangler/discovery-cli.mjs',...process.argv.slice(2)],{stdio:'inherit',env:process.env})
child.on('error',()=>{process.exitCode=1});child.on('exit',code=>{process.exitCode=code??1})
