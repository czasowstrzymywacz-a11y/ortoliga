/* Recipient-only persistent invitations, with a visible inbox and polling fallback. */
(() => {
 const currentUser=()=>typeof syncUser!=='undefined'?syncUser:window.ortoligaSyncUser;
 const client=()=>window.ortoligaSyncClient;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const inviteStates=new Map();window.englishInviteStates=inviteStates;
 let generation=0,owner=null,channel=null,polling=false,expiryTimer=null,statusTimer=null,open=false,loadError='',lastPoll=0;
 let invitations=[],busy=new Set(),errors=new Map(),handled=new Set(),seen=new Set();
 const root=document.getElementById('battle-invite-notifications');
 const bell=document.createElement('button');bell.id='battle-notification-button';bell.type='button';bell.className='battle-notification-button';bell.hidden=true;bell.setAttribute('aria-controls',root.id);bell.setAttribute('aria-expanded','false');document.body.append(bell);
 const toast=document.createElement('div');toast.className='battle-notification-toast';toast.setAttribute('role','status');toast.hidden=true;document.body.append(toast);let toastTimer;
 function refreshRoster(){renderPicker();if(typeof renderStudentRoster==='function')renderStudentRoster();}
 function status(message,error=false){const el=document.getElementById('battle-invite-status');if(!el)return;clearTimeout(statusTimer);el.hidden=!message;el.textContent=message;el.classList.toggle('error',error);if(message)statusTimer=setTimeout(()=>el.hidden=true,error?12000:8000);}
 function render(){
  clearTimeout(expiryTimer);invitations=invitations.filter(x=>Date.parse(x.expires_at)>Date.now());
  bell.hidden=!currentUser();bell.classList.toggle('has-invitations',!!invitations.length);
  bell.setAttribute('aria-label','Zaproszenia do bitwy'+(invitations.length?' · '+invitations.length+' nowych':''));
  bell.setAttribute('aria-expanded',String(open));bell.innerHTML='<span aria-hidden="true">🔔</span>'+(invitations.length?'<b>'+invitations.length+'</b>':'');
  root.hidden=!open||!currentUser();
  root.innerHTML='<header class="notification-heading"><b>Zaproszenia do bitwy</b><button type="button" onclick="closeBattleNotifications()" aria-label="Zamknij powiadomienia">×</button></header>'+
   (loadError?'<p class="notification-error">'+escape(loadError)+'</p><button class="secondary" onclick="refreshBattleNotifications()">Spróbuj ponownie</button>':'')+
   (invitations.length?invitations.map(invite=>'<article class="battle-invite-card"><span class="invite-icon" aria-hidden="true">⚔️</span><div><h2>'+escape(invite.sender_name)+' zaprasza Cię do bitwy</h2><p>'+escape(window.LeagueApp?.configs[invite.league||'english']?.name||'Liga Angielska')+' · wspólny pokój. Możesz dołączyć do trwającej gry.</p><small>Ważne do '+new Date(invite.expires_at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+'</small>'+
   (errors.has(invite.id)?'<p class="invite-error">'+escape(errors.get(invite.id))+'</p>':'')+'<div class="invite-card-actions"><button class="primary" type="button" onclick="respondEnglishBattleInvite(\''+invite.id+'\',true)" '+(busy.has(invite.id)?'disabled':'')+'>'+(busy.has(invite.id)?'Łączenie…':'Dołącz →')+'</button><button class="secondary" type="button" onclick="respondEnglishBattleInvite(\''+invite.id+'\',false)" '+(busy.has(invite.id)?'disabled':'')+'>Nie teraz</button></div></div></article>').join(''):'<p class="notification-empty">'+(lastPoll?'Nie masz nowych zaproszeń.':'Sprawdzam zaproszenia…')+'</p>');
  window.dispatchEvent(new CustomEvent('eduliga-invitations',{detail:{invitations:[...invitations],count:invitations.length}}));if(invitations.length)expiryTimer=setTimeout(render,Math.max(100,Math.min(...invitations.map(x=>Date.parse(x.expires_at)-Date.now()))+50));
 }
 async function poll(){
  if(!owner||polling||!client()||document.hidden)return;
  polling=true;const sequence=generation,id=owner;
  try{
   const {data:rows,error}=await client().rpc('get_topic_battle_invitations');
   if(sequence!==generation||currentUser()?.id!==id)return;if(error)throw error;
   invitations=(rows||[]).filter(x=>!handled.has(x.id));loadError='';lastPoll=Date.now();
   const fresh=invitations.filter(x=>!seen.has(x.id));for(const x of invitations)seen.add(x.id);
   if(fresh.length){try{navigator.vibrate?.([100,70,100]);}catch(_){}clearTimeout(toastTimer);toast.textContent=fresh[0].sender_name+' zaprasza Cię do bitwy. Otwórz rozmowy i powiadomienia.';toast.hidden=false;toastTimer=setTimeout(()=>toast.hidden=true,7000);}
   render();
  }catch(error){if(sequence===generation){loadError='Nie udało się pobrać zaproszeń. Ponawiam połączenie.';render();}}
  finally{if(sequence===generation)polling=false;}
 }
 function restart(){
  const next=currentUser()?.id||null;
  if(next===owner&&(channel||!next))return;
  generation++;owner=next;polling=false;clearTimeout(expiryTimer);
  const old=channel;channel=null;if(old)void client()?.removeChannel(old);
  invitations=[];busy=new Set();errors=new Map();handled=new Set();seen=new Set();inviteStates.clear();loadError='';lastPoll=0;open=false;toast.hidden=true;render();refreshRoster();
  if(!owner||!client())return;
  const sequence=generation;
  channel=client().channel('english-invitations:'+owner);
  channel.on('postgres_changes',{event:'*',schema:'public',table:'english_battle_invitations',filter:'recipient_id=eq.'+owner},()=>{if(sequence===generation)void poll();}).subscribe(s=>{if(s==='SUBSCRIBED'&&sequence===generation)void poll();});
  void poll();
 }
 let picker=null,pickerLeague=null;
 function renderPicker(){
  if(!picker?.open)return;
  const online=currentPresenceIds(),me=currentUser()?.id,field=pickerLeague==='ortho'?'ortho_xp':pickerLeague==='spanish'?'spanish_xp':'english_xp';
  const profiles=(typeof studentRoster!=='undefined'?studentRoster:[]).filter(p=>p.user_id!==me&&online.has(p.user_id)).sort((a,b)=>(Number(b[field])||0)-(Number(a[field])||0));
  const root=picker.querySelector('.battle-invite-people');
  root.innerHTML=profiles.length?profiles.map(p=>{const pending=inviteStates.get(pickerLeague+':'+p.user_id),disabled=pending&&pending.until>Date.now();return '<button class="battle-invite-person" type="button" data-invite-user="'+p.user_id+'" '+(disabled?'disabled':'')+'><i class="presence-dot online" aria-hidden="true"></i><span><b>'+escape(p.display_name)+'</b><small>'+Math.max(0,Number(p[field])||0).toLocaleString('pl-PL')+' '+window.LeagueApp.configs[pickerLeague].unit+'</small></span><em>'+(disabled?escape(pending.label):'Zaproś →')+'</em></button>';}).join(''):'<p>Nie ma teraz innych aktywnych użytkowników. Lista odświeża się automatycznie.</p>';
  root.querySelectorAll('[data-invite-user]').forEach(b=>b.onclick=()=>inviteUser(b.dataset.inviteUser,pickerLeague));
 }
 window.refreshBattleInvitePicker=renderPicker;
 window.openBattleInvitePicker=key=>{
  const arena=document.getElementById('arena-'+key);
  if(!arena||!arena.getClientRects().length||!window.LeagueApp?.configs[key])return;
  if(!currentUser()){openSyncDialog();return;}
  if(!picker){
   picker=document.createElement('dialog');picker.className='battle-invite-picker';picker.setAttribute('aria-labelledby','battle-invite-picker-title');
   picker.innerHTML='<form method="dialog"><button class="point-history-close" aria-label="Zamknij listę">×</button></form><h2 id="battle-invite-picker-title"></h2><p>Kliknij aktywną osobę, aby zaprosić ją do tej bitwy.</p><div class="battle-invite-people"></div>';
   document.body.append(picker);
  }
  pickerLeague=key;picker.querySelector('h2').textContent='Zaproś · '+window.LeagueApp.configs[key].name;
  if(!picker.open)picker.showModal();renderPicker();void loadStudentRoster();
 };
 window.addEventListener('ortoliga-auth-change',()=>{if(picker?.open)picker.close();});
 async function inviteUser(targetId,key){
  restart();const user=currentUser();if(!user){openSyncDialog();return;}if(!targetId||targetId===user.id||!picker?.open||key!==pickerLeague)return;if(!currentPresenceIds().has(targetId)){status('Ta osoba nie jest już aktywna.',true);renderPicker();return;}
  const stateKey=key+':'+targetId;const previous=inviteStates.get(stateKey);if(previous&&previous.until>Date.now())return;
  const sequence=generation,id=user.id,profile=typeof studentRoster!=='undefined'?studentRoster.find(x=>x.user_id===targetId):null;
  inviteStates.set(stateKey,{label:'Łączenie…',until:Infinity});refreshRoster();status('Wchodzę do pokoju bitew…');
  try{
   await window.ensureLeagueBattleRoom(key);if(currentUser()?.id!==id||sequence!==generation)return;
   const {data:inviteId,error}=await client().rpc('send_topic_battle_invitation',{p_recipient_id:targetId,p_league:key,p_topic:window.LeagueArena.current()?.topic||window.learningTopic?.(key)||'part1'});
   if(currentUser()?.id!==id||sequence!==generation)return;if(error)throw error;if(!inviteId)throw new Error('Serwer nie potwierdził zaproszenia.');
   const sent={label:'Zaproszono ✓',until:Date.now()+20000};inviteStates.set(stateKey,sent);refreshRoster();
   picker.close();status('Zaproszenie do '+(profile?.display_name||'użytkownika')+' zapisane. Odbiorca zobaczy je przy dzwonku.');
   setTimeout(()=>{if(sequence===generation&&inviteStates.get(stateKey)===sent){inviteStates.delete(stateKey);refreshRoster();}},20000);
  }catch(error){if(sequence!==generation)return;inviteStates.delete(stateKey);refreshRoster();status(error.message||'Nie udało się wysłać zaproszenia.',true);}
 }
 async function respond(id,accept){
  const invite=invitations.find(x=>x.id===id),user=currentUser(),sequence=generation;if(!invite||!user||busy.has(id))return;
  if(Date.parse(invite.expires_at)<=Date.now()){render();return;}busy.add(id);errors.delete(id);render();
  try{
   if(accept){await window.ensureLeagueBattleRoom(invite.league||'english',invite.topic||'part1');}
   if(sequence!==generation||currentUser()?.id!==user.id)return;
   const {error}=await client().rpc('respond_english_battle_invitation',{p_invitation_id:id,p_accept:accept});if(sequence!==generation)return;if(error)throw error;
   handled.add(id);invitations=invitations.filter(x=>x.id!==id);if(accept){open=false;toast.hidden=true;window.closeCommunityChat?.();status('Dołączono do pokoju. Zaproszenie od '+invite.sender_name+' przyjęte.');}render();void poll();
  }catch(error){if(sequence===generation)errors.set(id,error.message||'Nie udało się dołączyć. Spróbuj ponownie.');}
  finally{if(sequence===generation){busy.delete(id);render();}}
 }
 bell.onclick=()=>{open=!open;render();if(open)void poll();};
 window.getBattleInvitations=()=>[...invitations];window.setBattleNotificationsOpen=value=>{open=!!value;render();};window.closeBattleNotifications=()=>{open=false;render();bell.focus();};
 window.refreshBattleNotifications=()=>{restart();void poll();};
 window.inviteLeagueBattleUser=inviteUser;window.respondEnglishBattleInvite=respond;window.refreshEnglishRoster=refreshRoster;
 window.addEventListener('ortoliga-auth-change',restart);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){restart();void poll();}});
 window.addEventListener('online',()=>{restart();void poll();});
 setInterval(()=>{restart();void poll();},4000);
 restart();
})();
/* Point award history, scoped to the selected league and authenticated profiles. */
(() => {
 let dialog,selectedId='',selectedName='',selectedLeague='',request=0;
 const A=()=>window.LeagueApp;
 const esc=value=>A().esc(value);
 function makeDialog(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='point-history-dialog';dialog.className='point-history-dialog';
  dialog.setAttribute('aria-labelledby','point-history-title');
  dialog.innerHTML='<form method="dialog"><button class="point-history-close" aria-label="Zamknij historię">×</button></form><h2 id="point-history-title"></h2><p>Ostatnie 30 zdarzeń zdobycia punktów</p><div class="point-history-leagues"></div><div class="point-history-content" aria-live="polite"></div>';
  document.body.append(dialog);
  dialog.addEventListener('close',()=>{request++;});
 }
 function localRows(key){
  if(key==='english')return (data.englishLeague?.scoreEvents||[]).map(e=>({points:e.delta,kind:e.kind||'answer',occurred_at:e.at}));
  const events=(data[key==='ortho'?'orthoBattle':'spanishLeague']?.events||[]).map(e=>({points:e.delta,kind:e.kind,occurred_at:e.at}));
  if(key==='ortho')events.push(...(data.sessions||[]).map(s=>({points:Math.max(0,Math.min(100,Math.round(Number(s.score)||0))),kind:'dictation',occurred_at:s.createdAt,earned_date:s.date})));
  return events;
 }
 function timeLabel(row){
  if(row.occurred_at){const d=new Date(row.occurred_at);if(!Number.isNaN(d.getTime()))return d.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'medium'});}
  if(row.earned_date && /^\d{4}-\d{2}-\d{2}$/.test(row.earned_date))return row.earned_date.split('-').reverse().join('.')+' · godzina niezapisana';
  return 'Starszy zapis · data i godzina niezapisane';
 }
 async function load(key){
  selectedLeague=key;const n=++request,viewer=A().user()?.id;
  const cfg=A().configs[key],root=dialog.querySelector('.point-history-content');
  document.getElementById('point-history-title').textContent='✨ '+selectedName+' · '+cfg.name;
  dialog.querySelector('.point-history-leagues').innerHTML=Object.entries(A().configs).map(([k,c])=>'<button type="button" data-history-league="'+k+'" aria-pressed="'+(k===key)+'">'+c.logo+' '+esc(c.name)+'</button>').join('');
  dialog.querySelectorAll('[data-history-league]').forEach(b=>b.onclick=()=>load(b.dataset.historyLeague));
  root.innerHTML='<p>Wczytuję historię…</p>';
  try{
   if(!viewer)throw new Error('auth');
   const {data:rows,error}=key==='helper'?await window.ortoligaSyncClient.from('helper_points').select('points,kind,occurred_at:created_at').eq('user_id',selectedId).order('created_at',{ascending:false}).limit(30):await window.ortoligaSyncClient.rpc('get_league_point_history',{p_user_id:selectedId,p_league:key});
   if(n!==request||A().user()?.id!==viewer)return;
   if(error)throw error;
   const history=key==='helper'?rows||[]:selectedId===viewer?localRows(key):rows||[];
   const entries=history.filter(r=>Number(r.points)>0).sort((a,b)=>String(b.occurred_at||b.earned_date||'').localeCompare(String(a.occurred_at||a.earned_date||''))).slice(0,30);
   const labels={reply:'Odpowiedź pomocnika',helpful:'Pomoc przyjęta',answer:'Trening',battle:'Bitwa',flash:'Fiszka',sentence:'Układanie zdań',dictation:'Dyktando'};
   root.innerHTML=entries.length?'<ol class="point-history-list">'+entries.map(r=>'<li><div><b>'+esc(labels[r.kind]||'Nauka')+'</b><small>'+esc(timeLabel(r))+'</small></div><strong>+'+Number(r.points).toLocaleString('pl-PL')+' '+cfg.unit+'</strong></li>').join('')+'</ol>':'<p>Brak zapisanych zdarzeń zdobycia punktów w tej lidze. Starsze punkty bez rejestru pozostają w rankingu.</p>';
  }catch{if(n===request)root.innerHTML='<p>Nie udało się pobrać historii.</p><button type="button" class="secondary">Spróbuj ponownie</button>';const retry=root.querySelector('button');if(retry)retry.onclick=()=>load(selectedLeague);}
 }
 window.openUserPointHistory=(id,name)=>{
  if(!A()?.user()){openSyncDialog();return;}
  makeDialog();selectedId=id;selectedName=name;
  if(!dialog.open)dialog.showModal();
  void load(A().configs[document.body.dataset.activeLeague]?document.body.dataset.activeLeague:'ortho');
 };
 window.addEventListener('ortoliga-auth-change',()=>{request++;if(dialog?.open)dialog.close();});
})();
