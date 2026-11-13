# Power Automate: brondata voor PSA-MoM

PSA-MoM kan SharePoint en Microsoft Graph niet zelf aanspreken. Twee flows schrijven daarom de brondata als CSV in de datamap:

| Bestand | Flow | Inhoud |
|---|---|---|
| `_bron/projecten.csv` | Flow 1 "Projectlijst → CSV" | kopie van de lijst **Project budgets & SNOW ref** |
| `_bron/personen.csv` | Flow 2 "Personen → CSV" | leden van de Microsoft 365-groepen van SPE en PMO |

De namen van acties staan in het Nederlands met de Engelse naam erbij (*cursief*). Beide flows gebruiken enkel **standaardconnectoren** (SharePoint, Office 365 Groepen, Office 365 Gebruikers, Gegevensbewerking, Planning). De tool leest zowel komma- als puntkomma-gescheiden bestanden, met of zonder BOM, en zowel interne kolomnamen (`field_1`, …) als weergavenamen (`Year`, …).

> **Datamap** = de map in de documentbibliotheek van de site *PSAA-TDSPE-Engineering* waarin ook `_config.json` en het HTML-bestand van de tool staan. Hieronder noemen we haar `Gedeelde documenten/PSA-MoM` – vervang dit door het echte pad.

---

## Stap 0 (eenmalig): het bestand een eerste keer aanmaken

De flows **overschrijven** een bestaand bestand. Maak het dus één keer aan:

1. Open de lijst *Project budgets & SNOW ref* in SharePoint → **Exporteren** → **Exporteren naar CSV**.
2. Bewaar het gedownloade bestand als `projecten.csv` in `PSA-MoM/_bron/` (via Verkenner in de gesynchroniseerde map, of door te uploaden in SharePoint).
3. Maak op dezelfde manier een (lege) `personen.csv` met als eerste regel: `naam;email;afdeling;functie;groep`.

Dit is meteen ook de **noodprocedure** als een flow niet werkt (zie onderaan).

---

## Flow 1 – "Projectlijst → CSV"

Een flow kan maar één trigger hebben. Je maakt daarom **twee kopieën van dezelfde flow**: één die start bij een wijziging in de lijst en één die dagelijks om 06:00 loopt (als vangnet).

### 1a. Trigger bij wijziging

1. Ga naar [make.powerautomate.com](https://make.powerautomate.com) → **Maken** → **Geautomatiseerde cloudstroom**.
   Naam: `PSA-MoM – Projectlijst naar CSV (bij wijziging)`.
2. Trigger: **SharePoint – Wanneer een item wordt gemaakt of gewijzigd** (*When an item is created or modified*)
   - *Siteadres*: `PSAA-TDSPE-Engineering`
   - *Lijstnaam*: `Project budgets & SNOW ref`
   - Open bij de trigger **Instellingen** → **Gelijktijdigheidsbeheer** = **Aan**, *Mate van parallellisme* = **1**. Zo schrijven twee runs nooit tegelijk naar het bestand.
3. Actie **SharePoint – Items ophalen** (*Get items*)
   - *Siteadres* en *Lijstnaam*: zoals hierboven
   - *Bovenste aantal*: `5000`
   - **Instellingen** → **Paginering** = **Aan**, *Drempel* = `5000` (of hoger als de lijst ooit groter wordt).
4. Actie **Gegevensbewerking – Selecteren** (*Data Operation – Select*)
   - *Van*: `value` (uitvoer van *Items ophalen*)
   - Klik rechts op het icoon **Overschakelen naar tekstmodus** en plak:
   ```json
   {
     "ID": "@{item()?['ID']}",
     "Title": "@{item()?['Title']}",
     "field_1": "@{item()?['field_1']}",
     "field_2": "@{item()?['field_2']}",
     "field_3": "@{item()?['field_3']}",
     "field_4": "@{item()?['field_4']}",
     "field_5": "@{item()?['field_5']}",
     "field_6": "@{item()?['field_6']}",
     "field_7": "@{item()?['field_7']}",
     "field_8": "@{item()?['field_8']}",
     "field_9": "@{item()?['field_9']}",
     "field_11": "@{item()?['field_11']}",
     "field_12": "@{item()?['field_12']}",
     "PMPerson": "@{item()?['PMPerson/DisplayName']}",
     "PMEmail": "@{item()?['PMPerson/Email']}"
   }
   ```
   - Is *Status* (`field_8`) een **keuzekolom**? Gebruik dan `item()?['field_8/Value']`. (Doe je dit niet, dan werkt het ook: de tool herkent `{"Value": "2 execution"}` zelf.)
   - `PMEmail` is optioneel, maar aanbevolen: daarmee koppelt de tool de PM betrouwbaar aan een persoon (filter "Mijn projecten").
5. Actie **Gegevensbewerking – CSV-tabel maken** (*Create CSV table*)
   - *Van*: uitvoer van *Selecteren*; *Kolommen*: **Automatisch**.
6. Actie **SharePoint – Bestandsmetagegevens ophalen via pad** (*Get file metadata using path*; **niet** *Get file properties*)
   - *Siteadres*: kies **Aangepaste waarde invoeren** (*Enter custom value*) en typ enkel `https://globalpsaemea.sharepoint.com/sites/PSAA-TDSPE-Engineering` (de keuze uit de lijst met de weergavenaam ervoor gaf de fout "Site Address … is not valid")
   - *Bestandspad*: blader met het mapicoon naar `PSA-MoM/_bron/projecten.csv` (het bestand moet al bestaan, zie stap 0)
7. Actie **SharePoint – Bestand bijwerken** (*Update file*)
   - *Siteadres*: `PSAA-TDSPE-Engineering`
   - *Bestands-id*: `Id` (uitvoer van stap 6)
   - *Bestandsinhoud*: uitvoer van *CSV-tabel maken*
8. **Opslaan** en testen: wijzig een veld in de lijst en controleer na ±1 minuut de wijzigingsdatum van `_bron/projecten.csv`. De header van PSA-MoM toont *Projectlijst: … rijen, … GI-codes, bijgewerkt dd/mm/jjjj uu:mm*.

> **Alternatief voor stap 6–7**: **SharePoint – Bestand maken** (*Mappad* `/Gedeelde documenten/PSA-MoM/_bron`, *Bestandsnaam* `projecten.csv`). Standaard overschrijft deze actie een bestaand bestand niet. Volgens sommige bronnen verschijnt de optie *Overschrijven* zodra je bij **Instellingen** → **Segmentering toestaan** (Allow chunking) uitzet, maar daarover zijn de meningen verdeeld. Test dit eerst. De combinatie *metagegevens ophalen + bijwerken* werkt altijd.

### 1b. Dagelijks om 06:00

1. Open de flow van 1a → **…** → **Opslaan als** → naam `PSA-MoM – Projectlijst naar CSV (dagelijks)`.
2. Open de kopie, verwijder de trigger en kies **Planning – Terugkeerpatroon** (*Schedule – Recurrence*):
   *Interval* `1`, *Frequentie* `Dag`, *Tijdzone* `(UTC+01:00) Brussel…`, *Op deze uren* `6`, *Op deze minuten* `0`.
3. Opslaan en **Inschakelen** (een kopie staat standaard uit).

---

## Flow 2 – "Personen → CSV"

1. **Maken** → **Geplande cloudstroom**. Naam `PSA-MoM – Personen naar CSV`; dagelijks om 05:45.
2. Actie **Variabele initialiseren**: *Naam* `personen`, *Type* `Matrix` (array), *Waarde* `[]`.
3. Actie **Office 365 Groepen – Groepsleden weergeven** (List group members)
   - *Groeps-id*: kies de Microsoft 365-groep van **SPE**.
4. **Toepassen op elke** (Apply to each) over `value` van stap 3:
   1. **Office 365 Gebruikers – Gebruikersprofiel ophalen (V2)**, *Gebruiker (UPN)*: `id` (of `userPrincipalName`) van het huidige item.
   2. **Toevoegen aan matrixvariabele** `personen`, *Waarde*:
      ```json
      {
        "naam": "@{outputs('Gebruikersprofiel_ophalen_(V2)')?['body/displayName']}",
        "email": "@{toLower(outputs('Gebruikersprofiel_ophalen_(V2)')?['body/mail'])}",
        "afdeling": "@{outputs('Gebruikersprofiel_ophalen_(V2)')?['body/department']}",
        "functie": "@{outputs('Gebruikersprofiel_ophalen_(V2)')?['body/jobTitle']}",
        "groep": "SPE"
      }
      ```
      (De naam van de actie in de expressie moet overeenkomen met de naam van je actie; kies de velden gewoon uit *Dynamische inhoud*.)
5. Herhaal stap 3–4 voor de groep van **PMO** met `"groep": "PMO"`. Iemand die in beide groepen zit, staat dan twee keer in het bestand; de tool voegt dat samen tot de badge *SPE/PMO*.
6. **Gegevensbewerking – CSV-tabel maken**: *Van* = variabele `personen`, *Kolommen* = Automatisch.
   (Dit geeft een kommagescheiden bestand met kolommen `naam,email,afdeling,functie,groep`. Dat leest de tool zonder problemen. Wil je toch puntkomma's, gebruik dan een *Opstellen*-actie met `replace(body('CSV-tabel_maken'), ',', ';')`, maar enkel als er geen komma's in namen of functies voorkomen.)
7. **Bestandsmetagegevens ophalen via pad** `/Gedeelde documenten/PSA-MoM/_bron/personen.csv` + **Bestand bijwerken** met de CSV-tabel als inhoud (zoals in flow 1).

> Externen (Elia, PoAB, consultants, …) en andere interne collega's staan **niet** in deze flow. Die beheer je in de tool zelf: *Instellingen → Personen* (bestand `personen-extra.csv`).

---

## Controle en onderhoud

- **Versheid**: de header van PSA-MoM toont de datum van `_bron/projecten.csv` en kleurt **oranje** als het bestand ouder is dan 7 dagen. Dan loopt een flow niet meer (bv. verlopen verbinding of gewijzigd wachtwoord van de eigenaar).
- **Eigenaar**: zet bij beide flows een tweede eigenaar (bv. een collega van PMO), zodat de flows blijven werken als jij afwezig bent.
- **Fouten**: Power Automate mailt de eigenaar bij herhaalde mislukte runs. Bekijk de *Uitvoeringsgeschiedenis* van de flow.

## Noodprocedure (handmatig)

Werkt een flow niet, dan blijft de tool gewoon werken met het laatste bestand. Om toch bij te werken:

1. Lijst *Project budgets & SNOW ref* → **Exporteren** → **Exporteren naar CSV**.
2. Overschrijf `_bron/projecten.csv` in de datamap met het gedownloade bestand (de naam moet exact `projecten.csv` zijn).
3. Klik in PSA-MoM op **↻ Opnieuw inlezen**.

De handmatige export gebruikt weergavenamen (`Year`, `Project code`, `PM (person)`, …); de tool herkent die ook.
