/*
 * Delay discounting task: runner, UI and data export.
 * Output follows the hBayesDM `dd_*` format (choice = 1 means the later option).
 */
(function () {
  'use strict';
  const D = window.DDTDesigns;
  const $ = (id) => document.getElementById(id);
  const ITI_MS = 500;
  const FEEDBACK_MS = 250;

  const state = {
    cfg: null, rng: null, seed: null,
    queue: [], adj: null, data: [], trialIndex: 0,
    current: null, onsetT: 0, waiting: false, phase: 'main'
  };

  // ---------- helpers ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  function fmtMoney(x) {
    return Number(x).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }

  // Kirby items keep exact day counts (as in the original MCQ); other modes
  // use familiar calendar wording.
  function fmtDelay(days, exactDays) {
    if (days === 0) return 'วันนี้';
    if (exactDays) return 'ในอีก ' + days + ' วัน';
    const named = { 1: '1 วัน', 7: '1 สัปดาห์', 14: '2 สัปดาห์', 30: '1 เดือน',
      90: '3 เดือน', 180: '6 เดือน', 365: '1 ปี', 1825: '5 ปี' };
    return 'ในอีก ' + (named[days] || days + ' วัน');
  }

  function readConfig() {
    const p = new URLSearchParams(location.search);
    if (p.has('id')) $('in-id').value = p.get('id');
    if (p.has('mode')) $('in-mode').value = p.get('mode');
    if (p.has('scale')) $('in-scale').value = p.get('scale');
    if (p.has('currency')) $('in-currency').value = p.get('currency');
    if (p.get('practice') === '0') $('in-practice').checked = false;
    if (p.get('catch') === '0') $('in-catch').checked = false;
    return { autostart: p.get('autostart') === '1', seed: p.get('seed') };
  }

  // ---------- design building ----------
  function buildQueue(cfg) {
    const rng = state.rng;
    let main = [];
    if (cfg.mode === 'kirby') main = D.kirbyTrials(cfg.scale);
    else if (cfg.mode === 'grid') main = D.gridTrials(cfg.scale, rng);
    if (cfg.catchTrials && cfg.mode !== 'adjusting') {
      main = D.insertCatch(main, D.catchTrials(cfg.scale), rng);
    }
    return main;
  }

  function initAdjusting(cfg) {
    const delays = D.shuffle(D.ADJ.delays, state.rng);
    const ll = D.roundMoney(D.ADJ.laterBase * cfg.scale);
    // Spread catch trials between delay blocks.
    const catches = cfg.catchTrials ? D.catchTrials(cfg.scale) : [];
    const catchAfter = {};
    catches.forEach((c, i) => {
      const b = Math.floor(((i + 1) * delays.length) / (catches.length + 1));
      catchAfter[b] = (catchAfter[b] || []).concat([c]);
    });
    return {
      delays, ll, blockIdx: 0, step: 0, ss: ll / 2, delta: ll / 4,
      catchAfter, pendingCatch: [], indiff: {}
    };
  }

  function nextAdjustingTrial() {
    const a = state.adj;
    if (a.pendingCatch.length) return a.pendingCatch.shift();
    if (a.blockIdx >= a.delays.length) return null;
    const d = a.delays[a.blockIdx];
    const ss = Math.max(1, D.roundMoney(a.ss));
    return {
      item: a.blockIdx * D.ADJ.nSteps + a.step + 1, block: 'delay_' + d,
      amount_sooner: ss, delay_sooner: 0, amount_later: a.ll, delay_later: d,
      k_indiff: D.impliedK(ss, a.ll, d), adj_step: a.step + 1
    };
  }

  function updateAdjusting(trial, choice) {
    if (trial.is_catch) return;
    const a = state.adj;
    a.ss += choice === 1 ? a.delta : -a.delta;
    a.ss = Math.min(Math.max(a.ss, 0), a.ll);
    a.delta /= 2;
    a.step += 1;
    if (a.step >= D.ADJ.nSteps) {
      const d = a.delays[a.blockIdx];
      // Indifference point = immediate amount after the final adjustment.
      a.indiff[d] = a.ss;
      if (a.catchAfter[a.blockIdx + 1]) a.pendingCatch.push(...a.catchAfter[a.blockIdx + 1]);
      a.blockIdx += 1; a.step = 0; a.ss = a.ll / 2; a.delta = a.ll / 4;
    }
  }

  // ---------- trial flow ----------
  function getNextTrial() {
    if (state.phase === 'practice') return state.practice.shift() || null;
    if (state.cfg.mode === 'adjusting') return nextAdjustingTrial();
    return state.queue.shift() || null;
  }

  function runNext() {
    const t = getNextTrial();
    if (!t) {
      if (state.phase === 'practice') {
        state.phase = 'main';
        $('msg-text').innerHTML = '<h2>จบข้อฝึกหัด</h2><p>ต่อไปเป็นข้อจริง ' +
          'ไม่มีคำตอบถูกหรือผิด เลือกตามที่คุณต้องการจริง ๆ</p>';
        show('screen-msg');
        return;
      }
      finish();
      return;
    }
    state.current = t;
    t.later_on_left = state.rng() < 0.5 ? 1 : 0;
    const exact = state.cfg.mode === 'kirby' && !t.is_catch && !t.is_practice;
    const html = (amt, d) => '<span class="amt">' + fmtMoney(amt) + ' ' +
      state.cfg.currency + '</span><span class="when">' + fmtDelay(d, exact) + '</span>';
    const sooner = html(t.amount_sooner, t.delay_sooner);
    const later = html(t.amount_later, t.delay_later);
    $('opt-left').innerHTML = t.later_on_left ? later : sooner;
    $('opt-right').innerHTML = t.later_on_left ? sooner : later;
    ['opt-left', 'opt-right'].forEach((id) => {
      $(id).classList.remove('chosen'); $(id).disabled = false;
    });
    $('trial-progress').textContent = state.phase === 'practice' ? 'ข้อฝึกหัด' : progressText();
    show('screen-trial');
    state.onsetT = performance.now();
    state.waiting = true;
  }

  function progressText() {
    const done = state.data.filter((r) => r.phase === 'main').length;
    let total;
    if (state.cfg.mode === 'adjusting') {
      total = D.ADJ.delays.length * D.ADJ.nSteps + (state.cfg.catchTrials ? D.catchTrials(1).length : 0);
    } else {
      total = done + state.queue.length + 1;
    }
    return 'ข้อที่ ' + (done + 1) + ' / ' + total;
  }

  function respond(side) {
    if (!state.waiting) return;
    state.waiting = false;
    const rt = performance.now() - state.onsetT;
    const t = state.current;
    const choseLeft = side === 'left';
    const choice = (choseLeft === (t.later_on_left === 1)) ? 1 : 0;
    $(choseLeft ? 'opt-left' : 'opt-right').classList.add('chosen');
    $('opt-left').disabled = true; $('opt-right').disabled = true;

    state.trialIndex += 1;
    state.data.push({
      subjID: state.cfg.id, mode: state.cfg.mode, phase: state.phase,
      trial: state.trialIndex, item: t.item, block: t.block,
      delay_later: t.delay_later, amount_later: t.amount_later,
      delay_sooner: t.delay_sooner, amount_sooner: t.amount_sooner,
      choice: choice, rt_ms: Math.round(rt), later_on_left: t.later_on_left,
      is_catch: t.is_catch ? 1 : 0,
      k_indiff: t.k_indiff == null ? '' : +t.k_indiff.toPrecision(4),
      adj_step: t.adj_step || '', scale: state.cfg.scale, currency: state.cfg.currency,
      seed: state.seed, timestamp: new Date().toISOString()
    });
    if (state.phase === 'main' && state.cfg.mode === 'adjusting') updateAdjusting(t, choice);
    backup();

    setTimeout(() => {
      show('screen-iti');
      setTimeout(runNext, ITI_MS);
    }, FEEDBACK_MS);
  }

  // ---------- summary & export ----------
  function summarize() {
    const main = state.data.filter((r) => r.phase === 'main');
    const real = main.filter((r) => !r.is_catch);
    const catches = main.filter((r) => r.is_catch);
    const lines = [
      'subjID: ' + state.cfg.id, 'mode: ' + state.cfg.mode, 'seed: ' + state.seed,
      'trials: ' + real.length + ' (+' + catches.length + ' catch)',
      'proportion later: ' + (real.reduce((s, r) => s + r.choice, 0) / Math.max(1, real.length)).toFixed(3),
      'catch failures: ' + catches.filter((r) => r.choice === 1).length + ' / ' + catches.length,
      'median RT (ms): ' + median(real.map((r) => r.rt_ms))
    ];
    if (state.cfg.mode === 'adjusting') {
      const a = state.adj;
      lines.push('indifference points (fraction of later amount):');
      Object.keys(a.indiff).map(Number).sort((x, y) => x - y).forEach((d) => {
        lines.push('  ' + d + ' d: ' + (a.indiff[d] / a.ll).toFixed(3));
      });
    }
    lines.push('', 'Fit models with: python -m ddt.fit <file>.txt');
    return lines.join('\n');
  }

  function median(xs) {
    if (!xs.length) return 'NA';
    const s = xs.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  function toDelimited(rows, sep) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      const s = String(v);
      return (sep === ',' && /[",\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.join(sep)].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(sep))).join('\n') + '\n';
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
    return 'ddt_' + state.cfg.mode + '_' + state.cfg.id + '_' + ts;
  }

  function backup() {
    try { localStorage.setItem('ddt_backup_' + state.cfg.id, JSON.stringify(state.data)); } catch (e) { /* ignore */ }
  }

  function finish() {
    $('summary').textContent = summarize();
    show('screen-end');
    // Researchers also get an automatic download so data is not lost.
    download(toDelimited(mainRows(), '\t'), fileBase() + '.txt', 'text/tab-separated-values');
  }

  // hBayesDM file: main trials only, catch trials removed (they are kept in the .csv).
  function mainRows() { return state.data.filter((r) => r.phase === 'main' && !r.is_catch); }

  // ---------- instructions ----------
  function instructions(cfg) {
    return '<p>ในแต่ละข้อ คุณจะเห็นตัวเลือกให้รับเงิน 2 แบบ คือ ' +
      '<b>เงินจำนวนน้อยกว่าที่ได้รับวันนี้</b> หรือ <b>เงินจำนวนมากกว่าที่ได้รับในอนาคต</b></p>' +
      '<p>ให้เลือกตัวเลือกที่คุณ <b>อยากได้จริง ๆ</b> ไม่มีคำตอบถูกหรือผิด ' +
      'ให้คิดเสมือนว่าจะได้รับเงินนั้นจริง</p>' +
      '<p>แตะที่ตัวเลือก หรือกดแป้น <kbd>F</kbd> (ซ้าย) / <kbd>J</kbd> (ขวา)</p>' +
      (cfg.mode === 'adjusting' ? '<p>จำนวนเงินจะเปลี่ยนไปตามคำตอบของคุณ</p>' : '');
  }

  // ---------- start ----------
  function start() {
    const cfg = {
      id: ($('in-id').value || '').trim() || 'anon',
      mode: $('in-mode').value,
      scale: parseFloat($('in-scale').value) || 1,
      currency: ($('in-currency').value || '').trim(),
      practice: $('in-practice').checked,
      catchTrials: $('in-catch').checked
    };
    state.cfg = cfg;
    state.seed = state.urlSeed ? parseInt(state.urlSeed, 10) : Math.floor(Math.random() * 2 ** 31);
    state.rng = D.mulberry32(state.seed);
    state.queue = buildQueue(cfg);
    if (cfg.mode === 'adjusting') state.adj = initAdjusting(cfg);
    state.practice = cfg.practice ? D.practiceTrials(cfg.scale) : [];
    state.phase = cfg.practice ? 'practice' : 'main';
    $('instr-text').innerHTML = instructions(cfg);
    show('screen-instr');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const url = readConfig();
    state.urlSeed = url.seed;
    $('btn-start').addEventListener('click', start);
    $('btn-instr').addEventListener('click', runNext);
    $('btn-msg').addEventListener('click', runNext);
    $('opt-left').addEventListener('click', () => respond('left'));
    $('opt-right').addEventListener('click', () => respond('right'));
    $('btn-dl-tsv').addEventListener('click', () =>
      download(toDelimited(mainRows(), '\t'), fileBase() + '.txt', 'text/tab-separated-values'));
    $('btn-dl-csv').addEventListener('click', () =>
      download(toDelimited(state.data, ','), fileBase() + '.csv', 'text/csv'));
    document.addEventListener('keydown', (e) => {
      if ($('screen-trial').classList.contains('hidden')) return;
      const k = e.key.toLowerCase();
      if (k === 'f' || e.key === 'ArrowLeft') respond('left');
      if (k === 'j' || e.key === 'ArrowRight') respond('right');
    });
    if (url.autostart) start();
  });
})();
