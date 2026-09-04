# Frische-Konzept 100blend

> **Zweck:** Verfügbarkeit, Frische und Wareneingang zu einem einzigen,
> automatisch reagierenden System zusammenschalten. Alles fließt aus **einer**
> Wahrheitsquelle: Firebase Realtime DB. Kasse, Kundenseite (`order.html`),
> Einkauf, Werbung und Reporting hören zu — keiner pflegt doppelt.

Dieses Dokument ist der **Bauplan**. Es fasst drei zusammenhängende Bausteine
zusammen, die aus drei getrennten Gesprächen zwischen Peter und Claude hervorgingen:

1. **Zutaten-Ampel** — jede Zutat hat einen Zustand 🟢/🟡/🔴.
2. **Frische-Chargen** — jede angesetzte Menge (v.a. Flüssigkeiten) lebt für sich.
3. **Wareneingang per Foto** — neue Ware kommt per Etikett-Foto ins System.

Alle drei greifen ineinander. Sie müssen zusammen gebaut werden, sonst
verliert man die Automatik.

---

## Grundprinzip

**Ein Feld = eine Wahrheit.** Wenn Lexi eine Zutat auf rot setzt, ändert sich
genau ein Firebase-Feld — und die ganze App reagiert daraufhin. Es gibt keine
Kopien, keine parallelen Zustände, keine „hoffentlich haben wir das überall
angepasst"-Momente.

**Regel für alle drei Bausteine:**
- Ampelstatus einer Zutat wird aus den Chargen berechnet — nicht separat gepflegt.
- Chargen entstehen entweder durch Wareneingang (fertig gekauft) oder durch
  Zubereitung (z.B. Lexi kocht Hafermilch).
- Wareneingang schreibt IMMER eine Charge, nie nur eine Ampel-Änderung.

---

## Baustein 1 — Zutaten-Ampel

Jede Zutat hat einen von drei Zuständen. Alle Anzeigen im System richten
sich danach.

| Ampel | Bedeutung | Wirkung |
|---|---|---|
| 🟢 GRÜN | mindestens eine frische Charge da | Alles läuft normal |
| 🟡 GELB | nur noch Restbestand ODER Karenz-Charge | Nur verkaufen, nicht bewerben; auf Einkaufsliste vormerken |
| 🔴 ROT | keine verfügbare Charge mehr | Kettenreaktion (siehe unten) |

### Ableitungsregel (wird nicht manuell gesetzt, sondern berechnet)

```
FOR jede zutat:
  chargen = alle chargen dieser zutat, wo status in [frisch, karrenz]
  IF chargen leer:                        → ROT
  ELSE IF alle chargen menge_rest < 20%:  → GELB
  ELSE IF eine charge in karrenz:         → GELB
  ELSE:                                    → GRÜN
```

### Kettenreaktion bei ROT

Sobald `zutaten/{key}/status = rot` in Firebase gesetzt wird, hört alles zu
und reagiert automatisch. Nichts davon muss Lexi anfassen:

```
🔴 {zutat} = ROT
      │
      ├── kasse.html
      │       └── alle Becher, die diese Zutat brauchen, werden ausgegraut
      │           (sichtbar, aber nicht antippbar — damit Lexi weiß, warum
      │           gerade weniger im Angebot ist)
      │
      ├── order.html (Kundenseite)
      │       └── betroffene Becher werden komplett aus der Karte ausgeblendet
      │           (Kunde erwartet dann gar nichts erst)
      │
      ├── QR-Werbung / Screensaver
      │       └── betroffene Becher raus aus der Rotation
      │
      ├── einkauf.html
      │       └── Zutat rutscht oben in die Einkaufsliste, rot markiert
      │           „SOFORT BESORGEN"
      │
      └── standos.html (Standort-Dashboard für Peter aus der Ferne)
              └── zeigt „N Becher aktuell nicht verkaufbar"
              └── Push an Peter via WhatsApp (via Make-Szenario 3)
```

### Bestätigung bei kritischen Zutaten

Zutaten, die in vielen Rezepten stecken (z.B. Limette in 13 von 24 Rezepten),
lösen vor dem Ausschalten eine **Bestätigung** aus:

> „Limette auf ROT setzen? Dadurch werden **8 Becher** nicht mehr verkaufbar.
>  [Trotzdem rot] [Abbrechen]"

Regel: Wenn eine Zutat in ≥ 5 aktiven Rezepten steckt → Bestätigung nötig.

---

## Baustein 2 — Frische-Chargen

Jede Menge einer verderblichen Zutat lebt ihr eigenes Leben — von der
Zubereitung/Anbruch bis zur Entsorgung.

### Datenmodell (siehe `firebase-schema.json` für Details)

```
charge {
  id:              hafermilch_2026-08-31_1430
  zutat_key:       hafermilch
  produziert_am:   2026-08-31T14:30:00+07:00
  produziert_von:  lexi
  menge_ml:        1000
  menge_rest:      1000        ← wird bei jedem Verkauf runtergerechnet
  ablauf_am:       2026-09-03T14:30:00+07:00   ← auto = produziert + 3 Tage
  karrenz_bis:     null        ← wird gesetzt nach 4-Sinne-Check
  status:          frisch | abgelaufen_pruefen | karrenz | entsorgen | aufgebraucht
  peter_freigaben: [ { ts, entscheidung:"ok+24h"|"weg", karrenz_stunden:24 } ]
  beleg_foto_url:  (optional, Etikett-Foto bei Wareneingang; null bei Zubereitung)
}
```

### Kühlschrank-Haltbarkeit (Basiswerte, in Firebase pro Zutat gepflegt)

| Flüssigkeit | Frisch/Hausgemacht | Angebrochen (Tetra) |
|---|---|---|
| Hafermilch | 3 Tage | 4–5 Tage |
| Mandelmilch | 3 Tage | 4–5 Tage |
| Reismilch | 3 Tage | 4–5 Tage |
| Sojamilch | 2–3 Tage | 4 Tage |
| Kokosmilch aus junger Nuss | 2 Tage | 3–4 Tage |
| Kokoswasser frisch | 24 h | 3 Tage |
| Grüner Tee kalt | 24 h | – |
| Limetten-/Zitronensaft frisch | 24 h | – |
| Ingwerwasser | 3 Tage | – |
| Kurkuma-Aufguss | 2 Tage | – |
| Pandan-Wasser | 24–48 h | – |
| Frische Fruchtsäfte gepresst | 24 h | – |

*Regel für Lexi:* Im Zweifel entsorgen. 60 THB Milch < 1 kranker Kunde.

**Nüsse/Kerne im Anbruch** (Ölgehalt → ranzig):
- Sonnenblumenkerne geschält: 2–4 Wochen
- Cashews: 6–8 Wochen
- Mandeln: 6–10 Wochen
- Kürbiskerne: 4–6 Wochen
- Chiasamen: 8–12 Wochen

### Lagerungsmatrix — wo und bei wieviel Grad nach Anbruch

Jede Zutat trägt in Firebase ein `lagerung`-Feld: `kuehlschrank`, `gefrierschrank`,
`trocken_kuehl`, `raumtemperatur`. Danach richtet sich Karenz + Aroma-Timer.

**🧊 Kühlschrank (2–4 °C, luftdicht verschlossen)**

| Zutat (angebrochen / hausgemacht) | Haltbar |
|---|---|
| Alle Nussmilchen (Hafer, Mandel, Soja, Cashew) — hausgemacht | 3 Tage |
| Alle Nussmilchen — Tetra angebrochen | 4–5 Tage |
| Kokosmilch aus junger Nuss | 2 Tage |
| Kokoswasser frisch | 24 h |
| Frisch gepresste Fruchtsäfte | 24 h |
| Frische Wurzelgewürze (Ingwer, Kurkuma, Galgant) *— in Küchentuch* | 2–3 Wochen |
| Frische Kräuter (Minze, Basilikum) *— Stiel in Wasserglas + Beutel drüber* | 5–7 Tage |
| Passionsfrucht ganz | 5–7 Tage |
| Beeren (Erdbeere) | 3 Tage |
| Zitrusfrüchte (Limette) | 2–3 Wochen |
| Junge Kokosnuss ganz | 5–7 Tage |
| **Nüsse/Kerne im Anbruch — kalt gelagert** | **Verdoppelt sich** (z.B. Sonnenblumenkerne 4→8 Wochen) |
| Angeschnittene Mango/Papaya | 2 Tage |

**❄️ Gefrierschrank (-18 °C, IQF-Schockfroster oder Beutel dicht)**

| Zutat | Haltbar |
|---|---|
| IQF-Früchte (Mango, Erdbeere, Ananas) | 6 Monate |
| Vorbereitete Gefrierbeutel-Packs (Rezept-Komponenten) | **3 Monate** (dann Aroma-Verlust) |
| Bananen geschält + geschnitten | 3 Monate |
| Frische Kräuter in Öl-Würfeln (Eiswürfelform) | 3 Monate |
| Ingwer geschält, portioniert | 6 Monate |

**🥫 Trocken, dunkel, kühl (unter 20 °C, unter 60 % Luftfeuchte, luftdicht)**

| Zutat | Haltbar (angebrochen) |
|---|---|
| Nüsse/Kerne bei Raumtemperatur | siehe Tabelle oben (kürzer als kalt) |
| Ceylon-Zimt Pulver | 6 Monate |
| Getrocknete Gewürze (ganz) | 12 Monate |
| Getrocknete Gewürze (gemahlen) | 6 Monate |
| Schwarze Pfefferkörner ganz | 2–3 Jahre |
| Trockenobst (ungezuckert) | 6 Monate |
| Hafer-/Reisflocken | 6 Monate |
| Kakao-Nibs | 12 Monate |

**🌡️ Raumtemperatur (20–25 °C)**

| Zutat | Haltbar |
|---|---|
| Reife Tropenfrüchte zum Nachreifen (Mango, Papaya, Ananas) | 2–3 Tage |
| Bananen (grün → gelb) | 3–5 Tage |
| Ganze Zwiebeln, Knoblauch (dunkel/luftig) | Wochen |

**⚠️ Häufige Lager-Fehler in Thailand (wichtig für Lexi)**

- **Kühlschrank oft nicht kalt genug**: Klimaanlage kämpft in der offenen Küche.
  Regel: Digitales Thermometer im Kühlschrank, tägliche Kontrolle. Bei >6 °C
  Haltbarkeit halbieren.
- **Feuchtigkeit im Trockenlager**: Bei 80 % Luftfeuchte (Regenzeit) werden
  Nüsse muffig. Silica-Gel-Beutel in jeden Behälter, alle 2 Monate erneuern.
- **Sonneneinstrahlung**: Öle in Nüssen/Kernen werden UV-oxidiert. Trockenlager
  darf keinen Fensterplatz haben. Dunkelbraune Gläser oder undurchsichtige Boxen.
- **Kondenswasser bei kalten Zutaten**: Wenn Milch aus dem Kühlschrank kommt
  und sofort geöffnet wird → Kondenswasser tropft rein → Keime. **Regel:**
  Deckel erst nach 30 Sekunden Ausgleich öffnen.

### Ablauf am Stand

```
① Lexi macht Hafermilch
      → EIN Klick in der Kasse: „🥛 Neue Charge Hafermilch"
      → Firebase schreibt Charge (jetzt = produziert, +3 Tage = ablauf)
      → Etikett mit QR-Code + Ablaufdatum druckt aus → aufs Glas kleben

② Solange status=frisch
      → alle Becher mit Hafermilch verkaufen sich normal
      → bei jedem Verkauf: menge_rest -= verwendete Menge

③ ablauf_am erreicht
      → Kasse zeigt beim nächsten Becher mit Hafermilch ein Modal:
        „⚠️ Charge abgelaufen — 4-Sinne-Check"
      → Checkliste erscheint (siehe unten)

④a Alle 4 Punkte ✅
      → status = karrenz
      → karrenz_bis = now + 24h
      → Charge weiter nutzbar für 1 Tag

④b Ein Punkt ❌
      → status = entsorgen
      → Charge sofort blockiert

⑤ karrenz_bis erreicht
      → Kasse schreibt: status = karrenz_ablauf_gemeldet
      → Make-Szenario 2 löst aus → WhatsApp an Peter:
        „Charge {zutat} {datum} — Lexi meldet noch frisch.
         Freigabe? OK+24 | OK+48 | WEG"
      → Peters Antwort setzt: karrenz_bis = now + N,
        ODER status = entsorgen
      → Ohne Peters Antwort in 2h: automatisch entsorgen

⑥ status = entsorgen
      → Kasse blockt alle Becher, die diese Charge brauchen
      → Ableitungsregel (siehe Baustein 1) rechnet neu:
        WENN alle Chargen dieser Zutat entsorgt/aufgebraucht sind
        → zutat.status = rot → Kettenreaktion startet
```

### Frische-Check — die 4-Sinne-Prüfung

Wenn eine Charge abläuft, wird die App-Checkliste angezeigt. Lexi tippt jeden
Punkt ✅ oder ❌. **Alle 4 müssen ✅ sein**, sonst sofort entsorgen.

| Sinn | Prüfen auf | Rot-Zeichen (→ ❌) |
|---|---|---|
| **👃 Nase** | neutral, nussig | sauer, hefig, fermentiert |
| **👁 Auge** | homogen, milchig | Klümpchen, Grieß, rosa/gelbe Verfärbung |
| **👅 Zunge** *(1 Tropfen)* | leicht süß/nussig | Kribbeln, säuerlich, „prickelt" |
| **👂 Physik** *(Deckel schütteln)* | still | Gasbläschen, Zisch beim Öffnen |

---

## Baustein 3 — Wareneingang per Foto

Neue Ware kommt an → Foto vom Etikett → alles Weitere automatisch. Kein
manuelles Abtippen mehr.

### Ablauf

```
① Ware kommt am Stand an (z.B. 2 kg Sonnenblumenkerne, 169 THB)
      ↓
② Lexi drückt in der Kasse: 📸 „Wareneingang"
      ↓
③ Kamera → Foto vom Etikett → wird nach Google Drive geladen:
      Ordner: 100blend/wareneingang-pending/
      Dateiname: yyyy-mm-dd_hh-mm_<Lexi-oder-Peter>.jpg
      ↓
④ Make.com sieht neuen Foto (Watch Files) — Trigger für Szenario 1
      ↓
⑤ Make schickt Foto an Claude API (Vision) mit festem Extraktions-Prompt
      ↓
⑥ Claude gibt strukturiertes JSON zurück:
      {
        hersteller:     "Liz BCO",
        produkt:        "Sonnenblumenkerne geschält",
        variante:       "roh, ungesalzen",
        menge_g:        2000,
        preis_thb:      169,
        preis_pro_kg:   84.50,
        mfg:            "2025-08",
        mhd:            "2026-02",
        zertifikate:    ["HACCP","GMP"],
        werbe_tauglich: ["HACCP-zertifiziert"],
        kategorie:      "trockenware/nuesse-kerne"
      }
      ↓
⑦ Make bucht in Firebase:
      - Neue Charge: chargen/sonnenblumenkerne_2026-08-31_ID
      - Falls Zutat noch nicht existiert: zutaten/sonnenblumenkerne mit Grunddaten
      - Foto-Link als beleg_foto_url speichern
      - Foto verschieben nach 100blend/wareneingang-gebucht/
      ↓
⑧ WhatsApp an Peter (Make Szenario 1 finaler Schritt):
      „✅ NEU: Sonnenblumenkerne 2000g für 169 THB gebucht
       — MHD Feb 26 — passt? [Ja] [korrigieren]"
      Peter tippt „Ja" → nichts weiter. „korrigieren" → Formular zum Nacheditieren.
```

### Datenmodell für Trockenware/Nüsse

Anders als bei Frischware sind Brix/Duft irrelevant. Was zählt:

| Feld | Beispiel |
|---|---|
| hersteller | Liz BCO |
| produkt | Sonnenblumenkerne, geschält, roh |
| verpackung_g | 2000 |
| preis_thb | 169 (= 84,50 THB/kg) |
| mfg | 2025-08 |
| mhd | 2026-02 |
| roestung | false |
| salz | false |
| zertifikate | [HACCP, GMP] |
| lager | trocken, dunkel, unter 20°C |
| **anbruch_ts** | (leer bis Öffnen; dann läuft interner Aroma-Timer) |
| **anbruch_haltbar_tage** | 21 (aus Zutaten-Basiswerten) |

### Zertifikate → automatisches Werbematerial

Auf jedem Etikett stehen 1–3 Zertifikate (HACCP, GMP, „Non-GMO", „Organic
Thailand" etc.). Die werden mit-erfasst. Und dann:

- Wenn ein **Rezept** ausschließlich Zutaten mit HACCP verwendet → auf der
  Kundenseite steht bei diesem Becher automatisch „🛡️ HACCP-zertifizierte
  Zutaten".
- Sobald eine Zutat ohne HACCP dazukommt → Claim verschwindet automatisch.

Dadurch kann Marketing nie versehentlich einen falschen Claim tragen.

---

## Verzahnung — wie die drei Bausteine ineinandergreifen

```
        Wareneingang (Baustein 3)
                │
                ▼
        neue Charge angelegt
                │
                ▼
        Chargen-Verwaltung (Baustein 2)
                │
                ▼
        Ableitungsregel
                │
                ▼
        Zutaten-Ampel (Baustein 1)
                │
                ▼
        Kettenreaktion (Kasse, order, einkauf, Werbung, Peter)
```

**Doppelpflege = null.** Nichts wird zweimal irgendwo eingetragen. Die
Ampel folgt den Chargen. Die Chargen folgen dem Wareneingang. Alles baut
aufeinander auf.

---

## Was Peter tun muss (2. Nase & Werbe-OK)

Peter greift nur in zwei Fällen ein:
1. **Karenz-Verlängerung** — Lexi will eine Milch länger benutzen, als der
   Standard-Karenz-Puffer erlaubt. Peter bekommt eine WhatsApp und tippt
   `OK+24` / `OK+48` / `WEG`.
2. **Neuer Wareneingang** — Peter bestätigt kurz die extrahierten Daten
   („Ja" oder „korrigieren"). Dauert 5 Sekunden pro Wareneingang.

Alles andere macht das System.

---

## Was Lexi tun muss

1. **Wareneingang**: Foto vom Etikett → Ein Klick, fertig.
2. **Anbruch von Trockenware**: Beim Öffnen einer neuen Packung → Ein Klick
   „🔓 angebrochen" → Aroma-Timer läuft.
3. **Neue Milch/Frisches ansetzen**: Ein Klick → „🥛 Neue Charge {zutat}" →
   Etikett druckt aus, aufs Glas kleben.
4. **Verkaufen**: normal.
5. **Zutat leer/verdorben (nicht abgelaufen, sondern bemerkt)**: Ein roter
   Knopf pro Zutat in der Kasse.
6. **4-Sinne-Check bei ablaufenden Chargen**: Popup abarbeiten.

Alles andere macht das System.

---

## Umsetzung — Reihenfolge

Bau nicht alles auf einmal. Reihenfolge, die schnell Nutzen bringt:

**Phase 1 (Woche 1) — Fundament**
- [ ] Firebase-Realtime-DB-Projekt neu aufsetzen oder das im Repo vorhandene
  benutzen.
- [ ] Datenmodell aus `firebase-schema.json` einspielen.
- [ ] Firebase-Client-SDK in `intern/kasse.html`, `intern/einkauf.html`,
  `order.html` einbinden.
- [ ] Zutaten-Ampel-Panel in `kasse.html` mit Ein-Klick-Buttons pro Zutat.
- [ ] Ampel-Anzeige in `order.html` (rot = ausblenden).

**Phase 2 (Woche 2) — Frische-Chargen**
- [ ] Chargen-Modell in Firebase.
- [ ] „Neue Charge"-Button in Kasse für die üblichen frischen Zutaten.
- [ ] Ablauf-Erkennung (Cron im Client oder Firebase Cloud Function).
- [ ] 4-Sinne-Check-Modal.
- [ ] Ableitungsregel Chargen → Ampel.

**Phase 3 (Woche 3) — Wareneingang per Foto**
- [ ] Google-Drive-Ordner `wareneingang-pending` und `-gebucht` anlegen.
- [ ] Make-Szenario 1 (siehe `make-scenarios.md`) einrichten.
- [ ] „📸 Wareneingang"-Button in Kasse.
- [ ] WhatsApp-Bestätigungsschleife an Peter.

**Phase 4 (Woche 4) — Peter-in-the-Loop & Reporting**
- [ ] Make-Szenario 2 (Karenz-Freigabe).
- [ ] Make-Szenario 3 (Ampel-Log & Standort-Dashboard).
- [ ] Standos-Dashboard-Erweiterung.
- [ ] Auswertung „welche Zutat wird am häufigsten weggeworfen?" → Einkaufsmengen
  anpassen.

**Aufwand insgesamt: ~4 volle Arbeitstage** verteilt über die 4 Wochen. Fast
alles einmalig — läuft danach ohne Zutun.

---

## Kosten (laufend)

- Firebase Realtime DB: für eure Größe **gratis** (Spark-Tier reicht: 1 GB
  Storage, 10 GB Traffic/Monat).
- Google Drive: eh vorhanden.
- Make.com: die vorhandene Instanz genügt (Wareneingang ~10× pro Tag →
  <300 Ops/Monat).
- **Claude API** für Etikett-Extraktion: Vision-Call pro Wareneingang ~2 THB
  (Sonnet, 1 Foto, ~500 Ausgabe-Tokens). Bei 300 Wareneingängen/Monat
  → **~600 THB/Monat**. Bezahlt sich beim ersten vermiedenen Fehlbuchungs-Kunden zurück.
- WhatsApp Business API: Peters Push-Nachrichten sind bei ~5 pro Tag praktisch
  kostenlos (die ersten 1000 Konversationen/Monat sind gratis).

**Gesamt-Laufkosten: geschätzt 800 THB/Monat.** Weniger als eine weggeworfene
Charge Cashewmilch pro Woche.

---

## Verwandte Dokumente

- `docs/firebase-schema.json` — konkretes Datenmodell mit Beispieldaten.
- `docs/make-scenarios.md` — die drei Automations-Szenarien Schritt für Schritt.
- `CLAUDE.md` (Root) — Kasse-Grundlagen, Betriebspartner, Cross-Session-Regeln.

---

## Nicht vergessen

- **Firebase-Security-Rules** müssen VOR dem Livegang gesetzt sein. Ohne
  Regeln kann jeder mit der App-URL alles überschreiben. Details in
  `firebase-schema.json`.
- **Backups**: Firebase RTDB einmal wöchentlich exportieren (Firebase-Konsole,
  „Export JSON") und in Google Drive ablegen. Ein Make-Szenario reicht auch dafür.
- **Peter braucht eine dedizierte WhatsApp-Nummer** für die Push-Nachrichten,
  wenn er die private nicht verwenden will. Twilio oder MessageBird bieten
  Thai-Business-Nummern für ~$1/Monat.
