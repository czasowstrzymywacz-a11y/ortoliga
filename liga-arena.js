/* Three battle rooms: shared countdown, visible totals, late joins and idempotent awards. */
(() => {
 const A=LeagueApp,boards={ortho:'arena-ortho',english:'arena-english',spanish:'arena-spanish'};
 let room=null,channel=null,timer=null,stateTimer=null,tickTimer=null,lastSpoken=null;
 const uid=()=>A.user()?.id,name=()=>A.user()?.user_metadata?.display_name||'Zawodnik';
 const shuffle=list=>[...list].sort(()=>Math.random()-.5);
 function orthoTasks(){
  const extra=[{word:'historii',example:'Opowiadamy o historii miasta.'},{word:'lekcji',example:'Po lekcji wracamy do domu.'},{word:'nadziei',example:'Nie tracimy nadziei.'}];
  return [...BANK,...extra].flatMap((entry,index)=>{
   const word=entry.word.toLocaleLowerCase('pl'),patterns=[[/rz|ż/g,['rz','ż']],[/ch|h/g,['ch','h']],[/ó|u/g,['ó','u']],[/(?:ii|ji|i)$/g,['ii','ji','i']],[/ą/g,['ą','om','on']],[/ę/g,['ę','em','en']],[/ń/g,['ń','ni']]];
   return patterns.flatMap(([pattern,options],p)=>{const match=pattern.exec(word);if(!match)return [];
    const prompt=word.slice(0,match.index)+'▢'+word.slice(match.index+match[0].length),sentence=entry.example||'W zdaniu pojawia się słowo '+word+'.';
    return [{id:'ortho-'+index+'-'+p,word,prompt,wants:[match[0]],options,sentence,context:sentence.replace(new RegExp(word,'gi'),prompt)}];
   });
  });
 }
 const ortho=orthoTasks();
 function validTask(key,t){
  if(!t)return null;if(key==='ortho')return ortho.find(x=>x.id===t.id)||null;
  if(key==='spanish'){const w=SPANISH_WORDS.find(w=>w.id===t.id);return w?{id:w.id,word:w.id,prompt:w.pl,wants:[w.es]}:null;}
  const v=window.ENGLISH_VERBS.find(v=>v.id===t.id),m=t.mode;
  if(!v||!['pl-to-pair','base-to-past','past-to-base','en-to-pl'].includes(m))return null;
  return {id:v.id,word:v.id,mode:m,prompt:m==='pl-to-pair'?v.pl:m==='base-to-past'?v.base:m==='past-to-base'?v.past:v.base+' · '+v.past,wants:m==='pl-to-pair'?[v.base,v.past]:m==='base-to-past'?[v.past]:m==='past-to-base'?[v.base]:[v.pl]};
 }
 function taskFor(key){
  if(key==='ortho')return ortho[Math.floor(Math.random()*ortho.length)];
  if(key==='spanish')return validTask(key,{id:SPANISH_WORDS[Math.floor(Math.random()*SPANISH_WORDS.length)].id});
  const pool=window.getEnglishVocabulary?.()||window.ENGLISH_VERBS,v=pool[Math.floor(Math.random()*pool.length)],modes=/[\s/()]/.test(v.pl)?['pl-to-pair','base-to-past','past-to-base']:['pl-to-pair','base-to-past','past-to-base','en-to-pl'];
  return validTask(key,{id:v.id,mode:modes[Math.floor(Math.random()*modes.length)]});
 }
 function correctness(key,t,answers){return t.wants.map((want,i)=>key==='spanish'?window.spanishAnswerCorrect(answers[i],want):key==='english'?window.englishAnswerCorrect(answers[i],want,t.mode):answers[i]===want);}
 const emit=p=>channel?.send({type:'broadcast',event:'arena',payload:{...p,sender:uid(),sentAt:Date.now()}});
 const root=()=>room?document.getElementById(boards[room.league]):null;
 const offset=()=>room?.host===uid()?0:room?.clockOffset||0;
 function leave(){
  clearTimeout(timer);clearInterval(stateTimer);clearInterval(tickTimer);window.speechSynthesis?.cancel();
  const old=channel;channel=null;room=null;if(old)void window.ortoligaSyncClient?.removeChannel(old);
  for(const id of Object.values(boards))document.getElementById(id)?.replaceChildren();
 }
 function lobby(key){
  const node=document.getElementById(boards[key]);if(!node)return;if(room?.league===key){render();return;}
  node.innerHTML='<h2>⚔️ Bitwa · '+A.esc(A.configs[key].name)+'</h2><p>10 rund, 30 sekund na rundę. Start z drugim graczem, kolejni mogą dołączyć w trakcie.</p><p>Poprawna odpowiedź: 1. miejsce 20, 2. 15, 3. 10, kolejne 5 '+A.configs[key].unit+'. Pierwszy dostaje bonus za czas do 20 punktów. „Nie wiem” lub brak odpowiedzi: −5 punktów.</p><button class="primary" onclick="joinLeagueBattle(\''+key+'\')">'+(uid()?'Wejdź jako '+A.esc(name()):'Zaloguj się i wejdź')+' →</button><button class="secondary arena-invite-button" onclick="openBattleInvitePicker(\''+key+'\')">👥 Zaproś</button><div class="arena-status" role="status"></div>';
 }
 function state(){return {league:room.league,phase:room.phase,match:room.match,round:room.round,task:room.task,startAt:room.startAt,roster:room.roster,answers:room.answers,results:room.results,scores:room.scores,names:room.names,starts:room.starts,revision:room.revision};}
 function presenceChanged(ch,owner){
const players={};
   for(const entries of Object.values(ch.presenceState()))for(const p of entries)if(p.id)players[p.id]=p;
   room.players=players;room.connected=!!players[owner];const previousHost=room.host;
   room.host=Object.values(players).sort((a,b)=>a.joined-b.joined||a.id.localeCompare(b.id))[0]?.id;
   if(previousHost&&previousHost!==owner&&room.host===owner&&room.phase==='question'){const delta=room.clockOffset||0;room.startAt+=delta;for(const id of Object.keys(room.starts))room.starts[id]+=delta;room.clockOffset=0;room.revision++;emit({kind:'state',state:state()});}for(const p of Object.values(players))room.names[p.id]=p.id===owner?name():p.name;
   if(room.phase==='lobby'&&room.host===owner&&Object.keys(players).length>=2)next();
   if(room.host===owner&&room.phase==='question'){
    const newcomers=Object.keys(players).filter(id=>!room.roster.includes(id));
    if(newcomers.length&&room.startAt+30000-Date.now()>5000){for(const id of newcomers){room.roster.push(id);room.starts[id]=Date.now()+500;room.scores[id]??=0;}room.revision++;emit({kind:'state',state:state()});}
    schedule();if(room.roster.every(id=>room.answers[id]||!players[id]))settle();
   }
   if(room.host!==owner)emit({kind:'state-request'});
   if(room.phase==='question'&&root()?.querySelector('.arena-form'))renderProgress();else render();

 }
 function join(key){
  if(!A.configs[key])return;if(!uid()){openSyncDialog();return;}
  if(!syncReady){lobby(key);document.querySelector('#'+boards[key]+' .arena-status').textContent='Pobieram Twoje postępy. Spróbuj za chwilę.';return;}
  if(room?.league===key&&room.owner===uid())return;leave();
  const owner=uid(),ch=window.ortoligaSyncClient.channel('liga-v063-'+key+'-'+(window.learningTopic?.(key)||'part1'),{config:{presence:{key:owner},broadcast:{ack:true}}});channel=ch;
  room={league:key,owner,joined:Date.now(),players:{},host:null,connected:false,phase:'lobby',match:null,round:0,task:null,startAt:0,roster:[],answers:{},results:{},scores:{},names:{},starts:{},revision:0,answered:false,localAnswer:null,clockOffset:0};
  const active=()=>channel===ch&&room?.owner===owner&&uid()===owner;
  ch.on('presence',{event:'sync'},()=>{if(active())presenceChanged(ch,owner);
  }).on('broadcast',{event:'arena'},({payload})=>{if(active())receive(payload);}).subscribe(async status=>{
   if(!active())return;
   if(status==='SUBSCRIBED'){await ch.track({id:owner,name:name(),joined:room.joined});if(active())emit({kind:'state-request'});}
   else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){leave();lobby(key);document.querySelector('#'+boards[key]+' .arena-status').textContent='Połączenie przerwane. Wejdź ponownie.';}
  });
  stateTimer=setInterval(()=>{if(!active())return;if(room.host!==owner){emit({kind:'state-request'});if(room.phase==='question'&&room.localAnswer&&!room.answers[owner])emit(room.localAnswer);}},4000);render();
 }
 function next(newMatch=false){
  if(!room||room.host!==uid()||Object.keys(room.players).length<2||room.phase==='question')return;
  if(!room.match||newMatch){room.match=crypto.randomUUID();room.round=0;room.results={};room.scores={};}
  if(room.round>=10)return;room.round++;room.task=taskFor(room.league);room.roster=Object.keys(room.players);room.answers={};room.answered=false;room.localAnswer=null;room.phase='question';room.startAt=Date.now()+1200;room.clockOffset=0;room.starts=Object.fromEntries(room.roster.map(id=>[id,room.startAt]));room.revision++;
  for(const p of Object.values(room.players))room.names[p.id]=p.name;
  emit({kind:'state',state:state()});schedule();render();
 }
 function requestNext(){if(!room)return;if(room.host===uid())next(room.round>=10);else emit({kind:'next',newMatch:room.round>=10});}
 function receive(p){
  if(!room||!p||!room.players[p.sender])return;
  if(p.kind==='state-request'&&room.host===uid()){emit({kind:'state',state:state(),target:p.sender});return;}
  if(p.kind==='next'&&room.host===uid()&&room.phase==='results'){next(!!p.newMatch);return;}
  if(p.kind==='state'&&p.sender===room.host&&(!p.target||p.target===uid())){
   const s=p.state;
   if(!s||s.league!==room.league||!Number.isInteger(s.round)||s.round<0||s.round>10||!['lobby','question','results'].includes(s.phase)||!Array.isArray(s.roster)||!s.answers||!s.results||!s.scores||!s.names)return;
   if(room.match===s.match&&(room.round>s.round||(Number(s.revision)||0)<room.revision))return;
   const task=s.task?validTask(room.league,s.task):null;if(s.phase==='question'&&(!task||!Number.isFinite(s.startAt)))return;
   const same=room.match===s.match&&room.round===s.round,answered=same&&room.answered,localAnswer=same?room.localAnswer:null;
   Object.assign(room,s,{task,starts:s.starts||{},localAnswer});if(Number.isFinite(p.sentAt))room.clockOffset=Date.now()-p.sentAt;
   room.answered=answered||!!room.answers[uid()];
   if(room.phase==='results')award();else schedule();
   if(same&&room.phase==='question'&&root()?.querySelector('.arena-form'))renderProgress();else render();return;
  }
  if(p.kind==='answer'&&room.host===uid()&&room.phase==='question'&&p.match===room.match&&p.round===room.round&&room.roster.includes(p.sender)&&!room.answers[p.sender]){
   room.answers[p.sender]={answers:Array.isArray(p.answers)?p.answers.map(a=>String(a).slice(0,160)):[],elapsed:Math.max(0,Math.min(30000,Date.now()-(room.starts[p.sender]||room.startAt))),skipped:!!p.skipped};room.revision++;
   if(room.roster.every(id=>room.answers[id]||!room.players[id]))settle();else {emit({kind:'state',state:state()});renderProgress();}
  }
 }
 function schedule(){
  clearTimeout(timer);if(!room||room.phase!=='question')return;
  timer=setTimeout(()=>{if(!room||room.phase!=='question')return;if(room.host===uid())settle();else if(room.roster.includes(uid())&&!room.answered)answer([],true);},Math.max(0,room.startAt+30000+offset()-Date.now()));
 }
 function answer(answers,skipped=false){
  if(!room||room.phase!=='question'||room.answered||!room.roster.includes(uid())||Date.now()<(room.starts[uid()]||room.startAt)+offset())return;
  room.answered=true;const correct=correctness(room.league,room.task,answers),node=root()?.querySelector('.arena-feedback');
  if(node)node.innerHTML=skipped?'<p class="answer-feedback bad">Poprawnie: <b>'+room.task.wants.map(A.esc).join(' · ')+'</b> · −5 pkt.</p>':correct.every(Boolean)?'<p class="answer-feedback good">✓ Brawo! Punkty pojawią się po rundzie.</p>':'<p class="answer-feedback bad">Poprawnie: <b>'+room.task.wants.map(A.esc).join(' · ')+'</b> · −5 za każde błędne pole.</p>';
  correct.forEach((ok,i)=>{if(ok)window.celebrateAnswer?.(document.getElementById('arena-answer-'+i)||node);});
  root()?.querySelectorAll('.arena-answer,.arena-choice,.arena-skip,button[type=submit]').forEach(x=>x.disabled=true);
  const payload={kind:'answer',match:room.match,round:room.round,answers,skipped,sender:uid()};room.localAnswer=payload;emit(payload);if(room.host===uid())receive(payload);
 }
 function settle(){
  if(!room||room.host!==uid()||room.phase!=='question')return;clearTimeout(timer);
  const rows=room.roster.map(id=>{const a=room.answers[id]||{answers:[],elapsed:30000,skipped:true};return {id,name:room.names[id]||'Zawodnik',...a,correct:correctness(room.league,room.task,a.answers)};});
  const ranked=rows.filter(r=>r.correct.some(Boolean)).sort((a,b)=>a.elapsed-b.elapsed||a.id.localeCompare(b.id));
  const summary=rows.map(r=>{const place=ranked.findIndex(x=>x.id===r.id),bonus=place===0&&ranked.length>1?Math.max(0,Math.min(20,Math.round((ranked[1].elapsed-r.elapsed)/1000))):0,hits=r.correct.filter(Boolean).length,points=r.skipped?-5:hits*(place<0?0:[20,15,10][place]||5)+bonus-(r.correct.length-hits)*5;room.scores[r.id]=(room.scores[r.id]||0)+points;return {...r,place:place<0?null:place+1,bonus,points};});
  room.results[room.round]=summary;room.phase='results';room.revision++;emit({kind:'state',state:state()});award();render();
 }
 function award(){
  if(!room||!room.roster.includes(uid()))return;
  const mine=room.results[room.round]?.find(r=>r.id===uid());if(!mine)return;const id=room.match+':'+room.round,win=room.round===10&&room.scores[uid()]===Math.max(...Object.values(room.scores));
  if(room.league==='english')window.awardEnglishArena?.({id,task:room.task,answers:mine.answers,correct:mine.correct,points:mine.points,final:room.round===10,win});
  else {A.record(room.league,{id,kind:'battle',word:room.task.word,ok:mine.correct.every(Boolean),delta:mine.points});if(room.round===10)A.record(room.league,{id:room.match+':match',kind:'match',win,delta:0});}
 }
 function englishBoard(t){
  const v=window.ENGLISH_VERBS.find(v=>v.id===t.id);
  return '<div class="english-prompt"><span>Uzupełnij luki</span><button type="button" class="english-speak" aria-label="Odtwórz podane słowa" onclick="speakEnglishQuestion('+v.id+',\''+t.mode+'\')">🔊</button></div>'+window.englishQuestionBoard(v,t.mode).replace(/class="english-answer /g,'class="arena-answer english-answer ').replace(/data-answer="(\d+)"/g,'id="arena-answer-$1" data-answer="$1"');
 }
 function liveScores(){
  const ids=[...new Set([...Object.keys(room.players),...Object.keys(room.scores)])].sort((a,b)=>(room.scores[b]||0)-(room.scores[a]||0)||a.localeCompare(b)),max=Math.max(0,...Object.values(room.scores));
  return '<div class="arena-live-scores" aria-label="Aktualny wynik bitwy">'+ids.map(id=>'<article class="'+((room.scores[id]||0)===max&&max>0?'leading ':'')+(id===uid()?'mine':'')+'"><small>'+((room.scores[id]||0)===max&&max>0?'👑 Prowadzi':id===uid()?'Ty':'Przeciwnik')+'</small><b>'+A.esc(room.names[id]||room.players[id]?.name||'Zawodnik')+'</b><strong>'+(room.scores[id]||0)+' <em>'+A.configs[room.league].unit+'</em></strong><span>'+(room.phase==='question'?(room.answers[id]?'✓ Odpowiedź zapisana':room.roster.includes(id)?'Odpowiada…':'Dołączy za chwilę'):'')+'</span></article>').join('')+'</div>';
 }
 function tick(){
  if(!room||room.phase!=='question')return;
  const clock=root()?.querySelector('.arena-countdown');if(!clock)return;
  const seconds=Math.max(0,Math.min(30,Math.ceil((room.startAt+30000+offset()-Date.now())/1000)));
  clock.querySelector('strong').textContent=seconds+' s';clock.style.setProperty('--remaining',seconds/30*100+'%');clock.classList.toggle('urgent',seconds<=5);clock.setAttribute('aria-label','Pozostało '+seconds+' sekund');
 }
 function readSentence(){if(room?.league==='ortho'&&room.task)A.speech(room.task.sentence,'pl-PL');}
 function renderProgress(){
  const p=root()?.querySelector('.arena-progress');if(p)p.textContent='Odpowiedziało '+Object.keys(room.answers).length+' / '+room.roster.length;
  const scores=root()?.querySelector('.arena-live-scores');if(scores)scores.outerHTML=liveScores();tick();
 }
 function render(){
  if(!room)return;const node=root();if(!node)return;
  const unit=A.configs[room.league].unit,names=Object.values(room.players).map(p=>A.esc(p.id===uid()?name():p.name)).join(' · ');let content='';
  if(room.phase==='lobby')content='<p>🟢 Czekamy na drugiego zawodnika. Bitwa ruszy automatycznie.</p>';
  if(room.phase==='question'){
   if(!room.roster.includes(uid()))content='<p>Ta runda się kończy. Jesteś w pokoju — dołączysz do kolejnej.</p>';
   else {
    const t=room.task,disabled=room.answered?'disabled':'';
    const prompt=room.league==='english'?englishBoard(t):'<div class="arena-prompt"><small>'+(room.league==='ortho'?'Wybierz zapis do luki':'Polski → Hiszpański')+'</small>'+(room.league==='ortho'?'<p class="arena-sentence">'+A.esc(t.context)+'</p><h2>'+A.esc(t.prompt)+'</h2><button type="button" class="secondary" onclick="readBattleSentence()">🔊 Całe zdanie</button>':'<h2>'+A.esc(t.prompt)+'</h2>')+'</div>';
    const controls=t.options?'<div class="arena-options">'+shuffle(t.options).map(x=>'<button type="button" class="arena-choice" data-arena-option="'+A.esc(x)+'" '+disabled+'>'+A.esc(x)+'</button>').join('')+'</div>':room.league==='english'?'':'<div class="arena-inputs"><label>Hiszpański<input id="arena-answer-0" class="arena-answer" required autocomplete="off" autocapitalize="none" spellcheck="false" '+disabled+'></label></div>'+window.spanishKeyboard('arena-answer-0');
    content='<p class="arena-progress">Odpowiedziało '+Object.keys(room.answers).length+' / '+room.roster.length+'</p><div class="arena-countdown" role="timer" aria-live="off"><span>Do końca rundy</span><strong>30 s</strong><i></i></div><form class="arena-form">'+prompt+controls+(t.options?'':'<button class="primary" type="submit" '+disabled+'>Odpowiadam →</button>')+'<button type="button" class="secondary arena-skip" onclick="skipLeagueBattleAnswer()" '+disabled+'>Nie wiem →</button><div class="arena-feedback" aria-live="polite">'+(room.answered?'<p>Odpowiedź zapisana. Czekamy na zakończenie rundy.</p>':'')+'</div></form>';
   }
  }
  if(room.phase==='results'){
   const results=room.results[room.round]||[],ids=Object.keys(room.scores).sort((a,b)=>room.scores[b]-room.scores[a]);
   content='<h2>'+(room.round===10?'🏁 Bitwa ukończona':'✅ Runda ukończona')+'</h2><div class="arena-round-summary">'+[...results].sort((a,b)=>b.points-a.points).map(r=>'<p>'+A.esc(r.name)+': <b>'+r.points+' '+unit+'</b>'+(r.bonus?' · +'+r.bonus+' za czas':'')+'</p>').join('')+'</div><div class="arena-scoreboard">'+ids.map(id=>'<article><header><b>'+A.esc(room.names[id]||'Zawodnik')+(id===uid()?' · Ty':'')+'</b><strong>'+room.scores[id]+' '+unit+'</strong></header><dl>'+Array.from({length:10},(_,i)=>'<div><dt>Runda '+(i+1)+'</dt><dd>'+(room.results[i+1]?.find(x=>x.id===id)?.points??'—')+'</dd></div>').join('')+'</dl></article>').join('')+'</div><button class="primary" onclick="nextLeagueBattleRound()">'+(room.round===10?'Nowa bitwa · 10 rund':'Następna runda · '+(room.round+1)+'/10')+' →</button>';
  }
  node.innerHTML='<header class="arena-room-header"><b>⚔️ '+A.esc(A.configs[room.league].name)+' · '+room.round+'/10</b><div class="arena-room-actions"><button class="secondary arena-invite-button" onclick="openBattleInvitePicker(\''+room.league+'\')">👥 Zaproś</button><button class="secondary" onclick="leaveLeagueBattle()">Opuść pokój</button></div></header><p>🟢 '+(names||'Łączenie…')+'</p>'+liveScores()+content;
  clearInterval(tickTimer);
  if(room.phase==='question'){
   tick();tickTimer=setInterval(tick,250);
   if(room.answered||Date.now()<(room.starts[uid()]||room.startAt)+offset())node.querySelectorAll('.arena-answer,.arena-choice,.arena-skip,button[type=submit]').forEach(x=>x.disabled=true);
   const match=room.match,round=room.round;
   setTimeout(()=>{if(room?.match===match&&room.round===round&&room.phase==='question'&&!room.answered&&room.roster.includes(uid())){
    node.querySelectorAll('.arena-answer,.arena-choice,.arena-skip,button[type=submit]').forEach(x=>x.disabled=false);node.querySelector('.arena-answer')?.focus();
    const key=match+':'+round+':'+uid();if(room.league==='ortho'&&lastSpoken!==key){lastSpoken=key;readSentence();}
   }},Math.max(0,(room.starts[uid()]||room.startAt)+offset()-Date.now()));
  }
 }
 document.addEventListener('submit',e=>{if(e.target.matches('.arena-form')){e.preventDefault();answer([...e.target.querySelectorAll('.arena-answer')].map(x=>x.value.trim()));}});
 document.addEventListener('click',e=>{const x=e.target.closest('[data-arena-option]');if(x)answer([x.dataset.arenaOption]);});
 async function ensureRoom(key){
  window.ensureLearningTopic?.(key);const account=uid(),until=Date.now()+15000;while(!syncReady&&uid()===account&&Date.now()<until)await new Promise(r=>setTimeout(r,200));
  if(!syncReady||!account||uid()!==account)throw new Error('Poczekaj na zakończenie logowania i spróbuj ponownie.');
  if(document.body.dataset.activeLeague!==key)window.switchLeague(key);
  if(key==='english'){window.showView('english');window.englishTab('battle');}else if(key==='spanish'){window.showView('spanish');window.spanishTab('battle');}else window.showView('ortho-battle');
  join(key);await new Promise((resolve,reject)=>{const end=Date.now()+20000;function check(){if(uid()!==account||!room){reject(new Error('Nie udało się wejść do pokoju.'));return;}if(room.connected){resolve();return;}if(Date.now()>end){reject(new Error('Połączenie trwa zbyt długo.'));return;}setTimeout(check,200);}check();});
 }
 window.addEventListener('ortoliga-auth-change',()=>{if(room&&room.owner!==uid()){const key=room.league;leave();lobby(key);}});
 window.LeagueArena={join,leave,renderLobby:lobby};window.joinLeagueBattle=join;window.leaveLeagueBattle=()=>{const key=room?.league;leave();if(key)lobby(key);};window.nextLeagueBattleRound=requestNext;
 window.joinEnglishBattle=()=>join('english');window.ensureLeagueBattleRoom=ensureRoom;window.ensureEnglishBattleRoom=()=>ensureRoom('english');
 window.readBattleSentence=readSentence;window.skipLeagueBattleAnswer=()=>answer([],true);
})();