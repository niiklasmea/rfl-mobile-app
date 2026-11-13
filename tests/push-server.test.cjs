const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../backend/rfl-push/index.ts'),'utf8').replace(/^import[^\n]+\n/gm,'');

function server({failure=null}={}){
  let handler;const sends=[],writes=[],logs=[];
  const subscription={id:'device',user_id:'owner',endpoint:'https://fcm.googleapis.com/private-endpoint-token',keys:{auth:'private-auth-key',p256dh:'public-key'},news:true,friends:true};
  const job={id:1,subscription_id:'device',event_id:'news:test',kind:'news',payload:{title:'RFL-APP',body:'Test',action:'notifications'}};
  function from(table){
    let op='select',values;
    const query={select(){return this;},eq(){return this;},lt(){return this;},update(value){op='update';values=value;return this;},delete(){op='delete';return this;},
      single(){return Promise.resolve({data:{worker_token:'worker-only-token',vapid:{publicKey:'public-vapid',privateKey:'private-vapid'}}});},
      maybeSingle(){return Promise.resolve({data:subscription});},
      then(resolve,reject){if(op!=='select')writes.push({table,op,values});return Promise.resolve({data:[]}).then(resolve,reject);}};
    return query;
  }
  const context={Deno:{env:{get:()=>''},serve(fn){handler=fn;}},createClient:()=>({from,rpc:async()=>({data:[job]})}),
    webpush:{setVapidDetails(){},async sendNotification(sub,payload,options){sends.push({sub,payload:JSON.parse(payload),options});if(failure)throw failure;}},
    fetch:async()=>({ok:true,text:async()=>'{"schemaVersion":1,"items":[]}'}),Response,URL,AbortSignal,Date,
    console:{warn:line=>logs.push(line),error:line=>logs.push(line)}};
  vm.runInNewContext(source,context);
  return{request:token=>handler(new Request('https://example.com/rfl-push',{method:'POST',headers:token?{'x-rfl-worker':token}:{}})),sends,writes,logs};
}
test('background notifications request immediate push delivery even without an app client',async()=>{
  const app=server();const response=await app.request('worker-only-token');
  assert.equal(response.status,200);assert.equal(app.sends.length,1);
  assert.equal(app.sends[0].options.urgency,'high');assert.equal(app.sends[0].options.TTL,86400);
  assert.equal(app.sends[0].payload.body,'Test');
  assert.equal((await response.json()).sent,1);
});
test('anonymous callers cannot invoke the background sender',async()=>{
  const app=server();assert.equal((await app.request()).status,401);assert.equal(app.sends.length,0);
});
test('expired subscriptions are retired and delivery logs do not expose credentials',async()=>{
  const app=server({failure:{statusCode:410}});const response=await app.request('worker-only-token');
  assert.equal((await response.json()).failed,1);
  assert(app.writes.some(row=>row.table==='rfl_push_subscriptions'&&row.op==='delete'));
  const log=app.logs.join('\n');assert.match(log,/410/);
  for(const secret of ['private-endpoint-token','private-auth-key','private-vapid','worker-only-token'])assert.equal(log.includes(secret),false);
});
