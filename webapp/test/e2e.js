// End-to-end test: real Code.gs (mocked Google services) + built Index.html in Chromium.
// Run: node webapp/build.js && node webapp/test/e2e.js [screenshotDir]
const { chromium, devices } = require('playwright');
const path = require('path');
const assert = require('assert');
const { createGas } = require('./gas_mock');

const shotDir = process.argv[2] || path.join(__dirname, 'shots');
require('fs').mkdirSync(shotDir, { recursive: true });

async function runTask(p, k) {
  // Simulated hyperbolic participant with discount rate k.
  while (true) {
    await p.waitForSelector('#screen-trial:not(.hidden), #screen-msg:not(.hidden), #screen-end:not(.hidden)');
    if (await p.isVisible('#screen-end')) return;
    if (await p.isVisible('#screen-msg')) { await p.click('#btn-msg'); continue; }
    const side = await p.evaluate((k) => {
      const val = (el) => {
        const a = parseFloat(el.querySelector('.amt').textContent.replace(/,/g, ''));
        const m = el.querySelector('.when').textContent.match(/(\d+)\s*(วัน|สัปดาห์|เดือน|ปี)/);
        const d = m ? +m[1] * { 'วัน': 1, 'สัปดาห์': 7, 'เดือน': 30, 'ปี': 365 }[m[2]] : 0;
        return a / (1 + k * d);
      };
      return val(document.getElementById('opt-left')) >= val(document.getElementById('opt-right')) ? 'left' : 'right';
    }, k);
    await p.click('#opt-' + side);
    await p.waitForSelector('#screen-trial', { state: 'hidden' }).catch(() => {});
  }
}

(async () => {
  const gas = createGas();
  let failSave = false;
  const browser = await chromium.launch();

  async function newPage(device) {
    const ctx = await browser.newContext({ ...devices[device] });
    await ctx.exposeFunction('__gas', (fn, args) => {
      if (fn === 'saveSession' && failSave) throw new Error('Network error (mock)');
      return JSON.parse(JSON.stringify(gas.ctx[fn](...args)));
    });
    await ctx.addInitScript(() => {
      const make = (ok, fail) => new Proxy({}, {
        get: (_, name) => {
          if (name === 'withSuccessHandler') return (f) => make(f, fail);
          if (name === 'withFailureHandler') return (f) => make(ok, f);
          return (...args) => window.__gas(name, args).then((r) => ok && ok(r), (e) => fail && fail(e));
        }
      });
      window.google = { script: { get run() { return make(null, null); } } };
    });
    const p = await ctx.newPage();
    const errors = [], dialogs = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => { dialogs.push(d.message()); d[p.__dialogAnswer === false ? 'dismiss' : 'accept'](); });
    await p.goto('file://' + path.join(__dirname, '..', 'dist', 'Index.html'));
    await p.waitForFunction(() => document.querySelectorAll('#in-group option').length > 0);
    return { p, errors, dialogs, ctx };
  }

  // 1) iPad: grid session saves to the sheet with a sensible k
  const ipad = await newPage('iPad (gen 7) landscape');
  let { p } = ipad;
  await p.screenshot({ path: path.join(shotDir, 'ipad_start.png') });
  await p.fill('#in-id', '001');
  await p.selectOption('#in-group', 'patient');
  await p.click('#btn-start');
  await p.click('#btn-instr');
  await p.waitForSelector('#screen-trial:not(.hidden)');
  await p.screenshot({ path: path.join(shotDir, 'ipad_trial.png') });
  await runTask(p, 0.02);
  await p.waitForSelector('#save-status.ok');
  await p.click('#btn-show-result');
  await p.screenshot({ path: path.join(shotDir, 'ipad_end.png') });
  let sess = gas.ctx.listSessions();
  assert.strictEqual(sess.length, 1);
  assert.ok(Math.abs(Math.log(sess[0].k_hyp) - Math.log(0.02)) < 0.3, 'k ≈ 0.02, got ' + sess[0].k_hyp);
  assert.strictEqual(gas.sheets.trials.getLastRow() - 1, 59, '56 grid + 3 catch trials stored');
  console.log('1 ok: grid saved, k =', sess[0].k_hyp.toFixed(4));

  // 2) duplicate warning (dismiss = do not start)
  await p.click('#btn-home');
  await p.fill('#in-id', '001');
  p.__dialogAnswer = false;
  await p.click('#btn-start');
  await p.waitForTimeout(300);
  assert.ok(ipad.dialogs.some((m) => m.includes('เคยทำ')), 'duplicate warning shown');
  assert.ok(await p.isVisible('#tab-start'), 'stayed on start tab');
  p.__dialogAnswer = true;
  console.log('2 ok: duplicate warning');

  // 3) iPhone: save fails -> queued locally -> retry succeeds
  const phone = await newPage('iPhone 13');
  p = phone.p;
  failSave = true;
  await p.fill('#in-id', '002');
  await p.selectOption('#in-mode', 'kirby');
  await p.click('#btn-start');
  await p.click('#btn-instr');
  await runTask(p, 0.005);
  await p.waitForSelector('#save-status.fail');
  await p.click('#btn-home');
  assert.ok(await p.isVisible('#pending-banner'), 'pending banner visible');
  await p.screenshot({ path: path.join(shotDir, 'phone_pending.png') });
  failSave = false;
  await p.click('#btn-retry');
  await p.waitForSelector('#pending-banner', { state: 'hidden' });
  assert.strictEqual(gas.ctx.listSessions().length, 2);
  console.log('3 ok: offline queue + retry');

  // 4) data tab, edit, summary, export, delete
  await p.click('#tabbar button[data-tab="tab-data"]');
  await p.waitForSelector('.card');
  await p.screenshot({ path: path.join(shotDir, 'phone_data.png'), fullPage: true });
  await p.click('button[data-edit]'); // newest first = 002
  await p.check('#ed-exclude');
  await p.fill('#ed-note', 'ทดสอบ');
  await p.click('#ed-save');
  await p.waitForSelector('.card.excluded');
  await p.click('#tabbar button[data-tab="tab-summary"]');
  await p.waitForSelector('#summary-body table');
  await p.click('#btn-export');
  await p.waitForSelector('#export-result a');
  await p.screenshot({ path: path.join(shotDir, 'phone_summary.png'), fullPage: true });
  assert.strictEqual(gas.files.length, 2);
  await p.click('#tabbar button[data-tab="tab-data"]');
  await p.waitForSelector('.card.excluded');
  await p.click('.card.excluded button[data-del]');
  await p.waitForFunction(() => document.querySelectorAll('.card').length === 1);
  assert.strictEqual(gas.ctx.listSessions().length, 1);
  console.log('4 ok: edit, summary, export, delete');

  const errs = [...ipad.errors, ...phone.errors];
  assert.deepStrictEqual(errs, [], 'no page errors');
  await browser.close();
  console.log('e2e passed; screenshots in', shotDir);
})().catch((e) => { console.error(e); process.exit(1); });
