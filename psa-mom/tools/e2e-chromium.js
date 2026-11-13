/* Optional end-to-end walkthrough in a real Chromium (Playwright), clicking through the UI.
   Not needed on the corporate laptop; useful for maintainers that have Playwright available.
   The data folder is simulated with the browser's Origin Private File System (a real FileSystemDirectoryHandle),
   filled with voorbeelddata/. Run: node tools/e2e-chromium.js [screenshot-dir] */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT=path.join(__dirname,'..');const OUT=process.argv[2]||path.join(ROOT,'build','e2e');fs.mkdirSync(OUT,{recursive:true});
const version=JSON.parse(fs.readFileSync(path.join(ROOT,'project.json'),'utf8')).version;
function files(dir,rel,acc){for(const n of fs.readdirSync(dir)){const f=path.join(dir,n),r=rel?rel+'/'+n:n;if(fs.statSync(f).isDirectory())files(f,r,acc);else acc[r]=fs.readFileSync(f,'utf8')}return acc}
const DATA=files(path.join(ROOT,'voorbeelddata'),'',{});
const srv=http.createServer((q,s)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(fs.existsSync(f)&&fs.statSync(f).isFile()){s.writeHead(200,{'content-type':f.endsWith('.html')?'text/html; charset=utf-8':'text/plain'});s.end(fs.readFileSync(f))}else{s.writeHead(404);s.end()}});
let n=0;const log=[];
(async()=>{
 await new Promise(r=>srv.listen(0,r));const base=`http://localhost:${srv.address().port}`;
 const browser=await chromium.launch();const ctx=await browser.newContext({viewport:{width:1400,height:900},permissions:['clipboard-read','clipboard-write']});const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>{window.showDirectoryPicker=async()=>(await navigator.storage.getDirectory()).getDirectoryHandle('PSA-MoM-data',{create:true});
  /* freeze "today" to the demo date so overdue markers match the demo */
  const D=Date,T=new D('2026-11-13T10:30:00').getTime(),off=T-D.now();window.Date=class extends D{constructor(...a){super(...(a.length?a:[D.now()+off]))}static now(){return D.now()+off}}});
 await page.goto(base+'/project.json');
 await page.evaluate(async data=>{const r=await navigator.storage.getDirectory();try{await r.removeEntry('PSA-MoM-data',{recursive:true})}catch(e){}
  const root=await r.getDirectoryHandle('PSA-MoM-data',{create:true});
  for(const [p,t] of Object.entries(data)){const parts=p.split('/');let d=root;for(const x of parts.slice(0,-1))d=await d.getDirectoryHandle(x,{create:true});const fh=await d.getFileHandle(parts.at(-1),{create:true});const w=await fh.createWritable();await w.write(t);await w.close()}},DATA);
 const shot=async name=>{await page.waitForTimeout(150);await page.screenshot({path:path.join(OUT,`${String(++n).padStart(2,'0')}-${name}.png`),fullPage:false})};
 const step=(t)=>{log.push(t);console.log('  ✓ '+t)};
 await page.goto(`${base}/release/PSA-MoM-v${version}.html`);
 await shot('welkom');
 await page.click('[data-a="pick"]');
 await page.waitForSelector('#dlg[open] input[data-ppq="dlg.who"]');step('map gekozen, "Wie ben je?" verschijnt');
 await shot('wie-ben-je');
 await page.fill('#dlg input[data-ppq="dlg.who"]','an cl');await page.click('#dlg [data-a="pp-add"]');await page.click('#dlg button[type=submit]');
 await page.waitForSelector('header >> text=An Claes');step('gebruiker gekozen: An Claes');
 await shot('startscherm');
 /* new multi-project meeting */
 await page.click('nav [data-v="mtgs"]');await page.click('[data-a="newm"]');
 await page.fill('[data-f="form|datum"]','2026-11-20');await page.dispatchEvent('[data-f="form|datum"]','change');
 await page.click('[data-a="form-prevpeople"]');await page.click('[data-a="form-prevproj"]');
 await page.fill('[data-f="flt|pick|q"]','elevator');await page.waitForTimeout(100);
 await page.click('tr[data-gi="GI24115"]');await page.fill('[data-f="flt|pick|q"]','');
 await page.click('details[data-ms="pick.status"] summary');await page.check('details[data-ms="pick.status"] input[value="2 execution"]');
 await shot('nieuwe-vergadering');
 await page.click('[data-a="form-create"][data-next="mtg"]');await page.waitForSelector('.bar >> text=E&E projectoverleg 20/11/2026');step('nieuwe vergadering met 4 projecten aangemaakt');
 await shot('notuleren');
 /* items: Info, Enter -> new item, Ctrl+2 -> decision, Ctrl+1 -> action */
 const sec=await page.locator('section.sect').first();
 await sec.locator('[data-a="it-add"][data-n="1"]').click();await page.keyboard.type('Geen incidenten; LMRA uitgevoerd.');
 await page.keyboard.press('Enter');await page.keyboard.type('PIF part 2 wordt ingediend in december.');await page.keyboard.press('Control+2');
 await sec.locator('[data-a="it-add"][data-n="5"]').click();await page.keyboard.type('Kick-off kabelwerken organiseren');await page.keyboard.press('Control+1');
 await page.waitForSelector('.item .af');
 const pp=page.locator('.item .af input[data-ppq]').first();await pp.click();await pp.fill('jan');await page.click('.pp-res.open [data-a="pp-add"]');
 const dl=page.locator('.item .af input[type=date]').first();await dl.fill('2026-12-04');await dl.dispatchEvent('change');
 await page.waitForTimeout(1500);step('Info, Beslissing (Ctrl+2) en Actie (Ctrl+1) met eigenaar en deadline');
 await shot('items');
 /* follow-up in the meeting: shift deadline with reason */
 await page.locator('[data-a="act-shift"][data-id="A-GI22074-AC-002"]').click();await page.fill('#dlg input[name=d]','2026-11-27');
 await page.click('#dlg button[type=submit]');const err=await page.textContent('#derr');if(!/reden/i.test(err))throw new Error('reason not enforced');
 await page.fill('#dlg textarea[name=r]','wacht op brandweeradvies');await page.click('#dlg button[type=submit]');step('deadline verschoven (reden verplicht)');
 await page.locator('[data-a="act-close"][data-id="A-GI24115-AC-001"]').click();await page.fill('#dlg textarea[name=afs]','Fiche ontvangen van de fabrikant');await shot('afsluiten');await page.click('#dlg button[type=submit]');step('actie afgesloten met afsluitende beslissing');
 /* paste and split */
 await sec.locator('[data-a="paste"]').click();await page.fill('#ptxt','Planning\n- Elia levert planning tegen 1/12\nRisico\'s\n- Actie: levertijd transformator opvolgen\n- Beslissing: buffer van 4 weken in planning');
 await page.dispatchEvent('#ptxt','input');await shot('plakken');await page.click('#pok');step('notities geplakt en verdeeld over topics');
 /* Definitief */
 await page.selectOption('[data-f="mstatus"]','Definitief');await page.waitForTimeout(300);
 if(await page.locator('#dlg[open]').count()){await shot('niet-definitief');const t=await page.textContent('#dlg');console.log('    validatie: '+t.replace(/\s+/g,' ').slice(0,160));await page.click('#dlg #dc');
  const owners=page.locator('.item .af input[data-ppq]');while(await owners.count()){const o=owners.first();await o.click();await o.fill('wim');await page.click('.pp-res.open [data-a="pp-add"]')}
  const dates=page.locator('.item .af input[type=date]:not([disabled])');for(let i=0;i<await dates.count();i++){const d=dates.nth(i);if(!(await d.inputValue())){await d.fill('2026-12-11');await d.dispatchEvent('change')}}
  await page.selectOption('[data-f="mstatus"]','Definitief');}
 await page.waitForSelector('.ro-banner');step('Definitief na validatie; alleen-lezen');
 await shot('definitief');
 await page.click('[data-a="print"]');await page.waitForSelector('article.mom');await shot('mom-afdrukken');step('MoM printweergave');
 await page.click('[data-a="mail"]');step('e-mailtekst gekopieerd');
 await page.click('[data-a="back"]');await page.click('[data-a="closem"]');
 /* project page */
 await page.click('nav [data-v="projs"]');await shot('projecten');await page.click('tr[data-gi="GI22074"]');await page.waitForSelector('.tabs');await shot('projectpagina');step('projectpagina met tijdlijn');
 await page.click('nav [data-v="acts"]');await page.check('[data-f="flt|acts|overdue"]');await shot('acties-achterstallig');
 /* conflict copy */
 await page.click('[data-a="sync"]');await page.waitForSelector('#dlg[open]');await shot('conflictkopie');await page.click('#dlg button[type=submit]');
 await page.waitForSelector('#dlg[open] >> text=Conflict bij opslaan');await shot('conflictdialoog');await page.click('#dlg button[type=submit]');step('conflictkopie samengevoegd via dialoog');
 await page.waitForTimeout(500);
 await page.click('nav [data-v="set"]');await shot('instellingen');
 await page.click('[data-a="export"]');await page.waitForTimeout(500);
 const left=await page.evaluate(async()=>{const r=await(await navigator.storage.getDirectory()).getDirectoryHandle('PSA-MoM-data');const a=await r.getDirectoryHandle('acties');const o=[];for await(const [k] of a.entries())o.push(k);const ex=await r.getDirectoryHandle('_export');const e=[];for await(const [k] of ex.entries())e.push(k);return{acties:o,exp:e}});
 if(left.acties.some(x=>x.includes('LAPTOP')))throw new Error('copy not removed');step('exports herbouwd: '+left.exp.join(', '));
 await page.click('nav [data-v="dash"]');await shot('startscherm-na');
 await browser.close();srv.close();
 if(errors.length){console.log('Console errors:\n'+errors.join('\n'));process.exit(1)}
 console.log(`e2e: ${log.length} stappen geslaagd, screenshots in ${OUT}`);
})().catch(async e=>{console.error('e2e FOUT: '+e.message);try{const b=require('playwright');}catch(x){}process.exit(1)});
