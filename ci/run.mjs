import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {open,seal,safePath} from './crypto.mjs';
const root=process.cwd(),destination=path.join(root,'.private-build'),browser=process.argv.includes('--browser'),stage={value:'decrypt'};let passed=false;
const secret=process.env.MURLINGO_SOURCE_KEY;
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
function command(file,args=[]){const result=spawnSync(process.execPath,[file,...args],{cwd:destination,env:{...process.env,MURLINGO_ROOT:destination},encoding:'utf8',timeout:15*60*1000,maxBuffer:32*1024*1024});fs.mkdirSync(path.join(destination,'reports/private'),{recursive:true});fs.writeFileSync(path.join(destination,'reports/private',stage.value+'.log'),(result.stdout||'')+'\n'+(result.stderr||''));if(result.status!==0||result.error)throw Error('Stage failed');}
function collect(dir,base=dir){const files={};if(!fs.existsSync(dir))return files;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory())Object.assign(files,collect(p,base));else if(entry.isFile())files[path.relative(base,p).split(path.sep).join('/')]=fs.readFileSync(p).toString('base64');}return files;}
try{
 const source=open(JSON.parse(fs.readFileSync(path.join(root,'source.enc.json'),'utf8')),secret);
 if(source.fileEncoding!=='utf8'||!source.files||Object.keys(source.files).length>500)throw Error('Invalid file manifest');
 fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
 for(const [name,content]of Object.entries(source.files)){if(!safePath(name))throw Error('Unsafe source path');const p=path.join(destination,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content,'utf8');}
 stage.value='build';command('scripts/build.mjs');
 stage.value=browser?'browser':'tests';command(browser?'tests/browser.mjs':'scripts/test.mjs');
 if(process.env.MURLINGO_VERIFY_GATE==='1'){stage.value='intentional-gate-test';throw Error('Intentional gate verification');}
 if(!browser){stage.value='artifact';fs.rmSync(path.join(root,'dist'),{recursive:true,force:true});fs.cpSync(path.join(destination,'dist/site'),path.join(root,'dist/site'),{recursive:true});}
 passed=true;console.log(browser?'Browser checks passed.':'Build and all checks passed. Only compiled site is eligible for publication.');
}catch{console.error('Murlingo checks failed at '+stage.value+'. Deployment must remain blocked. Private diagnostics are encrypted.');process.exitCode=1;
}finally{
 const summary={passed,stage:stage.value,browser:browser?process.env.MURLINGO_BROWSER||'chromium':null};
 const file=path.join(destination,'reports/summary.json');if(fs.existsSync(file))summary.tests=JSON.parse(fs.readFileSync(file,'utf8'));
 fs.writeFileSync(path.join(root,'artifacts/check-summary.json'),JSON.stringify(summary,null,2));
 try{fs.writeFileSync(path.join(root,'artifacts/diagnostics.enc.json'),JSON.stringify(seal({files:collect(path.join(destination,'reports'))},secret)));}catch{}
}
