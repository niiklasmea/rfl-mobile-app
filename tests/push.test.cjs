const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture({ios=false,standalone=false,denied=false,granted=false,saveError=false,removeError=false,subscribeFailures=0,hangRpc='',hangSubscribe=false,fastTimeouts=false,wrongScope=false}={}){
  const nodes=new Map();
  function node(id){if(!nodes.has(id))nodes.set(id,{checked:true,disabled:false,hidden:false,textContent:'',events:{},setAttribute(){},addEventListener(name,fn){this.events[name]=fn;},click(){return this.events.click?.();}});return nodes.get(id);}
  let sub=null,saved=null,permissions=0,subscriptions=0,removed=0,resets=0,reloads=0;const calls=[],storage=new Map([['profile','unchanged']]);
  const reg={scope:wrongScope?'https://example.com/another-app/':'https://example.com/',async unregister(){resets++;sub=null;return true;},pushManager:{async getSubscription(){return sub;},async subscribe(){subscriptions++;if(hangSubscribe)return new Promise(()=>{});if(subscribeFailures-->0)throw Object.assign(Error('push service busy'),{name:'AbortError'});sub={endpoint:'https://fcm.googleapis.com/test',toJSON(){return{endpoint:this.endpoint,keys:{auth:'abc',p256dh:'def'}};},async unsubscribe(){removed++;sub=null;return true;}};return sub;}}};
  const Notification={permission:denied?'denied':granted?'granted':'default',async requestPermission(){permissions++;return this.permission=denied?'denied':'granted';}};
  const window={matchMedia:()=>({matches:standalone}),addEventListener(){},setTimeout:fn=>fn(),PushManager:function(){},Notification};
  const navigator={userAgent:ios?'iPhone':'Android',standalone,serviceWorker:{ready:Promise.resolve(reg),async getRegistration(){return reg;},addEventListener(){}}};
  const document={documentElement:{lang:'de'},getElementById:node};
  const context={window,document,navigator,Notification,sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},location:{protocol:'https:',href:'https://example.com/',reload(){reloads++;}},URL,Uint8Array,atob,AbortController,setTimeout:fastTimeouts?(fn,ms)=>setTimeout(fn,ms>=5000?5:ms):setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.join(root,'push.js'),'utf8'),context);
  window.RflPush.init({async rpc(name,args){calls.push({name,args});if(name===hangRpc)return new Promise(()=>{});if(name==='rfl_push_public_key')return{data:'BA',error:null};if(name==='rfl_push_save'){if(saveError)return{error:Error('offline')};saved={news:args.p_news,friends:args.p_friends};}if(name==='rfl_push_remove'){if(removeError)return{error:Error('offline')};saved=null;}return{data:name==='rfl_push_status'?saved:null,error:null};}});
  return{window,node,calls,storage,get counts(){return{permissions,subscriptions,removed,resets,reloads};}};
}
test('push asks permission only after a signed-in person taps Enable',async()=>{
  const f=fixture();assert.equal(f.node('pushToggle').disabled,true);assert.equal(f.counts.permissions,0);
  f.window.RflPush.setAccount({id:'a'});await flush();assert.equal(f.counts.permissions,0);
  await f.node('pushToggle').click();assert.equal(f.counts.permissions,1);assert.equal(f.counts.subscriptions,1);
  assert.equal(f.node('pushOptions').hidden,false);assert(f.calls.some(c=>c.name==='rfl_push_save'));
  await f.window.RflPush.beforeSignOut();assert.equal(f.counts.removed,1);assert(f.calls.some(c=>c.name==='rfl_push_remove'));
});
test('iPhone requires a Home Screen install and never prompts on page load',async()=>{
  const f=fixture({ios:true});f.window.RflPush.setAccount({id:'a'});await flush();
  assert.equal(f.node('pushToggle').disabled,true);assert.match(f.node('pushStatus').textContent,/Home-Bildschirm/);assert.equal(f.counts.permissions,0);
});
test('switching accounts unsubscribes the former account on a shared phone',async()=>{
  const f=fixture();f.window.RflPush.setAccount({id:'a'});await flush();await f.node('pushToggle').click();
  f.window.RflPush.setAccount({id:'b'});await flush();await flush();
  assert.equal(f.counts.removed,1);assert.equal(f.node('pushOptions').hidden,true);assert.equal(f.counts.permissions,1);
});
test('denied permission never creates a subscription',async()=>{
  const f=fixture({denied:true});f.window.RflPush.setAccount({id:'a'});await flush();await f.node('pushToggle').click();
  assert.equal(f.counts.subscriptions,0);assert.equal(f.node('pushOptions').hidden,true);
});
test('server errors do not leave a browser subscribed while reporting disabled',async()=>{
  const f=fixture({saveError:true});f.window.RflPush.setAccount({id:'a'});await flush();await f.node('pushToggle').click();
  assert.equal(f.counts.removed,1);assert.match(f.node('pushStatus').textContent,/RFL-Server/);assert.equal(f.node('pushOptions').hidden,true);
});

test('turning notifications off and on repeatedly reuses the phone connection and removes the server destination while off',async()=>{
  const f=fixture();f.window.RflPush.setAccount({id:'a'});await flush();await f.node('pushToggle').click();
  for(let i=0;i<3;i++){
    await f.node('pushToggle').click();
    assert.equal(f.node('pushOptions').hidden,true);assert.equal(f.node('pushToggle').textContent,'Aktivieren');
    await f.node('openSettings').click();await flush();assert.equal(f.node('pushOptions').hidden,true);
    await f.node('pushToggle').click();assert.equal(f.node('pushOptions').hidden,false);
  }
  assert.equal(f.counts.subscriptions,1);assert.equal(f.counts.permissions,1);assert.equal(f.counts.removed,0);
  assert.equal(f.calls.filter(c=>c.name==='rfl_push_remove').length,3);
  // Account sign-out must still revoke the retained browser subscription.
  await f.node('pushToggle').click();await f.window.RflPush.beforeSignOut();assert.equal(f.counts.removed,1);
});

test('a previously allowed phone recovers when the push service is still processing unsubscription',async()=>{
  const f=fixture({granted:true,subscribeFailures:2});f.window.RflPush.setAccount({id:'a'});await flush();
  await f.node('pushToggle').click();assert.equal(f.counts.subscriptions,3);assert.equal(f.counts.permissions,0);
  assert.equal(f.node('pushOptions').hidden,false);assert.match(f.node('pushStatus').textContent,/Aktiv/);
});

test('an unavailable phone push service leaves Enable usable with a specific recovery message',async()=>{
  const f=fixture({granted:true,subscribeFailures:3});f.window.RflPush.setAccount({id:'a'});await flush();
  await f.node('pushToggle').click();assert.equal(f.node('pushToggle').disabled,false);
  assert.equal(f.node('pushOptions').hidden,true);assert.match(f.node('pushStatus').textContent,/neu einrichten/);
  await f.node('pushToggle').click();assert.equal(f.node('pushOptions').hidden,false);
});

test('a hanging server call visibly starts and eventually releases Enable',async()=>{
  const f=fixture({granted:true,hangRpc:'rfl_push_public_key',fastTimeouts:true});f.window.RflPush.setAccount({id:'a'});await flush();
  const action=f.node('pushToggle').click();await flush();
  assert.equal(f.node('pushToggle').textContent,'Bitte warten …');assert.match(f.node('pushStatus').textContent,/Verbinde/);
  await action;assert.equal(f.node('pushToggle').disabled,false);assert.equal(f.node('pushToggle').textContent,'Aktivieren');
  assert.match(f.node('pushStatus').textContent,/RFL-Server/);assert.equal(f.counts.subscriptions,0);
});

test('an unresponsive phone service offers a scoped repair and preserves profile storage',async()=>{
  const f=fixture({granted:true,hangSubscribe:true,fastTimeouts:true});f.window.RflPush.setAccount({id:'a'});await flush();
  await f.node('pushToggle').click();assert.equal(f.node('pushRepair').hidden,false);
  assert.equal(f.node('pushErrorCode').textContent,'PHONE_TIMEOUTERROR');assert.equal(f.counts.resets,0);
  await f.node('pushRepair').click();assert.equal(f.counts.resets,1);assert.equal(f.counts.reloads,1);
  assert.equal(f.storage.get('profile'),'unchanged');assert.equal(f.storage.get('rfl-push-repaired'),'1');
  assert.equal(f.counts.permissions,0);
});

test('repair cannot unregister a different app on the same origin',async()=>{
  const f=fixture({granted:true,hangSubscribe:true,fastTimeouts:true,wrongScope:true});f.window.RflPush.setAccount({id:'a'});await flush();
  await f.node('pushToggle').click();await f.node('pushRepair').click();
  assert.equal(f.counts.resets,0);assert.equal(f.counts.reloads,0);assert.equal(f.node('pushRepair').disabled,false);
});

test('a failed server removal does not falsely report disabled and sign-out still unsubscribes offline',async()=>{
  const f=fixture({removeError:true});f.window.RflPush.setAccount({id:'a'});await flush();await f.node('pushToggle').click();
  await f.node('pushToggle').click();assert.equal(f.node('pushOptions').hidden,false);
  assert.equal(f.node('pushToggle').textContent,'Ausschalten');assert.match(f.node('pushStatus').textContent,/Ausschalten fehlgeschlagen/);
  await assert.rejects(f.window.RflPush.beforeSignOut());assert.equal(f.counts.removed,1);assert.equal(f.node('pushOptions').hidden,true);
});
test('a push displays a system notification and clicking cannot navigate off-site',async()=>{
  const events={},shown=[],opened=[];
  const self={registration:{scope:'https://example.com/rfl/',async showNotification(title,options){shown.push({title,options});}},clients:{async matchAll(){return[];},async openWindow(url){opened.push(url);}},addEventListener(name,fn){events[name]=fn;}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'push-worker.js'),'utf8'),{self,URL});
  let pending;events.push({data:{json:()=>({title:'RFL-APP',body:'News',action:'https://evil.example'})},waitUntil(p){pending=p;}});await pending;
  assert.equal(shown.length,1);assert.equal(shown[0].options.data.action,'notifications');
  events.notificationclick({notification:{data:{action:'https://evil.example'},close(){}},waitUntil(p){pending=p;}});await pending;
  assert.equal(opened[0],'https://example.com/rfl/?push=notifications');
});
