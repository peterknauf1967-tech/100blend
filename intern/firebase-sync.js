/*!
 * 100blend – Firebase Realtime DB Sync (optional, opt-in)
 *
 * Aktiviert sich NUR, wenn Peter unter localStorage.firebase_config eine
 * gueltige JSON-Konfiguration hinterlegt. Ohne Config: 100% no-op — die App
 * laeuft exakt wie vorher. Wenn aktiv, spiegelt das Modul drei localStorage-
 * Baeume in Firebase Realtime DB und zurueck: Ampel, Chargen, Wareneingang.
 * Firebase RTDB puffert Offline-Writes selbststaendig — wir muessen nichts
 * extra tun.
 *
 * Einbindung:  <script src="firebase-sync.js" defer></script>
 * Setup ueber Claude-Button-Panel oder direkt:
 *   localStorage.firebase_config = JSON.stringify({apiKey,authDomain,databaseURL,projectId})
 *   localStorage.firebase_debug  = "1"     ← optional Debug-Chip
 *
 * Auf Ampel-Aenderungen aus der Cloud feuert das Modul das DOM-Event
 * 'ampel-cloud-sync', damit die UI selbst refresht.
 */
(function () {
  'use strict';
  if (window.__firebaseSyncLoaded) return;
  window.__firebaseSyncLoaded = true;

  // ---------- Config lesen ----------
  var cfgRaw = null, cfg = null;
  try { cfgRaw = localStorage.getItem('firebase_config'); } catch (_) {}
  if (!cfgRaw || !cfgRaw.trim()) {
    console.info('firebase-sync inactive: no config');
    return;
  }
  try { cfg = JSON.parse(cfgRaw); }
  catch (e) { console.warn('firebase-sync inactive: config invalid JSON', e); return; }
  if (!cfg || !cfg.databaseURL) {
    console.warn('firebase-sync inactive: databaseURL missing');
    return;
  }

  var debug = false;
  try { debug = localStorage.getItem('firebase_debug') === '1'; } catch (_) {}

  // ---------- SDK dynamisch nachladen ----------
  var SDK_APP = 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
  var SDK_DB  = 'https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js';

  var app, db, refs = {}, pending = 0, online = false, chip = null;

  function log(){ if (debug) try { console.log.apply(console, ['[fb-sync]'].concat([].slice.call(arguments))); } catch(_){} }

  Promise.all([ import(SDK_APP), import(SDK_DB) ]).then(function(mods){
    var appMod = mods[0], dbMod = mods[1];
    app = appMod.initializeApp(cfg);
    db  = dbMod.getDatabase(app);

    refs = {
      ref: dbMod.ref, onValue: dbMod.onValue, set: dbMod.set,
      update: dbMod.update, push: dbMod.push, child: dbMod.child,
      onDisconnect: dbMod.onDisconnect, serverTimestamp: dbMod.serverTimestamp
    };

    if (debug) buildChip();

    // Connection-Status
    var connRef = refs.ref(db, '.info/connected');
    refs.onValue(connRef, function(snap){
      online = !!snap.val();
      log('connected =', online);
      updateChip();
    });

    // Drei Bindings
    bindAmpel();
    bindChargen();
    bindWareneingang();
    /* --- ZERTIFIKATE: START --- */
    bindZertifikate();
    /* --- ZERTIFIKATE: ENDE --- */

    log('firebase-sync ready', cfg.projectId || cfg.databaseURL);
  }).catch(function(err){
    console.error('firebase-sync SDK load failed:', err);
  });

  // ---------- Hilfen ----------
  function q(k){ try { return localStorage.getItem(k); } catch(_){ return null; } }
  function qs(k,v){ try { localStorage.setItem(k,v); } catch(_){} }
  function parseJSON(s, fallback){
    if (s == null) return fallback;
    try { return JSON.parse(s); } catch(_) { return fallback; }
  }
  function nowIso(){ return new Date().toISOString(); }
  function markPending(){ pending++; updateChip(); }
  function markDone(){ pending = Math.max(0, pending-1); updateChip(); }

  // Zwei Speicherorte fuer die Ampel unterstuetzen:
  //   1) 'blend_ampel_v1'  → {code: 'gruen'|'gelb'|'rot', ...}
  //   2) 'blend_os_v1'.ampel → dasselbe Schema, aber verschachtelt.
  function readAmpel(){
    var a = parseJSON(q('blend_ampel_v1'), null);
    if (a && typeof a === 'object') return { source:'flat', data:a };
    var os = parseJSON(q('blend_os_v1'), null);
    if (os && os.ampel && typeof os.ampel === 'object') return { source:'os', data:os.ampel };
    return { source:'flat', data:{} };
  }
  function writeAmpel(nextData, source){
    if (source === 'os') {
      var os = parseJSON(q('blend_os_v1'), {}) || {};
      os.ampel = nextData;
      qs('blend_os_v1', JSON.stringify(os));
    } else {
      qs('blend_ampel_v1', JSON.stringify(nextData));
    }
  }

  // ---------- Ampel-Sync ----------
  function bindAmpel(){
    var lastSent = {};   // code -> {status, ts}
    var suppressNextLocal = false;   // damit Cloud-Push kein Local->Cloud-Echo triggert

    // 1) Cloud → Local (Listener)
    var zutRef = refs.ref(db, 'zutaten');
    refs.onValue(zutRef, function(snap){
      var v = snap.val() || {};
      var cur = readAmpel();
      var nextData = Object.assign({}, cur.data);
      var changed = false;
      for (var code in v) {
        var cloudStatus = v[code] && v[code].status;
        if (!cloudStatus) continue;
        var localEntry = nextData[code];
        var localStatus = localEntry && typeof localEntry === 'object' ? localEntry.status : localEntry;
        if (localStatus !== cloudStatus) {
          nextData[code] = (localEntry && typeof localEntry === 'object')
            ? Object.assign({}, localEntry, { status: cloudStatus, ts: v[code].ts || nowIso() })
            : cloudStatus;
          lastSent[code] = { status: cloudStatus, ts: v[code].ts || nowIso() };
          changed = true;
        }
      }
      if (changed) {
        suppressNextLocal = true;
        writeAmpel(nextData, cur.source);
        try { window.dispatchEvent(new Event('ampel-cloud-sync')); } catch(_){}
        log('ampel: pulled from cloud', Object.keys(v).length, 'entries');
      }
    });

    // 2) Local → Cloud (Poll alle 2 s + storage-Event)
    function pushLocal(){
      if (suppressNextLocal) { suppressNextLocal = false; return; }
      var cur = readAmpel();
      for (var code in cur.data) {
        var e = cur.data[code];
        var status = (e && typeof e === 'object') ? e.status : e;
        if (!status) continue;
        var prev = lastSent[code];
        if (prev && prev.status === status) continue;
        var payload = { status: status, ts: nowIso(), by: q('who') || 'unbekannt' };
        markPending();
        refs.set(refs.ref(db, 'zutaten/'+code+'/status'), status)
          .then(function(){ markDone(); })
          .catch(function(err){ markDone(); log('ampel push fail', code, err); });
        refs.set(refs.ref(db, 'zutaten/'+code+'/ts'), payload.ts).catch(function(){});
        refs.set(refs.ref(db, 'zutaten/'+code+'/by'), payload.by).catch(function(){});
        lastSent[code] = { status: status, ts: payload.ts };
        log('ampel push', code, '→', status);
      }
    }
    setInterval(pushLocal, 2000);
    window.addEventListener('storage', function(e){
      if (e.key === 'blend_ampel_v1' || e.key === 'blend_os_v1') pushLocal();
    });
    // Erster Push nach kurzer Wartezeit
    setTimeout(pushLocal, 1500);
  }

  // ---------- Chargen-Sync ----------
  // Chargen leben in S.chargen_frisch innerhalb 'blend_os_v1'. Struktur:
  //   { id: {zutat_key, produziert_am, menge_ml, ...} }
  function readChargen(){
    var os = parseJSON(q('blend_os_v1'), null);
    if (!os) return {};
    var c = os.chargen_frisch;
    if (!c || typeof c !== 'object') return {};
    return c;
  }
  function writeChargen(next){
    var os = parseJSON(q('blend_os_v1'), {}) || {};
    os.chargen_frisch = next;
    qs('blend_os_v1', JSON.stringify(os));
  }

  function bindChargen(){
    var lastSent = {};      // id -> JSON-string
    var suppressLocal = false;

    var chRef = refs.ref(db, 'chargen');
    refs.onValue(chRef, function(snap){
      var v = snap.val() || {};
      var cur = readChargen();
      var next = Object.assign({}, cur);
      var changed = false;
      for (var id in v) {
        var cloud = v[id];
        var local = cur[id];
        // Last-write-wins per Timestamp
        var cTs = cloud && cloud.updated_at ? Date.parse(cloud.updated_at) : 0;
        var lTs = local && local.updated_at ? Date.parse(local.updated_at) : 0;
        if (!local || cTs > lTs) {
          next[id] = cloud;
          lastSent[id] = JSON.stringify(cloud);
          changed = true;
        }
      }
      if (changed) {
        suppressLocal = true;
        writeChargen(next);
        try { window.dispatchEvent(new Event('chargen-cloud-sync')); } catch(_){}
        log('chargen: pulled from cloud', Object.keys(v).length);
      }
    });

    function pushLocal(){
      if (suppressLocal) { suppressLocal = false; return; }
      var cur = readChargen();
      for (var id in cur) {
        var s = JSON.stringify(cur[id]);
        if (lastSent[id] === s) continue;
        var payload = Object.assign({}, cur[id], { updated_at: cur[id].updated_at || nowIso() });
        markPending();
        refs.set(refs.ref(db, 'chargen/'+id), payload)
          .then(function(){ markDone(); })
          .catch(function(err){ markDone(); log('charge push fail', id, err); });
        lastSent[id] = s;
        log('charge push', id);
      }
    }
    setInterval(pushLocal, 3000);
    window.addEventListener('storage', function(e){
      if (e.key === 'blend_os_v1') pushLocal();
    });
    setTimeout(pushLocal, 2000);
  }

  // ---------- Wareneingang-Sync ----------
  // wareneingang_pending ist ein Array. Wir pushen jeden Eintrag als
  // neuen Datensatz mit push()-ID nach 'wareneingang/{id}' und leeren
  // die lokale Warteschlange erst, wenn der Write bestaetigt ist.
  function readPending(){
    return parseJSON(q('wareneingang_pending'), []) || [];
  }
  function writePending(a){ qs('wareneingang_pending', JSON.stringify(a || [])); }

  function bindWareneingang(){
    var busy = false;
    function flush(){
      if (busy) return;
      var arr = readPending();
      if (!arr.length) return;
      busy = true;
      var item = arr[0];
      var enriched = Object.assign({}, item, {
        synced_at: nowIso(),
        client_id: (item.ts||'') + '-' + (item.wer||'') + '-' + (item.quelle||'')
      });
      var newRef = refs.push(refs.ref(db, 'wareneingang'));
      markPending();
      refs.set(newRef, enriched).then(function(){
        markDone();
        var rest = readPending().slice(1);
        writePending(rest);
        try { window.dispatchEvent(new Event('wareneingang-cloud-sync')); } catch(_){}
        log('wareneingang push ok, rest:', rest.length);
        busy = false;
        if (rest.length) flush();
      }).catch(function(err){
        markDone();
        log('wareneingang push fail', err);
        busy = false;
      });
    }
    setInterval(flush, 4000);
    window.addEventListener('storage', function(e){
      if (e.key === 'wareneingang_pending') flush();
    });
    window.addEventListener('online', flush);
    setTimeout(flush, 2500);
  }

  /* --- ZERTIFIKATE: START ---
   * Spiegelt localStorage.blend_zertifikate_v1 (Objekt {code:[cert,...]}) mit
   * Firebase-Zweig 'zutaten/{code}/zertifikate'. Symmetrisches Muster wie
   * die Ampel: Cloud → Local per Listener, Local → Cloud per Poll + Storage-
   * Event. Feuert bei Cloud-Aktualisierung 'zertifikate-cloud-sync'.
   */
  var ZERTKEY = 'blend_zertifikate_v1';
  function readZerts(){
    var z = parseJSON(q(ZERTKEY), null);
    return (z && typeof z === 'object') ? z : {};
  }
  function writeZerts(next){ qs(ZERTKEY, JSON.stringify(next || {})); }

  function bindZertifikate(){
    // sicherstellen, dass der Key existiert
    if (q(ZERTKEY) == null) writeZerts({});

    var lastSent = {};                 // code -> JSON-string des Arrays
    var suppressNextLocal = false;     // Cloud-Pull soll kein Echo triggern

    // 1) Cloud → Local
    var zutRef = refs.ref(db, 'zutaten');
    refs.onValue(zutRef, function(snap){
      var v = snap.val() || {};
      var cur = readZerts();
      var next = Object.assign({}, cur);
      var changed = false;
      for (var code in v) {
        var cloudList = v[code] && v[code].zertifikate;
        if (!Array.isArray(cloudList)) continue;
        var localList = Array.isArray(next[code]) ? next[code] : [];
        var a = cloudList.slice().sort().join('|');
        var b = localList.slice().sort().join('|');
        if (a !== b) {
          next[code] = cloudList.slice();
          lastSent[code] = JSON.stringify(next[code]);
          changed = true;
        }
      }
      if (changed) {
        suppressNextLocal = true;
        writeZerts(next);
        try { window.dispatchEvent(new Event('zertifikate-cloud-sync')); } catch(_){}
        log('zerts: pulled from cloud');
      }
    });

    // 2) Local → Cloud
    function pushLocal(){
      if (suppressNextLocal) { suppressNextLocal = false; return; }
      var cur = readZerts();
      for (var code in cur) {
        if (!Array.isArray(cur[code])) continue;
        var s = JSON.stringify(cur[code].slice().sort());
        if (lastSent[code] === s) continue;
        markPending();
        refs.set(refs.ref(db, 'zutaten/'+code+'/zertifikate'), cur[code])
          .then(function(){ markDone(); })
          .catch(function(err){ markDone(); log('zerts push fail', code, err); });
        lastSent[code] = s;
        log('zerts push', code, '→', cur[code]);
      }
    }
    setInterval(pushLocal, 2500);
    window.addEventListener('storage', function(e){
      if (e.key === ZERTKEY) pushLocal();
    });
    setTimeout(pushLocal, 1800);
  }
  /* --- ZERTIFIKATE: ENDE --- */

  // ---------- Debug-Chip ----------
  function buildChip(){
    if (chip) return;
    chip = document.createElement('div');
    chip.style.cssText = 'position:fixed;top:8px;right:8px;background:#1a1a1a;color:#fff;' +
      'font:12px/1.3 system-ui,-apple-system,sans-serif;padding:6px 10px;border-radius:14px;' +
      'z-index:10005;box-shadow:0 2px 8px rgba(0,0,0,.3);opacity:.9;pointer-events:none;';
    chip.textContent = '🔥 FB …';
    (document.body || document.documentElement).appendChild(chip);
    updateChip();
  }
  function updateChip(){
    if (!chip) return;
    chip.textContent = '🔥 FB ' + (online ? 'online' : 'offline') + ' · ' + pending + ' pending';
    chip.style.background = online ? '#0aa367' : '#c94a3a';
  }

})();
