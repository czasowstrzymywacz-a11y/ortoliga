/* A compact mobile shell; the shared chat DOM and its draft stay intact. */
(() => {
 const bar=document.querySelector('.league-switcher'),originalParent=bar.parentNode,originalNext=bar.nextSibling,sidebarNavigation=document.querySelector('.sidebar-navigation'),mobile=window.matchMedia('(max-width:650px)');
 document.body.append(document.getElementById('sidebar-chat'));
 const fab=document.createElement('button');fab.id='mobile-chat-button';fab.type='button';fab.className='mobile-chat-button';fab.innerHTML='<span aria-hidden="true">💬</span>';fab.setAttribute('aria-label','Otwórz czat');fab.setAttribute('aria-controls','sidebar-chat');fab.setAttribute('aria-expanded','false');document.body.append(fab);
 const close=document.createElement('button');close.type='button';close.className='mobile-chat-close';close.innerHTML='×';close.setAttribute('aria-label','Zamknij czat');document.querySelector('#sidebar-chat header').append(close);
 function setChat(open){if(open)void window.refreshClassChatMessages?.();document.body.classList.toggle('mobile-chat-open',open);fab.setAttribute('aria-expanded',String(open));fab.setAttribute('aria-label',open?'Zamknij czat':'Otwórz czat');fab.innerHTML='<span aria-hidden="true">'+(open?'×':'💬')+'</span>';if(!open)fab.focus({preventScroll:true});}
 fab.onclick=()=>setChat(!document.body.classList.contains('mobile-chat-open'));close.onclick=()=>setChat(false);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('mobile-chat-open'))setChat(false);});
 function shell(){const home=!['ortho','english','spanish'].includes(document.body.dataset.activeLeague);bar.hidden=!home;document.body.classList.toggle('eduliga-home',home);if(mobile.matches){if(bar.parentNode!==sidebarNavigation)sidebarNavigation.append(bar);}else if(bar.parentNode!==originalParent){if(originalNext?.parentNode===originalParent)originalParent.insertBefore(bar,originalNext);else originalParent.prepend(bar);}}
 new MutationObserver(shell).observe(document.body,{attributes:true,attributeFilter:['data-active-league']});mobile.addEventListener('change',shell);shell();
})();
