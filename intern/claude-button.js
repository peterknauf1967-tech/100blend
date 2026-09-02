/*!
 * 100blend – Claude-Button MVP
 * Drop-in Widget: schwebender Button unten rechts, oeffnet Modal fuer
 * Foto/Sprache/Text-Meldungen; sendet an Webhook (Make.com) oder puffert
 * offline in localStorage; DE/TH bilingual. Reines Vanilla-JS, keine Deps.
 *
 * Einbindung:   <script src="claude-button.js" defer></script>
 * Konfiguration im Browser:
 *   localStorage.claude_webhook_url  = "https://hook.eu2.make.com/..."
 *   localStorage.who                 = "peter" | "lexi"
 * Kontext optional pro Seite:
 *   window.__CLAUDE_CTX = { zutat: "sonnenblumenkerne", charge: "…" };
 */
(function () {
  'use strict';
  if (window.__claudeButtonLoaded) return;   // Doppel-Laden verhindern
  window.__claudeButtonLoaded = true;

  // ---------- Sprache ermitteln (Thai wenn kb_lang_th="1" oder <html lang=th>) ----------
  function isThai() {
    try { if (localStorage.getItem('kb_lang_th') === '1') return true; } catch (_) {}
    var l = (document.documentElement.lang || '').toLowerCase();
    return l.indexOf('th') === 0;
  }

  var T = {
    de: {
      btn: '🤖 Claude',
      title: '🤖 Claude — was möchtest du korrigieren oder melden?',
      page: 'Seite',
      context: 'Kontext',
      time: 'Zeit',
      photo: '📸 Foto',
      mic_start: '🎤 Sprechen',
      mic_stop: '⏹ Stopp',
      placeholder: 'Was ist zu tun? Sprich einfach frei — z.B. „Preis der Sonnenblumenkerne war 169 für 2 kg, nicht pro kg"',
      send: '✅ Senden',
      cancel: 'Abbrechen',
      settings: '⚙',
      webhook_label: 'Webhook-URL (Make.com):',
      who_label: 'Benutzername:',
      we_webhook_label: 'Wareneingang-Webhook (separat, optional):',
      fb_cfg_label: 'Firebase Config (JSON, optional):',
      save: 'Speichern',
      close: 'Schließen',
      ok_sent: '✅ Gesendet — Claude bearbeitet gleich.',
      err_queued: '⚠ Nicht gesendet — bleibt in Warteschlange',
      no_webhook: 'Kein Webhook konfiguriert. Nachricht wird als Datei angeboten.',
      download: '⬇ Payload herunterladen',
      queue_hint: 'in Warteschlange',
      speech_unsupported: 'Spracheingabe wird von diesem Browser nicht unterstützt.'
    },
    th: {
      btn: '🤖 Claude',
      title: '🤖 Claude — คุณต้องการแก้ไขหรือแจ้งอะไร?',
      page: 'หน้า',
      context: 'บริบท',
      time: 'เวลา',
      photo: '📸 ถ่ายรูป',
      mic_start: '🎤 พูด',
      mic_stop: '⏹ หยุด',
      placeholder: 'ต้องการทำอะไร? พูดได้เลย เช่น „ราคาเมล็ดทานตะวัน 169 บาท ต่อ 2 กก. ไม่ใช่ต่อ กก."',
      send: '✅ ส่ง',
      cancel: 'ยกเลิก',
      settings: '⚙',
      webhook_label: 'Webhook URL (Make.com):',
      who_label: 'ชื่อผู้ใช้:',
      we_webhook_label: 'Webhook รับสินค้า (แยก, ไม่บังคับ):',
      fb_cfg_label: 'Firebase Config (JSON, ไม่บังคับ):',
      save: 'บันทึก',
      close: 'ปิด',
      ok_sent: '✅ ส่งแล้ว — Claude กำลังดำเนินการ',
      err_queued: '⚠ ส่งไม่สำเร็จ — เก็บไว้ในคิว',
      no_webhook: 'ยังไม่ได้ตั้งค่า webhook — จะให้ดาวน์โหลดเป็นไฟล์แทน',
      download: '⬇ ดาวน์โหลดข้อมูล',
      queue_hint: 'ในคิว',
      speech_unsupported: 'เบราว์เซอร์นี้ไม่รองรับการพูด'
    }
  };
  function tr() { return isThai() ? T.th : T.de; }

  // ---------- CSS injizieren ----------
  var css = '' +
  '.cbtn-fab{position:fixed;right:16px;bottom:16px;width:56px;height:56px;border-radius:50%;' +
    'background:#0aa367;color:#fff;border:0;font-size:22px;line-height:56px;text-align:center;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.28);cursor:pointer;z-index:9999;padding:0;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;transition:background .15s;}' +
  '.cbtn-fab:hover{background:#0dbf7a;}' +
  '.cbtn-fab:active{transform:scale(.96);}' +
  '.cbtn-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;' +
    'border-radius:10px;background:#e63946;color:#fff;font-size:12px;line-height:20px;' +
    'font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.3);}' +
  '.cbtn-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:none;' +
    'align-items:flex-end;justify-content:center;}' +
  '.cbtn-overlay.open{display:flex;}' +
  '.cbtn-modal{background:#fff;width:100%;max-width:480px;border-radius:16px 16px 0 0;' +
    'padding:16px;box-sizing:border-box;max-height:92vh;overflow-y:auto;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#222;}' +
  '@media(min-width:600px){.cbtn-overlay{align-items:center;}' +
    '.cbtn-modal{border-radius:16px;}}' +
  '.cbtn-h{font-size:17px;font-weight:600;margin:0 0 8px;line-height:1.3;}' +
  '.cbtn-ctx{font-size:12px;color:#666;margin:0 0 12px;line-height:1.4;}' +
  '.cbtn-ctx b{color:#333;}' +
  '.cbtn-ta{width:100%;min-height:110px;box-sizing:border-box;padding:10px;font-size:15px;' +
    'border:1px solid #ccc;border-radius:8px;resize:vertical;font-family:inherit;}' +
  '.cbtn-ta:focus{outline:2px solid #0aa367;border-color:#0aa367;}' +
  '.cbtn-row{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap;}' +
  '.cbtn-b{flex:1;min-width:110px;padding:10px 12px;border-radius:8px;border:1px solid #ccc;' +
    'background:#f5f5f5;font-size:14px;cursor:pointer;font-family:inherit;color:#222;}' +
  '.cbtn-b:hover{background:#eaeaea;}' +
  '.cbtn-b[disabled]{opacity:.5;cursor:not-allowed;}' +
  '.cbtn-b.primary{background:#0aa367;color:#fff;border-color:#0aa367;font-weight:600;}' +
  '.cbtn-b.primary:hover{background:#0dbf7a;}' +
  '.cbtn-b.rec{background:#e63946;color:#fff;border-color:#e63946;}' +
  '.cbtn-prev{margin:8px 0;display:none;position:relative;}' +
  '.cbtn-prev img{max-width:100%;max-height:200px;border-radius:8px;display:block;}' +
  '.cbtn-prev button{position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;' +
    'border:0;width:28px;height:28px;border-radius:14px;font-size:16px;cursor:pointer;}' +
  '.cbtn-set{border-top:1px solid #eee;margin-top:12px;padding-top:12px;display:none;}' +
  '.cbtn-set.open{display:block;}' +
  '.cbtn-set label{display:block;font-size:13px;margin:6px 0 3px;color:#444;}' +
  '.cbtn-set input,.cbtn-set textarea{width:100%;box-sizing:border-box;padding:8px;font-size:14px;' +
    'border:1px solid #ccc;border-radius:6px;font-family:inherit;background:#fff;color:#222;}' +
  '.cbtn-set textarea{min-height:70px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;resize:vertical;}' +
  '.cbtn-gear{background:transparent;border:0;font-size:18px;cursor:pointer;color:#888;' +
    'padding:4px 8px;float:right;}' +
  '.cbtn-gear:hover{color:#0aa367;}' +
  '.cbtn-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);' +
    'background:#333;color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:10001;max-width:90%;text-align:center;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;opacity:0;' +
    'transition:opacity .25s;pointer-events:none;}' +
  '.cbtn-toast.show{opacity:1;}' +
  '.cbtn-toast.ok{background:#0aa367;}' +
  '.cbtn-toast.warn{background:#e6a23c;}';
  var st = document.createElement('style');
  st.setAttribute('data-cbtn', '1');
  st.appendChild(document.createTextNode(css));
  document.head.appendChild(st);

  // ---------- Hilfen ----------
  function q(k){ try{return localStorage.getItem(k);}catch(_){return null;} }
  function qs(k,v){ try{localStorage.setItem(k,v);}catch(_){ } }
  function getUser(){
    var w = q('who');
    if (w) return w;
    try {
      var raw = q('kb_cfg');
      if (raw) { var o = JSON.parse(raw); if (o && o.who) return String(o.who); }
    } catch(_) {}
    return 'unbekannt';
  }
  function getQueue(){
    try { var a = JSON.parse(q('claude_queue')||'[]'); return Array.isArray(a)?a:[]; }
    catch(_) { return []; }
  }
  function setQueue(a){ qs('claude_queue', JSON.stringify(a)); }
  function pageName(){
    var p = (location.pathname.split('/').pop()||'').replace(/\?.*$/,'');
    return p || 'index';
  }
  function ctxText(){
    var out = [];
    if (window.__CLAUDE_CTX && typeof window.__CLAUDE_CTX === 'object') {
      for (var k in window.__CLAUDE_CTX) if (window.__CLAUDE_CTX[k] != null)
        out.push(k+':'+window.__CLAUDE_CTX[k]);
    }
    if (location.hash) out.push('hash:'+decodeURIComponent(location.hash.slice(1)));
    return out.join(' | ');
  }
  function readFileAsDataURL(f){
    return new Promise(function(res, rej){
      var r = new FileReader();
      r.onload = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
      r.readAsDataURL(f);
    });
  }

  // ---------- Widget aufbauen ----------
  var fab, badge, overlay, modal, ta, cameraIn, prev, prevImg, sendBtn, micBtn;
  var setPanel, whUrlIn, whoIn, weWhIn, fbCfgIn, gearBtn, ctxLine;
  var currentPhoto = null;      // Data-URL des aktuellen Fotos
  var recognizer = null;        // aktives SpeechRecognition-Objekt
  var recActive = false;

  function build() {
    fab = document.createElement('button');
    fab.className = 'cbtn-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label','Claude');
    fab.textContent = tr().btn;
    badge = document.createElement('span');
    badge.className = 'cbtn-badge';
    badge.style.display = 'none';
    fab.appendChild(badge);
    fab.addEventListener('click', openModal);
    document.body.appendChild(fab);

    overlay = document.createElement('div');
    overlay.className = 'cbtn-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

    modal = document.createElement('div');
    modal.className = 'cbtn-modal';
    modal.innerHTML =
      '<button type="button" class="cbtn-gear" title="Einstellungen">⚙</button>' +
      '<h3 class="cbtn-h"></h3>' +
      '<div class="cbtn-ctx"></div>' +
      '<div class="cbtn-row">' +
        '<button type="button" class="cbtn-b" data-act="cam"></button>' +
        '<button type="button" class="cbtn-b" data-act="mic"></button>' +
      '</div>' +
      '<div class="cbtn-prev"><img alt=""/><button type="button" title="entfernen">✕</button></div>' +
      '<textarea class="cbtn-ta"></textarea>' +
      '<div class="cbtn-row">' +
        '<button type="button" class="cbtn-b" data-act="cancel"></button>' +
        '<button type="button" class="cbtn-b primary" data-act="send" disabled></button>' +
      '</div>' +
      '<div class="cbtn-set">' +
        '<label></label><input type="url" data-fld="wh" placeholder="https://hook.eu2.make.com/…">' +
        '<label></label><input type="text" data-fld="who" placeholder="peter">' +
        '<label></label><input type="url" data-fld="wewh" placeholder="https://hook.eu2.make.com/… (leer = wie oben)">' +
        '<label></label><textarea data-fld="fbcfg" placeholder=\'{"apiKey":"…","authDomain":"…","databaseURL":"…","projectId":"…"}\'></textarea>' +
        '<div class="cbtn-row" style="margin-top:10px">' +
          '<button type="button" class="cbtn-b" data-act="setclose"></button>' +
          '<button type="button" class="cbtn-b primary" data-act="setsave"></button>' +
        '</div>' +
      '</div>' +
      // verstecktes Datei-Input fuer Kamera:
      '<input type="file" accept="image/*" capture="environment" ' +
        'style="display:none" data-fld="cam">';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Referenzen einsammeln
    gearBtn   = modal.querySelector('.cbtn-gear');
    ctxLine   = modal.querySelector('.cbtn-ctx');
    ta        = modal.querySelector('.cbtn-ta');
    prev      = modal.querySelector('.cbtn-prev');
    prevImg   = prev.querySelector('img');
    cameraIn  = modal.querySelector('input[data-fld="cam"]');
    setPanel  = modal.querySelector('.cbtn-set');
    whUrlIn   = modal.querySelector('input[data-fld="wh"]');
    whoIn     = modal.querySelector('input[data-fld="who"]');
    weWhIn    = modal.querySelector('input[data-fld="wewh"]');
    fbCfgIn   = modal.querySelector('textarea[data-fld="fbcfg"]');
    sendBtn   = modal.querySelector('[data-act="send"]');
    micBtn    = modal.querySelector('[data-act="mic"]');

    // Events
    modal.addEventListener('click', onModalClick);
    ta.addEventListener('input', updateSendState);
    cameraIn.addEventListener('change', onCameraFile);
    prev.querySelector('button').addEventListener('click', clearPhoto);

    applyLabels();
    updateBadge();
  }

  function applyLabels(){
    var t = tr();
    fab.firstChild.nodeValue = t.btn;  // Text vor dem Badge
    modal.querySelector('.cbtn-h').textContent = t.title;
    modal.querySelector('[data-act="cam"]').textContent = t.photo;
    micBtn.textContent = recActive ? t.mic_stop : t.mic_start;
    modal.querySelector('[data-act="cancel"]').textContent = t.cancel;
    sendBtn.textContent = t.send;
    ta.placeholder = t.placeholder;
    gearBtn.title = t.settings;
    var labels = setPanel.querySelectorAll('label');
    labels[0].textContent = t.webhook_label;
    labels[1].textContent = t.who_label;
    labels[2].textContent = t.we_webhook_label;
    labels[3].textContent = t.fb_cfg_label;
    modal.querySelector('[data-act="setclose"]').textContent = t.close;
    modal.querySelector('[data-act="setsave"]').textContent = t.save;
    // Mikro verstecken, wenn nicht unterstuetzt
    if (!getSpeechCtor()) micBtn.style.display = 'none';
  }

  function onModalClick(e){
    var b = e.target.closest('[data-act]'); if (!b) return;
    switch (b.dataset.act) {
      case 'cam':      cameraIn.click(); break;
      case 'mic':      toggleMic(); break;
      case 'cancel':   closeModal(); break;
      case 'send':     doSend(); break;
      case 'setclose': setPanel.classList.remove('open'); break;
      case 'setsave':
        qs('claude_webhook_url', (whUrlIn.value||'').trim());
        var w = (whoIn.value||'').trim(); if (w) qs('who', w);
        // Wareneingang-Webhook (separat; leer = kein separater)
        var weUrl = (weWhIn.value||'').trim();
        if (weUrl) qs('wareneingang_webhook_url', weUrl);
        else       { try { localStorage.removeItem('wareneingang_webhook_url'); } catch(_){} }
        // Firebase-Config: validieren, sonst warnen und nicht speichern
        var fbRaw = (fbCfgIn.value||'').trim();
        if (fbRaw === '') {
          try { localStorage.removeItem('firebase_config'); } catch(_){}
        } else {
          try {
            var parsed = JSON.parse(fbRaw);
            if (!parsed || !parsed.databaseURL) throw new Error('databaseURL fehlt');
            qs('firebase_config', JSON.stringify(parsed));
          } catch (e) {
            toast('Firebase-Config ungültig: ' + e.message, 'warn');
            return;   // Panel offen lassen, nichts weiter speichern
          }
        }
        setPanel.classList.remove('open');
        toast(tr().save + ' ✓', 'ok');
        break;
    }
    if (e.target === gearBtn) {
      whUrlIn.value = q('claude_webhook_url') || '';
      whoIn.value   = q('who') || '';
      weWhIn.value  = q('wareneingang_webhook_url') || '';
      fbCfgIn.value = q('firebase_config') || '';
      setPanel.classList.toggle('open');
    }
  }

  function openModal(){
    applyLabels();
    var t = tr();
    ctxLine.innerHTML =
      '<b>'+t.page+':</b> '+escapeHtml(pageName()) +
      '  &nbsp; <b>'+t.context+':</b> '+escapeHtml(ctxText()||'—') +
      '  &nbsp; <b>'+t.time+':</b> '+new Date().toLocaleString();
    overlay.classList.add('open');
    setTimeout(function(){ try{ ta.focus(); }catch(_){} }, 60);
  }
  function closeModal(){
    stopMic();
    overlay.classList.remove('open');
    ta.value = '';
    clearPhoto();
    setPanel.classList.remove('open');
    updateSendState();
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ---------- Foto ----------
  function onCameraFile(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    readFileAsDataURL(f).then(function(d){
      currentPhoto = d;
      prevImg.src = d;
      prev.style.display = 'block';
      updateSendState();
    }).catch(function(){ toast('Foto-Fehler', 'warn'); });
  }
  function clearPhoto(){
    currentPhoto = null;
    prev.style.display = 'none';
    prevImg.src = '';
    cameraIn.value = '';
    updateSendState();
  }

  // ---------- Sprache ----------
  function getSpeechCtor(){
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }
  function toggleMic(){ if (recActive) stopMic(); else startMic(); }
  function startMic(){
    var Ctor = getSpeechCtor();
    if (!Ctor) { toast(tr().speech_unsupported, 'warn'); return; }
    try {
      recognizer = new Ctor();
      recognizer.lang = isThai() ? 'th-TH' : 'de-DE';
      recognizer.interimResults = true;
      recognizer.continuous = true;
      var baseline = ta.value ? (ta.value + ' ') : '';
      recognizer.onresult = function(ev){
        var out = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++)
          out += ev.results[i][0].transcript;
        ta.value = baseline + out;
        if (ev.results[ev.results.length-1].isFinal) baseline = ta.value + ' ';
        updateSendState();
      };
      recognizer.onerror = function(){ stopMic(); };
      recognizer.onend = function(){ if (recActive) { recActive=false; micBtn.classList.remove('rec'); micBtn.textContent = tr().mic_start; } };
      recognizer.start();
      recActive = true;
      micBtn.classList.add('rec');
      micBtn.textContent = tr().mic_stop;
    } catch (_) { toast(tr().speech_unsupported,'warn'); }
  }
  function stopMic(){
    if (recognizer) { try { recognizer.stop(); } catch(_){} recognizer = null; }
    recActive = false;
    if (micBtn) { micBtn.classList.remove('rec'); micBtn.textContent = tr().mic_start; }
  }

  // ---------- Senden ----------
  function updateSendState(){
    var has = (ta.value && ta.value.trim().length > 0) || !!currentPhoto;
    sendBtn.disabled = !has;
  }
  function buildPayload(){
    return {
      ts: new Date().toISOString(),
      page: pageName(),
      context: ctxText(),
      message: (ta.value||'').trim(),
      photo_base64: currentPhoto || null,
      user: getUser(),
      lang: isThai() ? 'th' : 'de',
      ua: navigator.userAgent
    };
  }
  function doSend(){
    var p = buildPayload();
    stopMic();
    if (!navigator.onLine) { enqueue(p); toast(tr().err_queued,'warn'); closeModal(); return; }
    postToWebhook(p).then(function(){
      toast(tr().ok_sent,'ok');
      closeModal();
      flushQueue();          // gleich mal alte Eintraege mitversuchen
    }).catch(function(err){
      if (err === 'nowebhook') offerDownload(p);
      else { enqueue(p); toast(tr().err_queued,'warn'); }
      closeModal();
    });
  }
  function postToWebhook(payload){
    var url = q('claude_webhook_url');
    if (!url) return Promise.reject('nowebhook');
    return fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).then(function(r){ if (!r.ok) throw new Error('HTTP '+r.status); return r; });
  }
  function enqueue(p){
    var a = getQueue(); a.push(p); setQueue(a); updateBadge();
  }
  function offerDownload(p){
    toast(tr().no_webhook, 'warn');
    try {
      var blob = new Blob([JSON.stringify(p, null, 2)], {type:'application/json'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'claude-'+p.ts.replace(/[:.]/g,'-')+'.json';
      a.textContent = tr().download;
      a.style.cssText = 'position:fixed;left:50%;bottom:140px;transform:translateX(-50%);'+
        'background:#0aa367;color:#fff;padding:10px 16px;border-radius:8px;z-index:10002;'+
        'text-decoration:none;font-family:system-ui,sans-serif;font-size:14px;';
      document.body.appendChild(a);
      setTimeout(function(){ try{URL.revokeObjectURL(url);a.remove();}catch(_){} }, 15000);
      // sicherheitshalber auch in die Queue, falls User nicht klickt
      enqueue(p);
    } catch(_) { enqueue(p); }
  }

  // ---------- Warteschlange ----------
  function updateBadge(){
    var n = getQueue().length;
    if (!badge) return;
    if (n > 0) { badge.textContent = n; badge.style.display = 'block'; }
    else       { badge.style.display = 'none'; }
  }
  var flushing = false;
  function flushQueue(){
    if (flushing) return;
    if (!navigator.onLine) return;
    var url = q('claude_webhook_url'); if (!url) return;
    var q0 = getQueue(); if (!q0.length) { updateBadge(); return; }
    flushing = true;
    // Sequentiell durchgehen, damit Reihenfolge stimmt.
    var remaining = q0.slice();
    function next(){
      if (!remaining.length) {
        setQueue([]); flushing = false; updateBadge();
        return;
      }
      var item = remaining[0];
      postToWebhook(item).then(function(){
        remaining.shift();
        setQueue(remaining); updateBadge();
        next();
      }).catch(function(){
        // Netz weg oder Fehler → aufhoeren, Rest bleibt in Queue.
        setQueue(remaining); flushing = false; updateBadge();
      });
    }
    next();
  }

  // ---------- Toast ----------
  var toastEl, toastTmo;
  function toast(msg, kind){
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'cbtn-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.className = 'cbtn-toast ' + (kind||'');
    toastEl.textContent = msg;
    // reflow, dann show
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTmo);
    toastTmo = setTimeout(function(){ toastEl.classList.remove('show'); }, 3000);
  }

  // ---------- Lifecycle ----------
  function boot(){
    build();
    // Bei Sichtwechsel und Online-Event Queue leeren
    window.addEventListener('online', flushQueue);
    document.addEventListener('visibilitychange', function(){
      if (!document.hidden) flushQueue();
    });
    setInterval(flushQueue, 60000);
    // Erster Versuch nach 3 s (Netz-Init abwarten)
    setTimeout(flushQueue, 3000);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
