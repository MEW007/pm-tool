/* PSA-MoM viewer (phase 2): read-only SharePoint HTML page in the style of the Project Status Dashboard.
   Sandbox rules: everything inline, no fetch, no storage, links open in a new tab, refresh = page reload.
   Data arrives ONLY through the ka-livedata-manifest mechanism (window.__LD_RESULTS__). */
'use strict';
const V={proj:null,verg:[],min:[],acts:[],src:{},tab:'acties',problem:'',
 f:{q:'',eigenaar:'',pm:'',project:'',status:'open',type:''},gi:'',mid:'',mq:''};

/* ------------------------------------------------------------------
   readLiveData: the ONLY function that knows the manifest result format.
   - the SharePoint list (format "rows": {headers, rows}) as in the Project Status Dashboard
   - the three _export CSV files: content as CSV text, or as {headers, rows}
   Each CSV is recognised by its columns (not by the manifest key), so the key names do not matter.
   When the official CSV manifest syntax is known, only this function may need an update.
   ------------------------------------------------------------------ */
function readLiveData(results){
 const out={list:null,csv:{},keys:[]};if(!results||typeof results!=='object')return out;
 Object.keys(results).forEach(k=>{
  const r=results[k];if(!r||r.content==null)return;out.keys.push(k);let c=r.content;
  if(typeof c==='string'&&/^\s*[{[]/.test(c)){try{c=JSON.parse(c)}catch(e){}}
  if(r.format==='rows'&&c&&c.headers&&(c.rows||[]).length&&!c.headers.some(x=>/^(vergadering_id|aantal_beslissingen|achterstallig)$/i.test(String(x).trim()))){out.list=out.list||c;return}
  let objs=null;
  if(typeof c==='string')objs=parseCsv(c);
  else if(c&&Array.isArray(c.headers))objs=(c.rows||[]).map(row=>{const o={};c.headers.forEach((hd,i)=>o[String(hd).replace(/^﻿/,'').trim()]=row[i]==null?'':String(row[i]));return o});
  else if(Array.isArray(c))objs=c;
  if(!objs)return;
  const cols=new Set(Object.keys(objs[0]||{}));
  const kind=cols.has('topic_nr')?'minuten':cols.has('aantal_beslissingen')?'vergaderingen':cols.has('achterstallig')?'acties':
   (/minuten/i.test(k)?'minuten':/vergader/i.test(k)?'vergaderingen':/actie/i.test(k)?'acties':null);
  if(kind)out.csv[kind]=objs;
 });
 return out;
}
function loadData(){
 try{
  const d=readLiveData(typeof window!=='undefined'?window.__LD_RESULTS__:null);
  V.proj=d.list?parseProjectTable(d.list.headers||[],d.list.rows||[]):null;
  const un=o=>{Object.keys(o).forEach(k=>o[k]=unflat(o[k]));return o};
  V.verg=(d.csv.vergaderingen||[]).map(un);V.min=(d.csv.minuten||[]).map(un);V.acts=(d.csv.acties||[]).map(un);
  V.src={list:!!d.list,vergaderingen:!!d.csv.vergaderingen,minuten:!!d.csv.minuten,acties:!!d.csv.acties};
 }catch(e){V.problem=e&&e.message||String(e)}
}
const late=a=>ACT_OPEN.includes(a.status)&&a.deadline&&a.deadline<today();
const pname=gi=>gi?((V.proj&&V.proj.byGi[gi]&&V.proj.byGi[gi].naam)||(V.min.find(m=>m.gi_code===gi)||{}).projectnaam||gi):'Algemeen';
const vopts=(arr,sel,all)=>`<option value="">${h(all)}</option>`+arr.map(([v,l])=>`<option value="${h(v)}"${v===sel?' selected':''}>${h(l)}</option>`).join('');
const pill=s=>s?`<span class="status-pill ${statusClass(s)}">${h(s)}</span>`:'';
const typeTag=t=>t==='Info'?'':`<span class="ty ty-${h(t)}">${h(t)}</span> `;

function sourceLine(){
 const n=k=>V.src[k]?'●':'○';
 const all=V.src.list&&V.src.vergaderingen&&V.src.minuten&&V.src.acties;
 return`<p class="source ${all?'live':'snapshot'}">${all?'● Live data':'⚠ Niet alle data werd door SharePoint aangeleverd'}${V.problem?' ('+h(V.problem)+')':''}: ${n('list')} projectlijst${V.proj?` (${V.proj.rows.length} rijen)`:''} · ${n('vergaderingen')} vergaderingen (${V.verg.length}) · ${n('minuten')} minuten (${V.min.length}) · ${n('acties')} acties (${V.acts.length}) · geladen ${new Date().toLocaleTimeString('nl-BE')} (vernieuw de pagina om te herladen)</p>`;
}
function actTableV(list){
 if(!list.length)return'<div class="empty">Geen acties voor deze selectie</div>';
 return`<div class="table-wrap"><table><thead><tr><th style="width:12%">ID</th><th style="width:18%">Project</th><th>Actie</th><th style="width:11%">Eigenaar</th><th style="width:8%">Deadline</th><th style="width:9%">Status</th><th style="width:9%">Vergadering</th></tr></thead><tbody>`+
 list.map(a=>`<tr class="${late(a)?'late':''}"><td class="nowrap">${h(a.id)}</td><td>${a.gi_code?`<a href="#" data-gi="${h(a.gi_code)}">${h(a.gi_code)}</a> ${h(a.projectnaam)}`:'<span class="muted">Algemeen</span>'}</td><td>${h(a.actie)}${a.afsluiting?`<div class="muted">→ ${h(a.afsluiting)}</div>`:''}</td><td>${h(a.eigenaar_naam||a.eigenaar)}</td><td class="nowrap">${fmt(a.deadline)}${late(a)?' ⚠':''}</td><td>${h(a.status)}</td><td class="nowrap">${a.vergadering?`<a href="#" data-mid="${h(a.vergadering)}">${fmt(a.datum_geidentificeerd)}</a>`:fmt(a.datum_geidentificeerd)}</td></tr>`).join('')+`</tbody></table></div>`;
}
function viewActies(){
 const f=V.f;const owners=[...new Set(V.acts.map(a=>a.eigenaar_naam||a.eigenaar).filter(Boolean))].sort();const pms=[...new Set(V.acts.map(a=>a.pm_naam).filter(Boolean))].sort();
 const projs=[...new Set(V.acts.map(a=>a.gi_code))].sort();
 const list=V.acts.filter(a=>{
  if(f.eigenaar&&(a.eigenaar_naam||a.eigenaar)!==f.eigenaar)return false;if(f.pm&&a.pm_naam!==f.pm)return false;
  if(f.project&&(a.gi_code||'ALG')!==f.project)return false;
  if(f.status==='open'&&!ACT_OPEN.includes(a.status))return false;if(f.status==='late'&&!late(a))return false;if(f.status==='gesloten'&&ACT_OPEN.includes(a.status))return false;
  if(f.q&&!matchQuery(fold([a.id,a.actie,a.afsluiting,a.gi_code,a.projectnaam,a.eigenaar_naam,a.pm_naam].join(' ')),f.q))return false;return true;
 }).sort((a,b)=>(a.deadline||'9').localeCompare(b.deadline||'9'));
 const open=V.acts.filter(a=>ACT_OPEN.includes(a.status));
 return`<section class="card filters"><div class="field"><label>Eigenaar</label><select data-v="eigenaar">${vopts(owners.map(x=>[x,x]),f.eigenaar,'Alle eigenaars')}</select></div>
 <div class="field"><label>PM</label><select data-v="pm">${vopts(pms.map(x=>[x,x]),f.pm,'Alle PM\'s')}</select></div>
 <div class="field"><label>Project</label><select data-v="project">${vopts(projs.map(g=>[g||'ALG',g?g+' – '+pname(g):'Algemeen']),f.project,'Alle projecten')}</select></div>
 <div class="field"><label>Status</label><select data-v="status">${[['open','Open'],['late','Achterstallig'],['gesloten','Afgesloten'],['','Alle']].map(([v,l])=>`<option value="${v}"${f.status===v?' selected':''}>${l}</option>`).join('')}</select></div>
 <div class="field search"><label>Zoeken</label><input type="search" data-v="q" value="${h(f.q)}" placeholder="Actie, ID, project, eigenaar…"></div></section>
 <section class="kpis"><article class="card kpi"><div class="kpi-label">Open acties</div><div class="kpi-value">${open.length}</div></article><article class="card kpi"><div class="kpi-label">Achterstallig</div><div class="kpi-value bad">${open.filter(late).length}</div></article><article class="card kpi"><div class="kpi-label">Getoond</div><div class="kpi-value">${list.length}</div></article></section>
 <section class="card section"><h2>Acties</h2>${actTableV(list)}</section>`;
}
function projectList(){
 const g=new Set([...V.min.map(m=>m.gi_code),...V.acts.map(a=>a.gi_code)].filter(Boolean));
 return[...g].sort().map(x=>[x,x+' – '+pname(x)]);
}
function viewProject(){
 const gi=V.gi;const p=V.proj&&V.proj.byGi[gi];
 const sel=`<section class="card filters"><div class="field search"><label>Project</label><select data-sel="gi">${vopts(projectList(),gi,'Kies een project…')}</select></div></section>`;
 if(!gi)return sel+'<div class="empty">Kies een project om de tijdlijn, beslissingen en open acties te zien.</div>';
 const min=V.min.filter(m=>m.gi_code===gi).sort((a,b)=>b.datum.localeCompare(a.datum)||(+a.volgorde)-(+b.volgorde));
 const acts=V.acts.filter(a=>a.gi_code===gi&&ACT_OPEN.includes(a.status)).sort((a,b)=>(a.deadline||'9').localeCompare(b.deadline||'9'));
 const dec=min.filter(m=>m.type==='Beslissing');
 let tl='',cur='';min.forEach(m=>{if(m.vergadering_id!==cur){if(cur)tl+='</ul>';cur=m.vergadering_id;const v=V.verg.find(x=>x.id===cur)||{};tl+=`<h3>${fmt(m.datum)} – <a href="#" data-mid="${h(cur)}">${h(v.titel||cur)}</a></h3><ul>`}
  tl+=`<li><span class="muted">${h(m.topic)}</span> · ${typeTag(m.type)}${m.id?`<b>${h(m.id)}</b>: `:''}${h(m.tekst).replace(/\n/g,'<br>')}${m.type==='Actie'?` <span class="muted">(${h(m.eigenaar_naam)}, ${fmt(m.deadline)}, ${h(m.status)})</span>`:''}</li>`});if(cur)tl+='</ul>';
 return sel+`<section class="card section"><h2>${h(gi)} – ${h(pname(gi))}</h2>${p?`<div class="table-wrap"><table><thead><tr><th>Budgetlijn</th><th>Jaar</th><th>Status</th><th>PM</th><th class="num">Budget</th><th class="num">PIF</th><th>PRJ</th><th>DMND</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td>${h(r.omschrijving)}</td><td>${h(r.year)}</td><td>${pill(r.status)}</td><td>${h(r.pmNaam)}</td><td class="num">${hasMoney(r.budgetRaw)?formatEuro(r.budget):'—'}</td><td class="num">${hasMoney(r.pifRaw)?formatEuro(r.pif):'—'}</td><td>${h(r.prj)}</td><td>${h(r.dmnd)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Niet gevonden in de projectlijst.</p>'}</section>
 <section class="card section"><h2>Open acties (${acts.length})</h2>${actTableV(acts)}</section>
 <section class="card section"><h2>Beslissingen (${dec.length})</h2>${dec.length?`<ul>${dec.map(m=>`<li>${fmt(m.datum)} – <b>${h(m.id)}</b>: ${h(m.tekst)}</li>`).join('')}</ul>`:'<div class="empty">Geen beslissingen</div>'}</section>
 <section class="card section"><h2>Tijdlijn</h2>${tl||'<div class="empty">Nog geen notulen</div>'}</section>`;
}
function viewMeetings(){
 if(V.mid)return viewMom(V.mid);
 const types=[...new Set(V.verg.map(v=>v.vergadertype_naam))].sort();
 const list=V.verg.filter(v=>(!V.f.type||v.vergadertype_naam===V.f.type)&&(!V.mq||matchQuery(fold([v.titel,v.projecten,v.aanwezig_namen].join(' ')),V.mq))).sort((a,b)=>b.datum.localeCompare(a.datum));
 return`<section class="card filters"><div class="field"><label>Type</label><select data-v="type">${vopts(types.map(x=>[x,x]),V.f.type,'Alle types')}</select></div><div class="field search"><label>Zoeken</label><input type="search" data-mq="1" value="${h(V.mq)}" placeholder="Titel, project, deelnemer…"></div></section>
 <section class="card section"><h2>Vergaderingen (${list.length})</h2>${list.length?`<div class="table-wrap"><table><thead><tr><th style="width:9%">Datum</th><th style="width:15%">Type</th><th>Titel</th><th>Projecten</th><th style="width:8%">Status</th><th style="width:7%">Besl.</th><th style="width:7%">Acties</th></tr></thead><tbody>${list.map(v=>`<tr class="click" data-mid="${h(v.id)}"><td>${fmt(v.datum)}</td><td>${h(v.vergadertype_naam)}</td><td><a href="#" data-mid="${h(v.id)}">${h(v.titel)}</a></td><td>${h(v.projecten)}</td><td>${h(v.status)}</td><td>${h(v.aantal_beslissingen)}</td><td>${h(v.aantal_acties)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Geen vergaderingen</div>'}</section>`;
}
function viewMom(mid){
 const v=V.verg.find(x=>x.id===mid)||{id:mid,titel:mid};const rows=V.min.filter(m=>m.vergadering_id===mid).sort((a,b)=>(+a.volgorde)-(+b.volgorde));
 const secs=[];rows.forEach(m=>{const k=m.gi_code||'';let s=secs.find(x=>x.k===k);if(!s)secs.push(s={k,topics:[]});let t=s.topics.find(x=>x.nr===m.topic_nr);if(!t)s.topics.push(t={nr:m.topic_nr,naam:m.topic,items:[]});t.items.push(m)});
 const acts=V.acts.filter(a=>a.vergadering===mid||String(a.verloop||'').includes('vergadering '+mid+')'));
 return`<p><a href="#" data-back="1">← Alle vergaderingen</a></p><article class="card section mom"><h2>${h(v.titel)}</h2><table class="mh"><tbody><tr><th>Datum</th><td>${fmt(v.datum)}</td><th>Type</th><td>${h(v.vergadertype_naam||'')}</td><th>Status</th><td>${h(v.status||'')}</td></tr><tr><th>Voorzitter</th><td>${h(v.voorzitter_naam||'')}</td><th>Notulist</th><td colspan="3">${h(v.notulist_naam||'')}</td></tr><tr><th>Aanwezig</th><td colspan="5">${h(v.aanwezig_namen||'')}</td></tr>${v.verontschuldigd_namen?`<tr><th>Verontschuldigd</th><td colspan="5">${h(v.verontschuldigd_namen)}</td></tr>`:''}</tbody></table>`+
 secs.map(s=>`<h3 class="sec">${s.k?`<a href="#" data-gi="${h(s.k)}">${h(s.k)}</a> – ${h(pname(s.k))}`:'Algemeen'}</h3>`+s.topics.map(t=>`<h4>${h(t.nr)}. ${h(t.naam)}</h4><ul>${t.items.map(m=>`<li>${typeTag(m.type)}${m.id?`<b>${h(m.id)}</b>: `:''}${h(m.tekst).replace(/\n/g,'<br>')}${m.type==='Actie'?` <i>(${h(m.eigenaar_naam)}, ${fmt(m.deadline)})</i>`:''}</li>`).join('')}</ul>`).join('')).join('')+
 (acts.length?`<h3 class="sec">Acties (aangemaakt of opgevolgd in deze vergadering)</h3>${actTableV(acts)}`:'')+`</article>`;
}
function renderV(){
 const el=document.getElementById('app');if(!el)return;
 const tabs=[['acties','Acties'],['project','Per project'],['vergaderingen','Per vergadering']];
 const body=V.tab==='project'?viewProject():V.tab==='vergaderingen'?viewMeetings():viewActies();
 const foc=document.activeElement&&document.activeElement.dataset?Object.assign({},document.activeElement.dataset):null;
 el.innerHTML=`<header><h1>PSA-MoM – notulen &amp; acties <span class="ver">viewer v${APP_VERSION}</span></h1><p class="subtitle">Alleen-lezen overzicht van vergaderingen, beslissingen en acties van SPE Engineering en PMO. Bewerken gebeurt in de PSA-MoM-editor in de documentbibliotheek.</p>${sourceLine()}</header>
 <nav class="vtabs">${tabs.map(([k,l])=>`<button type="button" class="${V.tab===k?'on':''}" data-tab="${k}">${l}</button>`).join('')}</nav>${body}`;
 if(foc&&(foc.v==='q'||foc.mq)){const i=el.querySelector(foc.mq?'[data-mq]':'[data-v="q"]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}}
}
function wire(){
 const el=document.getElementById('app');
 el.addEventListener('click',e=>{const t=e.target.closest('[data-tab],[data-gi],[data-mid],[data-back]');if(!t)return;
  if(t.tagName==='A')e.preventDefault();
  if(t.dataset.tab){V.tab=t.dataset.tab;V.mid=''}else if(t.dataset.gi){V.tab='project';V.gi=t.dataset.gi}else if(t.dataset.mid){V.tab='vergaderingen';V.mid=t.dataset.mid}else if(t.dataset.back)V.mid='';
  renderV();if(window.scrollTo)window.scrollTo(0,0)});
 el.addEventListener('input',e=>{const t=e.target;if(t.dataset.v==='q'){V.f.q=t.value;renderV()}if(t.dataset.mq){V.mq=t.value;renderV()}});
 el.addEventListener('change',e=>{const t=e.target;if(t.dataset.v&&t.dataset.v!=='q'){V.f[t.dataset.v]=t.value;renderV()}if(t.dataset.sel==='gi'){V.gi=t.value;renderV()}});
}
if(typeof document!=='undefined'&&document.getElementById){loadData();wire();renderV()}
if(typeof window!=='undefined')window.PSAMoMViewer={V,readLiveData,loadData,renderV};
