/*!
 * 100blend – Wareneingang-Foto-Button
 * Zweiter, separater schwebender Button (unten links). Ein Tap oeffnet direkt
 * die Kamera; nach dem Foto erscheint ein kurzes Formular (Preis THB, Quelle,
 * Notiz) und der Payload wird an denselben Make-Webhook wie der Claude-Button
 * geschickt (typ:"wareneingang"). Ohne Webhook: JSON-Download + lokaler
 * Backlog-Eintrag unter localStorage.wareneingang_pending.
 *
 * Einbindung (nur kasse.html):   <script src="wareneingang-button.js" defer></script>
 * Optionaler eigener Webhook:    localStorage.wareneingang_webhook_url
 * Fallback:                      localStorage.claude_webhook_url
 */
(function () {
  'use strict';
  if (window.__weButtonLoaded) return;
  window.__weButtonLoaded = true;

  // ---------- Sprache ----------
  // Vorrang: kb_cfg.lang (explizite User-Wahl), dann Alt-Flag kb_lang_th,
  // dann <html lang>. Sonst wird Peter (CFG.lang='de') faelschlich Thai gezeigt.
  function isThai() {
    try {
      var raw = localStorage.getItem('kb_cfg');
      if (raw) {
        var cfg = JSON.parse(raw);
        if (cfg && typeof cfg.lang === 'string') return cfg.lang.toLowerCase().indexOf('th') === 0;
      }
    } catch (_) {}
    try { if (localStorage.getItem('kb_lang_th') === '1') return true; } catch (_) {}
    var l = (document.documentElement.lang || '').toLowerCase();
    return l.indexOf('th') === 0;
  }
  var T = {
    de: {
      btn_top: '📸', btn_sub: 'WE',
      title: '📸 Wareneingang — Foto vom Etikett',
      hint: 'Preis + Quelle helfen Claude, sind aber optional. Handeingabe siegt.',
      price_label: 'Preis (THB)',
      price_ph: 'z. B. 169',
      source_label: 'Quelle',
      note_label: 'Notiz',
      note_ph: '2 kg-Sack, geröstet, MHD kurz …',
      send: '✅ An Claude senden',
      cancel: 'Abbrechen',
      retake: '↻ Neu aufnehmen',
      ok_sent: '✅ Wareneingang eingereicht — Claude bearbeitet gleich.',
      err_queued: '⚠ Nicht gesendet — bleibt im lokalen Backlog.',
      no_webhook: 'Kein Webhook konfiguriert. Datei wird angeboten und in Backlog gelegt.',
      download: '⬇ Wareneingang herunterladen',
      no_photo: 'Bitte zuerst ein Foto aufnehmen.',
      backlog_hint: 'im Backlog',
      sources: ['Lazada','Shopee','Markt Naklua','Markt Thepprasit','Makro','Tops','Villa','Grosshandel','Sonstige']
    },
    th: {
      btn_top: '📸', btn_sub: 'รับ',
      title: '📸 รับสินค้า — ถ่ายรูปฉลาก',
      hint: 'ราคา + แหล่งซื้อช่วย Claude ได้ แต่ไม่บังคับ',
      price_label: 'ราคา (บาท)',
      price_ph: 'เช่น 169',
      source_label: 'แหล่งซื้อ',
      note_label: 'บันทึก',
      note_ph: 'ถุง 2 กก., คั่ว, MHD สั้น …',
      send: '✅ ส่งให้ Claude',
      cancel: 'ยกเลิก',
      retake: '↻ ถ่ายใหม่',
      ok_sent: '✅ ส่งแล้ว — Claude กำลังจัดการ',
      err_queued: '⚠ ส่งไม่ได้ — เก็บไว้ในเครื่อง',
      no_webhook: 'ยังไม่ตั้ง webhook — จะให้ดาวน์โหลดและเก็บใน backlog',
      download: '⬇ ดาวน์โหลด',
      no_photo: 'กรุณาถ่ายรูปก่อน',
      backlog_hint: 'ใน backlog',
      sources: ['Lazada','Shopee','ตลาดนาเกลือ','ตลาดเทพประสิทธิ์','Makro','Tops','Villa','ค้าส่ง','อื่น ๆ']
    }
  };
  function tr() { return isThai() ? T.th : T.de; }

  // ---------- CSS ----------
  var css = '' +
  '.wefab{position:fixed;left:16px;bottom:16px;width:56px;height:56px;border-radius:50%;' +
    'background:#f77f00;color:#fff;border:0;font-size:18px;line-height:1;text-align:center;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.28);cursor:pointer;z-index:9999;padding:0;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;' +
    'transition:background .15s;}' +
  '.wefab:hover{background:#ff9420;}' +
  '.wefab:active{transform:scale(.96);}' +
  '.wefab .top{font-size:20px;line-height:1;}' +
  '.wefab .sub{font-size:9px;font-weight:700;letter-spacing:.5px;line-height:1;}' +
  '.we-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;' +
    'border-radius:10px;background:#e63946;color:#fff;font-size:12px;line-height:20px;' +
    'font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.3);}' +
  '.we-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:none;' +
    'align-items:flex-end;justify-content:center;}' +
  '.we-overlay.open{display:flex;}' +
  '.we-modal{background:#fff;width:100%;max-width:480px;border-radius:16px 16px 0 0;' +
    'padding:16px;box-sizing:border-box;max-height:92vh;overflow-y:auto;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#222;}' +
  '@media(min-width:600px){.we-overlay{align-items:center;}.we-modal{border-radius:16px;}}' +
  '.we-h{font-size:17px;font-weight:600;margin:0 0 6px;line-height:1.3;}' +
  '.we-hint{font-size:12px;color:#666;margin:0 0 10px;line-height:1.4;}' +
  '.we-prev{margin:8px 0 12px;display:none;position:relative;background:#f2f2f2;border-radius:8px;}' +
  '.we-prev img{max-width:100%;max-height:220px;border-radius:8px;display:block;margin:0 auto;}' +
  '.we-prev .retake{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.65);color:#fff;' +
    'border:0;padding:5px 10px;border-radius:14px;font-size:12px;cursor:pointer;}' +
  '.we-field{margin:8px 0;}' +
  '.we-field label{display:block;font-size:13px;margin:0 0 3px;color:#444;font-weight:500;}' +
  '.we-field input,.we-field select,.we-field textarea{width:100%;box-sizing:border-box;padding:9px 10px;' +
    'font-size:15px;border:1px solid #ccc;border-radius:8px;font-family:inherit;background:#fff;color:#222;}' +
  '.we-field textarea{min-height:60px;resize:vertical;}' +
  '.we-field input:focus,.we-field select:focus,.we-field textarea:focus{outline:2px solid #f77f00;border-color:#f77f00;}' +
  '.we-row{display:flex;gap:8px;margin:12px 0 0;flex-wrap:wrap;}' +
  '.we-b{flex:1;min-width:120px;padding:11px 12px;border-radius:8px;border:1px solid #ccc;' +
    'background:#f5f5f5;font-size:14px;cursor:pointer;font-family:inherit;color:#222;font-weight:500;}' +
  '.we-b:hover{background:#eaeaea;}' +
  '.we-b[disabled]{opacity:.5;cursor:not-allowed;}' +
  '.we-b.primary{background:#0aa367;color:#fff;border-color:#0aa367;font-weight:600;}' +
  '.we-b.primary:hover{background:#0dbf7a;}' +
  '.we-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);' +
    'background:#333;color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:10001;max-width:90%;text-align:center;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;opacity:0;' +
    'transition:opacity .25s;pointer-events:none;}' +
  '.we-toast.show{opacity:1;}' +
  '.we-toast.ok{background:#0aa367;}' +
  '.we-toast.warn{background:#e6a23c;}';
  var st = document.createElement('style');
  st.setAttribute('data-webtn', '1');
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
  function getBacklog(){
    try { var a = JSON.parse(q('wareneingang_pending')||'[]'); return Array.isArray(a)?a:[]; }
    catch(_) { return []; }
  }
  function setBacklog(a){ qs('wareneingang_pending', JSON.stringify(a)); }
  function pushBacklog(p){ var a = getBacklog(); a.push(p); setBacklog(a); updateBadge(); }
  function webhookUrl(){
    var u = q('wareneingang_webhook_url');
    if (u && u.trim()) return u.trim();
    var c = q('claude_webhook_url');
    return (c && c.trim()) || null;
  }
  function readFileAsDataURL(f){
    return new Promise(function(res, rej){
      var r = new FileReader();
      r.onload = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
      r.readAsDataURL(f);
    });
  }

  // ---------- Widget ----------
  var fab, badge, overlay, modal, cameraIn, prev, prevImg;
  var priceIn, sourceSel, noteIn, sendBtn, cancelBtn, retakeBtn;
  var currentPhoto = null;

  function build(){
    fab = document.createElement('button');
    fab.className = 'wefab';
    fab.type = 'button';
    fab.setAttribute('aria-label','Wareneingang');
    var top = document.createElement('span'); top.className = 'top';
    var sub = document.createElement('span'); sub.className = 'sub';
    fab.appendChild(top); fab.appendChild(sub);
    badge = document.createElement('span');
    badge.className = 'we-badge';
    badge.style.display = 'none';
    fab.appendChild(badge);
    fab.addEventListener('click', onFabClick);
    document.body.appendChild(fab);

    overlay = document.createElement('div');
    overlay.className = 'we-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

    modal = document.createElement('div');
    modal.className = 'we-modal';
    modal.innerHTML =
      '<h3 class="we-h"></h3>' +
      '<p class="we-hint"></p>' +
      '<div class="we-prev"><img alt=""/><button type="button" class="retake"></button></div>' +
      '<div class="we-field"><label data-lbl="price"></label>' +
        '<input type="number" inputmode="decimal" step="0.01" min="0" data-fld="price"></div>' +
      '<div class="we-field"><label data-lbl="source"></label>' +
        '<select data-fld="source"></select></div>' +
      '<div class="we-field"><label data-lbl="note"></label>' +
        '<textarea data-fld="note"></textarea></div>' +
      '<div class="we-row">' +
        '<button type="button" class="we-b" data-act="cancel"></button>' +
        '<button type="button" class="we-b primary" data-act="send" disabled></button>' +
      '</div>' +
      '<input type="file" accept="image/*" capture="environment" style="display:none" data-fld="cam">';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    cameraIn = modal.querySelector('input[data-fld="cam"]');
    prev     = modal.querySelector('.we-prev');
    prevImg  = prev.querySelector('img');
    retakeBtn= prev.querySelector('.retake');
    priceIn  = modal.querySelector('[data-fld="price"]');
    sourceSel= modal.querySelector('[data-fld="source"]');
    noteIn   = modal.querySelector('[data-fld="note"]');
    sendBtn  = modal.querySelector('[data-act="send"]');
    cancelBtn= modal.querySelector('[data-act="cancel"]');

    cameraIn.addEventListener('change', onCameraFile);
    retakeBtn.addEventListener('click', function(){ cameraIn.value=''; cameraIn.click(); });
    cancelBtn.addEventListener('click', closeModal);
    sendBtn.addEventListener('click', doSend);

    applyLabels();
    updateBadge();
  }

  function applyLabels(){
    var t = tr();
    fab.querySelector('.top').textContent = t.btn_top;
    fab.querySelector('.sub').textContent = t.btn_sub;
    modal.querySelector('.we-h').textContent = t.title;
    modal.querySelector('.we-hint').textContent = t.hint;
    modal.querySelector('[data-lbl="price"]').textContent = t.price_label;
    modal.querySelector('[data-lbl="source"]').textContent = t.source_label;
    modal.querySelector('[data-lbl="note"]').textContent = t.note_label;
    priceIn.placeholder = t.price_ph;
    noteIn.placeholder = t.note_ph;
    retakeBtn.textContent = t.retake;
    cancelBtn.textContent = t.cancel;
    sendBtn.textContent = t.send;
    // Quellen füllen (Default: „Sonstige" = letzter Eintrag)
    sourceSel.innerHTML = '';
    t.sources.forEach(function(s){
      var o = document.createElement('option'); o.value = s; o.textContent = s;
      sourceSel.appendChild(o);
    });
    sourceSel.value = t.sources[t.sources.length - 1];
  }

  function onFabClick(){
    applyLabels();
    // Direkt Kamera oeffnen; Modal folgt beim change-Event.
    cameraIn.value = '';
    cameraIn.click();
  }

  function onCameraFile(e){
    var f = e.target.files && e.target.files[0];
    if (!f) return;   // Nutzer hat Kamera abgebrochen
    readFileAsDataURL(f).then(function(d){
      currentPhoto = d;
      prevImg.src = d;
      prev.style.display = 'block';
      sendBtn.disabled = false;
      openModal();
    }).catch(function(){ toast('Foto-Fehler', 'warn'); });
  }

  function openModal(){
    overlay.classList.add('open');
    setTimeout(function(){ try{ priceIn.focus(); }catch(_){} }, 60);
  }
  function closeModal(){
    overlay.classList.remove('open');
    currentPhoto = null;
    prev.style.display = 'none';
    prevImg.src = '';
    cameraIn.value = '';
    priceIn.value = '';
    noteIn.value = '';
    sendBtn.disabled = true;
  }

  function buildPayload(){
    var priceRaw = (priceIn.value||'').trim();
    var price = priceRaw === '' ? null : Number(priceRaw);
    if (isNaN(price)) price = null;
    return {
      typ: 'wareneingang',
      ts: new Date().toISOString(),
      page: (location.pathname.split('/').pop()||'index').replace(/\?.*$/,''),
      foto_base64: currentPhoto || null,
      preis_thb: price,
      quelle: sourceSel.value || 'Sonstige',
      notiz: (noteIn.value||'').trim() || null,
      wer: getUser(),
      lang: isThai() ? 'th' : 'de',
      ua: navigator.userAgent
    };
  }

  function doSend(){
    if (!currentPhoto) { toast(tr().no_photo, 'warn'); return; }
    var p = buildPayload();
    var url = webhookUrl();
    if (!url) {
      // Fallback: Download + Backlog
      offerDownload(p);
      pushBacklog(p);
      toast(tr().no_webhook, 'warn');
      closeModal();
      return;
    }
    if (!navigator.onLine) {
      pushBacklog(p); toast(tr().err_queued, 'warn'); closeModal(); return;
    }
    sendBtn.disabled = true;
    fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(p)
    }).then(function(r){
      if (!r.ok) throw new Error('HTTP '+r.status);
      toast(tr().ok_sent, 'ok');
      closeModal();
    }).catch(function(){
      pushBacklog(p);
      toast(tr().err_queued, 'warn');
      closeModal();
    });
  }

  function offerDownload(p){
    try {
      var blob = new Blob([JSON.stringify(p, null, 2)], {type:'application/json'});
      var u = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = u;
      a.download = 'wareneingang-'+p.ts.replace(/[:.]/g,'-')+'.json';
      a.textContent = tr().download;
      a.style.cssText = 'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);' +
        'background:#f77f00;color:#fff;padding:10px 16px;border-radius:8px;z-index:10002;' +
        'text-decoration:none;font-family:system-ui,sans-serif;font-size:14px;';
      document.body.appendChild(a);
      setTimeout(function(){ try{URL.revokeObjectURL(u);a.remove();}catch(_){} }, 15000);
    } catch(_){}
  }

  // ---------- Backlog-Badge ----------
  function updateBadge(){
    var n = getBacklog().length;
    if (!badge) return;
    if (n > 0) { badge.textContent = n; badge.style.display = 'block'; }
    else       { badge.style.display = 'none'; }
  }

  // ---------- Toast ----------
  var toastEl, toastTmo;
  function toast(msg, kind){
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'we-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.className = 'we-toast ' + (kind||'');
    toastEl.textContent = msg;
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTmo);
    toastTmo = setTimeout(function(){ toastEl.classList.remove('show'); }, 3000);
  }

  // ---------- Lifecycle ----------
  function boot(){
    build();
    // Backlog-Badge live halten (Firebase-Sync raeumt evtl. weg)
    window.addEventListener('storage', function(e){
      if (e.key === 'wareneingang_pending') updateBadge();
    });
    setInterval(updateBadge, 5000);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
