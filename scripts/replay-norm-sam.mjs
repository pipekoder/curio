import {readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {privatePath} from './norm-local-validation.mjs';
export async function replay(args=process.argv.slice(2)){
 process.umask(0o077);
 const option=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
 if(args.some(a=>a!=='--screenshots'&&!/^--(capture|image|out|hints)=/.test(a)))throw Error('Only offline file options are accepted');
 const capture=await privatePath(option('capture')??'/tmp/curio-norm-live-sam-01/sam-segmentation.json');
 const image=await privatePath(option('image')??'/tmp/curio-norm-ai-test.jpg');
 const out=await privatePath(option('out'),true);
 if((await readdir(out)).length)throw Error('A fresh empty private output directory is required');
 if((await lstat(capture)).size>1048576 || (await lstat(image)).size>2000000)throw Error('Private input exceeds bounded size');
 const raw=await readFile(capture),bytes=new Uint8Array(await readFile(image));
 if(raw.length>1048576 || bytes.length>2000000)throw Error('Input changed beyond size limit');
 if(option('hints')&&(await lstat(await privatePath(option('hints')))).size>4096)throw Error('Hint file exceeds bound');
 const hints=option('hints')?JSON.parse(await readFile(await privatePath(option('hints')),'utf8')):{};
 const bundled=await build({entryPoints:['dev/norm-replay.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const moduleFile=join(out,'private-adapter.mjs');await writeFile(moduleFile,bundled.outputFiles[0].contents,{mode:0o600,flag:'wx'});
 const {renderNormInspection}=await import(pathToFileURL(moduleFile).href);
 const result=await renderNormInspection(JSON.parse(raw.toString('utf8')),hints,bytes);
 await writeFile(join(out,'inspection.html'),result.html,{mode:0o600,flag:'wx'});
 await writeFile(join(out,'source-capture.json'),raw,{mode:0o600,flag:'wx'});
 await writeFile(join(out,'grouping-report.json'),JSON.stringify({...result.report,captureSha256:createHash('sha256').update(raw).digest('hex')},null,2),{mode:0o600,flag:'wx'});
 if(args.includes('--screenshots')){
  const {chromium}=await import('@playwright/test');
  const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try{for(const [name,width] of [['desktop',1440],['mobile',390]]){
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
   const page=await context.newPage();await page.route('https://**/*',route=>route.abort());await page.route('http://**/*',route=>route.abort());
   await page.setContent(result.html);await page.locator('img').evaluate(img=>img.decode());await page.locator('#raw').check();
   await page.screenshot({path:join(out,`inspection-${name}.png`),fullPage:true});await context.close();
  }}finally{await browser.close()}
 }
 return {replayed:true,regions:result.report.rawCount,objects:result.report.objectCount,armchairSeparate:result.report.armchairSeparate,rawBoxesPreserved:true,modelCalls:0,paidCostUsd:0,privateOutput:out};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await replay(),null,2))}catch{console.error('Private SAM replay stopped. Check exact image, successful seven-region capture, fresh owner-only output directory and reviewed hints. No model call or retry.');process.exitCode=1}}
