/* Three battle rooms: shared countdown, visible totals, late joins and idempotent awards. */
(() => {
 const A=LeagueApp,boards={ortho:'arena-ortho',english:'arena-english',spanish:'arena-spanish'};
 let room=null,timer=null,stateTimer=null,tickTimer=null,lastSpoken=null,retryTimer=null,startTimer=null;
 const uid=()=>A.user()?.id,name=()=>A.user()?.user_metadata?.display_name||'Zawodnik';
 const roundLimit=(key=room?.league)=>key==='english'&&(room?.league===key?room.topic:window.learningTopic?.(key))==='tenses'?90000:30000;
 const scope=key=>key==='ortho'?'part1':window.learningTopic?.(key)||(key==='spanish'?'everyday':'all');
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
  if(window.learningTopic?.('english')==='lesson-20261019')return window.EnglishLesson?.find(t.id)||null;
  if(window.learningTopic?.('english')==='tenses')return window.EnglishTenses?.find(t.id)||null;
  const v=window.ENGLISH_VERBS.find(v=>v.id===t.id),m=t.mode;
  if(!v||!['pl-to-pair','base-to-past','past-to-base','en-to-pl'].includes(m))return null;
  return {id:v.id,word:v.id,mode:m,prompt:m==='pl-to-pair'?v.pl:m==='base-to-past'?v.base:m==='past-to-base'?v.past:v.base+' · '+v.past,wants:m==='pl-to-pair'?[v.base,v.past]:m==='base-to-past'?[v.past]:m==='past-to-base'?[v.base]:[v.pl]};
 }
 function taskFor(key){
  if(key==='ortho')return ortho[Math.floor(Math.random()*ortho.length)];
  if(key==='spanish')return validTask(key,{id:SPANISH_WORDS[Math.floor(Math.random()*SPANISH_WORDS.length)].id});
  if(window.learningTopic?.('english')==='lesson-20261019')return window.EnglishLesson.pick();
  if(window.learningTopic?.('english')==='tenses')return window.EnglishTenses.pick();
  const pool=window.getEnglishVocabulary?.()||window.ENGLISH_VERBS,v=pool[Math.floor(Math.random()*pool.length)],modes=/[\s/()]/.test(v.pl)?['pl-to-pair','base-to-past','past-to-base']:['pl-to-pair','base-to-past','past-to-base','en-to-pl'];
  return validTask(key,{id:v.id,mode:modes[Math.floor(Math.random()*modes.length)]});
 }
 function correctness(key,t,answers){return t.wants.map((want,i)=>key==='spanish'?window.spanishAnswerCorrect(answers[i],want):key==='english'?String(t.id).startsWith('tense-')?window.EnglishTenses.correct(answers[i],want):window.englishAnswerCorrect(answers[i],want,t.mode):answers[i]===want);}
 function remember(){if(!room)return;try{const saved={...state(),startAt:room.startAt+offset(),starts:Object.fromEntries(Object.entries(room.starts).map(([id,time])=>[id,time+offset()]))};sessionStorage.setItem('eduliga-arena:'+room.owner+':'+room.league+':'+room.topic,JSON.stringify({at:Date.now(),topic:room.topic,state:saved,localAnswer:room.localAnswer,draft:room.draft||[]}));}catch{window.EduDiagnostics?.record('local_storage_failed');}}
 function cached(owner,key,topic){try{const r=JSON.parse(sessionStorage.getItem('eduliga-arena:'+owner+':'+key+':'+topic)||'null');if(r&&Date.now()-r.at<600000&&r.state?.match&&r.state.league===key&&['question','results'].includes(r.state.phase)&&r.state.round>=1&&r.state.round<=10&&Array.isArray(r.state.roster)&&r.state.answers&&r.state.results&&r.state.scores&&r.state.names&&r.state.starts&&r.state.roundTasks&&Number.isFinite(r.state.startAt)&&Number.isFinite(r.state.revision)){const t=validTask(key,r.state.task);if(t)return {...r,state:{...r.state,task:t}};}}catch{}return null;}
 function emit(p){
  if(p.kind==='state'||p.kind==='answer')remember();const current=room;
  if(!current?.transportReady)return Promise.resolve('not-connected');
  const payload={...p,sender:uid(),sentAt:Date.now(),clockBase:current.serverOffset||0};
  current.sendQueue=(current.sendQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(room!==current||uid()!==current.owner)return 'not-connected';
   try{const r=await window.ortoligaSyncClient.rpc('battle_room_send',{p_connection_id:current.connectionId,p_payload:payload});if(r.error)throw r.error;return 'ok';}
   catch{window.EduDiagnostics?.record('battle_send_failed');return 'error';}
  });return current.sendQueue;
 }
 function connectionText(){if(!navigator.onLine)return 'Brak internetu. Zachowujemy odpowiedź i czekamy na połączenie.';if(room.connectionError)return room.connectionError;if(!room.transportReady)return 'Przywracam połączenie… Twoja odpowiedź pozostaje na urządzeniu.';if(!room.connected)return 'Łączę z zawodnikami i odtwarzam stan pokoju…';if(room.localAnswer&&!room.answers[uid()]&&room.phase==='question')return 'Wysyłam odpowiedź… czekam na potwierdzenie pokoju.';return '● Połączono z pokojem'+(room.phase==='question'&&room.answers[uid()]?' · odpowiedź potwierdzona':'');}
 function connectionUi(){const n=root()?.querySelector('.arena-connection');if(n){n.querySelector('span').textContent=connectionText();n.classList.toggle('waiting',!room.connected||!room.transportReady||!navigator.onLine);n.querySelector('button').hidden=room.transportReady&&room.connected;}}
 async function syncRoom(){
  const current=room;if(!current||current.polling||!navigator.onLine||uid()!==current.owner)return;current.polling=true;
  try{
   const requestAt=Date.now(),r=await window.ortoligaSyncClient.rpc('battle_room_sync',{p_league:current.league,p_topic:current.topic,p_connection_id:current.connectionId,p_after:current.cursor||0,p_claim:!current.claimed,p_phase:current.phase,p_round:current.round});
   if(room!==current||uid()!==current.owner)return;if(r.error)throw r.error;
   const data=r.data;if(!Array.isArray(data?.players)||!Array.isArray(data?.packets))throw Error('Nieprawidłowa odpowiedź pokoju.');
   if(Number.isFinite(data.serverNow))current.serverOffset=(requestAt+Date.now())/2-data.serverNow;current.claimed=true;current.connectionError='';const wasLost=!current.transportReady;current.transportReady=true;current.retries=0;
   const players=Object.fromEntries(data.players.map(p=>[p.id,[p]])),signature=JSON.stringify(data.players);
   if(current.playersSignature!==signature||!current.connected){current.playersSignature=signature;presenceChanged({presenceState:()=>players},current.owner);}
   for(const packet of data.packets){if(room!==current)return;receive(packet.payload);}
   current.cursor=Math.max(current.cursor||0,Number(data.cursor)||0);
   if(wasLost){emit({kind:'state-request'});if(current.localAnswer)emit(current.localAnswer);schedule();}connectionUi();
  }catch(error){if(room!==current)return;current.connectionError=String(error.message||'').includes('innej karcie')?'Ta bitwa jest otwarta w innej karcie. Zamknij ją i kliknij „Połącz ponownie”.':'Nie udało się połączyć z pokojem. Ponawiam połączenie…';if(current.transportReady)window.EduDiagnostics?.record('battle_disconnected');current.transportReady=false;current.connected=false;clearTimeout(timer);clearTimeout(startTimer);remember();connectionUi();}
  finally{if(room===current)current.polling=false;}
 }
 function reconnect(){if(!room)return;room.connectionError='';room.claimed=false;void syncRoom();}
 function lost(){if(!room)return;room.transportReady=false;room.connected=false;clearTimeout(timer);clearTimeout(startTimer);remember();connectionUi();}
 function connect(){if(!room)return;room.joiningUntil=Date.now()+2200;void syncRoom();}
 function maybeStart(){clearTimeout(startTimer);if(!room||!room.transportReady||!room.connected)return;startTimer=setTimeout(()=>{if(room?.host===uid()&&room.phase==='lobby'&&room.transportReady&&Object.keys(room.players).length>=2)next();},Math.max(0,room.joiningUntil-Date.now()));}
 const root=()=>room?document.getElementById(boards[room.league]):null;
 const offset=()=>room?.host===uid()?0:room?.clockOffset||0;
 function leave(){
  if(room){try{sessionStorage.removeItem('eduliga-arena:'+room.owner+':'+room.league+':'+room.topic);}catch{}}clearTimeout(retryTimer);clearTimeout(startTimer);clearTimeout(timer);clearInterval(stateTimer);clearInterval(tickTimer);window.speechSynthesis?.cancel();
  const old=room;room=null;if(old)void window.ortoligaSyncClient?.rpc('battle_room_leave',{p_connection_id:old.connectionId});
  for(const id of Object.values(boards))document.getElementById(id)?.replaceChildren();
 }
 function lobby(key){
  const node=document.getElementById(boards[key]);if(!node)return;if(room?.league===key){render();return;}
  node.innerHTML='<h2>⚔️ Bitwa · '+A.esc(A.configs[key].name)+'</h2><p>10 rund, '+(roundLimit(key)/1000)+' sekund na rundę. Start z drugim graczem, kolejni mogą dołączyć w trakcie.</p><p>Poprawna odpowiedź: +10 za każdego pokonanego rywala; bez pokonanych +5 '+A.configs[key].unit+'. Pierwszy dostaje bonus równy pełnym sekundom przewagi nad najwolniejszym graczem. „Nie wiem” lub brak odpowiedzi: −5 punktów.</p><button class="primary" onclick="joinLeagueBattle(\''+key+'\')">'+(uid()?'Wejdź jako '+A.esc(name()):'Zaloguj się i wejdź')+' →</button><button class="secondary arena-invite-button" onclick="openBattleInvitePicker(\''+key+'\')">👥 Zaproś</button><div class="arena-status" role="status"></div>';
 }
 function state(){return {league:room.league,topic:room.topic,phase:room.phase,match:room.match,round:room.round,task:room.task,roundTasks:room.roundTasks,startAt:room.startAt,roster:room.roster,answers:room.answers,results:room.results,scores:room.scores,names:room.names,starts:room.starts,revision:room.revision};}
 function presenceChanged(ch,owner){
const players={};
   for(const entries of Object.values(ch.presenceState()))for(const p of entries)if(p.id)players[p.id]=p;
   room.players=players;room.connected=!!players[owner];const previousHost=room.host;
   room.host=Object.values(players).sort((a,b)=>a.joined-b.joined||a.id.localeCompare(b.id))[0]?.id;
   if(previousHost&&previousHost!==owner&&room.host===owner&&room.phase==='question'){const delta=room.clockOffset||0;room.startAt+=delta;for(const id of Object.keys(room.starts))room.starts[id]+=delta;room.clockOffset=0;room.revision++;emit({kind:'state',state:state()});}for(const p of Object.values(players))room.names[p.id]=p.id===owner?name():p.name;
   if(room.phase==='lobby'&&room.host===owner&&Object.keys(players).length>=2)maybeStart();
   if(room.host===owner&&room.phase==='question'){
    const newcomers=Object.keys(players).filter(id=>!room.roster.includes(id));
    if(newcomers.length&&room.startAt+roundLimit()-Date.now()>5000){for(const id of newcomers){room.roster.push(id);room.starts[id]=Date.now()+500;room.scores[id]??=0;}room.revision++;emit({kind:'state',state:state()});}
    if(room.localAnswer&&!room.answers[owner])receive({...room.localAnswer,sender:owner});schedule();if(room.phase==='question'&&room.roster.every(id=>room.answers[id]))settle();
   }
   if(room.host!==owner)emit({kind:'state-request'});else if(room.phase==='question')schedule();remember();if(room.phase==='results')award();connectionUi();
   if(room.phase==='question'&&root()?.querySelector('.arena-form'))renderProgress();else render();

 }
 function join(key){
  if(!A.configs[key])return;if(!uid()){openSyncDialog();return;}
  if(!syncReady){lobby(key);document.querySelector('#'+boards[key]+' .arena-status').textContent='Pobieram Twoje postępy. Spróbuj za chwilę.';return;}
  if(room?.league===key&&room.topic===scope(key)&&room.owner===uid()){render();return;}leave();
  const owner=uid(),topic=scope(key),saved=cached(owner,key,topic);
  room={connectionId:crypto.randomUUID(),cursor:0,claimed:false,polling:false,league:key,topic,owner,joined:Date.now(),players:{},host:null,connected:false,transportReady:false,retries:0,phase:'lobby',match:null,round:0,task:null,roundTasks:{},reviewRound:null,startAt:0,roster:[],answers:{},results:{},scores:{},names:{},starts:{},revision:0,answered:false,localAnswer:null,clockOffset:0,draft:[]};
  if(saved){Object.assign(room,saved.state,{players:{},host:null,clockOffset:0,localAnswer:saved.localAnswer,draft:saved.draft||[],answered:!!saved.state.answers[owner]||!!saved.localAnswer});window.EduDiagnostics?.record('battle_resumed');}
  connect();stateTimer=setInterval(()=>{void syncRoom();if(!room||room.owner!==owner||!room.transportReady||!navigator.onLine)return;if(room.host!==owner){if(Date.now()-(room.lastRequest||0)>3000){room.lastRequest=Date.now();emit({kind:'state-request'});}}else if(room.phase!=='lobby'){if(Date.now()-(room.lastStateSent||0)>2500){room.lastStateSent=Date.now();emit({kind:'state',state:state()});}}else maybeStart();if(room.phase==='question'&&room.localAnswer&&!room.answers[owner]){if(room.host===owner)receive({...room.localAnswer,sender:owner});else emit(room.localAnswer);}connectionUi();},1000);render();
 }

 function next(newMatch=false){
  if(!room||!room.transportReady||!navigator.onLine||room.host!==uid()||Object.keys(room.players).length<2||room.phase==='question')return;
  if(!room.match||newMatch){room.match=crypto.randomUUID();room.round=0;room.results={};room.roundTasks={};room.reviewRound=null;room.scores={};}
  if(room.round>=10)return;room.round++;room.task=taskFor(room.league);room.roundTasks[room.round]=room.task;room.reviewRound=null;room.roster=Object.keys(room.players);room.answers={};room.answered=false;room.localAnswer=null;room.draft=[];room.phase='question';room.startAt=Date.now()+1200;room.clockOffset=0;room.starts=Object.fromEntries(room.roster.map(id=>[id,room.startAt]));room.revision++;
  for(const p of Object.values(room.players))room.names[p.id]=p.name;
  emit({kind:'state',state:state()});schedule();render();
 }
 function requestNext(){if(!room)return;if(Object.keys(room.players).length<2){const node=root()?.querySelector('.arena-round-end');if(node&&!node.querySelector('.arena-wait-next'))node.insertAdjacentHTML('beforeend','<p class="arena-wait-next" role="status">Czekamy na drugiego zawodnika. Możesz go zaprosić przyciskiem u góry.</p>');return;}if(room.host===uid())next(room.round>=10);else emit({kind:'next',newMatch:room.round>=10});}
 function receive(p){
  if(!room||!p||!room.players[p.sender])return;
  if(p.kind==='state-request'&&room.host===uid()){emit({kind:'state',state:state(),target:p.sender});return;}
  if(p.kind==='next'&&room.host===uid()&&room.phase==='results'){next(!!p.newMatch);return;}
  if(p.kind==='state'&&p.sender===room.host&&(!p.target||p.target===uid())){
   const s=p.state;
   if(!s||s.league!==room.league||s.topic!==room.topic||!Number.isInteger(s.round)||s.round<0||s.round>10||!['lobby','question','results'].includes(s.phase)||!Array.isArray(s.roster)||!s.answers||!s.results||!s.scores||!s.names)return;
   if(room.match===s.match&&(room.round>s.round||(Number(s.revision)||0)<room.revision))return;
   const task=s.task?validTask(room.league,s.task):null;if(s.phase==='question'&&(!task||!Number.isFinite(s.startAt)))return;
   const same=room.match===s.match&&room.round===s.round,answered=same&&room.answered,localAnswer=same?room.localAnswer:null,draft=same?room.draft:[];
   if(same&&room.phase==='results'&&s.phase==='results'&&Number(s.revision)===room.revision)return;
   const roundTasks={};for(let i=1;i<=10;i++){const saved=validTask(room.league,s.roundTasks?.[i]);if(saved)roundTasks[i]=saved;}if(task)roundTasks[s.round]=task;Object.assign(room,s,{task,roundTasks,starts:s.starts||{},localAnswer,draft});if(!same)room.reviewRound=null;if(Number.isFinite(p.clockBase))room.clockOffset=(room.serverOffset||0)-p.clockBase;else if(Number.isFinite(p.sentAt))room.clockOffset=Date.now()-p.sentAt;
   room.answered=answered||!!room.answers[uid()];
   remember();if(room.phase==='results')award();else schedule();connectionUi();
   if(same&&room.phase==='question'&&root()?.querySelector('.arena-form'))renderProgress();else render();return;
  }
  if(p.kind==='answer'&&room.host===uid()&&room.phase==='question'&&p.match===room.match&&p.round===room.round&&room.roster.includes(p.sender)&&!room.answers[p.sender]){
   if(Date.now()>=room.startAt+roundLimit()+1500){settle();return;}
   room.answers[p.sender]={answers:Array.isArray(p.answers)?p.answers.map(a=>String(a).slice(0,160)):[],elapsed:Math.max(0,Math.min(roundLimit(),Date.now()-(room.starts[p.sender]||room.startAt),Math.max(Date.now()-(room.starts[p.sender]||room.startAt)-2500,Number.isFinite(p.elapsed)?p.elapsed:roundLimit()))),skipped:!!p.skipped};room.revision++;
   if(room.roster.every(id=>room.answers[id]))settle();else {emit({kind:'state',state:state()});renderProgress();}
  }
 }
 function schedule(){
  clearTimeout(timer);if(!room||room.phase!=='question')return;
  timer=setTimeout(()=>{if(!room||room.phase!=='question'||!room.transportReady||!room.connected||!navigator.onLine)return;if(room.host===uid())settle();else if(room.roster.includes(uid())&&!room.answered)answer([],true);},Math.max(0,room.startAt+roundLimit()+offset()+(room.host===uid()?1500:0)-Date.now()));
 }
 function answer(answers,skipped=false){
  if(!room||room.phase!=='question'||room.answered||!room.roster.includes(uid())||Date.now()<(room.starts[uid()]||room.startAt)+offset())return;
  if(Date.now()>=room.startAt+roundLimit()+offset()){answers=[];skipped=true;}room.answered=true;room.draft=answers;const correct=correctness(room.league,room.task,answers),node=root()?.querySelector('.arena-feedback');
  if(node)node.innerHTML=skipped?'<p class="answer-feedback bad">Poprawnie: <b>'+(String(room.task.id).startsWith('tense-')?A.esc(window.EnglishTenses.answerText(room.task)):room.task.wants.map(A.esc).join(' · '))+'</b> · −5 pkt.</p>':correct.every(Boolean)?'<p class="answer-feedback good">✓ Brawo! Punkty pojawią się po rundzie.</p>'+(String(room.task.id).startsWith('tense-')?'<p>Odpowiedź w luce: <b>'+A.esc(window.EnglishTenses.answerText(room.task))+'</b></p>':''):'<p class="answer-feedback bad">Poprawnie: <b>'+(String(room.task.id).startsWith('tense-')?A.esc(window.EnglishTenses.answerText(room.task)):room.task.wants.map(A.esc).join(' · '))+'</b> · −5 punktów za błędną odpowiedź.</p>';
  if(node&&String(room.task.id).startsWith('tense-')&&window.EnglishTenses.answerText(room.task).includes(' = '))node.innerHTML+='<p>Pełna forma i skrót znaczą to samo.</p>';
  if(node&&(skipped||!correct.every(Boolean)))node.innerHTML+=taskWhy(room.task);
  correct.forEach((ok,i)=>{if(ok)window.celebrateAnswer?.(document.getElementById('arena-answer-'+i)||node);});
  root()?.querySelectorAll('.arena-answer,.arena-choice,.arena-skip,button[type=submit]').forEach(x=>x.disabled=true);
  const payload={kind:'answer',match:room.match,round:room.round,answers,skipped,elapsed:Math.max(0,Math.min(roundLimit(),Date.now()-(room.starts[uid()]||room.startAt)-offset())),sender:uid()};room.localAnswer=payload;emit(payload);if(room.host===uid()&&room.transportReady&&navigator.onLine)receive(payload);connectionUi();
 }
 function settle(){
  if(!room||!room.transportReady||!room.connected||!navigator.onLine||room.host!==uid()||room.phase!=='question')return;clearTimeout(timer);
  const rows=room.roster.map(id=>{const a=room.answers[id]||{answers:[],elapsed:roundLimit(),skipped:true};return {id,name:room.names[id]||'Zawodnik',...a,correct:correctness(room.league,room.task,a.answers)};});
  const ranked=rows.filter(r=>!r.skipped&&r.correct.length>0&&r.correct.every(Boolean)).sort((a,b)=>a.elapsed-b.elapsed||a.id.localeCompare(b.id));
  const slowest=Math.max(0,...rows.map(r=>r.elapsed));
  const summary=rows.map(r=>{
   const valid=!r.skipped&&r.correct.length>0&&r.correct.every(Boolean);
   const defeated=valid?rows.filter(other=>other.id!==r.id&&(other.skipped||!other.correct.every(Boolean)||other.elapsed>r.elapsed)).length:0;
   const place=valid?1+ranked.filter(other=>other.elapsed<r.elapsed).length:null;
   const soleFirst=valid&&place===1&&ranked.filter(other=>other.elapsed===r.elapsed).length===1;
   const bonus=soleFirst?Math.max(0,Math.min(roundLimit()/1000,Math.floor((slowest-r.elapsed)/1000))):0;
   const points=valid?(defeated?defeated*10:5)+bonus:-5;
   room.scores[r.id]=(room.scores[r.id]||0)+points;return {...r,place,defeated,bonus,points};
  });
  room.results[room.round]=summary;room.phase='results';room.revision++;emit({kind:'state',state:state()});award();render();
 }
 function award(){if(!room)return;for(const n of Object.keys(room.results).map(Number).sort((a,b)=>a-b)){const mine=room.results[n]?.find(r=>r.id===uid()),task=room.roundTasks[n];if(!mine||!task)continue;const id=room.match+':'+n,win=n===10&&room.scores[uid()]===Math.max(...Object.values(room.scores));if(room.league==='english')window.awardEnglishArena?.({id,task,answers:mine.answers,correct:mine.correct,points:mine.points,final:n===10,win});else{A.record(room.league,{id,kind:'battle',word:task.word,ok:correctRound(mine),delta:mine.points});if(n===10)A.record(room.league,{id:room.match+':match',kind:'match',win,delta:0});}}remember();}
 function englishBoard(t){
  if(String(t.id).startsWith('lesson-'))return window.EnglishLesson.board(t,true);
  if(String(t.id).startsWith('tense-'))return window.EnglishTenses.board(t,true);
  const v=window.ENGLISH_VERBS.find(v=>v.id===t.id);
  return '<div class="english-prompt"><span>Uzupełnij luki</span><button type="button" class="english-speak" aria-label="Odtwórz podane słowa" onclick="speakEnglishQuestion('+v.id+',\''+t.mode+'\')">🔊</button></div>'+window.englishQuestionBoard(v,t.mode).replace(/class="english-answer /g,'class="arena-answer english-answer ').replace(/data-answer="(\d+)"/g,'id="arena-answer-$1" data-answer="$1"');
 }
 function correctRound(r){return !!r&&!r.skipped&&r.correct?.length>0&&r.correct.every(Boolean);}
 function taskWhy(t){if(String(t.id).startsWith('lesson-'))return window.EnglishLesson.why(t);if(String(t.id).startsWith('tense-'))return window.EnglishTenses.ruleFeedback(t);let text;if(room.league==='ortho')text=(typeof league!=='undefined'?league.lookup(t.word)?.rule:null)||'Poprawny zapis to '+t.word+'. Porównaj brakujące litery z pełnym wyrazem.';else if(room.league==='english'){const v=window.ENGLISH_VERBS.find(v=>v.id===t.id);text=v?v.base+' → '+v.past+' to zapamiętywana para form czasownika nieregularnego. Znaczenie: '+v.pl+'.':'Porównaj poprawne formy ze swoim zapisem.';}else text=t.prompt+' po hiszpańsku to '+t.wants[0]+'. Zwróć uwagę na dokładny zapis liter i akcentów.';return window.learningWhy?.(text)||'';}
 function taskCorrection(t){if(!t)return '';if(String(t.id).startsWith('lesson-'))return '<p>'+A.esc(t.pl)+' → <b>'+A.esc(t.en)+'</b></p>';if(String(t.id).startsWith('tense-'))return '<p>'+A.esc(t.sentence.replace('___',t.wants[0]))+'</p><small>'+A.esc(window.EnglishTenses.answerText(t))+'</small>';if(room.league==='english'){const v=window.ENGLISH_VERBS.find(v=>v.id===t.id);return v?'<p>PL: '+A.esc(v.pl)+' · 1: <b>'+A.esc(v.base)+'</b> · 2: <b>'+A.esc(v.past)+'</b></p>':'';}return '<p>'+A.esc(room.league==='ortho'?t.sentence:t.prompt+' → '+t.wants[0])+'</p>';}
 function roundReview(n){const rows=room.results[n],t=room.roundTasks[n];if(!rows||!t)return '';const mine=rows.find(r=>r.id===uid()),bad=mine&&!correctRound(mine);return '<section class="arena-review"><h3>Runda '+n+' · '+(bad?'Twój błąd — zobacz poprawny zapis':mine?'Twoja odpowiedź poprawna':'Przebieg rundy')+'</h3><div class="arena-correction">'+taskCorrection(t)+'</div>'+(mine?'<p class="arena-own-answer '+(bad?'bad':'good')+'">'+(mine.skipped?'Nie wiem / brak odpowiedzi':(bad?'Twoja odpowiedź: ':'✓ Twoja odpowiedź: ')+A.esc(mine.answers.join(' · ')))+' · <b>'+mine.points+' '+A.configs[room.league].unit+'</b></p>':'')+taskWhy(t)+'<details class="learning-why arena-review-all"><summary>Odpowiedzi wszystkich zawodników</summary>'+rows.map(r=>'<p class="'+(correctRound(r)?'good':'bad')+'"><b>'+(correctRound(r)?'✓ ':'✗ ')+A.esc(r.name)+'</b> · '+(r.skipped?'Nie wiem / brak odpowiedzi':A.esc(r.answers.join(' · ')))+' · '+r.points+' '+A.configs[room.league].unit+' · '+(Math.round(r.elapsed/100)/10)+' s</p>').join('')+'</details></section>';}
 function liveScores(){
  const ids=[...new Set([...Object.keys(room.players),...Object.keys(room.scores)])].sort((a,b)=>(room.scores[b]||0)-(room.scores[a]||0)||a.localeCompare(b)),unit=A.configs[room.league].unit,colors=['#a789eb','#46b6d4','#efa54b','#72bb78','#e776a6','#7f99ee','#cb9562','#5ab5a0'],done=Object.keys(room.results).map(Number).filter(n=>n>=1&&n<=10).sort((a,b)=>a-b),last=done.at(-1)||0;
  const numeric=n=>Math.max(-100000,Math.min(100000,Number(n)||0)),series=ids.map((id,index)=>{let sum=0;const first=done.find(n=>room.results[n].some(r=>r.id===id))||1,values=[{round:Math.max(0,first-1),sum:0,result:null}];for(let i=first;i<=last;i++){const r=room.results[i]?.find(r=>r.id===id);sum+=numeric(r?.points);values.push({round:i,sum,result:r});}return {id,color:colors[index%colors.length],values};});
  const totals=series.flatMap(s=>s.values.map(v=>v.sum)),low=Math.min(0,...totals)-5,high=Math.max(10,...totals)+5,W=760,H=225,L=48,R=20,T=18,B=32,x=n=>L+n*(W-L-R)/10,y=n=>T+(high-n)*(H-T-B)/(high-low),format=n=>Math.round(n*10)/10;
  const grid=Array.from({length:5},(_,i)=>{const value=low+i*(high-low)/4;return '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+format(y(value))+'" y2="'+format(y(value))+'" class="race-grid"/><text x="'+(L-8)+'" y="'+format(y(value)+4)+'" text-anchor="end">'+Math.round(value)+'</text>';}).join('');
  const lines=series.map(s=>'<path d="'+s.values.map((v,i)=>(i?'L':'M')+format(x(v.round))+','+format(y(v.sum))).join(' ')+'" fill="none" stroke="'+s.color+'" stroke-width="'+(s.id===uid()?4:2.5)+'"/>'+s.values.filter(v=>v.result).map(v=>'<circle cx="'+format(x(v.round))+'" cy="'+format(y(v.sum))+'" r="'+(correctRound(v.result)?5:6)+'" fill="'+(correctRound(v.result)?s.color:'#ef7474')+'" stroke="var(--paper)" stroke-width="2"><title>'+A.esc(room.names[s.id]||'Zawodnik')+' · runda '+v.round+': '+v.result.points+' '+unit+(correctRound(v.result)?' · poprawnie':' · błąd / brak odpowiedzi')+'</title></circle>').join('')).join('');
  const max=Math.max(0,...Object.values(room.scores).map(numeric)),review=room.reviewRound|| (room.phase==='results'?room.round:null);
  return '<section class="arena-race" aria-label="Wspólny wykres przebiegu bitwy"><header><h3>🏁 Wyścig wiedzy</h3><small>Runda '+room.round+'/10 · czerwony punkt = błąd lub brak odpowiedzi</small></header><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Punkty wszystkich zawodników po kolejnych rundach">'+grid+lines+Array.from({length:11},(_,i)=>'<text x="'+format(x(i))+'" y="'+(H-9)+'" text-anchor="middle">'+i+'</text>').join('')+'</svg><div class="race-legend">'+series.map(s=>'<article class="'+(s.id===uid()?'mine ':'')+((room.scores[s.id]||0)===max&&max>0?'leading':'')+'"><i style="background:'+s.color+'"></i><span><b>'+A.esc(room.names[s.id]||room.players[s.id]?.name||'Zawodnik')+(s.id===uid()?' · Ty':'')+'</b><small>'+(room.phase==='question'?(!room.players[s.id]?'Poza pokojem':room.answers[s.id]?'✓ Odpowiedź zapisana':room.roster.includes(s.id)?'Odpowiada…':'Dołączy w kolejnej rundzie'):(room.scores[s.id]||0)===max&&max>0?'👑 Na prowadzeniu':'')+'</small></span><strong>'+(room.scores[s.id]||0)+' <em>'+unit+'</em></strong></article>').join('')+'</div>'+(done.length?'<nav class="race-rounds" aria-label="Zobacz odpowiedzi z rundy">'+done.map(n=>{const mine=room.results[n]?.find(r=>r.id===uid());return '<button type="button" data-arena-review="'+n+'" aria-pressed="'+(review===n)+'" class="'+(mine?(correctRound(mine)?'good':'bad'):'')+'">'+(mine?(correctRound(mine)?'✓ ':'✗ '):'')+'R'+n+'</button>';}).join('')+'</nav>':'<p class="race-empty">Wykres ruszy po pierwszej rundzie. Punkty i błędy będą widoczne po jej zakończeniu.</p>')+(review?roundReview(review):'')+'</section>';
 }

 function tick(){
  if(!room||room.phase!=='question')return;
  const clock=root()?.querySelector('.arena-countdown');if(!clock)return;
  const seconds=Math.max(0,Math.min(roundLimit()/1000,Math.ceil((room.startAt+roundLimit()+offset()-Date.now())/1000)));
  clock.querySelector('strong').textContent=seconds+' s';clock.style.setProperty('--remaining',seconds/(roundLimit()/1000)*100+'%');clock.classList.toggle('urgent',seconds<=5);clock.setAttribute('aria-label','Pozostało '+seconds+' sekund');
 }
 function readSentence(){if(room?.league==='ortho'&&room.task)A.speech(room.task.sentence,'pl-PL');}
 function renderProgress(){
  if(room.transportReady&&!room.answered&&room.roster.includes(uid())&&Date.now()>=(room.starts[uid()]||room.startAt)+offset())root()?.querySelectorAll('.arena-answer,.arena-choice,.arena-skip,button[type=submit]').forEach(x=>x.disabled=false);connectionUi();const p=root()?.querySelector('.arena-progress');if(p)p.textContent='Odpowiedziało '+Object.keys(room.answers).length+' / '+room.roster.length;
  const scores=root()?.querySelector('.arena-race');if(scores)scores.outerHTML=liveScores();tick();
 }
 function render(){
  if(!room)return;const node=root();if(!node)return;
  const unit=A.configs[room.league].unit,names=Object.values(room.players).map(p=>A.esc(p.id===uid()?name():p.name)).join(' · ');let content='';
  if(room.phase==='lobby')content='<p>🟢 W pokoju: <b>'+A.esc(names||name())+'</b></p><p>Czekamy na drugiego zawodnika w tym samym zestawie. Bitwa ruszy automatycznie.</p><button type="button" class="secondary" onclick="openActiveBattleRooms()">⚔️ Zobacz otwarte bitwy</button>';
  if(room.phase==='question'){
   if(!room.roster.includes(uid()))content='<p>Ta runda się kończy. Jesteś w pokoju — dołączysz do kolejnej.</p>';
   else {
    const t=room.task,disabled=room.answered?'disabled':'';
    const prompt=room.league==='english'?englishBoard(t):'<div class="arena-prompt"><small>'+(room.league==='ortho'?'Wybierz zapis do luki':'Polski → Hiszpański')+'</small>'+(room.league==='ortho'?'<p class="arena-sentence">'+A.esc(t.context)+'</p><h2>'+A.esc(t.prompt)+'</h2><button type="button" class="secondary" onclick="readBattleSentence()">🔊 Całe zdanie</button>':'<h2>'+A.esc(t.prompt)+'</h2>')+'</div>';
    const controls=t.options?'<div class="arena-options">'+shuffle(t.options).map(x=>'<button type="button" class="arena-choice" data-arena-option="'+A.esc(x)+'" '+disabled+'>'+A.esc(x)+'</button>').join('')+'</div>':room.league==='english'?'':'<div class="arena-inputs"><label>Hiszpański<input id="arena-answer-0" class="arena-answer" required autocomplete="off" autocapitalize="none" spellcheck="false" '+disabled+'></label></div>'+window.spanishKeyboard('arena-answer-0');
    content='<p class="arena-progress">Odpowiedziało '+Object.keys(room.answers).length+' / '+room.roster.length+'</p><div class="arena-countdown" role="timer" aria-live="off"><span>Do końca rundy</span><strong>'+(roundLimit()/1000)+' s</strong><i></i></div><form class="arena-form">'+prompt+controls+(t.options?'':'<button class="primary" type="submit" '+disabled+'>Odpowiadam →</button>')+'<button type="button" class="secondary arena-skip" onclick="skipLeagueBattleAnswer()" '+disabled+'>Nie wiem →</button><div class="arena-feedback" aria-live="polite">'+(room.answered?'<p>'+A.esc(room.answers[uid()]?'✓ Pokój potwierdził odpowiedź. Czekamy na koniec rundy.':'Odpowiedź zachowana na urządzeniu. Czekam na potwierdzenie pokoju.')+'</p>':'')+'</div></form>';
   }
  }
  if(room.phase==='results')content='<div class="arena-round-end"><h2>'+(room.round===10?'🏁 Bitwa ukończona':'✅ Runda '+room.round+' ukończona')+'</h2><button class="primary" onclick="nextLeagueBattleRound()">'+(room.round===10?'Nowa bitwa · 10 rund':'Następna runda · '+(room.round+1)+'/10')+' →</button></div>';
  node.innerHTML='<div class="arena-connection" role="status"><span>'+connectionText()+'</span><button type="button" class="secondary" onclick="reconnectLeagueBattle()" '+(room.transportReady&&room.connected?'hidden':'')+'>Połącz ponownie</button></div><header class="arena-room-header"><b>⚔️ '+A.esc(A.configs[room.league].name)+' · '+room.round+'/10<br><small>'+A.esc(({part1:room.league==='ortho'?'Ortografia':'Nieregularne · część 1',part2:'Nieregularne · część 2',all:'Nieregularne · obie części',tenses:'Czasy angielskie','lesson-20261019':'Słówka · 19.10.2026',everyday:'Poznajmy się'})[room.topic]||'')+'</small></b><div class="arena-room-actions"><button class="secondary arena-invite-button" onclick="openBattleInvitePicker(\''+room.league+'\')">👥 Zaproś</button><button class="secondary" onclick="leaveLeagueBattle()">Opuść pokój</button></div></header>'+content+liveScores();
  if(room.draft?.length)node.querySelectorAll('.arena-answer').forEach((input,i)=>input.value=room.draft[i]||'');connectionUi();clearInterval(tickTimer);
  if(room.phase==='question'){
   tick();tickTimer=setInterval(tick,250);
   if(room.answered||!room.transportReady||Date.now()<(room.starts[uid()]||room.startAt)+offset())node.querySelectorAll('.arena-answer,.arena-choice,.arena-skip,button[type=submit]').forEach(x=>x.disabled=true);
   const match=room.match,round=room.round;
   setTimeout(()=>{if(room?.match===match&&room.round===round&&room.phase==='question'&&room.transportReady&&!room.answered&&room.roster.includes(uid())){
    node.querySelectorAll('.arena-answer,.arena-choice,.arena-skip,button[type=submit]').forEach(x=>x.disabled=false);node.querySelector('.arena-answer')?.focus();
    const key=match+':'+round+':'+uid();if(room.league==='ortho'&&lastSpoken!==key&&window.EduLearningPreferences?.automaticAudio()!==false){lastSpoken=key;readSentence();}
   }},Math.max(0,(room.starts[uid()]||room.startAt)+offset()-Date.now()));
  }
 }
 document.addEventListener('input',e=>{if(e.target.matches('.arena-answer')&&room){room.draft=[...root().querySelectorAll('.arena-answer')].map(x=>x.value);remember();}});
 document.addEventListener('submit',e=>{if(e.target.matches('.arena-form')){e.preventDefault();answer([...e.target.querySelectorAll('.arena-answer')].map(x=>x.value.trim()));}});
 document.addEventListener('click',e=>{const x=e.target.closest('[data-arena-option]');if(x)answer([x.dataset.arenaOption]);const review=e.target.closest('[data-arena-review]');if(review&&room?.results[Number(review.dataset.arenaReview)]){room.reviewRound=Number(review.dataset.arenaReview);const chart=root()?.querySelector('.arena-race');if(chart)chart.outerHTML=liveScores();}});
 async function ensureRoom(key,topic){
  const target=topic||scope(key);if(key==='english'||key==='spanish'){if(document.body.dataset.activeLeague!==key||scope(key)!==target)window.selectLearningTopic?.(key,target);else window.ensureLearningTopic?.(key);}else if(document.body.dataset.activeLeague!==key)window.LeagueApp.open(key);const account=uid(),until=Date.now()+15000;while(!syncReady&&uid()===account&&Date.now()<until)await new Promise(r=>setTimeout(r,200));
  if(!syncReady||!account||uid()!==account)throw new Error('Poczekaj na zakończenie logowania i spróbuj ponownie.');
  if(document.body.dataset.activeLeague!==key)throw new Error('Nie udało się otworzyć wybranej ligi.');
  if(key==='english'){window.showView('english');window.englishTab('battle');}else if(key==='spanish'){window.showView('spanish');window.spanishTab('battle');}else window.showView('ortho-battle');
  join(key);await new Promise((resolve,reject)=>{const end=Date.now()+20000;function check(){if(uid()!==account||!room){reject(new Error('Nie udało się wejść do pokoju.'));return;}if(room.connected){resolve();return;}if(Date.now()>end){reject(new Error('Połączenie trwa zbyt długo.'));return;}setTimeout(check,200);}check();});
 }
 window.addEventListener('ortoliga-auth-change',()=>{if(room&&room.owner!==uid()){const key=room.league;leave();lobby(key);}});
 window.addEventListener('offline',lost);window.addEventListener('online',()=>{if(room)reconnect();});window.addEventListener('pagehide',remember);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&room){if(!room.transportReady)reconnect();else{emit({kind:'state-request'});schedule();}}});window.reconnectLeagueBattle=reconnect;
 window.LeagueArena={join,leave,renderLobby:lobby,current:()=>room?{league:room.league,topic:room.topic,connected:room.connected}:null};window.joinLeagueBattle=join;window.leaveLeagueBattle=()=>{const key=room?.league;leave();if(key)lobby(key);};window.nextLeagueBattleRound=requestNext;
 window.joinEnglishBattle=()=>join('english');window.ensureLeagueBattleRoom=ensureRoom;window.ensureEnglishBattleRoom=()=>ensureRoom('english');
 window.readBattleSentence=readSentence;window.skipLeagueBattleAnswer=()=>answer([],true);
})();
