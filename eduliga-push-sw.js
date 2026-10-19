/* Push-only service worker. No page caching, no session tokens, no background tracking. */
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 const title=typeof payload.title==='string'?payload.title:'EduLiga';
 event.waitUntil(self.registration.showNotification(title,{
  body:typeof payload.body==='string'?payload.body:'Nowa aktywność w EduLidze.',
  icon:'/eduliga-logo.svg',tag:typeof payload.tag==='string'?payload.tag:'eduliga-activity',
  data:{url:'https://eduliga.web.app/?admin-notifications=1'},vibrate:[120,60,120],renotify:false
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url='https://eduliga.web.app/?admin-notifications=1';
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{
  const existing=list.find(c=>new URL(c.url).origin===self.location.origin);
  if(existing){existing.postMessage({type:'eduliga-open-admin-notifications'});return existing.focus();}
  return clients.openWindow(url);
 }));
});
self.addEventListener('pushsubscriptionchange',event=>{
 // Re-registration always needs a signed-in administrator. Never store login tokens here.
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list)c.postMessage({type:'eduliga-push-renew'});}));
});
