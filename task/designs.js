/*
 * Trial designs for the delay discounting task.
 * Amounts are in "base units" and multiplied by the `scale` setting at run time.
 * Delays are in days. The sooner option is always "today" (delay 0).
 */
(function (global) {
  'use strict';

  // Kirby, Petry & Bickel (1999) Monetary Choice Questionnaire, 27 items, in the
  // original presentation order. [SIR, LDR, delay_days]
  // Magnitude: S = small (LDR 25-35), M = medium (50-60), L = large (75-85).
  // Each magnitude has one item at each of 9 k levels:
  // .00016 .0004 .001 .0025 .006 .016 .041 .10 .25
  const KIRBY_27 = [
    [54, 55, 117, 'M'], [55, 75, 61, 'L'], [19, 25, 53, 'S'], [31, 85, 7, 'L'],
    [14, 25, 19, 'S'], [47, 50, 160, 'M'], [15, 35, 13, 'S'], [25, 60, 14, 'M'],
    [78, 80, 192, 'L'], [40, 55, 62, 'M'], [11, 30, 7, 'S'], [67, 75, 119, 'L'],
    [34, 35, 186, 'S'], [27, 50, 21, 'M'], [69, 85, 91, 'L'], [49, 60, 89, 'M'],
    [80, 85, 157, 'L'], [24, 35, 29, 'S'], [33, 80, 14, 'L'], [28, 30, 179, 'S'],
    [34, 50, 30, 'M'], [25, 30, 80, 'S'], [41, 75, 20, 'L'], [54, 60, 111, 'M'],
    [54, 80, 30, 'L'], [22, 25, 136, 'S'], [20, 55, 7, 'M']
  ];

  // Small seeded RNG so trial orders can be reproduced from the saved seed.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Round displayed money to a "natural" step so amounts look plausible.
  function roundMoney(x) {
    if (x >= 1000) return Math.round(x / 10) * 10;
    if (x >= 100) return Math.round(x / 5) * 5;
    return Math.round(x);
  }

  function impliedK(ss, ll, delay) {
    return delay > 0 ? (ll / ss - 1) / delay : null;
  }

  function kirbyTrials(scale) {
    return KIRBY_27.map(([sir, ldr, d, mag], i) => {
      const ss = roundMoney(sir * scale), ll = roundMoney(ldr * scale);
      return {
        item: i + 1, block: mag, amount_sooner: ss, delay_sooner: 0,
        amount_later: ll, delay_later: d, k_indiff: impliedK(ss, ll, d)
      };
    });
  }

  // Model-based grid: 7 delays x 8 sooner/later ratios = 56 trials. Because the
  // implied indifference k = (LL/SS - 1)/D varies with both ratio and delay,
  // the grid covers k from about 1e-4 to 6, so choices stay informative for
  // both shallow and steep discounters (Kirby & Marakovic, 1996; Ahn et al., 2017).
  const GRID_DELAYS = [1, 7, 14, 30, 90, 180, 365];
  const GRID_RATIOS = [0.15, 0.3, 0.45, 0.6, 0.7, 0.8, 0.9, 0.96];
  const GRID_LL = [40, 60, 85];

  function gridTrials(scale, rng) {
    const out = [];
    let n = 0;
    GRID_DELAYS.forEach((d) => {
      GRID_RATIOS.forEach((r) => {
        const llBase = GRID_LL[Math.floor(rng() * GRID_LL.length)];
        const ll = roundMoney(llBase * scale);
        const ss = Math.min(ll - 1, Math.max(1, roundMoney(ll * r)));
        out.push({
          item: ++n, block: 'grid', amount_sooner: ss, delay_sooner: 0,
          amount_later: ll, delay_later: d, k_indiff: impliedK(ss, ll, d)
        });
      });
    });
    return shuffle(out, rng);
  }

  // Adjusting-amount procedure (Du, Green & Myerson, 2002). For each delay,
  // the later amount is fixed and the immediate amount starts at 50% of it.
  // After each choice the immediate amount moves by half the previous step,
  // up if the later option was chosen and down if the sooner one was.
  const ADJ = {
    delays: [1, 7, 30, 90, 180, 365, 1825],
    laterBase: 100,
    nSteps: 6
  };

  // Catch trials: the sooner option is larger than the later one, so choosing
  // "later" means the participant is not attending (or misunderstood).
  const CATCH = [[80, 40, 30], [60, 25, 90], [95, 50, 7]];

  function catchTrials(scale) {
    return CATCH.map(([ss, ll, d], i) => ({
      item: 900 + i + 1, block: 'catch', is_catch: 1,
      amount_sooner: roundMoney(ss * scale), delay_sooner: 0,
      amount_later: roundMoney(ll * scale), delay_later: d, k_indiff: null
    }));
  }

  // Insert catch trials at random positions, never in the first 3 trials.
  function insertCatch(trials, catches, rng) {
    const out = trials.slice();
    catches.forEach((c) => {
      const pos = 3 + Math.floor(rng() * Math.max(1, out.length - 3));
      out.splice(pos, 0, c);
    });
    return out;
  }

  const PRACTICE = [[50, 100, 365], [90, 95, 3]];

  function practiceTrials(scale) {
    return PRACTICE.map(([ss, ll, d], i) => ({
      item: 800 + i + 1, block: 'practice', is_practice: 1,
      amount_sooner: roundMoney(ss * scale), delay_sooner: 0,
      amount_later: roundMoney(ll * scale), delay_later: d, k_indiff: impliedK(ss, ll, d)
    }));
  }

  global.DDTDesigns = {
    KIRBY_27, GRID_DELAYS, GRID_RATIOS, GRID_LL, ADJ,
    mulberry32, shuffle, roundMoney, impliedK,
    kirbyTrials, gridTrials, catchTrials, insertCatch, practiceTrials
  };
  if (typeof module !== 'undefined') module.exports = global.DDTDesigns;
})(typeof window !== 'undefined' ? window : globalThis);
