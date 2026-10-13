/* English league roster actions and recipient-only invitation notifications. */
(() => {
  const currentUser=()=>typeof syncUser!=='undefined'?syncUser:window.ortoligaSyncUser;
  const client=()=>window.ortoligaSyncClient;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const inviteStates=new Map();window.englishInviteStates=inviteStates;
  let generation=0,owner=null,channel=null,pollTimer=null,expiryTimer=null,statusTimer=null,polling=false;
  let invitations=[],busy=new Set(),errors=new Map(),handled=new Set();
  function refreshRoster(){if(typeof renderStudentRoster==='function')renderStudentRoster();}
  function status(message,error=false){const el=document.getElementById('battle-invite-status');if(!el)return;clearTimeout(statusTimer);el.hidden=!message;el.textContent=message;el.classList.toggle('error',error);if(message)statusTimer=setTimeout(()=>el.hidden=true,error?12000:8000);}
  function renderInvitations(){
    const root=document.getElementById('battle-invite-notifications');if(!root)return;
    clearTimeout(expiryTimer);invitations=invitations.filter(x=>Date.parse(x.expires_at)>Date.now());
    root.hidden=!invitations.length;
    root.innerHTML=invitations.slice(0,3).map(invite=>`<article class="battle-invite-card"><span class="invite-icon" aria-hidden="true">⚔️</span><div><h2>${escape(invite.sender_name)} zaprasza Cię do bitwy</h2><p>Dołącz do wspólnego pokoju Ligi Angielskiej.</p><small>Zaproszenie jest ważne przez 2 minuty.</small>${errors.has(invite.id)?`<p class="invite-error">${escape(errors.get(invite.id))}</p>`:''}<div class="invite-card-actions"><button class="primary" type="button" onclick="respondEnglishBattleInvite('${invite.id}',true)" ${busy.has(invite.id)?'disabled':''}>${busy.has(invite.id)?'Chwileczkę…':'Dołącz do bitwy →'}</button><button class="secondary" type="button" onclick="respondEnglishBattleInvite('${invite.id}',false)" ${busy.has(invite.id)?'disabled':''}>Nie teraz</button></div></div></article>`).join('');
    if(invitations.length)expiryTimer=setTimeout(renderInvitations,Math.max(100,Math.min(...invitations.map(x=>Date.parse(x.expires_at)-Date.now()))+50));
  }
  async function poll(){
    if(!owner||polling||!client())return;polling=true;const sequence=generation,id=owner;
    try{const {data:rows,error}=await client().rpc('get_english_battle_invitations');if(sequence!==generation||currentUser()?.id!==id)return;if(error)throw error;invitations=(rows||[]).filter(x=>x.room_name==='liga-angielska-open-room'&&!handled.has(x.id));renderInvitations();}
    catch(error){if(sequence===generation)console.warn('Battle invitations unavailable',error.message);}
    finally{if(sequence===generation)polling=false;}
  }
  function restart(){
    const user=currentUser(),nextOwner=user?.id||null;if(nextOwner===owner)return;
    generation++;owner=nextOwner;clearInterval(pollTimer);clearTimeout(expiryTimer);polling=false;
    const old=channel;channel=null;if(old)void client()?.removeChannel(old);
    invitations=[];busy=new Set();errors=new Map();handled=new Set();inviteStates.clear();status('');renderInvitations();refreshRoster();
    if(!owner||!client())return;
    const sequence=generation,id=owner,localChannel=client().channel('english-invitations:'+id);
    channel=localChannel;localChannel.on('postgres_changes',{event:'*',schema:'public',table:'english_battle_invitations',filter:'recipient_id=eq.'+id},()=>{if(sequence===generation)void poll();}).subscribe(state=>{if(state==='SUBSCRIBED'&&sequence===generation)void poll();});
    pollTimer=setInterval(()=>void poll(),10000);void poll();
  }
  async function inviteUser(targetId){
    const user=currentUser();if(!user){openSyncDialog();return;}if(!targetId||targetId===user.id)return;
    const previous=inviteStates.get(targetId);if(previous&&previous.until>Date.now())return;
    const id=user.id,sequence=generation,profile=typeof studentRoster!=='undefined'?studentRoster.find(x=>x.user_id===targetId):null;
    inviteStates.set(targetId,{label:'Łączenie…',until:Infinity});refreshRoster();status('Wchodzę do pokoju bitew…');
    try{
      await window.ensureEnglishBattleRoom();if(currentUser()?.id!==id||sequence!==generation)return;
      status('Wysyłam zaproszenie…');
      const {error}=await client().rpc('send_english_battle_invitation',{p_recipient_id:targetId});
      if(currentUser()?.id!==id||sequence!==generation)return;if(error)throw error;
      const sentState={label:'Zaproszono ✓',until:Date.now()+20000};inviteStates.set(targetId,sentState);refreshRoster();
      status('Zaproszenie do '+(profile?.display_name||'użytkownika')+' wysłane. Czekasz we wspólnym pokoju.');
      setTimeout(()=>{if(sequence===generation&&inviteStates.get(targetId)===sentState){inviteStates.delete(targetId);refreshRoster();}},20000);
    }catch(error){if(sequence!==generation)return;inviteStates.delete(targetId);refreshRoster();status(error.message||'Nie udało się wysłać zaproszenia. Spróbuj ponownie.',true);}
  }
  async function respond(invitationId,accept){
    const invite=invitations.find(x=>x.id===invitationId),user=currentUser(),sequence=generation;
    if(!invite||!user||busy.has(invitationId))return;
    if(Date.parse(invite.expires_at)<=Date.now()){renderInvitations();return;}
    busy.add(invitationId);errors.delete(invitationId);renderInvitations();
    try{
      if(accept)await window.ensureEnglishBattleRoom();
      if(sequence!==generation||currentUser()?.id!==user.id)return;
      const {error}=await client().rpc('respond_english_battle_invitation',{p_invitation_id:invitationId,p_accept:accept});
      if(sequence!==generation)return;if(error)throw error;
      handled.add(invitationId);invitations=invitations.filter(x=>x.id!==invitationId);renderInvitations();
      if(accept)status('Dołączono do pokoju bitew. Zaproszenie od '+invite.sender_name+' przyjęte.');
      void poll();
    }catch(error){if(sequence===generation){errors.set(invitationId,error.message||'Nie udało się dołączyć. Spróbuj ponownie.');}}
    finally{if(sequence===generation){busy.delete(invitationId);renderInvitations();}}
  }
  window.inviteEnglishBattleUser=inviteUser;window.respondEnglishBattleInvite=respond;
  window.refreshEnglishRoster=refreshRoster;
  window.addEventListener('ortoliga-auth-change',restart);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){restart();void poll();if(typeof loadStudentRoster==='function')void loadStudentRoster();}});
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
   const {data:rows,error}=await window.ortoligaSyncClient.rpc('get_league_point_history',{p_user_id:selectedId,p_league:key});
   if(n!==request||A().user()?.id!==viewer)return;
   if(error)throw error;
   const history=selectedId===viewer?localRows(key):rows||[];
   const entries=history.filter(r=>Number(r.points)>0).sort((a,b)=>String(b.occurred_at||b.earned_date||'').localeCompare(String(a.occurred_at||a.earned_date||''))).slice(0,30);
   const labels={answer:'Trening',battle:'Bitwa',flash:'Fiszka',sentence:'Układanie zdań',dictation:'Dyktando'};
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
