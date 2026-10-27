(() => {
  'use strict';
  const section=document.getElementById('pushSettings');
  const toggle=document.getElementById('pushToggle');
  const status=document.getElementById('pushStatus');
  const options=document.getElementById('pushOptions');
  const news=document.getElementById('pushNews');
  const friends=document.getElementById('pushFriends');
  const test=document.getElementById('pushTest');
  let client=null,account=null,subscription=null,enabled=false,busy=false,generation=0;
  const english=()=>document.documentElement.lang==='en';
  const text=(de,en)=>english()?en:de;
  const supported=()=>location.protocol==='https:' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const iphoneNeedsInstall=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)&&!navigator.standalone&&!window.matchMedia('(display-mode: standalone)').matches;
  const message=(de,en)=>{status.textContent=text(de,en);};
  async function rpc(name,args){ const {data,error}=await client.rpc(name,args);if(error)throw error;return data; }
  function render(){
    const labels={pushTitle:['Handy-Benachrichtigungen','Phone notifications'],pushNewsLabel:['RFL-Neuigkeiten','RFL news'],pushFriendsLabel:['Freundschaftsanfragen','Friend requests']};
    for(const [id,labelsText] of Object.entries(labels)) document.getElementById(id).textContent=text(...labelsText);
    toggle.textContent=enabled?text('Ausschalten','Turn off'):text('Aktivieren','Enable');
    toggle.setAttribute('aria-pressed',String(enabled));
    toggle.disabled=busy||!account||!supported()||iphoneNeedsInstall();
    test.textContent=text('Testnachricht senden','Send test notification');
    test.disabled=busy; news.disabled=busy;friends.disabled=busy;
    options.hidden=!enabled;
    if(!supported()||iphoneNeedsInstall()) message('Auf dem Handy zum Home-Bildschirm hinzufügen und von dort öffnen.','On your phone, add the app to your Home Screen and open it there.');
    else if(!account) message('Melde dich zuerst in der Freundesliste an.','Sign in to your account in the friends list first.');
    else if(Notification.permission==='denied') message('Im Browser bzw. in den Handy-Einstellungen sind Mitteilungen blockiert.','Notifications are blocked in your browser or phone settings.');
    else message(enabled?'Aktiv · auch wenn die App geschlossen ist.':'Erhalte Anfragen und Neuigkeiten auf deinem Handy.',enabled?'Enabled · even when the app is closed.':'Get requests and news on your phone.');
  }
  async function registration(){
    let timer;
    try{return await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('service worker unavailable')),15000);})]);}
    finally{clearTimeout(timer);}
  }
  async function sync(){
    const run=++generation;
    if(!supported()||!account||!client){enabled=false;render();return;}
    try{
      const reg=await registration();const sub=await reg.pushManager.getSubscription();
      const saved=sub?await rpc('rfl_push_status',{p_endpoint:sub.endpoint}):null;
      if(run!==generation)return;
      subscription=sub;enabled=Boolean(saved && Notification.permission==='granted');
      if(saved){news.checked=saved.news;friends.checked=saved.friends;}
      render();
    }catch {if(run===generation){enabled=false;render();message('Verbindung fehlgeschlagen. Einstellungen erneut öffnen.','Connection failed. Open settings again.');}}
  }
  async function save(){
    if(!account||!subscription)throw Error('not signed in');
    await rpc('rfl_push_save',{p_subscription:subscription.toJSON(),p_news:news.checked,p_friends:friends.checked,p_locale:english()?'en':'de'});
  }
  async function deactivate(){
    ++generation;
    if(supported()){
      const sub=subscription||await (await registration()).pushManager.getSubscription();
      if(sub){
        // Unsubscribe locally even if the server is offline: no pushes can reach this browser afterwards.
        try{if(client&&account)await rpc('rfl_push_remove',{p_endpoint:sub.endpoint});}finally{await sub.unsubscribe();}
      }
    }
    subscription=null;enabled=false;render();
  }
  toggle.addEventListener('click',async()=>{
    if(busy||!account)return;
    busy=true;render();
    try{
      if(enabled){await deactivate();return;}
      // Ask only after the person's explicit tap; iPhone requires this user gesture.
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){render();return;}
      const key=await rpc('rfl_push_public_key');if(!key)throw Error('server not ready');
      const reg=await registration();subscription=await reg.pushManager.getSubscription();
      if(!subscription){
        const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
      }
      await save();enabled=true;
    }catch{
      if(subscription)await subscription.unsubscribe().catch(()=>{});
      enabled=false;message('Konnte nicht aktiviert werden. Bitte erneut versuchen.','Could not enable notifications. Please try again.');
      return;
    }finally{busy=false;toggle.disabled=false;test.disabled=false;news.disabled=false;friends.disabled=false;}
    render();
  });
  for(const input of [news,friends])input.addEventListener('change',async()=>{
    busy=true;render();
    try{await save();}catch{input.checked=!input.checked;message('Änderung konnte nicht gespeichert werden.','Could not save this change.');}
    finally{busy=false;toggle.disabled=false;test.disabled=false;news.disabled=false;friends.disabled=false;}
  });
  test.addEventListener('click',async()=>{
    if(busy||!enabled)return;busy=true;render();
    try{await rpc('rfl_push_test',{p_endpoint:subscription.endpoint});message('Test eingeplant · kommt normalerweise innerhalb einer Minute.','Test queued · usually arrives within a minute.');}
    catch{message('Bitte eine Minute warten und erneut versuchen.','Please wait a minute and try again.');}
    finally{busy=false;test.disabled=false;toggle.disabled=false;news.disabled=false;friends.disabled=false;}
  });
  window.RflPush={
    init(value){client=value;render();},
    setAccount(user){
      const next=user?.id||null;if(account===next)return;
      const previous=account;account=next;
      // An account switch must stop delivery to the former account on a shared phone.
      if(previous)void deactivate().catch(()=>{}).finally(()=>void sync());
      else void sync();
    },
    beforeSignOut:deactivate
  };
  document.getElementById('openSettings')?.addEventListener('click',()=>void sync());
  window.addEventListener('rfl:language-changed',()=>{render();if(enabled)void save().catch(()=>{});});
  function openAction(action){
    if(action==='friends')document.getElementById('openFriends')?.click();
    else if(action==='settings')document.getElementById('openSettings')?.click();
    else if(action==='calendar'&&typeof showScreen==='function')showScreen('calendar');
    else document.getElementById('openNotifications')?.click();
  }
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='rfl:push-open')openAction(event.data.action);});
  const requested=new URL(location.href).searchParams.get('push');
  if(['friends','settings','calendar','notifications'].includes(requested)){
    window.setTimeout(()=>openAction(requested),100);
    const clean=new URL(location.href);clean.searchParams.delete('push');history.replaceState(null,'',clean.href);
  }
  render();
})();
