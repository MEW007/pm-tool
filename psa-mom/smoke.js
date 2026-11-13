/* End-to-end smoke test: loads build/combined.js (core + app) with a fake DOM and an in-memory
   file system (FileSystemDirectoryHandle look-alike with lastModified), then walks the test checklist.
   Run: node smoke.js   (after python build.py; exit code 1 on failure) */
'use strict';
const vm=require('vm'),fs=require('fs'),path=require('path');
const HERE=__dirname;

/* ---------- in-memory file system ---------- */
let clock=Date.parse('2026-11-13T08:00:00');
class MemFile{constructor(name,data){this.kind='file';this.name=name;this.data=data||'';this.lastModified=++clock}
 async getFile(){const d=this.data,lm=this.lastModified;return{lastModified:lm,text:async()=>d,arrayBuffer:async()=>{const b=Buffer.from(d,'utf8');return b.buffer.slice(b.byteOffset,b.byteOffset+b.length)}}}
 async createWritable(){let buf='';const self=this;return{async write(t){buf+=t},async close(){self.data=buf;self.lastModified=++clock}}}}
class MemDir{constructor(name){this.kind='directory';this.name=name;this.c=new Map()}
 async getDirectoryHandle(n,o){let d=this.c.get(n);if(!d){if(!(o&&o.create))throw Object.assign(new Error('NotFound '+n),{name:'NotFoundError'});d=new MemDir(n);this.c.set(n,d)}if(d.kind!=='directory')throw new Error('TypeMismatch');return d}
 async getFileHandle(n,o){let f=this.c.get(n);if(!f){if(!(o&&o.create))throw Object.assign(new Error('NotFound '+n),{name:'NotFoundError'});f=new MemFile(n);this.c.set(n,f)}if(f.kind!=='file')throw new Error('TypeMismatch');return f}
 async removeEntry(n){if(!this.c.delete(n))throw new Error('NotFound '+n)}
 async *entries(){for(const e of [...this.c])yield e}
 async queryPermission(){return'granted'}async requestPermission(){return'granted'}}
function node(root,p,create){const parts=p.split('/');let d=root;for(const x of parts.slice(0,-1)){let n=d.c.get(x);if(!n){if(!create)return null;n=new MemDir(x);d.c.set(x,n)}d=n}return{dir:d,name:parts[parts.length-1]}}
function put(root,p,text){const {dir,name}=node(root,p,true);const f=dir.c.get(name);if(f){f.data=text;f.lastModified=++clock}else dir.c.set(name,new MemFile(name,text))}
function get(root,p){const x=node(root,p);const f=x&&x.dir.c.get(x.name);return f&&f.kind==='file'?f.data.replace(/^﻿/,''):null}
function has(root,p){return get(root,p)!==null}
function ls(root,p){let d=root;for(const x of p.split('/').filter(Boolean)){d=d.c.get(x);if(!d)return[]}return[...d.c.keys()]}
function loadDir(root,disk,rel){for(const n of fs.readdirSync(disk)){const f=path.join(disk,n);const r=rel?rel+'/'+n:n;if(fs.statSync(f).isDirectory())loadDir(root,f,r);else put(root,r,fs.readFileSync(f,'utf8'))}}

/* ---------- fake DOM ---------- */
class El{constructor(){this.innerHTML='';this.textContent='';this.className='';this.style={};this.dataset={};this.classList={add(){},remove(){},contains(){return false}}}
 querySelector(){return new El()}querySelectorAll(){return[]}showModal(){this.open=true}close(){this.open=false}addEventListener(){}focus(){}}
const els={'#app':new El(),'#dlg':new El(),'#toast':new El(),'#sync':new El()};
const toasts=[];
const sandbox={console,TextDecoder,TextEncoder,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{},Date,Math,JSON,Intl,
 document:{querySelector:s=>els[s]||null,querySelectorAll:()=>[],addEventListener(){},activeElement:null},
 window:{addEventListener(){},scrollTo(){},scrollY:0,print(){}},navigator:{clipboard:{writeText:async t=>{sandbox.__clip=t}}},
 alert:m=>{throw new Error('alert: '+m)},confirm:()=>true};
sandbox.window.window=sandbox.window;
vm.createContext(sandbox);
const code=fs.readFileSync(path.join(HERE,'build','combined.js'),'utf8');
vm.runInContext(code,sandbox,{filename:'combined.js'});
const A=sandbox.window.PSAMoMApp;const S=A.S;const C=n=>vm.runInContext(n,sandbox);
const origToast=C('toast');

/* ---------- mini test runner ---------- */
let pass=0,fail=0;const fails=[];
async function step(name,fn){try{await fn();pass++}catch(e){fail++;fails.push(`${name}\n    ${e&&e.stack?e.stack.split('\n').slice(0,3).join('\n    '):e}`)}}
const ok=(c,m)=>{if(!c)throw new Error(m||'assert failed')};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m||'eq'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`)};
const html=()=>els['#app'].innerHTML;
function view(v,p){S.view=v;S.p=p||{};A.render();const x=html();ok(!x.includes('Fout bij tonen'),'render error in '+v+': '+(x.match(/Fout bij tonen[^<]*/)||[''])[0]);return x}
const conflictsSeen=[];
S.hooks.resolve=async(kind,p,cs)=>{conflictsSeen.push({kind,path:p,cs});return cs};
S.hooks.confirm=async()=>true;

(async()=>{
 vm.runInContext("setNow('2026-11-13T10:30:00')",sandbox);
 const root=new MemDir('PSA-MoM-data');
 loadDir(root,path.join(HERE,'voorbeelddata'),'');
 ['_backup/.gitkeep','_rapporten/.gitkeep'].forEach(p=>{const x=node(root,p);x.dir.c.delete(x.name)});

 await step('1. folder opens, project list grouped, people merged, conflict copy detected',async()=>{
  await A.openRoot(root);
  eq(S.proj.rows.length,30,'rows');eq(S.proj.projects.length,19,'GI codes');eq(S.proj.noGi.length,5,'rows without GI');
  eq(S.proj.byGi.GI22074.rows.length,3);eq(S.proj.byGi.GI26057.rows.length,3);ok(S.proj.byGi.GI23111&&S.proj.byGi.GI24115&&S.proj.byGi.GI24109,'combined codes');
  eq(S.people.byKey['sofie.wouters@voorbeeld.be'].badge,'SPE/PMO');eq(S.people.byKey['ext-elia-kurt-de-smet'].badge,'extern');
  eq(S.people.byKey['wout.michiels@voorbeeld.be'].code,'WMi');
  eq(Object.keys(S.M).length,8);ok(S.R.GI22074&&S.R._algemeen,'registers');eq(S.copies.length,1);eq(S.copies[0].orig,'acties/GI22074.csv');
  const x=view('dash');ok(x.includes('Projectlijst: 30 rijen, 19 GI-codes, bijgewerkt'),'freshness in header');ok(x.includes('conflictkopie'),'copy warning');
 });
 await step('2. "Wie ben je?" stores the user; header shows it',async()=>{
  ok(!S.user,'no user yet');await A.cmd.setUser('an.claes@voorbeeld.be');eq(await A.KV.get('user'),'an.claes@voorbeeld.be');
  const x=view('dash');ok(x.includes('👤 An Claes')&&x.includes('wissel gebruiker'));
 });
 let M1;
 await step('3. new multi-project meeting (E&E projectoverleg) with attendees and projects',async()=>{
  const r=await A.cmd.createMeeting({type:'ee-projectoverleg',datum:'2026-11-20',titel:'',voorzitter:'els.janssens@voorbeeld.be',notulist:'an.claes@voorbeeld.be',aanwezig:[],verontschuldigd:[],projecten:[],tmpNamen:{}});
  ok(r.err&&/minstens één project/.test(r.err),'project required for project-based type');
  const prev=A.allMeetings().filter(m=>m.type==='ee-projectoverleg').sort((a,b)=>b.datum.localeCompare(a.datum))[0];
  const r2=await A.cmd.createMeeting({type:'ee-projectoverleg',datum:'2026-11-20',titel:'',voorzitter:'els.janssens@voorbeeld.be',notulist:'an.claes@voorbeeld.be',aanwezig:[...prev.aanwezig],verontschuldigd:[],projecten:['GI22074','GI24115','GI26057'],tmpNamen:{}});
  M1=r2.id;eq(M1,'2026-11-20_ee-projectoverleg');
  const md=get(root,'vergaderingen/2026/2026-11-20_ee-projectoverleg.md');ok(md&&md.includes('projecten: [GI22074, GI24115, GI26057]')&&md.includes('titel: E&E projectoverleg 20/11/2026'));
  const x=view('prep',{id:M1});ok(x.includes('Open acties')&&x.includes('A-GI22074-AC-002'),'preparation shows open actions');ok(x.includes('High Tension Connection (150kV)'),'budget lines');
 });
 let actId,decId;
 await step('4. minutes: items of all 3 types, action with owner + deadline, type gating',async()=>{
  await A.openMeeting(M1,'edit');ok(!S.ro,'editable');ok(has(root,'vergaderingen/2026/.2026-11-20_ee-projectoverleg.md.lock'),'soft lock written');
  const x=view('mtg');ok(x.includes('Vorige keer'),'"Vorige keer" shown');ok(x.includes('Opvolging open acties'));
  A.cmd.addItem(M1,'GI22074',1,'Info','Geen incidenten; LMRA uitgevoerd.');
  const d=A.cmd.addItem(M1,'GI22074',3,'Beslissing','PIF part 2 wordt ingediend in december.');decId=d.id;ok(/^B-20261120-AC-\d\d$/.test(decId),'decision id '+decId);
  const a=A.cmd.addItem(M1,'GI22074',5,'Actie','Kick-off kabelwerken organiseren');actId=a.id;eq(actId,'A-GI22074-AC-004');
  const errs=await A.cmd.setMeetingStatus(M1,'Definitief');ok(errs.some(e=>/eigenaar ontbreekt/.test(e))&&errs.some(e=>/deadline ontbreekt/.test(e)),'Definitief blocked: '+errs);
  eq(A.cmd.setActionField(actId,'eigenaar','jan.peeters@voorbeeld.be',M1),'');eq(A.cmd.setActionField(actId,'deadline','2026-12-04',M1),'');
  const t=A.cmd.addItem(M1,'GI26057',4,'Info','tijdelijk');const e=A.cmd.setItemType(M1,'GI26057',4,t._k,'Actie');eq(e,'');ok(A.actById(t.id),'action created on type switch');
  eq(A.cmd.setItemType(M1,'GI26057',4,t._k,'Info'),'');ok(!A.actById(t.id||'x'),'fresh action removed again');eq(t.id,'');
  await A.saveAll();
  const md=get(root,'vergaderingen/2026/2026-11-20_ee-projectoverleg.md');
  ok(md.includes(`- [Beslissing] ${decId}: PIF part 2`),'decision in md');ok(md.includes(`- [Actie] ${actId}: Kick-off kabelwerken organiseren`),'action ref in md');
  ok(md.includes(`- [ ] ${actId} – Kick-off kabelwerken organiseren (Jan Peeters, deadline 04/12/2026) – Open`),'auto block');
  const reg=get(root,'acties/GI22074.csv');ok(reg.includes(`"${actId}";"GI22074";"${M1}";"2026-11-20";"ee-projectoverleg:5"`),'register row');
 });
 await step('5. Definitief needs attendees + owner/deadline; then read-only',async()=>{
  const errs=await A.cmd.setMeetingStatus(M1,'Definitief');eq(errs,[]);ok(S.ro,'read-only after Definitief');
  ok(!has(root,'vergaderingen/2026/.2026-11-20_ee-projectoverleg.md.lock'),'lock released');
  ok(get(root,'vergaderingen/2026/2026-11-20_ee-projectoverleg.md').includes('status: Definitief'));
  ok(view('mtg').includes('Terug naar Concept'));await A.closeMeeting();
 });
 let M2;
 await step('6. next meeting of same type shows "Vorige keer" and the open actions',async()=>{
  const r=await A.cmd.createMeeting({type:'ee-projectoverleg',datum:'2026-11-27',titel:'',voorzitter:'els.janssens@voorbeeld.be',notulist:'an.claes@voorbeeld.be',aanwezig:['els.janssens@voorbeeld.be','an.claes@voorbeeld.be'],verontschuldigd:[],projecten:['GI22074'],tmpNamen:{}});
  M2=r.id;await A.openMeeting(M2,'edit');const x=view('mtg');
  ok(x.includes('Vorige keer')&&x.includes('20/11/2026')&&x.includes('PIF part 2 wordt ingediend in december'),'previous minutes of this project/topic');
  ok(x.includes(actId),'open action from previous meeting in follow-up');
 });
 await step('7. move a deadline (reason required, logged)',async()=>{
  ok(/reden/i.test(A.cmd.shiftDeadline(actId,'2026-12-18','',M2)),'reason required');
  eq(A.cmd.shiftDeadline(actId,'2026-12-18','aannemer pas beschikbaar vanaf half december',M2),'');
  const a=A.actById(actId);eq(a.deadline,'2026-12-18');ok(a.verloop.includes('deadline 04/12/2026 → 18/12/2026 – reden: aannemer pas beschikbaar vanaf half december (AC, vergadering '+M2+')'));
 });
 await step('8. close an action with a closing decision (recorded in the meeting)',async()=>{
  ok(/verplicht/.test(A.cmd.closeAction('A-GI22074-AC-002',{afsluiting:''},M2)),'closing text required');
  eq(A.cmd.closeAction('A-GI22074-AC-002',{afsluiting:'Vergunning ingediend op 25/11',alsBeslissing:true},M2),'');
  const a=A.actById('A-GI22074-AC-002');eq(a.status,'Afgesloten');eq(a.afgesloten_op,'2026-11-27');ok(/^B-20261127-AC-01: Vergunning ingediend/.test(a.afsluiting),a.afsluiting);
  await A.saveAll();const md=get(root,`vergaderingen/2026/${M2}.md`);
  ok(md.includes('- [Beslissing] B-20261127-AC-01: A-GI22074-AC-002 (Omgevingsvergunning nieuwe HS-cabine indienen) afgesloten: Vergunning ingediend op 25/11'),'closing decision in minutes');
  ok(md.includes('- [x] A-GI22074-AC-002'),'closed action in auto block');ok(md.includes(`- [ ] ${actId}`),'shifted action in auto block');
  eq(A.cmd.reopenAction('A-GI22074-AC-002','',M2).length>0,true);
  await A.closeMeeting();
 });
 let T;
 await step('9. general team meeting: Algemeen first, action goes to _algemeen.csv',async()=>{
  const r=await A.cmd.createMeeting({type:'teammeeting',datum:'2026-11-24',titel:'',voorzitter:'els.janssens@voorbeeld.be',notulist:'an.claes@voorbeeld.be',aanwezig:['an.claes@voorbeeld.be'],verontschuldigd:[],projecten:[],tmpNamen:{}});
  T=r.id;await A.openMeeting(T,'edit');eq(S.M[T].m.secties.map(s=>s.key),['ALG']);
  const a=A.cmd.addItem(T,'ALG',4,'Actie','Opleidingsplan 2027 opmaken');ok(/^A-ALG-AC-\d{3}$/.test(a.id),a.id);
  A.cmd.setActionField(a.id,'eigenaar','an.claes@voorbeeld.be',T);A.cmd.setActionField(a.id,'deadline','2026-11-30',T);
  A.cmd.addSection(T,'TMP-kraanbaan-q5','Kraanbaan Q5');A.cmd.addItem(T,'TMP-kraanbaan-q5',3,'Info','Scope nog te bepalen');
  await A.saveAll();ok(get(root,'acties/_algemeen.csv').includes(a.id));const md=get(root,`vergaderingen/2026/${T}.md`);
  ok(md.indexOf('## Algemeen')<md.indexOf('## TMP-kraanbaan-q5 – Kraanbaan Q5'),'Algemeen first in general meeting; temporary project marked');
  await A.closeMeeting();ok(view('projs').includes('tijdelijk'));
 });
 await step('10. project page: full timeline across meeting types, decisions, actions; dossier export',async()=>{
  const x=view('proj',{gi:'GI22074',tab:'tijdlijn'});
  ok(x.includes('E&amp;E projectoverleg')&&x.includes('PMO-review'),'timeline over several meeting types');ok(x.includes('16/10/2026')&&x.includes('27/11/2026'));
  ok(view('proj',{gi:'GI22074',tab:'beslissingen'}).includes(decId));ok(view('proj',{gi:'GI22074',tab:'acties',all:true}).includes('A-GI22074-AC-001'));
  const d=await A.cmd.dossier('GI22074');ok(has(root,d.path));ok(d.md.includes('## Budgetlijnen')&&d.md.includes('B-20261106-AC-01'));
  const p=view('projs');ok(p.includes('GI22074')&&p.includes('Laatste vergadering'));
  S.flt.projs.noGi=true;ok(view('projs').includes('Geen GI-code: notuleer onder een algemene vergadering of vraag een GI-code aan'));S.flt.projs.noGi=false;
 });
 await step('11. "Mijn acties" on the start screen, overdue in red',async()=>{
  await A.cmd.setUser('koen.goossens@voorbeeld.be');const x=view('dash');
  ok(x.includes('A-GI24115-AC-001'),'my action listed');ok(/<tr class="late">.*A-GI24115-AC-001/.test(x),'overdue row is red');
  await A.cmd.setUser('an.claes@voorbeeld.be');
  S.flt.acts.overdue=true;ok(view('acts').includes('A-GI24115-AC-001'));S.flt.acts.overdue=false;
 });
 await step('12. OneDrive conflict copy: merged, conflict resolved, copy moved to _backup/conflicten',async()=>{
  const c=S.copies[0];conflictsSeen.length=0;await A.mergeCopy(c);
  eq(conflictsSeen.length,0,'one-sided logged changes need no dialog');
  const a2=A.actById('A-GI22074-AC-002');eq([a2.eigenaar,a2.deadline,a2.status],['sofie.wouters@voorbeeld.be','2026-11-20','Afgesloten'],'owner and closure from original, deadline from the copy');
  const reg=get(root,'acties/GI22074.csv');ok(reg.includes('Gegunde aannemer uitnodigen voor kick-off'),'new row from the copy kept');
  ok(reg.includes('In uitvoering'),'status change from the copy kept');
  ok(!has(root,'acties/GI22074-LAPTOP-JP01.csv'),'copy removed');ok(ls(root,'_backup/conflicten').length===1,'copy archived');eq(S.copies.length,0);
 });
 await step('13. merge on save: remote row change + local change; same field -> dialog',async()=>{
  const R=S.R.GI26057;const before=get(root,'acties/GI26057.csv');
  const rows=vm.runInContext('parseRegister',sandbox)(before);rows[0].status='In uitvoering';rows[0].gewijzigd_op='2026-11-13T10:40:00';
  rows.push(Object.assign({},rows[0],{id:'A-GI26057-JP-001',actie:'Remote nieuwe actie',status:'Open'}));
  put(root,'acties/GI26057.csv',vm.runInContext('serializeRegister',sandbox)(rows));
  A.cmd.setActionField(R.rows[0].id,'prioriteit','Kritiek','');conflictsSeen.length=0;await A.saveAll();
  const after=vm.runInContext('parseRegister',sandbox)(get(root,'acties/GI26057.csv'));
  eq(after[0].status,'In uitvoering','remote change kept');eq(after[0].prioriteit,'Kritiek','local change kept');ok(after.some(a=>a.id==='A-GI26057-JP-001'),'remote new row kept');eq(conflictsSeen.length,0);
  const rows2=vm.runInContext('parseRegister',sandbox)(get(root,'acties/GI26057.csv'));rows2[0].actie='Netstudie (remote tekst)';rows2[0].gewijzigd_op='2026-11-13T10:41:00';put(root,'acties/GI26057.csv',vm.runInContext('serializeRegister',sandbox)(rows2));
  A.cmd.setActionField(rows2[0].id,'actie','Netstudie (lokale tekst)','');
  S.hooks.resolve=async(kind,p,cs)=>{conflictsSeen.push({kind,cs});cs.forEach(c=>c.choice='local');return cs};
  await A.saveAll();eq(conflictsSeen.length,1,'conflict dialog shown');eq(conflictsSeen[0].cs[0].fields,['actie']);
  ok(get(root,'acties/GI26057.csv').includes('Netstudie (lokale tekst)'));
  S.hooks.resolve=async(kind,p,cs)=>{conflictsSeen.push({kind,path:p,cs});return cs};
 });
 await step('14. merge on save for a meeting: different topics merge, never silent overwrite',async()=>{
  await A.openMeeting('2026-11-13_ee-projectoverleg','edit');const p=`vergaderingen/2026/2026-11-13_ee-projectoverleg.md`;
  put(root,p,get(root,p).replace('### 1. Veiligheid','### 7. Risico\'s & issues\n\n- [Info] Remote: risico op vertraging transformator.\n\n### 1. Veiligheid'));
  A.cmd.addItem('2026-11-13_ee-projectoverleg','GI26057',2,'Info','Lokaal: netstudie besproken.');conflictsSeen.length=0;await A.saveAll();
  const md=get(root,p);ok(md.includes('Remote: risico op vertraging transformator.')&&md.includes('Lokaal: netstudie besproken.'),'both kept');eq(conflictsSeen.length,0);
  put(root,p,get(root,p).replace('Lokaal: netstudie besproken.','Remote versie van netstudie.'));
  const it=S.M['2026-11-13_ee-projectoverleg'].m.secties.find(s=>s.key==='GI26057').blokken[2][0];A.cmd.setItemText('2026-11-13_ee-projectoverleg','GI26057',2,it._k,'Lokale versie van netstudie.');
  await A.saveAll();eq(conflictsSeen.length,1,'same topic -> conflict dialog');eq(conflictsSeen[0].cs[0].kind,'blok');
  const md2=get(root,p);ok(md2.includes('Remote versie van netstudie.')&&md2.includes('Lokale versie van netstudie.'),'default "beide" keeps both');
  await A.closeMeeting();
 });
 await step('15. soft lock by someone else -> ask; older than 2 hours ignored',async()=>{
  const lp='vergaderingen/2026/.2026-11-13_ee-projectoverleg.md.lock';
  put(root,lp,JSON.stringify({gebruiker:'jan.peeters@voorbeeld.be',naam:'Jan Peeters',sinds:'2026-11-13T10:00:00',ververst:'2026-11-13T10:20:00'}));
  let asked=null;S.hooks.lockAsk=async l=>{asked=l;return'ro'};await A.openMeeting('2026-11-13_ee-projectoverleg','edit');
  ok(asked&&asked.naam==='Jan Peeters','asked');ok(S.ro,'read-only chosen');ok(view('mtg').includes('wordt bewerkt door Jan Peeters'));
  ok(JSON.parse(get(root,lp)).gebruiker==='jan.peeters@voorbeeld.be','foreign lock untouched');await A.closeMeeting();
  put(root,lp,JSON.stringify({gebruiker:'jan.peeters@voorbeeld.be',naam:'Jan Peeters',sinds:'2026-11-13T07:00:00',ververst:'2026-11-13T08:00:00'}));asked=null;
  await A.openMeeting('2026-11-13_ee-projectoverleg','edit');ok(!asked&&!S.ro,'stale lock ignored');eq(JSON.parse(get(root,lp)).gebruiker,'an.claes@voorbeeld.be');
  await A.closeMeeting();ok(!has(root,lp),'own lock removed on close');S.hooks.lockAsk=null;
 });
 await step('16. external change detected and reloaded ("↻ Opnieuw inlezen" semantics)',async()=>{
  const p='acties/GI25091.csv';put(root,p,get(root,p).replace('Bouwaanvraag Marine Ops building voorbereiden','Bouwaanvraag (aangepast in Excel)'));
  const n=await A.checkExternal();ok(n>=1);ok(A.allActions().some(a=>a.actie==='Bouwaanvraag (aangepast in Excel)'));
  put(root,'vergaderingen/2026/2026-12-01_pmo-review.md','---\nid: 2026-12-01_pmo-review\ndatum: 2026-12-01\ntype: pmo-review\n---\n## GI25091 – x\n### 1. Status\n- met de hand toegevoegd\n');
  await A.checkExternal();ok(S.M['2026-12-01_pmo-review'],'new meeting file picked up');
 });
 await step('17. MoM: print view, e-mail text, .md in _rapporten',async()=>{
  const x=view('print',{id:M1});ok(x.includes('<article class="mom">')&&x.includes('Actielijst')&&x.includes('Afdrukken / PDF'));
  const t=A.cmd.momText(M1);ok(t.includes('E&E projectoverleg 20/11/2026')&&t.includes('ACTIELIJST')&&t.includes('Aanwezig: '));
  await A.onClick({target:{closest:()=>({dataset:{a:'mail',id:M1},tagName:'BUTTON',type:'button',closest:()=>null})},preventDefault(){}});ok(sandbox.__clip&&sandbox.__clip.includes('ACTIELIJST'),'copied to clipboard');
  const p=await A.cmd.saveMom(M1);ok(get(root,p).startsWith('# E&E projectoverleg 20/11/2026'));
 });
 await step('18. exports rebuilt; export conflict copies deleted; viewer-ready flat rows',async()=>{
  put(root,'_export/acties-LAPTOP-JP01.csv','oud');const r=await A.rebuildExports(true);ok(r.written>=1);eq(r.removed,1);ok(!has(root,'_export/acties-LAPTOP-JP01.csv'));
  const parse=vm.runInContext('parseCsv',sandbox);const min=parse(get(root,'_export/minuten.csv'));const acts=parse(get(root,'_export/acties.csv'));const ms=parse(get(root,'_export/vergaderingen.csv'));
  ok(min.length>20&&acts.length>10&&ms.length>=11);ok(min.every(r=>r.type!=='Info'||(!r.eigenaar&&!r.deadline&&!r.status)),'gating in export');
  ok(acts.some(a=>a.achterstallig==='ja'));ok(min.every(r=>!/\n/.test(r.tekst)));
  const again=await A.rebuildExports(true);eq(again.written,0,'unchanged exports are not rewritten');
 });
 await step('19. settings: add topic (stable numbers, backup), add type, extra person',async()=>{
  eq(await A.cmd.updateConfig(cfg=>{vm.runInContext('addTopic',sandbox)(cfg,'teammeeting','Welzijn')}),'');
  const cfg=JSON.parse(get(root,'_config.json'));const tm=cfg.vergadertypes.find(t=>t.id==='teammeeting');eq(tm.topics[5],{nr:6,naam:'Welzijn',actief:true});
  ok(ls(root,'_backup/config').length>=1,'config backup');
  eq(await A.cmd.savePerson({naam:'Eva Extern',organisatie:'Aannemer BV',functie:'Werfleider',type:'extern'}),'');
  ok(get(root,'personen-extra.csv').includes('"ext-aannemer-bv-eva-extern"'));ok(S.people.byKey['ext-aannemer-bv-eva-extern']);
  ok(/bestaat al/.test(await A.cmd.savePerson({naam:'Eva Extern',organisatie:'Aannemer BV',type:'extern'})));
  ok(view('set').includes('Vergadertypes en topics'));
 });
 await step('20. every screen renders; click dispatch works; backups written',async()=>{
  for(const v of ['dash','mtgs','acts','projs','set'])view(v);
  S.form=null;view('newm');ok(html().includes('Zelfde deelnemers als vorige vergadering'));
  await A.onClick({target:{closest:()=>({dataset:{a:'view',v:'acts'},tagName:'BUTTON',type:'button',closest:()=>null})},preventDefault(){}});eq(S.view,'acts');
  ok(ls(root,'_backup').some(n=>/^2026-11-13_AC$/.test(n)),'backup-before-write folder');await A.backupNow();ok(ls(root,'_backup').some(n=>/volledig$/.test(n)));
 });
 await step('21. hand-edited meeting file (Notepad) is read correctly after reload',async()=>{
  const p='vergaderingen/2026/2026-11-10_teammeeting.md';put(root,p,get(root,p).replace('- [Info] Teamactiviteit op 12 december.','- [Info] Teamactiviteit op 12 december.\n  Inschrijven via de teamsite.\n- [Beslissing] Kerstpakketten worden centraal besteld.'));
  await A.openRoot(root);const m=S.M['2026-11-10_teammeeting'].m;const v=m.secties.find(s=>s.key==='ALG').blokken[5];
  eq(v[0].tekst,'Teamactiviteit op 12 december.\nInschrijven via de teamsite.');eq(v[1].type,'Beslissing');
 });
 await step('22. performance: 400 list rows, 500 meetings, 3000 actions load < 3 s',async()=>{
  const big=new MemDir('groot');put(big,'_config.json',get(root,'_config.json'));put(big,'_bron/personen.csv',get(root,'_bron/personen.csv'));
  const hdr='ID,Title,field_1,field_2,field_3,field_4,field_5,field_6,field_7,field_8,field_9,field_11,field_12';
  put(big,'_bron/projecten.csv',[hdr,...Array.from({length:420},(_,i)=>`${i},PSAA,${2023+i%5},NZT,BC${i},Project ${i},GI${20000+(i%300)},${i*1000},${i*500},${i%7} x,PM ${i%20},DMND${i},PRJ${i}`)].join('\n'));
  const sNew=vm.runInContext('newMeeting',sandbox),ser=vm.runInContext('serializeMeeting',sandbox),nAct=vm.runInContext('newAction',sandbox),serR=vm.runInContext('serializeRegister',sandbox);
  const regs={};let k=0;
  for(let i=0;i<500;i++){const d=new Date(Date.UTC(2024,0,1)+i*2.1*864e5).toISOString().slice(0,10);const gis=[`GI${20000+i%300}`,`GI${20000+(i+7)%300}`,`GI${20000+(i+13)%300}`];
   const m=sNew({id:`${d}_ee-projectoverleg${i%2?'-2':''}`,datum:d,type:'ee-projectoverleg',titel:'x',projecten:gis,projectgebonden:true,user:'an.claes@voorbeeld.be'});
   gis.forEach(g=>{const s=m.secties.find(x=>x.key===g);for(let t=1;t<=8;t++)s.blokken[t]=[{type:'Info',id:'',tekst:'Notitie '+t+' over de voortgang van het project, met wat meer tekst.'}];
    for(let j=0;j<2;j++){const id=`A-${g}-AC-${String(++k).padStart(3,'0')}`;(regs[g]=regs[g]||[]).push(nAct({id,secKey:g,meeting:m.id,datum:d,topic:'ee-projectoverleg:2',actie:'Actie '+k,eigenaar:'jan.peeters@voorbeeld.be',deadline:d,user:'x',code:'AC'}));s.blokken[2].push({type:'Actie',id,tekst:''})}});
   put(big,`vergaderingen/${d.slice(0,4)}/${m.id}.md`,ser(m,{cfg:S.cfg}))}
  Object.keys(regs).forEach(g=>put(big,`acties/${g}.csv`,serR(regs[g])));
  const t0=Date.now();await A.openRoot(big);const ms=Date.now()-t0;
  ok(Object.keys(S.M).length===500,'all meetings loaded: '+Object.keys(S.M).length);ok(A.allActions().length===3000,'3000 actions: '+A.allActions().length);
  const tr=Date.now();for(const v of ['dash','projs','acts','mtgs'])view(v);view('proj',{gi:'GI20005',tab:'tijdlijn'});const rms=Date.now()-tr;
  console.log(`  prestatie: laden ${ms} ms (in-memory), 5 schermen renderen ${rms} ms`);ok(ms<3000,'load took '+ms+' ms');
 });

 await step('23. viewer (phase 2): reads mocked __LD_RESULTS__ (rows + CSV text or {headers,rows}), renders the 3 views',async()=>{
  const vhtml=fs.readFileSync(path.join(HERE,'release','PSA-MoM-viewer.html'),'utf8');
  ok(!/fetch\(|localStorage|sessionStorage|indexedDB|XMLHttpRequest/.test(vhtml.split('/*CORE-END*/').pop().replace(/[\s\S]*\/\* PSA-MoM viewer/,'')),'viewer code uses no network or storage');
  const js=vhtml.slice(vhtml.lastIndexOf('<script>')+8,vhtml.lastIndexOf('</script>'));
  const app=new El();let handlers={};app.addEventListener=(t,f)=>{handlers[t]=f};
  const rows=vm.runInContext('parseCsvRows',sandbox)(fs.readFileSync(path.join(HERE,'voorbeelddata/_bron/projecten.csv'),'utf8'));
  const exp=n=>fs.readFileSync(path.join(HERE,'voorbeelddata/_export/'+n+'.csv'),'utf8');
  const asRows=t=>{const r=vm.runInContext('parseCsvRows',sandbox)(t);return{headers:r[0],rows:r.slice(1).filter(x=>x.some(Boolean))}};
  for(const variant of ['text','rows']){
   const vs={console,TextDecoder,setTimeout,clearTimeout,Date,Math,JSON,Intl,document:{getElementById:()=>app,activeElement:null},window:{scrollTo(){}}};
   vs.window.__LD_RESULTS__={a:{format:'rows',content:JSON.stringify({headers:rows[0],rows:rows.slice(1)})},
    b:{format:'csv',content:variant==='text'?exp('minuten'):asRows(exp('minuten'))},c:{format:'csv',content:variant==='text'?exp('acties'):asRows(exp('acties'))},d:{format:'csv',content:variant==='text'?exp('vergaderingen'):asRows(exp('vergaderingen'))}};
   vm.createContext(vs);vm.runInContext(js,vs);vm.runInContext("setNow('2026-11-13T10:00:00');window.PSAMoMViewer.renderV()",vs);
   const Vw=vs.window.PSAMoMViewer.V;eq(Vw.proj.projects.length,19,'list rows');eq(Vw.verg.length,8);ok(Vw.min.length>20&&Vw.acts.length>10);
   ok(app.innerHTML.includes('● Live data'),'source line');ok(app.innerHTML.includes('Achterstallig')&&app.innerHTML.includes('A-GI24115-AC-001'));
   ok(Vw.min.some(m=>m.tekst.includes('\n')),'⏎ decoded to line breaks');
   const click=ds=>handlers.click({target:{closest:()=>({dataset:ds,tagName:'A'})},preventDefault(){}});
   click({gi:'GI22074'});ok(app.innerHTML.includes('HV connection ET and NZT to 150kV_part1')&&app.innerHTML.includes('Tijdlijn')&&app.innerHTML.includes('B-20261106-AC-01'),'project view');
   click({mid:'2026-11-06_ee-projectoverleg'});ok(app.innerHTML.includes('Aanwezig')&&app.innerHTML.includes('Kabelwerken gegund'),'meeting MoM view');
  }
  const none={console,TextDecoder,setTimeout,clearTimeout,Date,Math,JSON,Intl,document:{getElementById:()=>app,activeElement:null},window:{}};
  vm.createContext(none);vm.runInContext(js,none);ok(app.innerHTML.includes('Niet alle data'),'missing live data is reported');
 });

 console.log(`smoke.js: ${pass} geslaagd, ${fail} mislukt`);
 if(fail){fails.forEach(f=>console.log('  ✗ '+f));process.exit(1)}
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
