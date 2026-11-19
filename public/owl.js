/* Wise Owl chat widget. Loaded by index.html; talks to /owl-chat. */
(function () {
  if (window.__wiseOwl) return; window.__wiseOwl = true;

  var OWL = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 10l8 8h20l8-8v26c0 12-8 20-18 20S14 48 14 36z" fill="#164a2c"/><circle cx="24" cy="30" r="9" fill="#f5f1e7"/><circle cx="40" cy="30" r="9" fill="#f5f1e7"/><circle cx="24" cy="30" r="4" fill="#0a1c12"/><circle cx="40" cy="30" r="4" fill="#0a1c12"/><path d="M29 38l3 5 3-5z" fill="#f0b447"/><path d="M22 48c3 3 6 4 10 4s7-1 10-4" stroke="#20a349" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
  var GREETING = "Hoo! I'm Wise Owl. Ask me about sprinklers, drainage, landscape lighting or Christmas lights, or I can set up your free estimate.";
  var CHIPS = ['Get a free estimate', 'My sprinklers need repair', 'Water pools in my yard', 'Christmas lights'];

  var css = '' +
    '.wo-btn{position:fixed;right:18px;bottom:18px;z-index:9998;width:64px;height:64px;border-radius:50%;border:0;background:#f5f1e7;box-shadow:0 8px 28px rgba(0,0,0,.35);cursor:pointer;padding:6px;transition:transform .2s}' +
    '.wo-btn:hover{transform:scale(1.06)}.wo-btn svg{width:100%;height:100%}' +
    '.wo-tip{position:fixed;right:90px;bottom:34px;z-index:9998;background:#0a1c12;color:#f5f1e7;font:500 14px/1.3 system-ui,sans-serif;padding:8px 12px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.3)}' +
    '.wo-panel{position:fixed;right:18px;bottom:94px;z-index:9999;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);display:none;flex-direction:column;background:#f5f1e7;color:#0a1c12;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.4);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}' +
    '.wo-panel.open{display:flex}' +
    '.wo-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#0a1c12;color:#f5f1e7}' +
    '.wo-head .wo-av{width:36px;height:36px;background:#f5f1e7;border-radius:50%;padding:3px}.wo-head b{display:block;font-size:16px}.wo-head small{opacity:.75}' +
    '.wo-x{margin-left:auto;background:none;border:0;color:#f5f1e7;font-size:24px;cursor:pointer;line-height:1}' +
    '.wo-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}' +
    '.wo-m{max-width:85%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}' +
    '.wo-m.bot{background:#fff;align-self:flex-start;border-bottom-left-radius:4px}' +
    '.wo-m.me{background:#164a2c;color:#f5f1e7;align-self:flex-end;border-bottom-right-radius:4px}' +
    '.wo-m.ok{background:#20a349;color:#fff}' +
    '.wo-chips{display:flex;flex-wrap:wrap;gap:6px}.wo-chips button{border:1px solid #164a2c;background:transparent;color:#164a2c;border-radius:999px;padding:5px 10px;font:inherit;font-size:13px;cursor:pointer}' +
    '.wo-chips button:hover{background:#164a2c;color:#f5f1e7}' +
    '.wo-form{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(10,28,18,.12);background:#fff}' +
    '.wo-form input{flex:1;border:1px solid rgba(10,28,18,.25);border-radius:10px;padding:10px;font:inherit;min-width:0}' +
    '.wo-form button{border:0;background:#20a349;color:#fff;border-radius:10px;padding:0 14px;font:600 14px system-ui,sans-serif;cursor:pointer}' +
    '.wo-form button:disabled{opacity:.5}' +
    '.wo-foot{font-size:11px;text-align:center;padding:0 10px 8px;background:#fff;color:#555}.wo-foot a{color:#164a2c}' +
    '.wo-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#164a2c;animation:wob 1s infinite}' +
    '.wo-dots span:nth-child(2){animation-delay:.15s}.wo-dots span:nth-child(3){animation-delay:.3s}' +
    '@keyframes wob{0%,100%{opacity:.3}50%{opacity:1}}' +
    '.wo-panel,.wo-panel *{cursor:auto!important}.wo-btn,.wo-tip,.wo-panel button{cursor:pointer!important}.wo-panel input{cursor:text!important}' +
    '@media (max-width:480px){.wo-panel{right:8px;left:8px;width:auto;max-width:none;bottom:88px;height:calc(100vh - 110px)}}';

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button');
  btn.className = 'wo-btn'; btn.setAttribute('aria-label', 'Chat with Wise Owl'); btn.innerHTML = OWL;

  var panel = document.createElement('div');
  panel.className = 'wo-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Wise Owl chat');
  panel.innerHTML = '<div class="wo-head"><div class="wo-av">' + OWL + '</div><div><b>Wise Owl</b><small>Wise Sprinklers &amp; Lighting</small></div><button class="wo-x" aria-label="Close chat">&times;</button></div>' +
    '<div class="wo-log" aria-live="polite"></div>' +
    '<form class="wo-form"><input maxlength="1000" placeholder="Ask Wise Owl…" aria-label="Your message" autocomplete="off"><button type="submit">Send</button></form>' +
    '<div class="wo-foot">AI helper, may make mistakes. Call <a href="tel:2819104283">281-910-4283</a> anytime.</div>';

  document.body.appendChild(btn); document.body.appendChild(panel);

  var log = panel.querySelector('.wo-log'), form = panel.querySelector('form'),
      input = form.querySelector('input'), send = form.querySelector('button');
  var history = [];
  try { history = JSON.parse(sessionStorage.getItem('wiseOwl') || '[]'); } catch (e) { history = []; }
  function save() { try { sessionStorage.setItem('wiseOwl', JSON.stringify(history.slice(-30))); } catch (e) {} }

  function bubble(text, who) {
    var d = document.createElement('div'); d.className = 'wo-m ' + who; d.textContent = text;
    log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  function render() {
    log.innerHTML = '';
    bubble(GREETING, 'bot');
    if (!history.length) {
      var c = document.createElement('div'); c.className = 'wo-chips';
      CHIPS.forEach(function (t) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = function () { ask(t); }; c.appendChild(b); });
      log.appendChild(c);
    }
    history.forEach(function (m) { bubble(m.content, m.role === 'user' ? 'me' : 'bot'); });
  }

  var busy = false;
  function ask(text) {
    text = (text || '').trim(); if (!text || busy) return;
    var chips = log.querySelector('.wo-chips'); if (chips) chips.remove();
    history.push({ role: 'user', content: text }); save(); bubble(text, 'me');
    input.value = ''; busy = true; send.disabled = true;
    var wait = bubble('', 'bot'); wait.innerHTML = '<span class="wo-dots"><span></span><span></span><span></span></span>';
    fetch('/owl-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        var reply = d.reply || "Sorry, I'm having trouble right now. Please call 281-910-4283.";
        wait.textContent = reply; if (d.quote_saved) wait.classList.add('ok');
        history.push({ role: 'assistant', content: reply }); save();
      })
      .catch(function () { wait.textContent = "I can't connect right now. Please call 281-910-4283."; })
      .then(function () { busy = false; send.disabled = false; log.scrollTop = log.scrollHeight; input.focus(); });
  }

  function open(v) {
    panel.classList.toggle('open', v);
    var tip = document.querySelector('.wo-tip'); if (tip) tip.remove();
    if (v) { render(); setTimeout(function () { input.focus(); }, 50); }
  }
  btn.onclick = function () { open(!panel.classList.contains('open')); };
  panel.querySelector('.wo-x').onclick = function () { open(false); btn.focus(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) open(false); });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });

  // One-time nudge after a few seconds.
  setTimeout(function () {
    if (panel.classList.contains('open')) return;
    try { if (sessionStorage.getItem('wiseOwlTip')) return; sessionStorage.setItem('wiseOwlTip', '1'); } catch (e) {}
    var t = document.createElement('div'); t.className = 'wo-tip'; t.textContent = 'Questions? Ask Wise Owl!';
    t.onclick = function () { open(true); }; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 8000);
  }, 6000);
})();
