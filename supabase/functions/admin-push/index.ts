import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
const corsBase={"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

function mapped(name:string,prefix:string){try{return Object.values(JSON.parse(Deno.env.get(name)||"{}")).find(v=>typeof v==="string"&&v.startsWith(prefix)) as string|undefined;}catch{return undefined;}}
async function digest(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function validSubscription(s:any){try{const u=new URL(s?.endpoint);return u.protocol==='https:'&&['fcm.googleapis.com','android.googleapis.com'].includes(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.hash&&s.endpoint.length<1800&&/^[A-Za-z0-9_-]{80,100}$/.test(s.keys?.p256dh)&&/^[A-Za-z0-9_-]{20,30}$/.test(s.keys?.auth);}catch{return false;}}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'https://eduliga.web.app';
 const cors={...corsBase,'Access-Control-Allow-Origin':['https://eduliga.web.app','https://czasowstrzymywacz-a11y.github.io'].includes(origin)?origin:'https://eduliga.web.app','Vary':'Origin'};
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return json({error:'Użyj POST.'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')||mapped('SUPABASE_PUBLISHABLE_KEYS','sb_publishable_'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||mapped('SUPABASE_SECRET_KEYS','sb_secret_');
  if(!url||!anon||!secret)return json({error:'Powiadomienia nie są skonfigurowane.'},503);
  const authorization=request.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return json({error:'Zaloguj się ponownie.'},401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:identityError}=await caller.auth.getUser(authorization.slice(7));if(identityError||!identity.user)return json({error:'Zaloguj się ponownie.'},401);
  const user=identity.user;let body:any;try{body=await request.json();}catch{return json({error:'Nieprawidłowe dane.'},400);}
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const heartbeat=body.action==='heartbeat';
  if(!heartbeat){const role=await caller.rpc('is_chat_admin');if(role.error||role.data!==true)return json({error:'Tylko administrator może włączyć te powiadomienia.'},403);}
  async function keys(create=false){
   let r=await admin.from('admin_push_keys').select('public_key,private_key').eq('id',true).maybeSingle();if(r.error)throw r.error;
   if(!r.data&&create){const k=webpush.generateVAPIDKeys();const inserted=await admin.from('admin_push_keys').upsert({id:true,public_key:k.publicKey,private_key:k.privateKey},{onConflict:'id',ignoreDuplicates:true});if(inserted.error)throw inserted.error;r=await admin.from('admin_push_keys').select('public_key,private_key').eq('id',true).single();if(r.error)throw r.error;}
   return r.data;
  }
  async function send(rows:any[],payload:any,k:any){
   if(!k)return {sent:0,failed:0};let sent=0,failed=0;
   await Promise.all(rows.map(async row=>{try{if(!validSubscription(row.subscription)){failed++;return;}
    await webpush.sendNotification(row.subscription,JSON.stringify(payload),{TTL:120,urgency:'normal',timeout:8000,vapidDetails:{subject:'https://eduliga.web.app/',publicKey:k.public_key,privateKey:k.private_key}});sent++;
   }catch(error:any){failed++;if([404,410].includes(error?.statusCode))await admin.from('admin_push_subscriptions').delete().eq('id',row.id);}}));return {sent,failed};
  }
  if(body.action==='config'){const k=await keys(true);return json({publicKey:k!.public_key});}
  if(body.action==='subscribe'){
   const s=body.subscription;if(!validSubscription(s))return json({error:'Nieprawidłowa subskrypcja Androida.'},400);
   const owned=await admin.from('admin_push_subscriptions').select('id').eq('user_id',user.id);if(owned.error)throw owned.error;const id=await digest(s.endpoint);
   if((owned.data?.length||0)>=10&&!owned.data?.some(r=>r.id===id))return json({error:'Limit 10 urządzeń. Wyłącz powiadomienia na starszym telefonie.'},400);
   const stored=await admin.from('admin_push_subscriptions').upsert({id,user_id:user.id,subscription:{endpoint:s.endpoint,expirationTime:null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}},updated_at:new Date().toISOString()},{onConflict:'id'});if(stored.error)throw stored.error;return json({ok:true});
  }
  if(body.action==='unsubscribe'){
   if(typeof body.endpoint!=='string'||body.endpoint.length>1800)return json({error:'Nieprawidłowe urządzenie.'},400);
   const r=await admin.from('admin_push_subscriptions').delete().eq('id',await digest(body.endpoint)).eq('user_id',user.id);if(r.error)throw r.error;return json({ok:true});
  }
  if(body.action==='status'){
   const id=typeof body.endpoint==='string'&&body.endpoint.length<1800?await digest(body.endpoint):'';const r=await admin.from('admin_push_subscriptions').select('id').eq('id',id).eq('user_id',user.id).maybeSingle();if(r.error)throw r.error;return json({enabled:!!r.data});
  }
  if(body.action==='test'){
   const id=typeof body.endpoint==='string'&&body.endpoint.length<1800?await digest(body.endpoint):'';const r=await admin.from('admin_push_subscriptions').select('id,subscription').eq('id',id).eq('user_id',user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)return json({error:'Najpierw włącz powiadomienia na tym telefonie.'},400);
   const result=await send([r.data],{title:'EduLiga · powiadomienia włączone',body:'Ten telefon może otrzymywać informacje o aktywności, również gdy EduLiga jest zamknięta.',tag:'eduliga-push-setup',url:'https://eduliga.web.app/?admin-notifications=1'},await keys());if(!result.sent)return json({error:'Nie udało się wysłać. Włącz ponownie powiadomienia.'},503);return json({ok:true});
  }
  if(heartbeat){
   const league=['ortho','english','spanish','helper'].includes(body.league)?body.league:'none';
   const r=await admin.rpc('claim_student_activity_notice',{p_user_id:user.id,p_league:league});if(r.error)throw r.error;if(!r.data?.notify)return json({ok:true});
   const list=await admin.rpc('get_admin_push_targets',{p_exclude:user.id});if(list.error)throw list.error;
   const names:Record<string,string>={ortho:'OrtoLidze',english:'Lidze Angielskiej',spanish:'Lidze Hiszpańskiej',helper:'Lidze Pomocnika',none:'EduLidze'};
   const delivery=await send(list.data||[],{title:'EduLiga · użytkownik aktywny',body:r.data.name+' rozpoczął aktywność w '+names[league]+'.',tag:'eduliga-active-'+user.id,url:'https://eduliga.web.app/?admin-notifications=1'},await keys());await admin.rpc('record_push_delivery',{p_user_id:user.id,p_targets:list.data?.length||0,p_sent:delivery.sent,p_failed:delivery.failed});return json({ok:true});
  }
  return json({error:'Nieznana operacja.'},400);
 }catch{console.error('Admin push request failed');return json({error:'Powiadomienia chwilowo niedostępne. Spróbuj ponownie.'},503);}
});
