# Handy einrichten — Lexi (iPhone) und Peter (Android)

Lexi stellt nichts gern ein, und Peter kann ihr auf Thai nicht helfen.
Deshalb steckt die ganze Einrichtung im Link: **einmal antippen, fertig.**
Danach nur noch der Knopf auf den Startbildschirm.

## Die zwei Links

**Für Lexi** (Oberfläche auf Thai, Benutzer `lexi`):

```
https://peterknauf1967-tech.github.io/100blend/intern/standos.html?wh=https%3A%2F%2Fhook.eu1.make.com%2Fsyvpd1xo91yea3rdg5hc1b5nh8bw6ocj&lang=th&user=lexi
```

**Für Peter** (Oberfläche auf Deutsch, Benutzer `peter`):

```
https://peterknauf1967-tech.github.io/100blend/intern/standos.html?wh=https%3A%2F%2Fhook.eu1.make.com%2Fsyvpd1xo91yea3rdg5hc1b5nh8bw6ocj&lang=de&user=peter
```

Beim ersten Öffnen übernimmt die App Webhook, Sprache und Benutzer in den
Gerätespeicher und räumt die Adresse wieder auf. Danach steht in der
Adresszeile nur noch die saubere URL — wichtig, damit der Startbildschirm-Knopf
sich nichts Überflüssiges merkt.

Schick Lexi den Link per WhatsApp. Sie muss **kein einziges Feld** anfassen.

## Knopf auf den Startbildschirm

### iPhone (Lexi)

Muss in **Safari** passieren — in Chrome gibt es den Punkt am iPhone nicht
zuverlässig.

1. Link aus WhatsApp antippen. Öffnet er in Chrome, oben rechts auf die drei
   Punkte → *In Safari öffnen*.
2. Unten in der Mitte auf das **Teilen-Symbol** (Kästchen mit Pfeil nach oben).
3. Liste nach unten schieben → **Zum Home-Bildschirm**
   (thailändisch: *เพิ่มไปยังหน้าจอโฮม*).
4. Oben rechts **Hinzufügen**.

Auf dem Startbildschirm liegt jetzt ein Symbol namens **MIXO**. Öffnet
bildschirmfüllend, ohne Adresszeile — sieht aus wie eine App.

### Android (Peter)

1. Link in **Chrome** öffnen.
2. Oben rechts die drei Punkte → **Zum Startbildschirm hinzufügen**
   (bei neueren Versionen: *App installieren*).
3. **Installieren** bestätigen.

## Immer die aktuelle Fassung

Muss niemand von Hand erzwingen. Der Service Worker holt HTML und
JavaScript grundsätzlich frisch aus dem Netz und greift nur dann auf den
Cache zurück, wenn kein Netz da ist (am Marktstand der Normalfall). Bilder
und Symbole kommen aus dem Cache — die ändern sich ohnehin nicht.

Kontrolle: unten links auf jeder Seite steht der Build-Stempel. Stimmt der
mit dem letzten Deploy überein, ist die Fassung aktuell. **Diesem Stempel
kann man jetzt trauen** — bis zum 02.09.2026 stand dort ein fest
eingetippter Text, der bei keinem Deploy mitwanderte und einen halben Tag
Fehlersuche gekostet hat. Seither setzt ihn `deploy.sh` aus einer einzigen
Quelle.

Falls doch einmal etwas klebt: Seite in Chrome/Safari einmal neu laden, oder
das Symbol vom Startbildschirm löschen und den Link erneut hinzufügen.

## Zurück-Taste statt Zurück-Knöpfe

Im Claude-Fenster gibt es keine eigenen „zurück"-Knöpfe mehr. Die echte
Zurück-Taste des Geräts (Android) bzw. die Wischgeste (iPhone) nimmt genau
eine Ebene weg:

```
Detail  →  Postkorb-Liste  →  Fenster zu  →  (erst dann) Seite verlassen
```

Das gilt genauso für die Einstellungen. `test/zurueck-taste.js` prüft jede
dieser Ebenen in einem echten Browser.
