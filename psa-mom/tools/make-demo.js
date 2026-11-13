/* Generates the demo data folder voorbeelddata/ (fictitious people; project rows taken from the
   Project Status Dashboard snapshot with fictitious PMs). Uses core.js, so the files always match the formats.
   Run: node tools/make-demo.js            (overwrites voorbeelddata/) */
'use strict';
const fs=require('fs'),path=require('path');
const C=require('../src/core.js');
const OUT=path.join(__dirname,'..','voorbeelddata');
const D='@voorbeeld.be';

/* ---------- people (fictitious) ---------- */
const SPE=[['Jan Peeters','jan.peeters','E&E','Projectingenieur'],['An Claes','an.claes','E&E','Teamleider engineering'],['Wim Maes','wim.maes','E&E','Engineer hoogspanning'],
 ['Sofie Wouters','sofie.wouters','E&E','Projectleider'],['Pieter Jacobs','pieter.jacobs','Infra','Engineer infrastructuur'],['Lotte Willems','lotte.willems','ICT/OT','Engineer ICT/OT'],
 ['Koen Goossens','koen.goossens','Gebouwen','Engineer gebouwen'],['Els Janssens','els.janssens','E&E','Departementsmanager E&E']];
const PMO=[['Bart De Smedt','bart.desmedt','PMO','PMO-manager'],['Nathalie Dubois','nathalie.dubois','PMO','Projectmanager'],['Tom Vermeulen','tom.vermeulen','PMO','Projectmanager'],
 ['Ines Hermans','ines.hermans','PMO','Projectcontroller'],['Dirk Van Damme','dirk.vandamme','PMO','Projectmanager'],['Sarah Lambrecht','sarah.lambrecht','PMO','Projectmanager'],
 ['Wout Michiels','wout.michiels','PMO','Projectmanager'],['Sofie Wouters','sofie.wouters','PMO','Projectleider']];
const personenCsv='﻿'+['naam;email;afdeling;functie;groep',...SPE.map(p=>`${p[0]};${p[1]}${D};${p[2]};${p[3]};SPE`),...PMO.map(p=>`${p[0]};${p[1]}${D};${p[2]};${p[3]};PMO`)].join('\r\n')+'\r\n';
const extra=[{key:'ext-elia-kurt-de-smet',email:'',naam:'Kurt De Smet',organisatie:'Elia',functie:'Accountmanager',type:'extern',actief:true},
 {key:'marie.peeters@poab-voorbeeld.be',email:'marie.peeters@poab-voorbeeld.be',naam:'Marie Peeters',organisatie:'Port of Antwerp-Bruges',functie:'Projectcoördinator',type:'extern',actief:true},
 {key:'johan.verbruggen@ib-voorbeeld.be',email:'johan.verbruggen@ib-voorbeeld.be',naam:'Johan Verbruggen',organisatie:'Ingenieursbureau Voorbeeld',functie:'Consultant HS',type:'extern',actief:true}];
const E=k=>k.includes('@')||k.startsWith('ext-')?k:k+D;
const people=C.buildPeople(C.parsePersonen(personenCsv),extra);
const code=k=>people.byKey[E(k)].code;

/* ---------- project list rows (from the dashboard snapshot; PM replaced by fictitious people) ---------- */
const ROWS=[
 ['PSAA','2024','NZT+ET','166.26CAF0850-01','High Tension Connection (150kV)','GI22074','5520000','0','1 design','jan.peeters','','PRJ0021523'],
 ['PSAA','2024','NZT+ET','166.EM-CIV-04-09','HV connection ET and NZT to 150kV_part1','GI22074','','11150000','2 execution','jan.peeters','DMND0045120','PRJ0021523'],
 ['PSAA','2024','NZT+ET','166.24CAF0850-02-01','HV connection ET and NZT to 150kV_part2','GI22074','','13900000','1 design','jan.peeters','DMND0045121','PRJ0021523'],
 ['PSAA','2026','NZT+ET','166.26CAF0400-31','NT + ET_Invest in extra EV capacity','GI26057','200000','0','0 not started','jan.peeters','',''],
 ['PSAA','2026','NZT+ET','166.26CAF0400-31-01','NT + ET_Invest in extra EV capacity','GI26057','','200000','0 not started','jan.peeters','DMND0051877',''],
 ['PSAA','2026','NZT','166.26CAF0400-52-01','NT + ET_Invest in extra EV capacity','GI26057','','130000','0 not started','jan.peeters','','PRJ0078468'],
 ['WDK','2028','WD','TBD','Refurbishment elevator motors','GI23111-GI24115','30000','0','0 not started','tom.vermeulen','',''],
 ['WDK','2026','WD','166.26CAF0800-09-01','Refurbishment elevators','GI23111-GI24115','','120000','2 execution','koen.goossens','','PRJ0071909'],
 ['PSAA','2025','NZT+ET','166.25CAE0782-02-01','Replacement of 10 CCTV cameras','GI25071-24109','','50000','2 execution','lotte.willems','',''],
 ['PSAA','2025','NZT','166.25CAF0400-18-01',"Centralized Service Station SC's NZT (extended scope)",'GI22075','150000','920000','1 design','nathalie.dubois','','PRJ0035665'],
 ['PSAA','2025','NZT+ET','166.25CAF0400-43-01','Combined Service Station – Extra Safety Features','GI22075','','75000','1 design','nathalie.dubois','','PRJ0068954'],
 ['PSAA','2025','NZT+ET','166.25CAF0400-04-OPEX','Pavement renewal 2025 increase','GI25022','','400000','3 closing','dirk.vandamme','','PRJ0060650'],
 ['PSAA','2026','NZT+ET','166.26CAF0400-42','PRJ - Upgrading Fire & Evacuation Devices on Operational Buildings','GI24058','100000','0','0 not started','tom.vermeulen','',''],
 ['PSAA','2025','NZT+ET','166.25CAF0400-45-01','2 Factor Authentication (fingerscans)','GI25084','','350000','2 execution','sofie.wouters','','PRJ0020810'],
 ['PSAA','2026','NZT','166.26CAF0400-06','NT_15.5kV connection HS1 & HS2','GI24101','1650000','0','6 not selected','wim.maes','',''],
 ['PSAA','2027','NZT','166.26CAF0400-01','NT_Replace end-of-life HT Cabins HS01 & HS02 and connect to 150/36 kV Power Supply','GI24101','10450000','0','1 design','wim.maes','DMND0049902','PRJ0059050'],
 ['PSAA','2026','NZT+ET','166.26CAF0400-03','Interterminal fiber connection HS20 – HS07 via TP136','GI24104','','250000','1 design','wim.maes','','PRJ0065893'],
 ['PSAA','2026','NZT','166.26CAF0400-28-01','NT_Re-Surface former MO Building Area','GI25091','','2065000','1 design','nathalie.dubois','','PRJ0072129'],
 ['PSAA','2025','NZT','166.25CAF0400-50-01','NZT New Marine Ops building','GI25091','','7000000','1 design','nathalie.dubois','','PRJ0061313'],
 ['PSAA','2026','NZT','26CAF0400-46-02','NT Extra SC Parking Spots with Safe Access','GI26078','','12520000','2 execution','dirk.vandamme','','PRJ0080552'],
 ['PSAA','2025','NZT+ET','166.25CAF0400-30-01','Rollout of ANPR cameras','GI25095','','90000','2 execution','pieter.jacobs','','PRJ0069381'],
 ['WDK','2025','WD','166.25CAF0800-03','Fire detection + emergency lighting 2025','GI24076','60000','0','2 execution','koen.goossens','','PRJ0069819'],
 ['WDK','2027','WD','TBD','Fit for Future and Intermediate upgrades','GI23063','500000','0','0 not started','wout.michiels','',''],
 ['WDK','2025','WD','166.25CAF0800-05-01','Fit for Future and Intermediate upgrades WD 2025','GI25049','','980000','2 execution','sarah.lambrecht','','PRJ0069819'],
 ['PSABB','2024','CT-North','PSA Breakbulk-2023-CIVIL-11','PSABB New Gate In Q494','GI21069','300000','0','5 on hold','sarah.lambrecht','',''],
 ['PSABB','2025','CT-South','TBD','PSAB New parking blue collars Q494','','800000','0','5 on hold','sarah.lambrecht','',''],
 ['PSABB','2024','CT-North','PSA Breakbulk-2023-CIVIL-10','PSABB Admin Building Q494','','1000000','0','5 on hold','sarah.lambrecht','',''],
 ['PSABB','2024','CT-South','TBD','Q408 Bestaande kraanputten operationaliseren','','TBD','0','5 on hold','dirk.vandamme','',''],
 ['PSAA','2026','ET','166.26CAF0400-16','Replacement Heater workshop Q869','','120000','0','6 not selected','koen.goossens','',''],
 ['PSAA','2026','NZT+ET','166.26CAF0400-48','Rollout of new detection systems (Lidar, AI)','','150000','0','0 not started','lotte.willems','','']];
/* Power Automate format: internal column names, comma separated, no BOM (see POWER-AUTOMATE.md) */
const q=v=>/[",\n]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':v;
const projCsv=['ID,Title,field_1,field_2,field_3,field_4,field_5,field_6,field_7,field_8,field_9,field_11,field_12,PMPerson,PMEmail',
 ...ROWS.map((r,i)=>{const pm=people.byKey[E(r[9])];return[100+i*3,r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],pm.naam,r[10],r[11],pm.naam,pm.email].map(q).join(',')})].join('\n')+'\n';
const proj=C.parseProjectsCsv(projCsv);

/* ---------- meetings & actions ---------- */
const cfg=C.defaultConfig();const meetings=[];const regs={};
const R=key=>regs[key]||(regs[key]=[]);
function mtg(o){
 C.setNow(o.datum+'T09:00:00');const tp=C.typeOf(cfg,o.type);
 const m=C.newMeeting({id:C.meetingIdFor(o.datum,o.type,new Set(meetings.map(x=>x.id))),datum:o.datum,type:o.type,titel:`${tp.naam} ${C.fmt(o.datum)}`,voorzitter:E(o.vz),notulist:E(o.nt),
  aanwezig:o.aw.map(E),verontschuldigd:(o.vo||[]).map(E),projecten:o.pr||[],projectgebonden:tp.projectgebonden,user:E(o.nt),namen:Object.fromEntries((o.pr||[]).map(g=>[g,proj.byGi[g].naam]))});
 m.status=o.status||'Definitief';m._code=code(o.nt);m._user=E(o.nt);meetings.push(m);C.setNow(o.datum+'T11:45:00');m.gewijzigd_op=C.stamp();return m;
}
const ctx=m=>({user:m._user,code:m._code,meeting:m.id});
function info(m,sec,nr,t){const s=C.ensureSection(m,sec);(s.blokken[nr]=s.blokken[nr]||[]).push({type:'Info',id:'',tekst:t})}
function besl(m,sec,nr,t){const id=C.nextDecisionId(C.decisionIds(meetings),m.datum,m._code);const s=C.ensureSection(m,sec);(s.blokken[nr]=s.blokken[nr]||[]).push({type:'Beslissing',id,tekst:t});return id}
function actie(m,sec,nr,t,owner,deadline,prio){
 const key=C.regKeyFor(sec);const id=C.nextActionId(R(key),sec,m._code);
 const a=C.newAction({id,secKey:sec,meeting:m.id,datum:m.datum,topic:C.topicRef(m.type,nr),actie:t,eigenaar:E(owner),deadline,prioriteit:prio||'Midden',user:m._user,code:m._code});
 R(key).push(a);const s=C.ensureSection(m,sec);(s.blokken[nr]=s.blokken[nr]||[]).push({type:'Actie',id,tekst:t});return a;
}
const ok=e=>{if(e)throw new Error(e)};

/* E&E projectoverleg */
let m=mtg({datum:'2026-10-16',type:'ee-projectoverleg',vz:'els.janssens',nt:'an.claes',aw:['els.janssens','an.claes','jan.peeters','wim.maes','lotte.willems','ext-elia-kurt-de-smet'],vo:['sofie.wouters'],pr:['GI22074','GI26057','GI24101']});
info(m,'GI22074',1,'Geen incidenten bij de sonderingen op het tracé.');
info(m,'GI22074',2,'Elia bevestigt het aansluitvenster in Q3 2027.');
besl(m,'GI22074',3,'PIF part 2 wordt pas ingediend na gunning van de kabelwerken.');
const A1=actie(m,'GI22074',5,'Offerte kabelwerken opvragen bij drie aannemers','jan.peeters','2026-10-30','Hoog');
const A2=actie(m,'GI22074',6,'Omgevingsvergunning nieuwe HS-cabine indienen','wim.maes','2026-11-06','Hoog');
info(m,'GI26057',2,'Studie laadinfrastructuur gestart.');
const A3=actie(m,'GI26057',4,'Netstudie capaciteit laadpunten NZT','lotte.willems','2026-11-20');
info(m,'GI24101',7,'Levertijd HT-cellen nu meer dan 40 weken.\nImpact op planning HS01 wordt bekeken.');
const A4=actie(m,'GI24101',7,'Alternatieve leverancier HT-cellen bevragen','wim.maes','2026-11-27');
info(m,'ALG',8,'Volgende vergadering op 30/10.');

m=mtg({datum:'2026-10-30',type:'ee-projectoverleg',vz:'els.janssens',nt:'an.claes',aw:['els.janssens','an.claes','jan.peeters','wim.maes','lotte.willems','sofie.wouters'],pr:['GI22074','GI26057','GI24101','GI25084']});
besl(m,'GI22074',2,'Startdatum kabelwerken vastgelegd op 1 maart 2027.');
info(m,'GI22074',3,'Budget part 1 voor 62% verbruikt.');
ok(C.shiftDeadline(A2,'2026-11-12','wacht op advies brandweer',ctx(m)));
info(m,'GI26057',4,'Netstudie loopt; eerste resultaten half november.');
ok(C.setActionStatus(A4,'In uitvoering',ctx(m)));
info(m,'GI25084',4,'Fingerscans geïnstalleerd aan 6 van de 9 toegangen.');
info(m,'ALG',1,'Toolbox LMRA herhaald voor alle aannemers.');

m=mtg({datum:'2026-11-06',type:'ee-projectoverleg',vz:'els.janssens',nt:'an.claes',aw:['els.janssens','an.claes','jan.peeters','wim.maes','koen.goossens','ext-elia-kurt-de-smet'],vo:['lotte.willems'],pr:['GI22074','GI26057','GI24101','GI24115']});
const b1=besl(m,'GI22074',5,'Kabelwerken gegund aan de laagste regelmatige bieder (offerte 2).');
ok(C.closeAction(A1,{afsluiting:`${b1}: offertes ontvangen en vergeleken`,datum:m.datum},ctx(m)));
const A5=actie(m,'GI22074',2,'Planning kabelwerken afstemmen met Elia','ext-elia-kurt-de-smet','2026-11-20');
info(m,'GI24115',2,'Liftrenovatie Willemdok: uitvoering in 2027 (budget onder GI23111-GI24115).');
const A6=actie(m,'GI24115',4,'Technische fiche liftmotoren opvragen bij de fabrikant','koen.goossens','2026-11-10');
besl(m,'GI26057',3,'Extra PIF van € 130.000 voor NZT wordt aangevraagd.');

m=mtg({datum:'2026-11-13',type:'ee-projectoverleg',vz:'els.janssens',nt:'an.claes',aw:['els.janssens','an.claes','jan.peeters'],pr:['GI22074','GI26057','GI24101'],status:'Concept'});
info(m,'GI22074',1,'Geen incidenten.');

/* PMO-review */
m=mtg({datum:'2026-10-21',type:'pmo-review',vz:'bart.desmedt',nt:'ines.hermans',aw:['bart.desmedt','ines.hermans','nathalie.dubois','dirk.vandamme','jan.peeters'],pr:['GI22075','GI25022','GI22074']});
info(m,'GI22075',1,'Ontwerp extra veiligheidsvoorzieningen in review bij preventie.');
const P1=actie(m,'GI22075',3,'Risicoanalyse brandveiligheid tankstation actualiseren','nathalie.dubois','2026-11-04','Hoog');
besl(m,'GI25022',4,'Project mag afgesloten worden; restbudget wordt vrijgegeven.');
const P2=actie(m,'GI25022',1,'Financiële afsluiting in SNOW (PRJ0060650)','dirk.vandamme','2026-11-28');
info(m,'GI22074',4,'Escalatie levertijd transformator: verdere opvolging in het E&E projectoverleg.');

m=mtg({datum:'2026-11-04',type:'pmo-review',vz:'bart.desmedt',nt:'ines.hermans',aw:['bart.desmedt','ines.hermans','nathalie.dubois','dirk.vandamme','marie.peeters@poab-voorbeeld.be'],pr:['GI22075','GI25022','GI25091']});
ok(C.closeAction(P1,{afsluiting:'Risicoanalyse geactualiseerd en gedeeld met preventie',datum:m.datum},ctx(m)));
info(m,'GI22075',1,'Risicoanalyse afgerond; geen bijkomende maatregelen nodig.');
info(m,'GI25091',1,'Ontwerp Marine Ops building op 60%.');
actie(m,'GI25091',4,'Bouwaanvraag Marine Ops building voorbereiden','nathalie.dubois','2026-12-15','Hoog');
info(m,'GI25091',2,'Raming ontwerp ligt 4% boven budget.');

/* Teammeeting (general, one with a project section) */
m=mtg({datum:'2026-10-27',type:'teammeeting',vz:'els.janssens',nt:'an.claes',aw:['els.janssens','an.claes','jan.peeters','wim.maes','pieter.jacobs','koen.goossens','lotte.willems']});
info(m,'ALG',1,'Nieuwe LMRA-procedure van toepassing vanaf 1/11.');
info(m,'ALG',2,'Nieuwe collega start op 1 december.');
const T1=actie(m,'ALG',3,'Verlofplanning eindejaar doorgeven','an.claes','2026-11-07');
actie(m,'ALG',4,'Inschrijven HV-opleiding BA4/BA5','pieter.jacobs','2026-11-30','Laag');

m=mtg({datum:'2026-11-10',type:'teammeeting',vz:'els.janssens',nt:'an.claes',aw:['els.janssens','an.claes','pieter.jacobs','koen.goossens','sofie.wouters'],pr:['GI24058']});
ok(C.closeAction(T1,{afsluiting:'Verlofplanning volledig; bezetting tussen kerst en nieuw verzekerd',datum:m.datum},ctx(m)));
info(m,'ALG',5,'Teamactiviteit op 12 december.');
actie(m,'GI24058',3,'Inventaris brand- en evacuatietoestellen opmaken','pieter.jacobs','2026-12-18');

/* ---------- write ---------- */
fs.rmSync(OUT,{recursive:true,force:true});
const W=(p,t)=>{const f=path.join(OUT,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,t,'utf8')};
C.setNow('2026-11-13T08:00:00');
W('_config.json',JSON.stringify(cfg,null,1)+'\n');
W('_bron/projecten.csv',projCsv);W('_bron/personen.csv',personenCsv);W('personen-extra.csv',C.serializePersonenExtra(extra));
const byId={};Object.values(regs).flat().forEach(a=>byId[a.id]=a);
const projName=gi=>proj.byGi[gi]?proj.byGi[gi].naam:gi;
const mdc={cfg,people,projName,actie:id=>byId[id],autoActions:(mm,sec)=>(regs[C.regKeyFor(sec)]||[]).filter(a=>a.vergadering===mm.id||C.verloopMentions(a,mm.id)).map(a=>Object.assign({},a,{eigenaarNaam:C.personLabel(people,a.eigenaar)}))};
meetings.forEach(mm=>{delete mm._code;delete mm._user});
meetings.forEach(mm=>W(C.meetingPath(mm),C.serializeMeeting(mm,mdc)));
Object.keys(regs).forEach(k=>W(C.regPath(k),C.serializeRegister(regs[k])));
/* simulated OneDrive conflict: Jan edited GI22074.csv on his laptop while it was changed elsewhere */
const copyRows=C.clone(regs.GI22074);
const a2=copyRows.find(a=>a.id===A2.id);C.setNow('2026-11-12T16:05:00');
C.shiftDeadline(a2,'2026-11-20','vergunningsdossier aangevuld met brandweeradvies',{user:E('jan.peeters'),code:code('jan.peeters')});
const a5=copyRows.find(a=>a.id===A5.id);C.setActionStatus(a5,'In uitvoering',{user:E('jan.peeters'),code:code('jan.peeters')});
copyRows.push(C.newAction({id:C.nextActionId(copyRows,'GI22074',code('jan.peeters')),secKey:'GI22074',meeting:'',datum:'2026-11-12',topic:'ee-projectoverleg:5',actie:'Gegunde aannemer uitnodigen voor kick-off',eigenaar:E('jan.peeters'),deadline:'2026-11-26',user:E('jan.peeters'),code:code('jan.peeters')}));
/* ... and meanwhile someone else changed the owner of A2 in the original file */
C.setNow('2026-11-12T17:30:00');C.setActionOwner(regs.GI22074.find(a=>a.id===A2.id),E('sofie.wouters'),{user:E('an.claes'),code:code('an.claes')},'Sofie Wouters');
W(C.regPath('GI22074'),C.serializeRegister(regs.GI22074));
W('acties/GI22074-LAPTOP-JP01.csv',C.serializeRegister(copyRows));
C.setNow('2026-11-13T08:00:00');
const ex=C.buildExports({cfg,meetings,actions:Object.values(regs).flat(),people,projName,projPm:gi=>proj.byGi[gi]?proj.byGi[gi].pmNamen.join(', '):''});
Object.keys(ex).forEach(n=>W('_export/'+n,ex[n]));
for(const d of ['_backup','_rapporten'])W(d+'/.gitkeep','');
console.log(`voorbeelddata: ${proj.rows.length} projectrijen (${proj.projects.length} GI-codes, ${proj.noGi.length} zonder GI), ${people.list.length} personen, ${meetings.length} vergaderingen, ${Object.values(regs).flat().length} acties in ${Object.keys(regs).length} registers + 1 conflictkopie`);
