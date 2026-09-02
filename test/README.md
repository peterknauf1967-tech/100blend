# Browser-Tests

Diese Tests fahren einen echten Chromium gegen die Seiten und prüfen das,
was Peter am Gerät sieht. Sie sind entstanden, weil zu viel geraten wurde:
"das müsste jetzt gehen" hat einen halben Tag gekostet.

## Starten

```bash
python3 -m http.server 8099      # im Repo-Wurzelverzeichnis
node test/login-sprache.js
node test/widget-zahnrad.js
```

Beide enden mit Exit-Code 0, wenn alles stimmt.

## Voraussetzung

`playwright-core` muss auffindbar sein:

```bash
npm i -D playwright-core
```

`test/browser.js` sucht Chromium selbständig (`PLAYWRIGHT_BROWSERS_PATH`,
`/usr/bin/chromium`, …). Falls er woanders liegt:

```bash
CHROMIUM_PFAD=/pfad/zu/chrome node test/login-sprache.js
```

Andere Adresse als `127.0.0.1:8099`:

```bash
TEST_URL=http://127.0.0.1:5500 node test/login-sprache.js
```

## Was geprüft wird

| Test | Prüft |
|---|---|
| `login-sprache.js` | Anmeldung als Peter → Oberfläche auf Deutsch (nicht Thai) |
| `widget-zahnrad.js` | Zahnrad im Claude-Widget öffnet die Einstellungen; Sprache und Webhook-URL werden gespeichert |
