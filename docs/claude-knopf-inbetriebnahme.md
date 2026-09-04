# Claude-Knopf — wie die Kette läuft

Stand 02.09.2026, **läuft und ist Ende zu Ende geprüft.** Das Make-Szenario
ist per API gebaut, nicht zusammengeklickt. Wer daran etwas ändert, ändert es
am besten auch per API — sonst driften Anleitung und Wirklichkeit auseinander.

Make-Team `1388828`, Szenario `7200451`, Webhook `3647422`.

## Der Weg einer Meldung

```
Widget (claude-button.js)
   │  POST, mode:'no-cors', Content-Type text/plain
   │  msg_id, ts, page, context, message, content_json, user, lang, ua
   ▼
Modul 2 — Custom Webhook   (Hook 3647422, "10bld-claude")
   │  https://hook.eu1.make.com/v26u2e3zndv7u1jh7fgucyn14tuvbyo6
   ▼
Modul 3 — HTTP POST https://api.anthropic.com/v1/messages
   │  x-api-key, anthropic-version: 2023-06-01
   │  claude-opus-5, max_tokens 8000, System-Prompt, content = {{2.content_json}}
   ▼
Modul 5 — JSON "Transform to JSON"
   │  baut { ts, text, kind, by } und escapt den Antworttext korrekt
   ▼
Modul 4 — HTTP PUT  …/claude_answers/{{2.msg_id}}.json
   │  Rumpf: {{5.json}}
   ▼
Widget holt claude_answers.json per GET (oder firebase-sync, falls Config da)
   ▼
localStorage claude_answers_v1  →  Postkorb im Widget
```

Die `msg_id` hält alles zusammen: das Widget vergibt sie beim Senden, Make
schreibt die Antwort unter genau dieser ID zurück, das Widget findet sie im
Postkorb wieder.

## Drei Fallen, die je einen halben Abend gekostet hätten

**1. `toJSON` gibt es in Make nicht.**
Der Antworttext muss JSON-escapt in den Firebase-Rumpf. Naheliegend wäre
`{{toJSON(...)}}` — die Funktion existiert aber nicht, und Make bricht mit
`Failed to map 'data': Function 'toJSON' not found!` ab. Nach drei solchen
Fehlern schaltet Make das Szenario **von selbst ab** (`maxErrors`), und dann
sieht es von außen aus, als käme einfach nichts zurück. Richtig ist das
Modul **Transform to JSON** aus der JSON-App.

**2. Die Antwort steckt nicht in `content[1]`.**
`claude-opus-5` denkt immer mit. Die Antwort kommt deshalb als
`content: [thinking, text]` — in Make 1-indiziert wäre `content[1]` der
*thinking*-Block, der gar kein `text`-Feld hat. Ergebnis: leere Antworten
im Postkorb, ohne Fehlermeldung. Deshalb wird der Textblock gefiltert:

```
{{join(map(3.data.content; "text"; "type"; "text"); " ")}}
```

**3. `max_tokens` muss das Denken mittragen.**
Gemessen: 507 Output-Tokens, davon 200 fürs Denken. Mit den ursprünglichen
1200 wären längere Antworten mitten im Satz abgeschnitten worden. Jetzt 8000.

## Warum content_json im Browser gebaut wird

Der `content`-Block für die Anthropic-API entsteht in `buildContent()` in
`intern/claude-button.js`, nicht in Make. In Make bräuchte man dafür
`if()`-Formeln mit doppelt escapten Anführungszeichen in einem Rohtextfeld —
nicht testbar, und bei jedem Foto eine andere Struktur.

Im Browser ist es normales JavaScript, und `test/payload-content.js` prüft es
mit echtem Chromium: gültiges JSON, Text- und Bildblock, `media_type`, base64
**ohne** `data:`-Präfix. Der Präfix ist der Klassiker — Anthropic antwortet
darauf mit 400.

## Fehlersuche

Die Ausführungshistorie ist die Quelle der Wahrheit, nicht der rote oder
grüne Kreis im Editor. Sie nennt den Fehler wörtlich, pro Modul. Über die
API:

```
executions_list(scenarioId: 7200451, status: "error")
```

Nützlich sind dort `operations` (3 = bis Anthropic gekommen, 4 = ganz durch)
und `errors` in der Szenario-Liste. Steht das Szenario auf `isActive: false`
und `errors` ist gleich `maxErrors`, hat Make selbst abgeschaltet — dann
erst den Fehler beheben, dann wieder einschalten.

## Firebase

Die Regeln lassen Schreiben auf `claude_answers` zu (geprüft: PUT gibt 200).
Wer die URL kennt, kann dort Einträge anlegen — im Postkorb stünde dann eine
fremde „Antwort". Kein Datenverlust, aber unschön. Sobald der Postkorb
wichtiger wird, gehört ein Secret in die URL oder ein Firebase-Token in
Modul 4.

## Kosten

`claude-opus-5`, rund 2 Cent pro Meldung bei kurzen Antworten (mit Foto etwas
mehr). Das Guthaben von 20 $ reicht also für ungefähr tausend Meldungen.
Wer sparen will: `"model": "claude-sonnet-5"` in Modul 3 — halber Preis, für
kurze Korrekturmeldungen gut genug.
