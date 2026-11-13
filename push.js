(() => {
  'use strict';
  const section=document.getElementById('pushSettings');
  const toggle=document.getElementById('pushToggle');
  const status=document.getElementById('pushStatus');
  const options=document.getElementById('pushOptions');
  const news=document.getElementById('pushNews');
  const friends=document.getElementById('pushFriends');
  const test=document.getElementById('pushTest');
  const repair=document.getElementById('pushRepair');
  const details=document.getElementById('pushErrorDetails');
  let client=null,account=null,subscription=null,enabled=false,busy=false,generation=0,repairAvailable=false,errorCode='';
  let justRepaired=false;try{justRepaired=sessionStorage.getItem('rfl-push-repaired')==='1';sessionStorage.removeItem('rfl-push-repaired');}catch{}
  const english=()=>document.documentElement.lang==='en';
  const text=(de,en)=>english()?en:de;
  const supported=()=>location.protocol==='https:' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const iphoneNeedsInstall=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)&&!navigator.standalone&&!window.matchMedia('(display-mode: standalone)').matches;
  const message=(de,en)=>{status.textContent=text(de,en);};
  function timed(task,ms,onTimeout){
    let timer;
    return Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout?.();reject(Object.assign(Error('Operation timed out'),{name:'TimeoutError'}));},ms);})]).finally(()=>clearTimeout(timer));
  }
  async function rpc(name,args){
    const abort=new AbortController();let request=client.rpc(name,args);
    if(typeof request.abortSignal==='function')request=request.abortSignal(abort.signal);
    const {data,error}=await timed(request,12000,()=>abort.abort());if(error)throw error;return data;
  }
  function render(){
    const labels={pushTitle:['Handy-Benachrichtigungen','Phone notifications'],pushNewsLabel:['RFL-Neuigkeiten','RFL news'],pushFriendsLabel:['Freundschaftsanfragen','Friend requests']};
    for(const [id,labelsText] of Object.entries(labels)) document.getElementById(id).textContent=text(...labelsText);
    toggle.textContent=busy?text('Bitte warten …','Please wait …'):enabled?text('Ausschalten','Turn off'):text('Aktivieren','Enable');
    toggle.setAttribute('aria-pressed',String(enabled));
    section.setAttribute('aria-busy',String(busy));
    toggle.disabled=busy||!account||!supported()||iphoneNeedsInstall();
    test.textContent=text('Testnachricht senden','Send test notification');
    test.disabled=busy; news.disabled=busy;friends.disabled=busy;
    repair.hidden=!repairAvailable;repair.disabled=busy||!account;
    repair.textContent=text('Verbindung neu einrichten','Set up connection again');
    details.hidden=!errorCode;document.getElementById('pushErrorCode').textContent=errorCode;
    document.getElementById('pushErrorSummary').textContent=text('Fehlercode für Hilfe','Error code for support');
    options.hidden=!enabled;
    if(!supported()||iphoneNeedsInstall()) message('Auf dem Handy zum Home-Bildschirm hinzufügen und von dort öffnen.','On your phone, add the app to your Home Screen and open it there.');
    else if(!account) message('Melde dich zuerst in der Freundesliste an.','Sign in to your account in the friends list first.');
    else if(Notification.permission==='denied') message('Im Browser bzw. in den Handy-Einstellungen sind Mitteilungen blockiert.','Notifications are blocked in your browser or phone settings.');
    else message(enabled?'Aktiv · auch wenn die App geschlossen ist.':'Erhalte Anfragen und Neuigkeiten auf deinem Handy.',enabled?'Enabled · even when the app is closed.':'Get requests and news on your phone.');
    if(justRepaired&&!enabled&&account&&!busy)message('Verbindung neu vorbereitet. Tippe jetzt auf Aktivieren.','Connection reset. Tap Enable now.');
  }
  async function registration(){
    return timed(navigator.serviceWorker.ready,15000);
  }
  async function sync(){
    if(busy)return;
    const run=++generation;
    if(!supported()||!account||!client){enabled=false;render();return;}
    try{
      const reg=await registration();const sub=await timed(reg.pushManager.getSubscription(),8000);
      const saved=sub?await rpc('rfl_push_status',{p_endpoint:sub.endpoint}):null;
      if(run!==generation||busy)return;
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
    try{
      if(supported()){
        const sub=subscription||await (await registration()).pushManager.getSubscription();
        if(sub){
          // Sign-out/account switches must stop the former account's delivery even while offline.
          try{if(client&&account)await rpc('rfl_push_remove',{p_endpoint:sub.endpoint});}finally{await sub.unsubscribe();}
        }
      }
    }finally{subscription=null;enabled=false;render();}
  }
  async function subscribe(reg,key){
    const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    for(let attempt=0;attempt<3;attempt++){
      try{
        const existing=await timed(reg.pushManager.getSubscription(),8000);
        if(existing)return {sub:existing,created:false};
        return {sub:await timed(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes}),20000),created:true};
      }catch(error){
        // A mobile push service may still be finishing the previous unsubscription.
        if(attempt===2||!['AbortError','NetworkError','InvalidStateError'].includes(error.name))throw error;
        await new Promise(resolve=>setTimeout(resolve,attempt===0?500:1500));
      }
    }
  }
  toggle.addEventListener('click',async()=>{
    if(busy||!account)return;
    const turningOff=enabled,owner=account;let stage='permission',created=false,attemptedSub=null,failure=null;
    ++generation;busy=true;errorCode='';justRepaired=false;render();
    message(turningOff?'Benachrichtigungen werden ausgeschaltet …':'Benachrichtigungen werden aktiviert …',turningOff?'Turning notifications off …':'Enabling notifications …');
    const stillSignedIn=()=>{if(account!==owner)throw Error('account changed');};
    try{
      if(turningOff){
        stage='remove';
        const sub=subscription||await (await registration()).pushManager.getSubscription();stillSignedIn();
        // Delete the server destination, but retain the browser permission and subscription.
        // Turning notifications back on then needs no new Google/Apple registration.
        if(sub)await rpc('rfl_push_remove',{p_endpoint:sub.endpoint});
        subscription=null;enabled=false;
      }else{
        // Ask only after the person's explicit tap; iPhone requires this user gesture.
        const permission=Notification.permission==='granted'?'granted':await timed(Notification.requestPermission(),45000);
        if(permission!=='granted')throw Object.assign(Error('Permission not granted'),{name:'NotAllowedError'});
        stillSignedIn();stage='server';
        message('Verbinde mit RFL …','Connecting to RFL …');
        const key=await rpc('rfl_push_public_key');if(!key)throw Error('server not ready');
        stillSignedIn();stage='registration';
        message('Handy-Verbindung wird eingerichtet …','Setting up phone connection …');
        const reg=await registration();const result=await subscribe(reg,key);
        attemptedSub=result.sub;created=result.created;stillSignedIn();
        subscription=attemptedSub;stage='save';message('Verbindung wird gespeichert …','Saving connection …');await save();stillSignedIn();enabled=true;repairAvailable=false;
      }
    }catch(error){
      if(!turningOff){
        if(attemptedSub&&(created||account!==owner))await timed(attemptedSub.unsubscribe(),5000).catch(()=>{});
        subscription=null;enabled=false;
      }
      failure={stage,error};
      if(stage==='registration'){
        repairAvailable=true;
        errorCode=/push service error/i.test(error.message||'')?'PUSH_SERVICE_ERROR':/applicationServerKey/i.test(error.message||'')?'PUSH_KEY_ERROR':('PHONE_'+String(error.name||'ERROR').replace(/[^a-z0-9]/gi,'').toUpperCase()).slice(0,60);
      }
    }finally{
      busy=false;render();
      if(failure){
        if(account!==owner)return;
        if(turningOff)message('Ausschalten fehlgeschlagen. Bitte mit Internet erneut versuchen.','Could not turn notifications off. Please reconnect and try again.');
        else if(Notification.permission==='denied'||failure.error.name==='NotAllowedError')message('Bitte Mitteilungen für RFL in den Handy- bzw. Browser-Einstellungen erlauben.','Please allow RFL notifications in your phone or browser settings.');
        else if(failure.stage==='registration')message('Handy-Verbindung fehlgeschlagen. Tippe auf „Verbindung neu einrichten“. Dein Konto und Profil bleiben erhalten.','Phone connection failed. Tap “Set up connection again”. Your account and profile are kept.');
        else if(failure.error.code==='PGRST301'||failure.error.status===401)message('Bitte in der Freundesliste erneut anmelden und danach aktivieren.','Please sign in again in the friends list, then enable notifications.');
        else message('Verbindung zum RFL-Server fehlgeschlagen. Bitte mit Internet erneut versuchen.','Could not connect to the RFL server. Please reconnect and try again.');
      }
    }
  });
  repair.addEventListener('click',async()=>{
    if(busy||!account||!supported())return;
    const owner=account;++generation;busy=true;render();message('Handy-Verbindung wird zurückgesetzt …','Resetting phone connection …');
    try{
      const appScope=new URL('./',location.href).href;
      const reg=await timed(navigator.serviceWorker.getRegistration(appScope),8000);
      if(reg&&reg.scope!==appScope)throw Error('Unexpected worker scope');
      if(account!==owner)throw Error('Account changed');
      if(reg){
        const sub=await timed(reg.pushManager.getSubscription(),5000).catch(()=>null);
        if(sub){
          try{await rpc('rfl_push_remove',{p_endpoint:sub.endpoint});}catch{}
          await timed(sub.unsubscribe(),5000).catch(()=>{});
        }
        if(account!==owner)throw Error('Account changed');
        await timed(reg.unregister(),10000);
      }
      subscription=null;enabled=false;
      // Reload before registering again: the old registration can control this
      // document until it unloads. Never clear profile/auth storage or caches.
      try{sessionStorage.setItem('rfl-push-repaired','1');}catch{}
      location.reload();
    }catch(error){
      errorCode=('RESET_'+String(error.name||'ERROR').replace(/[^a-z0-9]/gi,'').toUpperCase()).slice(0,60);
      busy=false;render();message('Neu einrichten fehlgeschlagen. Starte dein Handy neu und versuche es danach erneut.','Could not reset the connection. Restart your phone, then try again.');
    }
  });
  for(const input of [news,friends])input.addEventListener('change',async()=>{
    busy=true;render();
    try{await save();}catch{input.checked=!input.checked;message('Änderung konnte nicht gespeichert werden.','Could not save this change.');}
    finally{const feedback=status.textContent;busy=false;render();status.textContent=feedback;}
  });
  test.addEventListener('click',async()=>{
    if(busy||!enabled)return;busy=true;render();
    try{await rpc('rfl_push_test',{p_endpoint:subscription.endpoint});message('Test eingeplant · kommt normalerweise innerhalb einer Minute.','Test queued · usually arrives within a minute.');}
    catch{message('Bitte eine Minute warten und erneut versuchen.','Please wait a minute and try again.');}
    finally{const feedback=status.textContent;busy=false;render();status.textContent=feedback;}
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
  if(justRepaired)window.setTimeout(()=>openAction('settings'),100);
  render();
})();
