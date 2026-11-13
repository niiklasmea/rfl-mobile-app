const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {nextVersion,validateVersion,checkRelease}=require('../scripts/release-version.cjs');

test('release numbers roll over before any minor or patch component reaches ten',()=>{
  assert.equal(nextVersion('1.4.0'),'1.4.1');
  assert.equal(nextVersion('1.4.8'),'1.4.9');
  assert.equal(nextVersion('1.3.9'),'1.4.0');
  assert.equal(nextVersion('1.4.9'),'1.5.0');
  assert.equal(nextVersion('1.9.9'),'2.0.0');
  assert.equal(nextVersion('9.9.9'),'10.0.0');
});
test('existing legacy patch numbers migrate to the next series without a downgrade',()=>{
  assert.equal(nextVersion('1.3.15'),'1.4.0');
  assert.equal(nextVersion('1.9.15'),'2.0.0');
});
test('invalid or overflowing versions cannot be published',()=>{
  for(const v of ['1.3.10','1.10.0','01.4.0','1.4','-1.4.0','1.4.0-beta'])assert.throws(()=>validateVersion(v));
  assert.equal(validateVersion('1.4.0'),'1.4.0');
});
test('release validation catches a mismatched app footer or Git tag',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rfl-version-'));
  try{
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.4.0'}));
    fs.writeFileSync(path.join(root,'index.html'),'<span class="app-version">1.4.0</span>');
    assert.equal(checkRelease(root,'v1.4.0'),'1.4.0');
    assert.throws(()=>checkRelease(root,'v1.3.15'));
    fs.writeFileSync(path.join(root,'index.html'),'<span class="app-version">1.3.15</span>');
    assert.throws(()=>checkRelease(root,'v1.4.0'));
  }finally{
    for(const file of ['package.json','index.html'])fs.unlinkSync(path.join(root,file));
    fs.rmdirSync(root);
  }
});
