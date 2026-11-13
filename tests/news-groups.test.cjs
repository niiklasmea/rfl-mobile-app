const {test}=require('node:test');
const assert=require('node:assert/strict');
const {groupNews}=require('../scripts/group-news.cjs');
const groups=require('../release-groups.json');
const item=(version,day=13)=>({id:'commit-'+version,publishedAt:`2026-11-${day}T16:00:00+01:00`,title:{de:'RFL-APP '+version},body:{de:'Old note'},action:'home',releaseVersion:version});

test('today’s fixes become one 1.4.0 notice while older and future releases remain separate',()=>{
  const releases=['1.4.3','1.4.2','1.4.1','1.4.0','1.3.15'].map(v=>item(v));
  const result=groupNews([item('1.4.4',14),...releases,item('1.3.14',12)],groups);
  assert.deepEqual(result.map(n=>n.title.de),['RFL-APP 1.4.4','RFL-APP 1.4.0','RFL-APP 1.3.14']);
  assert.equal(result[1].publishedAt,releases[0].publishedAt);
  assert.match(result[1].body.de,/Tastatur/);assert.match(result[1].body.de,/Mitteilungen/);
  assert(result.every(n=>!('releaseVersion' in n)));
});

test('regenerating a grouped release keeps its push deduplication identity stable',()=>{
  const first=groupNews([item('1.4.3'),item('1.4.0')],groups);
  const again=groupNews([item('1.4.3'),item('1.4.2'),item('1.4.0')],groups);
  assert.equal(first[0].id,again[0].id);assert.equal(again.length,1);
  assert(first[0].id.length<=100);assert(first[0].body.de.length<=350);
});
