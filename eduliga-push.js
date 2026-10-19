/* Android Web Push: opt-in administrators; visible activity of signed-in users. */
(() => {
 const A=LeagueApp,E=A.esc,client=()=>window.ortoligaSyncClient;
 let pane=null,owner=null,enabled=false,busy=false,message='',error=false,reg=null,lastCheck=0,checking=false,pulsing=false,lastPulse=0,lastInput=Date.now();
 const supported=()=>location.origin==='https://eduliga.web.app'&&isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 async function call(body){const result=await client().functions.invoke('admin-push',{body});if(result.error){let text='Powiadomienia chwilowo niedostępne.';try{text=(await result.error.context.json()).error||text;}catch{}throw new Error(text);}if(result.data?.error)throw new Error(result.data.error);return result.data;}
 function keyBytes(text){const raw=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
 async function registration(create=false){if(!supported())return null;if(reg)return reg;reg=await navigator.serviceWorker.getRegistration('/');if(!reg&&create){reg=await navigator.serviceWorker.register('/eduliga-push-sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;}return reg;}
 function render(){if(!pane)return;
  pane.innerHTML='<h3>🔔 Powiadomienia na Androidzie</h3><p>Otrzymuj wiadomość, gdy zalogowany użytkownik rozpocznie aktywność — również po zamknięciu EduLigi. Maksymalnie jedna informacja o danej osobie na 30 minut. Twoje własne wejścia nie powiadamiają tego telefonu.</p>'+
  (!supported()?'<p class="push-note">Otwórz https://eduliga.web.app/ w Chrome na Androidzie. Tu włączysz powiadomienia dla tego telefonu.</p>':'<p class="push-state '+(enabled?'enabled':'')+'">'+(enabled?'● Włączone na tym urządzeniu':'○ Wyłączone na tym urządzeniu')+'</p><div class="push-actions"><button type="button" class="primary" data-push-toggle '+(busy?'disabled':'')+'>'+(busy?'Chwila…':enabled?'Wyłącz na tym urządzeniu':'Włącz powiadomienia')+'</button>'+(enabled?'<button type="button" class="secondary" data-push-test '+(busy?'disabled':'')+'>Wyślij próbne</button>':'')+'</div>')+'<p class="push-status '+(error?'bad':'')+'" role="status">'+E(message)+'</p><small>Na ekranie blokady może być widoczne imię użytkownika. Ograniczenia baterii, brak internetu lub wyłączenie powiadomień w Androidzie mogą opóźnić dostarczenie.</small>';
  pane.querySelector('[data-push-toggle]')?.addEventListener('click',()=>void toggle());pane.querySelector('[data-push-test]')?.addEventListener('click',()=>void test());
 }
 async function status(force=false){const me=A.user()?.id;if(!pane||!me||!supported()||busy||checking||(!force&&Date.now()-lastCheck<20000))return;checking=true;
  try{const r=await registration(),s=await r?.pushManager.getSubscription();if(A.user()?.id!==me)return;enabled=!!s&&Notification.permission==='granted'&&(await call({action:'status',endpoint:s.endpoint})).enabled;lastCheck=Date.now();error=false;}
  catch{message='Nie udało się sprawdzić powiadomień. Spróbuj ponownie.';error=true;}finally{checking=false;render();}
 }
 async function toggle(){if(busy||!pane||!A.user())return;const me=A.user().id;busy=true;message='';error=false;const wasEnabled=enabled;render();
  try{
   if(wasEnabled){const r=await registration(),s=await r?.pushManager.getSubscription();if(s){await call({action:'unsubscribe',endpoint:s.endpoint});await s.unsubscribe();}enabled=false;message='Powiadomienia wyłączone na tym urządzeniu.';}
   else{
    // Request Android permission immediately from the administrator's button click.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Włącz powiadomienia dla eduliga.web.app w ustawieniach Chrome / Androida.');
    const config=await call({action:'config'}),r=await registration(true);if(A.user()?.id!==me)return;
    let subscription=await r.pushManager.getSubscription();if(subscription){const current=subscription.options.applicationServerKey;if(current&&btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==config.publicKey){await subscription.unsubscribe();subscription=null;}}
    subscription??=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});if(A.user()?.id!==me)return;
    await call({action:'subscribe',subscription:subscription.toJSON()});enabled=true;message='Włączone! Naciśnij „Wyślij próbne”, aby sprawdzić telefon.';
   }
  }catch(e){message=e.message||'Nie udało się zmienić powiadomień.';error=true;}finally{busy=false;render();}
 }
 async function test(){if(busy)return;busy=true;message='Wysyłam…';error=false;render();try{const r=await registration(),s=await r?.pushManager.getSubscription();if(!s)throw new Error('Najpierw włącz powiadomienia.');await call({action:'test',endpoint:s.endpoint});message='Wysłano. Sprawdź powiadomienia telefonu.';}catch(e){message=e.message;error=true;}finally{busy=false;render();}}
 async function pulse(){const me=A.user()?.id;if(!me||!client()||document.hidden||Date.now()-lastInput>120000||pulsing||Date.now()-lastPulse<45000)return;pulsing=true;lastPulse=Date.now();try{await call({action:'heartbeat',league:document.body.dataset.activeLeague||'none'});}catch{}finally{pulsing=false;}}
 for(const name of ['pointerdown','keydown','touchstart'])document.addEventListener(name,()=>{lastInput=Date.now();void pulse();},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastInput=Date.now();void pulse();}});
 window.addEventListener('ortoliga-auth-change',()=>{const next=A.user()?.id||null;if(next===owner)return;owner=next;pane=null;enabled=false;message='';error=false;reg=null;lastCheck=0;lastPulse=0;lastInput=Date.now();if(next)setTimeout(()=>void pulse(),1000);});
 setInterval(()=>void pulse(),45000);
 if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='eduliga-open-admin-notifications')window.openAdminNotifications?.();if(event.data?.type==='eduliga-push-renew'){message='Odśwież powiadomienia na tym urządzeniu.';void status(true);}});
 window.EduAdminPush={mount(node){pane=node;owner=A.user()?.id||null;render();void status();}};
 if(A.user())setTimeout(()=>void pulse(),1500);
})();
