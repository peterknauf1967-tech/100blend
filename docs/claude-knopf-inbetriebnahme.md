# Claude-Knopf — Inbetriebnahme

Stand 02.09.2026. Das Make-Szenario ist **per API gebaut**, nicht per Hand
zusammengeklickt. Wer daran etwas ändert, ändert es am besten auch per API —
sonst driften Anleitung und Wirklichkeit wieder auseinander.

## Der Weg einer Meldung

```
Widget (claude-button.js)
   │  POST, mode:'no-cors', Content-Type text/plain
   │  Nutzlast: msg_id, ts, page, context, message, content_json, user, lang, ua
   ▼
Make Modul 2 — Custom Webhook  (hook 3647422, Label "10bld-claude")
   ▼
Make Modul 3 — HTTP POST https://api.anthropic.com/v1/messages
   │  Header: x-api-key, anthropic-version: 2023-06-01
   │  Rumpf: Modell + System-Prompt + "content": {{2.content_json}}
   ▼
Make Modul 4 — HTTP PUT  …/claude_answers/{{2.msg_id}}.json
   │  Rumpf: { ts, text, kind, by }
   ▼
firebase-sync.js  (onValue auf claude_answers)
   ▼
localStorage claude_answers_v1  →  Postkorb im Widget
```

Die `msg_id` hält das Ganze zusammen: das Widget vergibt sie beim Senden,
Make schreibt die Antwort unter genau dieser ID zurück, das Widget findet
sie im Postkorb wieder.

## Warum content_json im Browser gebaut wird

Der `content`-Block für die Anthropic-API entsteht in `buildContent()` in
`intern/claude-button.js`, nicht in Make. In Make müsste man dafür
`if()`-Formeln mit doppelt escapten Anführungszeichen in ein Rohtext-Feld
schreiben — nicht testbar, und bei jedem Foto eine andere Struktur.

Im Browser ist es normales JavaScript, und `test/payload-content.js` prüft
es mit echtem Chromium: gültiges JSON, Text- und Bildblock, `media_type`,
base64 **ohne** `data:`-Präfix. Der Präfix ist der Klassiker — Anthropic
antwortet darauf mit 400, und im Postkorb stünde wieder ewig
"in Warteschlange".

## Was noch fehlt

### 1. Anthropic-API-Key

Modul 3 trägt im Header `x-api-key` noch den Platzhalter
`REPLACE_MIT_DEINEM_ANTHROPIC_KEY`. Der Key von console.anthropic.com
(`sk-ant-api03-…`) muss dort hinein. Er gehört **nicht** ins Repo — die
Seiten liegen öffentlich auf GitHub Pages.

### 2. Firebase-Schreibrechte für `claude_answers`

Modul 4 schreibt ohne Anmeldung. Die Regeln der Realtime Database müssen
das für diesen einen Zweig erlauben, sonst kommt ein 401 zurück und die
Antwort landet nie im Postkorb:

```json
{
  "rules": {
    "claude_answers": { ".read": true, ".write": true },
    "$rest": { ".read": false, ".write": false }
  }
}
```

Das ist bewusst eng: nur `claude_answers` ist offen, alles andere bleibt zu.
Wer die URL kennt, kann dort Einträge schreiben — im Postkorb stünde dann
eine fremde "Antwort". Kein Datenverlust, aber unschön. Sobald der
Postkorb wichtiger wird, gehört davor ein Secret in der URL oder ein
Firebase-Token in Modul 4.

### 3. Danach: einschalten und einmal durchtesten

Das Szenario steht auf **inaktiv**. Erst den Key setzen, dann einschalten —
sonst läuft Modul 3 in 401er, und Make schaltet nach 3 Fehlern von selbst ab.

Nach dem ersten Test lohnt der Blick in die Ausführungshistorie: sie zeigt
pro Modul die tatsächliche Anfrage und Antwort. Das ist die Quelle der
Wahrheit, nicht der rote oder grüne Kreis im Editor.
