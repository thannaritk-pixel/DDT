// Unit tests for Code.gs against the mocks. Run: node webapp/test/server.test.js
const assert = require('assert');
const { createGas } = require('./gas_mock');

const { ctx, sheets, files } = createGas();
const cfg = ctx.getConfig();
assert.strictEqual(JSON.stringify(cfg.groups), JSON.stringify(['control', 'patient']));
assert.strictEqual(JSON.stringify(cfg.labels), JSON.stringify(['baseline', 'follow-up', 'retest']));

const trial = (i, c) => ({ phase: 'main', trial: i, item: i, block: 'grid', delay_later: 30, amount_later: 600,
  delay_sooner: 0, amount_sooner: 300, choice: c, rt_ms: 900, later_on_left: 1, is_catch: 0, k_indiff: 0.033 });
const payload = { session: { session_id: 'Sabc123', subjID: '001', group: 'patient', session_label: 'baseline',
  mode: 'grid', k_hyp: 0.02, log_k_hyp: Math.log(0.02), n_trials: 3 }, trials: [trial(1, 1), trial(2, 0), trial(3, 1)] };

let r = ctx.saveSession(payload);
assert.strictEqual(r.duplicate, false);
r = ctx.saveSession(payload); // retry after network error must not duplicate
assert.strictEqual(r.duplicate, true);
assert.strictEqual(sheets.trials.getLastRow(), 4);
assert.strictEqual(sheets.sessions.getLastRow(), 2);

assert.strictEqual(ctx.checkDuplicate('001', 'grid', 'baseline').length, 1);
assert.strictEqual(ctx.checkDuplicate('001', 'kirby', 'baseline').length, 0);

assert.throws(() => ctx.saveSession({ ...payload, session: { ...payload.session, session_id: 'Sxyz999', group: 'hacker' } }), /กลุ่ม/);
assert.throws(() => ctx.saveSession({ ...payload, session: { ...payload.session, session_id: 'Sxyz999' }, trials: [trial(1, 2)] }), /choice/);
assert.throws(() => ctx.saveSession({ ...payload, session: { ...payload.session, session_id: 'bad id!' } }), /session_id/);

let s = ctx.listSessions()[0];
const u = ctx.updateSession(s.session_id, { group: 'control', exclude: true, note: 'ง่วง' }, s.updatedAt);
assert.throws(() => ctx.updateSession(s.session_id, { note: 'x' }, s.updatedAt), /แก้ไขโดยผู้อื่น/);
s = ctx.listSessions()[0];
assert.strictEqual(s.group, 'control'); assert.strictEqual(s.exclude, 1);
assert.ok(sheets.trials.data.slice(1).every((row) => row[2] === 'control'), 'trial group updated');

// second session then export and delete
ctx.saveSession({ ...payload, session: { ...payload.session, session_id: 'Sdef456', subjID: '002' } });
const ex = ctx.exportCsv();
assert.ok(ex.trialsUrl.includes('ddt_trials_'));
const csv = files.find((f) => f.name.startsWith('ddt_trials_')).content.trim().split('\n');
assert.strictEqual(csv.length, 7);
assert.ok(csv[0].endsWith(',exclude'));
assert.ok(csv[1].endsWith(',1') && csv[6].endsWith(',0'));

const d = ctx.deleteSession('Sabc123', u.updatedAt);
assert.strictEqual(d.removedTrials, 3);
assert.strictEqual(sheets.trials.getLastRow(), 4);
assert.strictEqual(ctx.listSessions().length, 1);
console.log('server tests passed');
