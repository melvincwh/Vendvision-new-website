import vm from 'node:vm';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const template=fs.readFileSync('site.py','utf8');
const bootstrap=template.split("gtm_head = ('''<script>")[1].split("</script>")[0].replace("''' + json.dumps(gtm_id) + '''",'"GTM-P9J6DT9F"');
const site=fs.readFileSync('assets/site.js','utf8'), edge=fs.readFileSync('cloudflare-edge.mjs','utf8');
const origin='https://www.vendvision.co';
const analytics='vendvision_analytics_consent_v1', marketing='vendvision_meta_consent_v1';
const store=()=>{const m=new Map();return {setItem:(k,v)=>m.set(k,v),getItem:k=>m.get(k)??null,removeItem:k=>m.delete(k)}};
for(const A of [false,true]) for(const M of [false,true]){
 const ls=store(),ss=store(),scripts=[];ls.setItem(analytics,A?'granted':'denied');ls.setItem(marketing,M?'granted':'denied');
 const make=()=>({append(){},setAttribute(){},addEventListener(){},querySelector:make});
 const loc=new URL(origin+'/?utm_source=meta&utm_medium=paid&utm_campaign=yearend&private=hidden');loc.reload=()=>{};
 const document={readyState:'loading',head:{append:x=>scripts.push(x.src)},body:make(),createElement:make,addEventListener(){},getElementsByTagName:()=>[{parentNode:{insertBefore:x=>scripts.push(x.src)}}],querySelectorAll:()=>[],querySelector:s=>s.includes('ga4')?{content:'G-7Z47X153CT'}:s.includes('delivery')?{content:'/api/enquiries'}:make()};
 const c={document,location:loc,sessionStorage:ss,localStorage:ls,URL,URLSearchParams,console};c.window=c;vm.createContext(c);
 vm.runInContext(bootstrap,c);vm.runInContext(site,c);
 vm.runInContext("displayMetaConsent();track('whatsapp_click',{journey:'campaign'})",c);
 const has=s=>scripts.some(x=>x.includes(s));assert.equal(has('GTM-P9J6DT9F'),A||M);assert.equal(has('G-7Z47X153CT'),A);assert.equal(has('gj29wj0mfe'),A);assert.equal(has('fbevents'),M);
 assert.equal(c.dataLayer.filter(x=>x[0]==='event').length,A?1:0);assert.equal(c.dataLayer.filter(x=>x.event==='vv_whatsapp_click').length,A?1:0);
 if(M)assert.equal(c.fbq.queue.filter(x=>x[1]==='Contact').length,1);
 assert.equal(vm.runInContext('attribution().campaign',c),A?'yearend':undefined);
 loc.search='?utm_source=meta&utm_medium=paid&utm_id=120248016393100317&utm_campaign=yearend';assert.equal(vm.runInContext('attribution().campaign',c),A?'120248016393100317':undefined);
 loc.search='';assert.equal(vm.runInContext('attribution().source',c),A?'meta':undefined);
 vm.runInContext('savePrivacy(false,false)',c);assert.equal(ss.getItem('vv_session_campaign_v1'),null);
}
console.log('PASS consent matrix, GA4/GTM/Pixel/Clarity loader IDs, event counts, campaign retention and withdrawal');
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('migrations/001_marketing.sql','utf8'));
const env={LEADS_DB:{prepare:q=>({all:()=>db.prepare(q).all(),bind:(...a)=>({run:()=>db.prepare(q).run(...a),first:()=>db.prepare(q).get(...a)})})}};
const worker=(await import('data:text/javascript;base64,'+Buffer.from('const SETTINGS='+JSON.stringify({origin,pages:{},retiredRoutes:[],articleRedirects:{}})+';\n'+edge).toString('base64'))).default;
const post=(p,url='/api/enquiries',extra={})=>{const body=JSON.stringify(p);return new Request(origin+url,{method:'POST',headers:{origin,'content-type':'application/json','content-length':String(Buffer.byteLength(body)),...extra},body})};
const p={id:crypto.randomUUID(),journey:'campaign',analytics:true,marketing:false,fields:{'Your name':'QA','Work email':'qa@example.com'},attribution:{source:'meta',medium:'paid',campaign:'demo'}};
assert.equal((await worker.fetch(post(p),{})).status,503);
assert.equal((await worker.fetch(post(p),env)).status,200);assert.equal((await worker.fetch(post(p),env)).status,200);
assert.equal((await worker.fetch(post({...p,journey:'operator'}),env)).status,409);
assert.equal((await worker.fetch(post({...p,fields:{}}),env)).status,400);
assert.equal(db.prepare('SELECT count(*) n FROM website_enquiries').get().n,1);
db.prepare('UPDATE website_enquiries SET qualified_at=CURRENT_TIMESTAMP,quoted_at=CURRENT_TIMESTAMP').run();
db.prepare("INSERT INTO attributed_sales VALUES ('invoice1',?,12000),('invoice2',?,3000)").run(p.id,p.id);
db.exec("INSERT INTO campaign_daily_spend VALUES(date('now','+8 hours'),'meta','paid','demo',1500)");
const d=db.prepare('SELECT * FROM marketing_dashboard').get();assert.deepEqual([d.leads,d.qualified_leads,d.quoted_leads,d.converted_leads,d.spend_rm,d.collected_rm],[1,1,1,1,15,150]);
const cap={META_CAPI_ACCESS_TOKEN:'mock',META_CAPI_CRM_SECRET:'mock'};const crm={event_name:'Lead',event_id:'qa-event-101',event_time:Math.floor(Date.now()/1000),marketing_consent:true,email:'qa@example.com'};
for (const [consent,auth,status] of [[false,true,400],[true,false,401],[true,true,200]]) {
 globalThis.fetch=async(url,init)=>{const e=JSON.parse(init.body).data[0];assert.equal(e.event_id,crm.event_id);assert.equal(e.user_data.em[0].length,64);return Response.json({events_received:1})};
 assert.equal((await worker.fetch(post({...crm,marketing_consent:consent},'/api/meta-capi',auth?{authorization:'Bearer mock'}:{}),cap)).status,status);
}
console.log('PASS durable intake, retry and conflict handling, validation, unavailable storage, reporting join and mock CAPI consent/auth/receipt');
