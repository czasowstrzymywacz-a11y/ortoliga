'use strict';

// Shared language rules; student progress is kept in separate account stores.
const league = OrtoLigaCore.create([...BANK,...EXPANSION_TEXTS.flatMap(s=>s.newWords||[])],GROUP_HELP);
const leagueBaseBank = [...BANK,...EXPANSION_TEXTS.flatMap(s=>s.newWords||[])].filter((x,i,a)=>!OrtoLigaCore.forbidden.test(x.word+' '+(x.example||''))&&a.findIndex(y=>y.word===x.word&&y.group===x.group)===i);
const localKey = owner => `ortoliga-progress-v2:${owner||'guest'}`;
const dirtyKey = owner => `ortoliga-pending:${owner}`;
const baseKey = owner => `ortoliga-cloud-base:${owner}`;
let accountLoadSequence=0, authProfileSequence=0, loadingAccount=null, loadingAccountPromise=null, authSignInPending=false;
const accountWrites=new Map();
let manualBoundaries=[],manualStripIndex=0,trainingStarted=0;
let previousJoke=-1,authMode='login',passwordRecoveryActive=false;
const orthoJokes=[
 "Pani pyta: „Dlaczego zadanie domowe jest puste?”. Kuba: „Bo chciałem zostawić miejsce na pani uwagi!”.",
 "Na matematyce pani pyta o wynik. Zosia mówi: „Wyszło mi siedem”. „A sprawdziłaś?”. „Tak, dwa razy — nadal siedem!”.",
 "Pani prosi o ciszę. Bartek podnosi rękę: „Czy ciszę też zapisujemy w zeszycie?”.",
 "Na plastyce uczeń oddaje pustą kartkę. „Co to jest?” — pyta nauczycielka. „Bardzo oszczędny krajobraz!”.",
 "Kolega pyta: „Masz plan na sprawdzian?”. „Tak, najpierw przeczytam pytania, a potem plan może się zmienić”.",
 "Pani pyta, kto pamięta temat lekcji. Lena: „Ja pamiętam, że był ważny. Szczegóły dopiszę po przerwie!”.",
 "W bibliotece Franek szuka książki, która sama się czyta. Bibliotekarka: „A ty co będziesz robił?”. „Kibicował!”.",
 "Nauczyciel pyta: „Dlaczego spóźniłeś się na lekcję?”. Uczeń: „Bo dzwonek zadzwonił, zanim zdążyłem przyjść!”.",
 "Na przyrodzie pani pyta o obieg wody. Michał: „Woda wraca do chmur, bo chyba też nie lubi siedzieć w jednym miejscu!”.",
 "Koleżanka pyta: „Po co zabrałeś linijkę na przerwę?”. „Żeby zmierzyć, czy kolejka po obiad jest naprawdę taka długa!”"
];
function jokeRewardKey(){return 'ortoliga-joke-reward:'+(syncUser?.id||'guest');}
function readJokeReward(){try{return JSON.parse(localStorage.getItem(jokeRewardKey()))||{remaining:0,sessionId:'',lastJoke:''};}catch{return {remaining:0,sessionId:'',lastJoke:''};}}
function writeJokeReward(state){try{localStorage.setItem(jokeRewardKey(),JSON.stringify(state));}catch{}}
function mobileJokePanel(){let panel=document.getElementById('ortho-joke-mobile');if(!panel){panel=document.createElement('section');panel.id='ortho-joke-mobile';panel.className='ortho-joke ortho-joke-mobile';panel.setAttribute('aria-label','Szkolny żart — nagroda za dyktando');panel.innerHTML='<div class="joke-head"><span>🎁 Nagroda za dyktando</span><button type="button" class="joke-draw" onclick="tellOrthoJoke()">🎲 Losuj żart</button></div><p class="joke-text"></p><small class="joke-lock-note" hidden></small>';document.getElementById('result').appendChild(panel);}return panel;}
function renderJokeReward(){const state=readJokeReward(),panels=[document.getElementById('ortho-joke'),mobileJokePanel()];for(const panel of panels){if(!panel)continue;panel.hidden=!state.sessionId;const out=panel.querySelector('.joke-text')||panel.querySelector('#ortho-joke-text'),button=panel.querySelector('.joke-draw')||panel.querySelector('button'),note=panel.querySelector('.joke-lock-note');if(out)out.textContent=state.lastJoke||'Ukończone dyktando odblokowało trzy losowania. Odkryj swój szkolny żart!';if(button){button.disabled=!state.remaining;button.textContent=state.remaining?`🎲 Losuj żart · ${state.remaining}`:'🔒 Po następnym dyktandzie';}if(note){note.hidden=!!state.remaining;note.textContent='Kolejne żarty odblokują się po ukończeniu kolejnego dyktanda.';}}}
function grantJokeReward(sessionId){writeJokeReward({remaining:3,sessionId,lastJoke:''});renderJokeReward();}
function tellOrthoJoke(){const state=readJokeReward();if(!state.sessionId||!state.remaining)return;let next=Math.floor(Math.random()*orthoJokes.length);previousJoke=orthoJokes.indexOf(state.lastJoke);if(next===previousJoke)next=(next+1)%orthoJokes.length;state.remaining--;state.lastJoke=orthoJokes[next];writeJokeReward(state);renderJokeReward();for(const panel of [document.getElementById('ortho-joke'),document.getElementById('ortho-joke-mobile')]){const out=panel?.querySelector('.joke-text')||panel?.querySelector('#ortho-joke-text');if(out){out.classList.remove('joke-pop');void out.offsetWidth;out.classList.add('joke-pop');}}}
function setAuthMode(mode){
 authMode=mode;passwordRecoveryActive=false;
 for(const [id,on] of [['auth-login-fields',mode==='login'],['auth-register-fields',mode==='register'],['auth-reset-fields',mode==='forgot'],['auth-recovery-fields',false],['auth-login-submit',mode==='login'],['auth-register-submit',mode==='register'],['auth-reset-submit',mode==='forgot']])document.getElementById(id).hidden=!on;
 document.querySelector('.auth-tabs').hidden=mode==='account';document.getElementById('auth-tab-login').hidden=mode==='login';document.getElementById('auth-tab-register').hidden=mode!=='login';document.getElementById('auth-tab-forgot').hidden=mode!=='login';
 document.getElementById('auth-title').textContent=({login:'Zaloguj',register:'Zarejestruj się',forgot:'Przypomnij hasło',account:'Twoje konto'})[mode];
 document.getElementById('auth-description').textContent=({login:'Wróć do swoich postępów, bitew i wspólnego czatu.',register:'Utwórz konto i zachowaj swoje postępy.',forgot:'Podaj e-mail użyty przy zakładaniu konta.',account:'Zalogowano jako '+(syncUser?.user_metadata?.display_name||'uczeń')+'.'})[mode];
 if(mode==='forgot'){const email=document.getElementById('student-identity').value.trim();if(email.includes('@'))document.getElementById('student-reset-email').value=email;}
 document.getElementById(({login:'student-identity',register:'student-name',forgot:'student-reset-email',account:'sync-sign-out'})[mode]).focus();setSyncStatus('');
}
const localDate = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
today = localDate;
normalizeData = old => league.normalize(old);
function readAccount(owner) {try {const raw=localStorage.getItem(localKey(owner));return raw?league.normalize(JSON.parse(raw)):null;}catch{return null;}}
// The old shared cache has no owner. Preserve it for explicit recovery, never
// silently attach it to a new account or expose it as another pupil's results.
if(!localStorage.getItem('ortoliga-legacy-unclaimed')&&localStorage.getItem(STORE))localStorage.setItem('ortoliga-legacy-unclaimed',localStorage.getItem(STORE));
loadData = () => readAccount(null)||league.normalize({});
data=loadData();
restoreExtraWords = () => {BANK.splice(0,BANK.length,...leagueBaseBank);};
clearExtraWords = () => {BANK.splice(0,BANK.length,...leagueBaseBank);};
restoreExtraWords();
GROUP_HELP['Ó wymienne']='Poszukaj rodziny wyrazu: ó może wymienić się na o, e lub a, np. stół–stoły, wiózł–wieźć, wrócić–wracać.';
GROUP_HELP['Przecinki i interpunkcja']='Ćwiczymy tylko dwa znaki: przecinek i kropkę. Zaznacz je przy słowie, po którym zapisano znak.';

function persistAccount(owner,dirty=false) {
  data.schemaVersion=2;localStorage.setItem(localKey(owner),JSON.stringify(data));
  if(owner&&dirty)localStorage.setItem(dirtyKey(owner),data.updatedAt||new Date().toISOString());
}
save = () => {data.updatedAt=new Date().toISOString();persistAccount(syncUser?.id,true);renderAll();if(syncUser)queueCloudSave();};
function resetActiveTraining(){if(typeof speechSynthesis!=='undefined')stopSpeech();closeCamera();currentText=null;currentScored=false;manualTokens=[];manualBoundaries=[];manualStripIndex=0;document.getElementById('manual-transcription').hidden=true;document.getElementById('result').innerHTML='';document.getElementById('typed-answer').value='';}

function adaptiveSignature(){const needs=league.diagnosis(data,today());return JSON.stringify({last:data.sessions.at(-1)?.id||data.sessions.at(-1)?.date||'',words:needs.words,rules:needs.rules});}
function createTraining(groups=[],kind='dopasowane') {
  const generated=league.generate(data,groups,today(),[...TEXTS,...EXPANSION_TEXTS]);
  return {...generated,id:'league-'+crypto.randomUUID(),kind,contentVersion:4,attempts:0,createdAt:today(),lastScore:null,adaptiveSignature:adaptiveSignature()};
}
queueNextDictation = () => {const item=createTraining();data.generatedCount++;data.dictations.push(item);return {item,newWords:item.words.filter(w=>!league.stats(data,w))};};
function ensureAdaptiveQueue(refresh=false) {
  const signature=adaptiveSignature();
  const waiting=data.dictations.filter(d=>d.kind==='dopasowane'&&!d.attempts);
  const surplus=new Set(waiting.slice(2).map(d=>d.id));data.dictations=data.dictations.filter(d=>!surplus.has(d.id));
  for(const item of waiting.slice(0,2))if(refresh&&item.adaptiveSignature!==signature){
    const oldId=item.id;const remaining=data.dictations.filter(d=>d.id!==oldId);const original=data.dictations;data.dictations=remaining;
    let next;try{next=createTraining();}finally{data.dictations=original;}
    Object.assign(item,next,{id:oldId});data.generatedCount++;
  }
  while(data.dictations.filter(d=>d.kind==='dopasowane'&&!d.attempts).length<2)queueNextDictation();
}
ensureSeedDictations = () => {
  data=league.normalize(data);
  for(let i=0;i<TEXTS.length;i++){
    const id='base-'+(i+1),saved=data.dictations.find(d=>d.id===id),story=league.enrich(TEXTS[i]);
    if(!saved)data.dictations.push({...story,id,kind:'startowe',attempts:0,lastScore:null,contentVersion:4,createdAt:today()});
    else {if(!saved.attempts)Object.assign(saved,story,{attempts:0,lastScore:saved.lastScore??null,ruleScores:saved.ruleScores||{}});else saved.words=league.enrich(saved).words;saved.contentVersion=5;}
  }
  for(const item of data.dictations){
    if(!Array.isArray(item.sentences)||item.sentences.length!==3||(!item.attempts&&OrtoLigaCore.tokens((item.sentences||[]).join(' ')).words.length>20)||OrtoLigaCore.forbidden.test(item.sentences.join(' '))){const safe=league.enrich(TEXTS[0]);Object.assign(item,safe,{lastScore:null,ruleScores:{}});}
    else item.words=league.enrich(item).words;
  }
  ensureAdaptiveQueue(true);persistAccount(syncUser?.id);
};
buildText = () => league.generate(data,[],today(),[...TEXTS,...EXPANSION_TEXTS]);
buildBankText = buildText;
wordsForNext = () => league.diagnosis(data,today()).words.map(x=>x.word);
const oldStartDictation=startDictation;
startDictation = id => {if(!id&&data.sessions.length)id=data.dictations.find(d=>d.kind==='dopasowane'&&!d.attempts)?.id;oldStartDictation(id);manualBoundaries=[];manualStripIndex=0;trainingStarted=Date.now();renderJokeReward();};
generateCategoryDictation = () => {
  const groups=[...document.querySelectorAll('#category-picker input:checked')].map(x=>x.value);
  if(!groups.length||groups.length>3)return;
  try{const item=createTraining(groups,'wybrane zasady');data.dictations.push(item);data.generatedCount++;save();startDictation(item.id);}
  catch(error){document.getElementById('generator-message').textContent=error.message;}
};

function renderAdaptiveHome(){
  let panel=document.getElementById('adaptive-home');if(!panel){panel=document.createElement('div');panel.id='adaptive-home';panel.className='adaptive-home';document.querySelector('#view-home .hero').after(panel);}
  const ready=data.dictations.filter(d=>d.kind==='dopasowane'&&!d.attempts).slice(0,2);
  panel.innerHTML='<h3>🧭 Następne treningi dla Ciebie</h3><p>Dobieramy je do Twoich wyników i terminów powtórek. Po każdym dyktandzie plan się aktualizuje.</p><div class="adaptive-ready">'+ready.map(d=>`<article><b>${esc(d.title)}</b><p>${esc(d.adaptation||'Nowa historia na spokojny trening.')}</p><button class="secondary" onclick="startDictation('${d.id}')">Rozpocznij →</button></article>`).join('')+'</div>';
}
renderArchive = () => {
  const entries=[...data.dictations].sort((a,b)=>Number(!b.attempts)-Number(!a.attempts)||(b.createdAt||'').localeCompare(a.createdAt||''));
  document.getElementById('dictation-archive').innerHTML=entries.map(d=>`<article class="archive-card"><div class="archive-card-top"><span class="archive-kind">${d.kind==='startowe'?'🌱 DYKTANDO STARTOWE':d.kind==='wybrane zasady'?'🧩 WYBRANE ZASADY':'🧭 DLA CIEBIE'}</span><span class="archive-attempts">${d.attempts||0} prób</span></div><h3>${esc(d.title)}</h3><p>${esc(d.adaptation||'Spójna historia do spokojnego treningu.')}</p><p>3 zdania · ${d.lastScore==null?'Jeszcze niećwiczone':'Ostatni wynik: '+d.lastScore+'%'}</p><div class="archive-rules">${Object.entries(d.ruleScores||{}).map(([g,v])=>`<span>${ruleIcon(g)} ${esc(g)} ${v.score}%</span>`).join('')}</div><button class="secondary" onclick="startDictation('${esc(d.id)}')">${d.attempts?'Ćwicz ponownie':'Rozpocznij'} →</button></article>`).join('');
};
renderDictationRules = () => {
  const el=document.getElementById('dictation-rules');if(!currentText||!el)return;
  const parsed=OrtoLigaCore.tokens(currentText.sentences.join(' ')),counts={};
  for(const word of parsed.words)for(const g of league.groups(word))counts[g]=(counts[g]||0)+1;
  counts['Wielka litera']=parsed.words.filter(OrtoLigaCore.upper).length;
  counts['Przecinki i interpunkcja']=parsed.gaps.filter(Boolean).length;
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  el.innerHTML=Object.entries(counts).filter(([,n])=>n).map(([g,n])=>{const row=data.ruleStats[g],pct=Math.round(n/total*100);return `<div class="dictation-rule-chip"><span>${ruleIcon(g)} ${esc(g)}</span><b>${pct}%</b><small>Udział ćwiczeń · Twój wynik: ${row?.total?rulePct(row)+'%':'jeszcze niećwiczone'}</small><i><em style="width:${pct}%"></em></i></div>`;}).join('');
  let note=document.getElementById('dictation-adaptation');if(!note){note=document.createElement('p');note.id='dictation-adaptation';note.className='adaptation-note';el.before(note);}note.textContent=currentText.adaptation||'Trzy zdania tworzą jedną historię. Ćwiczymy pisownię, wielkie litery i miejsca znaków.';
};

filterWords = () => {
  const query=OrtoLigaCore.lower(document.getElementById('word-search').value.trim()),grid=document.getElementById('words-grid');let visible=0;
  for(const section of grid.querySelectorAll('.word-category')){let n=0;for(const card of section.querySelectorAll('.word-card')){card.hidden=!!query&&!OrtoLigaCore.lower(card.textContent).includes(query);if(!card.hidden){n++;visible++;}}section.hidden=!n;}
  document.getElementById('word-count').textContent=visible?`${visible} wpisów w bazie`:'Nie znaleziono słowa ani zasady. Spróbuj innego zapytania.';
};
renderWords = () => {
  const grouped=GROUP_ORDER.map(g=>({g,items:BANK.filter(x=>x.group===g).filter((x,i,a)=>a.findIndex(y=>league.key(y.word)===league.key(x.word))===i)}));
  document.getElementById('words-grid').innerHTML=grouped.filter(({items})=>items.length).map(({g,items})=>`<section class="word-category"><div class="word-category-head"><div><h2>${ruleIcon(g)} ${esc(g)}</h2><p>${esc(GROUP_HELP[g])}</p></div><span class="word-category-count">${items.length} słów</span></div><div class="word-category-items">${items.map(x=>{const record=league.lookup(x.word),row=league.stats(data,x.word),total=(row?.correct||0)+(row?.wrong||0);return `<div class="word-card"><small>${league.mastered(row)?'✓ OPANOWANE W POWTÓRKACH':total?'↻ ĆWICZYMY':'NOWE SŁOWO'}</small><p><b>${esc(record?.word||x.word)}</b></p><p>${esc(record?.rule||x.rule)}</p><div class="word-score"><span>✓ ${row?.correct||0} dobrze · ✕ ${row?.wrong||0} błędnie</span><b>${total?wordPct(row)+'%':'—'}</b></div><small>${row?.nextReview?'Powtórka: '+row.nextReview:'Jeszcze niećwiczone'}</small><i class="word-meter"><em style="width:${total?wordPct(row):0}%"></em></i></div>`;}).join('')}</div></section>`).join('');filterWords();
};
renderReview = () => {
  const needs=league.diagnosis(data,today()).words.slice(0,4);document.getElementById('review-count').textContent=needs.length+' słów';
  document.getElementById('review-list').innerHTML=needs.length?needs.map(x=>`<div class="review-row"><div class="review-icon">↻</div><div class="review-text"><b>${esc(league.lookup(x.word)?.word||x.word)}</b><small>${x.due?'Czas na zaplanowaną powtórkę':'Utrwalamy trudny zapis'}</small></div><span class="review-count">${wordPct(league.stats(data,x.word))}%</span></div>`).join(''):'<div class="empty-state">Tu pojawią się słowa do utrwalenia po Twoim pierwszym treningu.</div>';
};
renderSidebarRankings = () => {
  const tried=Object.entries(data.words).filter(([,r])=>r.correct+r.wrong>0);
  const line=([w,r])=>`<div class="side-rank-row"><span>${esc(league.lookup(w)?.word||w)} <small>(${r.correct+r.wrong} prób)</small></span><b>${wordPct(r)}%</b></div>`;
  document.getElementById('top-best-words').innerHTML=tried.slice().sort((a,b)=>wordPct(b[1])-wordPct(a[1])||b[1].correct-a[1].correct).slice(0,5).map(line).join('')||'Poćwicz pierwsze słowa!';
  document.getElementById('top-hard-words').innerHTML=tried.slice().sort((a,b)=>wordPct(a[1])-wordPct(b[1])||b[1].wrong-a[1].wrong).slice(0,5).map(line).join('')||'Każde słowo można opanować.';
};
renderTopics = () => {document.getElementById('topic-progress').innerHTML=GROUP_ORDER.map(g=>{const row=data.ruleStats[g];return `<div class="topic-row"><span>${ruleIcon(g)} ${esc(g)}</span><div class="progress-track"><div class="progress-fill" style="width:${rulePct(row)}%"></div></div><small>${row?.total?rulePct(row)+'%':'—'}</small></div>`;}).join('');};
function orthoSessionXpo(session){return Math.max(0,Math.min(100,Math.round(Number(session.score)||0)));}
function renderOrthoXpo(){const el=document.getElementById('ortho-xpo');if(el)el.textContent=data.sessions.reduce((sum,session)=>sum+orthoSessionXpo(session),0).toLocaleString('pl-PL')+' oXP';}
const oldRenderAll=renderAll;
renderAll = () => {oldRenderAll();document.getElementById('metric-words').textContent=Object.values(data.words).filter(league.mastered).length;document.getElementById('metric-mins').textContent=Math.round(data.sessions.reduce((n,s)=>n+(s.durationSeconds||0),0)/60)+' min';renderAdaptiveHome();renderJokeReward();renderOrthoXpo();};
renderBadges = () => {
  const n=data.sessions.length,mastered=Object.values(data.words).filter(league.mastered).length,best=Math.max(0,...data.sessions.map(x=>x.score||0));
  const badges=[['🌱 Pierwszy krok',n>=1],['🔥 Trzy treningi',n>=3],['🏅 Dziesięć dyktand',n>=10],['💎 Skarbiec słów',mastered>=5],['🎯 Celność 90%',best>=90],['⚡ Seria tygodnia',data.streak>=7]];
  document.getElementById('badges').innerHTML=badges.filter(([,ok])=>ok).map(([label])=>`<div class="topic-row"><span>${label}</span><small>✓</small></div>`).join('')||'<p class="empty-state">Pierwsze odznaki są już blisko!</p>';
};

let ocrWorkerPromise=null,ocrScriptPromise=null,ocrRunId=0;
function loadOcrEngine(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!ocrScriptPromise)ocrScriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('Nie udało się uruchomić OCR.'));script.onerror=()=>reject(new Error('Nie udało się pobrać bezpłatnego silnika OCR.'));document.head.append(script);});
 return ocrScriptPromise.catch(e=>{ocrScriptPromise=null;throw e;});
}
async function getOcrWorker(){
 if(!ocrWorkerPromise)ocrWorkerPromise=(async()=>{const engine=await loadOcrEngine();return engine.createWorker('pol',1,{logger:m=>{if(!m?.status)return;const status=document.getElementById('photo-status');if(status&&m.status!=='recognizing text')status.textContent=m.status==='loading language traineddata'?'Pobieram bezpłatny polski model OCR — zwykle tylko przy pierwszym użyciu…':m.status==='initializing api'?'Przygotowuję rozpoznawanie…':'Przygotowuję bezpłatny OCR…';}});})().catch(e=>{ocrWorkerPromise=null;throw e;});
 return ocrWorkerPromise;
}
function ocrWords(result){return (result?.data?.words||[]).map(w=>({text:String(w.text||'').replace(/[^\p{L}-]/gu,''),confidence:Number(w.confidence)||0})).filter(w=>w.text);}
function prepareOcrImage(file){return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{const scale=Math.min(1,2200/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d',{willReadFrequently:false}).drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Nie udało się przygotować zdjęcia do OCR.')),'image/jpeg',.9);};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Nie udało się otworzyć zdjęcia.'));};image.src=url;});}
function showManualFallback(){const panel=document.getElementById('manual-transcription');panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});}
async function beginPhotoOcr(){
 if(!photoFile||!currentText)return;
 const run=++ocrRunId,status=document.getElementById('photo-status'),fallback=document.getElementById('manual-fallback'),retry=document.getElementById('ocr-retry'),panel=document.getElementById('manual-transcription');
 if(!manualTokens.length)initManualTranscription();panel.hidden=true;fallback.hidden=false;retry.hidden=true;document.getElementById('ocr-raw-box').hidden=true;status.textContent='Przygotowuję bezpłatny OCR. Możesz w każdej chwili wybrać zapis z bloczków.';
 try{
  const image=await prepareOcrImage(photoFile);if(run!==ocrRunId)return;const worker=await getOcrWorker();if(run!==ocrRunId)return;
  await worker.setParameters({tessedit_pageseg_mode:'6'});status.textContent='Czytam zdjęcie — pierwszy przebieg…';
  const first=await worker.recognize(image);if(run!==ocrRunId)return;
  await worker.setParameters({tessedit_pageseg_mode:'11'});status.textContent='Porównuję dwa niezależne odczyty zdjęcia…';
  const second=await worker.recognize(image);if(run!==ocrRunId)return;
  const firstText=String(first?.data?.text||'').trim(),secondText=String(second?.data?.text||'').trim();
  document.getElementById('ocr-raw').textContent=`Odczyt 1:\n${firstText||'Brak odczytu.'}\n\nOdczyt 2:\n${secondText||'Brak odczytu.'}`;document.getElementById('ocr-raw-box').hidden=false;retry.hidden=false;panel.hidden=false;renderManualTranscription();
  status.textContent='Gotowe. OCR pokazuje surowy odczyt ze zdjęcia; pisownię wybierasz samodzielnie w bloczkach.';
 }catch(error){if(run!==ocrRunId)return;panel.hidden=false;retry.hidden=false;status.textContent=(error?.message||'OCR nie zadziałał.')+' Bloczkowy wybór jest gotowy — nic nie trzeba wpisywać ręcznie.';}
}

function manualStrips(){return currentText.sentences.flatMap((_,s)=>{const ids=manualTokens.map((t,i)=>t.sentenceIndex===s?i:-1).filter(i=>i>=0),rows=[];for(let i=0;i<ids.length;i+=5)rows.push({s,ids:ids.slice(i,i+5)});return rows;});}
function manualDisplay(t){if(t.missing)return '';if(t.picked===null)return '';return t.upper?t.picked[0].toLocaleUpperCase('pl')+t.picked.slice(1):t.picked;}
initManualTranscription = () => {
  if(!currentText)return;
  manualTokens=currentText.sentences.flatMap((s,sentenceIndex)=>wordTokens(s).map(word=>({word,variants:spellingOptions(word),picked:null,missing:false,upper:false,punctuation:'',sentenceIndex,finalized:false})));
  manualBoundaries=Array(manualTokens.length+1).fill('');manualStripIndex=0;manualActive=-1;
  document.getElementById('camera-panel').classList.add('active','transcribing');document.getElementById('manual-transcription').hidden=false;document.getElementById('manual-entry-wrap').hidden=true;
  document.getElementById('manual-warning').textContent='';renderManualTranscription();
};
hintForManualToken = t => {
  const item=league.lookup(t.word),g=item?.group||'Inne słowa';
  return `<details class="learning-why" onclick="event.stopPropagation()"><summary>💡 Dlaczego tak?</summary><div class="manual-learning-hint"><b>🧠 ${esc(g)}</b><span>${esc(item?.rule||'Porównaj zapis liter po kolei.')}</span><span><b>Zapamiętaj:</b> ${esc(item?.mnemonic||league.mnemonic(t.word,g))}</span><span class="manual-mnemonic">Zakryj wzór, powiedz wyraz i spróbuj zapisać go z pamięci po zakończeniu dyktanda.</span></div></details>`;
};
function manualCard(i){
  const t=manualTokens[i],picked=t.picked!==null||t.missing,spellOK=!t.missing&&OrtoLigaCore.lower(t.picked)===OrtoLigaCore.lower(t.word),capOK=!!manualDisplay(t)&&OrtoLigaCore.upper(manualDisplay(t))===OrtoLigaCore.upper(t.word),expected=OrtoLigaCore.tokens(currentText.sentences.join(' ')),punctOK=manualBoundaries[i+1]===expected.gaps[i+1]&&(i!==0||manualBoundaries[0]===expected.gaps[0]),allOK=spellOK&&capOK&&punctOK;
  const state=t.finalized?(allOK?' correct-locked':' wrong-locked'):picked?(spellOK?(t.celebrate?' correct-celebrating':' correct-locked'):' wrong-locked'):'';
  const options=t.variants.map((v,j)=>{const chosen=t.picked===v.text,reveal=picked&&!spellOK&&v.correct;return `<button class="manual-option ${chosen?'selected':''} ${reveal?'revealed-correct':''}" onclick="event.stopPropagation();chooseManualVariant(${i},${j})" ${picked?'disabled':''} aria-pressed="${chosen}"><span class="manual-option-mark">${chosen?(spellOK?'✓':'✕'):reveal?'✓':String.fromCharCode(65+j)}</span><span>${esc(t.upper?v.text[0].toLocaleUpperCase('pl')+v.text.slice(1):v.text)}</span></button>`;}).join('');
  const punctuation=['.',','].map(mark=>`<button type="button" class="manual-punctuation-toggle ${manualBoundaries[i+1]?.includes(mark)?'active':''}" onclick="event.stopPropagation();toggleManualPunctuation('${mark}',${i})" aria-label="${mark==='.'?'Dodaj lub usuń kropkę po tym słowie':'Dodaj lub usuń przecinek po tym słowie'}" aria-pressed="${manualBoundaries[i+1]?.includes(mark)||false}" ${t.missing||t.finalized?'disabled':''}>${mark}</button>`).join('');
  return `<article id="manual-word-${i}" class="manual-word-row tone-${i%5}${manualActive===i?' active':''}${state}" onclick="activateManualWord(${i})"><div class="manual-word-top"><span class="manual-word-number">${i+1}</span><span class="manual-word-title">SŁOWO ${i+1}</span><div class="manual-card-tools"><button class="manual-capital ${t.upper?'active':''}" onclick="event.stopPropagation();toggleManualCapital(${i})" ${t.missing||t.finalized?'disabled':''} aria-label="Przełącz wielką literę" aria-pressed="${t.upper}">${t.upper?'a':'A↥'}</button><span class="manual-punctuation-tools">${punctuation}</span><button class="manual-listen-word" onclick="event.stopPropagation();speakManualWord(${i})" aria-label="Odsłuchaj słowo">🔊</button><button class="manual-missing" onclick="event.stopPropagation();markManualMissing(${i})" ${picked?'disabled':''}>${t.missing?'Brak ✓':'Brak'}</button></div><span class="manual-word-picked">${esc(t.missing?'Pominięto':manualDisplay(t)||'Wybierz zapis z kartki')}${t.punctuation?esc(t.punctuation):''}</span></div><div class="manual-options">${options}</div></article>`;
}
renderManualTranscription = () => {
  const root=document.getElementById('manual-sentences');if(!root||!currentText)return;
  const strips=manualStrips(),row=strips[Math.min(manualStripIndex,strips.length-1)];
  const completed=strips.slice(0,manualStripIndex).map((r,n)=>`<details class="completed-strip"><summary>✓ Pasek ${n+1} · ${r.ids.map(i=>esc(manualDisplay(manualTokens[i])||'[brak]')).join(' ')}</summary><div class="manual-strip">${r.ids.map(manualCard).join('')}</div></details>`).join('');
  const allFinal=manualTokens.every(t=>t.finalized);
  root.innerHTML=`<div class="manual-photo-mini"><img src="${esc(photoUrl||'')}" alt="Twoja kartka — podgląd" onclick="this.classList.toggle('zoomed')"><span>Kliknij zdjęcie, aby je powiększyć. Wybieraj dokładnie zapis z kartki.</span></div>${completed}<section class="manual-sentence"><div class="manual-sentence-label">ZDANIE ${row.s+1} · PASEK ${manualStripIndex+1} / ${strips.length}</div><div class="manual-strip">${row.ids.map(manualCard).join('')}</div><button class="primary strip-next" onclick="completeManualStrip()" ${allFinal?'disabled':''}>${manualStripIndex===strips.length-1?'Zatwierdź i sprawdź dyktando':'Zatwierdź pasek i przejdź dalej →'}</button><p class="hint">Wybór zapisu słowa jest ostateczny. Przy każdym słowie zaznacz wielką literę, kropkę lub przecinek zgodnie z kartką.</p></section>`;
  document.getElementById('manual-progress').textContent=manualTokens.filter(t=>t.finalized).length+' / '+manualTokens.length+' zatwierdzonych słów';
  const built=[];for(let i=0;i<manualTokens.length;i++){const t=manualTokens[i],word=t.missing?'<span class="missing-word">brak słowa</span>':t.picked===null?'<span class="unpicked-word">···</span>':esc(manualDisplay(t));built.push(word+esc(manualBoundaries[i+1]||''));}
  document.getElementById('manual-built').innerHTML='<b>Twój zapis:</b> '+built.join(' ');
};
chooseManualVariant = (i,j) => {const t=manualTokens[i],v=t?.variants[j];if(!t||!v||t.picked!==null||t.missing)return;t.picked=v.text;t.isCorrect=v.correct;t.celebrate=!!v.correct;manualActive=i;document.getElementById('manual-warning').textContent='';renderManualTranscription();if(v.correct)window.celebrateAnswer?.(document.getElementById("manual-word-"+i));if(v.correct)setTimeout(()=>{t.celebrate=false;const card=document.getElementById(`manual-word-${i}`);if(card){card.classList.remove('correct-celebrating');card.classList.add('correct-locked');}},1250);};
markManualMissing = i => {const t=manualTokens[i];if(!t||t.picked!==null||t.missing)return;t.missing=true;t.upper=false;manualActive=i;renderManualTranscription();};
toggleManualCapital = i => {const t=manualTokens[i];if(!t||t.missing||t.finalized)return;t.upper=!t.upper;renderManualTranscription();};
toggleManualPunctuation = (mark,i) => {const t=manualTokens[i];if(!t||t.missing||t.finalized||!['.',','].includes(mark))return;const gap=i+1,current=manualBoundaries[gap]||'';manualBoundaries[gap]=current.includes(mark)?current.replace(mark,''):`${current}${mark}`;manualBoundaries[gap]=[',','.'].filter(x=>manualBoundaries[gap].includes(x)).join('');t.punctuation=manualBoundaries[gap];renderManualTranscription();};
resetManualChoices = () => {manualTokens.forEach(t=>{t.picked=null;t.missing=false;t.upper=false;t.punctuation='';t.finalized=false;t.celebrate=false;});manualBoundaries=Array(manualTokens.length+1).fill('');manualStripIndex=0;manualActive=-1;document.getElementById('manual-warning').textContent='';renderManualTranscription();};
function completeManualStrip(){
  const rows=manualStrips(),row=rows[manualStripIndex];if(!row)return;
  if(row.ids.some(i=>manualTokens[i].picked===null&&!manualTokens[i].missing)){document.getElementById('manual-warning').textContent='Wybierz zapis lub „Brak” w każdym bloku tego paska.';return;}
  for(const i of row.ids)manualTokens[i].finalized=true;
  if(manualStripIndex<rows.length-1){manualStripIndex++;manualActive=-1;renderManualTranscription();document.querySelector('#manual-sentences .manual-sentence')?.scrollIntoView({behavior:'smooth',block:'start'});}
  else{renderManualTranscription();checkManualAnswer();}
}
manualAnswer = () => {
  let text=manualBoundaries[0]||'';
  manualTokens.forEach((t,i)=>{const w=manualDisplay(t);if(w)text+=' '+w;text+=manualBoundaries[i+1]||'';});return text.trim();
};
checkManualAnswer = () => {if(manualTokens.some(t=>!t.finalized)){document.getElementById('manual-warning').textContent='Dokończ i zatwierdź wszystkie paski, uwzględniając wielkie litery i interpunkcję.';return;}document.getElementById('typed-answer').value=manualAnswer();checkAnswer({manual:true});};
resetManualChoices = () => {document.getElementById('manual-warning').textContent='Wybory są ostateczne. Możesz ponownie ćwiczyć dyktando z archiwum.';};

function punctuationFeedback(result) {
  const entries=result.punctuation.filter(x=>!x.ok);
  return entries.length?`<div class="rule-card"><b>✍️ Interpunkcja — dokładne miejsca</b>${entries.map(x=>`<p>${x.at===0?'Przed pierwszym słowem':`Po słowie „${esc(result.expected.words[x.at-1])}”`}: ${x.want?'potrzebny znak '+esc(x.want):'bez znaku'}; ${x.got?'na kartce '+esc(x.got):'brak znaku'}.</p>`).join('')}<small>Przecinek oddziela m.in. zdania składowe i wyliczenia. Nie każda pauza w czytaniu wymaga przecinka.</small></div>`:'';
}
checkAnswer = (options={}) => {
  if(!currentText){startDictation();return;}if(currentScored)return;
  const entered=document.getElementById('typed-answer').value.trim();if(!entered&&!options.manual){document.getElementById('typed-answer').focus();return;}
  let manual=null;if(options.manual){manual=manualTokens;manual.boundaries=manualBoundaries;}
  const result=OrtoLigaCore.analyse(currentText.sentences.join(' '),entered,manual),attemptRules={},date=today(),attemptId=crypto.randomUUID();
  const addRule=(g,ok)=>{attemptRules[g]??={correct:0,total:0};attemptRules[g].total++;attemptRules[g].correct+=Number(ok);data.ruleStats[g]??={correct:0,total:0};data.ruleStats[g].total++;data.ruleStats[g].correct+=Number(ok);};
  const errors=[],focus=[];
  for(const op of result.ops){if(op.ai<0)continue;const wordInfo=league.lookup(op.a),caseOK=OrtoLigaCore.upper(op.a)===OrtoLigaCore.upper(op.b),ok=op.ok&&caseOK;
    if(!ok)errors.push(league.key(op.a));if(wordInfo){league.record(data,op.a,ok,date,!op.ok&&op.b?op.b:'',attemptId+':'+op.ai);for(const g of league.groups(op.a).filter(g=>!['Wielka litera','Przecinki i interpunkcja'].includes(g)))addRule(g,op.ok);if(!ok)focus.push(wordInfo.word);}}
  if(!options.manual&&result.ops.some(op=>op.ok))window.celebrateAnswer?.(document.getElementById("result"));for(const x of result.capitalization)addRule('Wielka litera',x.ok);for(const x of result.punctuation)addRule('Przecinki i interpunkcja',x.ok);
  const ruleScores=Object.fromEntries(Object.entries(attemptRules).map(([g,r])=>[g,{...r,score:Math.round(r.correct/r.total*100)}]));
  const dict=data.dictations.find(d=>d.id===currentText.id);if(dict){dict.attempts++;dict.lastScore=result.score;dict.lastAttempt=date;dict.ruleScores=ruleScores;}
  data.sessions.push({id:attemptId,createdAt:new Date().toISOString(),date,score:result.score,title:currentText.title,dictationId:currentText.id,errors:[...new Set(errors)],focus:[...new Set(focus)],ruleScores,durationSeconds:Math.max(0,Math.round((Date.now()-(trainingStarted||Date.now()))/1000))});
  if(data.lastDay!==date){data.streak=data.lastDay===OrtoLigaCore.addDays(date,-1)?data.streak+1:1;data.lastDay=date;}
  currentScored=true;ensureAdaptiveQueue(true);save();
  const gapMap=new Map(result.punctuation.map(x=>[x.at,x]));
  const gapHTML=at=>{const x=gapMap.get(at);if(!x)return '';return x.ok?`<span class="between-sign">${esc(x.want)}</span>`:!x.got?`<span class="missing-sign">brak ${esc(x.want)}</span>`:!x.want?`<span class="extra-sign">zbędne ${esc(x.got)}</span>`:`<span class="extra-sign">${esc(x.got)}</span> → <span class="between-sign">${esc(x.want)}</span>`;};
  const diff=result.ops.map(o=>o.ai<0?`<span class="wrong">${esc(o.b)}</span>`:gapHTML(o.ai)+(o.b?(o.ok&&OrtoLigaCore.upper(o.a)===OrtoLigaCore.upper(o.b)?`<span class="right">${esc(o.b)}</span>`:`<span class="wrong">${esc(o.b)}</span> → <span class="right">${esc(o.a)}</span>`):`<span class="missing-word">brak: ${esc(o.a)}</span>`)).join(' ')+gapHTML(result.expected.words.length);
  const cards=[...new Set(focus)].map(w=>hintForManualToken({word:w})).join('');
  const rules=Object.entries(ruleScores).map(([g,r])=>`<div class="attempt-rule"><span>${ruleIcon(g)} ${esc(g)}</span><b>${r.score}%</b><small>${r.correct}/${r.total} poprawnych prób</small><i><em style="width:${r.score}%"></em></i></div>`).join('');
  document.getElementById('result').innerHTML=`<div class="result-card"><h3>${result.score>=90?'Wspaniale! 🌟':result.score>=65?'Dobra praca! 🌱':'Każdy trening pomaga! 💛'} Wynik: ${result.score}% · +${orthoSessionXpo({score:result.score})} oXP</h3><p>Pisownia: ${result.correct}/${result.expected.words.length} słów. Osobno oceniamy wielkie litery oraz znaki w konkretnych przerwach.</p><div class="dictation-result-rules">${rules}</div><div class="diff">${diff}</div>${punctuationFeedback(result)}${cards}<p class="next-dictation-note">🧭 Twoje dwa następne treningi są już w „Moich dyktandach”. Uwzględniają dzisiejsze trudności oraz zaplanowane powtórki.</p><button class="primary" onclick="startDictation()">Następny trening →</button></div>`;
  grantJokeReward(attemptId);renderDictationRules();document.getElementById('result').scrollIntoView({behavior:'smooth',block:'start'});
};

function mergeEnglishLeagueProgress(remote,local,baseline) {
  if(!remote&&!local)return undefined;
  const a=remote||{},b=local||{},base=baseline||{},hasBaseline=!!baseline;
  const idsA=new Set((a.scoreEvents||[]).map(e=>e.id)),idsB=new Set((b.scoreEvents||[]).map(e=>e.id)),baseIds=new Set((base.scoreEvents||[]).map(e=>e.id));
  const sameEvents=idsA.size>0&&idsA.size===idsB.size&&[...idsA].every(id=>idsB.has(id));
  const shared=(a.scoreEvents||[]).filter(e=>idsB.has(e.id)&&!baseIds.has(e.id));
  const duplicate=(key,word)=>shared.filter(e=>word==null||String(e.word)===String(word)).reduce((n,e)=>n+(Number(e[key])||0),0);
  const mergeCount=(remoteValue,localValue,baseValue,subtract=0)=>sameEvents?Math.max(Number(remoteValue)||0,Number(localValue)||0):hasBaseline?Math.max(0,Number(remoteValue||0)+Math.max(0,Number(localValue||0)-Number(baseValue||0))-subtract):Math.max(Number(remoteValue||0),Number(localValue||0));
  const words={};
  for(const id of new Set([...Object.keys(a.words||{}),...Object.keys(b.words||{})])){
    const r=a.words?.[id]||{},l=b.words?.[id]||{},old=base.words?.[id]||{};
    words[id]={...r,...l,correct:mergeCount(r.correct,l.correct,old.correct,duplicate("correctDelta",id)),wrong:mergeCount(r.wrong,l.wrong,old.wrong,duplicate("wrongDelta",id)),attempts:mergeCount(r.attempts,l.attempts,old.attempts,duplicate("correctDelta",id)+duplicate("wrongDelta",id)),last:[r.last,l.last].filter(Boolean).sort().at(-1)||null};
  }
  const history=new Map();
  for(const row of [...(a.history||[]),...(b.history||[])])history.set(row.id||JSON.stringify(row),row);
  const arenaResults=[...new Map([...(a.arenaResults||[]),...(b.arenaResults||[])].map(x=>[x.id,x])).values()];
  const scoreEvents=[...new Map([...(a.scoreEvents||[]),...(b.scoreEvents||[])].map(e=>[e.id,e])).values()],scoringBase=a.scoringBase??b.scoringBase;
  const xp=scoringBase!=null?Math.max(0,Number(scoringBase)+scoreEvents.reduce((n,e)=>n+(Number(e.delta)||0),0)):sameEvents?Math.max(Number(a.xp)||0,Number(b.xp)||0):hasBaseline?Math.max(0,Number(a.xp||0)+Number(b.xp||0)-Number(base.xp||0)):Math.max(Number(a.xp||0),Number(b.xp||0));
  return {...a,...b,arenaResults,...(scoringBase!=null?{scoreEvents,scoringBase}:{}),xp,correct:mergeCount(a.correct,b.correct,base.correct,duplicate('correctDelta')),wrong:mergeCount(a.wrong,b.wrong,base.wrong,duplicate('wrongDelta')),rounds:mergeCount(a.rounds,b.rounds,base.rounds,duplicate('roundDelta')),battles:mergeCount(a.battles,b.battles,base.battles,duplicate('battleDelta')),battleWins:mergeCount(a.battleWins,b.battleWins,base.battleWins,duplicate('winDelta')),streak:Math.max(Number(a.streak)||0,Number(b.streak)||0),bestStreak:Math.max(Number(a.bestStreak)||0,Number(b.bestStreak)||0),words,awards:[...new Set([...(a.awards||[]),...(b.awards||[])])],history:[...history.values()]};
}
function mergeIsolatedProgress(remote,local){const events=new Map();for(const e of [...(remote?.events||[]),...(local?.events||[])])if(e.id)events.set(e.id,e);const rows=[...events.values()].sort((a,b)=>(a.at||'').localeCompare(b.at||'')||a.id.localeCompare(b.id)),words={};for(const e of rows)if(e.word&&(e.kind==='answer'||e.kind==='battle')){const w=words[e.word]??={correct:0,wrong:0};w[e.ok?'correct':'wrong']++;}return {events:rows,words,awards:[...new Set([...(remote?.awards||[]),...(local?.awards||[])])]};}
function mergeAccountProgress(remote,local,baseline) {
  const a=league.normalize(remote),b=league.normalize(local),base=baseline?league.normalize(baseline):null;
  const identity=s=>s.id||JSON.stringify([s.date,s.title,s.score,s.dictationId,s.errors]);
  const sessions=new Map(a.sessions.map(s=>[identity(s),s]));for(const s of b.sessions)sessions.set(identity(s),s);
  const merged={...a,...(a.mathLeague||b.mathLeague?{mathLeague:mergeIsolatedProgress(a.mathLeague,b.mathLeague)}:{}),...(a.spanishLeague||b.spanishLeague?{spanishLeague:mergeIsolatedProgress(a.spanishLeague,b.spanishLeague)}:{}),...(a.orthoBattle||b.orthoBattle?{orthoBattle:mergeIsolatedProgress(a.orthoBattle,b.orthoBattle)}:{}),...(a.englishLeague||b.englishLeague?{englishLeague:mergeEnglishLeagueProgress(a.englishLeague,b.englishLeague,base?.englishLeague)}:{}),sessions:[...sessions.values()].sort((x,y)=>(x.createdAt||x.date||'').localeCompare(y.createdAt||y.date||'')),generatedCount:Math.max(a.generatedCount,b.generatedCount),words:{...a.words},ruleStats:{...a.ruleStats}};
  for(const [word,row] of Object.entries(b.words)){
    const r=a.words[word]||{correct:0,wrong:0,recent:[],variants:[]},previous=base?.words[word]||{correct:0,wrong:0};
    const recent=new Map([...(r.recent||[]),...(row.recent||[])].map((v,i)=>[v.id||JSON.stringify([v.date,v.ok,i]),v]));
    const newer=(row.last||'')>=(r.last||'')?row:r;
    merged.words[word]={...r,...newer,correct:base?r.correct+Math.max(0,row.correct-previous.correct):Math.max(r.correct,row.correct),wrong:base?r.wrong+Math.max(0,row.wrong-previous.wrong):Math.max(r.wrong,row.wrong),recent:[...recent.values()].sort((x,y)=>x.date.localeCompare(y.date)).slice(-10),variants:[...(r.variants||[]),...(row.variants||[])].filter((v,i,all)=>all.findIndex(x=>x.text===v.text)===i)};
  }
  for(const [group,row] of Object.entries(b.ruleStats)){const r=a.ruleStats[group]||{correct:0,total:0},previous=base?.ruleStats[group]||{correct:0,total:0};merged.ruleStats[group]={correct:base?r.correct+Math.max(0,row.correct-previous.correct):Math.max(r.correct,row.correct),total:base?r.total+Math.max(0,row.total-previous.total):Math.max(r.total,row.total)};}
  const dicts=new Map(a.dictations.map(d=>[d.id,d]));
  for(const d of b.dictations){const remoteDict=dicts.get(d.id),old=base?.dictations.find(x=>x.id===d.id);dicts.set(d.id,remoteDict?{...remoteDict,...d,attempts:base?(remoteDict.attempts||0)+Math.max(0,(d.attempts||0)-(old?.attempts||0)):Math.max(remoteDict.attempts||0,d.attempts||0)}:d);}
  merged.dictations=[...dicts.values()];merged.extraWords=[...a.extraWords,...b.extraWords].filter((x,i,all)=>all.findIndex(y=>y.word===x.word)===i);
  const dates=[...new Set(merged.sessions.map(s=>s.date))].sort();merged.lastDay=dates.at(-1)||null;merged.streak=0;let next=merged.lastDay;
  for(let i=dates.length-1;i>=0&&dates[i]===next;i--){merged.streak++;next=OrtoLigaCore.addDays(next,-1);}
  return league.normalize(merged);
}
function guestImportCandidate(){
  const guest=readAccount(null);if(guest?.sessions.length)return {progress:guest,legacy:false};
  const owner=localStorage.getItem('ortoliga-legacy-owner');if(owner&&owner!==syncUser?.id)return null;
  try{const progress=league.normalize(JSON.parse(localStorage.getItem('ortoliga-legacy-unclaimed')||'{}'));return progress.sessions.length?{progress,legacy:true}:null;}catch{return null;}
}
const oldUpdateSyncUi=updateSyncUi;
updateSyncUi = () => {
  oldUpdateSyncUi();let button=document.getElementById('import-guest');
  if(!button){button=document.createElement('button');button.id='import-guest';button.className='secondary';button.onclick=importGuestProgress;document.querySelector('.sync-dialog-actions').after(button);}
  const candidate=guestImportCandidate();button.hidden=!syncUser||!syncReady||!!data.sessions.length||!candidate;
  button.textContent=candidate?.legacy?'Przywróć moje dawne wyniki z tego urządzenia':'Przenieś moje ćwiczenia gościa na to konto';
};
function importGuestProgress(){
  const candidate=guestImportCandidate();if(!syncUser||!syncReady||!candidate||data.sessions.length)return;
  if(!confirm('Przenieść te lokalne ćwiczenia na Twoje konto? Potwierdź tylko wtedy, gdy są to Twoje wyniki.'))return;
  data=league.normalize(candidate.progress);if(candidate.legacy)localStorage.setItem('ortoliga-legacy-owner',syncUser.id);
  ensureSeedDictations();save();updateSyncUi();setSyncStatus('Twoje lokalne ćwiczenia zostały dodane do tego konta.','success');
}
queueCloudSave = () => {if(!syncUser||!syncReady)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>void writeCloudProgress(),700);};
writeCloudProgress = async () => {
  if(!syncClient||!syncUser||!syncReady)return false;
  const userId=syncUser.id;if(accountWrites.has(userId))return accountWrites.get(userId);
  const snapshot=JSON.parse(JSON.stringify(data)),stamp=localStorage.getItem(dirtyKey(userId));
  const job=(async()=>{try{
    const {data:latest,error:readError}=await withTimeout(syncClient.from('student_progress').select('data').eq('user_id',userId).maybeSingle(),15000);if(readError)throw readError;
    let baseline=null;try{baseline=JSON.parse(localStorage.getItem(baseKey(userId))||'null');}catch{}
    const outgoing=latest?.data?mergeAccountProgress(latest.data,snapshot,baseline):snapshot;
    const {error}=await syncClient.from('student_progress').upsert({user_id:userId,data:outgoing,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;
    localStorage.setItem(baseKey(userId),JSON.stringify(outgoing));
    if(syncUser?.id===userId){data=localStorage.getItem(dirtyKey(userId))===stamp?league.normalize(outgoing):mergeAccountProgress(outgoing,data,snapshot);ensureAdaptiveQueue();persistAccount(userId);renderAll();}
    if(localStorage.getItem(dirtyKey(userId))===stamp)localStorage.removeItem(dirtyKey(userId));
    if(syncUser?.id===userId)setSyncStatus('Postępy są zapisane na Twoim koncie.','success');return true;
  }catch(error){window.EduDiagnostics?.record('save_failed');if(syncUser?.id===userId)setSyncStatus('Wyniki zapisano dla Twojego konta na tym urządzeniu. Synchronizacja wróci po odzyskaniu połączenia.','error');return false;}
  finally{accountWrites.delete(userId);}})();
  accountWrites.set(userId,job);const ok=await job;
  if(ok&&syncUser?.id===userId&&localStorage.getItem(dirtyKey(userId)))queueCloudSave();return ok;
};
setSyncUser = async user => {
  const profileRequest=++authProfileSequence;
  if(user&&syncClient){try{const fresh=await withTimeout(syncClient.auth.getUser(),15000);if(profileRequest!==authProfileSequence)return;if(fresh.error)throw fresh.error;if(fresh.data.user?.id!==user.id)return;user=fresh.data.user;}catch{if(profileRequest!==authProfileSequence)return;}}
  const owner=user?.id||null;if(owner&&syncUser?.id===owner&&syncReady){syncUser=user;window.ortoligaSyncUser=user;updateSyncUi();return Promise.resolve();}if(owner&&loadingAccount===owner)return loadingAccountPromise;
  const sequence=++accountLoadSequence;loadingAccount=owner;
  loadingAccountPromise=(async()=>{
    clearTimeout(syncTimer);if(syncUser?.id!==owner){persistAccount(syncUser?.id);resetActiveTraining();}
    await stopStudentPresence();if(sequence!==accountLoadSequence)return;
    syncUser=user;syncReady=false;data=readAccount(owner)||league.normalize({});restoreExtraWords();ensureSeedDictations();renderAll();updateSyncUi();
    if(!user){document.querySelector('.app').classList.remove('sync-loading');showView('home');return;}
    document.querySelector('.app').classList.add('sync-loading');setSyncStatus('Pobieram wyniki Twojego konta…');
    try {
      if(user.user_metadata?.auth_method==='email'){const {error}=await syncClient.rpc('ensure_student_profile',{p_display_name:user.user_metadata.display_name,p_login_key:(user.email||owner).toLowerCase()});if(error)throw error;}
      const {data:row,error}=await withTimeout(syncClient.from('student_progress').select('data,updated_at').eq('user_id',owner).maybeSingle(),15000);if(error)throw error;
      if(sequence!==accountLoadSequence||syncUser?.id!==owner)return;
      if(row?.data){let base=null;try{base=JSON.parse(localStorage.getItem(baseKey(owner))||'null');}catch{}
        data=localStorage.getItem(dirtyKey(owner))?mergeAccountProgress(row.data,data,base):league.normalize(row.data);
        localStorage.setItem(baseKey(owner),JSON.stringify(row.data));}
      ensureSeedDictations();syncReady=true;data.updatedAt=new Date().toISOString();persistAccount(owner,true);renderAll();await writeCloudProgress();
    }catch(error){window.EduDiagnostics?.record('load_failed');if(sequence===accountLoadSequence){syncReady=false;setSyncStatus('Korzystasz z lokalnych wyników tego konta. Nie udało się teraz pobrać danych z chmury.','error');}}
    finally{if(sequence===accountLoadSequence){loadingAccount=null;document.querySelector('.app').classList.remove('sync-loading');updateSyncUi();void startStudentPresence();}}
  })();return loadingAccountPromise;
};
initSync = async () => {
  if(!cloudConfigured()){updateSyncUi();return;}
  const app=document.querySelector('.app');app.classList.add('sync-loading');
  try{if(!window.supabase?.createClient)throw new Error('Brak połączenia z usługą kont.');
    const c=window.ISKIERKA_SYNC_CONFIG;syncClient=window.supabase.createClient(c.url,c.anonKey);
    syncClient.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION')setTimeout(()=>void setSyncUser(session?.user||null),0);});
    const {data:sessionData,error}=await withTimeout(syncClient.auth.getSession(),15000);if(error)throw error;
    if(sessionData?.session)await setSyncUser(sessionData.session.user);else updateSyncUi();
  }catch(error){setSyncStatus('Konta chwilowo niedostępne. Możesz ćwiczyć jako gość.','error');}
  finally{app.classList.remove('sync-loading');}
};
syncSignOut = async (options={}) => {
  if(!syncClient||!syncUser)return;if(!options.confirmed&&!confirm('Wylogować się? Wyniki pozostaną przypisane do Twojego konta.'))return;
  persistAccount(syncUser.id,true);if(syncReady)await writeCloudProgress();
  const {error}=await syncClient.auth.signOut();if(error){setSyncStatus('Nie udało się wylogować. Spróbuj ponownie.','error');return;}
  await setSyncUser(null);setSyncStatus('Wylogowano. Możesz wybrać inne konto albo ćwiczyć jako gość.','success');
};

const oldCloseCamera=closeCamera;
closeCamera = () => {oldCloseCamera();document.getElementById('camera-panel').classList.remove('transcribing');};
const oldToggleCamera=toggleCamera;
toggleCamera = () => {document.getElementById('camera-panel').classList.remove('transcribing');return oldToggleCamera();};

openSyncDialog=()=>{const dialog=document.getElementById('sync-dialog');if(!dialog.open)dialog.showModal();if(!passwordRecoveryActive)setAuthMode(syncUser?'account':'login');if(!syncUser)window.ortoligaWelcomeLoginStarted?.();if(!cloudConfigured())setSyncStatus('Nie udało się połączyć z kontem. Sprawdź internet.','error');};
let authSignUpPending=false;
syncSignUp=async()=>{
 if(authSignUpPending)return;
 if(!syncClient){setSyncStatus('Nie udało się połączyć z kontem. Odśwież stronę.','error');return;}
 const displayName=document.getElementById('student-name').value.normalize('NFC').trim().replace(/\s+/g,' '),email=document.getElementById('student-email').value.trim().toLowerCase(),password=document.getElementById('student-register-password').value,emailInput=document.getElementById('student-email');
 if(displayName.length<2||displayName.length>24||!/^[\p{L}\p{N} _-]+$/u.test(displayName)){setSyncStatus('Wpisz imię lub pseudonim (2–24 znaki), bez nazwiska.','error');return;}
 if(!email||!emailInput.validity.valid){setSyncStatus('Wpisz poprawny adres e-mail.','error');emailInput.focus();return;}
 if(password.length<8){setSyncStatus('Hasło powinno mieć co najmniej 8 znaków.','error');return;}
 const button=document.getElementById('auth-register-submit');authSignUpPending=true;button.disabled=true;setSyncStatus('Sprawdzam dostępność pseudonimu…');
 try{
  const available=await syncClient.rpc('is_student_name_available',{p_name:displayName});
  if(available.error)throw new Error('Nie udało się sprawdzić pseudonimu. Spróbuj za chwilę.');
  if(available.data!==true){setSyncStatus('Ten pseudonim jest już zajęty. Wybierz inny, np. dodaj cyfrę.','error');document.getElementById('student-name').focus();return;}
  setSyncStatus('Zakładam konto…');
  const {data:result,error}=await syncClient.auth.signUp({email,password,options:{data:{display_name:displayName,auth_method:'email'},emailRedirectTo:location.origin+location.pathname}});
  if(error){const check=await syncClient.rpc('is_student_name_available',{p_name:displayName});if(!check.error&&check.data===false)throw new Error('Ten pseudonim jest już zajęty. Wybierz inny, np. dodaj cyfrę.');throw error;}
  document.getElementById('student-register-password').value='';
  if(result.session&&result.user){await setSyncUser(result.user);setSyncStatus('Konto gotowe. Miłego treningu!','success');}
  else setSyncStatus('Konto utworzone. Otwórz wiadomość od EduLigi i potwierdź adres e-mail.','success');
 }catch(error){setSyncStatus(studentAuthError(error),'error');}
 finally{authSignUpPending=false;button.disabled=false;}
};
syncSignIn=async()=>{if(authSignInPending)return;if(!syncClient){setSyncStatus('Nie udało się połączyć z kontem. Odśwież stronę.','error');return;}const identifier=document.getElementById('student-identity').value.trim(),password=document.getElementById('student-password').value;if(!identifier){setSyncStatus('Wpisz e-mail albo imię / pseudonim.','error');return;}if(!password){setSyncStatus('Wpisz hasło.','error');return;}const button=document.getElementById('auth-login-submit');authSignInPending=true;button.disabled=true;button.textContent='Loguję…';setSyncStatus('Loguję…');try{if(identifier.includes('@')){const {data:result,error}=await syncClient.auth.signInWithPassword({email:identifier.toLowerCase(),password});if(error)throw error;await setSyncUser(result.user);}else{const {data:response,error}=await syncClient.functions.invoke('student-auth',{body:{action:'email-login',identifier,password}});if(error){let detail=error.message;try{detail=(await error.context.json()).error||detail;}catch{}throw new Error(detail);}if(response?.error)throw new Error(response.error);const {data:sessionData,error:sessionError}=await syncClient.auth.setSession(response.session);if(sessionError)throw sessionError;if(sessionData.user)await setSyncUser(sessionData.user);}document.getElementById('student-password').value='';setSyncStatus('Zalogowano. Twoje postępy są gotowe.','success');if(document.getElementById('sync-dialog').open)closeSyncDialog();}catch(error){window.EduDiagnostics?.record(window.EduDiagnostics.classify(error));setSyncStatus(studentAuthError(error),'error');window.EduAccessHelp?.show(error);}finally{authSignInPending=false;button.disabled=false;button.textContent='Zaloguj';}};
window.requestPasswordReset=async()=>{if(!syncClient){setSyncStatus('Nie udało się połączyć z kontem.','error');return;}const email=document.getElementById('student-reset-email').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setSyncStatus('Wpisz adres e-mail użyty przy zakładaniu konta.','error');document.getElementById('student-reset-email').focus();return;}setSyncStatus('Wysyłam wiadomość…');try{const {error}=await syncClient.auth.resetPasswordForEmail(email.toLowerCase(),{redirectTo:location.origin+location.pathname});if(error)throw error;setSyncStatus('Jeśli konto jest powiązane z tym adresem, wysłaliśmy link do zmiany hasła. Sprawdź też spam.','success');}catch(error){setSyncStatus(studentAuthError(error),'error');}};
window.saveRecoveredPassword=async()=>{const password=document.getElementById('student-new-password').value;if(password.length<8){setSyncStatus('Nowe hasło powinno mieć co najmniej 8 znaków.','error');return;}try{const {error}=await syncClient.auth.updateUser({password});if(error)throw error;passwordRecoveryActive=false;document.querySelector('.auth-tabs').hidden=false;document.getElementById('student-new-password').value='';setAuthMode('login');setSyncStatus('Hasło zmienione. Możesz już się zalogować.','success');}catch(error){setSyncStatus(studentAuthError(error),'error');}};
initSync=async()=>{if(!cloudConfigured()){updateSyncUi();return;}const app=document.querySelector('.app');app.classList.add('sync-loading');try{if(!window.supabase?.createClient)throw new Error('Brak połączenia z obsługą kont.');syncClient=window.supabase.createClient(window.ISKIERKA_SYNC_CONFIG.url,window.ISKIERKA_SYNC_CONFIG.anonKey);window.ortoligaSyncClient=syncClient;syncClient.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){passwordRecoveryActive=true;document.getElementById('auth-login-fields').hidden=true;document.getElementById('auth-register-fields').hidden=true;document.getElementById('auth-recovery-fields').hidden=false;document.getElementById('auth-reset-fields').hidden=true;document.getElementById('auth-reset-submit').hidden=true;document.getElementById('auth-title').textContent='Ustaw nowe hasło';document.querySelector('.auth-tabs').hidden=true;document.getElementById('auth-login-submit').hidden=true;document.getElementById('auth-register-submit').hidden=true;if(!document.getElementById('sync-dialog').open)document.getElementById('sync-dialog').showModal();setSyncStatus('Ustaw nowe hasło do swojego konta.','success');}if(event!=='INITIAL_SESSION')setTimeout(()=>void setSyncUser(session?.user||null),0);});const {data:sessionData,error}=await withTimeout(syncClient.auth.getSession(),15000);if(error)throw error;if(sessionData?.session)await setSyncUser(sessionData.session.user);else updateSyncUi();}catch(error){setSyncStatus(error.message||'Konta chwilowo niedostępne.','error');}finally{app.classList.remove('sync-loading');}};
const previousSetSyncUser=setSyncUser;setSyncUser=user=>{if(user&&!passwordRecoveryActive)document.querySelector('.auth-tabs').hidden=false;return previousSetSyncUser(user);};
const previousSignOut=syncSignOut;syncSignOut=async options=>{await previousSignOut(options);if(!syncUser){document.querySelector('.auth-tabs').hidden=false;setAuthMode('login');}};

let classChatChannel=null,classChatAdmin=false;
function chatMessageNode(message){
 const row=document.createElement('article');row.className='chat-message';
 const who=document.createElement('b');who.textContent=message.sender_name||'Uczeń';
 const body=document.createElement('span');body.textContent=message.removed_at?'Wiadomość usunięta':message.body||'';
 const when=document.createElement('time');when.dateTime=message.created_at||'';when.textContent=message.created_at?new Date(message.created_at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'';
 row.append(who,body,when);
 row.classList.toggle('removed',!!message.removed_at);return row;
}
function appendClassChatMessage(message){
 const box=document.getElementById('chat-messages');if(!box||!message)return;
 const existing=box.querySelector('[data-chat-id="'+message.id+'"]');
 if(message.removed_at){existing?.remove();return;}
 const node=chatMessageNode(message);node.dataset.chatId=message.id;
 if(existing){existing.replaceWith(node);return;}
 box.append(node);while(box.children.length>40)box.firstElementChild.remove();box.scrollTop=box.scrollHeight;
}
async function moderateClassChatMessage(id,restore,button){
 if(!classChatAdmin||!syncUser||button.disabled)return;
 const owner=syncUser.id;button.disabled=true;
 try{
  const {error}=await window.ortoligaSyncClient.rpc('moderate_class_chat_message',{p_message_id:id,p_restore:restore});if(error)throw error;
  if(syncUser?.id!==owner)return;
  const {data:message,error:readError}=await window.ortoligaSyncClient.from('class_chat_messages').select('id,sender_id,sender_name,body,created_at,removed_at').eq('id',id).single();
  if(readError)throw readError;if(syncUser?.id===owner)appendClassChatMessage(message);
 }catch(error){if(syncUser?.id===owner)document.getElementById('chat-status').textContent=error.message||'Nie udało się zmienić wiadomości';}
 finally{button.disabled=false;}
}
let classChatGeneration=0;
async function startClassChat(){classChatAdmin=false;const generation=++classChatGeneration,accountSequence=accountLoadSequence,status=document.getElementById('chat-status'),input=document.getElementById('chat-input'),submit=document.querySelector('.chat-compose button'),box=document.getElementById('chat-messages');if(!status||!input||!submit||!box)return;const chatClient=window.ortoligaSyncClient||syncClient;if(!chatClient){input.disabled=true;submit.disabled=true;status.textContent='Przygotowuję połączenie z kontem…';return;}window.ortoligaSyncClient=chatClient;status.textContent='Sprawdzam konto…';try{const {data:sessionData,error:sessionError}=await chatClient.auth.getSession();if(generation!==classChatGeneration||accountSequence!==accountLoadSequence)return;if(sessionError)throw sessionError;const sessionUser=sessionData?.session?.user||null;if(sessionUser&&syncUser?.id!==sessionUser.id){await previousSetSyncUserForChat(sessionUser);if(generation!==classChatGeneration)return;}if(!sessionUser){if(classChatChannel){await chatClient.removeChannel(classChatChannel);classChatChannel=null;}if(generation!==classChatGeneration)return;box.replaceChildren();input.disabled=true;submit.disabled=true;status.textContent='Zaloguj się, aby dołączyć';return;}window.ortoligaSyncUser=syncUser?.id===sessionUser.id?syncUser:sessionUser;if(classChatChannel){await chatClient.removeChannel(classChatChannel);classChatChannel=null;}if(generation!==classChatGeneration)return;box.replaceChildren();input.disabled=false;submit.disabled=false;status.textContent='Łączę czat z Twoim kontem…';const role=await chatClient.rpc('is_chat_admin');if(generation!==classChatGeneration)return;classChatAdmin=!role.error&&role.data===true;const {data,error}=await chatClient.from('class_chat_messages').select('id,sender_id,sender_name,body,created_at,removed_at').order('created_at',{ascending:false}).limit(30);if(generation!==classChatGeneration)return;if(error)throw error;(data||[]).reverse().forEach(appendClassChatMessage);classChatChannel=chatClient.channel('ortoliga-class-chat').on('postgres_changes',{event:'INSERT',schema:'public',table:'class_chat_messages'},event=>{if(generation===classChatGeneration){appendClassChatMessage(event.new);window.dispatchEvent(new CustomEvent('eduliga-common-message',{detail:event.new}));}}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'class_chat_messages'},event=>{if(generation===classChatGeneration)appendClassChatMessage(event.new)}).subscribe(state=>{if(generation===classChatGeneration)status.textContent=state==='SUBSCRIBED'?'● Wspólna rozmowa':'Łączenie…';});}catch(error){if(generation!==classChatGeneration)return;status.textContent='Czat chwilowo niedostępny';input.disabled=true;submit.disabled=true;console.warn('Class chat connection failed',error);}}
let chatPollBusy=false;
window.refreshClassChatMessages=async()=>{
 if(chatPollBusy||!syncUser||!window.ortoligaSyncClient)return;
 chatPollBusy=true;const owner=syncUser.id,generation=classChatGeneration;
 try{
  const {data:rows,error}=await window.ortoligaSyncClient.from('class_chat_messages').select('id,sender_id,sender_name,body,created_at,removed_at').order('created_at',{ascending:false}).limit(30);
  if(error)throw error;
  if(syncUser?.id!==owner||generation!==classChatGeneration)return;
  (rows||[]).reverse().forEach(appendClassChatMessage);
 }catch{}finally{chatPollBusy=false;}
};
setInterval(()=>{if(!document.hidden&&document.body.classList.contains('mobile-chat-open'))void window.refreshClassChatMessages();},12000);
window.ortoligaStartClassChat=startClassChat;
window.sendClassChat=async event=>{event.preventDefault();const input=document.getElementById('chat-input'),body=input.value.trim(),chatClient=window.ortoligaSyncClient,chatUser=window.ortoligaSyncUser;if(!body||!chatUser||!chatClient)return;const button=document.querySelector('.chat-compose button');input.disabled=true;button.disabled=true;try{const {error}=await chatClient.from('class_chat_messages').insert({sender_id:chatUser.id,sender_name:'',body});if(error)throw error;input.value='';}catch(error){document.getElementById('chat-status').textContent=error.message?.includes('Odczekaj')?'Odczekaj chwilę':'Nie udało się wysłać';}finally{input.disabled=!window.ortoligaSyncUser;button.disabled=!window.ortoligaSyncUser;if(window.ortoligaSyncUser)input.focus();}};
const previousSetSyncUserForChat=setSyncUser;setSyncUser=async user=>{await previousSetSyncUserForChat(user);window.ortoligaSyncUser=syncUser;if(syncUser?.id!==user?.id)return;await startClassChat();if(syncUser&&!passwordRecoveryActive&&document.getElementById('sync-dialog').open)closeSyncDialog();};
const previousInitSyncForChat=initSync;initSync=async()=>{await previousInitSyncForChat();if(!syncUser)await startClassChat();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void startClassChat();},{once:true});else void startClassChat();
let classChatRefreshTimer=null;const chatAuthButton=document.getElementById('sync-open');if(chatAuthButton)new MutationObserver(()=>{clearTimeout(classChatRefreshTimer);classChatRefreshTimer=setTimeout(()=>void startClassChat(),80);}).observe(chatAuthButton,{childList:true,subtree:true,characterData:true});
let classChatBootAttempts=0;const classChatBootTimer=setInterval(()=>{const chatClient=window.ortoligaSyncClient||syncClient;if(chatClient){window.ortoligaSyncClient=chatClient;clearInterval(classChatBootTimer);void startClassChat();}else if(++classChatBootAttempts>=60)clearInterval(classChatBootTimer);},250);

// Confirmation is requested explicitly by the account owner; no automatic e-mails.
window.resendAccountConfirmation=async()=>{
 const email=document.getElementById('student-reset-email').value.trim().toLowerCase(),button=document.getElementById('auth-confirm-resend');
 if(!syncClient){setSyncStatus('Brak połączenia z kontem.','error');return;}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setSyncStatus('Wpisz adres e-mail użyty do rejestracji.','error');return;}
 button.disabled=true;setSyncStatus('Wysyłam potwierdzenie…');
 try{const {error}=await syncClient.auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;setSyncStatus('Jeśli konto wymaga potwierdzenia, wiadomość została wysłana. Otwórz najnowszy link i sprawdź też spam.','success');}catch(error){setSyncStatus(studentAuthError(error),'error');}finally{button.disabled=false;}
};
