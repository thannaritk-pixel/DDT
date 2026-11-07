/*
 * Web app client: researcher tabs (start / data / summary) and the
 * participant task. Talks to Code.gs through google.script.run.
 */
(function () {
  'use strict';
  const C = window.DDTCore;
  const F = window.DDTFit;
  const $ = (id) => document.getElementById(id);
  const ITI_MS = 500;
  const FEEDBACK_MS = 250;
  const PENDING_KEY = 'ddt_pending_v1';

  const app = { config: null, sessions: [], editing: null };
  let session = null, meta = null, current = null, onsetT = 0, waiting = false;

  // ---------- server calls ----------
  function call(fn, ...args) {
    return new Promise((resolve, reject) => {
      google.script.run.withSuccessHandler(resolve)
        .withFailureHandler((e) => reject(e && e.message ? e : new Error(String(e))))[fn](...args);
    });
  }

  // ---------- navigation ----------
  function showTab(id) {
    document.body.classList.remove('in-task');
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
    document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    if (id === 'tab-data' || id === 'tab-summary') refreshSessions();
  }

  function showTask(id) {
    document.body.classList.add('in-task');
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  function fillSelect(sel, items, value) {
    sel.innerHTML = items.map((v) => '<option>' + esc(v) + '</option>').join('');
    if (value !== undefined && items.indexOf(value) >= 0) sel.value = value;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showError(el, msg) { el.textContent = msg; el.classList.toggle('hidden', !msg); }

  // ---------- start ----------
  async function loadConfig() {
    try {
      const cfg = await call('getConfig');
      app.config = cfg;
      fillSelect($('in-group'), cfg.groups);
      fillSelect($('in-label'), cfg.labels);
      fillSelect($('ed-group'), cfg.groups);
      fillSelect($('ed-label'), cfg.labels);
      const d = cfg.defaults || {};
      if (d.default_mode) $('in-mode').value = d.default_mode;
      if (d.scale) $('in-scale').value = d.scale;
      if (d.currency) $('in-currency').value = d.currency;
      if (d.practice !== undefined) $('in-practice').checked = String(d.practice).toUpperCase() !== 'FALSE';
      if (d.catch_trials !== undefined) $('in-catch').checked = String(d.catch_trials).toUpperCase() !== 'FALSE';
      $('user-line').textContent = cfg.user ? 'เข้าสู่ระบบ: ' + cfg.user : '';
      $('sheet-link').href = cfg.sheetUrl;
      refreshSessions();
    } catch (e) {
      showError($('start-error'), e.message);
    }
  }

  // Typing a known subjID fills in the group used before.
  function onIdInput() {
    const id = $('in-id').value.trim();
    const prev = app.sessions.find((s) => String(s.subjID) === id);
    if (prev && app.config.groups.indexOf(prev.group) >= 0) $('in-group').value = prev.group;
  }

  async function startTask() {
    showError($('start-error'), '');
    const id = $('in-id').value.trim();
    if (!id) return showError($('start-error'), 'กรุณาใส่รหัสผู้เข้าร่วม');
    if (!/^[A-Za-z0-9ก-๙_.-]{1,40}$/.test(id)) return showError($('start-error'), 'รหัสใช้ได้เฉพาะตัวอักษร ตัวเลข _ . - (ไม่เกิน 40 ตัว)');
    const m = {
      subjID: id, group: $('in-group').value, session_label: $('in-label').value, mode: $('in-mode').value
    };
    $('btn-start').disabled = true;
    try {
      const dups = await call('checkDuplicate', m.subjID, m.mode, m.session_label);
      if (dups.length && !confirm(id + ' เคยทำ ' + m.mode + ' (' + m.session_label + ') แล้ว ' + dups.length +
          ' ครั้ง\nต้องการทำซ้ำหรือไม่?')) return;
    } catch (e) {
      // Server unreachable: allow the session, data will queue locally.
    } finally {
      $('btn-start').disabled = false;
    }
    meta = Object.assign(m, {
      session_id: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      device: (navigator.userAgent.match(/iPad|iPhone|Android|Macintosh|Windows/) || ['other'])[0]
    });
    session = C.createSession({
      id: id, mode: m.mode,
      scale: parseFloat($('in-scale').value) || 1,
      currency: $('in-currency').value.trim(),
      practice: $('in-practice').checked,
      catchTrials: $('in-catch').checked
    });
    $('instr-text').innerHTML = instructions(m.mode);
    showTask('screen-instr');
  }

  function instructions(mode) {
    return '<p>ในแต่ละข้อ คุณจะเห็นตัวเลือกให้รับเงิน 2 แบบ คือ ' +
      '<b>เงินจำนวนน้อยกว่าที่ได้รับวันนี้</b> หรือ <b>เงินจำนวนมากกว่าที่ได้รับในอนาคต</b></p>' +
      '<p>ให้เลือกตัวเลือกที่คุณ <b>อยากได้จริง ๆ</b> ไม่มีคำตอบถูกหรือผิด ' +
      'ให้คิดเสมือนว่าจะได้รับเงินนั้นจริง</p><p>แตะที่ตัวเลือกที่ต้องการ</p>' +
      (mode === 'adjusting' ? '<p>จำนวนเงินจะเปลี่ยนไปตามคำตอบของคุณ</p>' : '');
  }

  // ---------- task ----------
  function optionHtml(amt, d, exact) {
    return '<span class="amt">' + C.fmtMoney(amt) + ' ' + esc(session.cfg.currency) +
      '</span><span class="when">' + C.fmtDelay(d, exact) + '</span>';
  }

  function runNext() {
    const t = session.next();
    if (!t) {
      if (session.phase === 'practice') {
        session.startMain();
        $('msg-text').innerHTML = '<h2>จบข้อฝึกหัด</h2><p>ต่อไปเป็นข้อจริง ไม่มีคำตอบถูกหรือผิด เลือกตามที่คุณต้องการจริง ๆ</p>';
        showTask('screen-msg');
        return;
      }
      finishTask();
      return;
    }
    current = t;
    const exact = session.cfg.mode === 'kirby' && !t.is_catch && !t.is_practice;
    const sooner = optionHtml(t.amount_sooner, t.delay_sooner, exact);
    const later = optionHtml(t.amount_later, t.delay_later, exact);
    $('opt-left').innerHTML = t.later_on_left ? later : sooner;
    $('opt-right').innerHTML = t.later_on_left ? sooner : later;
    ['opt-left', 'opt-right'].forEach((id) => { $(id).classList.remove('chosen'); $(id).disabled = false; });
    const pr = session.progress();
    $('trial-progress').textContent = session.phase === 'practice' ? 'ข้อฝึกหัด' : 'ข้อที่ ' + (pr.done + 1) + ' / ' + pr.total;
    showTask('screen-trial');
    onsetT = performance.now();
    waiting = true;
  }

  function respond(side) {
    if (!waiting) return;
    waiting = false;
    const rt = performance.now() - onsetT;
    const choseLeft = side === 'left';
    const choice = (choseLeft === (current.later_on_left === 1)) ? 1 : 0;
    $(choseLeft ? 'opt-left' : 'opt-right').classList.add('chosen');
    $('opt-left').disabled = true; $('opt-right').disabled = true;
    session.record(current, choice, rt);
    setTimeout(() => { showTask('screen-iti'); setTimeout(runNext, ITI_MS); }, FEEDBACK_MS);
  }

  function buildPayload() {
    const fit = F.summarize(session.fitRows(), session.cfg.mode);
    const s = Object.assign({}, meta, session.basicSummary(), fit, {
      scale: session.cfg.scale, currency: session.cfg.currency, seed: session.seed,
      started_at: session.startedAt, finished_at: new Date().toISOString()
    });
    // Practice trials are not stored; catch trials are stored with is_catch = 1.
    return { session: s, trials: session.mainRows() };
  }

  async function finishTask() {
    const payload = buildPayload();
    $('end-summary').textContent = resultText(payload.session);
    $('end-summary').classList.add('hidden');
    showTask('screen-end');
    // Queue first so nothing is lost if the network or tab dies mid-save.
    addPending(payload);
    await sendPending(true);
  }

  function resultText(s) {
    const n = (x, d = 4) => (x === '' || x == null ? 'NA' : (+x).toPrecision(d));
    const lines = [
      s.subjID + ' | ' + s.group + ' | ' + s.session_label + ' | ' + s.mode,
      'trials ' + s.n_trials + ', catch fail ' + s.catch_fail + '/' + s.n_catch + ', P(later) ' + n(s.prop_later, 3) + ', median RT ' + s.median_rt + ' ms',
      'Hyperbolic k = ' + n(s.k_hyp) + ' (log k ' + n(s.log_k_hyp) + '), beta = ' + n(s.beta_hyp),
      'Exponential k = ' + n(s.k_exp) + '; best by BIC: ' + (s.best_model || 'NA')
    ];
    if (s.kirby_k) lines.push('Kirby k = ' + n(s.kirby_k) + ' (consistency ' + n(s.kirby_consistency, 3) + ')');
    if (s.auc !== undefined && s.auc !== '') lines.push('AUC = ' + n(s.auc, 3) + (Number(s.jb_nonsystematic) ? ' [nonsystematic]' : ''));
    if (Number(s.k_at_bound)) lines.push('⚠ k ติดขอบ (ประมาณค่าได้ไม่แม่น)');
    return lines.join('\n');
  }

  // ---------- offline-safe saving ----------
  function getPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return []; }
  }
  function setPending(list) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    const n = list.length;
    $('pending-text').textContent = 'มีข้อมูลค้างส่ง ' + n + ' รายการ (เก็บไว้ในเครื่องนี้)';
    $('pending-banner').classList.toggle('hidden', n === 0);
  }
  function addPending(p) {
    const list = getPending().filter((x) => x.session.session_id !== p.session.session_id);
    list.push(p);
    setPending(list);
    app.unsaved = p; // in-memory copy in case storage is unavailable
  }

  async function sendPending(fromEnd) {
    let list = getPending();
    if (!list.length && app.unsaved) list = [app.unsaved];
    const status = $('save-status');
    if (fromEnd) { status.className = 'status'; status.textContent = 'กำลังบันทึกข้อมูล…'; }
    let failed = 0, lastErr = '';
    for (const p of list) {
      try {
        await call('saveSession', p);
        list = list.filter((x) => x.session.session_id !== p.session.session_id);
        if (app.unsaved && app.unsaved.session.session_id === p.session.session_id) app.unsaved = null;
      } catch (e) {
        failed += 1; lastErr = e.message;
      }
    }
    setPending(list);
    if (fromEnd) {
      status.className = 'status ' + (failed ? 'fail' : 'ok');
      status.textContent = failed ? 'ยังบันทึกไม่ได้ (' + lastErr + ') ข้อมูลเก็บไว้ในเครื่อง กด "ส่งอีกครั้ง" ที่หน้าหลัก'
        : '✓ บันทึกลง Google Sheet แล้ว';
    }
    return failed;
  }

  // ---------- data tab ----------
  async function refreshSessions() {
    $('data-status').textContent = 'กำลังโหลด…';
    try {
      app.sessions = await call('listSessions');
      $('known-ids').innerHTML = [...new Set(app.sessions.map((s) => String(s.subjID)))]
        .map((v) => '<option value="' + esc(v) + '">').join('');
      renderCards();
      renderSummary();
    } catch (e) {
      $('data-status').textContent = e.message;
    }
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function maxCatchFail() {
    const v = Number((app.config && app.config.defaults.max_catch_fail));
    return isFinite(v) ? v : 1;
  }

  function renderCards() {
    const q = $('search').value.trim().toLowerCase();
    const list = app.sessions.filter((s) => !q ||
      [s.subjID, s.group, s.mode, s.session_label].some((v) => String(v).toLowerCase().includes(q)));
    $('data-status').textContent = list.length + ' session' + (q ? ' (จาก ' + app.sessions.length + ')' : '');
    const n = (x, d = 3) => (x === '' || x == null ? 'NA' : (+x).toPrecision(d));
    $('cards').innerHTML = list.map((s) => {
      const tags = [];
      if (Number(s.exclude)) tags.push('<span class="tag bad">exclude</span>');
      if (Number(s.catch_fail) > maxCatchFail()) tags.push('<span class="tag bad">catch ' + s.catch_fail + '/' + s.n_catch + '</span>');
      if (Number(s.k_at_bound)) tags.push('<span class="tag warn">k ติดขอบ</span>');
      if (Number(s.jb_nonsystematic)) tags.push('<span class="tag warn">nonsystematic</span>');
      if (s.kirby_consistency !== '' && Number(s.kirby_consistency) < 0.75) tags.push('<span class="tag warn">consistency ต่ำ</span>');
      return '<div class="card' + (Number(s.exclude) ? ' excluded' : '') + '">' +
        '<div class="card-top"><b>' + esc(s.subjID) + '</b><span class="meta">' + esc(fmtDate(s.finished_at)) + '</span></div>' +
        '<div class="meta">' + esc(s.group) + ' · ' + esc(s.session_label) + ' · ' + esc(s.mode) + '</div>' +
        '<div class="nums">k = ' + n(s.k_hyp) + ' · log k = ' + n(s.log_k_hyp) + ' · β = ' + n(s.beta_hyp) +
        ' · P(later) = ' + n(s.prop_later, 2) + (s.auc !== '' ? ' · AUC = ' + n(s.auc) : '') +
        (s.kirby_k !== '' ? ' · Kirby k = ' + n(s.kirby_k) : '') + '</div>' +
        (tags.length ? '<div>' + tags.join('') + '</div>' : '') +
        (s.note ? '<div class="meta">📝 ' + esc(s.note) + '</div>' : '') +
        '<div class="actions"><button data-edit="' + esc(s.session_id) + '">แก้ไข</button>' +
        '<button data-del="' + esc(s.session_id) + '">ลบ</button></div></div>';
    }).join('') || '<p class="muted">ยังไม่มีข้อมูล</p>';
  }

  function openEdit(id) {
    const s = app.sessions.find((x) => x.session_id === id);
    if (!s) return;
    app.editing = s;
    $('dlg-title').textContent = 'แก้ไข ' + s.subjID + ' (' + s.mode + ')';
    $('ed-group').value = s.group;
    $('ed-label').value = s.session_label;
    $('ed-exclude').checked = Number(s.exclude) === 1;
    $('ed-note').value = s.note || '';
    showError($('dlg-error'), '');
    $('dlg').classList.remove('hidden');
  }

  async function saveEdit() {
    const s = app.editing;
    $('ed-save').disabled = true;
    try {
      await call('updateSession', s.session_id, {
        group: $('ed-group').value, session_label: $('ed-label').value,
        exclude: $('ed-exclude').checked, note: $('ed-note').value
      }, s.updatedAt);
      $('dlg').classList.add('hidden');
      refreshSessions();
    } catch (e) {
      showError($('dlg-error'), e.message);
    } finally {
      $('ed-save').disabled = false;
    }
  }

  async function deleteSession(id) {
    const s = app.sessions.find((x) => x.session_id === id);
    if (!s || !confirm('ลบข้อมูล ' + s.subjID + ' (' + s.mode + ', ' + fmtDate(s.finished_at) + ') ทั้งหมด?\nลบแล้วกู้คืนไม่ได้')) return;
    try {
      await call('deleteSession', id, s.updatedAt);
      refreshSessions();
    } catch (e) {
      alert(e.message);
    }
  }

  // ---------- summary tab ----------
  function stats(xs) {
    const v = xs.filter((x) => x !== '' && x != null && isFinite(+x)).map(Number);
    if (!v.length) return { n: 0 };
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : NaN;
    return { n: v.length, m, sd };
  }

  function renderSummary() {
    const valid = app.sessions.filter((s) => !Number(s.exclude) && !(Number(s.catch_fail) > maxCatchFail()));
    const groups = (app.config && app.config.groups) || [];
    const modes = ['grid', 'kirby', 'adjusting'];
    const f = (x, d = 2) => (isFinite(x) ? x.toFixed(d) : '–');
    let html = '<p>ทั้งหมด ' + app.sessions.length + ' session · ใช้วิเคราะห์ได้ ' + valid.length +
      ' · exclude/ผิด catch ' + (app.sessions.length - valid.length) + '</p>';
    modes.forEach((mode) => {
      const rows = valid.filter((s) => s.mode === mode);
      if (!rows.length) return;
      html += '<h3>' + mode + '</h3><div class="table-wrap"><table><tr><th>กลุ่ม</th><th>n</th>' +
        '<th>log k (mean ± SD)</th><th>β median</th><th>P(later)</th>' +
        (mode === 'adjusting' ? '<th>AUC</th>' : '') + (mode === 'kirby' ? '<th>Kirby log k</th>' : '') + '</tr>';
      groups.forEach((g) => {
        const r = rows.filter((s) => s.group === g);
        if (!r.length) return;
        const lk = stats(r.map((s) => s.log_k_hyp));
        const pl = stats(r.map((s) => s.prop_later));
        const betas = r.map((s) => +s.beta_hyp).filter(isFinite).sort((a, b) => a - b);
        const bmed = betas.length ? betas[Math.floor(betas.length / 2)] : NaN;
        html += '<tr><td>' + esc(g) + '</td><td>' + r.length + '</td><td>' + f(lk.m) + ' ± ' + f(lk.sd) +
          '</td><td>' + (isFinite(bmed) ? bmed.toPrecision(3) : '–') + '</td><td>' + f(pl.m) + '</td>';
        if (mode === 'adjusting') { const a = stats(r.map((s) => s.auc)); html += '<td>' + f(a.m) + ' ± ' + f(a.sd) + '</td>'; }
        if (mode === 'kirby') { const kk = stats(r.map((s) => s.kirby_k ? Math.log(s.kirby_k) : '')); html += '<td>' + f(kk.m) + ' ± ' + f(kk.sd) + '</td>'; }
        html += '</tr>';
      });
      const best = { hyperbolic: 0, exponential: 0 };
      rows.forEach((s) => { if (best[s.best_model] !== undefined) best[s.best_model] += 1; });
      html += '</table></div><p class="muted small">Best model (BIC): hyperbolic ' + best.hyperbolic +
        ', exponential ' + best.exponential + ' คน · ค่าเหล่านี้เป็นการดูเบื้องต้น การวิเคราะห์จริงใช้ analysis/ (Python) หรือ hBayesDM</p>';
    });
    $('summary-body').innerHTML = html;
  }

  async function exportCsv() {
    $('btn-export').disabled = true;
    $('export-result').textContent = 'กำลังสร้างไฟล์…';
    try {
      const r = await call('exportCsv');
      $('export-result').innerHTML = 'สร้างไฟล์แล้วในโฟลเดอร์ <a target="_blank" rel="noopener" href="' + esc(r.folderUrl) +
        '">DDT exports</a>: <a target="_blank" rel="noopener" href="' + esc(r.trialsUrl) + '">trials</a> · ' +
        '<a target="_blank" rel="noopener" href="' + esc(r.sessionsUrl) + '">sessions</a>';
    } catch (e) {
      $('export-result').textContent = e.message;
    } finally {
      $('btn-export').disabled = false;
    }
  }

  // ---------- wiring ----------
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('in-id').addEventListener('input', onIdInput);
    $('btn-start').addEventListener('click', startTask);
    $('btn-instr').addEventListener('click', runNext);
    $('btn-abort').addEventListener('click', () => { if (confirm('ยกเลิก session นี้? ข้อมูลจะไม่ถูกบันทึก')) showTab('tab-start'); });
    $('btn-msg').addEventListener('click', runNext);
    $('opt-left').addEventListener('click', () => respond('left'));
    $('opt-right').addEventListener('click', () => respond('right'));
    $('btn-show-result').addEventListener('click', () => $('end-summary').classList.toggle('hidden'));
    $('btn-home').addEventListener('click', () => { $('in-id').value = ''; showTab('tab-start'); refreshSessions(); });
    $('btn-retry').addEventListener('click', () => sendPending(false).then(refreshSessions));
    $('search').addEventListener('input', renderCards);
    $('cards').addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset.edit) openEdit(t.dataset.edit);
      if (t.dataset.del) deleteSession(t.dataset.del);
    });
    $('ed-save').addEventListener('click', saveEdit);
    $('ed-cancel').addEventListener('click', () => $('dlg').classList.add('hidden'));
    $('btn-export').addEventListener('click', exportCsv);
    document.addEventListener('keydown', (e) => {
      if ($('screen-trial').classList.contains('hidden')) return;
      const k = e.key.toLowerCase();
      if (k === 'f' || e.key === 'ArrowLeft') respond('left');
      if (k === 'j' || e.key === 'ArrowRight') respond('right');
    });
    window.addEventListener('beforeunload', (e) => {
      if (document.body.classList.contains('in-task') && $('screen-end').classList.contains('hidden')) {
        e.preventDefault(); e.returnValue = '';
      }
    });
    setPending(getPending());
    loadConfig().then(() => { if (getPending().length) sendPending(false).then(refreshSessions); });
  });
})();
