# Der Claude-Button

> **Zweck:** Vom Handy aus mit einem Tipp jede Korrektur, jeden Wareneingang,
> jede Notiz an der richtigen Stelle im System landen lassen — ohne Menüs, ohne
> Formulare, ohne „wo trage ich das ein?".
>
> Ergänzt Baustein 3 (Wareneingang per Foto) aus `frische-konzept.md`.

## Das Problem

Lexi am Stand oder Peter unterwegs sehen einen Fehler in der App:
- Der Preis einer Zutat ist falsch — **169 THB waren für die ganze 2-kg-Packung, nicht pro kg**.
- Der Hersteller ist falsch geschrieben.
- Eine Zutat fehlt in der Datenbank.
- Ein Rezept braucht eine Anpassung.
- Eine neue Zertifizierung ist am Etikett.
- Ein Foto vom Marktbon ist zu buchen.
- Eine Anmerkung zu einer Charge („Lieferant hat sich entschuldigt, war zu warm gelagert").

Bisher: entweder mühsam durch die App klicken, oder per WhatsApp an Peter, der dann selbst tippt. Verluste, Verzögerung, Fehler.

## Die Lösung: EIN Knopf, überall gleich

**Auf jedem Screen der App (Kasse, Rezepte, Einkauf, Standos, Order) sitzt derselbe schwebende Knopf unten rechts:**

```
        ┌────────────┐
        │  🤖 Claude │   ← schwebender Button, immer erreichbar
        └────────────┘
```

Ein Tipp → **ein einziges Eingabefeld** öffnet sich mit drei Möglichkeiten in einem:

| Eingabe-Modus | Auslöser | Wofür |
|---|---|---|
| **📸 Foto** | Kamera-Icon | Etikett, Marktbon, Zustand einer Charge, Bildschirmfoto einer falschen Zeile |
| **🎤 Sprache** | Mikro-Icon | „Sonnenblumenkerne Preis korrigieren, 169 Baht war für zwei Kilo, nicht pro Kilo" |
| **⌨️ Text** | Standardtippen | Kurze schriftliche Notizen oder Korrekturen |

Kombinierbar: Foto + Sprache in einem Rutsch („dieses Etikett zu Sonnenblumenkernen, korrigiere den Preis").

## Was passiert nach dem Tipp

```
① Lexi/Peter tippt "Claude" auf dem Handy
        ↓
② Eingabe (Foto + Sprache/Text) wird lokal aufgenommen
        ↓
③ Upload nach Google Drive:
     Ordner:   100blend/claude-inbox/
     Struktur: yyyy-mm-dd_hh-mm_<user>_<zufalls-id>/
                 message.txt          (Sprache-zu-Text + Text)
                 photo_1.jpg          (falls Foto)
                 context.json         (welcher Screen, welche Zutat war offen, etc.)
        ↓
④ Make.com Trigger: neuer Ordner in claude-inbox/
        ↓
⑤ Make ruft Claude API mit einem Router-Prompt:
     "Analysiere diese Nachricht + Kontext + Fotos.
      Entscheide: welcher Vorgang?
      - wareneingang (neue Ware kommt rein)
      - korrektur_zutat (bestehende Zutat aendern)
      - korrektur_charge (bestehende Charge aendern)
      - korrektur_wareneingang (bestehenden Beleg aendern)
      - neue_zutat (Zutat existiert noch nicht)
      - neues_rezept (Rezept anlegen)
      - korrektur_rezept (Rezept aendern)
      - notiz (nur Text, kein Datenaenderung)
      - bug_report (App-Fehler)
      Und gib den konkreten Firebase-Pfad + JSON-Patch zurueck."
        ↓
⑥ Claude gibt strukturierte Antwort:
     {
       vorgang: "korrektur_wareneingang",
       ziel_pfad: "wareneingang/we_2026-09-01_liz-bco_007/claude_extraktion",
       aenderungen: {
         preis_satang_gesamt: 16900,      // 169 THB
         preis_satang_pro_kg: 8450,       // 84,50 THB/kg
         _hinweis: "Preis war irrtuemlich als pro-kg gebucht; korrigiert auf Gesamtpreis fuer 2-kg-Packung."
       },
       nachwirkung: ["chargen/sonnenblumenkerne_2026-09-01_1120 bleibt unveraendert"],
       confidence: 0.95,
       menschliche_bestaetigung_noetig: false
     }
        ↓
⑦ Make prueft:
     - confidence >= 0.85 UND menschliche_bestaetigung_noetig = false
         → direkt in Firebase schreiben
     - sonst → WhatsApp-Freigabe von Peter einholen:
       "Claude hat verstanden: {vorgang}. Aenderung: {kurzbeschreibung}. [OK] [ABBRECHEN] [ANDERS]"
        ↓
⑧ Bestaetigung an den Absender:
     Push zurueck aufs Handy:
     "✅ Preis Sonnenblumenkerne korrigiert: 169 THB fuer 2 kg (= 84,50/kg)."
     ODER
     "⚠️ Unklar — Peter prueft."
        ↓
⑨ Original-Ordner wird verschoben:
     Erledigt   → 100blend/claude-erledigt/
     Manuell    → 100blend/claude-manuell/
     Fehler     → 100blend/claude-fehler/
```

## Warum das robust ist

**Kein „falsches Formular" mehr möglich.** Der Absender muss nicht wissen, wo im Datenmodell die Info hingehört — Claude routet.

**Multi-modal — spielt keine Rolle, wie du es sagst.**
- „Der Preis von den Sonnenblumenkernen ist falsch — 169 war für 2 kg, nicht pro kg." → richtig geroutet.
- Foto vom Etikett ohne Text → wird als neuer Wareneingang behandelt.
- „Hafermilch von heute Vormittag hat komischen Geruch, ich werf sie weg." → routet zu Charge, Status auf `entsorgen`, Ampel-Ableitung folgt.

**Kontext-aware.** Die App schickt mit, welcher Screen offen war, welche Zutat gerade markiert war, welcher Becher zuletzt verkauft wurde. Claude nutzt das, um Zweideutigkeiten aufzulösen.

**Peter behält Kontrolle.** Jede Änderung mit `confidence < 0.85` ODER an sensiblen Feldern (Preis > 500 THB, Zutat-Löschung, Rezept-Struktur) geht per WhatsApp zur Freigabe. Peter tippt `OK` oder `ABBRECHEN`. Ohne Antwort in 30 min → Anfrage wird zurückgestellt, Absender bekommt Info.

**Audit-Trail.** Jede Claude-Änderung schreibt in `audit_log/{ts}`:
```json
{
  ts: "2026-09-02T10:14:22+07:00",
  ausloeser: "claude_button",
  user: "peter",
  eingabe_ref: "claude-inbox/2026-09-02_10-13_peter_abc123/",
  vorgang: "korrektur_wareneingang",
  ziel_pfad: "wareneingang/we_2026-09-01_liz-bco_007/claude_extraktion/preis_satang_gesamt",
  alt: 33800,
  neu: 16900,
  claude_confidence: 0.95,
  peter_freigabe: null
}
```
Damit ist bei jeder Änderung nachvollziehbar wer, wann, wie, warum — inklusive Original-Fotos und Text-Transkript.

## Wo der Button überall sitzt

Ein einziges Web-Component `<claude-button>`, in **allen** HTML-Seiten identisch eingebunden:

- `intern/kasse.html` — mit Kontext: aktueller Warenkorb, aktive Zutat-Ampel-Ansicht
- `intern/einkauf.html` — mit Kontext: aktuelle Einkaufsliste
- `intern/rezepte.html` — mit Kontext: geöffnetes Rezept
- `intern/standos.html` — mit Kontext: Standort-Übersicht
- `order.html` (Kundenseite) — **nur für eingeloggte Mitarbeiter**, sonst versteckt

Weil es dieselbe Komponente ist: **eine Änderung** in der Komponente wirkt überall.

## Datenmodell (Ergänzung zu firebase-schema.json)

Zwei neue Top-Level-Nodes:

```
claude_inbox/          -- offene, noch nicht verarbeitete Eingaben
   {inbox_id}/
     ts, user, screen_context, message, photo_refs[]

audit_log/             -- jede automatisierte Aenderung
   {log_id}/
     ts, ausloeser, user, vorgang, ziel_pfad, alt, neu,
     claude_confidence, peter_freigabe
```

Zusätzliches Feld an bestehenden Records:
```
letzte_claude_aenderung: {ts, log_id}   -- optional, für "wann zuletzt automatisch angefasst"
```

## Kosten (laufend)

- Router-Call an Claude API: pro Aktion ~1–3 THB (Sonnet, kurze Eingabe + strukturiertes JSON zurück).
- Bei angenommen **20 Claude-Button-Aktionen pro Tag** → ~40–60 THB/Tag → ~1.500 THB/Monat.
- WhatsApp-Freigaben: praktisch kostenlos (unter 1000 Konversationen/Monat gratis).

**Fällt in dieselbe Größenordnung wie eine weggeworfene Charge Mandelmilch pro Woche.** Der Zeitgewinn und die Fehlervermeidung sind ein Vielfaches davon.

## Umsetzung — Reihenfolge

**Phase A (2 Tage) — MVP**
- [ ] `<claude-button>` Web-Component bauen (Foto + Text; Sprache in Phase B).
- [ ] Google-Drive-Ordner `claude-inbox`, `claude-erledigt`, `claude-manuell`, `claude-fehler`.
- [ ] Ein Make-Szenario: Watch `claude-inbox` → Claude Router-Call → Firebase schreiben ODER WhatsApp-Freigabe.
- [ ] Einbindung in `kasse.html` als erste Seite.

**Phase B (1 Tag) — Sprache**
- [ ] Speech-to-Text im Browser (Web Speech API, native auf iOS/Android).
- [ ] Fallback: Audio-Upload → Claude verarbeitet als Vision+Audio.

**Phase C (1 Tag) — Kontext & Audit**
- [ ] `context.json`-Generator in der Web-Component (welcher Screen, welche Zutat, welcher Warenkorb).
- [ ] `audit_log`-Node befüllen.
- [ ] „Undo letzte Claude-Änderung"-Button für Peter (kritisch für Vertrauen).

**Phase D (halber Tag) — Rollout**
- [ ] Button in alle übrigen Screens.
- [ ] Kurze Video-Anleitung für Lexi (30 Sek., Thai).

**Aufwand: ~4 halbe Tage.** Danach läuft es dauerhaft.

## Kritische Sicherheitspunkte

1. **Wer darf welche Änderungen auslösen?** — Firebase-Rules:
   - `lexi_uid` → darf `korrektur_zutat`, `korrektur_charge`, `wareneingang`, `notiz`, `bug_report`.
   - `peter_uid` → darf zusätzlich `korrektur_wareneingang`, `neues_rezept`, `korrektur_rezept`, alles über 500 THB Wert.
   - Fremde Uid → wird abgelehnt, Foto landet in `claude-fehler/`.

2. **Änderungen an Preis, Rezept-Struktur, Zutat-Löschung** → **immer** Peter-Freigabe, egal wie hoch confidence.

3. **Undo-Fenster**: Jede Claude-Änderung ist 24 h lang rückgängig machbar durch Peter. Nach 24 h wird sie „endgültig" gestempelt.

4. **PII/Datenschutz**: Marktbons oder Kundenzettel im Foto → OCR extrahiert Text, aber Fotos werden nach 90 Tagen automatisch gelöscht.

## Verwandte Dokumente

- `docs/frische-konzept.md` — Baustein 3 (Wareneingang per Foto) ist die Vorstufe.
- `docs/firebase-schema.json` — Datenmodell (wird um `claude_inbox`, `audit_log` erweitert).
- `docs/make-scenarios.md` — Router-Szenario wird als Szenario 4 ergänzt.

---

## Beispiel: der ausgelöste Sonnenblumenkerne-Fix

Real passiert am 02.09.2026: Peter sah in der App, dass der Preis für die 2-kg-Packung Sonnenblumenkerne fälschlich als 169 THB/kg (= 338 THB gesamt) gebucht war. So hätte der Claude-Button das gelöst:

**Peter tippt Claude-Button (Kontext: er sieht gerade den Wareneingang-Screen):**
> „Der Preis von den Sonnenblumenkernen ist falsch, die 169 Baht waren für die ganze 2-kg-Packung, nicht pro Kilo."

**In ~10 Sekunden:**
```
✅ Preis Sonnenblumenkerne (Liz BCO, 2 kg) korrigiert:
   169 THB gesamt = 84,50 THB/kg.
   Alte Zahl (338 THB gesamt) wurde in audit_log/ gesichert.
   Peter hat 24 h Zeit für Undo.
```

**Kein Menü aufrufen, kein Formular ausfüllen, keine Doppel-Eingabe.**
