/* Small, shared learning affordances: celebrations, task help and real progress charts. */
(() => {
 let lastPoint=null;
 document.addEventListener('pointerdown',e=>lastPoint={x:e.clientX,y:e.clientY,at:Date.now()},true);
 window.celebrateAnswer=node=>{
  const rect=node?.getBoundingClientRect?.(),p=lastPoint&&Date.now()-lastPoint.at<1800?lastPoint:{x:rect?rect.left+rect.width/2:innerWidth/2,y:rect?rect.top+rect.height/2:innerHeight/2};
  const burst=document.createElement('div');burst.className='answer-firework';burst.setAttribute('aria-hidden','true');burst.style.left=Math.min(innerWidth-25,Math.max(25,p.x))+'px';burst.style.top=Math.min(innerHeight-25,Math.max(25,p.y))+'px';
  for(let i=0;i<16;i++){const particle=document.createElement('i'),angle=i*Math.PI/8,distance=35+Math.random()*45;particle.style.setProperty('--dx',Math.cos(angle)*distance+'px');particle.style.setProperty('--dy',Math.sin(angle)*distance+'px');particle.style.setProperty('--spark-color',['#ffd35a','#70c9ff','#a7e58f','#d59cff'][i%4]);burst.append(particle);}
  const star=document.createElement('b');star.textContent='✨';burst.append(star);document.body.append(burst);setTimeout(()=>burst.remove(),950);
 };
 const celebrated=new WeakSet();
 const helpDialog=document.createElement('dialog');helpDialog.className='task-help-dialog';helpDialog.setAttribute('aria-labelledby','task-help-title');helpDialog.innerHTML='<form method="dialog"><button class="point-history-close" aria-label="Zamknij instrukcję">×</button></form><h2 id="task-help-title">Jak wykonać zadanie?</h2><p></p>';document.body.append(helpDialog);
 const guides=[
 ['#english-setup','Wybierz długość serii. W każdym pytaniu uzupełnij luki w pasku: polski, 1. forma i 2. forma. Sprawdź odpowiedź i przejdź dalej. Trening nie ma limitu czasu.'],
 ['#english-question','Wpisz tylko brakujące pola w trzech kolumnach. Głośnik czyta podane słowa. Za poprawną odpowiedź dostajesz 10 aXP, za błędną tracisz 5 aXP.'],
 ['#spanish-panel-cards','Obejrzyj polskie znaczenie i hiszpańskie słowo. Posłuchaj wymowy, odkryj drugą stronę fiszki i wybierz kolejną.'],
 ['#spanish-panel-pairs','Kliknij polski kafelek, a potem pasujące hiszpańskie słowo. Poprawna para daje 10 hXP, pomyłka odejmuje 5 hXP.'],
 ['#spanish-panel-writing','Przeczytaj polskie słowo i wpisz je po hiszpańsku. Hiszpańskie litery á, é, í, ó, ú, ü i ñ znajdziesz na klawiaturze pod polem.'],
 ['#spanish-panel-sentences','Klikaj wyrazy w kolejności, aby ułożyć hiszpańskie zdanie. Kliknięcie wybranego wyrazu cofa go. Na końcu sprawdź zdanie.'],
 ['#spanish-panel-dictionary','Wyszukaj słowo po polsku lub hiszpańsku. Kliknij głośnik, aby usłyszeć hiszpańską wymowę.'],
 ['#view-dictation','Posłuchaj zdań po polsku. Wpisz tekst albo wybieraj właściwą pisownię na kafelkach. Zadbaj także o wielkie litery i znaki interpunkcyjne. Na końcu sprawdź dyktando.'],
 ['#arena-ortho','Masz 30 sekund. Posłuchaj całego zdania i wybierz poprawny zapis w luce. Szybka poprawna odpowiedź daje przewagę. „Nie wiem” kończy Twoją próbę z karą 5 oXP.'],
 ['#arena-english','Masz 30 sekund. Uzupełnij brakujące pola PL / 1. forma / 2. forma. Pierwsza poprawna odpowiedź ma najwięcej punktów i bonus za czas. „Nie wiem” kończy próbę z karą 5 aXP.'],
 ['#arena-spanish','Masz 30 sekund. Wpisz hiszpańskie słowo pokazane po polsku. Możesz użyć klawiatury znaków. „Nie wiem” kończy próbę z karą 5 hXP.']
 ];
 function addHelp(){
  for(const [selector,text] of guides){const root=document.querySelector(selector);if(!root||root.querySelector(':scope > .task-help-button'))continue;const button=document.createElement('button');button.type='button';button.className='task-help-button';button.textContent='ⓘ';button.setAttribute('aria-label','Krótka instrukcja zadania');button.title='Jak wykonać zadanie?';button.onclick=()=>{helpDialog.querySelector('p').textContent=text;if(!helpDialog.open)helpDialog.showModal();};root.prepend(button);}
 }
 function chart(root,key){
  if(!root)return;let panel=root.querySelector('.word-progress-chart');
  if(!panel){panel=document.createElement('section');panel.className='word-progress-chart';root.append(panel);}
  const day=value=>String(value||'').slice(0,10),map=new Map();
  if(key==='english')for(const e of data.englishLeague?.scoreEvents||[]){if(!e.at||Number(e.roundDelta))continue;const d=day(e.at),r=map.get(d)||{points:0,attempts:0,correct:0};r.points+=Number(e.delta)||0;r.attempts++;if(e.delta>0)r.correct++;map.set(d,r);}
  if(key==='ortho')for(const s of data.sessions||[]){const d=day(s.createdAt||s.date);if(!d)continue;const r=map.get(d)||{points:0,attempts:0,correct:0};r.points+=Math.round(Number(s.score)||0);r.attempts++;if(Number(s.score)>=90)r.correct++;map.set(d,r);}
  const points=[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
  if(!points.length){panel.innerHTML='<h2>📈 Postępy w czasie</h2><p>Wykres pojawi się po pierwszych zapisanych ćwiczeniach. Starsze punkty bez daty pozostają w rankingu.</p>';return;}
  const max=Math.max(1,...points.map(([,v])=>Math.abs(v.points))),unit=key==='english'?'aXP':'oXP';
  panel.innerHTML='<h2>📈 Postępy · ostatnie dni nauki</h2><p>Punkty zdobyte w danym dniu, z uwzględnieniem kar. Każdy słupek to zapisane ćwiczenia.</p><div class="progress-day-bars">'+points.map(([d,v])=>'<div class="progress-day"><strong>'+v.points+'</strong><i style="--day-height:'+Math.max(4,Math.abs(v.points)/max*100)+'%;--day-color:'+(v.points<0?'#dc8268':'var(--league-color,#70b08b)')+'"></i><small>'+d.slice(8)+'.'+d.slice(5,7)+'</small></div>').join('')+'</div><table class="sr-only"><caption>Dzienne wyniki '+unit+'</caption><tbody>'+points.map(([d,v])=>'<tr><th>'+d+'</th><td>'+v.points+' '+unit+'</td></tr>').join('')+'</tbody></table>';
 }
 function charts(){chart(document.getElementById('english-panel-progress'),'english');chart(document.getElementById('view-words'),'ortho');}
 let scheduled=false;
 function scan(records){
  for(const record of records){for(const node of record.addedNodes){if(node.nodeType!==1)continue;const candidates=[...(node.matches('.answer-feedback.good,.english-answer-result.good')?[node]:[]),...node.querySelectorAll('.answer-feedback.good,.english-answer-result.good')];for(const good of candidates){if(celebrated.has(good)||good.closest('.arena-feedback'))continue;celebrated.add(good);if(good.getClientRects().length)window.celebrateAnswer(good);}}}
  if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;addHelp();});}
 }
 new MutationObserver(scan).observe(document.querySelector('.app'),{childList:true,subtree:true});
 window.refreshWordProgressCharts=charts;
 window.addEventListener('ortoliga-auth-change',charts);
 window.addEventListener('eduliga-progress-change',charts);
 setInterval(()=>{if(!document.hidden)charts();},15000);
 addHelp();charts();
})();