/* PSA-MoM app: UI + storage (File System Access API). Pure logic lives in core.js.
   State is kept in S; files on disk are the single source of truth. */
const HAS_DOM=typeof document!=='undefined'&&!!document.querySelector;
const S={root:null,cfg:null,cfgMt:0,user:'',people:{list:[],byKey:{}},groep:[],extra:[],extraMt:0,
 bron:{proj:null,pers:null},proj:{rows:[],projects:[],byGi:{},noGi:[],missing:[]},
 M:{},R:{},loadedYears:new Set(),pendingYears:[],copies:[],view:'dash',p:{},edit:null,ro:false,roReason:'',lock:null,lockTimer:null,
 status:{t:'Geen map gekozen',c:'warn'},saving:false,timer:null,expTimer:null,lastExport:0,lastCheck:0,backedUp:new Set(),
 flt:{mtgs:{type:'',van:'',tot:'',project:'',persoon:'',status:'',q:''},acts:{eigenaar:'',project:'',type:'',status:'open',overdue:false,van:'',tot:'',q:''},
  projs:{status:new Set(),location:new Set(),portfolio:new Set(),year:new Set(),pm:new Set(),q:'',noGi:false,mijn:false},pick:{status:new Set(),location:new Set(),portfolio:new Set(),year:new Set(),pm:new Set(),q:'',noGi:false}},
 form:null,dlg:{},hooks:{},ui:{openMs:'',kseq:0,cfgDraft:null},readOnlyAll:false,loadMs:0};
const $=(s,r)=>(r||document).querySelector(s);
const hhmm=()=>{const d=now();return pad(d.getHours())+':'+pad(d.getMinutes())};
const opts=(arr,sel)=>arr.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return`<option value="${h(v)}"${String(v)===String(sel)?' selected':''}>${h(l)}</option>`}).join('');
const P=k=>personLabel(S.people,k);
const myCode=()=>(S.people.byKey[S.user]||{}).code||(S.user?initials(S.user.split('@')[0].replace(/[._]/g,' ')):'X');
const ctxO=mid=>({user:S.user,code:myCode(),meeting:mid||''});
const allMeetings=()=>Object.values(S.M).map(x=>x.m);
const allActions=()=>Object.values(S.R).flatMap(R=>R.rows);
const byDateDesc=(a,b)=>b.datum.localeCompare(a.datum)||b.id.localeCompare(a.id);

/* ---------- key/value store (IndexedDB; memory fallback) ---------- */
const KV={mem:{},db:null,
 open(){return this.db||(this.db=new Promise((res,rej)=>{const r=indexedDB.open('psa-mom',1);r.onupgradeneeded=()=>r.result.createObjectStore('k');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('IndexedDB geblokkeerd'));setTimeout(()=>rej(new Error('IndexedDB antwoordt niet')),4000)}))},
 async get(k){if(typeof indexedDB==='undefined')return this.mem[k];try{const d=await this.open();return await new Promise(r=>{const q=d.transaction('k').objectStore('k').get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>r(undefined)})}catch(e){return this.mem[k]}},
 async set(k,v){this.mem[k]=v;if(typeof indexedDB==='undefined')return;try{const d=await this.open();await new Promise(r=>{const t=d.transaction('k','readwrite');t.objectStore('k').put(v,k);t.oncomplete=()=>r();t.onerror=()=>r()})}catch(e){}}};

/* ---------- file access (paths relative to the data folder) ---------- */
const dirCache=new Map();
const splitPath=p=>{const i=p.lastIndexOf('/');return i<0?['',p]:[p.slice(0,i),p.slice(i+1)]};
async function dirAt(path,create){
 if(!path)return S.root;if(dirCache.has(path))return dirCache.get(path);
 let d=S.root;for(const part of path.split('/'))d=await d.getDirectoryHandle(part,{create:!!create});
 dirCache.set(path,d);return d;
}
async function readFile(p){try{const [d,n]=splitPath(p);const fh=await(await dirAt(d,false)).getFileHandle(n);const f=await fh.getFile();return{text:decodeBytes(await f.arrayBuffer()),mt:f.lastModified}}catch(e){return null}}
async function statFile(p){try{const [d,n]=splitPath(p);const fh=await(await dirAt(d,false)).getFileHandle(n);return(await fh.getFile()).lastModified}catch(e){return null}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const RETRY_ERR=['NotFoundError','InvalidStateError','NoModificationAllowedError','InvalidModificationError'];
/* OneDrive can briefly hold or replace a file right after a write: retry, and name file + sub-step in the error. */
async function withRetry(what,fn){
 let phase={t:''};
 for(let attempt=1;;attempt++){
  try{return await fn(phase)}
  catch(e){
   if(attempt<3&&RETRY_ERR.includes(e&&e.name)){dirCache.clear();await sleep(400*attempt);continue}
   const err=new Error(`${e&&e.message||e} [${what}${phase.t?'; deelstap: '+phase.t:''}; poging ${attempt}]`);err.name=e&&e.name||'Error';throw err;
  }
 }
}
async function ensureDir(p){return withRetry('map: '+p,async ph=>{ph.t='map aanmaken/openen';return dirAt(p,true)})}
async function writeFile(p,t){
 const [d,n]=splitPath(p);
 return withRetry('bestand: '+p,async ph=>{
  ph.t='map openen';const dir=await dirAt(d,true);
  ph.t='bestand openen';const fh=await dir.getFileHandle(n,{create:true});
  ph.t='schrijven';const w=await fh.createWritable();await w.write(t);
  ph.t='afsluiten';await w.close();
  ph.t='datum lezen';
  try{return(await fh.getFile()).lastModified}catch(e){await sleep(300);try{return(await(await dir.getFileHandle(n)).getFile()).lastModified}catch(x){return Date.now()}}
 });
}
async function removeFile(p){try{const [d,n]=splitPath(p);await(await dirAt(d,false)).removeEntry(n);return true}catch(e){return false}}
async function listDir(p){const out=[];try{const dir=await dirAt(p,false);for await(const [name,hd] of dir.entries())out.push({name,kind:hd.kind})}catch(e){}return out}
async function pool(items,n,fn){let i=0;const run=async()=>{while(i<items.length){const k=i++;await fn(items[k],k)}};await Promise.all(Array.from({length:Math.min(n,items.length)},run))}
const sameText=(disk,txt)=>disk&&disk.text===String(txt).replace(/^﻿/,'');

function setStatus(t,c){S.status={t,c};const b=HAS_DOM&&$('#sync');if(b){b.textContent=t;b.className='badge '+c}}
function toast(t){if(!HAS_DOM)return;const x=$('#toast');if(!x)return;x.textContent=t;x.className='show';clearTimeout(toast.t);toast.t=setTimeout(()=>x.className='',3200)}
async function ask(msg){if(S.hooks.confirm)return S.hooks.confirm(msg);return typeof confirm==='function'?confirm(msg):true}
async function copy(t){try{await navigator.clipboard.writeText(t);toast('Gekopieerd naar klembord')}catch(e){modal('Kopieer met Ctrl+C',[{n:'t',l:'Tekst',t:'textarea',v:t,rows:16}],()=>'',null)}}

/* =====================================================================
   Loading
   ===================================================================== */
async function pickFolder(){
 if(typeof window==='undefined'||!window.showDirectoryPicker){alert('Gebruik Microsoft Edge of Google Chrome');return}
 try{const hd=await window.showDirectoryPicker({mode:'readwrite',id:'psa-mom'});await KV.set('root',hd);await openRoot(hd)}catch(e){if(e.name!=='AbortError')alert('Map openen mislukt: '+e.message)}
}
async function reopen(){const hd=await KV.get('root');if(!hd)return pickFolder();const p=await hd.requestPermission({mode:'readwrite'});if(p!=='granted')return;await openRoot(hd)}
const cfgText=c=>JSON.stringify(c,null,1)+'\n';
/* Loading shows its current step; any failure ends on an error screen (never a silent "Bezig met inlezen…"). */
function loadStep(t){S.loadStep=t;S.loadStepAt=Date.now();if(HAS_DOM){const e=$('#loadstep');if(e)e.textContent=t}}
async function openRoot(hd){
 S.loading=true;S.loadErr=null;
 const watch=HAS_DOM?setInterval(()=>{if(!S.loading)return clearInterval(watch);if(Date.now()-S.loadStepAt>20000){const e=$('#loadslow');if(e)e.style.display='block'}},2000):null;
 try{await openRootInner(hd)}
 catch(e){S.loadErr={step:S.loadStep||'',msg:`${e&&e.name||'Error'}: ${e&&e.message||e}`};setStatus('Inlezen mislukt','bad');if(typeof console!=='undefined')console.error('PSA-MoM openRoot',S.loadStep,e)}
 finally{S.loading=false;if(watch)clearInterval(watch)}
 render();
 if(!S.loadErr&&S.root&&S.cfg){
  if(!S.user||!S.people.byKey[S.user])whoAmI();
  try{if(S.pendingYears.length){for(const y of [...S.pendingYears]){await loadYear(y);S.pendingYears=S.pendingYears.filter(x=>x!==y)}render()}}catch(e){toast('Oudere jaren konden niet gelezen worden: '+e.message)}
  scheduleExport(true);
 }
}
async function openRootInner(hd){
 const t0=Date.now();
 Object.assign(S,{root:hd,cfg:null,M:{},R:{},copies:[],edit:null,ro:false,view:'dash',p:{},loadedYears:new Set(),pendingYears:[],backedUp:new Set(),readOnlyAll:false});
 dirCache.clear();setStatus('Bezig met inlezen…','warn');loadStep('Map controleren (_config.json)');render();
 const c=await readFile('_config.json');
 if(!c){
  if(!await ask('Deze map bevat nog geen PSA-MoM-gegevens (_config.json ontbreekt).\n\nWil je de mapstructuur hier aanmaken? Kies enkel OK als dit de gedeelde map in de SharePoint-bibliotheek is.')){S.root=null;return}
  for(const d of ['vergaderingen','acties','_bron','_export','_backup','_rapporten']){loadStep(`Mapstructuur aanmaken: map ${d}`);await ensureDir(d)}
  loadStep('Bestand personen-extra.csv aanmaken');if(!await readFile('personen-extra.csv'))await writeFile('personen-extra.csv',serializePersonenExtra([]));
  loadStep('Bestand _config.json schrijven');const cfg=defaultConfig();S.cfgMt=await writeFile('_config.json',cfgText(cfg));S.cfg=cfg;
 }else{
  try{S.cfg=normalizeConfig(JSON.parse(c.text))}catch(e){throw new Error('_config.json kan niet gelezen worden ('+e.message+'). Herstel het bestand (bv. via de versiegeschiedenis in SharePoint) en probeer opnieuw.')}
  S.cfgMt=c.mt;
 }
 loadStep('Projectlijst en personen lezen (_bron/projecten.csv, _bron/personen.csv, personen-extra.csv)');await loadBron();
 loadStep('Actieregisters lezen (map acties)');await loadRegisters();
 loadStep('Vergaderingen zoeken (map vergaderingen)');const years=await listYears();const cy=String(now().getFullYear());
 const first=years.filter(y=>y>=String(+cy-1));S.pendingYears=years.filter(y=>!first.includes(y));
 for(const y of first){loadStep(`Vergaderingen lezen (map vergaderingen/${y})`);await loadYear(y)}
 let note='';
 if(S.cfg.schema>SCHEMA){S.readOnlyAll=true;note=` – LET OP: gegevensschema ${S.cfg.schema} is nieuwer dan deze versie (${SCHEMA}); open de nieuwste PSA-MoM-versie uit de bibliotheek. Alles is alleen-lezen.`}
 else if(pendingMigrations(S.cfg).length){
  loadStep('Gegevens migreren (met back-up)');
  for(const y of S.pendingYears)await loadYear(y);S.pendingYears=[];
  const from=S.cfg.schema||1;await fullBackup(`_backup/pre-migratie-v${from}`);
  const ctx={cfg:S.cfg,meetings:allMeetings(),registers:S.R,rewrite:false};const r=runMigrations(ctx);
  if(r.rewrite){Object.values(S.M).forEach(x=>x.dirty=true);Object.values(S.R).forEach(x=>x.dirty=true)}
  S.cfgMt=await writeFile('_config.json',cfgText(S.cfg));await saveAll();
  note=` – gegevens gemigreerd van schema ${from} naar ${S.cfg.schema} (back-up in _backup/pre-migratie-v${from})`;
 }
 loadStep('Gebruiker ophalen (browseropslag)');S.user=(await KV.get('user'))||'';S.loadMs=Date.now()-t0;
 setStatus(`Geladen ${hhmm()} (${S.loadMs} ms)${note}`,S.readOnlyAll?'bad':'ok');
}
async function loadBron(){
 const p=await readFile('_bron/projecten.csv');
 S.proj=p?parseProjectsCsv(p.text):{rows:[],projects:[],byGi:{},noGi:[],missing:[]};S.bron.proj=p?{mt:p.mt}:null;
 const pe=await readFile('_bron/personen.csv');S.groep=pe?parsePersonen(pe.text):[];S.bron.pers=pe?{mt:pe.mt,n:S.groep.length}:null;
 const ex=await readFile('personen-extra.csv');S.extra=ex?parsePersonenExtra(ex.text):[];S.extraMt=ex?ex.mt:0;
 S.people=buildPeople(S.groep,S.extra);
}
let _aidx=null;
function bumpAct(){_aidx=null}
function aIndex(){if(!_aidx){_aidx=new Map();Object.values(S.R).forEach(R=>R.rows.forEach(a=>_aidx.set(a.id,R)))}return _aidx}
const actById=id=>{const R=aIndex().get(id);return R?R.rows.find(a=>a.id===id):null};
const regOfAct=id=>{const R=aIndex().get(id);return R?R.key:''};
function reg(key){return S.R[key]||(S.R[key]={key,path:regPath(key),rows:[],base:[],mt:0,dirty:false})}
const secOfReg=k=>k===ALG_REG?ALG:k;
async function loadRegisters(){
 const files=(await listDir('acties')).filter(f=>f.kind==='file'&&/\.csv$/i.test(f.name));const names=new Set(files.map(f=>f.name));
 await pool(files,16,async f=>{const path='acties/'+f.name;const r=await readFile(path);if(!r)return;const rows=parseRegister(r.text);
  if(isRegisterName(f.name)){const key=f.name.slice(0,-4);S.R[key]={key,path,rows,base:clone(rows),mt:r.mt,dirty:false};return}
  const orig=registerCopyOriginal(f.name,rows,names);if(orig&&!S.copies.some(c=>c.path===path))S.copies.push({kind:'reg',path,orig:'acties/'+orig})});
 bumpAct();
}
async function listYears(){return(await listDir('vergaderingen')).filter(d=>d.kind==='directory'&&/^\d{4}$/.test(d.name)).map(d=>d.name).sort().reverse()}
async function loadYear(y){
 const files=(await listDir('vergaderingen/'+y)).filter(f=>f.kind==='file'&&/\.md$/i.test(f.name));const names=new Set(files.map(f=>f.name));
 await pool(files,16,async f=>{const path=`vergaderingen/${y}/${f.name}`;if(S.M[f.name.slice(0,-3)])return;const r=await readFile(path);if(!r)return;
  const stem=f.name.slice(0,-3);const m=parseMeeting(r.text,{stem,cfg:S.cfg});
  const orig=meetingCopyOriginal(f.name,m.id,names);
  if(orig){if(!S.copies.some(c=>c.path===path))S.copies.push({kind:'mtg',path,orig:`vergaderingen/${y}/${orig}`});return}
  m.id=stem;S.M[stem]={id:stem,path,m,base:clone(m),mt:r.mt,dirty:false}});
 S.loadedYears.add(y);
}
async function ensureYear(y){if(!S.loadedYears.has(y)){await loadYear(y);S.pendingYears=S.pendingYears.filter(x=>x!==y)}}

/* =====================================================================
   Saving: merge on save
   ===================================================================== */
function touchM(id){const Mt=S.M[id];if(!Mt)return;Mt.dirty=true;Mt.m.gewijzigd_door=S.user;Mt.m.gewijzigd_op=stamp();schedule()}
function touchR(key){reg(key).dirty=true;bumpAct();schedule()}
function schedule(){setStatus('Wijzigingen nog niet opgeslagen…','warn');clearTimeout(S.timer);S.timer=setTimeout(()=>saveAll(),1200)}
const anyDirty=()=>Object.values(S.M).some(x=>x.dirty)||Object.values(S.R).some(x=>x.dirty);
async function saveAll(){
 if(!S.root||S.readOnlyAll)return;
 if(S.saving){clearTimeout(S.timer);S.timer=setTimeout(()=>saveAll(),400);return}
 S.saving=true;clearTimeout(S.timer);const merged=[];
 try{
  for(const R of Object.values(S.R))if(R.dirty){const x=await saveReg(R);if(x)merged.push(x)}
  for(const Mt of Object.values(S.M))if(Mt.dirty){const x=await saveMeeting(Mt);if(x)merged.push(x)}
  setStatus(`Lokaal opgeslagen ${hhmm()} – OneDrive synchroniseert op de achtergrond`,'ok');
  if(merged.length)toast('Samengevoegd met wijzigingen van anderen: '+merged.join(', '));
  scheduleExport();
 }catch(e){setStatus('Opslaan mislukt: '+e.message,'bad');if(typeof console!=='undefined')console.error(e)}
 S.saving=false;
 if(merged.length)render();
 if(anyDirty())schedule();
}
async function backupOnce(path,txt){
 if(!txt)return;const k=today()+'|'+path;if(S.backedUp.has(k))return;S.backedUp.add(k);
 try{await writeFile(`_backup/${today()}_${myCode()}/${path}`,txt)}catch(e){}
}
async function saveReg(R){
 R.dirty=false;let note='';
 const disk=await readFile(R.path);
 if(!disk&&!R.rows.length)return'';
 if(disk&&disk.mt!==R.mt){
  const remote=parseRegister(disk.text);
  const res=mergeRows(R.mt?R.base:[],R.rows,remote,{renumber:(row,taken)=>nextActionId([...taken].map(id=>({id})),secOfReg(R.key),row.id.split('-').slice(-2)[0])});
  if(res.conflicts.length)await resolveUI('acties',R.path,res.conflicts);
  resolveRows(res.rows,res.conflicts);R.rows=res.rows;bumpAct();
  res.renames.forEach(x=>renameActionRefs(x.from,x.to));
  note=R.path.split('/').pop();
 }
 await backupOnce(R.path,disk&&disk.text);
 const txt=serializeRegister(R.rows);
 R.mt=sameText(disk,txt)?disk.mt:await writeFile(R.path,txt);R.base=clone(R.rows);
 return note;
}
function renameActionRefs(from,to){Object.values(S.M).forEach(Mt=>meetingItems(Mt.m).forEach(x=>{if(x.item.id===from){x.item.id=to;Mt.dirty=true}}))}
const mdCtx=()=>({cfg:S.cfg,people:S.people,projName,projInfo,actie:actById,autoActions:autoActs});
function autoActs(m,sec){const R=S.R[regKeyFor(sec)];return R?R.rows.filter(a=>a.vergadering===m.id||verloopMentions(a,m.id)).map(a=>Object.assign({},a,{eigenaarNaam:P(a.eigenaar)})):[]}
const normM=m=>parseMeeting(serializeMeeting(m,mdCtx()),{stem:m.id,cfg:S.cfg});
async function saveMeeting(Mt){
 Mt.dirty=false;let note='';
 const disk=await readFile(Mt.path);
 if(disk&&disk.mt!==Mt.mt){
  const remote=parseMeeting(disk.text,{stem:Mt.id,cfg:S.cfg});
  const res=mergeMeeting(Mt.mt?Mt.base:null,normM(Mt.m),remote);
  if(res.conflicts.length)await resolveUI('vergadering',Mt.path,res.conflicts);
  resolveMeeting(res.meeting,res.conflicts);res.meeting.id=Mt.id;Mt.m=res.meeting;
  note=Mt.path.split('/').pop();
 }
 await backupOnce(Mt.path,disk&&disk.text);
 const txt=serializeMeeting(Mt.m,mdCtx());
 Mt.mt=sameText(disk,txt)?disk.mt:await writeFile(Mt.path,txt);
 Mt.base=parseMeeting(txt,{stem:Mt.id,cfg:S.cfg});
 return note;
}
function resolveUI(kind,path,conflicts){return S.hooks.resolve?S.hooks.resolve(kind,path,conflicts):conflictDialog(kind,path,conflicts)}

/* ---------- exports (_export, derived) ---------- */
function scheduleExport(soon){if(!S.cfg)return;clearTimeout(S.expTimer);S.expTimer=setTimeout(()=>rebuildExports().catch(()=>{}),soon?300:S.cfg.instellingen.exportDebounceSec*1000)}
async function rebuildExports(manual){
 if(!S.root||S.readOnlyAll)return null;
 if(S.pendingYears.length){if(manual)for(const y of [...S.pendingYears])await ensureYear(y);else{scheduleExport();return null}}
 const files=buildExports({cfg:S.cfg,meetings:allMeetings(),actions:allActions(),people:S.people,projName:gi=>projName(gi),projPm});
 let written=0,removed=0;
 for(const [name,txt] of Object.entries(files)){const p='_export/'+name;const cur=await readFile(p);if(!sameText(cur,txt)){await writeFile(p,txt);written++}}
 const names=new Set(Object.keys(files));
 for(const f of await listDir('_export'))if(f.kind==='file'&&!names.has(f.name)&&/\.csv$/i.test(f.name)&&conflictOriginal(f.name,names)){await removeFile('_export/'+f.name);removed++}
 S.lastExport=Date.now();
 if(manual)toast(`Exports herbouwd: ${written} bestand(en) bijgewerkt${removed?`, ${removed} conflictkopie(ën) verwijderd`:''}`);
 return{written,removed};
}

/* ---------- external changes, conflict copies ---------- */
async function checkExternal(){
 if(!S.root||S.saving)return 0;S.lastCheck=Date.now();let changed=0,openChanged=false;
 for(const R of Object.values(S.R)){if(R.dirty||!R.mt)continue;const mt=await statFile(R.path);if(mt&&mt!==R.mt){const r=await readFile(R.path);if(!r)continue;R.rows=parseRegister(r.text);R.base=clone(R.rows);R.mt=r.mt;changed++}}
 for(const Mt of Object.values(S.M)){if(Mt.dirty||!Mt.mt)continue;const mt=await statFile(Mt.path);if(mt&&mt!==Mt.mt){const r=await readFile(Mt.path);if(!r)continue;Mt.m=parseMeeting(r.text,{stem:Mt.id,cfg:S.cfg});Mt.m.id=Mt.id;Mt.base=clone(Mt.m);Mt.mt=r.mt;changed++;if(S.edit===Mt.id)openChanged=true}}
 const before=Object.keys(S.R).length+Object.keys(S.M).length;
 const known=new Set(Object.values(S.R).map(R=>R.path));
 for(const f of await listDir('acties'))if(f.kind==='file'&&isRegisterName(f.name)&&!known.has('acties/'+f.name)){const r=await readFile('acties/'+f.name);if(r){const key=f.name.slice(0,-4);const rows=parseRegister(r.text);S.R[key]={key,path:'acties/'+f.name,rows,base:clone(rows),mt:r.mt,dirty:false}}}
 for(const y of await listYears())if(S.loadedYears.has(y)||y>=String(now().getFullYear()-1))await loadYear(y);
 changed+=Object.keys(S.R).length+Object.keys(S.M).length-before;
 for(const [p,k] of [['_bron/projecten.csv','proj'],['_bron/personen.csv','pers']]){const mt=await statFile(p);if(mt&&(!S.bron[k]||S.bron[k].mt!==mt)){await loadBron();changed++;break}}
 const ex=await statFile('personen-extra.csv');if(ex&&ex!==S.extraMt){await loadBron();changed++}
 if(changed){bumpAct();render()}
 if(openChanged)toast('De open vergadering werd bijgewerkt door '+P(S.M[S.edit].m.gewijzigd_door));
 return changed;
}
async function scanCopies(){
 S.copies=[];
 const regs=(await listDir('acties')).filter(f=>f.kind==='file'&&/\.csv$/i.test(f.name));const rn=new Set(regs.map(f=>f.name));
 for(const f of regs)if(!isRegisterName(f.name)){const r=await readFile('acties/'+f.name);const orig=r&&registerCopyOriginal(f.name,parseRegister(r.text),rn);if(orig)S.copies.push({kind:'reg',path:'acties/'+f.name,orig:'acties/'+orig})}
 for(const y of S.loadedYears){const fs=(await listDir('vergaderingen/'+y)).filter(f=>f.kind==='file'&&/\.md$/i.test(f.name));const mn=new Set(fs.map(f=>f.name));
  for(const f of fs){const path=`vergaderingen/${y}/${f.name}`;if(S.M[f.name.slice(0,-3)]&&S.M[f.name.slice(0,-3)].path===path)continue;
   const r=await readFile(path);const m=r&&parseMeeting(r.text,{stem:f.name.slice(0,-3)});const orig=m&&meetingCopyOriginal(f.name,m.id,mn);if(orig)S.copies.push({kind:'mtg',path,orig:`vergaderingen/${y}/${orig}`})}}
 return S.copies;
}
async function mergeCopy(c){
 const copyF=await readFile(c.path);if(!copyF){S.copies=S.copies.filter(x=>x!==c);return}
 await saveAll();
 if(c.kind==='reg'){
  const key=splitPath(c.orig)[1].slice(0,-4);const R=reg(key);
  const res=mergeRows(null,R.rows,parseRegister(copyF.text));
  if(res.conflicts.length)await resolveUI('acties',c.orig,res.conflicts);
  resolveRows(res.rows,res.conflicts);R.rows=res.rows;touchR(key);
 }else{
  const id=splitPath(c.orig)[1].slice(0,-3);const Mt=S.M[id];if(!Mt)return toast('Origineel niet gevonden: '+c.orig);
  const res=mergeMeeting(null,normM(Mt.m),parseMeeting(copyF.text,{stem:id,cfg:S.cfg}));
  if(res.conflicts.length)await resolveUI('vergadering',c.orig,res.conflicts);
  resolveMeeting(res.meeting,res.conflicts);res.meeting.id=id;Mt.m=res.meeting;touchM(id);
 }
 await saveAll();
 await writeFile(`_backup/conflicten/${today()}_${splitPath(c.path)[1]}`,copyF.text);await removeFile(c.path);
 S.copies=S.copies.filter(x=>x!==c);
}
async function syncCheck(){
 if(!S.root)return;await saveAll();const n=await checkExternal();const cps=await scanCopies();
 if(cps.length){render();return copiesDialog()}
 setStatus(`Gecontroleerd ${hhmm()}: ${n?n+' bestand(en) bijgewerkt van schijf':'geen externe wijzigingen'}, geen conflictkopieën. Controleer in Verkenner het groene vinkje voor de cloud-status.`,'ok');
}
async function fullBackup(dest){
 const files=['_config.json','personen-extra.csv',...Object.values(S.R).map(R=>R.path),...Object.values(S.M).map(M=>M.path)];
 let n=0;for(const p of files){const r=await readFile(p);if(r){await writeFile(`${dest}/${p}`,r.text);n++}}return n;
}
async function backupNow(){const d=`_backup/${today()}_${hhmm().replace(':','')}_${myCode()}-volledig`;const n=await fullBackup(d);setStatus(`Back-up gemaakt ${hhmm()}: ${n} bestanden in ${d}`,'ok');toast('Back-up gemaakt in '+d)}

/* ---------- soft locks ---------- */
const lockPathOf=Mt=>{const [d,n]=splitPath(Mt.path);return`${d}/${lockName(n)}`};
async function writeLock(Mt){const p=lockPathOf(Mt);const prev=await readFile(p);let pl=null;try{pl=prev&&JSON.parse(prev.text)}catch(e){}
 await writeFile(p,makeLock(S.user,P(S.user),pl&&pl.gebruiker===S.user?pl:null));S.lock={id:Mt.id,path:p}}
async function releaseLock(){
 if(!S.lock)return;clearInterval(S.lockTimer);const l=await readFile(S.lock.path);
 try{if(l&&JSON.parse(l.text).gebruiker===S.user)await removeFile(S.lock.path)}catch(e){}S.lock=null;
}
async function openMeeting(id,mode){
 const Mt=S.M[id];if(!Mt)return toast('Vergadering niet gevonden');
 if(S.lock&&S.lock.id!==id)await releaseLock();
 await saveAll();
 let ro=mode==='ro'||Mt.m.status==='Definitief'||S.readOnlyAll;S.roReason=S.readOnlyAll?'schema':Mt.m.status==='Definitief'?'definitief':mode==='ro'?'keuze':'';
 if(!ro&&!(S.lock&&S.lock.id===id)){
  const l=await readFile(lockPathOf(Mt));const st=lockState(l&&l.text,S.user,S.cfg.instellingen.lockMaxUur);
  if(st.active&&!st.own&&mode!=='force'){const ch=S.hooks.lockAsk?await S.hooks.lockAsk(st.lock):await lockDialog(st.lock);if(!ch)return;if(ch==='ro'){ro=true;S.roReason='lock:'+(st.lock.naam||st.lock.gebruiker)}}
  if(!ro){await writeLock(Mt);clearInterval(S.lockTimer);S.lockTimer=setInterval(()=>{const x=S.M[S.lock&&S.lock.id];if(x)writeLock(x).catch(()=>{})},20*60*1000)}
 }
 S.edit=id;S.ro=ro;S.view='mtg';S.p={id};render();
}
async function closeMeeting(){await saveAll();await releaseLock();const id=S.edit;S.edit=null;S.ro=false;S.view='mtgs';S.p={};render();return id}

/* =====================================================================
   Project helpers
   ===================================================================== */
function tmpInfo(gi){for(const Mt of Object.values(S.M)){const s=Mt.m.secties.find(x=>x.key===gi);if(s&&s.titel)return{gi,naam:s.titel,tijdelijk:true,rows:[],statuses:[],pmNamen:[]}}return isTmp(gi)?{gi,naam:gi.slice(4),tijdelijk:true,rows:[],statuses:[],pmNamen:[]}:null}
function projInfo(gi){if(!gi||gi===ALG)return null;return S.proj.byGi[gi]||tmpInfo(gi)||{gi,naam:gi,rows:[],statuses:[],pmNamen:[],onbekend:true}}
function projName(gi){if(!gi||gi===ALG)return'Algemeen';const p=projInfo(gi);return p?p.naam:gi}
const projPm=gi=>{const p=S.proj.byGi[gi];return p?p.pmNamen.join(', '):''};
const statusPill=s=>s?`<span class="status-pill ${statusClass(s)}">${h(s)}</span>`:'';
function myProjects(){const me=S.people.byKey[S.user];if(!me)return new Set();return new Set(S.proj.projects.filter(p=>(me.email&&p.pmEmails.includes(me.email))||p.pmNamen.some(n=>fold(n)===fold(me.naam))).map(p=>p.gi))}

/* =====================================================================
   Commands (used by the UI and by smoke.js)
   ===================================================================== */
const cmd={};
cmd.setUser=async key=>{S.user=key;await KV.set('user',key);render()};
cmd.createMeeting=async f=>{
 if(!f.type)return{err:'Kies een vergadertype'};if(!isIsoDate(f.datum))return{err:'Kies een geldige datum'};
 const tp=typeOf(S.cfg,f.type);
 if(tp.projectgebonden&&!(f.projecten||[]).length)return{err:'Kies minstens één project (of gebruik een algemeen vergadertype zoals Teammeeting)'};
 await ensureYear(f.datum.slice(0,4));
 const disk=new Set((await listDir('vergaderingen/'+f.datum.slice(0,4))).map(x=>x.name.replace(/\.md$/,'')));
 const id=meetingIdFor(f.datum,f.type,new Set([...Object.keys(S.M),...disk]));
 const m=newMeeting({id,datum:f.datum,type:f.type,titel:text(f.titel)||`${tp.naam} ${fmt(f.datum)}`,voorzitter:f.voorzitter,notulist:f.notulist,aanwezig:f.aanwezig,
  verontschuldigd:f.verontschuldigd,projecten:f.projecten,projectgebonden:tp.projectgebonden,user:S.user,namen:Object.fromEntries((f.projecten||[]).map(g=>[g,f.tmpNamen&&f.tmpNamen[g]||projName(g)]))});
 S.M[id]={id,path:meetingPath(m),m,base:null,mt:0,dirty:true};touchM(id);await saveAll();return{id};
};
function keys(m){m.secties.forEach(s=>Object.values(s.blokken).forEach(l=>l.forEach(it=>{if(!it._k)it._k='k'+(++S.ui.kseq).toString(36)})));return m}
function findItem(m,sec,nr,k){const s=m.secties.find(x=>x.key===sec);const l=s&&s.blokken[nr];return l?l.find(i=>i._k===k):null}
function createActionFor(m,sec,nr,it){
 const R=reg(regKeyFor(sec));const id=nextActionId(R.rows,sec,myCode());
 R.rows.push(newAction({id,secKey:sec,meeting:m.id,datum:m.datum,topic:topicRef(m.type,nr),actie:it.tekst||'',user:S.user,code:myCode()}));
 it.id=id;touchR(R.key);return id;
}
const removableAction=(a,m)=>a&&a.vergadering===m.id&&verloopEntries(a.verloop).length<=1;
function dropAction(id){const key=regOfAct(id);const R=S.R[key];if(!R)return;R.rows=R.rows.filter(a=>a.id!==id);touchR(key)}
cmd.addItem=(mid,sec,nr,type,tekst,afterK)=>{
 const Mt=S.M[mid];const m=Mt.m;keys(m);const s=ensureSection(m,sec,sec===ALG?'Algemeen':projName(sec));
 const list=s.blokken[nr]||(s.blokken[nr]=[]);const it={type:'Info',id:'',tekst:tekst||'',_k:'k'+(++S.ui.kseq).toString(36)};
 const i=afterK?list.findIndex(x=>x._k===afterK):-1;if(i>=0)list.splice(i+1,0,it);else list.push(it);
 if(type&&type!=='Info')cmd.setItemType(mid,sec,nr,it._k,type);touchM(mid);return it;
};
cmd.setItemType=(mid,sec,nr,k,type)=>{
 const m=S.M[mid].m;const it=findItem(m,sec,nr,k);if(!it||it.type===type)return'';
 if(it.type==='Actie'&&it.id){const a=actById(it.id);if(a&&!removableAction(a,m))return'Deze actie heeft al opvolging. Sluit of annuleer ze via "Opvolging open acties".';if(a)dropAction(a.id);it.tekst=a?a.actie:it.tekst;it.id=''}
 if(it.type==='Beslissing')it.id='';
 it.type=type;
 if(type==='Beslissing')it.id=nextDecisionId(decisionIds(allMeetings()),m.datum,myCode());
 if(type==='Actie')createActionFor(m,sec,nr,it);
 touchM(mid);return'';
};
cmd.setItemText=(mid,sec,nr,k,t)=>{
 const m=S.M[mid].m;const it=findItem(m,sec,nr,k);if(!it)return;it.tekst=t;
 if(it.type==='Actie'&&it.id){const a=actById(it.id);if(a&&a.actie!==t){a.actie=t;touchAction(a,S.user);touchR(regOfAct(a.id))}}
 touchM(mid);
};
cmd.moveItem=(mid,sec,nr,k,dir)=>{const s=S.M[mid].m.secties.find(x=>x.key===sec);const l=s.blokken[nr];const i=l.findIndex(x=>x._k===k);const j=i+dir;if(i<0||j<0||j>=l.length)return;[l[i],l[j]]=[l[j],l[i]];touchM(mid)};
cmd.deleteItem=(mid,sec,nr,k)=>{
 const m=S.M[mid].m;const s=m.secties.find(x=>x.key===sec);const l=s.blokken[nr];const it=l.find(x=>x._k===k);if(!it)return'';
 if(it.type==='Actie'&&it.id){const a=actById(it.id);if(a&&!removableAction(a,m))return'Deze actie heeft al opvolging. Annuleer ze via "Afsluiten" (status Geannuleerd).';if(a)dropAction(a.id)}
 s.blokken[nr]=l.filter(x=>x!==it);if(!s.blokken[nr].length)delete s.blokken[nr];touchM(mid);return'';
};
cmd.setActionField=(id,field,val,mid)=>{
 const a=actById(id);if(!a)return'Actie niet gevonden';const o=ctxO(mid);
 if(field==='eigenaar')setActionOwner(a,val,o,P(val));
 else if(field==='deadline'){if(a.deadline&&!(mid&&a.vergadering===mid))return'Gebruik "Deadline verschuiven" (reden verplicht)';a.deadline=normDate(val);touchAction(a,S.user)}
 else if(field==='prioriteit'){if(a.prioriteit!==val){if(!(mid&&a.vergadering===mid))addVerloop(a,`prioriteit ${a.prioriteit||'-'} → ${val}`,o);a.prioriteit=val;touchAction(a,S.user)}}
 else if(field==='actie'){if(!text(val))return'Omschrijving is verplicht';if(a.actie!==val){if(!(mid&&a.vergadering===mid))addVerloop(a,'omschrijving aangepast',o);a.actie=text(val);touchAction(a,S.user)}}
 else if(field==='status'){const e=setActionStatus(a,val,o);if(e)return e}
 touchR(regOfAct(id));if(mid&&S.M[mid])touchM(mid);return'';
};
cmd.shiftDeadline=(id,d,reden,mid)=>{const a=actById(id);const e=shiftDeadline(a,d,reden,ctxO(mid));if(e)return e;touchR(regOfAct(id));if(mid&&S.M[mid])touchM(mid);return''};
cmd.closeAction=(id,c,mid)=>{
 const a=actById(id);if(!a)return'Actie niet gevonden';if(!text(c.afsluiting))return'Geef de afsluitende actie of beslissing op (verplicht)';
 let afs=text(c.afsluiting);
 if(c.alsBeslissing&&mid&&S.M[mid]){const m=S.M[mid].m;const sec=a.gi_code||ALG;const tr=parseTopicRef(a.topic);
  const ts=topicList(S.cfg,m.type);const nr=tr.type===m.type&&ts.some(t=>t.nr===tr.nr)?tr.nr:(ts.length?ts[ts.length-1].nr:1);
  const it=cmd.addItem(mid,sec,nr,'Beslissing',`${a.id} (${oneLine(a.actie)}) afgesloten: ${afs}`);afs=`${it.id}: ${afs}`}
 const e=closeAction(a,{afsluiting:afs,datum:c.datum||(mid&&S.M[mid]?S.M[mid].m.datum:today()),status:c.status},ctxO(mid));if(e)return e;
 touchR(regOfAct(id));if(mid&&S.M[mid])touchM(mid);return'';
};
cmd.reopenAction=(id,reden,mid)=>{const a=actById(id);const e=reopenAction(a,reden,ctxO(mid));if(e)return e;touchR(regOfAct(id));if(mid&&S.M[mid])touchM(mid);return''};
cmd.setMeetingStatus=async(mid,st)=>{
 const Mt=S.M[mid];const m=Mt.m;
 if(st==='Definitief'){const e=validateDefinitief(m,actById);if(e.length)return e;m.status='Definitief';touchM(mid);await saveAll();if(S.edit===mid){await releaseLock();S.ro=true;S.roReason='definitief'}return[]}
 m.status='Concept';touchM(mid);await saveAll();if(S.edit===mid){S.ro=false;S.roReason='';await openMeeting(mid,'edit')}return[];
};
cmd.addSection=(mid,key,titel)=>{const m=S.M[mid].m;if(m.secties.some(s=>s.key===key))return'';
 const s={key,titel:titel||(key===ALG?'Algemeen':projName(key)),blokken:{}};if(key===ALG&&!typeOf(S.cfg,m.type).projectgebonden)m.secties.unshift(s);else if(key===ALG)m.secties.push(s);else{const i=m.secties.findIndex(x=>x.key===ALG);if(i>=0&&typeOf(S.cfg,m.type).projectgebonden)m.secties.splice(i,0,s);else m.secties.push(s)}
 if(key!==ALG&&!m.projecten.includes(key))m.projecten.push(key);touchM(mid);return''};
cmd.removeSection=(mid,key)=>{const m=S.M[mid].m;const s=m.secties.find(x=>x.key===key);if(!s)return'';if(Object.values(s.blokken).some(l=>l.length))return'Deze sectie bevat notulen; verwijder eerst de items.';
 m.secties=m.secties.filter(x=>x!==s);m.projecten=m.projecten.filter(x=>x!==key);touchM(mid);return''};
cmd.pasteItems=(mid,sec,blocks)=>{let n=0;blocks.forEach(b=>blockItems(b.lines).forEach(it=>{cmd.addItem(mid,sec,b.nr,it.type,it.tekst);n++}));return n};
cmd.momText=mid=>renderMomText(momModel(S.M[mid].m,mdCtx()));
cmd.saveMom=async mid=>{const p=`_rapporten/${mid}.md`;await writeFile(p,renderMomMd(momModel(S.M[mid].m,mdCtx())));return p};
cmd.dossier=async gi=>{for(const y of [...S.pendingYears])await ensureYear(y);const md=projectDossierMd(gi,{cfg:S.cfg,people:S.people,meetings:allMeetings(),actions:allActions(),projInfo});const p=`_rapporten/Projectdossier_${gi}_${today()}.md`;await writeFile(p,md);return{path:p,md}};
async function updateConfig(mut){
 const cur=await readFile('_config.json');const cfg=cur?normalizeConfig(JSON.parse(cur.text)):S.cfg;
 if(cur)await writeFile(`_backup/config/${stamp().replace(/[-:T]/g,'')}_config.json`,cur.text);
 const err=mut(cfg);if(err)return err;S.cfgMt=await writeFile('_config.json',cfgText(cfg));S.cfg=cfg;return'';
}
cmd.updateConfig=updateConfig;
async function updateExtra(mut){
 const cur=await readFile('personen-extra.csv');const list=cur?parsePersonenExtra(cur.text):[];const err=mut(list);if(err)return err;
 S.extraMt=await writeFile('personen-extra.csv',serializePersonenExtra(list));S.extra=list;S.people=buildPeople(S.groep,S.extra);return'';
}
cmd.savePerson=(p,oldKey)=>updateExtra(list=>{
 if(!text(p.naam))return'Naam is verplicht';const email=text(p.email).toLowerCase();
 if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return'Ongeldig e-mailadres';
 if(oldKey){const x=list.find(q=>q.key===oldKey);if(!x)return'Persoon niet gevonden';Object.assign(x,{naam:text(p.naam),organisatie:text(p.organisatie),functie:text(p.functie),type:p.type,actief:p.actief!==false});if(!x.email&&email&&!x.key.startsWith('ext-'))x.email=email;return''}
 const key=email||'ext-'+slug((text(p.organisatie)?text(p.organisatie)+'-':'')+text(p.naam));
 if(list.some(q=>q.key===key)||(S.people.byKey[key]&&S.people.byKey[key].bron==='groep'))return'Deze persoon bestaat al';
 list.push({key,email,naam:text(p.naam),organisatie:text(p.organisatie),functie:text(p.functie),type:p.type==='intern'?'intern':'extern',actief:true});return'';
});

/* =====================================================================
   Rendering
   ===================================================================== */
function captureFocus(){const el=document.activeElement;if(!el||!el.dataset||!el.dataset.f)return null;return{f:el.dataset.f,s:el.selectionStart,e:el.selectionEnd}}
function restoreFocus(x){
 const f=S.ui.focus||x&&x.f;S.ui.focus=null;if(!f)return;
 const el=[...document.querySelectorAll('[data-f]')].find(e=>e.dataset.f===f);if(!el)return;el.focus();
 try{if(x&&x.f===f&&x.s!=null)el.setSelectionRange(x.s,x.e);else if(el.value!=null&&el.setSelectionRange)el.setSelectionRange(el.value.length,el.value.length)}catch(e){}
}
function render(){
 if(!HAS_DOM)return;const app=$('#app');if(!app)return;const foc=captureFocus();const sc=window.scrollY||0;
 const footer=`<footer>PSA-MoM · versie ${APP_VERSION} · gegevensschema ${S.cfg?S.cfg.schema:SCHEMA} · build ${BUILD}</footer>`;
 if(!S.root){app.innerHTML=welcome()+footer;return}
 if(S.loadErr){app.innerHTML=`<div class="welcome"><h2>Inlezen mislukt</h2><p>Stap: <b>${h(S.loadErr.step)}</b></p><p>Foutmelding: <code>${h(S.loadErr.msg)}</code></p>${/NotFoundError/.test(S.loadErr.msg)?'<div class="warn"><b>Map hernoemd of verplaatst?</b> De browser onthoudt de map via haar pad. Klik op <b>Andere map kiezen</b> en kies de map opnieuw.</div>':''}
  <p class="muted small">Controleer in Verkenner of de map volledig gesynchroniseerd is (groen vinkje, geen rode kruisjes) en of je schrijfrechten hebt op de map in SharePoint. Bezorg deze stap en foutmelding aan de beheerder van PSA-MoM als het probleem blijft.</p>
  <p><button class="pri" data-a="retry">Opnieuw proberen</button> <button class="sec" data-a="pick">Andere map kiezen</button></p></div>`+footer;return}
 if(S.loading||!S.cfg){app.innerHTML=`<div class="welcome"><p>Bezig met inlezen…</p><p class="muted small" id="loadstep">${h(S.loadStep||'')}</p><div id="loadslow" class="warn" style="display:none">Deze stap duurt ongewoon lang. Controleer of OneDrive de map volledig gesynchroniseerd heeft (groen vinkje) en of je schrijfrechten hebt. <button class="sec sm" data-a="retry">Opnieuw proberen</button></div></div>`+footer;return}
 let main='';try{main=(VIEWS[S.view]||VIEWS.dash)()}catch(e){main=`<div class="warn">Fout bij tonen van dit scherm: ${h(e.message)}</div>`;if(typeof console!=='undefined')console.error(e)}
 app.innerHTML=headerHtml()+`<div class="layout">${navHtml()}<main id="main">${main}</main></div>`+footer;
 const key=S.view+'|'+(S.p.id||S.p.gi||'');if(typeof window.scrollTo==='function')window.scrollTo(0,key===S.ui.lastKey?sc:0);S.ui.lastKey=key;restoreFocus(foc);
 const hd=$('header');if(hd&&hd.offsetHeight&&document.documentElement.style)document.documentElement.style.setProperty('--hh',hd.offsetHeight+'px');
 document.querySelectorAll('textarea[data-f^="it|"]').forEach(grow);
}
function grow(t){if(!t.style)return;t.style.height='auto';t.style.height=Math.min(400,t.scrollHeight+2)+'px'}
function welcome(){
 const ok=typeof window!=='undefined'&&!!window.showDirectoryPicker;
 return`<div class="welcome"><h1>PSA-MoM</h1><p>Notulen (MoM) en actieopvolging voor SPE Engineering en PMO. De gegevens staan als bestanden in de gedeelde map van de SharePoint-bibliotheek (lokaal gesynchroniseerd met OneDrive).</p>
 ${ok?`<p><button class="pri" data-a="reopen">Map (her)openen</button> <button class="sec" data-a="pick">Map kiezen</button></p><p class="muted">Kies de gesynchroniseerde map van de bibliotheek (dezelfde map waarin dit HTML-bestand staat). Zet ze in Verkenner op "Altijd op dit apparaat bewaren".</p>`
 :`<div class="warn"><b>Gebruik Microsoft Edge of Google Chrome</b><br>Deze browser ondersteunt geen toegang tot lokale mappen (File System Access API).</div>`}</div>`;
}
function freshHtml(){
 const p=S.bron.proj;if(!p)return`<span class="fresh none" title="Exporteer de lijst naar _bron/projecten.csv">Projectlijst ontbreekt</span>`;
 const age=(now().getTime()-p.mt)/864e5;const old=age>S.cfg.instellingen.versheidDagen;
 return`<span class="fresh${old?' old':''}" title="${old?'Ouder dan '+S.cfg.instellingen.versheidDagen+' dagen: controleer de Power Automate-flow':'Bron: _bron/projecten.csv'}">Projectlijst: ${S.proj.rows.length} rijen, ${S.proj.projects.length} GI-codes, bijgewerkt ${fmtMs(p.mt)}</span>`;
}
function headerHtml(){
 const u=S.user?`<span>👤 ${h(P(S.user))} <button class="link" data-a="whoami">wissel gebruiker</button></span>`:`<button class="sec sm" data-a="whoami">Wie ben je?</button>`;
 return`<header><b>PSA-MoM</b><span class="muted folder" title="${h(S.root.name)}">📁 ${h(S.root.name)}</span>${freshHtml()}<span id="sync" class="badge ${S.status.c}" title="${h(S.status.t)}">${h(S.status.t)}</span><span class="grow"></span>${u}<button class="sec sm" data-a="sync">↻ Synchronisatie controleren</button><button class="sec sm" data-a="reload">↻ Opnieuw inlezen</button><button class="sec sm" data-a="backup">💾 Back-up nu</button></header>`;
}
function navHtml(){
 const myOd=allActions().filter(a=>a.eigenaar===S.user&&isOverdue(a)).length;
 const b=(v,l,x)=>`<button class="${S.view===v||(v==='mtgs'&&['newm','prep'].includes(S.view))||(v==='projs'&&S.view==='proj')?'on':''}" data-a="view" data-v="${v}">${l}${x||''}</button>`;
 let o=`<nav>${b('dash','🏠 Startscherm')}${b('mtgs','🗓 Vergaderingen')}${b('acts','✅ Acties',myOd?`<span class="pill" title="Mijn achterstallige acties">${myOd}</span>`:'')}${b('projs','📁 Projecten')}${b('set','⚙ Instellingen',S.copies.length?'<span class="pill">!</span>':'')}`;
 if(S.edit&&S.M[S.edit])o+=`<div class="sep">Open vergadering</div><button class="${S.view==='mtg'?'on':''}" data-a="view" data-v="mtg">📝 ${h(S.M[S.edit].m.titel)}</button>`;
 const conc=allMeetings().filter(m=>m.status==='Concept'&&[m.aangemaakt_door,m.notulist,m.voorzitter].includes(S.user)&&m.id!==S.edit).sort(byDateDesc).slice(0,6);
 if(conc.length)o+=`<div class="sep">Mijn concepten</div>`+conc.map(m=>`<button data-a="open-edit" data-id="${h(m.id)}" class="small">${fmt(m.datum)} ${h(typeOf(S.cfg,m.type).naam)}</button>`).join('');
 return o+`</nav>`;
}
const VIEWS={};
const personBadge=k=>{const p=S.people.byKey[k];return p?`<span class="pill ${h(p.badge)}">${h(p.badge)}</span>`:''};
function warnBron(){
 let o='';
 if(!S.bron.proj)o+=`<div class="warn"><b>De projectlijst ontbreekt</b> (<code>_bron/projecten.csv</code>). Normaal schrijft een Power Automate-flow dit bestand. Tijdelijke oplossing: open in SharePoint de lijst "Project budgets &amp; SNOW ref" → <i>Exporteren</i> → <i>Exporteren naar CSV</i> en bewaar het bestand als <code>_bron/projecten.csv</code> in deze map. Tot dan kan je enkel projecten notuleren via "Tijdelijk project zonder lijst".</div>`;
 else if(S.proj.missing.length)o+=`<div class="warn">De projectlijst mist kolommen: ${S.proj.missing.map(h).join(', ')}. Controleer de export.</div>`;
 if(!S.bron.pers)o+=`<div class="warn"><b>De personenlijst ontbreekt</b> (<code>_bron/personen.csv</code>). Externe en andere personen kan je toevoegen via Instellingen → Personen.</div>`;
 if(S.copies.length)o+=`<div class="warn"><b>${S.copies.length} OneDrive-conflictkopie(ën) gevonden.</b> <button class="sec sm" data-a="copies">Bekijken en samenvoegen</button></div>`;
 return o;
}

/* ---------- action table (shared) ---------- */
function actTable(list,o){
 o=o||{};if(!list.length)return`<p class="muted">${o.empty||'Geen acties.'}</p>`;
 const mid=o.mid?` data-m="${h(o.mid)}"`:'';
 return`<table class="t sm"><tr><th>ID</th>${o.noProj?'':'<th>Project</th>'}<th>Actie</th><th>Eigenaar</th><th>Deadline</th><th>Prio</th><th>Status</th><th>Sinds</th>${o.ro?'':'<th></th>'}</tr>`+list.map(a=>{const late=isOverdue(a);const last=verloopEntries(a.verloop).slice(-1)[0]||'';
  return`<tr class="${late?'late':''}"><td class="nowrap">${h(a.id)}</td>${o.noProj?'':`<td>${a.gi_code?`<a href="#" data-a="proj" data-gi="${h(a.gi_code)}">${h(a.gi_code)}</a>`:'<span class="muted">Algemeen</span>'}</td>`}<td>${h(a.actie)}${a.afsluiting?`<br><span class="muted">→ ${h(a.afsluiting)}</span>`:''}${last&&o.verloop?`<br><span class="muted small">${h(last)}</span>`:''}</td><td>${h(P(a.eigenaar))||'<span class="bad">?</span>'}</td><td class="nowrap${late?' late':''}">${fmt(a.deadline)||'<span class="bad">?</span>'}${late?' ⚠':''}</td><td>${h(a.prioriteit)}</td><td>${h(a.status)}</td><td class="nowrap">${fmt(a.datum_geidentificeerd)}</td>${o.ro?'':`<td class="nowrap"><button class="sec sm" data-a="act-edit" data-id="${h(a.id)}"${mid} title="Bewerken">✎</button>${isOpen(a)?`<button class="sec sm" data-a="act-shift" data-id="${h(a.id)}"${mid} title="Deadline verschuiven">⏩</button><button class="sec sm" data-a="act-close" data-id="${h(a.id)}"${mid}>Afsluiten</button>`:`<button class="sec sm" data-a="act-reopen" data-id="${h(a.id)}"${mid}>Heropenen</button>`}</td>`}</tr>`}).join('')+`</table>`;
}
function mtgRows(list){
 if(!list.length)return'<p class="muted">Geen vergaderingen.</p>';
 return`<table class="t sm"><tr><th>Datum</th><th>Type</th><th>Titel</th><th>Projecten</th><th>Status</th><th>Besl.</th><th>Acties</th><th></th></tr>`+list.map(m=>{const it=meetingItems(m);
  return`<tr><td class="nowrap">${fmt(m.datum)}</td><td>${h(typeOf(S.cfg,m.type).naam)}</td><td>${h(m.titel)}</td><td class="small">${m.projecten.slice(0,4).map(h).join(', ')}${m.projecten.length>4?` +${m.projecten.length-4}`:''}</td><td><span class="badge ${m.status==='Definitief'?'ok':'warn'}">${h(m.status)}</span></td><td>${it.filter(x=>x.item.type==='Beslissing').length}</td><td>${it.filter(x=>x.item.type==='Actie').length}</td>
  <td class="nowrap"><button class="sec sm" data-a="open-edit" data-id="${h(m.id)}">${m.status==='Definitief'?'Openen':'Notuleren'}</button> <button class="sec sm" data-a="prep" data-id="${h(m.id)}">Voorbereiding</button> <button class="sec sm" data-a="print" data-id="${h(m.id)}">MoM</button></td></tr>`}).join('')+`</table>`;
}

/* ---------- Startscherm ---------- */
VIEWS.dash=()=>{
 const t=today(),mon=t.slice(0,7);const acts=allActions();const open=acts.filter(isOpen);const od=open.filter(a=>isOverdue(a,t));
 const ms=allMeetings();const monM=ms.filter(m=>m.datum.startsWith(mon));
 const dec=monM.reduce((n,m)=>n+meetingItems(m).filter(x=>x.item.type==='Beslissing').length,0);
 const mine=sortActions(open.filter(a=>a.eigenaar===S.user));const myOd=mine.filter(a=>isOverdue(a,t)).length;
 const recent=ms.filter(m=>m.datum>=addDays(t,-28)).sort(byDateDesc);
 const conc=ms.filter(m=>m.status==='Concept'&&[m.aangemaakt_door,m.notulist,m.voorzitter].includes(S.user)).sort(byDateDesc);
 const pers=S.bron.pers;
 return`<h2>Startscherm</h2>${warnBron()}
 <div class="kpis"><div class="kpi"><span class="muted">Open acties</span><b>${open.length}</b></div><div class="kpi${od.length?' alert':''}"><span class="muted">Achterstallige acties</span><b>${od.length}</b></div><div class="kpi"><span class="muted">Beslissingen deze maand</span><b>${dec}</b></div><div class="kpi"><span class="muted">Vergaderingen deze maand</span><b>${monM.length}</b></div></div>
 <section class="card"><h3>Mijn acties <span class="muted">(${mine.length} open${myOd?`, <span class="bad">${myOd} achterstallig</span>`:''})</span></h3>${S.user?actTable(mine,{empty:'Je hebt geen open acties.',verloop:true}):'<p class="muted">Kies eerst wie je bent.</p>'}</section>
 ${conc.length?`<section class="card"><h3>Mijn conceptvergaderingen</h3>${mtgRows(conc)}</section>`:''}
 <section class="card"><h3>Recente vergaderingen <span class="muted">(laatste 4 weken)</span> <button class="pri sm" data-a="newm">+ Nieuwe vergadering</button></h3>${mtgRows(recent)}</section>
 <section class="card"><h3>Bronnen</h3><ul class="small"><li>${freshHtml().replace(/<[^>]+>/g,'')}${S.bron.proj?` · bestand <code>_bron/projecten.csv</code>${S.proj.noGi.length?` · ${S.proj.noGi.length} rijen zonder GI-code`:''}`:''}</li>
 <li>Personenlijst: ${pers?`${pers.n} personen (SPE/PMO), bijgewerkt ${fmtMs(pers.mt)}`:'<b>ontbreekt</b>'} · ${S.extra.length} extra personen (personen-extra.csv)</li>
 <li>Gegevens: ${Object.keys(S.M).length} vergaderingen${S.pendingYears.length?` (oudere jaren worden nog geladen: ${S.pendingYears.join(', ')})`:''}, ${acts.length} acties in ${Object.keys(S.R).length} registers · ingelezen in ${S.loadMs} ms</li></ul></section>`;
};

/* ---------- Vergaderingen ---------- */
VIEWS.mtgs=()=>{
 const f=S.flt.mtgs;let ms=allMeetings();
 if(f.type)ms=ms.filter(m=>m.type===f.type);if(f.van)ms=ms.filter(m=>m.datum>=f.van);if(f.tot)ms=ms.filter(m=>m.datum<=f.tot);
 if(f.project)ms=ms.filter(m=>m.projecten.includes(f.project));if(f.persoon)ms=ms.filter(m=>[...m.aanwezig,m.voorzitter,m.notulist].includes(f.persoon));
 if(f.status)ms=ms.filter(m=>m.status===f.status);
 if(f.q)ms=ms.filter(m=>matchQuery(fold([m.titel,m.id,...m.projecten,...m.projecten.map(projName),...meetingItems(m).map(x=>x.item.id+' '+x.item.tekst)].join(' ')),f.q));
 ms.sort(byDateDesc);
 const all=allMeetings();const projs=uniq(all.flatMap(m=>m.projecten)).sort();const pers=uniq(all.flatMap(m=>[...m.aanwezig,m.voorzitter,m.notulist])).sort((a,b)=>P(a).localeCompare(P(b)));
 return`<h2>Vergaderingen</h2>${warnBron()}<div class="bar"><select data-f="flt|mtgs|type"><option value="">Alle types</option>${opts(S.cfg.vergadertypes.map(t=>[t.id,t.naam]),f.type)}</select>
 <label>van <input type="date" data-f="flt|mtgs|van" value="${h(f.van)}"></label><label>tot <input type="date" data-f="flt|mtgs|tot" value="${h(f.tot)}"></label>
 <select data-f="flt|mtgs|project"><option value="">Alle projecten</option>${opts(projs.map(g=>[g,g+' – '+projName(g)]),f.project)}</select>
 <select data-f="flt|mtgs|persoon"><option value="">Alle deelnemers</option>${opts(pers.map(k=>[k,P(k)]),f.persoon)}</select>
 <select data-f="flt|mtgs|status"><option value="">Alle statussen</option>${opts(MTG_STATUS,f.status)}</select>
 <input class="grow" type="search" placeholder="Zoeken in titel en notulen…" data-f="flt|mtgs|q" value="${h(f.q)}"><button class="pri" data-a="newm">+ Nieuwe vergadering</button></div>
 <p class="muted small">${ms.length} vergadering(en)${S.pendingYears.length?' · oudere jaren worden nog geladen…':''}</p>${mtgRows(ms)}`;
};

/* ---------- multi-select filter + project picker (dashboard style) ---------- */
function msHtml(scope,key,label,values){
 const set=S.flt[scope][key];const id=scope+'.'+key;
 return`<details class="ms${set.size?' act':''}" data-ms="${id}"${S.ui.openMs===id?' open':''}><summary>${h(label)}${set.size?` (${set.size})`:''}</summary><div class="menu"><div class="row"><button class="sec sm" data-a="ms-clear" data-ms="${id}">Alles</button></div>${values.map(v=>`<label><input type="checkbox" data-msv="${id}" value="${h(v)}"${set.has(v)?' checked':''}> ${h(v)}</label>`).join('')}</div></details>`;
}
function projFilterBar(scope){
 const f=S.flt[scope];const ps=S.proj.projects;const vals=k=>uniq(ps.flatMap(k)).sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
 return`<div class="filters">${msHtml(scope,'status','Status',VALID_STATUSES)}${msHtml(scope,'location','Locatie',vals(p=>p.locaties))}${msHtml(scope,'portfolio','Portfolio',vals(p=>p.portfolios))}${msHtml(scope,'year','Jaar',vals(p=>p.jaren))}${msHtml(scope,'pm','PM',vals(p=>p.pmNamen))}
 <input type="search" style="flex:1;min-width:220px;width:auto" placeholder="Zoek op GI-code, PRJ, DMND, omschrijving, PM…" data-f="flt|${scope}|q" value="${h(f.q)}"><label class="chk"><input type="checkbox" data-f="flt|${scope}|noGi"${f.noGi?' checked':''}> Toon rijen zonder GI-code</label>${scope==='projs'?`<label class="chk"><input type="checkbox" data-f="flt|projs|mijn"${f.mijn?' checked':''}> Mijn projecten (PM)</label>`:''}<button class="sec sm" data-a="flt-reset" data-s="${scope}">Reset</button></div>`;
}
function noGiRows(scope,cols){
 const f=S.flt[scope];if(!f.noGi)return'';const rows=S.proj.noGi.filter(r=>matchQuery(fold([r.omschrijving,r.prj,r.dmnd,r.pmNaam,r.budgetCode,r.location].join(' ')),f.q));
 return rows.map(r=>`<tr class="grey" title="Geen GI-code: notuleer onder een algemene vergadering of vraag een GI-code aan"><td>—</td><td>${h(r.omschrijving)}<br><span class="small">Geen GI-code: notuleer onder een algemene vergadering of vraag een GI-code aan</span></td><td>${h(r.status)}</td><td>${h(r.pmNaam)}</td><td>${h(r.location)}</td><td>${h(r.year)}</td>${'<td></td>'.repeat(cols)}</tr>`).join('');
}
function pickerHtml(){
 const f=S.form;const ps=S.proj.projects.filter(p=>matchProject(p,S.flt.pick));
 const chips=f.projecten.map(g=>`<span class="chip">${h(g)} – ${h(f.tmpNamen[g]||projName(g))}${isTmp(g)?' <span class="pill tmp">tijdelijk</span>':''}<button type="button" data-a="pick-del" data-gi="${h(g)}">×</button></span>`).join(' ');
 return`<div class="row">${chips||'<span class="muted">Nog geen projecten gekozen.</span>'}</div>
 ${S.bron.proj?`${projFilterBar('pick')}<div style="max-height:360px;overflow:auto;margin-top:6px"><table class="t sm"><tr><th></th><th>Project</th><th>Status</th><th>PM</th><th>Locatie</th><th>Jaar</th><th>PRJ / DMND</th></tr>`+
 ps.map(p=>`<tr class="click" data-a="pick-toggle" data-gi="${h(p.gi)}"><td><input type="checkbox" tabindex="-1"${f.projecten.includes(p.gi)?' checked':''}></td><td><b>${h(p.gi)}</b> – ${h(p.naam)}${p.rows.length>1?` <span class="muted small">(${p.rows.length} budgetlijnen)</span>`:''}</td><td>${p.statuses.map(statusPill).join(' ')}</td><td>${h(p.pmNamen.join(', '))}</td><td>${h(p.locaties.join(', '))}</td><td>${h(p.jaren.join(', '))}</td><td class="small">${h([...p.prj,...p.dmnd].join(' '))}</td></tr>`).join('')+noGiRows('pick',1)+`</table></div><p class="muted small">${ps.length} projecten</p>`:warnBron()}
 <details${S.bron.proj?'':' open'}><summary class="small">Project staat niet in de lijst? → Tijdelijk project zonder lijst</summary><div class="row"><input id="tmpnaam" class="grow" placeholder="Naam van het project (wordt gemarkeerd als tijdelijk)"><button class="sec" data-a="pick-tmp">Tijdelijk project toevoegen</button></div><p class="muted small">Gebruik dit enkel als uitzondering; vraag een GI-code aan zodra het project gekend is.</p></details>`;
}

/* ---------- Nieuwe vergadering ---------- */
function initForm(){
 const t=S.cfg.vergadertypes.find(x=>x.actief)||S.cfg.vergadertypes[0];
 S.form={type:t?t.id:'',datum:today(),titel:'',titelAuto:true,voorzitter:S.user||'',notulist:S.user||'',aanwezig:S.user?[S.user]:[],verontschuldigd:[],projecten:[],tmpNamen:{}};autoTitle();
}
function autoTitle(){const f=S.form;if(f.titelAuto)f.titel=`${typeOf(S.cfg,f.type).naam} ${fmt(f.datum)}`}
function prevOfType(type,datum){return allMeetings().filter(m=>m.type===type&&m.datum<=datum).sort(byDateDesc)[0]||null}
VIEWS.newm=()=>{
 if(!S.form)initForm();const f=S.form;const tp=typeOf(S.cfg,f.type);const prev=prevOfType(f.type,f.datum);
 return`<h2>Nieuwe vergadering</h2><section class="card"><div class="grid">
 <div><label>Vergadertype</label><select data-f="form|type">${opts(S.cfg.vergadertypes.filter(t=>t.actief).map(t=>[t.id,t.naam+(t.projectgebonden?' (projectgebonden)':' (algemeen)')]),f.type)}</select></div>
 <div><label>Datum</label><input type="date" data-f="form|datum" value="${h(f.datum)}"></div>
 <div class="wide"><label>Titel</label><input data-f="form|titel" value="${h(f.titel)}"></div>
 <div><label>Voorzitter</label>${ppHtml('form.voorzitter')}</div><div><label>Notulist</label>${ppHtml('form.notulist')}</div>
 <div class="wide"><label>Aanwezigen</label>${ppHtml('form.aanwezig')}${prev?`<button class="sec sm" data-a="form-prevpeople" style="margin-top:4px">Zelfde deelnemers als vorige vergadering van dit type (${fmt(prev.datum)})</button>`:''}</div>
 <div class="wide"><label>Verontschuldigd</label>${ppHtml('form.verontschuldigd')}</div></div></section>
 <section class="card"><h3>${tp.projectgebonden?'Projecten in deze vergadering':'Projectsecties (optioneel)'} ${prev&&prev.projecten.length?`<button class="sec sm" data-a="form-prevproj">Projecten van vorige vergadering overnemen (${prev.projecten.length})</button>`:''}</h3>
 ${tp.projectgebonden?pickerHtml():`<details${f.projecten.length?' open':''}><summary class="small">Projectsecties toevoegen aan deze algemene vergadering</summary>${pickerHtml()}</details>`}</section>
 <div id="form-err" class="err">${h(S.ui.formErr||'')}</div><div class="row end"><button class="sec" data-a="view" data-v="mtgs">Annuleren</button><button class="sec" data-a="form-create" data-next="prep">Aanmaken → Voorbereiding</button><button class="pri" data-a="form-create" data-next="mtg">Aanmaken → Notuleren</button></div>`;
};

/* ---------- Voorbereiding ---------- */
function projHead(gi){
 const p=projInfo(gi);if(!p)return'';
 if(p.tijdelijk)return`<p><span class="pill tmp">tijdelijk project zonder lijst</span></p>`;
 if(p.onbekend)return`<p class="warn">GI-code niet gevonden in de projectlijst.</p>`;
 return`<table class="t sm"><tr><th>Budgetlijn</th><th>Jaar</th><th>Status</th><th>PM</th><th class="num">Budget</th><th class="num">PIF</th><th>PRJ</th><th>DMND</th><th>Budgetcode</th></tr>`+p.rows.map(r=>`<tr><td>${h(r.omschrijving)}</td><td>${h(r.year)}</td><td>${statusPill(r.status)}</td><td>${h(r.pmNaam)}</td><td class="num">${hasMoney(r.budgetRaw)?formatEuro(r.budget):'—'}</td><td class="num">${hasMoney(r.pifRaw)?formatEuro(r.pif):'—'}</td><td>${h(r.prj)}</td><td>${h(r.dmnd)}</td><td class="small">${h(r.budgetCode)}</td></tr>`).join('')+`</table>`;
}
function openActsFor(m,sec){
 const R=S.R[regKeyFor(sec)];if(!R)return[];
 return sortActions(R.rows.filter(a=>a.vergadering!==m.id&&(sec!==ALG||parseTopicRef(a.topic).type===m.type||!a.topic)&&(isOpen(a)||verloopMentions(a,m.id))));
}
function prevItemsHtml(items,actsById){return`<ul>${items.map(it=>{const a=it.type==='Actie'&&actsById(it.id);return`<li>${it.type!=='Info'?`<b class="ty-${it.type}">${it.type}</b> `:''}${it.id?h(it.id)+': ':''}${h(a?a.actie:it.tekst).replace(/\n/g,'<br>')}${a?` <span class="muted">(${h(P(a.eigenaar))}, ${fmt(a.deadline)}, ${h(a.status)})</span>`:''}</li>`}).join('')}</ul>`}
VIEWS.prep=()=>{
 const Mt=S.M[S.p.id];if(!Mt)return'<p>Vergadering niet gevonden.</p>';const m=Mt.m;const prev=previousMeeting(allMeetings(),m);
 return`<div class="bar"><b>Voorbereiding: ${h(m.titel)}</b><span class="grow"></span><button class="sec" data-a="print" data-id="${h(m.id)}">MoM</button><button class="pri" data-a="open-edit" data-id="${h(m.id)}">▶ Start vergadering</button></div>
 <section class="card"><p>${fmt(m.datum)} · ${h(typeOf(S.cfg,m.type).naam)} · voorzitter ${h(P(m.voorzitter)||'-')} · notulist ${h(P(m.notulist)||'-')}</p><p class="small">Aanwezig: ${h(m.aanwezig.map(P).join(', ')||'-')}</p><p class="small muted">Vorige vergadering van dit type: ${prev?`<a href="#" data-a="print" data-id="${h(prev.id)}">${fmt(prev.datum)} – ${h(prev.titel)}</a>`:'geen'}</p></section>`+
 m.secties.map(s=>{const isA=s.key===ALG;const acts=openActsFor(m,s.key).filter(isOpen);
  const ps=prev&&prev.secties.find(x=>x.key===s.key);const pi=ps?Object.keys(ps.blokken).map(Number).sort((a,b)=>a-b).filter(nr=>ps.blokken[nr].length):[];
  const dec=ps?pi.flatMap(nr=>ps.blokken[nr].filter(i=>i.type==='Beslissing')):[];
  return`<section class="card sect${isA?' alg':''}"><h3>${isA?'Algemeen':`${h(s.key)} – ${h(projName(s.key))} <a href="#" class="small" data-a="proj" data-gi="${h(s.key)}">projectpagina</a>`}</h3>${isA?'':projHead(s.key)}
  <h4>Open acties (${acts.length}${acts.filter(a=>isOverdue(a)).length?`, <span class="bad">${acts.filter(a=>isOverdue(a)).length} achterstallig</span>`:''})</h4>${actTable(acts,{noProj:true,ro:true,empty:'Geen open acties.'})}
  <h4>Beslissingen vorige vergadering</h4>${dec.length?prevItemsHtml(dec,actById):'<p class="muted small">Geen.</p>'}
  <h4>Notulen vorige vergadering${prev?` (${fmt(prev.datum)})`:''}</h4>${pi.length?pi.map(nr=>`<div class="prev"><b>${nr}. ${h(topicName(S.cfg,m.type,nr))}</b>${prevItemsHtml(ps.blokken[nr],actById)}</div>`).join(''):'<p class="muted small">Geen.</p>'}</section>`}).join('');
};

/* ---------- Notuleren ---------- */
VIEWS.mtg=()=>{
 const Mt=S.M[S.edit];if(!Mt)return'<p>Geen vergadering open.</p>';const m=keys(Mt.m);const ro=S.ro;const tp=typeOf(S.cfg,m.type);const dis=ro?' disabled':'';
 let banner='';
 if(S.roReason==='definitief')banner=`<div class="ro-banner">Deze vergadering is <b>Definitief</b> en daarom alleen-lezen. ${S.readOnlyAll?'':'<button class="sec sm" data-a="m-concept">Terug naar Concept</button>'}</div>`;
 else if(S.roReason.startsWith('lock:'))banner=`<div class="ro-banner">Alleen-lezen geopend: wordt bewerkt door ${h(S.roReason.slice(5))}. <button class="sec sm" data-a="m-forceedit">Toch bewerken</button></div>`;
 else if(ro)banner=`<div class="ro-banner">Alleen-lezen.</div>`;
 const head=`<div class="bar"><b>${h(m.titel)}</b><span class="pill">${h(tp.naam)}</span><label>Status <select data-f="mstatus"${S.readOnlyAll?' disabled':''}>${opts(MTG_STATUS,m.status)}</select></label><span class="grow"></span>
 <button class="sec sm" data-a="prep" data-id="${h(m.id)}">Voorbereiding</button>${ro?'':`<button class="sec sm" data-a="m-addproj">+ Project</button>${m.secties.some(s=>s.key===ALG)?'':'<button class="sec sm" data-a="m-addalg">+ Algemeen</button>'}`}
 <button class="sec sm" data-a="print" data-id="${h(m.id)}">🖨 MoM / afdrukken</button><button class="sec sm" data-a="mail" data-id="${h(m.id)}">✉ E-mailtekst</button><button class="sec sm" data-a="closem">Sluiten</button></div>`;
 const meta=`<details class="card"${m.status==='Concept'&&!m.aanwezig.length?' open':''}><summary><b>Vergadering</b> <span class="muted small">${fmt(m.datum)} · voorzitter ${h(P(m.voorzitter)||'-')} · notulist ${h(P(m.notulist)||'-')} · ${m.aanwezig.length} aanwezig</span></summary><div class="grid">
 <div><label>Datum</label><input type="date" data-f="m|datum" value="${h(m.datum)}" disabled title="De datum bepaalt de bestandsnaam en kan niet meer gewijzigd worden"></div><div class="wide"><label>Titel</label><input data-f="m|titel" value="${h(m.titel)}"${dis}></div>
 <div><label>Voorzitter</label>${ppHtml('m.voorzitter',{dis:ro})}</div><div><label>Notulist</label>${ppHtml('m.notulist',{dis:ro})}</div>
 <div class="wide"><label>Aanwezigen</label>${ppHtml('m.aanwezig',{dis:ro})}</div><div class="wide"><label>Verontschuldigd</label>${ppHtml('m.verontschuldigd',{dis:ro})}</div></div></details>`;
 return head+banner+meta+m.secties.map(s=>sectionCard(m,s,ro)).join('')+`<p class="muted small">Sneltoetsen in een item: <code>Enter</code> = nieuw item, <code>Shift+Enter</code> = nieuwe regel, <code>Ctrl+1</code> Actie, <code>Ctrl+2</code> Beslissing, <code>Ctrl+3</code> Info. Wijzigingen worden automatisch opgeslagen. <label class="chk" style="display:inline-flex"><input type="checkbox" data-f="ui|allTopics"${S.ui.allTopics?' checked':''}> Toon alle topics, ook lege</label></p>`;
};
function sectionCard(m,s,ro){
 const isA=s.key===ALG;const p=isA?null:projInfo(s.key);const all=allMeetings();
 const fu=openActsFor(m,s.key);
 const topics=topicList(S.cfg,m.type,true).filter(t=>t.actief||(s.blokken[t.nr]||[]).length);
 const extra=Object.keys(s.blokken).map(Number).filter(nr=>!topics.some(t=>t.nr===nr));
 const tps=[...topics,...extra.map(nr=>({nr,naam:'Topic '+nr}))];
 return`<section class="card sect${isA?' alg':''}"><h3>${isA?'Algemeen':`${h(s.key)} – ${h(projName(s.key))}`} ${p?p.statuses.map(statusPill).join(' '):''} ${p&&p.tijdelijk?'<span class="pill tmp">tijdelijk</span>':''} <span class="muted small">${p&&p.pmNamen?h(p.pmNamen.join(', ')):''}</span>
 <span style="float:right">${isA?'':`<a href="#" class="small" data-a="proj" data-gi="${h(s.key)}">projectpagina</a> `}${ro?'':`<button class="sec sm" data-a="paste" data-s="${h(s.key)}">📋 Notities plakken</button> <button class="sec sm" data-a="m-delsec" data-s="${h(s.key)}" title="Sectie verwijderen (enkel als ze leeg is)">✕</button>`}</span></h3>
 <div class="reg"><b>Opvolging open acties</b> <span class="muted small">(${fu.filter(isOpen).length} open${isA?' – algemene acties van dit vergadertype':''})</span>${fuTable(m,fu,ro)}</div>`+
 tps.map(t=>({t,items:s.blokken[t.nr]||[],pv:previousTopic(all,m,s.key,t.nr)})).filter(x=>x.items.length||x.pv||S.ui.allTopics).map(({t,items,pv})=>{
  return`<div class="topic"><h4>${t.nr}. ${h(t.naam)}${t.actief===false?' <span class="muted small">(niet meer actief)</span>':''}</h4>
  ${pv?`<div class="prev"><b>Vorige keer</b> <span class="muted">(${fmt(pv.meeting.datum)})</span>${prevItemsHtml(pv.items,actById)}</div>`:''}
  ${items.map(it=>itemRow(m,s.key,t.nr,it,ro)).join('')}
  ${ro?'':`<button class="sec sm" data-a="it-add" data-s="${h(s.key)}" data-n="${t.nr}">+ Item</button>`}</div>`}).join('')+
 (ro||S.ui.allTopics?'':(()=>{const empty=tps.filter(t=>!(s.blokken[t.nr]||[]).length&&!previousTopic(all,m,s.key,t.nr)&&t.actief!==false);
  return empty.length?`<div class="topic row small"><span class="muted">Nog niets genoteerd voor:</span>${empty.map(t=>`<button class="sec sm" data-a="it-add" data-s="${h(s.key)}" data-n="${t.nr}">+ ${t.nr}. ${h(t.naam)}</button>`).join('')}</div>`:''})())+`</section>`;
}
function fuTable(m,list,ro){
 if(!list.length)return'<p class="muted small">Geen open acties.</p>';
 return`<table class="t sm"><tr><th>ID</th><th>Actie</th><th>Eigenaar</th><th>Deadline</th><th>Status</th><th></th></tr>`+list.map(a=>{const late=isOverdue(a);const last=verloopEntries(a.verloop).slice(-1)[0]||'';
  return`<tr class="${late?'late':''}"><td class="nowrap">${h(a.id)}</td><td>${h(a.actie)}${a.afsluiting?`<br><span class="muted">→ ${h(a.afsluiting)}</span>`:''}<br><span class="muted small">${h(last)}</span></td><td>${h(P(a.eigenaar))}</td><td class="nowrap${late?' late':''}">${fmt(a.deadline)}${late?' ⚠':''}</td>
  <td>${isOpen(a)&&!ro?`<select data-f="fu|${h(a.id)}">${opts(ACT_OPEN,a.status)}</select>`:h(a.status)}</td><td class="nowrap">${ro?'':isOpen(a)?`<button class="sec sm" data-a="act-shift" data-id="${h(a.id)}" data-m="${h(m.id)}">⏩ Deadline</button><button class="sec sm" data-a="act-close" data-id="${h(a.id)}" data-m="${h(m.id)}">Afsluiten</button>`:`<button class="sec sm" data-a="act-reopen" data-id="${h(a.id)}" data-m="${h(m.id)}">Heropenen</button>`}</td></tr>`}).join('')+`</table>`;
}
function itemRow(m,sec,nr,it,ro){
 const key=`${sec}|${nr}|${it._k}`;const a=it.type==='Actie'&&it.id?actById(it.id):null;const dis=ro?' disabled':'';
 const t=a?a.actie:it.tekst;const rows=Math.max(1,String(t).split('\n').length);
 let af='';
 if(it.type==='Actie'){
  if(!a)af=`<div class="af"><span class="warn small">Actie niet gevonden in het register${it.id?' ('+h(it.id)+')':''}</span></div>`;
  else{const own=a.vergadering===m.id;
   af=`<div class="af">${ppHtml('act.'+a.id+'.eigenaar',{dis:ro||!isOpen(a),ph:'Eigenaar…'})}<input type="date" data-f="act|${h(a.id)}|deadline" value="${h(a.deadline)}"${own&&!ro&&isOpen(a)?'':' disabled'} title="${own?'Deadline':'Bestaande actie: gebruik Deadline verschuiven'}"${!a.deadline?' style="border-color:#f59e0b"':''}><select data-f="act|${h(a.id)}|prioriteit"${dis}>${opts(PRIO,a.prioriteit)}</select><span class="small ${isOverdue(a)?'late-txt':'muted'}">${h(a.status)}${isOverdue(a)?' ⚠':''}</span></div>`}
 }
 return`<div class="item"><select class="ty ty-${it.type}" data-f="it|${h(key)}|type"${dis}>${opts(ITEM_TYPES,it.type)}</select>
 <div><textarea rows="${rows}" data-f="it|${h(key)}|tekst"${dis} placeholder="${it.type==='Actie'?'Wat moet er gebeuren?':it.type==='Beslissing'?'Wat werd beslist?':'Notitie…'}">${h(t)}</textarea>${it.id?`<div class="idl">${h(it.id)}</div>`:''}</div>
 <div class="tools">${ro?'':`<button class="sec" data-a="it-up" data-k="${h(key)}" title="Omhoog">↑</button><button class="sec" data-a="it-down" data-k="${h(key)}" title="Omlaag">↓</button><button class="sec" data-a="it-del" data-k="${h(key)}" title="Verwijderen">✕</button>`}</div>${af}</div>`;
}

/* ---------- people picker ---------- */
function ppAccess(name){
 const i=name.indexOf('.');const scope=name.slice(0,i),rest=name.slice(i+1);
 if(scope==='form')return{multi:Array.isArray(S.form[rest]),get:()=>S.form[rest],set:v=>{S.form[rest]=v}};
 if(scope==='m'){const Mt=S.M[S.edit];return{multi:['aanwezig','verontschuldigd'].includes(rest),get:()=>Mt.m[rest],set:v=>{Mt.m[rest]=v;touchM(S.edit)}}}
 if(scope==='act'){const id=rest.slice(0,rest.lastIndexOf('.'));return{multi:false,get:()=>(actById(id)||{}).eigenaar,set:v=>{cmd.setActionField(id,'eigenaar',v,S.view==='mtg'?S.edit:'')}}}
 if(scope==='dlg')return{multi:Array.isArray(S.dlg[rest]),get:()=>S.dlg[rest],set:v=>{S.dlg[rest]=v}};
 return{multi:false,get:()=>'',set:()=>{}};
}
function ppHtml(name,o){
 o=o||{};const acc=ppAccess(name);const v=acc.get();const vals=acc.multi?(v||[]):(v?[v]:[]);
 const chips=vals.map(k=>`<span class="chip" title="${h(k)}">${h(P(k))} ${personBadge(k)}${o.dis?'':`<button type="button" data-a="pp-del" data-pp="${h(name)}" data-k="${h(k)}">×</button>`}</span>`).join('');
 const inp=!o.dis&&(acc.multi||!vals.length);
 return`<div class="pp${o.dis?' dis':''}" data-ppw="${h(name)}">${chips}${inp?`<input data-ppq="${h(name)}" data-f="ppq|${h(name)}" placeholder="${h(o.ph||'Zoek op naam, e-mail of organisatie…')}" autocomplete="off"><div class="pp-res"></div>`:''}${!vals.length&&o.dis?'<span class="muted small">–</span>':''}</div>`;
}
function ppRefresh(name,focus){const w=[...document.querySelectorAll('[data-ppw]')].find(x=>x.dataset.ppw===name);if(!w)return;w.outerHTML=ppHtml(name);if(focus){const n=[...document.querySelectorAll('[data-ppq]')].find(x=>x.dataset.ppq===name);if(n)n.focus()}}
function ppSearch(inp){
 const name=inp.dataset.ppq;const acc=ppAccess(name);const cur=acc.multi?(acc.get()||[]):[acc.get()];const q=inp.value.trim();const res=inp.parentElement.querySelector('.pp-res');
 const list=(q?searchPeople(S.people,q):S.people.list.filter(p=>p.actief!==false)).filter(p=>!cur.includes(p.key)).slice(0,10);
 res.innerHTML=list.map((p,i)=>`<button type="button" class="${i===0?'hl':''}" data-a="pp-add" data-pp="${h(name)}" data-k="${h(p.key)}">${h(p.naam)} <span class="pill ${h(p.badge)}">${h(p.badge)}</span> <span class="muted small">${h(p.organisatie&&p.badge==='extern'?p.organisatie:p.email)}</span></button>`).join('')+(q?`<button type="button" data-a="pp-new" data-pp="${h(name)}" data-q="${h(q)}">+ Nieuwe persoon "${h(q)}" toevoegen (extern / overig intern)</button>`:'');
 res.classList.add('open');
}
function ppAdd(name,key){const acc=ppAccess(name);if(acc.multi){const v=[...(acc.get()||[])];if(!v.includes(key))v.push(key);acc.set(v)}else acc.set(key);ppRefresh(name,acc.multi)}
function ppDel(name,key){const acc=ppAccess(name);if(acc.multi)acc.set((acc.get()||[]).filter(x=>x!==key));else acc.set('');ppRefresh(name,true)}

/* ---------- Projecten ---------- */
function projStats(){
 const st={};const g=k=>st[k]||(st[k]={last:null,open:0,late:0,n:0});
 allMeetings().forEach(m=>m.secties.forEach(s=>{if(s.key===ALG)return;const x=g(s.key);x.n++;if(!x.last||byDate(x.last,m)<0)x.last=m}));
 allActions().forEach(a=>{if(!a.gi_code||!isOpen(a))return;const x=g(a.gi_code);x.open++;if(isOverdue(a))x.late++});
 return st;
}
VIEWS.projs=()=>{
 const f=S.flt.projs;const st=projStats();const mine=f.mijn?myProjects():null;
 let ps=S.proj.projects.filter(p=>matchProject(p,f)&&(!mine||mine.has(p.gi)));
 const tmps=uniq(allMeetings().flatMap(m=>m.projecten.filter(isTmp))).map(tmpInfo).filter(p=>matchQuery(fold(p.gi+' '+p.naam),f.q));
 return`<h2>Projecten</h2>${warnBron()}<div class="card">${projFilterBar('projs')}</div><p class="muted small">${ps.length} projecten${tmps.length?` + ${tmps.length} tijdelijk`:''}</p>
 <table class="t sm"><tr><th>GI-code</th><th>Project</th><th>Status</th><th>PM</th><th>Locatie</th><th>Jaar</th><th class="num">PIF</th><th>Laatste vergadering</th><th class="num">Open acties</th><th class="num">Achterstallig</th></tr>`+
 [...ps,...tmps].map(p=>{const x=st[p.gi]||{};return`<tr class="click" data-a="proj" data-gi="${h(p.gi)}"><td class="nowrap"><b>${h(p.gi)}</b></td><td>${h(p.naam)}${p.tijdelijk?' <span class="pill tmp">tijdelijk</span>':''}${p.rows.length>1?` <span class="muted small">(${p.rows.length} budgetlijnen)</span>`:''}</td><td>${(p.statuses||[]).map(statusPill).join(' ')}</td><td>${h((p.pmNamen||[]).join(', '))}</td><td>${h((p.locaties||[]).join(', '))}</td><td>${h((p.jaren||[]).join(', '))}</td><td class="num">${p.pif?formatEuro(p.pif):'—'}</td><td class="nowrap">${x.last?fmt(x.last.datum)+' <span class="muted small">'+h(typeOf(S.cfg,x.last.type).naam)+'</span>':'<span class="muted">–</span>'}</td><td class="num">${x.open||0}</td><td class="num${x.late?' late':''}">${x.late||0}</td></tr>`}).join('')+noGiRows('projs',4)+`</table>`;
};
VIEWS.proj=()=>{
 const gi=S.p.gi;const p=projInfo(gi);const tab=S.p.tab||'tijdlijn';const ms=allMeetings();
 const tl=projectTimeline(ms,gi).filter(x=>(!S.p.mt||x.meeting.type===S.p.mt)&&(!S.p.it||x.item.type===S.p.it));
 const acts=sortActions(allActions().filter(a=>a.gi_code===gi));
 let body='';
 if(tab==='tijdlijn'){let cur='';body=`<div class="row"><select data-f="p|mt"><option value="">Alle vergadertypes</option>${opts(S.cfg.vergadertypes.map(t=>[t.id,t.naam]),S.p.mt||'')}</select><select data-f="p|it"><option value="">Alle itemtypes</option>${opts(ITEM_TYPES,S.p.it||'')}</select></div>`+
  (tl.length?tl.map(x=>{let o='';if(x.meeting.id!==cur){if(cur)o+='</ul></div>';cur=x.meeting.id;o+=`<div class="card"><h3>${fmt(x.meeting.datum)} – ${h(x.meeting.titel)} <span class="pill">${h(typeOf(S.cfg,x.meeting.type).naam)}</span> <button class="sec sm" data-a="print" data-id="${h(x.meeting.id)}">MoM</button></h3><ul>`}
   const a=x.item.type==='Actie'&&actById(x.item.id);return o+`<li><span class="muted small">${h(topicName(S.cfg,x.meeting.type,x.nr))}</span> · ${x.item.type!=='Info'?`<b class="ty-${x.item.type}">${x.item.type}</b> `:''}${x.item.id?h(x.item.id)+': ':''}${h(a?a.actie:x.item.tekst).replace(/\n/g,'<br>')}${a?` <span class="muted">(${h(P(a.eigenaar))}, ${fmt(a.deadline)}, ${h(a.status)})</span>`:''}</li>`}).join('')+'</ul></div>':'<p class="muted">Nog geen notulen voor dit project.</p>')}
 else if(tab==='beslissingen'){const d=projectTimeline(ms,gi).filter(x=>x.item.type==='Beslissing');body=d.length?`<table class="t sm"><tr><th>Datum</th><th>ID</th><th>Beslissing</th><th>Vergadering</th></tr>`+d.map(x=>`<tr><td class="nowrap">${fmt(x.meeting.datum)}</td><td class="nowrap">${h(x.item.id)}</td><td>${h(x.item.tekst).replace(/\n/g,'<br>')}</td><td>${h(x.meeting.titel)}</td></tr>`).join('')+'</table>':'<p class="muted">Geen beslissingen.</p>'}
 else{const all=S.p.all;body=`<label class="chk"><input type="checkbox" data-f="p|all"${all?' checked':''}> Toon ook afgesloten acties</label>`+actTable(all?acts:acts.filter(isOpen),{noProj:true,verloop:true})}
 return`<div class="bar"><b>${h(gi)} – ${h(p?p.naam:gi)}</b>${p&&p.tijdelijk?'<span class="pill tmp">tijdelijk</span>':''}<span class="grow"></span><button class="sec" data-a="dossier" data-gi="${h(gi)}">📄 Projectdossier exporteren (.md)</button><button class="sec" data-a="view" data-v="projs">← Projecten</button></div>
 <section class="card">${projHead(gi)}</section><div class="tabs">${[['tijdlijn','🕘 Tijdlijn'],['beslissingen','⚖ Beslissingen'],['acties',`✅ Acties (${acts.filter(isOpen).length} open)`]].map(t=>`<button class="${tab===t[0]?'on':''}" data-a="ptab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>${body}`;
};

/* ---------- Acties ---------- */
VIEWS.acts=()=>{
 const f=S.flt.acts;const all=allActions();
 const list=sortActions(all.filter(a=>matchAction(a,f,{personLabel:P,projName})));
 const owners=uniq(all.map(a=>a.eigenaar)).sort((a,b)=>P(a).localeCompare(P(b)));const projs=uniq(all.map(a=>a.gi_code||ALG)).sort();
 return`<h2>Acties</h2><div class="bar"><select data-f="flt|acts|eigenaar"><option value="">Alle eigenaars</option>${opts(owners.map(k=>[k,P(k)||'(geen eigenaar)']),f.eigenaar)}</select><button class="sec sm" data-a="acts-mine">Mijn acties</button>
 <select data-f="flt|acts|project"><option value="">Alle projecten</option>${opts(projs.map(g=>[g,g===ALG?'Algemeen':g+' – '+projName(g)]),f.project)}</select>
 <select data-f="flt|acts|type"><option value="">Alle vergadertypes</option>${opts(S.cfg.vergadertypes.map(t=>[t.id,t.naam]),f.type)}</select>
 <select data-f="flt|acts|status">${opts([['open','Open (alle open statussen)'],['gesloten','Afgesloten/geannuleerd'],['alle','Alle'],...ACT_STATUS.map(s=>[s,s])],f.status)}</select>
 <label class="chk"><input type="checkbox" data-f="flt|acts|overdue"${f.overdue?' checked':''}> Achterstallig</label>
 <label>van <input type="date" data-f="flt|acts|van" value="${h(f.van)}"></label><label>tot <input type="date" data-f="flt|acts|tot" value="${h(f.tot)}"></label>
 <input class="grow" type="search" placeholder="Zoeken…" data-f="flt|acts|q" value="${h(f.q)}"></div><p class="muted small">${list.length} actie(s) · periode = datum geïdentificeerd</p>${actTable(list,{verloop:true})}`;
};

/* ---------- MoM print view ---------- */
VIEWS.print=()=>{
 const Mt=S.M[S.p.id];if(!Mt)return'<p>Vergadering niet gevonden.</p>';
 return`<div class="bar noprint"><b>MoM – ${h(Mt.m.titel)}</b><span class="grow"></span><button class="pri" data-a="doprint">🖨 Afdrukken / PDF (Ctrl+P)</button><button class="sec" data-a="mail" data-id="${h(Mt.id)}">✉ Kopieer als e-mailtekst</button><button class="sec" data-a="savemom" data-id="${h(Mt.id)}">💾 Opslaan als .md in _rapporten</button><button class="sec" data-a="back">← Terug</button></div>${renderMomHtml(momModel(Mt.m,mdCtx()))}`;
};

/* ---------- Instellingen ---------- */
VIEWS.set=()=>{
 const d=S.ui.cfgDraft||(S.ui.cfgDraft=clone(S.cfg));const pend=pendingMigrations(S.cfg).length;
 const types=d.vergadertypes.map((t,ti)=>`<div class="card"><div class="row"><b>${h(t.id)}</b><input class="grow" data-f="cfg|${ti}|naam" value="${h(t.naam)}"><label class="chk"><input type="checkbox" data-f="cfg|${ti}|projectgebonden"${t.projectgebonden?' checked':''}> projectgebonden</label><label class="chk"><input type="checkbox" data-f="cfg|${ti}|actief"${t.actief?' checked':''}> actief</label></div>
 <table class="t sm"><tr><th>Nr</th><th>Topic</th><th>Actief</th></tr>${t.topics.map((x,xi)=>`<tr><td>${x.nr}</td><td><input data-f="cfgt|${ti}|${xi}|naam" value="${h(x.naam)}"></td><td><input type="checkbox" data-f="cfgt|${ti}|${xi}|actief"${x.actief?' checked':''}></td></tr>`).join('')}</table>
 <div class="row"><input id="newtopic-${ti}" class="grow" placeholder="Nieuw topic"><button class="sec sm" data-a="cfg-addtopic" data-t="${ti}">+ Topic</button></div></div>`).join('');
 const extra=[...S.extra].sort((a,b)=>a.naam.localeCompare(b.naam));
 return`<h2>Instellingen</h2>${warnBron()}
 <section class="card"><h3>Gegevensmap</h3><p>📁 ${h(S.root.name)} · ${Object.keys(S.M).length} vergaderingen · ${Object.keys(S.R).length} actieregisters</p><div class="row"><button class="sec" data-a="pick">Andere map kiezen</button><button class="sec" data-a="reload">↻ Opnieuw inlezen</button><button class="sec" data-a="sync">↻ Synchronisatie controleren</button>${S.copies.length?`<button class="pri" data-a="copies">${S.copies.length} conflictkopie(ën) samenvoegen</button>`:''}</div></section>
 <section class="card"><h3>Huidige gebruiker</h3><p>${S.user?`${h(P(S.user))} ${personBadge(S.user)} · <code>${h(S.user)}</code> · ID-code <b>${h(myCode())}</b>`:'Niet gekozen'}</p><button class="sec" data-a="whoami">Wissel gebruiker</button><p class="muted small">Bewaard in deze browser. De tool kan niet weten wie aangemeld is.</p></section>
 <section class="card"><h3>Vergadertypes en topics</h3><p class="muted small">Topics worden op <b>nummer</b> bewaard: een naam wijzigen breekt geen gegevens. Een topic verwijderen = "actief" uitvinken (oude notulen blijven leesbaar; het nummer wordt nooit hergebruikt). Een nieuw topic krijgt het volgende vrije nummer. Bij elke wijziging wordt eerst een back-up van <code>_config.json</code> gemaakt in <code>_backup/config</code>.</p>${types}
 <div class="row end"><button class="sec" data-a="cfg-reset">Wijzigingen ongedaan maken</button><button class="pri" data-a="cfg-save">Vergadertypes opslaan</button></div>
 <div class="card"><b>Nieuw vergadertype</b><div class="row"><input id="nt-naam" class="grow" placeholder="Naam (bv. Stuurgroep 150kV)"><label class="chk"><input type="checkbox" id="nt-proj" checked> projectgebonden</label></div><textarea id="nt-topics" rows="3" placeholder="Topics, één per regel (standaard: Varia)"></textarea><div class="row end"><button class="sec" data-a="cfg-addtype">+ Vergadertype toevoegen</button></div></div></section>
 <section class="card"><h3>Personen (extern en overig intern)</h3><p class="muted small">Bestand <code>personen-extra.csv</code>. SPE- en PMO-leden komen automatisch uit <code>_bron/personen.csv</code> (Power Automate).</p><table class="t sm"><tr><th>Naam</th><th>Organisatie</th><th>Functie</th><th>E-mail / sleutel</th><th>Type</th><th>Actief</th><th></th></tr>${extra.map(p=>`<tr class="${p.actief?'':'grey'}"><td>${h(p.naam)}</td><td>${h(p.organisatie)}</td><td>${h(p.functie)}</td><td class="small">${h(p.email||p.key)}</td><td><span class="pill ${p.type}">${p.type}</span></td><td>${p.actief?'ja':'nee'}</td><td><button class="sec sm" data-a="person-edit" data-k="${h(p.key)}">✎</button></td></tr>`).join('')}</table><p><button class="pri sm" data-a="person-new">+ Persoon toevoegen</button></p></section>
 <section class="card"><h3>Exports en back-up</h3><p class="small"><code>_export/</code> (vergaderingen.csv, minuten.csv, acties.csv) wordt automatisch herbouwd na elke wijziging${S.lastExport?`; laatst ${fmtMs(S.lastExport)}`:''}. Conflictkopieën van deze bestanden worden verwijderd (ze bevatten geen originele gegevens).</p><div class="row"><button class="sec" data-a="export">Exports nu herbouwen</button><button class="sec" data-a="backup">💾 Back-up nu</button></div><p class="muted small">Back-ups staan in <code>_backup/</code>. OneDrive/SharePoint bewaart daarnaast de versiegeschiedenis van elk bestand.</p></section>
 <section class="card"><h3>Versie en schema</h3><p>PSA-MoM ${APP_VERSION} (build ${BUILD}) · gegevensschema ${S.cfg.schema} (deze versie verwacht ${SCHEMA})${pend?' – migratie nodig: opnieuw inlezen voert ze uit (met back-up in _backup/pre-migratie-vX)':' – up-to-date'}.</p></section>`;
};

/* =====================================================================
   Dialogs
   ===================================================================== */
function modal(title,fields,onOk,ok,o){
 o=o||{};const d=$('#dlg');d.className=o.wide?'wide':'';
 const fh=f=>{const v=f.v??'';let i;
  if(f.t==='html')return f.html;
  if(f.t==='textarea')i=`<textarea name="${f.n}" rows="${f.rows||3}">${h(v)}</textarea>`;
  else if(f.t==='select')i=`<select name="${f.n}">${opts(f.o,v)}</select>`;
  else if(f.t==='checkbox')return`<label class="chk"><input type="checkbox" name="${f.n}"${v?' checked':''}> ${h(f.l)}</label>`;
  else if(f.t==='pp')i=ppHtml('dlg.'+f.n);
  else i=`<input type="${f.t||'text'}" name="${f.n}" value="${h(v)}">`;
  return`<label>${h(f.l)}</label>${i}${f.hint?`<div class="muted small">${f.hint}</div>`:''}`};
 d.innerHTML=`<form><h3>${h(title)}</h3>${fields.map(fh).join('')}<div class="err" id="derr"></div><div class="row end"><button type="button" class="sec" id="dc">${onOk?'Annuleren':'Sluiten'}</button>${onOk&&ok!==null?`<button class="pri" type="submit">${ok||'Opslaan'}</button>`:''}</div></form>`;
 d.showModal();$('#dc',d).onclick=()=>d.close();
 $('form',d).onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(ev.target);const v={};fields.forEach(f=>{if(f.t==='pp')v[f.n]=S.dlg[f.n];else if(f.n)v[f.n]=f.t==='checkbox'?fd.get(f.n)==='on':(fd.get(f.n)||'')});
  let err='';try{err=await onOk(v)}catch(e){err=e.message}if(err){$('#derr',d).textContent=Array.isArray(err)?err.join('\n'):err;return}d.close();render()};
}
function whoAmI(){
 if(!HAS_DOM)return;
 if(!S.people.list.length){
  return modal('Wie ben je?',[{n:'naam',l:'Naam'},{n:'email',l:'E-mail (PSA)'},{t:'html',html:'<p class="muted small">De personenlijst (_bron/personen.csv) ontbreekt nog. Je wordt toegevoegd aan personen-extra.csv als intern persoon.</p>'}],async v=>{
   const err=await cmd.savePerson({naam:v.naam,email:v.email,organisatie:'PSA Antwerp',type:'intern'});if(err&&err!=='Deze persoon bestaat al')return err;
   await cmd.setUser(text(v.email).toLowerCase()||'ext-'+slug('PSA Antwerp-'+v.naam));return''},'Bevestigen');
 }
 S.dlg={who:S.user||''};
 modal('Wie ben je?',[{n:'who',l:'Kies jezelf in de lijst',t:'pp'},{t:'html',html:'<p class="muted small">Je keuze wordt in deze browser bewaard en gebruikt voor "Mijn acties", aangemaakt_door/gewijzigd_door en de ID\'s van acties en beslissingen (je initialen). Sta je niet in de lijst? Typ je naam en kies "+ Nieuwe persoon".</p>'}],async v=>{if(!v.who)return'Kies een persoon';await cmd.setUser(v.who);return''},'Bevestigen');
}
function lockDialog(l){
 return new Promise(res=>{const d=$('#dlg');d.className='';
  d.innerHTML=`<h3>Vergadering wordt bewerkt</h3><p>Wordt bewerkt door <b>${h(l.naam||l.gebruiker)}</b> sinds ${h(String(l.sinds||'').slice(11,16))} (${fmt(l.sinds)}).</p><p>Alleen-lezen openen of toch bewerken?</p><p class="muted small">Bij "toch bewerken" worden de wijzigingen bij het opslaan samengevoegd; bij een conflict op hetzelfde topic krijg je een keuze. Werk bij voorkeur niet tegelijk aan hetzelfde project.</p><div class="row end"><button class="sec" data-r="">Annuleren</button><button class="sec" data-r="ro">Alleen-lezen openen</button><button class="pri" data-r="edit">Toch bewerken</button></div>`;
  d.showModal();d.onclick=e=>{const b=e.target.closest('[data-r]');if(!b)return;d.onclick=null;d.close();res(b.dataset.r||null)};
  d.oncancel=()=>{d.onclick=null;res(null)}});
}
const FIELD_NL={actie:'Actie',eigenaar:'Eigenaar',deadline:'Deadline',prioriteit:'Prioriteit',status:'Status',afgesloten_op:'Afgesloten op',afsluiting:'Afsluiting',topic:'Topic',vergadering:'Vergadering',gi_code:'GI-code',datum_geidentificeerd:'Geïdentificeerd',titel:'Titel',voorzitter:'Voorzitter',notulist:'Notulist',datum:'Datum',type:'Type'};
function conflictDialog(kind,path,conflicts){
 return new Promise(res=>{const d=$('#dlg');d.className='wide';
  const val=(f,v)=>['eigenaar','voorzitter','notulist'].includes(f)?P(v):['deadline','afgesloten_op','datum'].includes(f)?fmt(v):v;
  const items=l=>`<ul>${(l||[]).map(i=>`<li>[${h(i.type)}] ${i.id?h(i.id)+': ':''}${h(i.tekst)}</li>`).join('')||'<li class="muted">(leeg)</li>'}</ul>`;
  const body=conflicts.map((c,i)=>{
   if(kind==='acties'&&c.kind==='verwijderd')return`<div class="cf"><b>${h(c.id)}</b>: door iemand anders verwijderd, maar jij hebt de actie gewijzigd.<div class="row"><label><input type="radio" name="c${i}" value="local"${c.choice==='local'?' checked':''}> Behouden (mijn versie)</label><label><input type="radio" name="c${i}" value="remote"${c.choice==='remote'?' checked':''}> Verwijderen</label></div></div>`;
   if(kind==='acties')return`<div class="cf"><b>${h(c.id)}</b> – ${h(c.local.actie)}<table><tr><th>Veld</th><th>Mijn versie <span class="muted">(${h(P(c.local.gewijzigd_door))}, ${fmtStamp(c.local.gewijzigd_op)})</span></th><th>Hun versie <span class="muted">(${h(P(c.remote.gewijzigd_door))}, ${fmtStamp(c.remote.gewijzigd_op)})</span></th></tr>${c.fields.map(f=>`<tr class="diff"><td>${FIELD_NL[f]||f}</td><td>${h(val(f,c.local[f]))}</td><td>${h(val(f,c.remote[f]))}</td></tr>`).join('')}</table>
    <div class="row"><label><input type="radio" name="c${i}" value="local"${c.choice==='local'?' checked':''}> Mijn versie</label><label><input type="radio" name="c${i}" value="remote"${c.choice==='remote'?' checked':''}> Hun versie</label><span class="muted small">(standaard: meest recent gewijzigd)</span></div></div>`;
   if(c.kind==='veld')return`<div class="cf"><b>${FIELD_NL[c.key]||c.key}</b><table><tr><th>Mijn versie</th><th>Hun versie</th></tr><tr class="diff"><td>${h(val(c.key,c.local))}</td><td>${h(val(c.key,c.remote))}</td></tr></table><div class="row"><label><input type="radio" name="c${i}" value="local"${c.choice==='local'?' checked':''}> Mijn versie</label><label><input type="radio" name="c${i}" value="remote"${c.choice==='remote'?' checked':''}> Hun versie</label></div></div>`;
   return`<div class="cf"><b>${c.sec===ALG?'Algemeen':h(c.sec)} · ${c.nr}. ${h(topicName(S.cfg,(S.M[splitPath(path)[1].replace(/\.md$/,'')]||{m:{}}).m.type,c.nr))}</b><table><tr><th>Mijn versie</th><th>Hun versie</th></tr><tr><td>${items(c.local)}</td><td>${items(c.remote)}</td></tr></table>
    <div class="row"><label><input type="radio" name="c${i}" value="beide"${c.choice==='beide'?' checked':''}> Beide behouden</label><label><input type="radio" name="c${i}" value="local"${c.choice==='local'?' checked':''}> Mijn versie</label><label><input type="radio" name="c${i}" value="remote"${c.choice==='remote'?' checked':''}> Hun versie</label></div></div>`;
  }).join('');
  d.innerHTML=`<form><h3>Conflict bij opslaan: ${h(path)}</h3><p>Iemand anders heeft dit bestand gewijzigd terwijl jij eraan werkte. Wijzigingen op verschillende plaatsen zijn al automatisch samengevoegd. Kies hieronder welke versie geldt waar jullie <b>hetzelfde</b> hebben aangepast.</p>${body}<div class="row end"><button class="pri" type="submit">Samenvoegen en opslaan</button></div></form>`;
  d.showModal();d.oncancel=e=>e.preventDefault();
  $('form',d).onsubmit=ev=>{ev.preventDefault();const fd=new FormData(ev.target);conflicts.forEach((c,i)=>{const v=fd.get('c'+i);if(v)c.choice=v});d.close();res(conflicts)};
 });
}
function copiesDialog(){
 modal('OneDrive-conflictkopieën',[{t:'html',html:`<p>OneDrive maakte een kopie omdat een bestand op twee toestellen tegelijk gewijzigd werd. Bij samenvoegen worden beide versies gecombineerd (bij verschillen kies je zelf); daarna gaat de kopie naar <code>_backup/conflicten</code>.</p><ul>${S.copies.map(c=>`<li><code>${h(c.path)}</code> → <code>${h(c.orig)}</code></li>`).join('')}</ul>`}],async()=>{for(const c of [...S.copies])await mergeCopy(c);toast('Conflictkopieën samengevoegd');return''},'Alles samenvoegen');
}
function actDialog(kind,id,mid){
 const a=actById(id);if(!a)return toast('Actie niet gevonden');const t=`${a.id} – ${oneLine(a.actie).slice(0,60)}`;
 if(kind==='edit'){S.dlg={eigenaar:a.eigenaar};
  return modal('Actie '+a.id,[{n:'actie',l:'Actie',t:'textarea',v:a.actie},{n:'eigenaar',l:'Eigenaar',t:'pp'},{n:'prioriteit',l:'Prioriteit',t:'select',o:PRIO,v:a.prioriteit||'Midden'},
   ...(isOpen(a)?[{n:'status',l:'Status',t:'select',o:ACT_OPEN,v:a.status}]:[]),...(a.deadline?[{t:'html',html:`<p class="small">Deadline: <b>${fmt(a.deadline)}</b> – wijzigen via "Deadline verschuiven" (reden verplicht).</p>`}]:[{n:'deadline',l:'Deadline',t:'date',v:''}]),
   {t:'html',html:a.verloop?`<details><summary class="small">Verloop</summary><ul class="small">${verloopEntries(a.verloop).map(e=>`<li>${h(e)}</li>`).join('')}</ul></details>`:''}],v=>{
   for(const [f,val] of [['actie',v.actie],['eigenaar',v.eigenaar||''],['prioriteit',v.prioriteit],...(v.status?[['status',v.status]]:[])]){if(String(a[f])!==String(val)){const e=cmd.setActionField(id,f,val,mid);if(e)return e}}
   if(v.deadline){a.deadline=normDate(v.deadline);addVerloop(a,`deadline ingesteld op ${fmt(a.deadline)}`,ctxO(mid));touchAction(a,S.user);touchR(regOfAct(id))}return''})}
 if(kind==='shift')return modal('Deadline verschuiven: '+t,[{t:'html',html:`<p>Huidige deadline: <b>${fmt(a.deadline)||'geen'}</b></p>`},{n:'d',l:'Nieuwe deadline',t:'date',v:a.deadline},{n:'r',l:'Reden (verplicht, wordt gelogd in het verloop)',t:'textarea'}],v=>cmd.shiftDeadline(id,v.d,v.r,mid),'Verschuiven');
 if(kind==='close'){const m=mid&&S.M[mid]?S.M[mid].m:null;
  return modal('Actie afsluiten: '+t,[{n:'afs',l:'Afsluitende actie / beslissing (verplicht)',t:'textarea',hint:'Bv. "Offerte ontvangen en goedgekeurd" of verwijs naar een beslissing (B-…).'},...(m?[{n:'besl',l:'Leg dit ook vast als beslissing in deze vergadering',t:'checkbox',v:true}]:[]),
   {n:'datum',l:'Afgesloten op',t:'date',v:m?m.datum:today()},{n:'status',l:'Status',t:'select',o:ACT_CLOSED,v:'Afgesloten'}],v=>cmd.closeAction(id,{afsluiting:v.afs,datum:v.datum,status:v.status,alsBeslissing:!!v.besl},mid),'Afsluiten')}
 if(kind==='reopen')return modal('Actie heropenen: '+t,[{t:'html',html:`<p class="small">Afgesloten op ${fmt(a.afgesloten_op)}: ${h(a.afsluiting)}</p>`},{n:'r',l:'Reden (verplicht)',t:'textarea'}],v=>cmd.reopenAction(id,v.r,mid),'Heropenen');
}
function personDialog(key,prefill){
 const p=key?S.extra.find(x=>x.key===key):Object.assign({naam:'',email:'',organisatie:'',functie:'',type:'extern',actief:true},prefill||{});
 modal(key?'Persoon bewerken':'Nieuwe persoon',[{n:'naam',l:'Naam',v:p.naam},{n:'email',l:'E-mail (optioneel voor externen)',v:p.email},{n:'organisatie',l:'Organisatie',v:p.organisatie},{n:'functie',l:'Functie',v:p.functie},{n:'type',l:'Type',t:'select',o:['extern','intern'],v:p.type},...(key?[{n:'actief',l:'Actief',t:'checkbox',v:p.actief}]:[])],
  async v=>{const e=await cmd.savePerson(Object.assign({},v,{actief:key?v.actief:true}),key);if(e)return e;if(prefill&&prefill.pp){const nk=(v.email||'').toLowerCase()||'ext-'+slug((v.organisatie?v.organisatie+'-':'')+v.naam);const acc=ppAccess(prefill.pp);if(acc.multi)acc.set([...(acc.get()||[]),nk]);else acc.set(nk)}if(prefill&&prefill.who){const nk=(v.email||'').toLowerCase()||'ext-'+slug((v.organisatie?v.organisatie+'-':'')+v.naam);await cmd.setUser(nk)}return''});
}
function pasteDialog(sec){
 const m=S.M[S.edit].m;const mt=topicMatchers(S.cfg,m.type);const ts=topicList(S.cfg,m.type);const fb=ts.length?ts[ts.length-1].nr:1;
 const d=$('#dlg');d.className='wide';let blocks=[];
 d.innerHTML=`<form><h3>Notities plakken – ${sec===ALG?'Algemeen':h(sec+' – '+projName(sec))}</h3><p class="muted small">Plak je notities (bv. uit OneNote) of laad een .txt/.md/.html-bestand. Koppen zoals ${ts.map(t=>`"${h(t.naam)}"`).join(', ')} (ook genummerd of met dubbele punt) bepalen het topic. Regels die beginnen met "Actie:", "Beslissing:" of "Info:" krijgen dat type; ingesprongen regels horen bij het item erboven.</p>
 <textarea id="ptxt" rows="9" placeholder="Plak hier…"></textarea><div class="row"><input type="file" id="pfile" accept=".txt,.md,.html,.htm"></div><h4>Voorbeeld van de verdeling</h4><div id="pprev" class="muted">Plak tekst om de verdeling te zien.</div>
 <div class="row end"><button type="button" class="sec" id="dc">Annuleren</button><button class="pri" type="submit" id="pok" disabled>Toevoegen aan de notulen</button></div></form>`;
 d.showModal();const ta=$('#ptxt',d),prev=$('#pprev',d),ok=$('#pok',d);
 const draw=()=>{ok.disabled=!blocks.length;if(!blocks.length){prev.className='muted';prev.textContent='Plak tekst om de verdeling te zien.';return}prev.className='';
  prev.innerHTML=blocks.map((b,i)=>`<div class="blk${b.nr==null?' unk':''}"><select data-blk="${i}">${ts.map(t=>`<option value="${t.nr}"${(b.nr??fb)===t.nr?' selected':''}>${t.nr}. ${h(t.naam)}</option>`).join('')}</select>${b.nr==null?`<span class="bad small"> Geen kop herkend – standaard ${h(topicName(S.cfg,m.type,fb))}; kies zelf het juiste topic</span>`:''}${b.head?`<span class="muted small"> kop: "${h(b.head)}"</span>`:''}<ul class="small">${blockItems(b.lines).map(it=>`<li><b class="ty-${it.type}">${it.type}</b> ${h(it.tekst).replace(/\n/g,'<br>')}</li>`).join('')}</ul></div>`).join('')};
 const parse=()=>{blocks=splitBlocks(ta.value,mt);draw()};ta.addEventListener('input',parse);
 prev.addEventListener('change',ev=>{const s=ev.target.closest('select[data-blk]');if(!s)return;blocks[+s.dataset.blk].nr=+s.value;s.parentElement.classList.remove('unk');const bad=s.parentElement.querySelector('.bad');if(bad)bad.remove()});
 $('#pfile',d).onchange=async ev=>{const f=ev.target.files[0];if(!f)return;let t=decodeBytes(await f.arrayBuffer());if(/\.html?$/i.test(f.name))t=htmlToText(t);ta.value=t;parse()};
 $('#dc',d).onclick=()=>d.close();
 $('form',d).onsubmit=ev=>{ev.preventDefault();blocks.forEach(b=>{if(b.nr==null)b.nr=fb});const n=cmd.pasteItems(S.edit,sec,blocks);d.close();render();toast(n+' item(s) toegevoegd')};
}
function addProjDialog(){
 const m=S.M[S.edit].m;const d=$('#dlg');d.className='wide';
 const list=q=>S.proj.projects.filter(p=>!m.projecten.includes(p.gi)&&matchProject(p,{q})).slice(0,60);
 const rows=q=>list(q).map(p=>`<tr class="click" data-addgi="${h(p.gi)}"><td><b>${h(p.gi)}</b></td><td>${h(p.naam)}</td><td>${p.statuses.map(statusPill).join(' ')}</td><td>${h(p.pmNamen.join(', '))}</td></tr>`).join('');
 d.innerHTML=`<h3>Project toevoegen aan deze vergadering</h3><input id="apq" placeholder="Zoek op GI-code, PRJ, DMND, omschrijving, PM…"><div style="max-height:340px;overflow:auto"><table class="t sm" id="apt">${rows('')}</table></div>
 <details><summary class="small">Tijdelijk project zonder lijst</summary><div class="row"><input id="aptmp" class="grow" placeholder="Naam van het project"><button class="sec" id="aptmpb">Toevoegen</button></div></details><div class="row end"><button class="sec" id="dc">Sluiten</button></div>`;
 d.showModal();$('#dc',d).onclick=()=>d.close();
 $('#apq',d).oninput=e=>{$('#apt',d).innerHTML=rows(e.target.value)};
 $('#apt',d).onclick=e=>{const r=e.target.closest('[data-addgi]');if(!r)return;cmd.addSection(S.edit,r.dataset.addgi);d.close();render()};
 $('#aptmpb',d).onclick=()=>{const n=$('#aptmp',d).value.trim();if(!n)return;cmd.addSection(S.edit,'TMP-'+slug(n),n);d.close();render()};
}
function showText(title,t){modal(title,[{n:'t',l:'',t:'textarea',v:t,rows:20}],()=>'',null,{wide:true})}

/* =====================================================================
   Events
   ===================================================================== */
async function onClick(ev){
 const b=ev.target.closest&&ev.target.closest('[data-a]');if(!b||b.type==='checkbox')return;
 if(b.closest&&b.closest('dialog')&&!['pp-add','pp-del','pp-new','ms-clear'].includes(b.dataset.a))return;
 const a=b.dataset.a;if(b.tagName==='A')ev.preventDefault();
 try{switch(a){
  case'pick':return pickFolder();case'reopen':return reopen();case'retry':return S.root?openRoot(S.root):reopen();case'sync':return syncCheck();case'backup':return backupNow();
  case'reload':await saveAll();await releaseLock();return openRoot(S.root);
  case'whoami':return whoAmI();
  case'view':S.view=b.dataset.v;if(S.view==='set')S.ui.cfgDraft=null;return render();
  case'back':S.view=S.edit?'mtg':'mtgs';return render();
  case'newm':initForm();S.ui.formErr='';S.view='newm';return render();
  case'prep':S.view='prep';S.p={id:b.dataset.id};return render();
  case'print':S.view='print';S.p={id:b.dataset.id};return render();
  case'doprint':return window.print();
  case'mail':return copy(cmd.momText(b.dataset.id));
  case'savemom':{const p=await cmd.saveMom(b.dataset.id);return toast('Opgeslagen: '+p)}
  case'open-edit':return openMeeting(b.dataset.id,'edit');
  case'closem':return closeMeeting();
  case'proj':S.view='proj';S.p={gi:b.dataset.gi,tab:'tijdlijn'};return render();
  case'ptab':S.p.tab=b.dataset.t;return render();
  case'dossier':{const r=await cmd.dossier(b.dataset.gi);toast('Opgeslagen: '+r.path);return showText('Projectdossier – '+r.path,r.md)}
  case'acts-mine':S.flt.acts.eigenaar=S.user;S.flt.acts.status='open';return render();
  case'flt-reset':{const s=b.dataset.s;['status','location','portfolio','year','pm'].forEach(k=>S.flt[s][k]=new Set());S.flt[s].q='';S.flt[s].noGi=false;if(s==='projs')S.flt.projs.mijn=false;return render()}
  case'ms-clear':{const [s,k]=b.dataset.ms.split('.');S.flt[s][k]=new Set();S.ui.openMs=b.dataset.ms;return render()}
  case'form-prevpeople':{const p=prevOfType(S.form.type,S.form.datum);if(p)Object.assign(S.form,{aanwezig:[...p.aanwezig],verontschuldigd:[...p.verontschuldigd],voorzitter:p.voorzitter||S.form.voorzitter,notulist:p.notulist||S.form.notulist});return render()}
  case'form-prevproj':{const p=prevOfType(S.form.type,S.form.datum);if(p){S.form.projecten=uniq([...S.form.projecten,...p.projecten]);p.projecten.filter(isTmp).forEach(g=>S.form.tmpNamen[g]=projName(g))}return render()}
  case'pick-toggle':{const g=b.dataset.gi;const l=S.form.projecten;S.form.projecten=l.includes(g)?l.filter(x=>x!==g):[...l,g];return render()}
  case'pick-del':S.form.projecten=S.form.projecten.filter(x=>x!==b.dataset.gi);return render();
  case'pick-tmp':{const n=$('#tmpnaam').value.trim();if(!n)return toast('Geef een naam');const g='TMP-'+slug(n);S.form.tmpNamen[g]=n;if(!S.form.projecten.includes(g))S.form.projecten.push(g);return render()}
  case'form-create':{const r=await cmd.createMeeting(S.form);if(r.err){S.ui.formErr=r.err;return render()}S.form=null;S.ui.formErr='';if(b.dataset.next==='mtg')return openMeeting(r.id,'edit');S.view='prep';S.p={id:r.id};return render()}
  case'm-concept':{await cmd.setMeetingStatus(S.edit,'Concept');return render()}
  case'm-forceedit':return openMeeting(S.edit,'force');
  case'm-addproj':return addProjDialog();
  case'm-addalg':cmd.addSection(S.edit,ALG);return render();
  case'm-delsec':{const e=cmd.removeSection(S.edit,b.dataset.s);if(e)toast(e);return render()}
  case'paste':return pasteDialog(b.dataset.s);
  case'it-add':{const it=cmd.addItem(S.edit,b.dataset.s,+b.dataset.n,'Info','');S.ui.focus=`it|${b.dataset.s}|${b.dataset.n}|${it._k}|tekst`;return render()}
  case'it-up':case'it-down':{const [s,n,k]=b.dataset.k.split('|');cmd.moveItem(S.edit,s,+n,k,a==='it-up'?-1:1);S.ui.focus=`it|${b.dataset.k}|tekst`;return render()}
  case'it-del':{const [s,n,k]=b.dataset.k.split('|');const it=findItem(S.M[S.edit].m,s,+n,k);if(it&&text(it.tekst)&&!await ask('Dit item verwijderen?'))return;const e=cmd.deleteItem(S.edit,s,+n,k);if(e)toast(e);return render()}
  case'act-edit':return actDialog('edit',b.dataset.id,b.dataset.m);case'act-shift':return actDialog('shift',b.dataset.id,b.dataset.m);
  case'act-close':return actDialog('close',b.dataset.id,b.dataset.m);case'act-reopen':return actDialog('reopen',b.dataset.id,b.dataset.m);
  case'pp-add':return ppAdd(b.dataset.pp,b.dataset.k);case'pp-del':return ppDel(b.dataset.pp,b.dataset.k);
  case'pp-new':return personDialog(null,{naam:b.dataset.q,pp:b.dataset.pp.startsWith('dlg.')?'':b.dataset.pp,who:b.dataset.pp==='dlg.who',type:b.dataset.pp==='dlg.who'?'intern':'extern',organisatie:b.dataset.pp==='dlg.who'?'PSA Antwerp':''});
  case'copies':return copiesDialog();case'export':return rebuildExports(true);
  case'person-new':return personDialog(null);case'person-edit':return personDialog(b.dataset.k);
  case'cfg-reset':S.ui.cfgDraft=null;return render();
  case'cfg-addtopic':{const ti=+b.dataset.t;const inp=$('#newtopic-'+ti);const n=inp&&inp.value.trim();if(!n)return;const t=S.ui.cfgDraft.vergadertypes[ti];t.topics.push({nr:t.topics.reduce((x,y)=>Math.max(x,y.nr),0)+1,naam:n,actief:true});return render()}
  case'cfg-save':{const dr=S.ui.cfgDraft;if(dr.vergadertypes.some(t=>!text(t.naam)||t.topics.some(x=>!text(x.naam))))return toast('Elke naam moet ingevuld zijn');
   const e=await updateConfig(cfg=>{dr.vergadertypes.forEach(t=>{const c=cfg.vergadertypes.find(x=>x.id===t.id);if(!c){cfg.vergadertypes.push(clone(t));return}
    c.naam=t.naam;c.projectgebonden=t.projectgebonden;c.actief=t.actief;t.topics.forEach(x=>{const ct=c.topics.find(y=>y.nr===x.nr);if(ct){ct.naam=x.naam;ct.actief=x.actief}else c.topics.push(clone(x))})})});
   if(e)return toast(e);S.ui.cfgDraft=null;Object.values(S.M).forEach(x=>{if(x.m.status==='Concept'&&x.id===S.edit)x.dirty=true});toast('Vergadertypes opgeslagen (back-up in _backup/config)');return render()}
  case'cfg-addtype':{const n=$('#nt-naam').value.trim();if(!n)return toast('Geef een naam');const tps=$('#nt-topics').value.split('\n').map(x=>x.trim()).filter(Boolean);const pj=$('#nt-proj').checked;
   await updateConfig(cfg=>{addType(cfg,n,pj,tps)});S.ui.cfgDraft=null;toast('Vergadertype toegevoegd');return render()}
 }}catch(e){toast('Fout: '+e.message);if(typeof console!=='undefined')console.error(e)}
}
async function onField(el,isChange){
 const f=el.dataset.f.split('|');const kind=f[0];const val=el.type==='checkbox'?el.checked:el.value;
 if(kind==='ppq')return;
 if(kind==='flt'){if(!isChange&&el.type!=='search'&&el.tagName!=='INPUT')return;if(el.type==='date'&&!isChange)return;S.flt[f[1]][f[2]]=val;return render()}
 if(kind==='p'){if(!isChange)return;S.p[f[1]]=val;return render()}
 if(kind==='ui'){if(!isChange)return;S.ui[f[1]]=val;return render()}
 if(kind==='form'){S.form[f[1]]=val;if(f[1]==='titel')S.form.titelAuto=!val;if(f[1]==='type'||f[1]==='datum')autoTitle();if(isChange&&f[1]!=='titel')render();return}
 if(kind==='cfg'){const t=S.ui.cfgDraft.vergadertypes[+f[1]];t[f[2]]=val;return}
 if(kind==='cfgt'){const x=S.ui.cfgDraft.vergadertypes[+f[1]].topics[+f[2]];x[f[3]]=val;return}
 if(kind==='mstatus'){if(!isChange)return;const errs=await cmd.setMeetingStatus(S.edit,val);if(errs.length){modal('Nog niet definitief',[{t:'html',html:`<p>Los eerst het volgende op:</p><ul>${errs.map(e=>`<li>${h(e)}</li>`).join('')}</ul>`}],null)}return render()}
 if(S.ro&&['m','it','act','fu'].includes(kind))return;
 if(kind==='m'){const Mt=S.M[S.edit];Mt.m[f[1]]=val;touchM(S.edit);return}
 if(kind==='it'){const [,sec,nr,k,prop]=f;
  if(prop==='tekst'){cmd.setItemText(S.edit,sec,+nr,k,val);grow(el);return}
  if(prop==='type'&&isChange){const e=cmd.setItemType(S.edit,sec,+nr,k,val);if(e)toast(e);S.ui.focus=`it|${sec}|${nr}|${k}|tekst`;return render()}return}
 if(kind==='act'){if(!isChange)return;const e=cmd.setActionField(f[1],f[2],val,S.view==='mtg'?S.edit:'');if(e){toast(e);render()}return}
 if(kind==='fu'){if(!isChange)return;const e=cmd.setActionField(f[1],'status',val,S.edit);if(e)toast(e);return render()}
}
function onKey(ev){
 const el=ev.target;
 if(el.dataset&&el.dataset.ppq){const res=el.parentElement.querySelector('.pp-res');
  if(ev.key==='Enter'){ev.preventDefault();const first=res&&res.querySelector('[data-a="pp-add"]');if(first)ppAdd(first.dataset.pp,first.dataset.k)}
  if(ev.key==='Escape'&&res)res.classList.remove('open');return}
 if(!el.dataset||!el.dataset.f||!el.dataset.f.startsWith('it|')||S.ro)return;
 const [,sec,nr,k]=el.dataset.f.split('|');
 if(ev.key==='Enter'&&!ev.shiftKey&&!ev.ctrlKey&&el.tagName==='TEXTAREA'){ev.preventDefault();const it=cmd.addItem(S.edit,sec,+nr,'Info','',k);S.ui.focus=`it|${sec}|${nr}|${it._k}|tekst`;return render()}
 if(ev.ctrlKey&&['1','2','3'].includes(ev.key)){ev.preventDefault();const e=cmd.setItemType(S.edit,sec,+nr,k,{1:'Actie',2:'Beslissing',3:'Info'}[ev.key]);if(e)toast(e);S.ui.focus=`it|${sec}|${nr}|${k}|tekst`;render()}
}
if(HAS_DOM){
 document.addEventListener('click',onClick);
 document.addEventListener('input',ev=>{const t=ev.target;if(t.dataset&&t.dataset.ppq)return ppSearch(t);if(t.dataset&&t.dataset.f&&t.tagName!=='SELECT'&&t.type!=='checkbox')onField(t,false)});
 document.addEventListener('change',ev=>{const t=ev.target;if(t.dataset&&t.dataset.msv){const [s,k]=t.dataset.msv.split('.');const set=S.flt[s][k];t.checked?set.add(t.value):set.delete(t.value);S.ui.openMs=t.dataset.msv;return render()}if(t.dataset&&t.dataset.f)onField(t,true)});
 document.addEventListener('keydown',onKey);
 document.addEventListener('focusin',ev=>{const t=ev.target;if(t.dataset&&t.dataset.ppq&&!t.value)ppSearch(t)});
 document.addEventListener('focusout',ev=>{const t=ev.target;if(t.dataset&&t.dataset.ppq)setTimeout(()=>{const r=t.parentElement&&t.parentElement.querySelector('.pp-res');if(r&&!r.contains(document.activeElement))r.classList.remove('open')},200)});
 document.addEventListener('toggle',ev=>{const t=ev.target;if(t.dataset&&t.dataset.ms){if(t.open)S.ui.openMs=t.dataset.ms;else if(S.ui.openMs===t.dataset.ms)S.ui.openMs=''}},true);
 window.addEventListener('focus',()=>{if(Date.now()-S.lastCheck>20000)checkExternal().catch(()=>{})});
 setInterval(()=>{if(S.root&&!S.saving)checkExternal().catch(()=>{})},120000);
 window.addEventListener('beforeunload',ev=>{if(S.lock)releaseLock();if(anyDirty()){saveAll();ev.preventDefault();ev.returnValue=''}});
 window.addEventListener('unhandledrejection',ev=>{const e=ev.reason;setStatus('Fout: '+(e&&e.message||e),'bad');toast('Fout: '+(e&&e.message||e))});
 (async()=>{render();const hd=await KV.get('root').catch(()=>null);if(hd&&hd.queryPermission){const p=await hd.queryPermission({mode:'readwrite'});if(p==='granted')openRoot(hd)}})();
}
const PSAMoMApp={S,cmd,KV,render,openRoot,saveAll,checkExternal,scanCopies,mergeCopy,syncCheck,rebuildExports,openMeeting,closeMeeting,releaseLock,actById,regOfAct,projInfo,projName,allMeetings,allActions,onClick,onField,VIEWS,findItem,keys,mdCtx,backupNow};
if(typeof window!=='undefined')window.PSAMoMApp=PSAMoMApp;
