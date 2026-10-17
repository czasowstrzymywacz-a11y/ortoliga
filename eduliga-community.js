/* Shared compact inbox: public room, persistent private conversations and invitations. */
(() => {
 const hub=document.getElementById('sidebar-chat'),fab=document.getElementById('mobile-chat-button'),header=hub.querySelector('header');
 let tab='common',peer=null,owner=null,generation=0,channel=null,inbox=[],invites=[],sending=false,polling=false,threadVersion=0,commonUnread=0,helperRows=[],helperRead=new Set(),helperBusy=false,helperError='';
 const drafts=new Map(),seen=new Set(),client=()=>window.ortoligaSyncClient,user=()=>window.LeagueApp?.user();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const common=document.createElement('div');common.className='community-common';
 [...hub.children].filter(n=>n!==header).forEach(n=>common.append(n));
 header.querySelector('span').textContent='Rozmowy i powiadomienia';
 const tabs=document.createElement('nav');tabs.className='community-tabs';tabs.setAttribute('aria-label','Wybór rozmowy');
 const privatePane=document.createElement('section');privatePane.className='community-private';privatePane.hidden=true;
 const invitationPane=document.createElement('section');invitationPane.className='community-invitations';invitationPane.hidden=true;
 invitationPane.append(document.getElementById('battle-invite-notifications'));
 const helperPane=document.createElement('section');helperPane.className='community-helper';helperPane.hidden=true;const suggestionPane=document.createElement('section');suggestionPane.className='community-suggestions';suggestionPane.hidden=true;hub.append(tabs,common,privatePane,invitationPane,helperPane,suggestionPane);
 const opened=()=>document.body.classList.contains('mobile-chat-open');
 function profiles(){return typeof studentRoster==='undefined'?[]:studentRoster;}
 function peerName(id){return profiles().find(p=>p.user_id===id)?.display_name||'Użytkownik';}
 function unread(){return inbox.reduce((sum,x)=>sum+Number(x.unread||0),0);}
 function badge(n){return n?'<b class="inbox-count">'+n+'</b>':'';}
 function paintIcon(){hub.classList.toggle('community-signed-in',!!user());
  const hn=helperUnread(),sn=window.EduSuggestions?.count()||0,n=unread()+commonUnread+invites.length+hn+sn,kind=invites.length?'battle':sn?'idea':hn?'helper':unread()+commonUnread?'message':'none';
  fab.dataset.noticeKind=kind;fab.classList.toggle('has-notice',n>0);
  fab.innerHTML='<span aria-hidden="true">'+(opened()?'×':kind==='battle'?'⚔️':kind==='idea'?'💡':kind==='helper'?'🤝':kind==='message'?'✉️':'💬')+'</span>'+badge(n)+'<i class="community-notice-marks">'+(invites.length?'<em>⚔️</em>':'')+(hn?'<em>🤝</em>':'')+(sn?'<em>💡</em>':'')+(unread()+commonUnread?'<em>✉️</em>':'')+'</i>';
  fab.setAttribute('aria-label',(opened()?'Zamknij':'Otwórz')+' rozmowy i powiadomienia'+(n?' · '+n+' nowych':''));
  fab.setAttribute('aria-expanded',String(opened()));
  tabs.innerHTML='<button data-community-tab="common" aria-pressed="'+(tab==='common')+'">Wspólny '+badge(commonUnread)+'</button><button data-community-tab="private" aria-pressed="'+(tab==='private')+'">Prywatne '+badge(unread())+'</button><button data-community-tab="invites" aria-pressed="'+(tab==='invites')+'">⚔️ '+badge(invites.length)+'<span class="sr-only">Zaproszenia</span></button><button data-community-tab="helper" aria-pressed="'+(tab==='helper')+'">🤝 '+badge(hn)+'<span class="sr-only">Prośby o pomoc</span></button><button data-community-tab="suggestions" aria-pressed="'+(tab==='suggestions')+'">💡 Pomysły '+badge(sn)+'</button>';
  tabs.querySelectorAll('[data-community-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.communityTab));
 }
 function helperUnread(){return helperRows.filter(t=>t.author_id!==owner&&!helperRead.has(t.id)).length;}
 function renderHelper(mark=false){
  if(mark&&owner){for(const t of helperRows)helperRead.add(t.id);try{localStorage.setItem('eduliga-helper-read:'+owner,JSON.stringify([...helperRead].slice(-500)));}catch{}}
  helperPane.innerHTML=!owner?'<p>Zaloguj się, aby zobaczyć prośby o pomoc.</p>':'<p class="community-note">🤝 Ostatnie prośby z Ligi Pomocnika</p>'+(helperError?'<p role="status">'+esc(helperError)+'</p>':'')+(helperRows.length?helperRows.map(t=>'<article class="helper-notification"><small>'+esc(t.subject)+' · '+esc(peerName(t.author_id))+' · '+new Date(t.created_at).toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'})+'</small><b>'+esc(t.title)+'</b><button type="button" class="secondary" data-open-helper="'+esc(t.id)+'">Zobacz pytanie →</button></article>').join(''):'<p>Nie ma nowych próśb. Gdy ktoś poprosi o pomoc, pojawi się tutaj.</p>');
  helperPane.querySelectorAll('[data-open-helper]').forEach(b=>b.onclick=()=>{setOpen(false);window.openHelperTopic?.(b.dataset.openHelper);});
 }
 async function loadHelper(){
  if(helperBusy||!owner||!client()||document.hidden)return;helperBusy=true;const account=owner,seq=generation;
  try{const {data:rows,error}=await client().from('helper_topics').select('id,author_id,subject,title,created_at').is('removed_at',null).is('solved_reply_id',null).order('created_at',{ascending:false}).limit(50);if(seq!==generation||account!==owner)return;if(error)throw error;helperRows=rows||[];helperError='';if(opened()&&tab==='helper')renderHelper(true);paintIcon();}
  catch{if(seq===generation){helperError='Nie udało się odświeżyć próśb. Spróbuję ponownie.';if(opened()&&tab==='helper')renderHelper();}}
  finally{if(seq===generation)helperBusy=false;}
 }
 function rememberDraft(){const input=privatePane.querySelector('textarea');if(input&&peer)drafts.set(owner+':'+(input.dataset.peer||peer),input.value);}
 function setOpen(value){
  if(!value)rememberDraft();document.body.classList.toggle('mobile-chat-open',value);
  if(value){void loadInbox();void loadHelper();if(tab==='suggestions')window.EduSuggestions?.open();if(tab==='helper')renderHelper(true);if(tab==='common'){commonUnread=0;void window.refreshClassChatMessages?.();setTimeout(()=>{const box=document.getElementById('chat-messages');box.scrollTop=box.scrollHeight;},80);}if(tab==='private'&&peer)void loadThread();}
  window.setBattleNotificationsOpen?.(value&&tab==='invites');paintIcon();if(!value)fab.focus({preventScroll:true});
 }
 function selectTab(next){
  rememberDraft();tab=next;if(next==='common'&&opened())commonUnread=0;common.hidden=next!=='common';privatePane.hidden=next!=='private';invitationPane.hidden=next!=='invites';helperPane.hidden=next!=='helper';suggestionPane.hidden=next!=='suggestions';if(next==='suggestions')window.EduSuggestions?.open();if(next==='helper'){renderHelper(opened());void loadHelper();}
  window.setBattleNotificationsOpen?.(opened()&&next==='invites');
  if(next==='private'){if(peer)renderThread();else renderPeople();}if(next==='common')void window.refreshClassChatMessages?.();paintIcon();
 }
 function inviteCards(id){
  return invites.filter(i=>i.sender_id===id).map(i=>'<article class="private-invite"><b>⚔️ Zaproszenie · '+esc(window.LeagueApp.configs[i.league||'english'].name)+'</b><small>Ważne do '+new Date(i.expires_at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+'</small><button class="primary" type="button" data-accept-invite="'+i.id+'">Dołącz do bitwy →</button></article>').join('');
 }
 function bindInvites(){privatePane.querySelectorAll('[data-accept-invite]').forEach(b=>b.onclick=async()=>{b.disabled=true;await window.respondEnglishBattleInvite(b.dataset.acceptInvite,true);b.disabled=false;});}
 function renderPeople(){
  if(!user()){privatePane.innerHTML='<p>Zaloguj się, aby prowadzić prywatne rozmowy.</p>';return;}
  const ids=new Set([...profiles().filter(p=>p.user_id!==owner).map(p=>p.user_id),...inbox.map(x=>x.user_id),...invites.map(x=>x.sender_id)]);
  const online=typeof currentPresenceIds==='function'?currentPresenceIds():new Set();
  const people=[...ids].filter(id=>id!==owner).sort((a,b)=>(Number(inbox.find(x=>x.user_id===b)?.unread)||0)-(Number(inbox.find(x=>x.user_id===a)?.unread)||0)||peerName(a).localeCompare(peerName(b),'pl'));
  privatePane.innerHTML='<p class="community-note">Wybierz osobę. Wiadomość dotrze także, gdy jest nieaktywna.</p><div class="private-people">'+people.map(id=>'<button type="button" data-chat-peer="'+id+'"><i class="presence-dot '+(online.has(id)?'online':'')+'"></i><span>'+esc(peerName(id))+'</span>'+badge(Number(inbox.find(x=>x.user_id===id)?.unread||0))+(invites.some(i=>i.sender_id===id)?'<small>⚔️</small>':'')+'</button>').join('')+'</div>';
  privatePane.querySelectorAll('[data-chat-peer]').forEach(b=>b.onclick=()=>{peer=b.dataset.chatPeer;renderThread();});
 }
 function renderThread(){
  if(!peer){renderPeople();return;}rememberDraft();threadVersion++;
  privatePane.innerHTML='<div class="private-thread-head"><button type="button" class="private-back" aria-label="Wróć do listy osób">←</button><b>'+esc(peerName(peer))+'</b><small>Tylko Wy dwoje</small></div><div class="private-thread-invites">'+inviteCards(peer)+'</div><div class="private-messages" role="log" aria-live="polite"><p>Wczytuję rozmowę…</p></div><form class="private-compose"><textarea maxlength="240" rows="1" aria-label="Prywatna wiadomość" placeholder="Napisz wiadomość…"></textarea><button type="submit" aria-label="Wyślij prywatną wiadomość">➤</button></form><p class="private-chat-status" role="status"></p>';
  privatePane.querySelector('textarea').dataset.peer=peer;privatePane.querySelector('textarea').value=drafts.get(owner+':'+peer)||'';
  privatePane.querySelector('.private-back').onclick=()=>{rememberDraft();peer=null;renderPeople();};
  privatePane.querySelector('form').onsubmit=sendMessage;bindInvites();void loadThread();
 }
 async function loadThread(){
  if(!peer||!owner||!client())return;const id=peer,request=threadVersion,account=owner;
  const box=privatePane.querySelector('.private-messages');if(!box)return;
  try{
   const {data:rows,error}=await client().from('private_chat_messages').select('id,sender_id,recipient_id,body,created_at,read_at').or('and(sender_id.eq.'+account+',recipient_id.eq.'+id+'),and(sender_id.eq.'+id+',recipient_id.eq.'+account+')').order('created_at',{ascending:false}).limit(60);
   if(owner!==account||peer!==id||threadVersion!==request)return;if(error)throw error;
   const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<60||box.querySelector('p');
   const text=(rows||[]).reverse().map(m=>'<article class="private-message '+(m.sender_id===account?'mine':'')+'"><span>'+esc(m.body)+'</span><small>'+new Date(m.created_at).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+(m.sender_id===account?(m.read_at?' · Odczytano':' · Wysłano'):'')+'</small></article>').join('')||'<p>To początek Waszej rozmowy.</p>';
   if(box.innerHTML!==text){box.innerHTML=text;if(nearBottom)box.scrollTop=box.scrollHeight;}
   if(opened()&&tab==='private'){const marked=await client().rpc('read_private_chat',{p_other_id:id});if(marked.error)throw marked.error;if(owner===account){const item=inbox.find(x=>x.user_id===id);if(item)item.unread=0;paintIcon();}}
  }catch{if(owner===account&&peer===id){const status=privatePane.querySelector('.private-chat-status');if(status)status.textContent='Nie udało się wczytać rozmowy. Ponawiam połączenie.';}}
 }
 async function sendMessage(event){
  event.preventDefault();if(sending||!owner||!peer)return;
  const input=privatePane.querySelector('textarea'),button=privatePane.querySelector('button[type=submit]'),body=input.value.trim(),account=owner,id=peer;
  if(!body)return;sending=true;button.disabled=true;
  try{
   const {error}=await client().rpc('send_private_chat_message',{p_recipient_id:id,p_body:body});if(error)throw error;
   if(owner===account&&peer===id){input.value='';drafts.delete(account+':'+id);privatePane.querySelector('.private-chat-status').textContent='Wysłano. Odbiorca przeczyta po wejściu do aplikacji.';await loadThread();}void loadInbox();
  }catch(error){if(owner===account&&peer===id)privatePane.querySelector('.private-chat-status').textContent=error.message||'Nie udało się wysłać wiadomości.';}
  finally{sending=false;button.disabled=false;}
 }
 async function loadInbox(){
  if(polling||!owner||!client()||document.hidden)return;polling=true;const account=owner,seq=generation;
  try{const {data:rows,error}=await client().rpc('get_private_chat_inbox');if(seq!==generation||owner!==account)return;if(error)throw error;inbox=rows||[];paintIcon();if(opened()&&tab==='private'){if(peer)void loadThread();else renderPeople();}}
  catch{if(opened()&&tab==='private'&&!peer)privatePane.innerHTML='<p>Nie udało się pobrać rozmów. Spróbuj ponownie za chwilę.</p>';}
  finally{if(seq===generation)polling=false;}
 }
 function restart(){
  const next=user()?.id||null;if(next===owner&&(channel||!next))return;
  rememberDraft();privatePane.replaceChildren();generation++;owner=next;threadVersion++;inbox=[];peer=null;polling=false;commonUnread=0;seen.clear();helperRows=[];helperBusy=false;helperError='';try{helperRead=new Set(JSON.parse(localStorage.getItem('eduliga-helper-read:'+owner)||'[]'));}catch{helperRead=new Set();}
  renderHelper(false);if(tab==='private')renderPeople();const old=channel;channel=null;if(old)void client()?.removeChannel(old);paintIcon();
  if(!owner||!client())return;
  const seq=generation;channel=client().channel('private-inbox:'+owner);
  const changed=()=>{if(seq!==generation)return;void loadInbox();if(opened()&&peer)void loadThread();};
  channel.on('postgres_changes',{event:'*',schema:'public',table:'private_chat_messages',filter:'recipient_id=eq.'+owner},changed).on('postgres_changes',{event:'*',schema:'public',table:'private_chat_messages',filter:'sender_id=eq.'+owner},changed).subscribe(status=>{if(status==='SUBSCRIBED')changed();});
  void loadInbox();void loadHelper();
 }
 fab.onclick=()=>{if(!opened()&&(invites.length||window.EduSuggestions?.count()||helperUnread()||unread()||commonUnread)){tab=invites.length?'invites':window.EduSuggestions?.count()?'suggestions':helperUnread()?'helper':unread()?'private':'common';peer=null;selectTab(tab);}setOpen(!opened());};
 header.querySelector('.mobile-chat-close').onclick=()=>setOpen(false);
 window.addEventListener('eduliga-invitations',event=>{
  invites=event.detail.invitations||[];paintIcon();
  if(opened()&&tab==='private'&&peer){const box=privatePane.querySelector('.private-thread-invites');if(box){box.innerHTML=inviteCards(peer);bindInvites();}}
 });
 window.addEventListener('eduliga-common-message',event=>{if(event.detail?.sender_id!==owner&&!(opened()&&tab==='common'))commonUnread++;paintIcon();});window.addEventListener('ortoliga-auth-change',restart);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){restart();void loadInbox();}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&opened())setOpen(false);});
 setInterval(()=>{restart();void loadInbox();void loadHelper();},5000);
 window.addEventListener('eduliga-helper-posted',()=>void loadHelper());
 new MutationObserver(paintIcon).observe(document.body,{attributes:true,attributeFilter:['class']});
 window.EduSuggestions?.mount(suggestionPane,paintIcon);setInterval(()=>void window.EduSuggestions?.load(),15000);invites=window.getBattleInvitations?.()||[];selectTab('common');restart();
})();