/* =====================================================================
   PSA-MoM core: pure logic (no DOM, no file I/O).
   Used by the editor (app.js), the viewer, test.js and smoke.js.
   Everything here must stay deterministic and testable in Node.
   ===================================================================== */
'use strict';
const APP_VERSION=/*@VERSION*/'dev',BUILD=/*@BUILD*/'dev',SCHEMA=1;

/* ---------- constants ---------- */
const ITEM_TYPES=['Actie','Beslissing','Info'];
const ACT_STATUS=['Open','In uitvoering','Geblokkeerd','Afgesloten','Geannuleerd'];
const ACT_OPEN=['Open','In uitvoering','Geblokkeerd'];
const ACT_CLOSED=['Afgesloten','Geannuleerd'];
const PRIO=['Laag','Midden','Hoog','Kritiek'];
const MTG_STATUS=['Concept','Definitief'];
const ALG='ALG';                       /* section key of the general ("Algemeen") part of a meeting */
const ALG_REG='_algemeen';             /* register file for actions of general topics */
const VSEP=' || ';                     /* separator of verloop (history) entries */
const NL_MARK='⏎';                     /* line-break marker in _export files */
const ACT_COLS=['id','gi_code','vergadering','datum_geidentificeerd','topic','actie','eigenaar','deadline','prioriteit','status','afgesloten_op','afsluiting','verloop','aangemaakt_door','gewijzigd_door','gewijzigd_op'];
const META_COLS=['gewijzigd_door','gewijzigd_op'];
const PERS_COLS=['naam','email','afdeling','functie','groep'];
const EXTRA_COLS=['email','naam','organisatie','functie','type','actief','sleutel'];
const VALID_STATUSES=['0 not started','1 design','2 execution','3 closing','4 Done','5 on hold','6 not selected'];
const FM_LISTS=['aanwezig','verontschuldigd','projecten'];
const FM_ORDER=['id','datum','type','titel','voorzitter','notulist','aanwezig','verontschuldigd','projecten','status','aangemaakt_door','gewijzigd_door','gewijzigd_op'];
const FM_SCALARS=['id','datum','type','titel','voorzitter','notulist','status','aangemaakt_door','gewijzigd_door','gewijzigd_op'];
const DEFAULT_TYPES=[
 {id:'ee-projectoverleg',naam:'E&E projectoverleg',projectgebonden:true,
  topics:['Veiligheid','Planning & mijlpalen','Budget & PIF','Techniek & ontwerp','Aankoop & contracten','Vergunningen & stakeholders',"Risico's & issues",'Varia']},
 {id:'pmo-review',naam:'PMO-review',projectgebonden:true,topics:['Status & planning','Budget & PIF',"Risico's & issues",'Beslissingen nodig','Varia']},
 {id:'teammeeting',naam:'Teammeeting',projectgebonden:false,topics:['Veiligheid','Mededelingen','Planning & werkverdeling','Opleiding','Varia']}];

/* ---------- dates & strings ---------- */
let _now=null;
function setNow(d){_now=d?new Date(d):null}
const now=()=>_now?new Date(_now.getTime()):new Date();
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=()=>iso(now());
const stamp=(d)=>{d=d||now();return`${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};
const isIsoDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
const fmt=s=>{s=String(s||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:s};
const fmtShort=s=>s?`${s.slice(8,10)}/${s.slice(5,7)}`:'';
const fmtStamp=s=>{s=String(s||'');return s.length>=16?`${fmt(s)} ${s.slice(11,16)}`:fmt(s)};
const fmtMs=ms=>{if(!ms)return'';const d=new Date(ms);return`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
const dd=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return iso(d)};
/* Accepts ISO (2026-11-27), Belgian (27/11/2026, 27-11-2026, 27.11.26) and Excel date-times; returns ISO or '' */
function normDate(v){
 const s=String(v||'').trim();if(!s)return'';
 let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return`${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
 m=s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
 if(m){let y=+m[3];if(y<100)y+=2000;return`${y}-${pad(+m[2])}-${pad(+m[1])}`}
 return s;
}
/* Same for time stamps: keeps hh:mm:ss when present */
function normStamp(v){
 const s=String(v||'').trim();if(!s)return'';
 const d=normDate(s);const t=s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
 return isIsoDate(d)&&t?`${d}T${pad(+t[1])}:${t[2]}:${t[3]||'00'}`:d;
}
const text=v=>v==null?'':String(v).trim();
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const slug=s=>fold(s).replace(/&/g,' en ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'x';
const safeName=n=>String(n).replace(/[\\/:*?"<>|]/g,'_').trim();
function initials(n){return fold(n).replace(/\(.*?\)/g,' ').split(/[\s-]+/).filter(w=>/^[a-z]/.test(w)).map(w=>w[0].toUpperCase()).join('')||'X'}
const uniq=a=>[...new Set(a.filter(x=>x!==''&&x!=null))];
const clone=o=>JSON.parse(JSON.stringify(o));
const oneLine=s=>String(s||'').replace(/\s*\r?\n\s*/g,' ').replace(/\s*\|\|\s*/g,' | ').trim();

/* ---------- file decoding (Excel may save CSV as Windows-1252) ---------- */
function decodeBytes(buf){
 const u=buf instanceof Uint8Array?buf:new Uint8Array(buf);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(u).replace(/^﻿/,'')}
 catch(e){try{return new TextDecoder('windows-1252').decode(u)}catch(x){return new TextDecoder('utf-8').decode(u)}}
}

/* ---------- CSV (; separator, UTF-8 BOM, every field quoted, CRLF) ---------- */
function detectSep(t){
 const line=(t||'').replace(/^﻿/,'').split(/\r?\n/)[0]||'';let q=false;const c={';':0,',':0,'\t':0};
 for(const ch of line){if(ch==='"')q=!q;else if(!q&&ch in c)c[ch]++}
 return c[';']>=c[',']&&c[';']>=c['\t']?';':(c[',']>=c['\t']?',':'\t');
}
function parseCsvRows(t,sep){
 t=(t||'').replace(/^﻿/,'');sep=sep||detectSep(t);const rows=[];let row=[],f='',q=false;
 for(let i=0;i<t.length;i++){const c=t[i];
  if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
  else if(c==='"')q=true;
  else if(c===sep){row.push(f);f=''}
  else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}
  else if(c!=='\r')f+=c}
 if(f!==''||row.length){row.push(f);rows.push(row)}
 return rows;
}
function parseCsv(t,sep){
 const rows=parseCsvRows(t,sep);if(!rows.length)return[];
 const hdr=rows[0].map(x=>x.trim());
 return rows.slice(1).filter(r=>r.some(x=>x.trim()!=='')).map(r=>{const o={};hdr.forEach((k,i)=>{if(k)o[k]=r[i]??''});return o});
}
function toCsv(cols,objs){
 const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 return '﻿'+[cols.map(q).join(';'),...objs.map(o=>cols.map(c=>q(o[c])).join(';'))].join('\r\n')+'\r\n';
}

/* =====================================================================
   Project list (copy of SharePoint list "Project budgets & SNOW ref")
   Logic taken from Project Status Dashboard v4.7.1 (FIELD_KEYS, personName,
   normalizeYear, parseCurrencyValue, formatEuro, statuses + colours).
   ===================================================================== */
const FIELD_KEYS={
 portfolio:['Title','LinkTitle','Portfolio'],year:['field_1','Year'],location:['field_2','Location'],
 budgetCode:['field_3','Budgetcode','Budget code'],project:['field_4','Description'],projectCode:['field_5','Project code','ProjectCode'],
 budget:['field_6','Budget'],pif:['field_7','PIF amount','PIFamount'],status:['field_8','Status'],
 pm:['field_9','PM'],dmnd:['field_11','DMND'],prj:['field_12','PRJ'],pmPerson:['PMPerson','PM (person)','PM person'],
 pmEmail:['PMEmail','PM e-mail','PM email','PMPerson/Email','PMPersonEmail'],listId:['ID','Id','Item ID']};
const OPTIONAL_FIELDS=['pm','pmPerson','pmEmail','listId','dmnd'];
function normalizeYear(value){
 const digits=text(value).replace(/\.0+$/,'').replace(/\D/g,'');
 if(!digits)return'';if(digits.length===4)return digits;if(digits.length===3)return'2'+digits;
 if(digits.length>4)return digits.slice(-4);
 const n=Number(digits);return Number.isFinite(n)?String(2000+n).padStart(4,'0'):'';
}
function parseCurrencyValue(value){
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 let raw=text(value);if(!raw||raw==='-')return 0;
 raw=raw.replace(/[€\s ]/g,'');if(!raw)return 0;
 const lc=raw.lastIndexOf(','),ld=raw.lastIndexOf('.');
 if(lc>=0&&ld>=0){if(lc>ld)raw=raw.replace(/\./g,'').replace(',','.');else raw=raw.replace(/,/g,'')}
 else if(lc>=0){const p=raw.split(',');raw=p.length===2&&p[1].length<=2?p[0].replace(/\./g,'')+'.'+p[1]:raw.replace(/,/g,'')}
 else if(ld>=0){const p=raw.split('.');if(p.length>1&&p.slice(1).every(x=>x.length===3))raw=p.join('')}
 raw=raw.replace(/[^0-9.-]/g,'');const n=Number(raw);return Number.isFinite(n)?n:0;
}
function formatEuro(v){const n=Number.isFinite(Number(v))?Number(v):0;return'€ '+Math.round(n).toLocaleString('nl-BE',{maximumFractionDigits:0})}
const hasMoney=v=>text(v)!==''&&text(v)!=='-';
function normalizeStatus(v){const raw=lookupText(v);return VALID_STATUSES.find(s=>s.toLowerCase()===raw.toLowerCase())||raw}
function statusClass(s){const m=text(s).match(/^([0-6])\b/);return m?'status-'+m[1]:'status-6'}
/* Person / choice / lookup cells: plain text, JSON object/array (Power Automate) or claims string */
function personName(v){
 if(v==null||v==='')return'';
 if(Array.isArray(v))return v.map(personName).filter(Boolean).join('; ');
 if(typeof v==='object')return text(v.title||v.Title||v.displayName||v.DisplayName||v.name||v.LookupValue||v.Value||v.email||v.EMail||v.Email||'');
 const s=text(v);
 if(s[0]==='{'||s[0]==='['){try{return personName(JSON.parse(s))}catch(e){}}
 return s;
}
function personEmail(v){
 if(v==null||v==='')return'';
 if(Array.isArray(v))return v.length?personEmail(v[0]):'';
 if(typeof v==='object')return text(v.Email||v.EMail||v.email||v.mail||(v.Claims?String(v.Claims).split('|').pop():'')).toLowerCase();
 const s=text(v);
 if(s[0]==='{'||s[0]==='['){try{return personEmail(JSON.parse(s))}catch(e){}}
 const m=s.match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);return m?m[0].toLowerCase():'';
}
const lookupText=v=>{const s=text(v);return s[0]==='{'||s[0]==='['?personName(s):s};
/* "GI23111-GI24115" -> [GI23111, GI24115]; "GI25071-24109" -> [GI25071, GI24109]. A bare 5-digit number
   only counts as a GI code when the cell contains at least one explicit "GI" code. */
function parseGiCodes(raw){
 const s=text(raw).toUpperCase();if(!/GI[\s-]?\d{5}/.test(s))return[];
 const out=[];const re=/(?<![A-Z0-9])(?:GI[\s-]?)?(\d{5})(?!\d)/g;let m;
 while((m=re.exec(s))){const c='GI'+m[1];if(!out.includes(c))out.push(c)}
 return out;
}
const isGi=s=>/^GI\d{5}$/.test(s||'');
const isTmp=s=>/^TMP-[a-z0-9-]+$/.test(s||'');
function parseProjectsCsv(t){
 const rows=parseCsvRows(t);if(!rows.length)return{rows:[],projects:[],byGi:{},noGi:[],missing:Object.keys(FIELD_KEYS)};
 const hdr=rows[0].map(x=>x.trim().toLowerCase());const pos={};const missing=[];
 Object.keys(FIELD_KEYS).forEach(k=>{pos[k]=-1;for(const n of FIELD_KEYS[k]){const i=hdr.indexOf(n.toLowerCase());if(i>=0){pos[k]=i;break}}if(pos[k]<0&&!OPTIONAL_FIELDS.includes(k))missing.push(k)});
 if(pos.pm<0&&pos.pmPerson<0)missing.push('pm');
 const out=[];
 rows.slice(1).filter(r=>r.some(x=>x.trim()!=='')).forEach((r,i)=>{
  const c=k=>pos[k]>=0?(r[pos[k]]??''):'';
  const person=c('pmPerson');
  const row={rij:i+1,listId:text(c('listId')),portfolio:lookupText(c('portfolio')),year:normalizeYear(lookupText(c('year'))),location:lookupText(c('location')),
   budgetCode:lookupText(c('budgetCode')),omschrijving:lookupText(c('project')),giRaw:lookupText(c('projectCode')),
   budgetRaw:text(c('budget')),pifRaw:text(c('pif')),status:normalizeStatus(c('status')),
   pmNaam:personName(person)||lookupText(c('pm')),pmEmail:personEmail(c('pmEmail'))||personEmail(person),
   dmnd:lookupText(c('dmnd')),prj:lookupText(c('prj'))};
  row.gi=parseGiCodes(row.giRaw);row.budget=parseCurrencyValue(row.budgetRaw);row.pif=parseCurrencyValue(row.pifRaw);
  out.push(row);
 });
 const g=groupProjects(out);
 return{rows:out,projects:g.projects,byGi:g.byGi,noGi:out.filter(r=>!r.gi.length),missing};
}
/* Groups budget lines by GI code. Display name = description of the most recent row
   (highest year; tie: highest list item ID; tie: first row in the file). */
function groupProjects(rows){
 const byGi={};
 rows.forEach(r=>r.gi.forEach(gi=>{(byGi[gi]=byGi[gi]||{gi,rows:[]}).rows.push(r)}));
 const projects=Object.values(byGi).map(p=>{
  const rs=p.rows;
  const best=rs.reduce((a,b)=>{const ya=+a.year||0,yb=+b.year||0;if(yb!==ya)return yb>ya?b:a;const ia=+a.listId||0,ib=+b.listId||0;return ib>ia?b:a},rs[0]);
  p.rows=[...rs].sort((a,b)=>(+b.year||0)-(+a.year||0)||a.rij-b.rij);
  p.naam=best.omschrijving||p.gi;p.status=best.status;
  p.statuses=uniq(rs.map(r=>r.status));p.pmNamen=uniq(rs.map(r=>r.pmNaam));p.pmEmails=uniq(rs.map(r=>r.pmEmail));
  p.locaties=uniq(rs.map(r=>r.location));p.portfolios=uniq(rs.map(r=>r.portfolio));p.jaren=uniq(rs.map(r=>r.year)).sort();
  p.prj=uniq(rs.map(r=>r.prj));p.dmnd=uniq(rs.map(r=>r.dmnd));
  p.budget=rs.reduce((s,r)=>s+r.budget,0);p.pif=rs.reduce((s,r)=>s+r.pif,0);
  p.zoek=fold([p.gi,...rs.map(r=>[r.omschrijving,r.prj,r.dmnd,r.pmNaam,r.budgetCode,r.location,r.portfolio,r.giRaw].join(' '))].join(' '));
  return p;
 }).sort((a,b)=>a.gi.localeCompare(b.gi));
 return{projects,byGi};
}
/* Multi-select filters (empty set = no filter) + free-text search (all words must match). */
function matchProject(p,f){
 f=f||{};const any=(set,vals)=>!set||!set.size||vals.some(v=>set.has(v));
 if(!any(f.status,p.statuses||[]))return false;if(!any(f.location,p.locaties||[]))return false;
 if(!any(f.portfolio,p.portfolios||[]))return false;if(!any(f.year,p.jaren||[]))return false;if(!any(f.pm,p.pmNamen||[]))return false;
 return matchQuery(p.zoek||fold(p.gi+' '+p.naam),f.q);
}
function matchQuery(hay,q){const w=fold(q).split(/\s+/).filter(Boolean);return w.every(x=>hay.includes(x))}

/* =====================================================================
   People: _bron/personen.csv (SPE/PMO groups) + personen-extra.csv
   ===================================================================== */
function parsePersonen(t){
 const by={};
 parseCsv(t).forEach(o=>{const email=text(o.email).toLowerCase();const naam=text(o.naam);if(!email&&!naam)return;
  const key=email||'ext-'+slug(naam);const gr=text(o.groep).toUpperCase();
  const p=by[key]||(by[key]={key,naam,email,afdeling:text(o.afdeling),functie:text(o.functie),groepen:[],organisatie:'PSA Antwerp',type:'intern',actief:true,bron:'groep'});
  gr.split(/[;,/ ]+/).filter(Boolean).forEach(g=>{if(!p.groepen.includes(g))p.groepen.push(g)});
 });
 return Object.values(by);
}
function extraKey(o){const e=text(o.email).toLowerCase();return text(o.sleutel)||e||'ext-'+slug((text(o.organisatie)?text(o.organisatie)+'-':'')+text(o.naam))}
function parsePersonenExtra(t){
 return parseCsv(t).filter(o=>text(o.naam)||text(o.email)).map(o=>({key:extraKey(o),naam:text(o.naam)||text(o.email),email:text(o.email).toLowerCase(),
  organisatie:text(o.organisatie),functie:text(o.functie),type:/^int/i.test(text(o.type))?'intern':'extern',
  actief:!/^(nee|neen|no|0|false|n)$/i.test(text(o.actief)),afdeling:'',groepen:[],bron:'extra'}));
}
function serializePersonenExtra(list){
 return toCsv(EXTRA_COLS,list.map(p=>({email:p.email,naam:p.naam,organisatie:p.organisatie,functie:p.functie,type:p.type,actief:p.actief===false?'nee':'ja',sleutel:p.key})));
}
/* Combines both sources; the group file wins for name/department/function. Adds badge and ID code. */
function buildPeople(groep,extra){
 const by={};
 (extra||[]).forEach(p=>{by[p.key]=Object.assign({},p)});
 (groep||[]).forEach(p=>{const x=by[p.key];by[p.key]=Object.assign({},x||{},p,{organisatie:p.organisatie||(x&&x.organisatie)||''})});
 const list=Object.values(by).map(p=>Object.assign(p,{badge:p.groepen&&p.groepen.length?p.groepen.join('/'):p.type,zoek:fold([p.naam,p.email,p.organisatie,p.afdeling,p.functie].join(' '))}))
  .sort((a,b)=>a.naam.localeCompare(b.naam,'nl',{sensitivity:'base'}));
 const codes=personCodes(list);list.forEach(p=>p.code=codes[p.key]);
 const byKey={};list.forEach(p=>byKey[p.key]=p);
 return{list,byKey};
}
/* Initials (WM). On a collision, deterministic by key order: first keeps WM, next gets WMa/WMe (extra letters of the last name). */
function personCodes(list){
 const groups={};list.forEach(p=>{const b=initials(p.naam||p.key);(groups[b]=groups[b]||[]).push(p)});
 const out={},used=new Set();
 Object.keys(groups).sort().forEach(b=>{
  groups[b].sort((x,y)=>x.key.localeCompare(y.key)).forEach((p,i)=>{
   let c=b;if(i>0||used.has(c)){const last=fold(p.naam).replace(/[^a-z ]/g,'').split(' ').filter(Boolean).pop()||'x';let k=1;c=b+last.slice(1,2);
    while(used.has(c)){k++;c=k<last.length?b+last.slice(1,k+1):b+k}}
   used.add(c);out[p.key]=c;
  });
 });
 return out;
}
function searchPeople(people,q,opts){
 opts=opts||{};const f=fold(q).trim();const list=people.list.filter(p=>(opts.inactive||p.actief!==false)&&matchQuery(p.zoek,q));if(!f)return list;
 const score=p=>{const n=fold(p.naam);if(n.startsWith(f))return 0;if(n.split(/\s+/).some(w=>w.startsWith(f))||(p.email||'').startsWith(f))return 1;return 2};
 return list.map((p,i)=>[score(p),i,p]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(x=>x[2]);
}
const personLabel=(people,key)=>{if(!key)return'';const p=people&&people.byKey[key];return p?p.naam:key};
function personByName(people,naam){const f=fold(naam).trim();if(!f)return null;return people.list.find(p=>fold(p.naam)===f)||null}

/* =====================================================================
   Configuration (_config.json): meeting types and their topics.
   Topics have a stable number; renaming never touches data. Removing = actief:false.
   ===================================================================== */
function defaultConfig(){return normalizeConfig({schema:SCHEMA,vergadertypes:clone(DEFAULT_TYPES)})}
function normalizeConfig(raw){
 const c=Object.assign({schema:1,vergadertypes:[],instellingen:{}},raw||{});
 c.vergadertypes=(c.vergadertypes||[]).map(t=>({id:t.id||slug(t.naam),naam:t.naam||t.id,projectgebonden:!!t.projectgebonden,actief:t.actief!==false,
  topics:(t.topics||[]).map((x,i)=>typeof x==='string'?{nr:i+1,naam:x,actief:true}:{nr:+x.nr||i+1,naam:x.naam||('Topic '+(i+1)),actief:x.actief!==false}),
  volgorde:Array.isArray(t.volgorde)?t.volgorde.map(Number):null}));
 c.instellingen=Object.assign({exportDebounceSec:10,lockMaxUur:2,versheidDagen:7},c.instellingen||{});
 return c;
}
const typeOf=(cfg,id)=>cfg.vergadertypes.find(t=>t.id===id)||{id,naam:id,projectgebonden:false,topics:[],actief:true};
function topicList(cfg,typeId,all){
 const t=typeOf(cfg,typeId);let ts=t.topics.filter(x=>all||x.actief);
 if(t.volgorde){const o=t.volgorde;ts=[...ts].sort((a,b)=>((o.indexOf(a.nr)+1)||999+a.nr)-((o.indexOf(b.nr)+1)||999+b.nr))}
 return ts;
}
function topicName(cfg,typeId,nr){const x=typeOf(cfg,typeId).topics.find(t=>t.nr===+nr);return x?x.naam:'Topic '+nr}
function topicNrByName(cfg,typeId,name){const f=fold(name).replace(/^\d+[.)]\s*/,'').trim();const x=typeOf(cfg,typeId).topics.find(t=>fold(t.naam)===f);return x?x.nr:null}
function addTopic(cfg,typeId,naam){const t=typeOf(cfg,typeId);const nr=t.topics.reduce((m,x)=>Math.max(m,x.nr),0)+1;t.topics.push({nr,naam:text(naam),actief:true});return nr}
function addType(cfg,naam,projectgebonden,topics){
 let id=slug(naam),i=2;while(cfg.vergadertypes.some(t=>t.id===id))id=slug(naam)+'-'+i++;
 cfg.vergadertypes.push({id,naam:text(naam),projectgebonden:!!projectgebonden,actief:true,topics:(topics&&topics.length?topics:['Varia']).map((n,k)=>({nr:k+1,naam:n,actief:true})),volgorde:null});
 return id;
}
/* Topic reference stored in the action register: "<type>:<nr>" */
const topicRef=(type,nr)=>`${type}:${nr}`;
function parseTopicRef(s){const m=String(s||'').match(/^([a-z0-9-]+):(\d+)$/);return m?{type:m[1],nr:+m[2]}:{type:'',nr:0}}

/* ---------- migrations (schema in _config.json) ----------
   Each migration: {from, to, desc, run(ctx)}; ctx = {cfg, meetings, registers, rewrite:false}.
   The app first copies all data files to _backup/pre-migratie-v<from>/ and then runs them in order. */
const MIGRATIONS=[];
function pendingMigrations(cfg,list){list=list||MIGRATIONS;const cur=(cfg&&cfg.schema)||1;return list.filter(m=>m.from>=cur&&m.to<=SCHEMA_TARGET(list))}
const SCHEMA_TARGET=list=>list.reduce((m,x)=>Math.max(m,x.to),SCHEMA);
function runMigrations(ctx,list){
 list=list||MIGRATIONS;const todo=pendingMigrations(ctx.cfg,list).sort((a,b)=>a.from-b.from);
 todo.forEach(m=>{m.run(ctx);ctx.cfg.schema=m.to});return{applied:todo,rewrite:!!ctx.rewrite};
}

/* =====================================================================
   Meeting file: vergaderingen/YYYY/YYYY-MM-DD_<type>[-n].md
   ===================================================================== */
const MD_HEADER='<!-- PSA-MoM vergadering. Formaat: YAML-kop tussen --- ; per project "## GI-code – naam" of "## Algemeen"; per topic "### <nr>. <naam>" (het NUMMER telt); items "- [Info] tekst", "- [Beslissing] B-id: tekst", "- [Actie] A-id: tekst" (actietekst, eigenaar en deadline staan in acties/*.csv). Vervolgregels inspringen met 2 spaties. Het blok "**Acties (automatisch)**" wordt bij inlezen genegeerd. -->';
function meetingIdFor(datum,type,existing){let id=`${datum}_${type}`,n=2;while(existing.has(id))id=`${datum}_${type}-${n++}`;return id}
const meetingPath=m=>`vergaderingen/${String(m.datum||m.id).slice(0,4)}/${m.id}.md`;
const regKeyFor=sec=>sec===ALG?ALG_REG:sec;
const regPath=key=>`acties/${key}.csv`;
function newMeeting(o){
 const m={id:o.id,datum:o.datum,type:o.type,titel:o.titel||'',voorzitter:o.voorzitter||'',notulist:o.notulist||'',
  aanwezig:[...(o.aanwezig||[])],verontschuldigd:[...(o.verontschuldigd||[])],projecten:[...(o.projecten||[])],status:'Concept',
  aangemaakt_door:o.user||'',gewijzigd_door:o.user||'',gewijzigd_op:stamp(),secties:[],extra:{}};
 if(!o.projectgebonden)ensureSection(m,ALG,'Algemeen');
 m.projecten.forEach(gi=>ensureSection(m,gi,(o.namen&&o.namen[gi])||''));
 if(o.projectgebonden)ensureSection(m,ALG,'Algemeen');
 return m;
}
function ensureSection(m,key,titel){let s=m.secties.find(x=>x.key===key);if(!s){s={key,titel:titel||'',blokken:{}};m.secties.push(s)}else if(titel&&!s.titel)s.titel=titel;return s}
function sectionItems(m,key,nr){const s=m.secties.find(x=>x.key===key);return s&&s.blokken[nr]||[]}
function fmValue(v){return String(v??'').replace(/\r?\n/g,' ')}
function serializeMeeting(m,ctx){
 ctx=ctx||{};const cfg=ctx.cfg||defaultConfig();
 const L=[MD_HEADER,'---'];
 FM_ORDER.forEach(k=>L.push(FM_LISTS.includes(k)?`${k}: [${(m[k]||[]).join(', ')}]`:`${k}: ${fmValue(m[k])}`));
 Object.keys(m.extra||{}).forEach(k=>L.push(`${k}: ${fmValue(m.extra[k])}`));
 L.push('---','');
 const topics=topicList(cfg,m.type,true);
 for(const s of m.secties){
  const kop=s.key===ALG?'Algemeen':`${s.key} – ${(ctx.projName&&ctx.projName(s.key))||s.titel||''}`.replace(/ – $/,'');
  L.push(`## ${kop}`,'');
  const nrs=[...topics.map(t=>t.nr),...Object.keys(s.blokken).map(Number).filter(n=>!topics.some(t=>t.nr===n)).sort((a,b)=>a-b)];
  for(const nr of nrs){
   const items=(s.blokken[nr]||[]).filter(it=>it.type==='Actie'?it.id||text(it.tekst):text(it.tekst));
   if(!items.length)continue;
   L.push(`### ${nr}. ${topicName(cfg,m.type,nr)}`,'');
   items.forEach(it=>{
    let t=it.tekst||'';
    if(it.type==='Actie'&&it.id){const a=ctx.actie&&ctx.actie(it.id);if(a)t=a.actie}
    const lines=String(t).replace(/\r/g,'').split('\n');
    const idp=it.id&&it.type!=='Info'?it.id+': ':'';
    L.push(`- [${it.type}] ${idp}${lines[0]}`.trimEnd());lines.slice(1).forEach(x=>L.push(('  '+x).trimEnd()));
   });
   L.push('');
  }
  const auto=ctx.autoActions?ctx.autoActions(m,s.key):[];
  if(auto.length){
   L.push('**Acties (automatisch)**','');
   auto.forEach(a=>{const closed=ACT_CLOSED.includes(a.status);
    L.push(`- [${closed?'x':' '}] ${a.id} – ${oneLine(a.actie)} (${a.eigenaarNaam||a.eigenaar||'?'}${a.deadline?', deadline '+fmt(a.deadline):''}) – ${a.status}${closed&&a.afsluiting?': '+oneLine(a.afsluiting):''}`)});
   L.push('');
  }
 }
 return L.join('\n').replace(/\n{3,}/g,'\n\n').trimEnd()+'\n';
}
const RE_DEC_ID=/^(B-\d{8}-[A-Za-z]+-\d+)\s*[:–-]?\s*([\s\S]*)$/;
const RE_ACT_ID=/^(A-[A-Za-z0-9-]+-[A-Za-z]+-\d{3,})(?=[\s:–]|$)\s*[:–-]?\s*([\s\S]*)$/;
const TYPE_ALIASES={actie:'Actie',action:'Actie',beslissing:'Beslissing',besluit:'Beslissing',decision:'Beslissing',info:'Info'};
/* opts: {stem, cfg} – cfg lets an un-numbered "### Varia" heading resolve by name */
function parseMeeting(t,opts){
 opts=opts||{};const lines=String(t||'').replace(/^﻿/,'').replace(/\r/g,'').split('\n');
 const m={id:'',datum:'',type:'',titel:'',voorzitter:'',notulist:'',aanwezig:[],verontschuldigd:[],projecten:[],status:'Concept',aangemaakt_door:'',gewijzigd_door:'',gewijzigd_op:'',secties:[],extra:{}};
 let i=0;while(i<lines.length&&(!lines[i].trim()||/^<!--.*-->\s*$/.test(lines[i].trim())))i++;
 if(lines[i]&&lines[i].trim()==='---'){
  i++;let listKey=null;
  for(;i<lines.length&&lines[i].trim()!=='---';i++){
   const l=lines[i];let r;
   if(listKey&&(r=l.match(/^\s+-\s+(.*)$/))){m[listKey].push(r[1].trim().replace(/^["']|["']$/g,''));continue}
   r=l.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);if(!r){listKey=null;continue}
   const k=r[1],v=r[2].trim();listKey=null;
   if(FM_LISTS.includes(k)){m[k]=v.replace(/^\[|\]$/g,'').split(',').map(x=>x.trim().replace(/^["']|["']$/g,'')).filter(Boolean);if(!v)listKey=k}
   else if(FM_SCALARS.includes(k))m[k]=v.replace(/^"(.*)"$/,'$1').replace(/^'(.*)'$/,'$1');
   else m.extra[k]=v;
  }
  i++;
 }
 if(!m.id)m.id=opts.stem||'';
 m.datum=normDate(m.datum)||m.id.slice(0,10);m.status=MTG_STATUS.includes(m.status)?m.status:'Concept';
 if(!m.type){const r=m.id.match(/^\d{4}-\d{2}-\d{2}_(.+?)(?:-\d+)?$/);m.type=r?r[1]:''}
 m.projecten=m.projecten.map(x=>isGi(x.toUpperCase())?x.toUpperCase():x);
 let sec=null,nr=null,auto=false,last=null;
 const cfg=opts.cfg;
 const fallbackNr=()=>{const ts=cfg?topicList(cfg,m.type,true):[];return ts.length?ts[ts.length-1].nr:0};
 const curSec=()=>sec||(sec=ensureSection(m,ALG,'Algemeen'));
 const curBlock=()=>{const s=curSec();const n=nr==null?fallbackNr():nr;return s.blokken[n]||(s.blokken[n]=[])};
 for(;i<lines.length;i++){
  const l=lines[i];let r;
  if((r=l.match(/^##\s+(?!#)(.*?)\s*$/))){
   const head=r[1];auto=false;last=null;nr=null;
   if(/^algemeen\b/i.test(head)){sec=ensureSection(m,ALG,'Algemeen');continue}
   const parts=head.split(/\s+[–—-]\s+/);const code=parts[0].trim();const titel=parts.slice(1).join(' – ').trim();
   const key=isGi(code.toUpperCase())?code.toUpperCase():(isTmp(code)?code:'TMP-'+slug(head));
   sec=ensureSection(m,key,titel||(isTmp(key)&&!isTmp(code)?head:''));
   if(key!==ALG&&!m.projecten.includes(key))m.projecten.push(key);
   continue;
  }
  if((r=l.match(/^###\s+(.*?)\s*$/))){
   auto=false;last=null;const nm=r[1].match(/^(\d+)[.)]?\s*(.*)$/);
   nr=nm?+nm[1]:(cfg?topicNrByName(cfg,m.type,r[1]):null);continue;
  }
  if(/^\*\*Acties \(automatisch\)\*\*/i.test(l.trim())){auto=true;last=null;continue}
  if(auto)continue;
  if(!l.trim())continue;
  if((r=l.match(/^[-*•]\s+(.*)$/))){
   let body=r[1],type='Info',id='';
   const tm=body.match(/^\[([A-Za-zé]+)\]\s*(.*)$/);
   if(tm&&TYPE_ALIASES[tm[1].toLowerCase()]){type=TYPE_ALIASES[tm[1].toLowerCase()];body=tm[2]}
   else if(/^\[[ xX]\]\s*A-/.test(body)){type='Actie';body=body.replace(/^\[[ xX]\]\s*/,'')}
   if(type==='Beslissing'){const d=body.match(RE_DEC_ID);if(d){id=d[1];body=d[2]}}
   if(type==='Actie'){const d=body.match(RE_ACT_ID);if(d){id=d[1];body=d[2].replace(/\s+[–-]\s+(Open|In uitvoering|Geblokkeerd|Afgesloten|Geannuleerd).*$/,'')}}
   last={type,id,tekst:body.trim()};curBlock().push(last);continue;
  }
  if(/^\s{2,}\S/.test(l)&&last){last.tekst+='\n'+l.replace(/^ {2}/,'').replace(/\s+$/,'');continue}
  if(/^<!--/.test(l.trim()))continue;
  last={type:'Info',id:'',tekst:l.trim()};curBlock().push(last);
 }
 m.secties.forEach(s=>{if(s.key!==ALG&&!m.projecten.includes(s.key))m.projecten.push(s.key)});
 return m;
}
/* Type gating: owner, deadline, priority and status only exist for Actie */
function gateItem(it){
 const o={type:ITEM_TYPES.includes(it.type)?it.type:'Info',id:it.id||'',tekst:it.tekst||'',eigenaar:it.eigenaar||'',deadline:it.deadline||'',prioriteit:it.prioriteit||'',status:it.status||''};
 if(o.type!=='Actie'){o.eigenaar='';o.deadline='';o.prioriteit='';o.status=''}
 if(o.type==='Info')o.id='';
 return o;
}
function meetingItems(m){const out=[];m.secties.forEach(s=>Object.keys(s.blokken).forEach(nr=>s.blokken[nr].forEach((it,i)=>out.push({sec:s.key,nr:+nr,i,item:it}))));return out}
function decisionIds(meetings){const out=[];meetings.forEach(m=>meetingItems(m).forEach(x=>{if(x.item.type==='Beslissing'&&x.item.id)out.push(x.item.id)}));return out}

/* =====================================================================
   Action registers: acties/<GI>.csv, acties/_algemeen.csv (source of truth for actions)
   ===================================================================== */
function parseRegister(t){
 return parseCsv(t).filter(o=>text(o.id)||text(o.actie)).map(o=>{const a={};ACT_COLS.forEach(c=>a[c]=text(o[c]));
  ['datum_geidentificeerd','deadline','afgesloten_op'].forEach(c=>a[c]=normDate(a[c]));a.gewijzigd_op=normStamp(a.gewijzigd_op);
  if(!ACT_STATUS.includes(a.status))a.status=ACT_STATUS.find(s=>s.toLowerCase()===a.status.toLowerCase())||'Open';
  if(a.prioriteit&&!PRIO.includes(a.prioriteit))a.prioriteit=PRIO.find(s=>s.toLowerCase()===a.prioriteit.toLowerCase())||'Midden';
  if(a.gi_code)a.gi_code=isGi(a.gi_code.toUpperCase())?a.gi_code.toUpperCase():a.gi_code;
  return a});
}
const serializeRegister=rows=>toCsv(ACT_COLS,rows);
function nextActionId(rows,secKey,code){
 const pre=`A-${secKey===ALG||secKey===ALG_REG?'ALG':secKey}-${code}-`;let mx=0;
 rows.forEach(a=>{if((a.id||'').startsWith(pre)){const n=parseInt(a.id.slice(pre.length),10);if(n>mx)mx=n}});
 return pre+String(mx+1).padStart(3,'0');
}
function nextDecisionId(ids,datum,code){
 const pre=`B-${String(datum).replace(/-/g,'')}-${code}-`;let mx=0;
 ids.forEach(id=>{if(id.startsWith(pre)){const n=parseInt(id.slice(pre.length),10);if(n>mx)mx=n}});
 return pre+String(mx+1).padStart(2,'0');
}
const isOpen=a=>ACT_OPEN.includes(a.status);
const isOverdue=(a,t)=>isOpen(a)&&!!a.deadline&&a.deadline<(t||today());
function touchAction(a,user){a.gewijzigd_door=user||a.gewijzigd_door;a.gewijzigd_op=stamp()}
function addVerloop(a,msg,o){
 o=o||{};const who=[o.code,o.meeting?'vergadering '+o.meeting:''].filter(Boolean).join(', ');
 const e=`${o.datum||today()}: ${oneLine(msg)}${who?` (${who})`:''}`;
 a.verloop=a.verloop?a.verloop+VSEP+e:e;
}
const verloopEntries=v=>String(v||'').split(/\s*\|\|\s*/).map(x=>x.trim()).filter(Boolean);
const verloopMentions=(a,mid)=>verloopEntries(a.verloop).some(e=>e.includes('vergadering '+mid+')'));
function newAction(o){
 const a={};ACT_COLS.forEach(c=>a[c]='');
 Object.assign(a,{id:o.id,gi_code:o.secKey===ALG?'':o.secKey,vergadering:o.meeting||'',datum_geidentificeerd:o.datum||today(),
  topic:o.topic||'',actie:text(o.actie),eigenaar:o.eigenaar||'',deadline:o.deadline||'',prioriteit:o.prioriteit||'Midden',status:'Open',
  aangemaakt_door:o.user||'',gewijzigd_door:o.user||'',gewijzigd_op:stamp()});
 addVerloop(a,'aangemaakt',{code:o.code,meeting:o.meeting});
 return a;
}
/* Each returns an error message (Dutch) or '' when ok. o = {user, code, meeting} */
function shiftDeadline(a,nieuw,reden,o){
 nieuw=normDate(nieuw);if(!isIsoDate(nieuw))return'Kies een geldige nieuwe deadline';
 if(!text(reden))return'Geef een reden voor het verschuiven van de deadline';
 if(nieuw===a.deadline)return'De nieuwe deadline is dezelfde als de huidige';
 addVerloop(a,`deadline ${a.deadline?fmt(a.deadline):'(geen)'} → ${fmt(nieuw)} – reden: ${reden}`,o);a.deadline=nieuw;touchAction(a,o&&o.user);return'';
}
function closeAction(a,c,o){
 const st=c.status||'Afgesloten';if(!ACT_CLOSED.includes(st))return'Ongeldige status';
 if(!text(c.afsluiting))return'Geef de afsluitende actie of beslissing op (verplicht)';
 if(!isOpen(a))return'Deze actie is al afgesloten';
 a.status=st;a.afsluiting=text(c.afsluiting);a.afgesloten_op=normDate(c.datum)||today();
 addVerloop(a,`${st.toLowerCase()}: ${a.afsluiting}`,o);touchAction(a,o&&o.user);return'';
}
function reopenAction(a,reden,o){
 if(isOpen(a))return'Deze actie staat al open';
 if(!text(reden))return'Geef een reden om de actie te heropenen';
 addVerloop(a,`heropend – reden: ${reden} (was ${a.status} op ${fmt(a.afgesloten_op)}: ${a.afsluiting||'-'})`,o);
 a.status='Open';a.afgesloten_op='';a.afsluiting='';touchAction(a,o&&o.user);return'';
}
function setActionStatus(a,st,o){
 if(!ACT_OPEN.includes(st))return'Gebruik "Afsluiten" om een actie af te sluiten of te annuleren';
 if(!isOpen(a))return'Heropen de actie eerst';
 if(a.status===st)return'';addVerloop(a,`status ${a.status} → ${st}`,o);a.status=st;touchAction(a,o&&o.user);return'';
}
function setActionOwner(a,key,o,label){if(a.eigenaar===key)return'';if(a.eigenaar)addVerloop(a,`eigenaar → ${label||key}`,o);a.eigenaar=key;touchAction(a,o&&o.user);return''}

/* =====================================================================
   Merge (3-way with the version loaded from disk as base; base=null = 2-way for conflict copies)
   ===================================================================== */
function mergeVerloop(...vals){
 const seen=new Set(),all=[];vals.forEach(v=>verloopEntries(v).forEach(e=>{if(!seen.has(e)){seen.add(e);all.push(e)}}));
 return all.map((e,i)=>({e,i})).sort((x,y)=>x.e.slice(0,10).localeCompare(y.e.slice(0,10))||x.i-y.i).map(x=>x.e).join(VSEP);
}
/* Without a common base (OneDrive conflict copy) the verloop history tells which side changed which field. */
const VERLOOP_FIELDS=[[/^deadline /,['deadline']],[/^status /,['status']],[/^eigenaar/,['eigenaar']],[/^prioriteit/,['prioriteit']],[/^omschrijving/,['actie']],
 [/^(afgesloten|geannuleerd)/,['status','afsluiting','afgesloten_op']],[/^heropend/,['status','afsluiting','afgesloten_op']]];
function explainedFields(entries){const s=new Set();entries.forEach(e=>{const t=e.replace(/^\d{4}-\d{2}-\d{2}:\s*/,'');VERLOOP_FIELDS.forEach(([re,fs])=>{if(re.test(t))fs.forEach(f=>s.add(f))})});return s}
const newer=(l,r,k)=>String((r&&r[k])||'')>String((l&&l[k])||'')?'remote':'local';
/* returns {rows, conflicts:[{id,kind,fields,local,remote,base,choice}], renames:[{from,to}]}.
   rows contain the default choice for every conflict (newest gewijzigd_op). */
function mergeRows(base,local,remote,o){
 o=o||{};const cols=o.cols||ACT_COLS,union=o.union||['verloop'],meta=o.meta||META_COLS,key=o.key||'id';
 const idx=a=>{const m=new Map();(a||[]).forEach(r=>m.set(r[key],r));return m};
 const B=base?idx(base):null,L=idx(local),R=idx(remote);
 const sig=r=>cols.map(c=>c==='verloop'?verloopEntries(r[c]).join('|'):(r[c]??'')).join('\u0001');
 const eq=(a,b)=>sig(a)===sig(b);
 const out=[],conflicts=[],renames=[];const taken=new Set([...L.keys(),...R.keys()]);
 const fieldMerge=(b,l,r,id)=>{
  const m={},cf=[];const side=newer(l,r,'gewijzigd_op');
  let lx=null,rx=null;
  if(!b){const le=verloopEntries(l.verloop),re=verloopEntries(r.verloop);lx=explainedFields(le.filter(e=>!re.includes(e)));rx=explainedFields(re.filter(e=>!le.includes(e)))}
  cols.forEach(c=>{const bv=b?(b[c]??''):undefined,lv=l[c]??'',rv=r[c]??'';
   if(union.includes(c))m[c]=mergeVerloop(bv||'',lv,rv);
   else if(meta.includes(c))m[c]=side==='remote'?rv:lv;
   else if(lv===rv)m[c]=lv;else if(b&&lv===bv)m[c]=rv;else if(b&&rv===bv)m[c]=lv;
   else if(lx&&rx.has(c)&&!lx.has(c))m[c]=rv;else if(lx&&lx.has(c)&&!rx.has(c))m[c]=lv;
   else{cf.push(c);m[c]=side==='remote'?rv:lv}});
  if(cf.length)conflicts.push({id,kind:'velden',fields:cf,base:b||null,local:l,remote:r,choice:side});
  return m;
 };
 for(const [id,r] of R){
  const l=L.get(id),b=B?B.get(id):undefined;
  if(!l){if(!B||!b||!eq(b,r))out.push(r);continue}             /* new remotely, or local deletion vs remote change */
  if(B&&!b){                                                    /* new on both sides with the same id */
   if(eq(l,r)){out.push(r);continue}
   out.push(r);
   if(o.renumber){const nid=o.renumber(l,taken);taken.add(nid);renames.push({from:id,to:nid});out.push(Object.assign({},l,{[key]:nid}))}
   else out.push(fieldMerge(null,l,r,id));
   continue;
  }
  if(eq(l,r)){out.push(l);continue}
  if(B&&eq(b,l)){out.push(r);continue}
  if(B&&eq(b,r)){out.push(l);continue}
  out.push(fieldMerge(b||null,l,r,id));
 }
 for(const [id,l] of L){if(R.has(id))continue;const b=B?B.get(id):undefined;
  if(B&&b){if(eq(b,l))continue;conflicts.push({id,kind:'verwijderd',fields:[],base:b,local:l,remote:null,choice:'local'})}
  out.push(l);
 }
 return{rows:out,conflicts,renames};
}
/* Applies user choices ('local'|'remote') to the conflicting fields of mergeRows output */
function resolveRows(rows,conflicts,o){
 const key=(o&&o.key)||'id';
 conflicts.forEach(c=>{
  const i=rows.findIndex(r=>r[key]===c.id);
  if(c.kind==='verwijderd'){if(c.choice==='remote'&&i>=0)rows.splice(i,1);return}
  if(i<0)return;const src=c.choice==='remote'?c.remote:c.local;c.fields.forEach(f=>rows[i][f]=src[f]);
 });
 return rows;
}
/* Meeting merge: front matter per field, lists as sets, body per (section, topic) block. */
const itemSig=it=>`${it.type}\u0001${it.id||''}\u0001${it.tekst||''}`;
const itemsSig=a=>(a||[]).map(itemSig).join('\u0002');
function mergeSet(b,l,r){
 if(!b)return uniq([...(l||[]),...(r||[])]);
 const B=new Set(b),Ls=new Set(l),Rs=new Set(r);
 return uniq([...(r||[]),...(l||[])]).filter(x=>!(B.has(x)&&(!Ls.has(x)||!Rs.has(x))));
}
function combineItems(l,r){
 const out=[...l];const ids=new Set(l.map(x=>x.id).filter(Boolean)),sigs=new Set(l.map(itemSig));
 r.forEach(x=>{if(x.id&&ids.has(x.id))return;if(sigs.has(itemSig(x)))return;out.push(x)});return out;
}
function mergeMeeting(base,local,remote){
 const conflicts=[];const side=newer(local,remote,'gewijzigd_op');
 const m=clone(remote);
 FM_SCALARS.forEach(k=>{const b=base?base[k]:undefined,l=local[k],r=remote[k];
  if(META_COLS.includes(k)){m[k]=side==='remote'?r:l;return}
  if(l===r)m[k]=l;else if(base&&l===b)m[k]=r;else if(base&&r===b)m[k]=l;
  else{m[k]=side==='remote'?r:l;conflicts.push({kind:'veld',key:k,base:b,local:l,remote:r,choice:side})}});
 FM_LISTS.forEach(k=>m[k]=mergeSet(base?base[k]:null,local[k],remote[k]));
 m.extra=Object.assign({},remote.extra||{},local.extra||{});
 const secMap=x=>{const o={};(x?x.secties:[]).forEach(s=>o[s.key]=s);return o};
 const SB=base?secMap(base):null,SL=secMap(local),SR=secMap(remote);
 const keys=mergeSet(base?base.secties.map(s=>s.key):null,local.secties.map(s=>s.key),remote.secties.map(s=>s.key));
 const order=uniq([...remote.secties.map(s=>s.key),...local.secties.map(s=>s.key)]).filter(k=>keys.includes(k));
 m.secties=order.map(k=>{
  const b=SB&&SB[k],l=SL[k]||{blokken:{}},r=SR[k]||{blokken:{}};
  const s={key:k,titel:(l.titel||r.titel||''),blokken:{}};
  const nrs=uniq([...Object.keys(l.blokken),...Object.keys(r.blokken),...(b?Object.keys(b.blokken):[])]);
  nrs.forEach(nr=>{const bi=b?b.blokken[nr]||[]:null,li=l.blokken[nr]||[],ri=r.blokken[nr]||[];
   let res;
   if(itemsSig(li)===itemsSig(ri))res=li;
   else if(bi&&itemsSig(bi)===itemsSig(li))res=ri;
   else if(bi&&itemsSig(bi)===itemsSig(ri))res=li;
   else if(!bi&&(!li.length||!ri.length))res=li.length?li:ri;
   else{res=combineItems(li,ri);conflicts.push({kind:'blok',sec:k,nr:+nr,base:bi,local:li,remote:ri,choice:'beide'})}
   if(res.length)s.blokken[nr]=clone(res)});
  return s;
 });
 return{meeting:m,conflicts};
}
function resolveMeeting(m,conflicts){
 conflicts.forEach(c=>{
  if(c.kind==='veld'){m[c.key]=c.choice==='remote'?c.remote:c.local;return}
  const s=m.secties.find(x=>x.key===c.sec);if(!s)return;
  const v=c.choice==='local'?c.local:c.choice==='remote'?c.remote:combineItems(c.local,c.remote);
  if(v.length)s.blokken[c.nr]=clone(v);else delete s.blokken[c.nr];
 });
 return m;
}

/* ---------- OneDrive conflict copies ---------- */
/* "GI22074-LAPTOP-AB12.csv", "GI22074 (1).csv", "x-PC01-2.md" -> name of the original if it exists in `names` */
function conflictOriginal(name,names){
 const m=String(name).match(/^(.*?)(\.[^.]+)$/);if(!m)return null;const [,stem,ext]=m;
 const cands=[];const p=stem.match(/^(.*?)\s*\(\d+\)$/);if(p)cands.push(p[1]);
 const parts=stem.split('-');for(let k=1;k<=3&&k<parts.length;k++)cands.push(parts.slice(0,-k).join('-'));
 for(const c of cands){if(c&&c!==stem&&names.has(c+ext))return c+ext}
 return null;
}
/* A meeting file is a conflict copy when its front-matter id points to another existing file. */
function meetingCopyOriginal(name,parsedId,names){
 const stem=name.replace(/\.md$/i,'');
 if(parsedId&&parsedId!==stem&&names.has(parsedId+'.md'))return parsedId+'.md';
 if(!parsedId)return conflictOriginal(name,names);
 return null;
}
function registerCopyOriginal(name,rows,names){
 const orig=conflictOriginal(name,names);if(!orig)return null;
 const key=orig.replace(/\.csv$/,'');const gi=(rows.find(r=>r.gi_code)||{}).gi_code||'';
 if(key===ALG_REG)return rows.every(r=>!r.gi_code)?orig:null;
 return!rows.length||gi===key?orig:null;
}
const isRegisterName=n=>/^(GI\d{5}|_algemeen|TMP-[a-z0-9-]+)\.csv$/.test(n);

/* ---------- soft locks (advisory) ---------- */
const lockName=mdName=>`.${mdName}.lock`;
function makeLock(user,naam,prev){const t=stamp();return JSON.stringify({gebruiker:user,naam,sinds:(prev&&prev.sinds)||t,ververst:t})}
function lockState(txt,selfKey,maxUur,nowD){
 if(!txt)return{active:false};let l;try{l=JSON.parse(txt)}catch(e){return{active:false}}
 const last=new Date(l.ververst||l.sinds||0).getTime();const age=((nowD||now()).getTime()-last)/36e5;
 return{active:age<(maxUur||2)&&age>-1,own:l.gebruiker===selfKey,lock:l};
}

/* =====================================================================
   Domain helpers: previous meeting, timelines, validation, filters
   ===================================================================== */
const byDate=(a,b)=>a.datum.localeCompare(b.datum)||a.id.localeCompare(b.id);
function previousMeeting(meetings,m){return meetings.filter(x=>x.type===m.type&&x.id!==m.id&&byDate(x,m)<0).sort(byDate).pop()||null}
function previousTopic(meetings,m,sec,nr){
 const list=meetings.filter(x=>x.type===m.type&&x.id!==m.id&&byDate(x,m)<0).sort(byDate);
 for(let i=list.length-1;i>=0;i--){const it=sectionItems(list[i],sec,nr).filter(x=>text(x.tekst)||x.id);if(it.length)return{meeting:list[i],items:it}}
 return null;
}
function projectTimeline(meetings,gi){
 const out=[];meetings.forEach(m=>{const s=m.secties.find(x=>x.key===gi);if(!s)return;
  Object.keys(s.blokken).forEach(nr=>s.blokken[nr].forEach(it=>out.push({meeting:m,nr:+nr,item:it})))});
 return out.sort((a,b)=>byDate(b.meeting,a.meeting)||a.nr-b.nr);
}
/* Definitief needs >=1 attendee and every action of this meeting with owner + deadline */
function validateDefinitief(m,actie){
 const e=[];if(!m.aanwezig.length)e.push('Duid minstens één aanwezige aan');
 meetingItems(m).forEach(x=>{if(x.item.type!=='Actie')return;const a=x.item.id&&actie(x.item.id);
  if(!a){e.push(`Actie "${oneLine(x.item.tekst).slice(0,40)}" is nog niet aangemaakt`);return}
  if(!a.eigenaar)e.push(`${a.id}: eigenaar ontbreekt`);if(!a.deadline)e.push(`${a.id}: deadline ontbreekt`)});
 return e;
}
function matchAction(a,f,ctx){
 f=f||{};const t=f.today||today();
 if(f.eigenaar&&a.eigenaar!==f.eigenaar)return false;
 if(f.project&&(a.gi_code||ALG)!==f.project)return false;
 if(f.type&&parseTopicRef(a.topic).type!==f.type)return false;
 if(f.status==='open'&&!isOpen(a))return false;if(f.status==='gesloten'&&isOpen(a))return false;
 if(f.status&&!['open','gesloten','alle'].includes(f.status)&&a.status!==f.status)return false;
 if(f.overdue&&!isOverdue(a,t))return false;
 if(f.van&&(a.datum_geidentificeerd||'')<f.van)return false;if(f.tot&&(a.datum_geidentificeerd||'')>f.tot)return false;
 if(f.q){const hay=fold([a.id,a.actie,a.afsluiting,a.gi_code,ctx&&ctx.personLabel?ctx.personLabel(a.eigenaar):a.eigenaar,ctx&&ctx.projName?ctx.projName(a.gi_code):''].join(' '));if(!matchQuery(hay,f.q))return false}
 return true;
}
const sortActions=list=>[...list].sort((a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999')||a.id.localeCompare(b.id));

/* =====================================================================
   Paste-and-split (from the 1-op-1 tool, keyword map adapted to project topics)
   ===================================================================== */
const TOPIC_KW=[
 [/veiligheid|safety/,'veiligheid|safety|incident|ongeval|lmra|hsse?|welzijn'],
 [/planning|mijlpal|werkverdeling/,'planning|mijlpal|milestone|timing|schedule|werkverdeling|timeline'],
 [/budget|pif/,'budget|pif|kosten|cost|financ|capex|opex|forecast'],
 [/techn|ontwerp/,'techni|ontwerp|design|engineering|studie'],
 [/aankoop|contract/,'aankoop|contract|procurement|offerte|bestelling|tender|gunning|inkoop'],
 [/vergunning|stakeholder/,'vergunning|permit|stakeholder|elia|poab|havenbedrijf|omgeving'],
 [/risico|issue/,"risico|risk|issue|knelpunt|probleem"],
 [/status/,'status|voortgang|progress'],
 [/beslissing/,'beslissingen? nodig|decisions?|escalat'],
 [/mededeling/,'mededeling|announcement|nieuws'],
 [/opleiding/,'opleiding|training|cursus|leren'],
 [/varia/,'varia|diversen|misc|rondvraag|aob|other|overige']];
function topicMatchers(cfg,typeId){
 return topicList(cfg,typeId).map(t=>{const n=fold(t.naam);const parts=[];
  TOPIC_KW.forEach(([re,kw])=>{if(re.test(n))parts.push(kw)});
  n.split(/[^a-z0-9]+/).filter(w=>w.length>=4).forEach(w=>parts.push(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  return{nr:t.nr,naam:t.naam,kw:new RegExp(parts.join('|')||'^$','i')}});
}
const BUL=/^([•◦▪▫●○■□‣·*\-–—])\s+(.*)$/;
const indentOf=l=>(l.match(/^\s*/)[0].replace(/\t/g,'  ')).length;
function detectHeading(raw,next,matchers){
 if(!raw.trim())return null;
 const ind=indentOf(raw);let s=raw.trim();
 const bold=/^\*\*.+\*\*:?$/.test(s)||/^#{1,6}\s/.test(s);
 const numbered=/^\d{1,2}[.)]\s+\S/.test(s);
 const nextIsChild=!!next&&(indentOf(next)>ind||BUL.test(next.trim()));
 let bulleted=false;const bm=s.match(BUL);
 if(bm&&!bold){if(!(next&&indentOf(next)>ind))return null;bulleted=true;s=bm[2]}
 s=s.replace(/^#{1,6}\s*/,'').replace(/\*\*/g,'').replace(/^\d{1,2}[.)]?\s+/,'');
 let head=s,rest='';const ci=s.indexOf(':');if(ci>0){head=s.slice(0,ci);rest=s.slice(ci+1).trim()}
 head=head.trim();if(!head||head.length>60)return null;
 if(/^(actie|action|ap|todo|beslissing|besluit|decision|info|nb)$/i.test(head))return null;
 const wc=head.split(/\s+/).length;if(wc>(bulleted?5:8))return null;
 let best=null,pos=1e9;for(const t of matchers){const m=fold(head).match(t.kw);if(m&&m.index<pos){pos=m.index;best=t.nr}}
 if(best==null)return null;
 const strong=bold||numbered||ci>0||bulleted;
 if(!strong&&!(nextIsChild||(/^[A-ZÀ-Ý]/.test(head)&&wc<=6)))return null;
 return{nr:best,rest};
}
function normBody(raw){
 let l=raw.replace(/\t/g,'  ').replace(/\s+$/,'');
 const m=l.match(/^(\s*)([•◦▪▫●○■□‣·*\-–—])\s+(.*)$/);
 if(m){const lvl=Math.min(3,Math.floor(m[1].length/2));return'  '.repeat(lvl)+'- '+m[3]}
 if(/^\s{2,}\S/.test(l)&&!/^\s*(-|\d+[.)])\s/.test(l))return'- '+l.trim();
 return l;
}
function splitBlocks(t,matchers){
 const blocks=[];let cur=null;
 const L=String(t||'').replace(/\r/g,'').split('\n').filter(x=>x.trim());
 L.forEach((raw,i)=>{const hd=detectHeading(raw,L[i+1],matchers);
  if(hd){cur={nr:hd.nr,head:raw.trim(),lines:[]};blocks.push(cur);if(hd.rest)cur.lines.push('- '+hd.rest);return}
  if(!cur){cur={nr:null,head:'',lines:[]};blocks.push(cur)}
  cur.lines.push(normBody(raw))});
 return blocks.filter(b=>b.lines.length);
}
const TYPE_PREFIX=[[/^(actie|action|ap|todo|to do)\s*[:\-–]\s*/i,'Actie'],[/^(beslissing|besluit|beslist|decision|decided)\s*[:\-–]\s*/i,'Beslissing'],[/^(info|nb|ter info)\s*[:\-–]\s*/i,'Info']];
/* block lines -> items; top-level lines start an item, deeper lines are appended */
function blockItems(lines){
 const items=[];
 lines.forEach(l=>{const top=!/^\s/.test(l);const body=l.replace(/^\s*-\s+/,'').trim();
  if(top||!items.length){let type='Info',t=body;for(const [re,ty] of TYPE_PREFIX){if(re.test(t)){type=ty;t=t.replace(re,'');break}}items.push({type,id:'',tekst:t})}
  else items[items.length-1].tekst+='\n'+l.replace(/^\s{2}/,'').replace(/^(\s*)-\s+/,'$1- ')});
 return items.filter(x=>x.tekst.trim());
}
function htmlToText(x){
 return String(x).replace(/<(script|style)[\s\S]*?<\/\1>/gi,'').replace(/<li[^>]*>/gi,'\n- ').replace(/<\/(p|div|h\d|tr)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'')
  .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n{3,}/g,'\n\n');
}

/* =====================================================================
   Exports (_export/*.csv, flat, for the SharePoint viewer and Excel)
   ===================================================================== */
const flat=s=>String(s??'').replace(/\r?\n/g,NL_MARK);
const unflat=s=>String(s??'').split(NL_MARK).join('\n');
const EXP_VERG_COLS=['id','datum','jaar','vergadertype','vergadertype_naam','titel','status','voorzitter','voorzitter_naam','notulist','notulist_naam','aanwezig','aanwezig_namen','verontschuldigd_namen','projecten','aantal_beslissingen','aantal_acties','bestand','gewijzigd_door','gewijzigd_op'];
const EXP_MIN_COLS=['vergadering_id','datum','vergadertype','gi_code','projectnaam','topic_nr','topic','type','id','tekst','eigenaar','eigenaar_naam','deadline','status','volgorde'];
const EXP_ACT_COLS=[...ACT_COLS,'eigenaar_naam','projectnaam','pm_naam','vergadertype','topic_naam','achterstallig'];
/* ctx: {cfg, meetings, actions (all registers), people, projName(gi), projPm(gi), today} */
function buildExports(ctx){
 const t=ctx.today||today();const P=k=>personLabel(ctx.people,k);const byId={};ctx.actions.forEach(a=>byId[a.id]=a);
 const pn=gi=>gi&&gi!==ALG?(ctx.projName?ctx.projName(gi):gi):'';
 const ms=[...ctx.meetings].sort(byDate);
 const verg=ms.map(m=>{const it=meetingItems(m);return{id:m.id,datum:m.datum,jaar:m.datum.slice(0,4),vergadertype:m.type,vergadertype_naam:typeOf(ctx.cfg,m.type).naam,titel:m.titel,status:m.status,
  voorzitter:m.voorzitter,voorzitter_naam:P(m.voorzitter),notulist:m.notulist,notulist_naam:P(m.notulist),aanwezig:m.aanwezig.join(', '),aanwezig_namen:m.aanwezig.map(P).join(', '),
  verontschuldigd_namen:m.verontschuldigd.map(P).join(', '),projecten:m.projecten.join(', '),aantal_beslissingen:it.filter(x=>x.item.type==='Beslissing').length,
  aantal_acties:it.filter(x=>x.item.type==='Actie').length,bestand:meetingPath(m),gewijzigd_door:P(m.gewijzigd_door),gewijzigd_op:m.gewijzigd_op}});
 const min=[];
 ms.forEach(m=>{let n=0;const topics=topicList(ctx.cfg,m.type,true);
  m.secties.forEach(s=>{const nrs=uniq([...topics.map(x=>x.nr),...Object.keys(s.blokken).map(Number)]);
   nrs.forEach(nr=>(s.blokken[nr]||[]).forEach(raw=>{
    const a=raw.type==='Actie'&&raw.id?byId[raw.id]:null;
    const g=gateItem(Object.assign({},raw,a?{tekst:a.actie,eigenaar:a.eigenaar,deadline:a.deadline,prioriteit:a.prioriteit,status:a.status}:{}));
    if(!text(g.tekst)&&!g.id)return;
    min.push({vergadering_id:m.id,datum:m.datum,vergadertype:m.type,gi_code:s.key===ALG?'':s.key,projectnaam:pn(s.key),topic_nr:nr,topic:topicName(ctx.cfg,m.type,nr),
     type:g.type,id:g.id,tekst:flat(g.tekst),eigenaar:g.eigenaar,eigenaar_naam:P(g.eigenaar),deadline:g.deadline,status:g.status,volgorde:++n})}))})});
 const act=sortActions(ctx.actions).map(a=>{const tr=parseTopicRef(a.topic);return Object.assign({},a,{actie:flat(a.actie),afsluiting:flat(a.afsluiting),eigenaar_naam:P(a.eigenaar),projectnaam:pn(a.gi_code),
  pm_naam:a.gi_code&&ctx.projPm?ctx.projPm(a.gi_code):'',vergadertype:tr.type,topic_naam:tr.type?topicName(ctx.cfg,tr.type,tr.nr):'',achterstallig:isOverdue(a,t)?'ja':'nee'})});
 return{'vergaderingen.csv':toCsv(EXP_VERG_COLS,verg.map(o=>{Object.keys(o).forEach(k=>o[k]=flat(o[k]));return o})),'minuten.csv':toCsv(EXP_MIN_COLS,min),'acties.csv':toCsv(EXP_ACT_COLS,act)};
}

/* =====================================================================
   MoM (minutes) rendering: one model, several renderers (md, e-mail text, print HTML).
   A future PSAA Word template = one more renderer on the same model.
   ctx: {cfg, people, projName, projInfo(gi), actie(id), autoActions(m,sec)}
   ===================================================================== */
function momModel(m,ctx){
 const P=k=>personLabel(ctx.people,k);const tp=typeOf(ctx.cfg,m.type);
 const secties=m.secties.map(s=>{
  const topics=topicList(ctx.cfg,m.type,true).concat(Object.keys(s.blokken).map(Number).filter(n=>!tp.topics.some(t=>t.nr===n)).map(n=>({nr:n,naam:'Topic '+n})))
   .map(t=>({nr:t.nr,naam:t.naam,items:(s.blokken[t.nr]||[]).map(raw=>{const a=raw.type==='Actie'&&raw.id&&ctx.actie?ctx.actie(raw.id):null;
     const g=gateItem(Object.assign({},raw,a?{tekst:a.actie,eigenaar:a.eigenaar,deadline:a.deadline,prioriteit:a.prioriteit,status:a.status}:{}));
     return Object.assign(g,{eigenaarNaam:P(g.eigenaar)})}).filter(x=>text(x.tekst)||x.id)})).filter(t=>t.items.length);
  const info=s.key!==ALG&&ctx.projInfo?ctx.projInfo(s.key):null;
  return{key:s.key,kop:s.key===ALG?'Algemeen':`${s.key} – ${(ctx.projName&&ctx.projName(s.key))||s.titel||''}`.replace(/ – $/,''),info,topics,
   acties:(ctx.autoActions?ctx.autoActions(m,s.key):[]).map(a=>Object.assign({},a,{eigenaarNaam:P(a.eigenaar)}))};
 });
 const acties=[];secties.forEach(s=>s.acties.forEach(a=>acties.push(Object.assign({sectie:s.key===ALG?'Algemeen':s.key},a))));
 return{id:m.id,titel:m.titel||`${tp.naam} ${fmt(m.datum)}`,datum:m.datum,typeNaam:tp.naam,status:m.status,voorzitter:P(m.voorzitter),notulist:P(m.notulist),
  aanwezig:m.aanwezig.map(P),verontschuldigd:m.verontschuldigd.map(P),secties,acties};
}
const actLine=a=>`${a.id} – ${oneLine(a.actie)} (${a.eigenaarNaam||'?'}${a.deadline?', deadline '+fmt(a.deadline):''}) – ${a.status}${ACT_CLOSED.includes(a.status)&&a.afsluiting?': '+oneLine(a.afsluiting):''}`;
function itemLine(it){const pre=it.type==='Info'?'':`[${it.type}] `+(it.id?it.id+': ':'');const extra=it.type==='Actie'?` (${it.eigenaarNaam||'eigenaar?'}${it.deadline?', '+fmt(it.deadline):''})`:'';return pre+it.tekst+extra}
function renderMomMd(x){
 let o=`# ${x.titel}\n\n| | |\n|---|---|\n| Datum | ${fmt(x.datum)} |\n| Type | ${x.typeNaam} |\n| Status | ${x.status} |\n| Voorzitter | ${x.voorzitter||'-'} |\n| Notulist | ${x.notulist||'-'} |\n| Aanwezig | ${x.aanwezig.join(', ')||'-'} |\n| Verontschuldigd | ${x.verontschuldigd.join(', ')||'-'} |\n\n`;
 x.secties.forEach(s=>{if(!s.topics.length&&!s.acties.length)return;o+=`## ${s.kop}\n\n`;
  s.topics.forEach(t=>{o+=`### ${t.nr}. ${t.naam}\n\n`+t.items.map(it=>{const l=itemLine(it).split('\n');return'- '+l[0]+l.slice(1).map(z=>'\n  '+z).join('')}).join('\n')+'\n\n'})});
 if(x.acties.length)o+=`## Actielijst\n\n| ID | Actie | Eigenaar | Deadline | Status |\n|---|---|---|---|---|\n`+x.acties.map(a=>`| ${a.id} | ${oneLine(a.actie).replace(/\|/g,'/')} | ${a.eigenaarNaam||''} | ${fmt(a.deadline)} | ${a.status}${a.afsluiting&&!isOpen(a)?' – '+oneLine(a.afsluiting).replace(/\|/g,'/'):''} |`).join('\n')+'\n';
 return o.trimEnd()+'\n';
}
function renderMomText(x){
 let o=`${x.titel}\nDatum: ${fmt(x.datum)} · ${x.typeNaam} · ${x.status}\nVoorzitter: ${x.voorzitter||'-'} · Notulist: ${x.notulist||'-'}\nAanwezig: ${x.aanwezig.join(', ')||'-'}\n`+(x.verontschuldigd.length?`Verontschuldigd: ${x.verontschuldigd.join(', ')}\n`:'')+'\n';
 x.secties.forEach(s=>{if(!s.topics.length)return;o+=`${s.kop.toUpperCase()}\n`;
  s.topics.forEach(t=>{o+=`  ${t.nr}. ${t.naam}\n`+t.items.map(it=>'   • '+itemLine(it).replace(/\n/g,'\n     ')).join('\n')+'\n'});o+='\n'});
 if(x.acties.length)o+=`ACTIELIJST\n`+x.acties.map(a=>'   • '+actLine(a)).join('\n')+'\n';
 return o.trimEnd()+'\n';
}
function renderMomHtml(x){
 const tag=it=>it.type==='Info'?'':`<span class="ty ty-${it.type}">${it.type}</span> `;
 let o=`<article class="mom"><h1>${h(x.titel)}</h1><table class="mh"><tr><th>Datum</th><td>${fmt(x.datum)}</td><th>Type</th><td>${h(x.typeNaam)}</td><th>Status</th><td>${h(x.status)}</td></tr><tr><th>Voorzitter</th><td>${h(x.voorzitter||'-')}</td><th>Notulist</th><td colspan="3">${h(x.notulist||'-')}</td></tr><tr><th>Aanwezig</th><td colspan="5">${h(x.aanwezig.join(', ')||'-')}</td></tr>${x.verontschuldigd.length?`<tr><th>Verontschuldigd</th><td colspan="5">${h(x.verontschuldigd.join(', '))}</td></tr>`:''}</table>`;
 x.secties.forEach(s=>{if(!s.topics.length)return;o+=`<section><h2>${h(s.kop)}</h2>`;
  s.topics.forEach(t=>{o+=`<h3>${t.nr}. ${h(t.naam)}</h3><ul>`+t.items.map(it=>`<li>${tag(it)}${it.id?`<b>${h(it.id)}</b>: `:''}${h(it.tekst).replace(/\n/g,'<br>')}${it.type==='Actie'?` <i>(${h(it.eigenaarNaam||'eigenaar?')}${it.deadline?', '+fmt(it.deadline):''})</i>`:''}</li>`).join('')+`</ul>`});o+=`</section>`});
 if(x.acties.length)o+=`<section><h2>Actielijst</h2><table class="ma"><tr><th>ID</th><th>Actie</th><th>Eigenaar</th><th>Deadline</th><th>Status</th></tr>`+x.acties.map(a=>`<tr><td>${h(a.id)}</td><td>${h(a.actie)}${a.afsluiting&&!isOpen(a)?`<br><i>→ ${h(a.afsluiting)}</i>`:''}</td><td>${h(a.eigenaarNaam||'')}</td><td>${fmt(a.deadline)}</td><td>${h(a.status)}</td></tr>`).join('')+`</table></section>`;
 return o+`</article>`;
}
/* Project dossier: everything ever recorded on one GI code */
function projectDossierMd(gi,ctx){
 const P=k=>personLabel(ctx.people,k);const p=ctx.projInfo(gi)||{gi,naam:gi,rows:[]};
 let o=`# Projectdossier ${gi} – ${p.naam}\n\n_Gegenereerd op ${fmt(today())} door PSA-MoM ${APP_VERSION}_\n\n`;
 if(p.rows&&p.rows.length)o+=`## Budgetlijnen (projectlijst)\n\n| Omschrijving | Jaar | Budgetcode | Budget | PIF | PRJ | DMND | PM | Status |\n|---|---|---|---|---|---|---|---|---|\n`+p.rows.map(r=>`| ${r.omschrijving} | ${r.year} | ${r.budgetCode} | ${hasMoney(r.budgetRaw)?formatEuro(r.budget):'—'} | ${hasMoney(r.pifRaw)?formatEuro(r.pif):'—'} | ${r.prj} | ${r.dmnd} | ${r.pmNaam} | ${r.status} |`).join('\n')+'\n\n';
 else if(p.tijdelijk)o+=`_Tijdelijk project zonder projectlijst._\n\n`;
 const tl=projectTimeline(ctx.meetings,gi);const acts=sortActions(ctx.actions.filter(a=>a.gi_code===gi));const byId={};acts.forEach(a=>byId[a.id]=a);
 const dec=tl.filter(x=>x.item.type==='Beslissing');
 o+=`## Beslissingen\n\n`+(dec.length?dec.map(x=>`- ${fmt(x.meeting.datum)} – ${x.item.id||''}: ${oneLine(x.item.tekst)} _(${typeOf(ctx.cfg,x.meeting.type).naam})_`).join('\n'):'_Geen beslissingen._')+'\n\n';
 o+=`## Acties\n\n`+(acts.length?`| ID | Actie | Eigenaar | Deadline | Status | Afsluiting |\n|---|---|---|---|---|---|\n`+acts.map(a=>`| ${a.id} | ${oneLine(a.actie).replace(/\|/g,'/')} | ${P(a.eigenaar)} | ${fmt(a.deadline)}${isOverdue(a)?' ⚠':''} | ${a.status} | ${oneLine(a.afsluiting).replace(/\|/g,'/')} |`).join('\n'):'_Geen acties._')+'\n\n';
 o+=`## Tijdlijn (alle vergaderingen)\n\n`;let cur='';
 tl.forEach(x=>{if(x.meeting.id!==cur){cur=x.meeting.id;o+=`\n### ${fmt(x.meeting.datum)} – ${x.meeting.titel||typeOf(ctx.cfg,x.meeting.type).naam}\n\n`}
  const a=x.item.type==='Actie'&&byId[x.item.id];o+=`- ${topicName(ctx.cfg,x.meeting.type,x.nr)} · [${x.item.type}] ${x.item.id?x.item.id+': ':''}${oneLine(a?a.actie:x.item.tekst)}\n`});
 if(!tl.length)o+='_Nog geen notulen._\n';
 return o.trimEnd()+'\n';
}

/* ---------- exports for Node (tests) ---------- */
const PSAMoMCore={APP_VERSION,BUILD,SCHEMA,ITEM_TYPES,ACT_STATUS,ACT_OPEN,ACT_CLOSED,PRIO,ALG,ALG_REG,ACT_COLS,EXTRA_COLS,VALID_STATUSES,NL_MARK,DEFAULT_TYPES,MIGRATIONS,
 setNow,now,today,stamp,clone,uniq,oneLine,touchAction,fmt,fmtStamp,normDate,normStamp,dd,addDays,slug,initials,fold,h,decodeBytes,detectSep,parseCsvRows,parseCsv,toCsv,
 normalizeYear,parseCurrencyValue,formatEuro,normalizeStatus,statusClass,personName,personEmail,parseGiCodes,isGi,isTmp,parseProjectsCsv,groupProjects,matchProject,matchQuery,
 parsePersonen,parsePersonenExtra,serializePersonenExtra,buildPeople,personCodes,searchPeople,personLabel,personByName,
 defaultConfig,normalizeConfig,typeOf,topicList,topicName,topicNrByName,addTopic,addType,topicRef,parseTopicRef,pendingMigrations,runMigrations,
 meetingIdFor,meetingPath,regKeyFor,regPath,newMeeting,ensureSection,sectionItems,serializeMeeting,parseMeeting,gateItem,meetingItems,decisionIds,
 parseRegister,serializeRegister,nextActionId,nextDecisionId,isOpen,isOverdue,newAction,addVerloop,verloopEntries,verloopMentions,shiftDeadline,closeAction,reopenAction,setActionStatus,setActionOwner,
 mergeVerloop,mergeRows,resolveRows,mergeMeeting,resolveMeeting,mergeSet,conflictOriginal,meetingCopyOriginal,registerCopyOriginal,isRegisterName,lockName,makeLock,lockState,
 previousMeeting,previousTopic,projectTimeline,validateDefinitief,matchAction,sortActions,topicMatchers,splitBlocks,blockItems,htmlToText,
 flat,unflat,buildExports,momModel,renderMomMd,renderMomText,renderMomHtml,projectDossierMd};
if(typeof module!=='undefined'&&module.exports)module.exports=PSAMoMCore;
