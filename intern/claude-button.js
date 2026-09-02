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

  // ---------- Sprache ermitteln ----------
  // Widget kennt DE + TH. Peter ist am Stand der einzige DE-Sprecher.
  // Der 'Peter'-Status kann an drei Stellen stehen (unterschiedliche Apps
  // pflegen unterschiedliche Storage-Keys):
  //   1) kb_cfg.who  in Kasse
  //   2) S.cfg.who   in blend_os_v1 (Standos-App)
  //   3) localStorage.who  (vom Widget selbst gesetzt)
  //   4) kb_cfg.lang beginnt mit 'de' (Kasse-Spracheinstellung)
  // Wenn eins davon eindeutig 'peter'/'de' sagt -> Deutsch. Sonst Thai
  // (Standard am Stand; Lexis 'en' fiel vorher irrtuemlich auf Deutsch).
  function isPeter() {
    function whoIs(v){ return typeof v === 'string' && v.toLowerCase().indexOf('peter') === 0; }
    function langIsDE(v){ return typeof v === 'string' && v.toLowerCase().indexOf('de') === 0; }
    try {
      var raw = localStorage.getItem('kb_cfg');
      if (raw) {
        var cfg = JSON.parse(raw);
        if (cfg) {
          if (whoIs(cfg.who))   return true;
          if (langIsDE(cfg.lang)) return true;
        }
      }
    } catch (_) {}
    try {
      var os = localStorage.getItem('blend_os_v1');
      if (os) {
        var s = JSON.parse(os);
        if (s && s.cfg && whoIs(s.cfg.who)) return true;
      }
    } catch (_) {}
    try { if (whoIs(localStorage.getItem('who'))) return true; } catch (_) {}
    return false;
  }
  function isThai() {
    if (isPeter()) return false;
    try { if (localStorage.getItem('kb_lang_th') === '1') return true; } catch (_) {}
    return true; // Default am Stand
  }

  // ---------- FAB ueber die fixe Bottom-Nav heben ----------
  // standos.html, kasse.html und rezepte.html haben eine <nav>, die unten
  // festgeklebt sitzt. Der FAB an bottom:16px verdeckte deren letzte 1-2
  // Buttons (Rezepte/Auswertung). Diese Funktion misst die tatsaechliche
  // Nav-Hoehe und schiebt den FAB drueber (plus 12px Luft). Wenn keine
  // fixe Nav da ist, bleibt der FAB bei 16px.
  function positionFabAboveNav() {
    if (!fab) return;
    var nav = document.querySelector('nav');
    var below = 16;
    if (nav) {
      var cs = window.getComputedStyle(nav);
      if (cs.position === 'fixed' && parseFloat(cs.bottom) < 5) {
        below = nav.getBoundingClientRect().height + 12;
      }
    }
    fab.style.bottom = below + 'px';
  }

  var T = {
    de: {
      btn: '🤖 Claude',
      title: '🤖 Claude — was möchtest du korrigieren oder melden?',
      page: 'Seite',
      context: 'Kontext',
      time: 'Zeit',
      photo: '📸 Foto',
      shot: '🖼 Screenshot',
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
      speech_unsupported: 'Spracheingabe wird von diesem Browser nicht unterstützt.',
      /* --- POSTKORB: START --- */
      inbox: '📬 Postkorb',
      inbox_title: '📬 Postkorb',
      inbox_empty: 'Noch nichts gesendet.',
      inbox_all: 'Alle',
      inbox_unread: 'Ungelesen',
      inbox_error: 'Fehler',
      inbox_back: '× zurück',
      inbox_detail_back: '← Liste',
      status_queue: 'in Warteschlange',
      status_sent: 'gesendet',
      status_answered: 'Antwort da',
      status_error: 'Fehler',
      answer_from: 'Antwort',
      ago_now: 'gerade eben',
      ago_sec: 'vor %s Sek.',
      ago_min: 'vor %s Min.',
      ago_hour: 'vor %s Std.',
      ago_day: 'vor %s Tg.',
      sent_label: 'Gesendet:',
      photo_label: 'Foto:'
      /* --- POSTKORB: ENDE --- */
    },
    th: {
      btn: '🤖 Claude',
      title: '🤖 Claude — คุณต้องการแก้ไขหรือแจ้งอะไร?',
      page: 'หน้า',
      context: 'บริบท',
      time: 'เวลา',
      photo: '📸 ถ่ายรูป',
      shot: '🖼 ภาพหน้าจอ',
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
      speech_unsupported: 'เบราว์เซอร์นี้ไม่รองรับการพูด',
      /* --- POSTKORB: START --- */
      inbox: '📬 กล่องข้อความ',
      inbox_title: '📬 กล่องข้อความ',
      inbox_empty: 'ยังไม่ได้ส่งอะไร',
      inbox_all: 'ทั้งหมด',
      inbox_unread: 'ยังไม่อ่าน',
      inbox_error: 'ข้อผิดพลาด',
      inbox_back: '× กลับ',
      inbox_detail_back: '← รายการ',
      status_queue: 'ในคิว',
      status_sent: 'ส่งแล้ว',
      status_answered: 'มีคำตอบ',
      status_error: 'ข้อผิดพลาด',
      answer_from: 'คำตอบ',
      ago_now: 'เมื่อสักครู่',
      ago_sec: '%s วินาทีที่แล้ว',
      ago_min: '%s นาทีที่แล้ว',
      ago_hour: '%s ชม.ที่แล้ว',
      ago_day: '%s วันที่แล้ว',
      sent_label: 'ที่ส่ง:',
      photo_label: 'รูป:'
      /* --- POSTKORB: ENDE --- */
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
  '.cbtn-toast.warn{background:#e6a23c;}' +
  /* --- POSTKORB: START --- */
  '.cbtn-badge-unread{position:absolute;top:-4px;left:-4px;min-width:20px;height:20px;padding:0 5px;' +
    'border-radius:10px;background:#0aa367;color:#fff;font-size:12px;line-height:20px;' +
    'font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.3);}' +
  '.cbtn-inbox-btn{background:transparent;border:0;font-size:18px;cursor:pointer;color:#888;' +
    'padding:4px 8px;float:right;position:relative;}' +
  '.cbtn-inbox-btn:hover{color:#0aa367;}' +
  '.cbtn-inbox-btn .cbtn-pill{position:absolute;top:-2px;right:-2px;background:#e63946;color:#fff;' +
    'font-size:10px;line-height:1;padding:2px 5px;border-radius:8px;font-weight:700;}' +
  '.cbtn-inbox-view{display:none;}' +
  '.cbtn-inbox-view.open{display:block;}' +
  '.cbtn-inbox-header{display:flex;align-items:center;gap:8px;margin:0 0 10px;}' +
  '.cbtn-inbox-header h3{flex:1;margin:0;font-size:17px;font-weight:600;}' +
  '.cbtn-inbox-header button{background:transparent;border:0;color:#888;font-size:15px;cursor:pointer;padding:4px 8px;}' +
  '.cbtn-inbox-header button:hover{color:#0aa367;}' +
  '.cbtn-chips{display:flex;gap:6px;margin:0 0 10px;flex-wrap:wrap;}' +
  '.cbtn-chip{background:#f0f0f0;border:1px solid #ddd;padding:5px 12px;border-radius:16px;font-size:13px;cursor:pointer;color:#444;font-family:inherit;}' +
  '.cbtn-chip.active{background:#0aa367;color:#fff;border-color:#0aa367;}' +
  '.cbtn-inbox-list{max-height:400px;overflow-y:auto;border-top:1px solid #eee;}' +
  '.cbtn-inbox-item{display:block;padding:10px 6px;border-bottom:1px solid #eee;cursor:pointer;background:#fff;}' +
  '.cbtn-inbox-item:hover{background:#f7f9f7;}' +
  '.cbtn-inbox-item.unread{background:#eefaf3;}' +
  '.cbtn-inbox-item-row{display:flex;gap:8px;align-items:flex-start;}' +
  '.cbtn-inbox-item-thumb{width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;background:#eee;}' +
  '.cbtn-inbox-item-body{flex:1;min-width:0;}' +
  '.cbtn-inbox-item-meta{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#888;margin-bottom:2px;}' +
  '.cbtn-inbox-item-text{font-size:13px;color:#222;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}' +
  '.cbtn-inbox-status{display:inline-block;font-size:10px;padding:2px 7px;border-radius:8px;font-weight:600;text-transform:none;}' +
  '.cbtn-inbox-status.queue{background:#fff3d6;color:#8a6100;}' +
  '.cbtn-inbox-status.sent{background:#e0e8ff;color:#3a4c8c;}' +
  '.cbtn-inbox-status.answered{background:#d4f0dc;color:#0a6b3f;}' +
  '.cbtn-inbox-status.error{background:#fdd;color:#a11;}' +
  '.cbtn-inbox-answer{margin-top:6px;background:#e8f7ee;border-left:3px solid #0aa367;padding:6px 8px;border-radius:4px;font-size:13px;color:#0a4d2a;line-height:1.4;}' +
  '.cbtn-inbox-answer.warn{background:#fff8e1;border-left-color:#e6a23c;color:#7a5300;}' +
  '.cbtn-inbox-answer.error{background:#fdecec;border-left-color:#e63946;color:#8a1a22;}' +
  '.cbtn-inbox-empty{padding:32px 12px;text-align:center;color:#999;font-size:14px;}' +
  '.cbtn-inbox-detail{padding:6px 0;}' +
  '.cbtn-inbox-detail .lab{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-top:10px;}' +
  '.cbtn-inbox-detail .val{font-size:14px;color:#222;line-height:1.45;white-space:pre-wrap;word-break:break-word;}' +
  '.cbtn-inbox-detail img{max-width:100%;max-height:260px;border-radius:8px;display:block;margin-top:6px;}';
  /* --- POSTKORB: ENDE --- */
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

  /* --- POSTKORB: START --- */
  var INBOX_KEY    = 'claude_inbox_v1';
  var ANSWERS_KEY  = 'claude_answers_v1';
  var INBOX_MAX    = 30;

  function getInbox(){
    try { var a = JSON.parse(q(INBOX_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(_) { return []; }
  }
  function setInbox(a){
    // FIFO: aeltester rausschieben, wenn > MAX
    while (a.length > INBOX_MAX) a.shift();
    qs(INBOX_KEY, JSON.stringify(a));
  }
  function getAnswers(){
    try { var o = JSON.parse(q(ANSWERS_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch(_) { return {}; }
  }
  function makeMsgId(){
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,5);
  }
  // ISO mit lokalem +HH:MM Offset (statt UTC 'Z')
  function isoLocal(){
    var d = new Date();
    var pad = function(n){ n = Math.abs(n); return (n<10?'0':'') + n; };
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    var hh = pad(Math.floor(Math.abs(off)/60));
    var mm = pad(Math.abs(off)%60);
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
           'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
           sign + hh + ':' + mm;
  }
  // Thumbnail max 200x200, JPEG
  function makeThumb(dataUrl){
    return new Promise(function(res){
      if (!dataUrl) return res(null);
      try {
        var img = new Image();
        img.onload = function(){
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return res(null);
          var max = 200;
          var scale = Math.min(1, max / Math.max(w, h));
          var nw = Math.max(1, Math.round(w * scale));
          var nh = Math.max(1, Math.round(h * scale));
          var c = document.createElement('canvas');
          c.width = nw; c.height = nh;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, nw, nh);
          try { res(c.toDataURL('image/jpeg', 0.7)); }
          catch(_) { res(null); }
        };
        img.onerror = function(){ res(null); };
        img.src = dataUrl;
      } catch(_) { res(null); }
    });
  }
  function relTime(iso){
    var t = tr();
    var then = Date.parse(iso);
    if (!then) return '';
    var sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (sec < 10)   return t.ago_now;
    if (sec < 60)   return t.ago_sec.replace('%s', sec);
    var min = Math.floor(sec / 60);
    if (min < 60)   return t.ago_min.replace('%s', min);
    var hr = Math.floor(min / 60);
    if (hr < 24)    return t.ago_hour.replace('%s', hr);
    var d = Math.floor(hr / 24);
    return t.ago_day.replace('%s', d);
  }
  /* --- POSTKORB: ENDE --- */

  // ---------- Widget aufbauen ----------
  var fab, badge, overlay, modal, ta, cameraIn, shotIn, prev, prevImg, sendBtn, micBtn;
  var setPanel, whUrlIn, whoIn, weWhIn, fbCfgIn, gearBtn, ctxLine;
  var currentPhoto = null;      // Data-URL des aktuellen Fotos
  var recognizer = null;        // aktives SpeechRecognition-Objekt
  var recActive = false;
  /* --- POSTKORB: START --- */
  var badgeUnread, inboxBtn, inboxPill, inboxView, formView, inboxListEl, inboxFilter = 'all';
  var inboxPollTmo = null;
  /* --- POSTKORB: ENDE --- */

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
    /* --- POSTKORB: START --- */
    badgeUnread = document.createElement('span');
    badgeUnread.className = 'cbtn-badge-unread';
    badgeUnread.style.display = 'none';
    fab.appendChild(badgeUnread);
    /* --- POSTKORB: ENDE --- */
    fab.addEventListener('click', openModal);
    document.body.appendChild(fab);
    // Nav-Bar-Kollision vermeiden: wenn die Seite eine fixe Nav am unteren
    // Rand hat (standos, kasse, rezepte haben eine), FAB darueber schieben,
    // damit Rezepte-/Auswertung-Button erreichbar bleiben.
    positionFabAboveNav();
    window.addEventListener('resize', positionFabAboveNav);

    overlay = document.createElement('div');
    overlay.className = 'cbtn-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

    modal = document.createElement('div');
    modal.className = 'cbtn-modal';
    modal.innerHTML =
      '<button type="button" class="cbtn-gear" title="Einstellungen">⚙</button>' +
      /* --- POSTKORB: START --- */
      '<button type="button" class="cbtn-inbox-btn" data-act="inbox-open" title="Postkorb">📬' +
        '<span class="cbtn-pill" style="display:none"></span>' +
      '</button>' +
      /* --- POSTKORB: ENDE --- */
      '<div class="cbtn-form-view">' +
      '<h3 class="cbtn-h"></h3>' +
      '<div class="cbtn-ctx"></div>' +
      '<div class="cbtn-row">' +
        '<button type="button" class="cbtn-b" data-act="cam"></button>' +
        '<button type="button" class="cbtn-b" data-act="shot"></button>' +
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
      '</div>' +
      /* --- POSTKORB: START --- */
      '<div class="cbtn-inbox-view">' +
        '<div class="cbtn-inbox-header">' +
          '<h3></h3>' +
          '<button type="button" data-act="inbox-close"></button>' +
        '</div>' +
        '<div class="cbtn-chips">' +
          '<button type="button" class="cbtn-chip active" data-flt="all"></button>' +
          '<button type="button" class="cbtn-chip" data-flt="unread"></button>' +
          '<button type="button" class="cbtn-chip" data-flt="error"></button>' +
        '</div>' +
        '<div class="cbtn-inbox-list"></div>' +
      '</div>' +
      /* --- POSTKORB: ENDE --- */
      // verstecktes Datei-Input fuer Kamera (capture=environment erzwingt Kamera):
      '<input type="file" accept="image/*" capture="environment" ' +
        'style="display:none" data-fld="cam">' +
      // Zweites Input ohne capture: Bildergalerie / Screenshot / beliebige Datei
      '<input type="file" accept="image/*" ' +
        'style="display:none" data-fld="shot">';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Referenzen einsammeln
    gearBtn   = modal.querySelector('.cbtn-gear');
    ctxLine   = modal.querySelector('.cbtn-ctx');
    ta        = modal.querySelector('.cbtn-ta');
    prev      = modal.querySelector('.cbtn-prev');
    prevImg   = prev.querySelector('img');
    cameraIn  = modal.querySelector('input[data-fld="cam"]');
    shotIn    = modal.querySelector('input[data-fld="shot"]');
    setPanel  = modal.querySelector('.cbtn-set');
    whUrlIn   = modal.querySelector('input[data-fld="wh"]');
    whoIn     = modal.querySelector('input[data-fld="who"]');
    weWhIn    = modal.querySelector('input[data-fld="wewh"]');
    fbCfgIn   = modal.querySelector('textarea[data-fld="fbcfg"]');
    sendBtn   = modal.querySelector('[data-act="send"]');
    micBtn    = modal.querySelector('[data-act="mic"]');
    /* --- POSTKORB: START --- */
    formView    = modal.querySelector('.cbtn-form-view');
    inboxView   = modal.querySelector('.cbtn-inbox-view');
    inboxListEl = modal.querySelector('.cbtn-inbox-list');
    inboxBtn    = modal.querySelector('.cbtn-inbox-btn');
    inboxPill   = inboxBtn.querySelector('.cbtn-pill');
    /* --- POSTKORB: ENDE --- */

    // Events
    modal.addEventListener('click', onModalClick);
    ta.addEventListener('input', updateSendState);
    cameraIn.addEventListener('change', onCameraFile);
    shotIn.addEventListener('change', onCameraFile);
    prev.querySelector('button').addEventListener('click', clearPhoto);

    applyLabels();
    updateBadge();
    /* --- POSTKORB: START --- */
    // Storage-Event + Cloud-Sync-Event: neue Antworten mergen
    window.addEventListener('storage', function(e){
      if (e.key === ANSWERS_KEY || e.key === INBOX_KEY) {
        mergeAnswers();
        if (inboxView && inboxView.classList.contains('open')) renderInbox();
        updateBadge();
      }
    });
    window.addEventListener('claude-answers-cloud-sync', function(){
      mergeAnswers();
      if (inboxView && inboxView.classList.contains('open')) renderInbox();
      updateBadge();
    });
    /* --- POSTKORB: ENDE --- */
  }

  function applyLabels(){
    var t = tr();
    fab.firstChild.nodeValue = t.btn;  // Text vor dem Badge
    modal.querySelector('.cbtn-h').textContent = t.title;
    modal.querySelector('[data-act="cam"]').textContent = t.photo;
    modal.querySelector('[data-act="shot"]').textContent = t.shot;
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
    /* --- POSTKORB: START --- */
    inboxView.querySelector('.cbtn-inbox-header h3').textContent = t.inbox_title;
    inboxView.querySelector('[data-act="inbox-close"]').textContent = t.inbox_back;
    inboxView.querySelector('[data-flt="all"]').textContent    = t.inbox_all;
    inboxView.querySelector('[data-flt="unread"]').textContent = t.inbox_unread;
    inboxView.querySelector('[data-flt="error"]').textContent  = t.inbox_error;
    inboxBtn.title = t.inbox;
    /* --- POSTKORB: ENDE --- */
  }

  function onModalClick(e){
    /* --- POSTKORB: START --- */
    var chip = e.target.closest('[data-flt]');
    if (chip) {
      inboxFilter = chip.dataset.flt;
      var chips = inboxView.querySelectorAll('.cbtn-chip');
      for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i].dataset.flt === inboxFilter);
      renderInbox();
      return;
    }
    var itm = e.target.closest('[data-inbox-id]');
    if (itm) { openInboxDetail(itm.dataset.inboxId); return; }
    /* --- POSTKORB: ENDE --- */
    var b = e.target.closest('[data-act]'); if (!b) return;
    switch (b.dataset.act) {
      case 'cam':      cameraIn.click(); break;
      case 'shot':     shotIn.click(); break;
      case 'mic':      toggleMic(); break;
      case 'cancel':   closeModal(); break;
      case 'send':     doSend(); break;
      case 'setclose': setPanel.classList.remove('open'); break;
      /* --- POSTKORB: START --- */
      case 'inbox-open':   openInbox(); break;
      case 'inbox-close':  closeInbox(); break;
      case 'inbox-detail-back': renderInbox(); break;
      /* --- POSTKORB: ENDE --- */
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
    /* --- POSTKORB: START --- */
    // Frisch geoeffnet immer die Sende-Ansicht zeigen
    if (formView) formView.style.display = '';
    if (inboxView) inboxView.classList.remove('open');
    mergeAnswers();
    updateBadge();
    /* --- POSTKORB: ENDE --- */
    setTimeout(function(){ try{ ta.focus(); }catch(_){} }, 60);
  }
  function closeModal(){
    stopMic();
    overlay.classList.remove('open');
    ta.value = '';
    clearPhoto();
    setPanel.classList.remove('open');
    /* --- POSTKORB: START --- */
    if (inboxView) inboxView.classList.remove('open');
    if (formView) formView.style.display = '';
    scheduleInboxPoll(false);
    /* --- POSTKORB: ENDE --- */
    updateSendState();
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ---------- Foto / Screenshot ----------
  function onCameraFile(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    readFileAsDataURL(f).then(function(d){
      currentPhoto = d;
      prevImg.src = d;
      prev.style.display = 'block';
      updateSendState();
    }).catch(function(){ toast('Foto-Fehler', 'warn'); });
    // Beide Inputs zuruecksetzen, damit dieselbe Datei erneut auswaehlbar bleibt
    try { e.target.value = ''; } catch(_){}
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
      // Baseline = was der Nutzer VOR dem Mikro-Start getippt hat. Wird nicht
      // veraendert, waehrend das Mikro laeuft -- sonst wachsen finale Ergebnisse
      // bei jedem Event, weil Chrome-Android teils ev.resultIndex=0 emittiert
      // und dann alle isFinal-Ergebnisse erneut in `out` landen. Das war die
      // Ursache fuer die 2-3-fache Wiederholung des Diktats.
      var baseline = ta.value ? (ta.value + ' ') : '';
      recognizer.onresult = function(ev){
        var finalText = '';
        var interimText = '';
        // ALLE Ergebnisse durchgehen und final vs. interim trennen.
        // Nicht auf ev.resultIndex verlassen -- unzuverlaessig auf Mobile.
        for (var i = 0; i < ev.results.length; i++) {
          var r = ev.results[i];
          var t = r[0] && r[0].transcript ? r[0].transcript : '';
          if (r.isFinal) finalText += t; else interimText += t;
        }
        ta.value = baseline + finalText + interimText;
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
      /* --- POSTKORB: START --- */
      msg_id: makeMsgId(),
      /* --- POSTKORB: ENDE --- */
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
    /* --- POSTKORB: START --- */
    // Eintrag im Postkorb anlegen (async wegen Thumb)
    var photoOrig = currentPhoto;
    var textOrig  = p.message;
    makeThumb(photoOrig).then(function(thumb){
      var entry = {
        id: p.msg_id,
        ts: isoLocal(),
        page: p.page,
        text: textOrig,
        photo_thumb: thumb,
        user: (isPeter() ? 'peter' : 'lexi'),
        status: 'queue',
        sent_at: null,
        answer: null,
        unread: false
      };
      var box = getInbox();
      box.push(entry);
      setInbox(box);
      updateBadge();
    });
    /* --- POSTKORB: ENDE --- */
    if (!navigator.onLine) { enqueue(p); toast(tr().err_queued,'warn'); closeModal(); return; }
    postToWebhook(p).then(function(){
      /* --- POSTKORB: START --- */
      updateInboxStatus(p.msg_id, 'sent', { sent_at: isoLocal() });
      /* --- POSTKORB: ENDE --- */
      toast(tr().ok_sent,'ok');
      closeModal();
      flushQueue();          // gleich mal alte Eintraege mitversuchen
    }).catch(function(err){
      if (err === 'nowebhook') offerDownload(p);
      else { enqueue(p); toast(tr().err_queued,'warn'); }
      closeModal();
    });
  }
  /* --- POSTKORB: START --- */
  function updateInboxStatus(id, status, extra){
    var box = getInbox();
    for (var i = 0; i < box.length; i++) {
      if (box[i].id === id) {
        box[i].status = status;
        if (extra) for (var k in extra) box[i][k] = extra[k];
        setInbox(box);
        updateBadge();
        return;
      }
    }
  }
  /* --- POSTKORB: ENDE --- */
  function postToWebhook(payload){
    var url = q('claude_webhook_url');
    if (!url) return Promise.reject('nowebhook');
    // Wichtig: mode 'no-cors' + Content-Type 'text/plain' machen daraus eine
    // "simple request" -- kein CORS-Preflight, keine Header-Auslese auf der
    // Response. Make.com Custom-Webhooks (und die meisten Automations-
    // Plattformen) beantworten JSON-POSTs ohne die noetigen CORS-Header,
    // sodass ein normales `fetch({headers:{'Content-Type':'application/json'}})`
    // die Response als Fehler wirft -- obwohl die Nachricht laengst
    // angekommen ist. Body bleibt JSON-Text, Make parst ihn automatisch.
    // Opaque Response = wir koennen den Status nicht lesen, aber wenn fetch
    // resolved, ist die Uebertragung erfolgt. Fuer Fire-and-Forget-Send ok.
    return fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    }).then(function(){ return; });
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
    /* --- POSTKORB: START --- */
    var u = countUnread();
    if (badgeUnread) {
      if (u > 0) { badgeUnread.textContent = u; badgeUnread.style.display = 'block'; }
      else       { badgeUnread.style.display = 'none'; }
    }
    if (inboxPill) {
      if (u > 0) { inboxPill.textContent = u; inboxPill.style.display = 'inline-block'; }
      else       { inboxPill.style.display = 'none'; }
    }
    /* --- POSTKORB: ENDE --- */
  }
  /* --- POSTKORB: START --- */
  function countUnread(){
    var box = getInbox(), n = 0;
    for (var i = 0; i < box.length; i++) if (box[i].unread) n++;
    return n;
  }
  /* --- POSTKORB: ENDE --- */
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

  /* --- POSTKORB: START --- */
  // ---------- Postkorb: Antworten mergen ----------
  function mergeAnswers(){
    var ans = getAnswers();
    if (!ans || !Object.keys(ans).length) return false;
    var box = getInbox();
    var changed = false;
    for (var i = 0; i < box.length; i++) {
      var e = box[i];
      var a = ans[e.id];
      if (!a) continue;
      // Nur uebernehmen, wenn noch nicht/anders gesetzt
      var already = e.answer && e.answer.ts === a.ts && e.answer.text === a.text;
      if (already && e.status === 'answered') continue;
      e.answer = {
        ts:   a.ts   || isoLocal(),
        text: a.text || '',
        kind: a.kind || 'info',
        by:   a.by   || 'claude'
      };
      var newStatus = (e.answer.kind === 'error') ? 'error' : 'answered';
      if (e.status !== newStatus) { e.status = newStatus; changed = true; }
      if (!already) { e.unread = true; changed = true; }
    }
    if (changed) setInbox(box);
    return changed;
  }

  // ---------- Postkorb: Ansicht ----------
  function openInbox(){
    mergeAnswers();
    if (formView) formView.style.display = 'none';
    if (setPanel) setPanel.classList.remove('open');
    inboxView.classList.add('open');
    renderInbox();
    scheduleInboxPoll(true);
  }
  function closeInbox(){
    inboxView.classList.remove('open');
    if (formView) formView.style.display = '';
    scheduleInboxPoll(false);
  }
  function renderInbox(){
    var t = tr();
    var box = getInbox().slice().reverse();  // neueste zuerst
    var items = box.filter(function(e){
      if (inboxFilter === 'unread') return !!e.unread;
      if (inboxFilter === 'error')  return e.status === 'error';
      return true;
    });
    if (!items.length) {
      inboxListEl.innerHTML = '<div class="cbtn-inbox-empty">' + escapeHtml(t.inbox_empty) + '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var e = items[i];
      var statusLabel = t['status_' + e.status] || e.status;
      var txt = (e.text || '').trim() || '—';
      html += '<div class="cbtn-inbox-item' + (e.unread ? ' unread' : '') + '" data-inbox-id="' + escapeHtml(e.id) + '">';
      html += '<div class="cbtn-inbox-item-row">';
      if (e.photo_thumb) {
        html += '<img class="cbtn-inbox-item-thumb" src="' + escapeHtml(e.photo_thumb) + '" alt="">';
      } else {
        html += '<div class="cbtn-inbox-item-thumb" aria-hidden="true"></div>';
      }
      html += '<div class="cbtn-inbox-item-body">';
      html += '<div class="cbtn-inbox-item-meta"><span>' + escapeHtml(relTime(e.ts)) + '</span>';
      html += '<span class="cbtn-inbox-status ' + escapeHtml(e.status) + '">' + escapeHtml(statusLabel) + '</span></div>';
      html += '<div class="cbtn-inbox-item-text">' + escapeHtml(txt) + '</div>';
      if (e.answer && e.answer.text) {
        var kind = (e.answer.kind === 'warn' || e.answer.kind === 'error') ? e.answer.kind : '';
        html += '<div class="cbtn-inbox-answer ' + kind + '">' + escapeHtml(e.answer.text) + '</div>';
      }
      html += '</div></div></div>';
    }
    inboxListEl.innerHTML = html;
  }
  function openInboxDetail(id){
    var box = getInbox();
    var e = null;
    for (var i = 0; i < box.length; i++) if (box[i].id === id) { e = box[i]; break; }
    if (!e) return;
    if (e.unread) { e.unread = false; setInbox(box); updateBadge(); }
    var t = tr();
    var statusLabel = t['status_' + e.status] || e.status;
    var html = '';
    html += '<div class="cbtn-inbox-detail">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">';
    html += '<button type="button" class="cbtn-b" style="flex:0" data-act="inbox-detail-back">' + escapeHtml(t.inbox_detail_back) + '</button>';
    html += '<span class="cbtn-inbox-status ' + escapeHtml(e.status) + '">' + escapeHtml(statusLabel) + '</span>';
    html += '</div>';
    html += '<div class="lab">' + escapeHtml(t.time) + '</div>';
    html += '<div class="val">' + escapeHtml(new Date(e.ts).toLocaleString() + '  · ' + relTime(e.ts)) + '</div>';
    html += '<div class="lab">' + escapeHtml(t.page) + '</div>';
    html += '<div class="val">' + escapeHtml(e.page || '—') + '</div>';
    html += '<div class="lab">' + escapeHtml(t.sent_label) + '</div>';
    html += '<div class="val">' + escapeHtml(e.text || '—') + '</div>';
    if (e.photo_thumb) {
      html += '<div class="lab">' + escapeHtml(t.photo_label) + '</div>';
      html += '<img src="' + escapeHtml(e.photo_thumb) + '" alt="">';
    }
    if (e.answer && e.answer.text) {
      var kind = (e.answer.kind === 'warn' || e.answer.kind === 'error') ? e.answer.kind : '';
      html += '<div class="lab">' + escapeHtml(t.answer_from) + ' · ' + escapeHtml(relTime(e.answer.ts)) + '</div>';
      html += '<div class="cbtn-inbox-answer ' + kind + '">' + escapeHtml(e.answer.text) + '</div>';
    }
    html += '</div>';
    inboxListEl.innerHTML = html;
  }

  // ---------- Postkorb: Polling ----------
  function scheduleInboxPoll(fast){
    if (inboxPollTmo) { clearInterval(inboxPollTmo); inboxPollTmo = null; }
    var ms = fast ? 30000 : 300000;   // 30 s wenn offen, sonst 5 min
    inboxPollTmo = setInterval(function(){
      var changed = mergeAnswers();
      if (changed || (inboxView && inboxView.classList.contains('open'))) {
        if (inboxView && inboxView.classList.contains('open')) renderInbox();
        updateBadge();
      }
    }, ms);
  }
  /* --- POSTKORB: ENDE --- */

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
    /* --- POSTKORB: START --- */
    // Initial merge + Slow-Polling (5 min) fuer Antworten
    setTimeout(function(){ mergeAnswers(); updateBadge(); }, 1500);
    scheduleInboxPoll(false);
    /* --- POSTKORB: ENDE --- */
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
