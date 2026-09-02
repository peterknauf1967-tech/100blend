#!/usr/bin/env bash
# 100blend Deploy-Helfer
#
# Setzt ALLE Versionsstempel und Cache-Namen in einem Rutsch, damit sie
# nicht auseinanderdriften. Am 02.09.2026 hat genau das einen halben Tag
# gekostet: unten auf jeder Seite stand ein handgeschriebenes "v2026-08-30",
# das bei keinem Deploy mitwanderte. Peter las diesen Stempel ab, meldete
# "immer noch 30.08." -- und wir haben stundenlang Browser-Caches gejagt,
# obwohl die App längst aktuell war.
#
#   ./deploy.sh              -> Stempel + Caches setzen, Diff zeigen
#   ./deploy.sh --commit     -> zusätzlich committen und pushen
#
# Zeit ist immer Bangkok (UTC+7), weil Peter dort auf die Uhr schaut.

set -euo pipefail
cd "$(dirname "$0")"

NOW="$(TZ=Asia/Bangkok date +'%Y-%m-%d %H:%M')"
echo "Build-Zeit (Bangkok): $NOW"

# 1) Build-Stempel unten auf jeder Seite
for f in intern/standos.html intern/kasse.html intern/rezepte.html; do
  sed -i -E "s/window\.__BUILD = \"[^\"]*\"/window.__BUILD = \"$NOW\"/" "$f"
done

# 2) VERSION-Konstante im Kopf von standos.html
sed -i -E "s/const VERSION  = \"[0-9-]+ [0-9:]+\"/const VERSION  = \"$NOW\"/" intern/standos.html

# 3) Service-Worker-Caches hochzählen, damit die Geräte die neuen
#    Dateien wirklich holen statt aus dem Cache zu bedienen.
bump() {  # $1 = Datei, $2 = Praefix (z.B. blend-os-v)
  local datei="$1" praefix="$2"
  local alt neu
  alt="$(grep -oE "${praefix}[0-9]+" "$datei" | head -1)"
  neu="${praefix}$(( ${alt#"$praefix"} + 1 ))"
  sed -i "s/${alt}/${neu}/g" "$datei"
  echo "  $datei: $alt -> $neu"
}
bump intern/sw-os.js "blend-os-v"
bump intern/sw.js    "blend-einkauf-v"

# 4) Kontrolle: stimmen alle Stempel überein?
echo
echo "Gesetzte Stempel:"
grep -h -oE 'window\.__BUILD = "[^"]*"' intern/standos.html intern/kasse.html intern/rezepte.html
grep -oE 'const VERSION  = "[^"]*"' intern/standos.html

if [ "${1:-}" = "--commit" ]; then
  git add -A
  git commit -m "Deploy $NOW"
  git push origin main
  echo "Gepusht."
else
  echo
  echo "Nichts committed. Mit --commit auch committen und pushen."
fi
