/*
 * Standalone task page (no server): runs a session with DDTCore, shows the
 * model fit at the end and downloads the data file.
 */
(function () {
  'use strict';
  const C = window.DDTCore;
  const F = window.DDTFit;
  const $ = (id) => document.getElementById(id);
  const ITI_MS = 500;
  const FEEDBACK_MS = 250;

  let session = null, current = null, onsetT = 0, waiting = false, urlSeed = null;

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  function readConfig() {
    const p = new URLSearchParams(location.search);
    if (p.has('id')) $('in-id').value = p.get('id');
    if (p.has('mode')) $('in-mode').value = p.get('mode');
    if (p.has('scale')) $('in-scale').value = p.get('scale');
    if (p.has('currency')) $('in-currency').value = p.get('currency');
    if (p.get('practice') === '0') $('in-practice').checked = false;
    if (p.get('catch') === '0') $('in-catch').checked = false;
    urlSeed = p.get('seed');
    return p.get('autostart') === '1';
  }

  function optionHtml(amt, d, exact) {
    return '<span class="amt">' + C.fmtMoney(amt) + ' ' + session.cfg.currency +
      '</span><span class="when">' + C.fmtDelay(d, exact) + '</span>';
  }

  function runNext() {
    const t = session.next();
    if (!t) {
      if (session.phase === 'practice') {
        session.startMain();
        $('msg-text').innerHTML = '<h2>จบข้อฝึกหัด</h2><p>ต่อไปเป็นข้อจริง ' +
          'ไม่มีคำตอบถูกหรือผิด เลือกตามที่คุณต้องการจริง ๆ</p>';
        show('screen-msg');
        return;
      }
      finish();
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
    $('trial-progress').textContent = session.phase === 'practice' ? 'ข้อฝึกหัด'
      : 'ข้อที่ ' + (pr.done + 1) + ' / ' + pr.total;
    show('screen-trial');
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
    try { localStorage.setItem('ddt_backup_' + session.cfg.id, JSON.stringify(session.rows)); } catch (e) { /* ignore */ }
    setTimeout(() => { show('screen-iti'); setTimeout(runNext, ITI_MS); }, FEEDBACK_MS);
  }

  function summaryText() {
    const b = session.basicSummary();
    const f = F.summarize(session.fitRows(), session.cfg.mode);
    const n = (x, d = 4) => (x == null ? 'NA' : (+x).toPrecision(d));
    const lines = [
      'subjID: ' + session.cfg.id, 'mode: ' + session.cfg.mode, 'seed: ' + session.seed,
      'trials: ' + b.n_trials + ' (+' + b.n_catch + ' catch)',
      'proportion later: ' + n(b.prop_later, 3),
      'catch failures: ' + b.catch_fail + ' / ' + b.n_catch,
      'median RT (ms): ' + b.median_rt, '',
      'Hyperbolic: k = ' + n(f.k_hyp) + ', log k = ' + n(f.log_k_hyp) + ', beta = ' + n(f.beta_hyp),
      'Exponential: k = ' + n(f.k_exp) + ', beta = ' + n(f.beta_exp),
      'Best model (BIC): ' + (f.best_model || 'NA')
    ];
    if (f.k_at_bound) lines.push('Warning: k at bound (poorly identified)');
    if (f.kirby_k != null) lines.push('Kirby k = ' + n(f.kirby_k) + ' (consistency ' + n(f.kirby_consistency, 3) + ')');
    if (f.auc != null) {
      lines.push('AUC = ' + n(f.auc, 3) + (f.jb_nonsystematic ? '  [Johnson & Bickel: nonsystematic]' : ''));
      lines.push('Indifference points (day:prop): ' + f.indiff_points);
    }
    return lines.join('\n');
  }

  function download(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function fileBase() {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return 'ddt_' + session.cfg.mode + '_' + session.cfg.id + '_' + ts;
  }

  // hBayesDM file: main trials only, catch trials removed (they are kept in the .csv).
  const tsv = () => C.toDelimited(session.fitRows(), '\t');

  function finish() {
    $('summary').textContent = summaryText();
    show('screen-end');
    download(tsv(), fileBase() + '.txt', 'text/tab-separated-values');
  }

  function instructions(mode) {
    return '<p>ในแต่ละข้อ คุณจะเห็นตัวเลือกให้รับเงิน 2 แบบ คือ ' +
      '<b>เงินจำนวนน้อยกว่าที่ได้รับวันนี้</b> หรือ <b>เงินจำนวนมากกว่าที่ได้รับในอนาคต</b></p>' +
      '<p>ให้เลือกตัวเลือกที่คุณ <b>อยากได้จริง ๆ</b> ไม่มีคำตอบถูกหรือผิด ' +
      'ให้คิดเสมือนว่าจะได้รับเงินนั้นจริง</p>' +
      '<p>แตะที่ตัวเลือก หรือกดแป้น <kbd>F</kbd> (ซ้าย) / <kbd>J</kbd> (ขวา)</p>' +
      (mode === 'adjusting' ? '<p>จำนวนเงินจะเปลี่ยนไปตามคำตอบของคุณ</p>' : '');
  }

  function start() {
    session = C.createSession({
      id: ($('in-id').value || '').trim() || 'anon',
      mode: $('in-mode').value,
      scale: parseFloat($('in-scale').value) || 1,
      currency: ($('in-currency').value || '').trim(),
      practice: $('in-practice').checked,
      catchTrials: $('in-catch').checked,
      seed: urlSeed
    });
    $('instr-text').innerHTML = instructions(session.cfg.mode);
    show('screen-instr');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const autostart = readConfig();
    $('btn-start').addEventListener('click', start);
    $('btn-instr').addEventListener('click', runNext);
    $('btn-msg').addEventListener('click', runNext);
    $('opt-left').addEventListener('click', () => respond('left'));
    $('opt-right').addEventListener('click', () => respond('right'));
    $('btn-dl-tsv').addEventListener('click', () => download(tsv(), fileBase() + '.txt', 'text/tab-separated-values'));
    $('btn-dl-csv').addEventListener('click', () => download(C.toDelimited(session.rows, ','), fileBase() + '.csv', 'text/csv'));
    document.addEventListener('keydown', (e) => {
      if ($('screen-trial').classList.contains('hidden')) return;
      const k = e.key.toLowerCase();
      if (k === 'f' || e.key === 'ArrowLeft') respond('left');
      if (k === 'j' || e.key === 'ArrowRight') respond('right');
    });
    if (autostart) start();
  });
})();
