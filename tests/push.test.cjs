const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture({ios=false,standalone=false,denied=false,saveError=false}={}){
  const nodes=new Map();
  function node(id){if(!nodes.has(id))nodes.set(id,{checked:true,disabled:false,hidden:false,textContent:'',events:{},setAttribute(){},addEventListener(name,fn){this.events[name]=fn;},click(){return this.events.click?.();}});return nodes.get(id);}
  let sub=null,permissions=0,subscriptions=0,removed=0;const calls=[];
  const reg={pushManager:{async getSubscription(){return sub;},async subscribe(){subscriptions++;sub={endpoint:'https://fcm.googleapis.com/test',toJSON(){return{endpoint:this.endpoint,keys:{auth:'abc',p256dh:'def'}};},async unsubscribe(){removed++;sub=null;return true;}};return sub;}}};
  const Notification={permission:denied?'denied':'default',async requestPermission(){permissions++;return this.permission=denied?'denied':'granted';}};
  const window={matchMedia:()=>({matches:standalone}),addEventListener(){},setTimeout:fn=>fn(),PushManager:function(){},Notification};
  const navigator={userAgent:ios?'iPhone':'Android',standalone,serviceWorker:{ready:Promise.resolve(reg),addEventListener(){}}};
  const document={documentElement:{lang:'de'},getElementById:node};
  const context={window,document,navigator,Notification,location:{protocol:'https:',href:'https://example.com/'},URL,Uint8Array,atob,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.join(root,'push.js'),'utf8'),context);
  window.RflPush.init({async rpc(name,args){calls.push({name,args});if(name==='rfl_push_public_key')return{data:'BA',error:null};if(name==='rfl_push_save'&&saveError)return{error:Error('offline')};return{data:null,error:null};}});
  return{window,node,calls,get counts(){return{permissions,subscriptions,removed};}};
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
  assert.equal(f.counts.removed,1);assert.match(f.node('pushStatus').textContent,/nicht aktiviert/);assert.equal(f.node('pushOptions').hidden,true);
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
