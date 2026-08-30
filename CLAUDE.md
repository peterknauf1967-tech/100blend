# CLAUDE.md — 100blend Repo

> Diese Datei ist das **Gedächtnis für jede neue Claude-Session** in diesem Repo.
> Lies sie zuerst, bevor du irgendwas anfasst. Wenn du (Claude) hier etwas
> Wichtiges neu lernst — trag es hier ein. Sonst weiß die nächste Session es nicht.

Betreiber: **VivaPure GmbH** (Peter Knauf). Lokaler Betriebspartner in Thailand: **Lexi**.
Domain: siehe `CNAME`. Zielmärkte: Thailand (Start Pattaya), später Vietnam.

Übergeordneter Kontext (Markenkern, Rezept-System, Zutaten-Strategie,
2-Komponenten-Betriebssystem, Zucker-Ampel, Ceylon-Zimt-Regel, Pfeffer in
Schritt 1 etc.) steht in der **Luxfox-`CLAUDE.md`** — nicht duplizieren, nur ergänzen.

---

## Repo-Struktur (Stand 2026-08-30)

```
index.html          — öffentliche Startseite 100blend
order.html          — Kunden-Bestellseite (öffentlich)
bilder/             — Bild-Assets
CNAME               — Custom-Domain für GitHub Pages
intern/             — NICHT öffentlich verlinkt, aber im Repo (kein Login!)
  kasse.html        — Kassen-App (POS) am Stand — Kernstück des Betriebs
  einkauf.html      — Einkaufsliste / Wareneingang
  rezepte.html      — Rezept-Datenbank (24 Rezepte)
  standos.html      — Standort-Übersicht/Steuerung
  standort-tour.html— Tour-Modus für neue Standorte
  verkostung.html   — Verkostungs-Protokoll
  sprachen.html     — Übersetzungs-Editor DE/TH/EN
  uebernehmen.html  — Schicht-Übergabe
  rettung.html      — Backup/Notfall
  reset.html        — Reset-Werkzeug
  firebase/         — Firebase-Config
  sw*.js, *.webmanifest — PWA-Installation
```

Deploy: GitHub Pages via Push auf `main`. Kein Build-Schritt. Reines
HTML+JS+CSS, funktioniert offline (PWA).

---

## Kasse (`intern/kasse.html`) — wie sie tickt

### Was sie ist
Reine Client-App im Browser. **Kein Backend, keine Datenbank** — Zustand liegt
im `localStorage` des jeweiligen Geräts. Jedes Tablet/Handy ist eine eigene
Kasse mit eigenen Einstellungen. Sync passiert nur, wenn `CFG.sync` gesetzt ist.

### Config-Objekt `CFG` (localStorage-Key `kb_cfg`)
```
loc     — Standort-Nummer (z. B. "01")
name    — Händlername auf Bon/QR, max 25 Zeichen
city    — Stadt
pptype  — "phone" | "natid"   (PromptPay-Typ)
ppid    — PromptPay-ID des Empfängers (Handynr. oder 13-stellige Thai-ID)
sync    — URL des Sync-Webhooks (Google-Sheet / Make.com); leer = keine Sync
lang    — "de" | "th" | "en"
```

Sichtbar in der Kasse unter **Einstellungen (⚙️)**.

### PromptPay-QR — wichtig
- Kasse erzeugt **live pro Bezahlung** einen EMVCo-PromptPay-QR mit
  Empfänger + Betrag drin.
- Wenn `CFG.ppid` leer → auf dem Bezahl-Screen erscheint **„⚠ nicht gesetzt"**
  und der QR ist nur ein Test-Code — keine echte Zahlung möglich.
- Es gibt **nur privaten PromptPay** (Handynr. oder Thai-ID). **Merchant-QR
  (K SHOP / K-Merchant) ist aktuell NICHT implementiert.** Wenn Umsatz Richtung
  VAT-Schwelle geht (~1,8 Mio THB/Jahr) → nachrüsten.

### Externe Voraussetzung
Die eingetragene PromptPay-ID muss in der **K-PLUS-App auf dem KBank-Konto
registriert** sein. Ohne diese Registrierung kann der Kunde scannen, aber das
Geld findet kein Ziel.

### Aktueller Setup-Stand
- KBank-Konto: **auf Lexis Namen** (Thai-Nominee für Grab & Kassenzahlungen).
- PromptPay: Lexis Handynummer bei KBank registriert (bitte in K-PLUS
  verifizieren, falls unsicher).
- Steuerlich läuft aktuell alles als Lexis Privatumsatz → o. k. für die
  Anlaufphase, spätestens vor VAT-Schwelle auf K-Merchant migrieren.

---

## Grab-Fluss — trennt sich vom Kassen-QR

Grab-Bestellungen laufen **nicht** über den Kassen-QR:
1. Kunde bestellt in der Grab-App → bezahlt in Grab.
2. Grab überweist den Netto-Betrag (nach Provision) tages-/wochenweise aufs
   hinterlegte Bankkonto = **Lexis KBank-Konto**.
3. Am Stand ist Grab nur ein „Kanal" — die Kasse hat dafür einen eigenen
   Kanal-Wert (`KANAL`), damit im Sync erkennbar ist, ob es Walk-in oder
   Grab war.

**Make.com-Automation** (Setup lief in vorheriger Session): eingehende
Grab-Bestellung → Make-Szenario → Push in die Kasse / Google-Sheet.
Details bitte im Make-Konto nachsehen; sobald ich (Claude) das Szenario
in einer Session neu anschaue, hier ergänzen.

---

## Sync-Feld (`CFG.sync`)

Die Kasse postet jeden Verkauf per `fetch(CFG.sync, POST)` mit dem Body:
```
{ typ: "verkauf", geraet: "Kasse <loc>", verkaeufe: [...] }
```
Ziel ist entweder ein **Google-Apps-Script-Webhook** (auf ein Google Sheet)
oder ein **Make.com-Webhook**. Wenn `sync` leer bleibt, sammelt jedes Gerät
nur für sich — dann gibt es keine zentrale Auswertung.

---

## Sprache im Betrieb

- **Arbeitssprache am Stand: Thai.** Lexi kassiert, Peter kontrolliert.
- UI-Sprachen: Deutsch (Peter), Thai (Lexi), Englisch (Backup/Touristen).
- Übersetzungen werden gepflegt in `intern/sprachen.html`.
- Zutaten-Glossar (TH/EN) im Kopf von `kasse.html` — bei Änderungen von Lexi
  gegenlesen lassen.

---

## Rezepte

- 24 Rezepte, gepflegt in `intern/rezepte.html` (und einer JSON-Struktur, die
  von Lexi/Native gegengelesen wird).
- Quelle & Grundlage: 2 Google-Docs
  („20 Super-Smoothies …" + „Rohkost-Smoothie-Sammlung – Thailand Edition").
- Zucker-Ampel (grün/gelb/rot) ist Teil jeder Rezept-Karte — nie entfernen.

---

## Design & Assets

- Farbe/Logo aus Luxfox-Familie (`luxfox-logo*.svg/.png`) — 100blend erbt
  visuell von Luxfox.
- Icons für PWA: `intern/icon-192.png`, `intern/icon-512.png`.

---

## Regeln für Claude in diesem Repo

1. **Zuerst Kontext prüfen.** Bevor du eine Datei änderst, `grep`/lies rein.
   Rate nicht.
2. **Kein Login vor `intern/`.** Wenn du das ändern willst, frag Peter zuerst.
3. **Kein Backend hinzufügen**, ohne dass Peter das ausdrücklich will. Die
   Kasse muss auch bei ausgefallenem Internet weiter kassieren.
4. **PromptPay-Modus nur erweitern, nicht umbauen.** Wenn Merchant-QR
   dazukommen soll: als zusätzlicher `pptype`-Wert (`merchant`), nicht
   anstelle der bestehenden.
5. **Regel „Ceylon-Zimt, nicht Cassia" und „Pfeffer in Schritt 1"** aus der
   Luxfox-CLAUDE.md gilt auch hier — nicht wegoptimieren.
6. **Diese Datei lebt.** Wenn du in einer Session etwas Wichtiges lernst
   (neue Kasse-Config-Felder, neue Standorte, neue Make-Szenarien, neue
   Bankverbindung), trag es hier ein und committe es. Das ist unser
   gemeinsames Gedächtnis über Sessions hinweg.

---

## Cross-Session-Workflow (Handy ↔ PC)

Peter arbeitet oft am Handy und dann am PC. Damit keine Session verloren
geht:
- **Vor Wechsel**: „commit und push" sagen — dann ist alles im Repo.
- **Nach Wechsel**: entweder dieselbe Session auf claude.ai/code
  wiederöffnen (voller Verlauf), oder in einer neuen Session einfach dieses
  Repo aufmachen — dank dieser `CLAUDE.md` ist die neue Session sofort im
  Bilde.

---

## Kontakt / Verantwortlichkeiten

- **Peter Knauf** — Owner, Produkt, Rezepte, Strategie.
- **Lexi** — lokaler Betrieb Pattaya, Kasse, Kundenkontakt.
- **VivaPure GmbH** — rechtlicher/steuerlicher Rahmen.
