# Make.com-Szenarien für 100blend

Drei Automations-Blueprints, die die 100blend-PWA (`peterknauf1967-tech/100blend`) mit
Firebase Realtime DB, Google Drive, WhatsApp Business und der Claude API verbinden.
Alle Szenarien laufen im gleichen Make-Team wie der bereits produktive KBank-Grab-Flow
(Region EU2). Firebase-Projekt: `blend100-firebase` (Realtime DB, Region `asia-southeast1`).

Konventionen:
- Firebase-Pfade in Kleinbuchstaben, Keys per `push()` erzeugt (Firebase-generierte ID).
- Alle Zeiten in ICT (`Asia/Bangkok`, UTC+7). Timestamps werden als ISO-8601 gespeichert.
- WhatsApp-Nummer Peter: `+49 …` (siehe Make-Data-Store `contacts/peter`).
- WhatsApp-Nummer Lexi: `+66 …` (Data-Store `contacts/lexi`).
- Claude-Modell: `claude-sonnet-4-5` (Vision). Über die Anthropic-API mit
  `anthropic-version: 2023-06-01`.

---

## Szenario 1 — Wareneingang per Foto → automatische Buchung

Lexi (oder ein Lieferant) legt ein Foto vom Produktetikett in einen Drive-Ordner ab.
Claude liest Hersteller, Produkt, Größe, Preis, MHD und Zertifikate aus dem Etikett;
Firebase bekommt die neue Charge (und ggf. die Zutat); Peter bekommt eine WhatsApp
zur Bestätigung; das Foto wird in einen "gebucht"-Ordner archiviert.

### Trigger

- **Google Drive — Watch Files**
  - Folder: `100blend/wareneingang-pending/`
  - Watch: "By created date"
  - Limit pro Run: 5 (falls Batch anfällt)
  - Interval: 5 min

### Module (Schritt für Schritt)

1. **Google Drive — Watch Files** (Trigger, siehe oben).
2. **Google Drive — Download a file** — lädt das Foto als Binary in den Bundle.
3. **Tools — Compose a string** — konvertiert die Datei zu Base64 (`{{toBase64(1.data)}}`)
   und mappt Mime-Type (`{{1.mimeType}}`).
4. **HTTP — Make a request** (Claude Vision Call):
   - URL: `https://api.anthropic.com/v1/messages`
   - Method: POST
   - Header: `x-api-key: {{ENV.ANTHROPIC_API_KEY}}`, `anthropic-version: 2023-06-01`,
     `content-type: application/json`
   - Body: siehe Payload-Beispiel unten.
5. **JSON — Parse JSON** — Data-Structure `claude_response`; extrahiert
   `content[0].text` (Claude legt das JSON als Text-Block ab).
6. **JSON — Parse JSON** — zweite Runde, Data-Structure `wareneingang_extract`, parst den
   Text-Inhalt aus Schritt 5 in ein strukturiertes Objekt
   (`hersteller`, `produkt`, `variante`, `menge_g`, `preis_thb`, `mfg`, `mhd`,
   `zertifikate[]`). Bei Parse-Fehler → Route B (Fehlerbehandlung).
7. **Firebase Realtime DB — Get a value** — prüft, ob
   `zutaten/` bereits eine Zutat mit gleichem `slug` enthält
   (`slug = toLower(replace(produkt, " ", "-"))`). Query: `orderBy=slug&equalTo={{slug}}`.
8. **Router**:
   - **Route 1 — Zutat existiert nicht**: **Firebase Realtime DB — Push a value** auf
     `zutaten/` mit `{slug, name_de, name_en, status: "gruen", angelegt_am}`.
   - **Route 2 — Zutat existiert**: nur `zutaten/{key}/letzte_charge_am` updaten.
9. **Firebase Realtime DB — Push a value** — legt die Charge unter `chargen/`:
   `{zutat_key, zutat_name, hersteller, variante, menge_g, preis_thb, mfg, mhd,
   zertifikate, foto_drive_id, status: "gruen", angelegt_am}`.
10. **Google Drive — Move a file** — Foto von `wareneingang-pending/` nach
    `wareneingang-gebucht/`. Dateiname wird umbenannt zu
    `{{formatDate(now; "YYYYMMDD-HHmm")}}_{{slug}}.jpg`.
11. **WhatsApp Business — Send message** an Peter:
    ```
    ✅ NEU: {{produkt}} {{menge_g}}g für {{preis_thb}} THB gebucht — MHD {{mhd}} — passt?
    Antworte: OK  |  KORR  |  LÖSCHEN
    ```
    Interaktive Buttons via WhatsApp Business Cloud API (`interactive.type=button`,
    3 Reply-Buttons `chg_ok_{{key}}`, `chg_korr_{{key}}`, `chg_del_{{key}}`).
12. **Data Store — Add a record** — Log-Store `wareneingang_log` (für Audit &
    spätere Korrektur).

### Payload-Beispiel

Request-Body an Claude (Schritt 4):

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 800,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "{{base64_photo}}"
          }
        },
        {
          "type": "text",
          "text": "Extrahiere aus dem Produkt-Etikett: Hersteller, Produkt (deutsch + englisch), Variante (roh/geröstet/gesalzen etc.), Verpackungsgröße in g/ml, Preis in THB falls sichtbar, MFG-Datum, MHD/Best-Before, Zertifikate (HACCP/GMP/Organic/etc.). Antworte AUSSCHLIESSLICH als JSON in der Form {\"hersteller\":\"\",\"produkt\":{\"de\":\"\",\"en\":\"\"},\"variante\":\"\",\"menge_g\":0,\"preis_thb\":0,\"mfg\":\"YYYY-MM-DD\",\"mhd\":\"YYYY-MM-DD\",\"zertifikate\":[]}. Kein Fließtext, kein Markdown, keine Code-Fence."
        }
      ]
    }
  ]
}
```

Antwort von Claude (Schritt 5, `content[0].text`):

```json
{
  "hersteller": "Doi Kham",
  "produkt": {"de": "Kokoswasser Nam Hom", "en": "Young Coconut Water"},
  "variante": "pur, ohne Zucker",
  "menge_g": 1000,
  "preis_thb": 79,
  "mfg": "2026-08-14",
  "mhd": "2027-02-14",
  "zertifikate": ["HACCP", "GMP", "Halal"]
}
```

Firebase-Write `chargen/{push_key}` (Schritt 9):

```json
{
  "zutat_key": "-Nz7…kokoswasser",
  "zutat_name": "Kokoswasser Nam Hom",
  "hersteller": "Doi Kham",
  "variante": "pur, ohne Zucker",
  "menge_g": 1000,
  "preis_thb": 79,
  "mfg": "2026-08-14",
  "mhd": "2027-02-14",
  "zertifikate": ["HACCP", "GMP", "Halal"],
  "foto_drive_id": "1AbC…xyz",
  "status": "gruen",
  "angelegt_am": "2026-09-02T14:31:07+07:00",
  "angelegt_von": "make:wareneingang"
}
```

### Fehlerbehandlung

- **Claude-Response ist kein JSON** (Parse in Schritt 6 wirft `JSONError`):
  - Route B: Foto per **Google Drive — Move a file** nach
    `100blend/wareneingang-manuell/` verschieben, Dateiname
    `MANUELL_{{formatDate(now;"YYYYMMDD-HHmm")}}_{{1.name}}`.
  - WhatsApp an Peter: "⚠️ Wareneingang konnte nicht gelesen werden — bitte
    manuell buchen: {{drive_link}}"
  - **Data Store — Add a record** in `errors_wareneingang`
    (raw Claude-Text + Fehlermeldung).
- **Claude-API Fehler / HTTP ≥ 400**: 3× Retry mit exponentiellem Backoff
  (Make-Setting "Break — Retry: 3, Interval: 60s").
- **Firebase-Write Fehler**: Foto NICHT verschieben (bleibt in `pending/` — nächster Run
  probiert erneut). "Enable ignoring" ausschalten → Szenario darf hier crashen und
  meldet über Make-Fehler-Handler an Peter.
- **Duplikat-Charge** (gleiche `foto_drive_id` schon in `chargen/`): Route wird
  vorzeitig beendet (Filter `foto_drive_id != last`), keine erneute WhatsApp.

### Kosten

- Claude Sonnet 4.5 Vision: ca. **1500 Input-Tokens** (Bild ~1200 + Prompt 300) +
  **250 Output-Tokens** → ca. **0,0075 USD ≈ 0,27 THB pro Foto**.
- Make-Ops pro Foto: ~14 Ops. Bei Core-Plan (10k Ops/Monat) reicht das für
  ~700 Wareneingänge/Monat, was für einen einzelnen Store weit ausreicht.
- WhatsApp: 1 Utility-Message (~0,006 USD) pro Buchung.
- **Summe: ~0,015 USD ≈ 0,55 THB pro Wareneingang.**

---

## Szenario 2 — Karenz-Verlängerung (Zweite-Nase-Freigabe)

Wenn die 24-h-Standard-Karenz einer Charge abgelaufen ist und Lexi in der Kasse
den 4-Sinne-Check (Sehen / Riechen / Fühlen / Schmecken) besteht, drückt sie
"noch frisch — Peter fragen". Kasse setzt `chargen/{key}/status =
karrenz_ablauf_gemeldet`. Peter bekommt eine WhatsApp mit drei Antwort-Buttons und
entscheidet. Antwortet er nicht innerhalb von 2 h, wird die Charge automatisch
entsorgt und Lexi benachrichtigt.

### Trigger

- **Firebase Realtime DB — Watch value** (via Make's Custom-Webhook + Firebase
  Cloud Function `onChargenStatusChange`, weil Make keinen nativen Firebase-Watch
  hat):
  - Cloud Function pusht bei jedem `chargen/{key}/status`-Change per HTTPS an den
    Webhook-URL. Make-Modul: **Webhooks — Custom webhook**
    (`hook: chargen_status_change`).
  - Filter direkt nach dem Trigger: `status == "karrenz_ablauf_gemeldet"`.

### Module (Schritt für Schritt)

1. **Webhooks — Custom webhook** (`chargen_status_change`) — Payload enthält
   `{key, zutat_name, produziert_am, gemeldet_am, gemeldet_von}`.
2. **Filter** — nur weiter, wenn `status == "karrenz_ablauf_gemeldet"`.
3. **WhatsApp Business — Send message** (interaktive Buttons) an Peter:
   ```
   🥛 Charge {{zutat_name}}
   Produziert: {{produziert_am}}
   Lexi meldet: noch frisch — 4-Sinne OK
   Freigabe?
   ```
   Buttons: `karrenz_ok24_{{key}}`, `karrenz_ok48_{{key}}`, `karrenz_weg_{{key}}`.
4. **Data Store — Add a record** in `pending_karrenz` mit
   `{key, gestellt_am, deadline: now + 2h}` — für den Timeout-Watcher.
5. **Sleep** ist NICHT möglich (Make-Ops-Kosten). Statt dessen läuft ein zweites
   Sub-Szenario **"karrenz-timeout-sweeper"** alle 15 min:
   - **Schedule — Every 15 min**.
   - **Data Store — Search records** in `pending_karrenz` wo `deadline < now`.
   - Für jeden Eintrag:
     - **Firebase Realtime DB — Get** `chargen/{key}/status`.
     - Wenn immer noch `karrenz_ablauf_gemeldet` (Peter hat nicht reagiert):
       **Firebase Realtime DB — Set** `chargen/{key}/status = "entsorgen"`,
       `entsorgen_grund = "timeout_peter_2h"`.
     - **WhatsApp Business — Send message** an Lexi:
       "⏱️ {{zutat_name}} — keine Antwort in 2h → bitte entsorgen."
     - **Data Store — Remove a record** aus `pending_karrenz`.
6. Antwortet Peter (getrenntes Szenario **"whatsapp-webhook-in"**, das schon für
   den KBank-Flow existiert): das Reply-Payload enthält `button_id`
   (`karrenz_ok24_{key}` etc.). Der Handler:
   - `karrenz_ok24_...` → Firebase-Set:
     `chargen/{key}/karrenz_bis = now + 24h`, `status = "gruen"`.
   - `karrenz_ok48_...` → `karrenz_bis = now + 48h`, `status = "gruen"`.
   - `karrenz_weg_...` → `status = "entsorgen"`, `entsorgen_grund =
     "peter_verworfen"`.
   - Nach jedem Fall: `pending_karrenz`-Eintrag entfernen und WhatsApp an Lexi
     senden: "OK, verlängert bis {{karrenz_bis}}" / "Bitte entsorgen".

### Payload-Beispiel

Webhook-Payload aus der Firebase-Function (Schritt 1):

```json
{
  "key": "-NzB1kL9pQr8",
  "zutat_name": "Seidentofu Bio",
  "produziert_am": "2026-09-01T08:00:00+07:00",
  "gemeldet_am": "2026-09-02T09:12:00+07:00",
  "gemeldet_von": "kasse:lexi",
  "status": "karrenz_ablauf_gemeldet"
}
```

WhatsApp Interactive-Message-Body an Peter (Schritt 3):

```json
{
  "messaging_product": "whatsapp",
  "to": "49XXXXXXXXX",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": {"text": "🥛 Charge Seidentofu Bio\nProduziert: 01.09. 08:00\nLexi meldet: noch frisch — 4-Sinne OK\nFreigabe?"},
    "action": {
      "buttons": [
        {"type": "reply", "reply": {"id": "karrenz_ok24_-NzB1kL9pQr8", "title": "OK +24h"}},
        {"type": "reply", "reply": {"id": "karrenz_ok48_-NzB1kL9pQr8", "title": "OK +48h"}},
        {"type": "reply", "reply": {"id": "karrenz_weg_-NzB1kL9pQr8", "title": "WEG"}}
      ]
    }
  }
}
```

Firebase-Update nach Peter-Antwort `OK+24`:

```json
{
  "karrenz_bis": "2026-09-03T09:12:00+07:00",
  "status": "gruen",
  "karrenz_verlaengert_von": "peter",
  "karrenz_verlaengert_am": "2026-09-02T09:15:44+07:00"
}
```

### Fehlerbehandlung

- **WhatsApp-Send-Fail an Peter**: 3× Retry (60s Abstand). Wenn immer noch fehlgeschlagen,
  fällt der Timeout-Sweeper nach 2h ohnehin auf `entsorgen` zurück → sichere Seite.
- **Doppel-Trigger** (Firebase feuert bei jedem Write, auch bei No-Op): Filter in
  Schritt 2 auf exakt `karrenz_ablauf_gemeldet` verhindert Loops (Kasse setzt
  danach `gruen` oder `entsorgen`, nicht wieder auf `karrenz_ablauf_gemeldet`).
- **Peter antwortet zweimal** (z. B. erst OK+24, dann WEG): Handler ist
  idempotent — letzter Write gewinnt, Data-Store-Record wird bei erster Antwort
  entfernt, zweite Antwort landet im Log ohne Firebase-Write (Filter
  `pending_karrenz` existiert nicht mehr).
- **Cloud-Function-Ausfall**: Wenn der Webhook nicht kommt, gibt es nach 24 h
  einen zweiten Fallback: die Kasse selbst warnt Lexi, sobald sie eine Charge
  ohne aktualisiertes `karrenz_bis` einscannt — reine Client-Sicherheit.

### Kosten

- Keine Claude-API-Nutzung.
- Make-Ops pro Karenz-Anfrage: ~5 (Webhook + Filter + WhatsApp + Data-Store +
  Log). Sweeper: 4 Ops alle 15 min × 96/Tag = ~380 Ops/Tag (fast alle
  No-Ops-Filter).
- WhatsApp: 2 Utility-Messages pro Fall (~0,012 USD).
- **Summe: ~0,015 USD ≈ 0,55 THB pro Karenz-Fall.**

---

## Szenario 3 — Ampel-Kettenreaktion

Sobald sich eine Zutat auf `rot` oder `gruen` ändert, wird Peter informiert, eine
Zeile in ein Google Sheet geschrieben, und die Landingpage `order.html` bekommt
optional einen Cache-Bust. Die Kasse ist NICHT abhängig von diesem Szenario — sie
liest Firebase live; dieses Szenario ist rein informationell.

### Trigger

- **Webhooks — Custom webhook** (`zutaten_status_change`), gefüttert von der
  Firebase-Function `onZutatenStatusChange` (gleiche Function-Deployment wie
  Szenario 2, anderer Listener-Pfad `zutaten/{key}/status`).

### Module (Schritt für Schritt)

1. **Webhooks — Custom webhook** (`zutaten_status_change`). Payload:
   `{key, name, name_de, status_alt, status_neu, geaendert_von, geaendert_am,
   ausloeser}` (Auslöser z. B. `charge_entsorgen`, `manuell_peter`,
   `karrenz_timeout`).
2. **Filter** — nur weiter, wenn `status_neu != status_alt`.
3. **Router** — zwei parallele Routen (Log läuft immer, WhatsApp/Cache nur bei
   Rot/Grün-Wechsel):
   - **Route A: Sheet-Log (immer)**
     - **Google Sheets — Add a row** in Tabelle `Ampel-Historie`:
       Datum, Uhrzeit, Zutat, alt, neu, Auslöser, Peter/Lexi.
   - **Route B: Wechsel auf ROT**
     - Filter: `status_neu == "rot"`.
     - **Firebase Realtime DB — Get** `rezepte/`. In JavaScript-Modul
       **Tools — Set variable** zählen, wie viele Rezepte diese Zutat enthalten
       (`becher_betroffen`).
     - **WhatsApp Business — Send message** an Peter:
       ```
       🔴 {{name_de}} = ROT
       {{becher_betroffen}} Becher betroffen
       Auslöser: {{ausloeser}}
       ```
     - **HTTP — Make a request** (optional Cache-Bust):
       `POST https://order.100blend.com/api/revalidate?token={{ENV.REVAL_TOKEN}}`
       (falls Cloudflare-Cache-Purge oder eigener Worker vor `order.html` steht;
       bei GitHub Pages reicht der eingebaute Firebase-Live-Read und der Call
       kann weggelassen werden).
   - **Route C: Wechsel auf GRÜN nach ROT**
     - Filter: `status_neu == "gruen" AND status_alt == "rot"`.
     - **WhatsApp Business — Send message** an Peter:
       ```
       🟢 {{name_de}} wieder verfügbar
       ```
     - **HTTP — Make a request** Cache-Bust wie in Route B.

### Payload-Beispiel

Webhook-Payload (Schritt 1):

```json
{
  "key": "-Nz7abcKokoswasser",
  "name": "kokoswasser",
  "name_de": "Kokoswasser Nam Hom",
  "status_alt": "gruen",
  "status_neu": "rot",
  "geaendert_von": "kasse:lexi",
  "geaendert_am": "2026-09-02T18:04:12+07:00",
  "ausloeser": "letzte_charge_entsorgt"
}
```

Sheet-Zeile (Route A):

```
2026-09-02 | 18:04 | Kokoswasser Nam Hom | gruen | rot | letzte_charge_entsorgt | lexi
```

WhatsApp-Text (Route B, mit 8 betroffenen Rezepten):

```
🔴 Kokoswasser Nam Hom = ROT
8 Becher betroffen
Auslöser: letzte_charge_entsorgt
```

### Fehlerbehandlung

- **Doppel-Feuer** (Firebase-Function kann bei parallelen Writes zweimal senden):
  Filter in Schritt 2 (`status_neu != status_alt`) und Data-Store
  `zutaten_last_seen` mit `{key: last_status}` — bei identischem Wert bricht das
  Szenario ab.
- **Sheet nicht erreichbar**: Route A hat Retry 3×; wenn endgültig fehlgeschlagen,
  wird die Zeile in einem Data-Store `sheet_backlog` gepuffert und ein Cron-Sub
  räumt später auf.
- **Cache-Bust-HTTP schlägt fehl**: unkritisch, `order.html` fällt auf den
  Firebase-Live-Read zurück. Nur Log-Warnung.
- **`becher_betroffen`-Berechnung fällt aus**: Message trotzdem senden mit
  `"? Becher"`, nicht das ganze Szenario blockieren.

### Kosten

- Keine Claude-API.
- Make-Ops pro Wechsel: ~8 (Webhook + Filter + Router + Sheet + WhatsApp +
  optional HTTP + Data-Store-Update).
- WhatsApp: 1 Utility-Message pro Rot/Grün-Wechsel (~0,006 USD).
- **Summe: ~0,008 USD ≈ 0,29 THB pro Statuswechsel.**

---

## Setup-Reihenfolge

Peter muss folgendes EINMAL einrichten, bevor die Szenarien aktiviert werden können.
Reihenfolge einhalten — jeder Schritt braucht die vorigen als Vorbedingung.

1. **Google-Drive-Ordner** (Owner: Peter, Freigabe „Schreiben" an Lexi):
   - `100blend/wareneingang-pending/`
   - `100blend/wareneingang-gebucht/`
   - `100blend/wareneingang-manuell/`
   - Ordner-IDs notieren — die werden in Make-Modulen als Watch-Ziel eingetragen.
2. **Firebase-Projekt `blend100-firebase`** — Realtime DB (Region
   `asia-southeast1`) muss existieren, Rules erlauben `read/write` für
   Service-Account. Pfade `chargen/`, `zutaten/`, `rezepte/` initial anlegen.
   Service-Account-JSON in Make als **Firebase Realtime Database → Connection**
   hinterlegen.
3. **Firebase Cloud Functions** (Node 20) mit zwei HTTPS-Push-Triggern:
   - `onChargenStatusChange` — feuert Make-Webhook aus Szenario 2.
   - `onZutatenStatusChange` — feuert Make-Webhook aus Szenario 3.
   Webhook-URLs erst nach dem Anlegen des jeweiligen Make-Szenarios verfügbar →
   Function nachträglich deployen.
4. **Anthropic Claude API-Key** — auf console.anthropic.com generieren, in Make
   als **Environment-Variable** `ANTHROPIC_API_KEY` hinterlegen (Team-Setting,
   nicht pro Szenario). Mindest-Guthaben 20 USD einzahlen.
5. **WhatsApp Business Cloud API** — Meta-Business-Account, WABA-Nummer
   verifiziert. Message-Templates einreichen:
   - `wareneingang_confirm` (utility, 1 Variable)
   - `karrenz_ask` (utility, 2 Variablen, 3 Quick-Reply-Buttons)
   - `karrenz_result_lexi` (utility)
   - `ampel_rot` / `ampel_gruen` (utility)
   In Make als **WhatsApp Business Cloud → Connection** hinterlegen.
6. **Google Sheet „Ampel-Historie"** — neues Sheet, Spalten:
   Datum | Uhrzeit | Zutat | alt | neu | Auslöser | von. Sheet-ID notieren.
7. **Make-Data-Stores** anlegen:
   - `contacts` (Felder: `name`, `whatsapp_e164`)
   - `wareneingang_log`
   - `errors_wareneingang`
   - `pending_karrenz` (Felder: `key`, `gestellt_am`, `deadline`)
   - `zutaten_last_seen`
   - `sheet_backlog`
8. **WhatsApp-Reply-Webhook** — ein Meta-Webhook zeigt bereits auf das bestehende
   Make-Szenario `whatsapp-webhook-in` (KBank-Flow). Dort einen Router
   ergänzen, der Button-IDs mit Präfix `chg_`, `karrenz_` an die passenden
   Handler routet (Sub-Szenarien per **Make-Router → Run a scenario**).
9. **Szenarien in Reihenfolge aktivieren:**
   - Zuerst Szenario 3 (informationell, kein Nebeneffekt) — dann Testen mit
     manuellem `zutaten/{key}/status`-Toggle in Firebase-Console.
   - Dann Szenario 2 — mit einer Test-Charge im Firebase auf
     `karrenz_ablauf_gemeldet` setzen, Timeout auf 5 min setzen (Data-Store),
     einmal komplett durchlaufen lassen.
   - Zuletzt Szenario 1 — mit einem echten Etikett-Foto testen; erst danach den
     Drive-Ordner für Lexi freigeben.
10. **Monatliches Monitoring** — Make-Dashboard einmal pro Woche prüfen:
    Ops-Verbrauch, Fehler-Log `errors_wareneingang`, Data-Store
    `sheet_backlog`. Claude-API-Nutzung im Anthropic-Console-Billing quervergleichen.
