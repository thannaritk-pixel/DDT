/*
 * In-browser model fitting so researchers see results right after a session.
 * Same models and parameterisation as analysis/ddt (Python):
 *   V = A * f(D),  P(later) = 1 / (1 + exp(-beta * (V_LL - V_SS)))
 * Parameters are fitted by maximum likelihood (Nelder-Mead on log k, log beta,
 * several starting points). Amounts are used in raw currency units, as in
 * hBayesDM, so beta depends on the currency scale.
 * Python remains the reference for papers (more models, AIC/BIC weights).
 */
(function (global) {
  'use strict';

  const BOUNDS = { logk: [Math.log(1e-6), Math.log(20)], logb: [Math.log(1e-4), Math.log(50)] };
  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

  const DISCOUNT = {
    hyperbolic: (D, k) => 1 / (1 + k * D), // Mazur (1987)
    exponential: (D, k) => Math.exp(-k * D) // Samuelson (1937)
  };

  function negLogLik(model, logk, logb, rows) {
    const f = DISCOUNT[model];
    const k = Math.exp(clamp(logk, ...BOUNDS.logk));
    const b = Math.exp(clamp(logb, ...BOUNDS.logb));
    let nll = 0;
    for (const r of rows) {
      const vss = r.amount_sooner * f(r.delay_sooner, k);
      const vll = r.amount_later * f(r.delay_later, k);
      const z = clamp(b * (vll - vss), -50, 50);
      let p = 1 / (1 + Math.exp(-z));
      p = clamp(p, 1e-10, 1 - 1e-10);
      nll -= r.choice ? Math.log(p) : Math.log(1 - p);
    }
    return nll;
  }

  // Minimal Nelder-Mead for 2 parameters.
  function nelderMead(fn, x0, step = 1, iters = 400) {
    let s = [x0, [x0[0] + step, x0[1]], [x0[0], x0[1] + step]].map((x) => ({ x, f: fn(x) }));
    for (let i = 0; i < iters; i++) {
      s.sort((a, b) => a.f - b.f);
      if (Math.abs(s[2].f - s[0].f) < 1e-9) break;
      const c = [(s[0].x[0] + s[1].x[0]) / 2, (s[0].x[1] + s[1].x[1]) / 2];
      const pt = (t) => [c[0] + t * (s[2].x[0] - c[0]), c[1] + t * (s[2].x[1] - c[1])];
      const r = { x: pt(-1) }; r.f = fn(r.x);
      if (r.f < s[0].f) {
        const e = { x: pt(-2) }; e.f = fn(e.x);
        s[2] = e.f < r.f ? e : r;
      } else if (r.f < s[1].f) {
        s[2] = r;
      } else {
        const k = { x: pt(r.f < s[2].f ? -0.5 : 0.5) }; k.f = fn(k.x);
        if (k.f < Math.min(r.f, s[2].f)) s[2] = k;
        else {
          s = s.map((v, j) => j === 0 ? v : (() => {
            const x = [(v.x[0] + s[0].x[0]) / 2, (v.x[1] + s[0].x[1]) / 2];
            return { x, f: fn(x) };
          })());
        }
      }
    }
    s.sort((a, b) => a.f - b.f);
    return s[0];
  }

  /** Fit one model. rows: [{amount_sooner, delay_sooner, amount_later, delay_later, choice}] */
  function fitModel(model, rows) {
    const fn = (x) => negLogLik(model, x[0], x[1], rows);
    let best = null;
    for (const k0 of [1e-4, 1e-2, 0.1, 1]) {
      for (const b0 of [0.01, 0.1, 1]) {
        const r = nelderMead(fn, [Math.log(k0), Math.log(b0)]);
        if (!best || r.f < best.f) best = r;
      }
    }
    const logk = clamp(best.x[0], ...BOUNDS.logk);
    const logb = clamp(best.x[1], ...BOUNDS.logb);
    const n = rows.length;
    return {
      model, k: Math.exp(logk), log_k: logk, beta: Math.exp(logb), nll: best.f,
      bic: 2 * best.f + 2 * Math.log(n), aic: 2 * best.f + 4,
      pseudo_r2: 1 - best.f / (n * Math.log(2)),
      at_bound: logk <= BOUNDS.logk[0] + 1e-3 || logk >= BOUNDS.logk[1] - 1e-3
    };
  }

  /** Kirby, Petry & Bickel (1999) consistency method. */
  function kirbyK(rows) {
    const ks = [...new Set(rows.map((r) => +r.k_indiff))].sort((a, b) => a - b);
    if (!ks.length) return null;
    const cands = [ks[0] / 2];
    for (let i = 1; i < ks.length; i++) cands.push(Math.sqrt(ks[i - 1] * ks[i]));
    cands.push(ks[ks.length - 1] * 2);
    const cons = cands.map((kc) => rows.filter((r) => ((+r.k_indiff > kc) ? 1 : 0) === r.choice).length / rows.length);
    const max = Math.max(...cons);
    const tied = cands.filter((_, i) => Math.abs(cons[i] - max) < 1e-12);
    const k = Math.exp(tied.reduce((a, v) => a + Math.log(v), 0) / tied.length);
    return { k, consistency: max };
  }

  /** Indifference points from the adjusting-amount staircase (Du et al., 2002). */
  function indifferencePoints(rows, nSteps = 6) {
    const by = {};
    rows.forEach((r) => { (by[r.delay_later] = by[r.delay_later] || []).push(r); });
    return Object.keys(by).map(Number).sort((a, b) => a - b).map((d) => {
      const ll = +by[d][0].amount_later;
      let ss = ll / 2, step = ll / 4;
      by[d].slice(0, nSteps).forEach((r) => {
        ss = clamp(ss + (r.choice === 1 ? step : -step), 0, ll);
        step /= 2;
      });
      return { delay: d, indiff_prop: ss / ll };
    });
  }

  /** Myerson, Green & Warusawitharana (2001) normalised AUC. */
  function auc(ips) {
    const pts = [{ delay: 0, indiff_prop: 1 }].concat(ips);
    const maxD = pts[pts.length - 1].delay;
    let a = 0;
    for (let i = 1; i < pts.length; i++) {
      a += (pts[i].delay - pts[i - 1].delay) / maxD * (pts[i].indiff_prop + pts[i - 1].indiff_prop) / 2;
    }
    return a;
  }

  /** Johnson & Bickel (2008) nonsystematic-data criteria. */
  function johnsonBickel(ips) {
    const v = ips.map((p) => p.indiff_prop);
    let c1 = false;
    for (let i = 1; i < v.length; i++) if (v[i] - v[i - 1] > 0.2) c1 = true;
    const c2 = v.length > 1 && (v[0] - v[v.length - 1]) < 0.1;
    return { c1, c2, nonsystematic: c1 || c2 };
  }

  /** Everything the app stores per session. rows = main-phase, non-catch trials. */
  function summarize(rows, mode) {
    const out = {};
    if (rows.length >= 5) {
      const h = fitModel('hyperbolic', rows);
      const e = fitModel('exponential', rows);
      Object.assign(out, {
        k_hyp: h.k, log_k_hyp: h.log_k, beta_hyp: h.beta, nll_hyp: h.nll, bic_hyp: h.bic,
        pseudo_r2_hyp: h.pseudo_r2, k_at_bound: h.at_bound ? 1 : 0,
        k_exp: e.k, beta_exp: e.beta, nll_exp: e.nll, bic_exp: e.bic,
        best_model: h.bic <= e.bic ? 'hyperbolic' : 'exponential'
      });
    }
    if (mode === 'kirby') {
      const kk = kirbyK(rows);
      if (kk) { out.kirby_k = kk.k; out.kirby_consistency = kk.consistency; }
    }
    if (mode === 'adjusting') {
      const ips = indifferencePoints(rows);
      out.auc = auc(ips);
      out.jb_nonsystematic = johnsonBickel(ips).nonsystematic ? 1 : 0;
      out.indiff_points = ips.map((p) => p.delay + ':' + p.indiff_prop.toFixed(3)).join(' ');
    }
    return out;
  }

  global.DDTFit = { negLogLik, fitModel, kirbyK, indifferencePoints, auc, johnsonBickel, summarize };
  if (typeof module !== 'undefined') module.exports = global.DDTFit;
})(typeof window !== 'undefined' ? window : globalThis);
