/*
 * Task logic with no DOM: builds the trial sequence, runs the adjusting-amount
 * staircase and records rows. Used by the standalone page (task/ddt.js) and by
 * the Apps Script web app (webapp/).
 * Output rows follow the hBayesDM dd format (choice = 1 means the later option).
 */
(function (global) {
  'use strict';
  const D = global.DDTDesigns || (typeof require !== 'undefined' ? require('./designs.js') : null);

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

  function median(xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  /**
   * cfg: {id, mode: 'kirby'|'grid'|'adjusting', scale, currency, practice,
   *       catchTrials, seed, extra: {...columns copied into every row}}
   */
  function createSession(cfg) {
    const seed = cfg.seed != null && cfg.seed !== '' ? (parseInt(cfg.seed, 10) >>> 0)
      : Math.floor(Math.random() * 2 ** 31);
    const rng = D.mulberry32(seed);
    const s = {
      cfg, seed, rng, rows: [], phase: cfg.practice ? 'practice' : 'main',
      practice: cfg.practice ? D.practiceTrials(cfg.scale) : [],
      queue: [], adj: null, trialIndex: 0, startedAt: new Date().toISOString()
    };

    if (cfg.mode === 'adjusting') {
      const delays = D.shuffle(D.ADJ.delays, rng);
      const ll = D.roundMoney(D.ADJ.laterBase * cfg.scale);
      const catches = cfg.catchTrials ? D.catchTrials(cfg.scale) : [];
      const catchAfter = {};
      catches.forEach((c, i) => {
        const b = Math.floor(((i + 1) * delays.length) / (catches.length + 1));
        catchAfter[b] = (catchAfter[b] || []).concat([c]);
      });
      s.adj = { delays, ll, blockIdx: 0, step: 0, ss: ll / 2, delta: ll / 4,
        catchAfter, pendingCatch: [], indiff: {}, nCatch: catches.length };
    } else {
      let main = cfg.mode === 'kirby' ? D.kirbyTrials(cfg.scale) : D.gridTrials(cfg.scale, rng);
      if (cfg.catchTrials) main = D.insertCatch(main, D.catchTrials(cfg.scale), rng);
      s.queue = main;
    }

    function nextAdjusting() {
      const a = s.adj;
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

    function updateAdjusting(t, choice) {
      if (t.is_catch) return;
      const a = s.adj;
      a.ss = Math.min(Math.max(a.ss + (choice === 1 ? a.delta : -a.delta), 0), a.ll);
      a.delta /= 2;
      a.step += 1;
      if (a.step >= D.ADJ.nSteps) {
        // Indifference point = immediate amount after the final adjustment.
        a.indiff[a.delays[a.blockIdx]] = a.ss;
        const after = a.catchAfter[a.blockIdx + 1];
        if (after) a.pendingCatch.push(...after);
        a.blockIdx += 1; a.step = 0; a.ss = a.ll / 2; a.delta = a.ll / 4;
      }
    }

    /** Next trial of the current phase, or null when the phase is over. */
    s.next = function () {
      let t;
      if (s.phase === 'practice') t = s.practice.shift() || null;
      else if (cfg.mode === 'adjusting') t = nextAdjusting();
      else t = s.queue.shift() || null;
      if (t) t.later_on_left = rng() < 0.5 ? 1 : 0;
      return t;
    };

    s.startMain = function () { s.phase = 'main'; };

    s.record = function (t, choice, rtMs) {
      s.trialIndex += 1;
      const row = Object.assign({}, cfg.extra || {}, {
        subjID: cfg.id, mode: cfg.mode, phase: s.phase,
        trial: s.trialIndex, item: t.item, block: t.block,
        delay_later: t.delay_later, amount_later: t.amount_later,
        delay_sooner: t.delay_sooner, amount_sooner: t.amount_sooner,
        choice: choice, rt_ms: Math.round(rtMs), later_on_left: t.later_on_left,
        is_catch: t.is_catch ? 1 : 0,
        k_indiff: t.k_indiff == null ? '' : +t.k_indiff.toPrecision(4),
        adj_step: t.adj_step || '', scale: cfg.scale, currency: cfg.currency,
        seed: seed, timestamp: new Date().toISOString()
      });
      s.rows.push(row);
      if (s.phase === 'main' && cfg.mode === 'adjusting') updateAdjusting(t, choice);
      return row;
    };

    s.progress = function () {
      const done = s.rows.filter((r) => r.phase === 'main').length;
      const total = cfg.mode === 'adjusting'
        ? s.adj.delays.length * D.ADJ.nSteps + s.adj.nCatch
        : done + s.queue.length;
      return { done, total };
    };

    s.mainRows = () => s.rows.filter((r) => r.phase === 'main');
    /** Rows for model fitting: main phase, no catch trials. */
    s.fitRows = () => s.rows.filter((r) => r.phase === 'main' && !r.is_catch);

    s.basicSummary = function () {
      const main = s.mainRows();
      const real = main.filter((r) => !r.is_catch);
      const catches = main.filter((r) => r.is_catch);
      return {
        n_trials: real.length,
        n_catch: catches.length,
        catch_fail: catches.filter((r) => r.choice === 1).length,
        prop_later: real.length ? real.reduce((a, r) => a + r.choice, 0) / real.length : null,
        median_rt: median(real.map((r) => r.rt_ms))
      };
    };

    return s;
  }

  function toDelimited(rows, sep) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      const str = v == null ? '' : String(v);
      return (sep === ',' && /[",\n]/.test(str)) ? '"' + str.replace(/"/g, '""') + '"' : str;
    };
    return [cols.join(sep)].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(sep))).join('\n') + '\n';
  }

  global.DDTCore = { createSession, fmtMoney, fmtDelay, median, toDelimited };
  if (typeof module !== 'undefined') module.exports = global.DDTCore;
})(typeof window !== 'undefined' ? window : globalThis);
