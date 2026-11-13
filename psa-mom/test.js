/* Unit tests on src/core.js. Run: node test.js  (exit code 1 on failure) */
'use strict';
const assert=require('assert');
const C=require('./src/core.js');
let pass=0,fail=0;const fails=[];
function test(name,fn){try{fn();pass++}catch(e){fail++;fails.push(name+'\n    '+(e&&e.message||e))}}
const eq=(a,b,m)=>assert.deepStrictEqual(a,b,m);
C.setNow('2026-11-13T10:42:00');

/* ---------- CSV ---------- */
test('csv round trip with ; quotes, newlines and BOM',()=>{
 const rows=[{a:'x;y',b:'he said "hi"',c:'line1\nline2'},{a:'',b:'é',c:'3'}];
 const t=C.toCsv(['a','b','c'],rows);
 assert(t.startsWith('﻿"a";"b";"c"\r\n'));
 eq(C.parseCsv(t),rows);
});
test('csv separator detection (comma, Power Automate) and no BOM',()=>{
 eq(C.detectSep('a,b,c\n1,2,3'),',');eq(C.detectSep('"a;b",c,d'),',');eq(C.detectSep('a;b;c'),';');
 eq(C.parseCsv('a,b\n"1,5",2\n'),[{a:'1,5',b:'2'}]);
});
test('decodeBytes falls back to Windows-1252 (Excel "CSV" save)',()=>{
 eq(C.decodeBytes(new Uint8Array([0x63,0x61,0x66,0xE9])),'café');
 eq(C.decodeBytes(new Uint8Array([0xEF,0xBB,0xBF,0x63,0xC3,0xA9])),'cé');
});

/* ---------- dates ---------- */
test('dates: fmt, normDate (Excel/BE formats), normStamp',()=>{
 eq(C.fmt('2026-11-27'),'27/11/2026');eq(C.normDate('27/11/2026'),'2026-11-27');eq(C.normDate('7-1-26'),'2026-01-07');
 eq(C.normDate('2026-1-5'),'2026-01-05');eq(C.normStamp('13/11/2026 10:42'),'2026-11-13T10:42:00');eq(C.normStamp('2026-11-13T10:42:07'),'2026-11-13T10:42:07');
 eq(C.today(),'2026-11-13');
});

/* ---------- project list ---------- */
test('GI code parsing: single, combined, abbreviated, none',()=>{
 eq(C.parseGiCodes('GI22074'),['GI22074']);
 eq(C.parseGiCodes('GI23111-GI24115'),['GI23111','GI24115']);
 eq(C.parseGiCodes('GI25071-24109'),['GI25071','GI24109']);
 eq(C.parseGiCodes('gi 22074 / GI-26057'),['GI22074','GI26057']);
 eq(C.parseGiCodes(''),[]);eq(C.parseGiCodes('TBD'),[]);eq(C.parseGiCodes('12345'),[]);
 eq(C.parseGiCodes('GI220745'),[]);
});
test('dashboard helpers: year, currency, euro, status',()=>{
 eq(C.normalizeYear('26'),'2026');eq(C.normalizeYear('2025.0'),'2025');eq(C.normalizeYear('FY2027'),'2027');
 eq(C.parseCurrencyValue('€ 1.234.567,50'),1234567.5);eq(C.parseCurrencyValue('1,234,567.00'),1234567);eq(C.parseCurrencyValue('5520000'),5520000);eq(C.parseCurrencyValue('TBD'),0);
 eq(C.formatEuro(1234567).replace(/\s/g,' '),'€ 1.234.567');
 eq(C.normalizeStatus('2 Execution'),'2 execution');eq(C.statusClass('5 on hold'),'status-5');
 eq(C.normalizeStatus('{"Value":"1 design"}'),'1 design');
});
test('person parsing: JSON (Power Automate), claims, text',()=>{
 const pj='{"Claims":"i:0#.f|membership|an.peeters@demo.be","DisplayName":"An Peeters","Email":"An.Peeters@demo.be"}';
 eq(C.personName(pj),'An Peeters');eq(C.personEmail(pj),'an.peeters@demo.be');
 eq(C.personEmail('i:0#.f|membership|jan@x.be'),'jan@x.be');eq(C.personName('Jan Peeters'),'Jan Peeters');eq(C.personEmail('Jan Peeters'),'');
});
const PROJ_INTERNAL=`ID,Title,field_1,field_2,field_3,field_4,field_5,field_6,field_7,field_8,field_9,field_11,field_12,PMPerson
1,PSAA,2024,NZT+ET,166.26CAF0850-01,High Tension Connection (150kV),GI22074,5520000,0,1 design,Old PM,,PRJ0021523,"{""DisplayName"":""An Peeters"",""Email"":""an.peeters@demo.be""}"
2,PSAA,2024,NZT+ET,166.EM-CIV-04-09,HV connection ET and NZT to 150kV_part1,GI22074,,11150000,2 execution,,DMND001,PRJ0021523,
7,PSAA,2025,NZT+ET,166.24CAF0850-02-01,HV connection ET and NZT to 150kV,GI22074,,13900000,1 design,An Peeters,,PRJ0021523,
3,WDK,2028,WD,X,Refurbishment elevator motors,GI23111-GI24115,30000,0,0 not started,Tom Test,,,
4,PSABB,2025,CT-South,TBD,PSAB New parking,,800000,0,5 on hold,Pat Test,,,
5,PSAA,2026,NZT,Y,Combined,GI25071-24109,1.000,0,2 Execution,Tom Test,,,`;
const PROJ_DISPLAY='﻿Portfolio;Year;Location;Budgetcode;Description;Project code;Budget;PIF amount;Status;PM;DMND;PRJ;ID\r\nPSAA;26;ET;B1;Pavement;GI25022;€ 400.000;0;3 closing;Jo Test;;PRJ1;9\r\n';
test('projects CSV with internal names: grouping by GI, name from most recent year, budget lines',()=>{
 const r=C.parseProjectsCsv(PROJ_INTERNAL);
 eq(r.rows.length,6);eq(r.noGi.length,1);eq(r.missing,[]);
 const p=r.byGi.GI22074;eq(p.rows.length,3);eq(p.naam,'HV connection ET and NZT to 150kV');eq(p.rows[0].year,'2025');
 eq(p.pif,25050000);eq(p.budget,5520000);eq(p.pmNamen,['An Peeters']);eq(p.pmEmails,['an.peeters@demo.be']);eq(p.dmnd,['DMND001']);
 assert(r.byGi.GI23111&&r.byGi.GI24115,'combined code row belongs to both');eq(r.byGi.GI24115.naam,'Refurbishment elevator motors');
 assert(r.byGi.GI24109);eq(r.byGi.GI25071.statuses,['2 execution']);eq(r.byGi.GI25071.budget,1000);
 eq(r.projects.map(x=>x.gi),['GI22074','GI23111','GI24109','GI24115','GI25071']);
});
test('projects CSV with display names, ; and BOM',()=>{
 const r=C.parseProjectsCsv(PROJ_DISPLAY);const p=r.byGi.GI25022;
 eq(p.naam,'Pavement');eq(p.rows[0].year,'2026');eq(p.budget,400000);eq(p.pmNamen,['Jo Test']);eq(p.rows[0].listId,'9');
});
test('project filters and search',()=>{
 const r=C.parseProjectsCsv(PROJ_INTERNAL);const p=r.byGi.GI22074;
 assert(C.matchProject(p,{q:'150kv prj0021523'}));assert(!C.matchProject(p,{q:'parking'}));
 assert(C.matchProject(p,{status:new Set(['2 execution'])}));assert(!C.matchProject(p,{location:new Set(['WD'])}));
 assert(C.matchProject(p,{pm:new Set(['An Peeters']),year:new Set(['2025'])}));assert(C.matchProject(p,{q:'dmnd001'}));
});

/* ---------- people ---------- */
const PERS='naam;email;afdeling;functie;groep\nWard Mertens;ward.mertens@demo.be;E&E;Manager;SPE\nWim Maes;Wim.Maes@demo.be;E&E;Engineer;SPE\nWim Maes;wim.maes@demo.be;PMO;PM;PMO\nAn Peeters;an.peeters@demo.be;PMO;PM;PMO\n';
const EXTRA='email;naam;organisatie;functie;type;actief\n;Kurt De Smet;Elia;Account manager;extern;ja\nx@poab.be;Lien Poab;PoAB;;extern;nee\n;Ivo Intern;PSA;Finance;intern;ja\n';
test('people: merge groups, extra keys, badges, codes with collisions',()=>{
 const P=C.buildPeople(C.parsePersonen(PERS),C.parsePersonenExtra(EXTRA));
 eq(P.list.length,6);const wim=P.byKey['wim.maes@demo.be'];eq(wim.badge,'SPE/PMO');
 eq(P.byKey['ext-elia-kurt-de-smet'].badge,'extern');eq(P.byKey['ext-psa-ivo-intern'].badge,'intern');
 eq(P.byKey['ward.mertens@demo.be'].code,'WM');eq(wim.code,'WMa');
 eq(C.searchPeople(P,'elia').map(p=>p.naam),['Kurt De Smet']);eq(C.searchPeople(P,'poab').length,0);eq(C.searchPeople(P,'poab',{inactive:true}).length,1);
 const round=C.parsePersonenExtra(C.serializePersonenExtra(C.parsePersonenExtra(EXTRA)));eq(round[0].key,'ext-elia-kurt-de-smet');eq(round[1].actief,false);
});
test('extra person key stays stable after a name change (sleutel column)',()=>{
 const l=C.parsePersonenExtra(EXTRA);l[0].naam='Kurt De Smet-Janssens';
 eq(C.parsePersonenExtra(C.serializePersonenExtra(l))[0].key,'ext-elia-kurt-de-smet');
});

/* ---------- config ---------- */
test('config: string topics become numbered, add/deactivate keeps numbers',()=>{
 const c=C.normalizeConfig({schema:1,vergadertypes:[{id:'t',naam:'T',projectgebonden:true,topics:['A','B','Varia']}]});
 eq(C.topicList(c,'t').map(x=>x.nr),[1,2,3]);const nr=C.addTopic(c,'t','Nieuw');eq(nr,4);
 C.typeOf(c,'t').topics[1].actief=false;eq(C.topicList(c,'t').map(x=>x.naam),['A','Varia','Nieuw']);eq(C.topicList(c,'t',true).length,4);
 eq(C.topicName(c,'t',2),'B');eq(C.topicNrByName(c,'t','3. Varia'),3);
 const id=C.addType(c,'Team overleg',false);eq(id,'team-overleg');eq(C.addType(c,'Team overleg',false),'team-overleg-2');
});
test('migration framework runs pending migrations in order',()=>{
 const list=[{from:1,to:2,run(ctx){ctx.cfg.x=(ctx.cfg.x||'')+'a'}},{from:2,to:3,run(ctx){ctx.cfg.x+='b';ctx.rewrite=true}}];
 const ctx={cfg:{schema:1}};const r=C.runMigrations(ctx,list);eq(ctx.cfg.x,'ab');eq(ctx.cfg.schema,3);eq(r.rewrite,true);
 eq(C.pendingMigrations({schema:3},list).length,0);eq(C.pendingMigrations({schema:1}).length,0);
});

/* ---------- meeting file ---------- */
const cfg=C.defaultConfig();
const acts={'A-GI22074-AP-007':{id:'A-GI22074-AP-007',actie:'Offerte Elia opvragen',eigenaar:'jan@demo.be',deadline:'2026-11-27',status:'Open',prioriteit:'Hoog'}};
function sample(){
 const m=C.newMeeting({id:'2026-11-13_ee-projectoverleg',datum:'2026-11-13',type:'ee-projectoverleg',titel:'E&E projectoverleg 13/11/2026',voorzitter:'ward.mertens@demo.be',notulist:'an.peeters@demo.be',
  aanwezig:['ward.mertens@demo.be','ext-elia-kurt-de-smet'],projecten:['GI22074','GI26057'],projectgebonden:true,user:'an.peeters@demo.be'});
 const s=m.secties.find(x=>x.key==='GI22074');
 s.blokken[1]=[{type:'Info',id:'',tekst:'Geen incidenten op de werf.'}];
 s.blokken[3]=[{type:'Beslissing',id:'B-20261113-AP-01',tekst:'PIF part 2 wordt ingediend na gunning kabelwerken.'},{type:'Actie',id:'A-GI22074-AP-007',tekst:'oud'},{type:'Info',id:'',tekst:'Regel 1\nRegel 2 met ## geen kop\n- geen nieuw item'}];
 m.secties.find(x=>x.key==='ALG').blokken[8]=[{type:'Info',id:'',tekst:'Kerstdrink 18/12.'}];
 return m;
}
const mctx={cfg,actie:id=>acts[id],projName:gi=>({GI22074:'HV connection ET and NZT to 150kV',GI26057:'EV capacity'})[gi],
 autoActions:(m,sec)=>sec==='GI22074'?[Object.assign({eigenaarNaam:'Jan Peeters'},acts['A-GI22074-AP-007'])]:[]};
test('meeting serialize: header, front matter, sections, topics by number, auto block',()=>{
 const t=C.serializeMeeting(sample(),mctx);
 assert(t.startsWith('<!-- PSA-MoM vergadering.'));
 assert(t.includes('\naanwezig: [ward.mertens@demo.be, ext-elia-kurt-de-smet]\n'));
 assert(t.includes('## GI22074 – HV connection ET and NZT to 150kV\n\n### 1. Veiligheid\n\n- [Info] Geen incidenten op de werf.'));
 assert(t.includes('- [Beslissing] B-20261113-AP-01: PIF part 2'));
 assert(t.includes('- [Actie] A-GI22074-AP-007: Offerte Elia opvragen'),'action text comes from the register');
 assert(t.includes('**Acties (automatisch)**\n\n- [ ] A-GI22074-AP-007 – Offerte Elia opvragen (Jan Peeters, deadline 27/11/2026) – Open'));
 assert(t.includes('## GI26057 – EV capacity'));assert(t.includes('## Algemeen\n\n### 8. Varia'));
 assert(t.indexOf('\n## GI26057')<t.indexOf('\n## Algemeen'),'project sections first for project-based meetings');
});
test('meeting parse round trip; auto block ignored; multi-line items',()=>{
 const m=sample();const t=C.serializeMeeting(m,mctx);const p=C.parseMeeting(t,{cfg});
 eq(p.id,m.id);eq(p.aanwezig,m.aanwezig);eq(p.projecten,['GI22074','GI26057']);eq(p.titel,'E&E projectoverleg 13/11/2026');
 const b=p.secties.find(s=>s.key==='GI22074').blokken;
 eq(b[3][0],{type:'Beslissing',id:'B-20261113-AP-01',tekst:'PIF part 2 wordt ingediend na gunning kabelwerken.'});
 eq(b[3][1],{type:'Actie',id:'A-GI22074-AP-007',tekst:'Offerte Elia opvragen'});
 eq(b[3][2].tekst,'Regel 1\nRegel 2 met ## geen kop\n- geen nieuw item');eq(b[3].length,3,'auto block lines are not items');
 eq(C.serializeMeeting(p,mctx),t,'stable on second write');
});
test('meeting parse tolerates hand edits',()=>{
 const t='---\nid: 2026-11-20_teammeeting\ndatum: 20/11/2026\naanwezig:\n  - a@x.be\n  - b@x.be\nonbekend: bewaard\n---\n## Algemeen\n### Varia\n- gewone bullet zonder type\nlosse tekstregel\n- [actie] Nieuwe actie zonder ID\n- [Decision] B-20261120-WM-01 – Engelse tag\n## GI24115 - Lift\n### 2. Planning\n- [Info] x\n';
 const m=C.parseMeeting(t,{cfg});
 eq(m.datum,'2026-11-20');eq(m.type,'teammeeting');eq(m.aanwezig,['a@x.be','b@x.be']);eq(m.extra.onbekend,'bewaard');
 const v=m.secties.find(s=>s.key==='ALG').blokken[5];
 eq(v.map(x=>x.type),['Info','Info','Actie','Beslissing']);eq(v[2].id,'');eq(v[3].id,'B-20261120-WM-01');eq(v[3].tekst,'Engelse tag');
 eq(m.projecten,['GI24115']);eq(m.secties[1].titel,'Lift');
});
test('general meeting: Algemeen first, project sections optional',()=>{
 const m=C.newMeeting({id:'x',datum:'2026-11-13',type:'teammeeting',projecten:['GI22074'],projectgebonden:false});
 eq(m.secties.map(s=>s.key),['ALG','GI22074']);
});
test('type gating blanks action-only fields for Beslissing and Info',()=>{
 const full={type:'Beslissing',id:'B-1',tekst:'t',eigenaar:'x',deadline:'2026-01-01',prioriteit:'Hoog',status:'Open'};
 eq(C.gateItem(full),{type:'Beslissing',id:'B-1',tekst:'t',eigenaar:'',deadline:'',prioriteit:'',status:''});
 eq(C.gateItem(Object.assign({},full,{type:'Info'})).id,'');
 eq(C.gateItem(Object.assign({},full,{type:'Actie'})).deadline,'2026-01-01');
 eq(C.gateItem({type:'Rubbish',tekst:'t'}).type,'Info');
});

/* ---------- IDs ---------- */
test('action IDs per user per register; decision IDs per date',()=>{
 const rows=[{id:'A-GI22074-AP-001'},{id:'A-GI22074-AP-007'},{id:'A-GI22074-WM-012'}];
 eq(C.nextActionId(rows,'GI22074','AP'),'A-GI22074-AP-008');eq(C.nextActionId(rows,'GI22074','WM'),'A-GI22074-WM-013');
 eq(C.nextActionId(rows,'GI22074','JP'),'A-GI22074-JP-001');eq(C.nextActionId([],C.ALG,'AP'),'A-ALG-AP-001');
 eq(C.nextActionId([{id:'A-TMP-kraan-AP-002'}],'TMP-kraan','AP'),'A-TMP-kraan-AP-003');
 eq(C.nextDecisionId(['B-20261113-AP-01','B-20261113-AP-02','B-20261112-AP-09'],'2026-11-13','AP'),'B-20261113-AP-03');
});

/* ---------- action workflow ---------- */
const o={user:'an@x.be',code:'AP',meeting:'2026-11-13_ee-projectoverleg'};
function act(){return C.newAction({id:'A-GI22074-AP-001',secKey:'GI22074',meeting:o.meeting,datum:'2026-11-13',topic:'ee-projectoverleg:3',actie:'Offerte',eigenaar:'jan@x.be',deadline:'2026-11-27',user:o.user,code:'AP'})}
test('action workflow: shift deadline needs reason, close needs closing decision, reopen keeps history',()=>{
 const a=act();eq(a.status,'Open');assert(a.verloop.startsWith('2026-11-13: aangemaakt (AP, vergadering 2026-11-13_ee-projectoverleg)'));
 assert(C.shiftDeadline(a,'2026-12-11','',o));eq(a.deadline,'2026-11-27');
 eq(C.shiftDeadline(a,'11/12/2026','wacht op Elia',o),'');eq(a.deadline,'2026-12-11');assert(a.verloop.includes('deadline 27/11/2026 → 11/12/2026 – reden: wacht op Elia'));
 assert(C.closeAction(a,{afsluiting:''},o));eq(a.status,'Open');
 eq(C.closeAction(a,{afsluiting:'Zie B-20261113-AP-01',datum:'2026-11-13'},o),'');eq(a.status,'Afgesloten');eq(a.afgesloten_op,'2026-11-13');
 assert(C.reopenAction(a,'',o));eq(C.reopenAction(a,'toch nodig',o),'');eq(a.status,'Open');eq(a.afsluiting,'');
 assert(a.verloop.includes('heropend – reden: toch nodig (was Afgesloten op 13/11/2026: Zie B-20261113-AP-01)'));
 eq(C.verloopEntries(a.verloop).length,4);assert(C.verloopMentions(a,o.meeting));
 assert(C.setActionStatus(a,'Afgesloten',o));eq(C.setActionStatus(a,'Geblokkeerd',o),'');eq(a.status,'Geblokkeerd');
});
test('overdue: open and deadline in the past only',()=>{
 eq(C.isOverdue({status:'Open',deadline:'2026-11-12'}),true);eq(C.isOverdue({status:'Open',deadline:'2026-11-13'}),false);
 eq(C.isOverdue({status:'Afgesloten',deadline:'2026-01-01'}),false);eq(C.isOverdue({status:'Open',deadline:''}),false);
});
test('register round trip normalises Excel-edited dates and status case',()=>{
 const a=act();const t=C.serializeRegister([a]);eq(C.parseRegister(t),[a]);
 const edited=t.replace('"2026-11-27"','"27/11/2026"').replace('"Open"','"open"');eq(C.parseRegister(edited)[0].deadline,'2026-11-27');eq(C.parseRegister(edited)[0].status,'Open');
});

/* ---------- row-level merge ---------- */
function r(id,f){return Object.assign({},...C.ACT_COLS.map(c=>({[c]:''})),{id,actie:'x',status:'Open',gewijzigd_op:'2026-11-13T09:00:00'},f||{})}
test('merge: only-remote change -> remote, only-local -> local, new rows from both kept',()=>{
 const base=[r('A1'),r('A2')];
 const local=[r('A1',{actie:'lokaal',gewijzigd_op:'2026-11-13T10:00:00'}),r('A2'),r('A3',{actie:'nieuw lokaal'})];
 const remote=[r('A1'),r('A2',{status:'In uitvoering',gewijzigd_op:'2026-11-13T10:05:00'}),r('A4',{actie:'nieuw remote'})];
 const m=C.mergeRows(base,local,remote);
 eq(m.conflicts,[]);eq(m.rows.map(x=>x.id),['A1','A2','A4','A3']);
 eq(m.rows[0].actie,'lokaal');eq(m.rows[1].status,'In uitvoering');
});
test('merge: both sides changed different fields -> automatic field merge, verloop union',()=>{
 const base=[r('A1',{verloop:'2026-11-01: aangemaakt'})];
 const local=[r('A1',{deadline:'2026-12-01',verloop:'2026-11-01: aangemaakt || 2026-11-13: deadline verschoven',gewijzigd_op:'2026-11-13T10:00:00'})];
 const remote=[r('A1',{status:'Geblokkeerd',verloop:'2026-11-01: aangemaakt || 2026-11-12: status Open → Geblokkeerd',gewijzigd_op:'2026-11-13T09:30:00'})];
 const m=C.mergeRows(base,local,remote);eq(m.conflicts,[]);
 eq(m.rows[0].deadline,'2026-12-01');eq(m.rows[0].status,'Geblokkeerd');
 eq(m.rows[0].verloop,'2026-11-01: aangemaakt || 2026-11-12: status Open → Geblokkeerd || 2026-11-13: deadline verschoven');
 eq(m.rows[0].gewijzigd_op,'2026-11-13T10:00:00');
});
test('merge: same field changed on both sides -> conflict, default = most recent gewijzigd_op, resolvable',()=>{
 const base=[r('A1')];
 const local=[r('A1',{deadline:'2026-12-01',gewijzigd_op:'2026-11-13T10:00:00'})];
 const remote=[r('A1',{deadline:'2026-12-15',gewijzigd_op:'2026-11-13T10:30:00'})];
 const m=C.mergeRows(base,local,remote);eq(m.conflicts.length,1);eq(m.conflicts[0].fields,['deadline']);eq(m.conflicts[0].choice,'remote');
 eq(m.rows[0].deadline,'2026-12-15');m.conflicts[0].choice='local';C.resolveRows(m.rows,m.conflicts);eq(m.rows[0].deadline,'2026-12-01');
});
test('merge: deletions and id collision renumbering',()=>{
 const base=[r('A1'),r('A2')];
 const m=C.mergeRows(base,[r('A1')],[r('A1'),r('A2')]);eq(m.rows.map(x=>x.id),['A1'],'local deletion of unchanged row');
 const m2=C.mergeRows(base,[r('A1'),r('A2')],[r('A1')]);eq(m2.rows.map(x=>x.id),['A1'],'remote deletion of unchanged row');
 const m3=C.mergeRows(base,[r('A1'),r('A2',{actie:'gewijzigd'})],[r('A1')]);eq(m3.rows.map(x=>x.id),['A1','A2']);eq(m3.conflicts[0].kind,'verwijderd');
 const m4=C.mergeRows([],[r('A-GI1-AP-001',{actie:'mijn'})],[r('A-GI1-AP-001',{actie:'andere pc'})],{renumber:()=> 'A-GI1-AP-002'});
 eq(m4.rows.map(x=>x.id+':'+x.actie),['A-GI1-AP-001:andere pc','A-GI1-AP-002:mijn']);eq(m4.renames,[{from:'A-GI1-AP-001',to:'A-GI1-AP-002'}]);
});
test('merge 2-way (conflict copy, base=null): union of rows, differences as conflicts',()=>{
 const a=[r('A1'),r('A2',{actie:'v1'})],b=[r('A1'),r('A2',{actie:'v2',gewijzigd_op:'2026-11-13T11:00:00'}),r('A3')];
 const m=C.mergeRows(null,a,b);eq(m.rows.map(x=>x.id),['A1','A2','A3']);eq(m.conflicts.length,1);eq(m.conflicts[0].choice,'remote');
});
test('merge 2-way uses the verloop history: one-sided logged changes merge without dialog',()=>{
 const a=[r('A2',{eigenaar:'sofie',deadline:'2026-11-12',verloop:'2026-10-16: aangemaakt || 2026-11-12: eigenaar → Sofie (AC)',gewijzigd_op:'2026-11-12T17:30:00'})];
 const b=[r('A2',{eigenaar:'wim',deadline:'2026-11-20',verloop:'2026-10-16: aangemaakt || 2026-11-12: deadline 12/11/2026 → 20/11/2026 – reden: x (JP)',gewijzigd_op:'2026-11-12T16:05:00'})];
 const m=C.mergeRows(null,a,b);eq(m.conflicts,[]);eq(m.rows[0].eigenaar,'sofie');eq(m.rows[0].deadline,'2026-11-20');eq(C.verloopEntries(m.rows[0].verloop).length,3);
 const c=[r('A2',{eigenaar:'wim',deadline:'2026-11-27',verloop:'2026-10-16: aangemaakt || 2026-11-13: deadline 12/11/2026 → 27/11/2026 – reden: y (AC)'})];
 eq(C.mergeRows(null,c,b).conflicts[0].fields,['deadline'],'both sides logged a deadline change -> dialog');
 eq(C.mergeRows(null,[r('A3',{actie:'x1'})],[r('A3',{actie:'x2'})]).conflicts.length,1,'unlogged difference -> dialog');
});
test('people search ranks first-name and word-start matches first',()=>{
 const P=C.buildPeople(C.parsePersonen('naam;email;afdeling;functie;groep\nEls Janssens;els@x.be;;;SPE\nJan Peeters;jan@x.be;;;SPE\n'),[]);
 eq(C.searchPeople(P,'jan').map(p=>p.naam),['Jan Peeters','Els Janssens']);
});
test('meeting merge: different blocks merge silently, same block -> conflict (default both)',()=>{
 const base=C.parseMeeting(C.serializeMeeting(sample(),mctx),{cfg});
 const local=C.parseMeeting(C.serializeMeeting(sample(),mctx),{cfg}),remote=C.parseMeeting(C.serializeMeeting(sample(),mctx),{cfg});
 local.secties[0].blokken[2]=[{type:'Info',id:'',tekst:'lokaal planning'}];
 remote.secties[0].blokken[7]=[{type:'Info',id:'',tekst:'remote risico'}];remote.aanwezig.push('nieuw@x.be');local.titel='Nieuwe titel';
 let x=C.mergeMeeting(base,local,remote);eq(x.conflicts,[]);
 eq(x.meeting.secties[0].blokken[2][0].tekst,'lokaal planning');eq(x.meeting.secties[0].blokken[7][0].tekst,'remote risico');
 assert(x.meeting.aanwezig.includes('nieuw@x.be'));eq(x.meeting.titel,'Nieuwe titel');
 local.secties[0].blokken[1]=[{type:'Info',id:'',tekst:'lokaal veiligheid'}];remote.secties[0].blokken[1]=[{type:'Info',id:'',tekst:'remote veiligheid'}];
 x=C.mergeMeeting(base,local,remote);eq(x.conflicts.length,1);eq(x.conflicts[0].kind,'blok');eq(x.meeting.secties[0].blokken[1].map(i=>i.tekst),['lokaal veiligheid','remote veiligheid']);
 x.conflicts[0].choice='remote';C.resolveMeeting(x.meeting,x.conflicts);eq(x.meeting.secties[0].blokken[1].map(i=>i.tekst),['remote veiligheid']);
});
test('meeting merge: attendee removed locally stays removed; project section added remotely appears',()=>{
 const base=sample(),local=sample(),remote=sample();
 local.aanwezig=local.aanwezig.filter(x=>x!=='ext-elia-kurt-de-smet');
 remote.projecten.push('GI24115');remote.secties.push({key:'GI24115',titel:'Lift',blokken:{2:[{type:'Info',id:'',tekst:'x'}]}});
 const x=C.mergeMeeting(base,local,remote);eq(x.meeting.aanwezig,['ward.mertens@demo.be']);eq(x.meeting.projecten,['GI22074','GI26057','GI24115']);
 assert(x.meeting.secties.some(s=>s.key==='GI24115'));
});

/* ---------- conflict copies & locks ---------- */
test('OneDrive conflict copy detection',()=>{
 const names=new Set(['GI22074.csv','_algemeen.csv','2026-11-13_ee-projectoverleg.md','2026-11-13_ee-projectoverleg-2.md']);
 eq(C.conflictOriginal('GI22074-LAPTOP-AB12.csv',names),'GI22074.csv');eq(C.conflictOriginal('GI22074 (1).csv',names),'GI22074.csv');
 eq(C.conflictOriginal('GI22074-PC01-2.csv',names),'GI22074.csv');eq(C.conflictOriginal('GI26057.csv',names),null);
 eq(C.meetingCopyOriginal('2026-11-13_ee-projectoverleg-2.md','2026-11-13_ee-projectoverleg-2',names),null,'legit -2 meeting');
 eq(C.meetingCopyOriginal('2026-11-13_ee-projectoverleg-WMPC.md','2026-11-13_ee-projectoverleg',names),'2026-11-13_ee-projectoverleg.md');
 eq(C.registerCopyOriginal('GI22074-PC.csv',[{gi_code:'GI22074'}],names),'GI22074.csv');
 eq(C.registerCopyOriginal('_algemeen-PC.csv',[{gi_code:''}],names),'_algemeen.csv');
 assert(C.isRegisterName('GI22074.csv')&&C.isRegisterName('TMP-kraan-q5.csv')&&!C.isRegisterName('GI22074-PC.csv'));
});
test('soft lock expires after 2 hours, refresh extends',()=>{
 const l=C.makeLock('jan@x.be','Jan');
 eq(C.lockState(l,'an@x.be',2).active,true);eq(C.lockState(l,'jan@x.be',2).own,true);
 eq(C.lockState(l,'an@x.be',2,new Date('2026-11-13T12:43:00')).active,false);eq(C.lockState('',null).active,false);eq(C.lockState('{bad',null).active,false);
 eq(C.lockName('2026-11-13_ee-projectoverleg.md'),'.2026-11-13_ee-projectoverleg.md.lock');
});

/* ---------- domain helpers ---------- */
test('previous meeting/topic of the same type',()=>{
 const a=sample();const b=C.newMeeting({id:'2026-11-20_ee-projectoverleg',datum:'2026-11-20',type:'ee-projectoverleg',projecten:['GI22074'],projectgebonden:true});
 const t=C.newMeeting({id:'2026-11-19_teammeeting',datum:'2026-11-19',type:'teammeeting',projectgebonden:false});
 eq(C.previousMeeting([a,b,t],b).id,a.id);eq(C.previousTopic([a,b,t],b,'GI22074',1).items[0].tekst,'Geen incidenten op de werf.');
 eq(C.previousTopic([a,b,t],b,'GI22074',2),null);eq(C.previousMeeting([a,b,t],a),null);
});
test('validate Definitief: attendee + action owner/deadline',()=>{
 const m=sample();eq(C.validateDefinitief(m,id=>acts[id]),[]);
 m.aanwezig=[];m.secties[0].blokken[2]=[{type:'Actie',id:'',tekst:'zonder register'}];
 const e=C.validateDefinitief(m,id=>acts[id]);eq(e.length,2);
 const a2={id:'A-X-AP-001',actie:'x',eigenaar:'',deadline:''};m.aanwezig=['x'];m.secties[0].blokken[2]=[{type:'Actie',id:'A-X-AP-001',tekst:''}];
 eq(C.validateDefinitief(m,id=>id==='A-X-AP-001'?a2:acts[id]).length,2);
});
test('action filters',()=>{
 const a=act();a.deadline='2026-11-01';
 assert(C.matchAction(a,{overdue:true}));assert(C.matchAction(a,{type:'ee-projectoverleg',project:'GI22074',status:'open',eigenaar:'jan@x.be'}));
 assert(!C.matchAction(a,{status:'gesloten'}));assert(C.matchAction(a,{q:'offerte gi22074'}));assert(!C.matchAction(a,{van:'2026-11-14'}));
});
test('paste-and-split: headings map to project topics, line prefixes set the item type',()=>{
 const mt=C.topicMatchers(cfg,'ee-projectoverleg');
 const txt='Veiligheid\n- Geen incidenten\nBudget:\n- Actie: offerte Elia opvragen\n  - voor einde maand\n- Beslissing: PIF part 2 na gunning\nVergunningen\n• omgevingsvergunning ingediend\nlosse regel';
 const b=C.splitBlocks(txt,mt);eq(b.map(x=>x.nr),[1,3,6]);
 const it=C.blockItems(b[1].lines);eq(it.map(x=>x.type),['Actie','Beslissing']);eq(it[0].tekst,'offerte Elia opvragen\n- voor einde maand');
 eq(C.blockItems(b[2].lines).length,2);
 eq(C.splitBlocks('zomaar tekst',mt)[0].nr,null);
});

/* ---------- exports & MoM ---------- */
test('exports: flat rows, ⏎ for line breaks, overdue flag, names denormalised, gating',()=>{
 const P=C.buildPeople(C.parsePersonen(PERS),C.parsePersonenExtra(EXTRA));
 const a=Object.assign(act(),{id:'A-GI22074-AP-007',actie:'Offerte\nElia',eigenaar:'ward.mertens@demo.be',deadline:'2026-11-01'});
 const x=C.buildExports({cfg,meetings:[sample()],actions:[a],people:P,projName:gi=>gi==='GI22074'?'HV':gi,projPm:()=> 'An Peeters'});
 const min=C.parseCsv(x['minuten.csv']);
 eq(min.length,5);const ac=min.find(z=>z.type==='Actie');eq(ac.tekst,'Offerte⏎Elia');eq(ac.eigenaar_naam,'Ward Mertens');eq(ac.status,'Open');
 const dec=min.find(z=>z.type==='Beslissing');eq([dec.eigenaar,dec.deadline,dec.status],['','','']);eq(dec.projectnaam,'HV');eq(dec.topic,'Budget & PIF');
 assert(min.every(z=>!/\n/.test(z.tekst)));
 const ae=C.parseCsv(x['acties.csv'])[0];eq(ae.achterstallig,'ja');eq(ae.pm_naam,'An Peeters');eq(ae.vergadertype,'ee-projectoverleg');eq(ae.topic_naam,'Budget & PIF');
 const v=C.parseCsv(x['vergaderingen.csv'])[0];eq(v.aantal_beslissingen,'1');eq(v.aanwezig_namen,'Ward Mertens, Kurt De Smet');
 eq(C.unflat('a⏎b'),'a\nb');
});
test('MoM renderers: md, e-mail text, print HTML share one model',()=>{
 const P=C.buildPeople(C.parsePersonen(PERS),C.parsePersonenExtra(EXTRA));
 const model=C.momModel(sample(),Object.assign({people:P},mctx));
 eq(model.secties.map(s=>s.kop),['GI22074 – HV connection ET and NZT to 150kV','GI26057 – EV capacity','Algemeen']);
 const md=C.renderMomMd(model),tx=C.renderMomText(model),ht=C.renderMomHtml(model);
 assert(md.includes('| Aanwezig | Ward Mertens, Kurt De Smet |'));assert(md.includes('## Actielijst'));
 assert(tx.includes('GI22074 – HV CONNECTION ET AND NZT TO 150KV'));assert(tx.includes('• [Actie] A-GI22074-AP-007: Offerte Elia opvragen (jan@demo.be, 27/11/2026)'));
 assert(ht.includes('<h2>Algemeen</h2>'));assert(!ht.includes('<script'));
});
test('project dossier contains budget lines, decisions, actions and timeline',()=>{
 const r=C.parseProjectsCsv(PROJ_INTERNAL);const P=C.buildPeople([],[]);
 const md=C.projectDossierMd('GI22074',{cfg,people:P,meetings:[sample()],actions:[Object.assign(act(),{id:'A-GI22074-AP-007'})],projInfo:gi=>r.byGi[gi]});
 assert(md.includes('# Projectdossier GI22074 – HV connection ET and NZT to 150kV'));assert(md.includes('| HV connection ET and NZT to 150kV_part1 | 2024 |'));
 assert(md.includes('B-20261113-AP-01'));assert(md.includes('| A-GI22074-AP-007 | Offerte |'));assert(md.includes('### 13/11/2026'));
});

console.log(`test.js: ${pass} geslaagd, ${fail} mislukt`);
if(fail){fails.forEach(f=>console.log('  ✗ '+f));process.exit(1)}
