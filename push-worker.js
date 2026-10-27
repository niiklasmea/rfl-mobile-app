/* Imported by the service worker. Always show incoming pushes, including while the app is open. */
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  const allowed=['friends','calendar','settings','notifications'];
  const action=allowed.includes(data.action)?data.action:'notifications';
  event.waitUntil(self.registration.showNotification(String(data.title||'RFL-APP').slice(0,120),{
    body:String(data.body||'Neue Nachricht in der RFL-APP.').slice(0,400),
    icon:new URL('./icons/icon-192.png',self.registration.scope).href,
    badge:new URL('./icons/icon-192.png',self.registration.scope).href,
    tag:String(data.id||'rfl-notification').slice(0,120),
    data:{action},
    renotify:false
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const allowed=['friends','calendar','settings','notifications'];
  const action=allowed.includes(event.notification.data?.action)?event.notification.data.action:'notifications';
  event.waitUntil((async()=>{
    const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const tab of tabs){
      const url=new URL(tab.url),scope=new URL(self.registration.scope);
      if(url.origin===scope.origin&&url.pathname.startsWith(scope.pathname)){
        await tab.focus();tab.postMessage({type:'rfl:push-open',action});return;
      }
    }
    const url=new URL(self.registration.scope);url.searchParams.set('push',action);
    await self.clients.openWindow(url.href);
  })());
});
