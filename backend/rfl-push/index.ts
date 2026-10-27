import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {auth:{persistSession:false}});
const check = ({data,error}) => { if(error) throw error; return data; };
const appUrl='https://niiklasmea.github.io/rfl-mobile-app/';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method!=='POST') return response({error:'Method not allowed'},405);
  try {
    let config=check(await db.from('rfl_push_config').select('*').eq('id',1).single());
    if(!req.headers.get('x-rfl-worker') || req.headers.get('x-rfl-worker')!==config.worker_token) return response({error:'Unauthorized'},401);
    if(!config.vapid){
      check(await db.from('rfl_push_config').update({vapid:webpush.generateVAPIDKeys()}).eq('id',1).is('vapid',null));
      config=check(await db.from('rfl_push_config').select('*').eq('id',1).single());
    }
    webpush.setVapidDetails(appUrl,config.vapid.publicKey,config.vapid.privateKey);
    // Only the fixed, published RFL feed may create broadcast notifications.
    try {
      const feed=await fetch(appUrl+'release-notes.json',{signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!feed.ok) throw Error('News unavailable');
      const text=await feed.text(); if(text.length>100000) throw Error('Feed too large');
      const news=JSON.parse(text);
      if(news.schemaVersion===1 && Array.isArray(news.items)) for(const item of news.items.slice(0,30)){
        if(typeof item.id!=='string'||item.id.length>100||!Number.isFinite(Date.parse(item.publishedAt))||!item.title?.de||!item.body?.de) continue;
        if(Date.parse(item.publishedAt)<Date.now()-2*86400000 || Date.parse(item.publishedAt)>Date.now()+300000) continue;
        // Check/insert separately only after fan-out: retries repair any partial batch.
        const known=check(await db.from('rfl_push_news').select('id').eq('id',item.id));
        if(known.length) continue;
        const subscribers=check(await db.from('rfl_push_subscriptions').select('id,locale').eq('news',true).lt('created_at',item.publishedAt));
        for(let i=0;i<subscribers.length;i+=200){
          const jobs=subscribers.slice(i,i+200).map(s=>({subscription_id:s.id,event_id:'news:'+item.id,kind:'news',payload:{title:String(item.title[s.locale]||item.title.de).slice(0,120),body:String(item.body[s.locale]||item.body.de).slice(0,350),action:item.action==='calendar'?'calendar':'notifications'}}));
          if(jobs.length) check(await db.from('rfl_push_jobs').upsert(jobs,{onConflict:'subscription_id,event_id',ignoreDuplicates:true}));
        }
        check(await db.from('rfl_push_news').upsert({id:item.id,published_at:item.publishedAt},{ignoreDuplicates:true}));
      }
    } catch { console.warn('News feed refresh failed; pending pushes will still be delivered.'); }
    const jobs=check(await db.rpc('rfl_push_claim'));
    let sent=0,failed=0;
    for(let offset=0;offset<jobs.length;offset+=5) await Promise.all(jobs.slice(offset,offset+5).map(async job=>{
      try {
        const sub=check(await db.from('rfl_push_subscriptions').select('*').eq('id',job.subscription_id).maybeSingle());
        if(!sub) return;
        let deliver=job.kind==='test'||Boolean(sub[job.kind]);
        if(job.kind==='friends'){
          const request=check(await db.from('rfl_friend_requests').select('status,to_id').eq('id',job.payload.requestId).maybeSingle());
          deliver=deliver&&request?.status==='pending'&&request?.to_id===sub.user_id;
        }
        if(deliver){
          await webpush.sendNotification({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify({...job.payload,id:job.event_id}),{TTL:86400,urgency:'normal',timeout:8000});
          sent++;
        }
        check(await db.from('rfl_push_jobs').update({delivered_at:new Date().toISOString()}).eq('id',job.id));
      } catch(error){
        failed++;
        if(error.statusCode===404||error.statusCode===410) check(await db.from('rfl_push_subscriptions').delete().eq('id',job.subscription_id));
        // Never log endpoints, keys or message contents.
      }
    }));
    check(await db.from('rfl_push_jobs').delete().lt('created_at',new Date(Date.now()-7*86400000).toISOString()));
    return response({sent,failed,claimed:jobs.length});
  } catch { console.error('Push worker failed');return response({error:'Push worker failed'},500); }
});
