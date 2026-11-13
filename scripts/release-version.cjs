const fs=require('node:fs');
const path=require('node:path');

function parse(version){
  if(typeof version!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))throw Error('Expected a release version such as 1.4.0.');
  const values=version.split('.').map(Number);
  if(!values.every(Number.isSafeInteger))throw Error('Version number is too large.');
  return values;
}
function validateVersion(version){
  const [,minor,patch]=parse(version);
  if(minor>9||patch>9)throw Error('Minor and patch must be 0–9. Use prepare:release to roll over at 10.');
  return version;
}
function nextVersion(version){
  let [major,minor,patch]=parse(version);
  if(minor>9)throw Error('Minor must be 0–9.');
  // Migrate legacy versions such as 1.3.15 into the next series once.
  if(patch>=9){patch=0;minor++;}else patch++;
  if(minor===10){minor=0;major++;}
  return validateVersion(`${major}.${minor}.${patch}`);
}
function checkRelease(root,tag){
  const version=validateVersion(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const footer=html.match(/<span class="app-version">([^<]+)<\/span>/)?.[1];
  if(footer!==version)throw Error(`Footer version ${footer} does not match ${version}.`);
  if(tag&&tag!==`v${version}`)throw Error(`Release tag ${tag} does not match v${version}.`);
  return version;
}
if(require.main===module){
  const root=path.resolve(__dirname,'..');
  try{
    const args=process.argv.slice(2);
    if(args.includes('--check')){
      const tag=process.env.GITHUB_REF_TYPE==='tag'?process.env.GITHUB_REF_NAME:undefined;
      console.log(`Release version checked: ${checkRelease(root,tag)}`);
    }else{
      if(args.some(arg=>arg!=='--dry-run'))throw Error('Use no arguments, --dry-run, or --check.');
      const packagePath=path.join(root,'package.json'),htmlPath=path.join(root,'index.html');
      const source=fs.readFileSync(packagePath,'utf8'),html=fs.readFileSync(htmlPath,'utf8');
      const current=JSON.parse(source).version,next=nextVersion(current);
      if(!/<span class="app-version">[^<]+<\/span>/.test(html))throw Error('App version footer was not found.');
      if(!args.includes('--dry-run')){
        fs.writeFileSync(packagePath,source.replace(/("version"\s*:\s*")[^"]+("\s*,)/,`$1${next}$2`));
        fs.writeFileSync(htmlPath,html.replace(/(<span class="app-version">)[^<]+(<\/span>)/,`$1${next}$2`));
      }
      console.log(`${current} → ${next}${args.includes('--dry-run')?' (preview)':''}`);
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={nextVersion,validateVersion,checkRelease};
