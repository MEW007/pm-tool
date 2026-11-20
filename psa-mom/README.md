# PSA-MoM – notulen en actieopvolging (SPE Engineering & PMO)

PSA-MoM is één HTML-bestand dat je opent in **Microsoft Edge**. Je notuleert er vergaderingen per project (GI-code), legt beslissingen en acties vast en volgt acties op. Alle gegevens zijn gewone bestanden (Markdown en CSV) in een gedeelde map van de SharePoint-bibliotheek op de site *PSAA-TDSPE-Engineering*. Elke gebruiker synchroniseert die map met OneDrive. Er is geen server, geen installatie en geen AI.

```
Vergadering → Project (GI-code) → Topic → Item (Actie / Beslissing / Info)
```

> Deze map (`psa-mom/`) staat los van de rest van de repository (de React/Supabase-app *PM Tool*). De regels in `.instructions.md` en `BUILD_PLAN.md` gelden niet voor PSA-MoM.

---

## Deel 1 – Gebruikershandleiding (NL)

### 1. Eenmalig: de bibliotheek synchroniseren

1. Open in de browser de documentbibliotheek van *PSAA-TDSPE-Engineering* en ga naar de map **PSA-MoM**.
2. Klik op **Synchroniseren** (of *Snelkoppeling toevoegen aan Mijn bestanden*). De map verschijnt in Verkenner onder *PSA Antwerp* / OneDrive.
3. Klik in Verkenner met de rechtermuisknop op de map → **Altijd op dit apparaat bewaren**. Zo werkt de tool ook even zonder netwerk, en zijn alle bestanden lokaal beschikbaar.

### 2. De tool starten

1. Open in Verkenner de gesynchroniseerde map en dubbelklik op **PSA-MoM-v&lt;versie&gt;.html** (nu v0.9.1) (open met **Microsoft Edge**; Chrome werkt ook, Firefox niet).
2. Klik de eerste keer op **Map kiezen** en kies de map **PSA-MoM** zelf (de map waarin `_config.json` staat). Bevestig *Bestanden bewerken*.
3. De volgende keren onthoudt Edge de map: klik op **Map (her)openen**.

> Zie je "Gebruik Microsoft Edge of Google Chrome"? Dan opende het bestand in een browser zonder toegang tot lokale mappen.

### 3. "Wie ben je?"

De tool kan niet weten wie aangemeld is. Bij de eerste start (per browser) kies je jezelf in de lijst. Je naam staat daarna rechts bovenaan, met **wissel gebruiker**. Je keuze bepaalt:

- **Mijn acties** op het startscherm;
- *aangemaakt_door* en *gewijzigd_door* in de bestanden;
- de ID's van jouw acties en beslissingen: je initialen, bv. `A-GI22074-WM-007` en `B-20261113-WM-01`.

Sta je niet in de lijst? Typ je naam en kies **+ Nieuwe persoon**.

### 4. Werkwijze

| Wanneer | Wat |
|---|---|
| **Voor de vergadering** | *Vergaderingen* → **+ Nieuwe vergadering**. Kies type, datum, voorzitter, notulist en aanwezigen. "Zelfde deelnemers als vorige vergadering" en "Projecten van vorige vergadering overnemen" sparen tijd. Kies projecten met de filters (status, locatie, portfolio, jaar, PM) of zoek op GI-code, PRJ, DMND, omschrijving of PM. → **Aanmaken → Voorbereiding** toont per project de open acties (achterstallige in rood), de beslissingen en notulen van de vorige vergadering, en de lijstgegevens (budget, PIF, PRJ, DMND). |
| **Tijdens de vergadering** | **▶ Start vergadering**. Eén kaart per project en één voor *Algemeen*. Per topic zie je **Vorige keer**. **+ Item** voegt een notitie toe; kies het type **Actie**, **Beslissing** of **Info**. Een actie krijgt meteen een ID, eigenaar, deadline en prioriteit. Sneltoetsen: `Enter` = nieuw item, `Shift+Enter` = nieuwe regel, `Ctrl+1/2/3` = Actie/Beslissing/Info. **Opvolging open acties**: wijzig de status, **⏩ Deadline** verschuiven (reden verplicht) of **Afsluiten** (afsluitende actie of beslissing verplicht; vink aan om ze ook als beslissing in de notulen te zetten). **📋 Notities plakken** verdeelt tekst uit OneNote over de topics. |
| **Na de vergadering** | Zet de status op **Definitief**: dat kan pas als er minstens één aanwezige is en elke actie een eigenaar en deadline heeft. **🖨 MoM / afdrukken** toont een A4-verslag (`Ctrl+P` → *Opslaan als PDF*). **✉ E-mailtekst** kopieert het verslag als platte tekst voor Outlook. **💾 Opslaan als .md** bewaart het in `_rapporten/`. |
| **Daarna** | *Acties*: alle acties met filters (eigenaar, project, vergadertype, status, achterstallig, periode). *Projecten*: per GI-code de tijdlijn van alle notulen over alle vergaderingen heen, de beslissingen, de acties en **Projectdossier exporteren**. |

- **Algemene vergaderingen** (bv. teammeeting) hebben topics zonder projectlaag. Je kan er toch projectsecties aan toevoegen.
- **Rijen zonder GI-code** in de projectlijst kan je niet kiezen. Notuleer zo'n project onder een algemene vergadering, of vraag een GI-code aan.
- **Staat een project niet in de lijst** (of ontbreekt de lijst)? Gebruik dan "Tijdelijk project zonder lijst". Het wordt gemarkeerd als *tijdelijk*.
- Wijzigingen worden **automatisch opgeslagen** (na ±1 seconde). De badge bovenaan toont "Lokaal opgeslagen hh:mm – OneDrive synchroniseert op de achtergrond".

### 5. Samenwerken en conflicten

Met 20 à 40 collega's op dezelfde bestanden gebeurt het dat twee mensen tegelijk iets wijzigen. De tool lost het meeste zelf op:

- **Kleine bestanden.** Er is één bestand per vergadering en één actieregister per project. Je botst dus alleen met iemand die op hetzelfde moment dezelfde vergadering of dezelfde acties van een project wijzigt.
- **Samenvoegen bij opslaan.** Vóór elke schrijfactie leest de tool het bestand opnieuw in. Wijzigingen van anderen op andere acties, andere velden of andere topics worden automatisch samengevoegd.
- **Conflictdialoog.** Pasten jullie allebei hetzelfde veld van dezelfde actie aan, of hetzelfde topic in een vergadering? Dan zie je beide versies naast elkaar en kies je: *Mijn versie*, *Hun versie* of (bij notulen) *Beide behouden*. Standaard staat de meest recente versie aangeduid. Er wordt nooit stil iets overschreven.
- **Melding "Wordt bewerkt door X sinds 10:42".** Iemand anders heeft de vergadering open. Kies *Alleen-lezen openen* of *Toch bewerken*. Ook bij *Toch bewerken* worden de wijzigingen samengevoegd, maar werk bij voorkeur niet tegelijk aan hetzelfde project.
- **OneDrive-conflictkopieën** (bv. `GI22074-LAPTOP-AB12.csv`). Klik op **↻ Synchronisatie controleren** en daarna op **Samenvoegen**. De tool voegt beide versies samen en gebruikt de *verloop*-historiek om te weten wie wat wijzigde. De kopie gaat daarna naar `_backup/conflicten/`. Kopieën in `_export/` worden gewoon verwijderd; ze bevatten geen originele gegevens.
- **↻ Opnieuw inlezen** leest alles opnieuw van schijf, bv. na een aanpassing in Excel of Kladblok.

### 6. Bestanden met de hand aanpassen

Mag, maar sluit eerst de vergadering in de tool. Vergaderingen (`.md`) kan je in Kladblok aanpassen; behoud de koppen `## GI-code – naam`, `### nummer. topic` en de items `- [Info] …`. Actieregisters (`acties/*.csv`) kan je in Excel openen; bewaar als *CSV UTF-8* (gewone CSV werkt ook). Klik daarna op **↻ Opnieuw inlezen**.

### 7. Back-up

- De tool bewaart vóór de eerste wijziging van de dag een kopie van elk gewijzigd bestand in `_backup/<datum>_<initialen>/`.
- **💾 Back-up nu** maakt een volledige kopie in `_backup/<datum>_<uur>_<initialen>-volledig/`.
- Bij een schema-migratie maakt de tool eerst `_backup/pre-migratie-vX/`.
- SharePoint bewaart daarnaast van elk bestand de **versiegeschiedenis**: rechtsklik in Verkenner of SharePoint → *Versiegeschiedenis* → *Herstellen*. Dat is de beste vangnet-back-up.
- Advies: ruim `_backup/` af en toe op (bv. per kwartaal), want de map groeit mee.

### 8. Brondata

| Bestand | Herkomst |
|---|---|
| `_bron/projecten.csv` | lijst *Project budgets & SNOW ref*, via Power Automate (zie [POWER-AUTOMATE.md](POWER-AUTOMATE.md)) of handmatige export |
| `_bron/personen.csv` | leden van de Microsoft 365-groepen SPE en PMO (Power Automate) |
| `personen-extra.csv` | externen en andere collega's, beheerd in *Instellingen → Personen* |

De header toont "Projectlijst: N rijen, N GI-codes, bijgewerkt …" en kleurt **oranje** als het bestand ouder is dan 7 dagen.

### 9. Alleen-lezen overzicht in SharePoint (fase 2)

`PSA-MoM-viewer.html` is een alleen-lezen SharePoint-pagina in de stijl van het *Project Status Dashboard*: acties met filters (eigenaar, PM, project, status), een tijdlijn per project en een verslag per vergadering. De pagina leest de projectlijst en `_export/*.csv` via het *ka-livedata-manifest*. Vernieuw de pagina om te herladen.

### 10. Een nieuwe versie in gebruik nemen

1. Kopieer `PSA-MoM-v<nieuw>.html` naar de map **PSA-MoM** in de bibliotheek.
2. Verwijder of archiveer de oude versie, zodat iedereen dezelfde versie opent.
3. Heeft de nieuwe versie een hoger gegevensschema, dan migreert de eerste gebruiker die ze opent de gegevens (met back-up). Oudere versies schakelen dan automatisch naar alleen-lezen.

---

## Part 2 – Maintainer guide (EN)

### Architecture

```
psa-mom/
  src/core.js        pure logic, no DOM / no I/O (unit-tested in Node)
  src/app.js         UI + storage (File System Access API, IndexedDB), merge-on-save, locks
  src/style.css      look & feel of the 1-op-1 Manager + A4 print layout
  src/template.html  editor shell (placeholders /*@CSS*/ /*@CORE*/ /*@APP*/)
  viewer/            phase 2: viewer.js + template.html (incl. ka-livedata-manifest)
  build.py           -> release/PSA-MoM-v<version>.html, release/PSA-MoM-viewer.html,
                        build/combined.js (core+app, for smoke.js), build/viewer-demo.html (mocked data, local only)
  test.js            unit tests on core.js
  smoke.js           end-to-end: combined.js + fake DOM + in-memory file system (incl. viewer)
  tools/make-demo.js regenerates voorbeelddata/ from core.js (formats always consistent)
  tools/e2e-chromium.js  optional: real Chromium walkthrough via Playwright (OPFS as data folder)
  project.json       version, schema, file formats, migrations
  voorbeelddata/     demo data folder (fictitious people), incl. a simulated OneDrive conflict copy
```

The approach follows the **1-op-1 Manager v1.3.0**: the same source split and single-file build, the CSV conventions and parser, topics stored by number, the migration framework with backup, the action workflow (close requires a closing action/decision, reopen keeps history, overdue in red), the paste-and-split heuristics and the CSS. From the **Project Status Dashboard v4.7.1** come `FIELD_KEYS`, `personName`, `normalizeYear`, `parseCurrencyValue`, `formatEuro`, the status list and colours, the multi-select filters and search, and the live-data reader pattern.

All logic that can be pure is in `core.js` and exported for Node. `app.js` holds the state (`S`), file access, rendering (`VIEWS.*`, string templates and `innerHTML`, as in the 1-op-1 tool) and **commands** (`cmd.*`). Both the UI and `smoke.js` go through the commands. Dialogs only collect input and then call a command.

### Build & test (Windows laptop)

Run it **from the `psa-mom` folder** (or pass the full path to `build.py`; it locates its own files):

```
cd <your clone>\psa-mom
C:\Users\mrtns_wa\CC.projects\.tools\python-3.12.8-embed-amd64\python.exe build.py
```

Running `python.exe build.py` from another folder (e.g. the Python folder) gives "can't open file … build.py". `build.py` finds Node on `PATH`, or next to the portable Python (`.tools\node-v*\node.exe`). It runs `test.js` and `smoke.js` and exits with code 1 if either fails. To run them separately: `node test.js` and `node smoke.js` (smoke needs `build/combined.js`, so run the build first). Optional real-browser check, if Playwright is available: `node tools/e2e-chromium.js`.

Bump the version in `project.json` for every release. The file name of the release follows it.

### File formats (summary; full list in `project.json`)

- **Meeting** `vergaderingen/YYYY/YYYY-MM-DD_<type>[-n].md`: YAML front matter (`id, datum, type, titel, voorzitter, notulist, aanwezig[], verontschuldigd[], projecten[], status, aangemaakt_door, gewijzigd_door, gewijzigd_op`). The body consists of:
  - `## GI22074 – name` or `## Algemeen` (temporary projects: `## TMP-<slug> – name`);
  - `### <nr>. <topic>` (the **number** is what counts);
  - items `- [Info] text`, `- [Beslissing] B-yyyymmdd-<code>-nn: text` and `- [Actie] A-<GI|ALG>-<code>-nnn: text`. For an action the line is only a reference: the action itself lives in the register. Continuation lines are indented by 2 spaces.

  `**Acties (automatisch)**` is regenerated on save and ignored on read. It lists actions created in, or followed up in, that meeting. It is a snapshot taken when that meeting was last saved: old meeting files are not rewritten when an action changes later.
- **Action register** `acties/<GI>.csv`, `_algemeen.csv`, `TMP-<slug>.csv`. Columns: `id;gi_code;vergadering;datum_geidentificeerd;topic;actie;eigenaar;deadline;prioriteit;status;afgesloten_op;afsluiting;verloop;aangemaakt_door;gewijzigd_door;gewijzigd_op`. `topic` = `<meetingtype>:<nr>`. `verloop` is an append-only log separated by ` || `; every entry made inside a meeting ends with `(<code>, vergadering <id>)`.
- **People**: keys are lowercase e-mail addresses. Externals without e-mail get `ext-<slug(organisation-name)>`. The key is stored in the extra column `sleutel` of `personen-extra.csv`, so renaming a person never changes the key.
- **CSV conventions**: UTF-8 with BOM, `;`, every field quoted, CRLF, ISO dates. The reader also accepts `,`/tab, no BOM, Windows-1252 (Excel "CSV") and `dd/mm/yyyy` dates.
- **Exports** `_export/*.csv`: flat and denormalised (names next to keys), with line breaks written as `⏎`. Rebuilt 10 s after a save, and written only when the content changed.

### Concurrency design

1. Every loaded file keeps its `lastModified` and its parsed **base**.
2. Saves are serialised. Each save re-reads the file; if `lastModified` changed, it runs a 3-way merge `merge(base, local, remote)`:
   - **Action CSV** (`mergeRows`), per row by `id`: only-remote → remote; only-local → local; new rows from both sides are kept. A row changed on both sides is merged **per field**: different fields merge automatically, `verloop` is merged as a union, and the same field with different values goes to the conflict dialog (default: newest `gewijzigd_op`). If two new rows get the same ID (same user on two PCs), the local row is renumbered and the meeting reference follows.
   - **Meeting .md** (`mergeMeeting`): front matter per field, lists as sets, body per *(section, topic)* block. If the same block changed on both sides you get a dialog (default: keep both).
3. **OneDrive conflict copies** are detected by name (`-<PC>`, ` (1)`). For meetings the front-matter `id` must point to another file, so a legit `-2` meeting is not mistaken for a copy. They are merged **2-way**: without a base, the `verloop` entries that only one side has tell which fields that side changed. Only fields changed on both sides need a decision.
4. **Soft lock** `vergaderingen/YYYY/.<file>.lock` (JSON). It is refreshed every 20 min, ignored after 2 h and removed on close. It is advisory only; files are never kept open.
5. Backups are written before the first write of each file per user per day (`_backup/<date>_<code>/…`), not on every load. Forty users copying everything on load would flood OneDrive.

### Adding a migration

1. Raise `SCHEMA` in `src/core.js` and `"schema"` in `project.json`.
2. Add an entry to `MIGRATIONS` in `core.js`:
   ```js
   {from:1,to:2,desc:'what changes',run(ctx){ /* ctx.cfg, ctx.meetings (all years), ctx.registers; set ctx.rewrite=true to rewrite all files */ }}
   ```
3. Add a unit test (see the migration test in `test.js`), document it in `project.json` → `migrations`, then build.
4. On first open the app loads all years, copies everything to `_backup/pre-migratie-v<from>/`, runs the migrations, rewrites files when `rewrite` is set and saves `_config.json`. Older tool versions then see a newer schema and switch to read-only.

Topic changes do **not** need a migration: a topic has a stable number, renaming touches only `_config.json`, removing a topic sets `actief:false`, and a new topic gets the next number. A backup of `_config.json` goes to `_backup/config/` on every change.

### Phase 2 viewer

`viewer/viewer.js` uses the same core. `readLiveData(window.__LD_RESULTS__)` is the **only** function that knows the manifest result format. It takes the list in `rows` format (as the dashboard does) and the CSV files as text or as `{headers, rows}`, recognising each CSV by its columns. **Open item:** the manifest syntax for CSV files. When the Copilot-generated example is available, add the three `_export/*.csv` entries to the manifest in `viewer/template.html` (see the TODO there) and, if needed, adapt `readLiveData`. `build/viewer-demo.html` shows the viewer with mocked data; never deploy it.

### Design decisions (confirmed defaults from the plan)

Removing a topic = deactivate. Field-level merge (conflict only on the same field). Action references in the topic. *Definitief* can go back to *Concept*. No roles: everyone can edit everything, and changes are logged. Temporary projects `TMP-<slug>` are linked to a real GI code later, by hand. Project display name = description of the row with the highest year; ties go to the highest list item ID.

### Known limits / ideas

- No Word template yet. Adding the official PSAA template = one more renderer on `momModel()` (next to `renderMomMd/Text/Html`).
- An action cannot be created outside a meeting. Actions always originate in minutes.
- Linking a `TMP-…` project to a real GI code is manual for now: rename the register file, `gi_code` and the section heading.
- Lock file names start with a dot; confirmed to sync to SharePoint (PSA laptop, 13/11/2026). Should that ever change, adapt `lockName()` in `core.js` (one line).
