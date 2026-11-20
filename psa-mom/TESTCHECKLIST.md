# Testchecklist PSA-MoM v0.9.0 (v0.9.1: + eerste start op lege map, foutscherm bij inlezen)

Doorlopen op 13/11/2026 met de demodata (`voorbeelddata/`). Ze is op twee manieren afgewerkt:

- **S** = `smoke.js`. Draait automatisch bij elke `build.py`: een nagebootste browser (fake DOM) met een in-memory bestandssysteem, inclusief lastModified, zodat gelijktijdige wijzigingen nagebootst kunnen worden.
- **E** = `tools/e2e-chromium.js`. Echte Chromium (Playwright) die door de interface klikt. De datamap is een echte `FileSystemDirectoryHandle` (Origin Private File System), gevuld met de demodata.

| # | Stap | Resultaat | Waar |
|---|---|---|---|
| 1 | Eerste start: map kiezen, **"Wie ben je?"**, keuze bewaard; header toont naam + "wissel gebruiker" | ✅ | S1–2, E |
| 2 | Header: "Projectlijst: 30 rijen, 19 GI-codes, bijgewerkt …"; GI22074 en GI26057 met 3 budgetlijnen; `GI23111-GI24115` en `GI25071-24109` horen bij beide codes; 5 rijen zonder GI-code grijs met hint | ✅ | S1, S10 |
| 3 | **Nieuwe multi-projectvergadering** (E&E projectoverleg): projectgebonden type vraagt minstens één project; deelnemers en projecten overnemen van vorige; projecten zoeken en filteren (status) | ✅ | S3, E |
| 4 | Voorbereiding: open acties (achterstallig rood), budgetlijnen, vorige notulen | ✅ | S3 |
| 5 | **Items van alle 3 types**: Info; Beslissing (ID `B-20261120-AC-01`, `Ctrl+2`); Actie (ID `A-GI22074-AC-004`, `Ctrl+1`); `Enter` = nieuw item | ✅ | S4, E |
| 6 | Type gating: een vers aangemaakte actie terugzetten naar Info verwijdert ze uit het register; eigenaar, deadline en status bestaan enkel voor Actie (ook in `_export/minuten.csv`) | ✅ | S4, S18, test.js |
| 7 | **Actie met eigenaar en deadline**; register `acties/GI22074.csv` en meetingbestand (referentie + blok "Acties (automatisch)") bijgewerkt | ✅ | S4, E |
| 8 | **Definitief** geweigerd zonder eigenaar/deadline (lijst met fouten), daarna aanvaard → alleen-lezen, lock vrijgegeven, "Terug naar Concept" | ✅ | S4–5, E |
| 9 | **Volgende vergadering van hetzelfde type** toont "Vorige keer" per project/topic en de open acties in "Opvolging" | ✅ | S6 |
| 10 | **Deadline verschuiven**: reden verplicht; gelogd in *verloop* met verwijzing naar de vergadering | ✅ | S7, E |
| 11 | **Actie afsluiten**: afsluiting verplicht; optie "ook als beslissing vastleggen" maakt `B-…` in de notulen; heropenen vraagt een reden en bewaart de historiek | ✅ | S8, E, test.js |
| 12 | **Algemene teammeeting**: sectie *Algemeen* eerst, actie in `acties/_algemeen.csv`; projectsectie en tijdelijk project (`TMP-…`) toevoegbaar | ✅ | S9 |
| 13 | **Projectpagina**: tijdlijn over E&E projectoverleg en PMO-review heen, beslissingen, acties (open/alle), **Projectdossier (.md)** | ✅ | S10, E |
| 14 | **Mijn acties** op het startscherm; achterstallige rij rood; filter "Achterstallig" in *Acties* | ✅ | S11, E |
| 15 | **Conflict merge met de democonflictkopie** `acties/GI22074-LAPTOP-JP01.csv`: eenzijdige wijzigingen (eigenaar in origineel, deadline en status in kopie, nieuwe actie in kopie) automatisch samengevoegd; een veld dat aan beide kanten wijzigde, leidt tot de conflictdialoog; de kopie gaat naar `_backup/conflicten/` | ✅ | S12, E |
| 16 | Merge on save (actieregister): wijziging van anderen + eigen wijziging op andere velden → samengevoegd; zelfde veld → dialoog, gekozen versie bewaard | ✅ | S13 |
| 17 | Merge on save (vergadering): ander topic → samengevoegd; zelfde topic → dialoog (standaard beide behouden) | ✅ | S14 |
| 18 | Soft lock van iemand anders → "Wordt bewerkt door Jan Peeters …" (alleen-lezen gekozen); lock ouder dan 2 uur genegeerd; eigen lock weg bij sluiten | ✅ | S15 |
| 19 | Externe wijziging (Excel) en nieuw bestand van een collega worden opgepikt | ✅ | S16 |
| 20 | **MoM printweergave** (A4, Ctrl+P) en **e-mailtekst** naar het klembord; `.md` in `_rapporten/` | ✅ | S17, E |
| 21 | **Exports herbouwd**; conflictkopie in `_export/` verwijderd; ongewijzigde exports niet herschreven; regeleinden als ⏎ | ✅ | S18, E |
| 22 | Instellingen: topic toevoegen (vast nummer 6, back-up `_config.json`), externe persoon toevoegen (sleutel `ext-…`), dubbele persoon geweigerd | ✅ | S19 |
| 23 | Handmatig in Kladblok aangepast meetingbestand correct ingelezen na "Opnieuw inlezen" | ✅ | S21 |
| 24 | Prestatie: 420 lijstrijen, 500 vergaderingen, 3.000 acties laden in ±0,25 s (in-memory; parsing en rendering) | ✅ | S22 |
| 25 | Viewer (fase 2) met nagebootste `window.__LD_RESULTS__` (CSV als tekst én als `{headers,rows}`); geen netwerk of opslag in de code | ✅ | S23 |

## Nog te testen op de PSA-laptop (kon hier niet)

- [ ] Openen vanuit de **echt gesynchroniseerde OneDrive-map** in Edge (bestand via `file://`), map kiezen en "Map (her)openen" na het herstarten van Edge.
- [ ] Laadtijd met de echte bibliotheek. De meting hierboven is zonder schijf- en OneDrive-vertraging; het echte bestandssysteem voegt per bestand enkele milliseconden toe. Bij 700+ bestanden wordt dat ±1–2 s; oudere jaren laden op de achtergrond.
- [ ] Een echte OneDrive-conflictkopie: wijzig hetzelfde actieregister offline op twee pc's en synchroniseer daarna.
- [x] Of OneDrive/SharePoint lockbestanden **met een punt vooraan** (`.…md.lock`) synchroniseert: ✅ bevestigd op de PSA-laptop (bestand aangemaakt door Edge, zichtbaar in SharePoint, groen vinkje).
- [ ] Melding "Wordt bewerkt door …" op een tweede pc (gepland).
- [ ] Power Automate-flows (zie POWER-AUTOMATE.md) en de kolomnamen van de echte export.
- [ ] Viewer in SharePoint zodra de manifestsyntaxis voor CSV-bestanden gekend is.
