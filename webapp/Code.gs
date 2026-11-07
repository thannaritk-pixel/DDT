/**
 * Delay Discounting Task: Google Apps Script web app.
 * Data is stored in the Google Sheet this script is bound to:
 *   sessions  one row per completed session (summary + model fit)
 *   trials    one row per trial (hBayesDM dd columns + extras)
 *   ตั้งค่า     editable lists (groups, session labels) and defaults
 * Paste this file as Code.gs and the built dist/Index.html as Index.
 */

var SHEET_SESSIONS = 'sessions';
var SHEET_TRIALS = 'trials';
var SHEET_SETTINGS = 'ตั้งค่า';
var EXPORT_FOLDER = 'DDT exports';
var MODES = ['kirby', 'grid', 'adjusting'];

var SESSION_COLS = [
  'session_id', 'subjID', 'group', 'session_label', 'mode', 'scale', 'currency', 'seed',
  'n_trials', 'n_catch', 'catch_fail', 'prop_later', 'median_rt',
  'k_hyp', 'log_k_hyp', 'beta_hyp', 'nll_hyp', 'bic_hyp', 'pseudo_r2_hyp', 'k_at_bound',
  'k_exp', 'beta_exp', 'nll_exp', 'bic_exp', 'best_model',
  'kirby_k', 'kirby_consistency', 'auc', 'jb_nonsystematic', 'indiff_points',
  'exclude', 'note', 'device', 'started_at', 'finished_at', 'saved_by', 'updatedAt'
];
var TRIAL_COLS = [
  'session_id', 'subjID', 'group', 'session_label', 'mode', 'phase', 'trial', 'item', 'block',
  'delay_later', 'amount_later', 'delay_sooner', 'amount_sooner', 'choice', 'rt_ms',
  'later_on_left', 'is_catch', 'k_indiff', 'adj_step', 'scale', 'currency', 'seed', 'timestamp'
];
var TEXT_COLS = ['session_id', 'subjID', 'group', 'session_label', 'note', 'indiff_points',
  'started_at', 'finished_at', 'timestamp', 'block'];
var NUMERIC_SESSION = ['scale', 'seed', 'n_trials', 'n_catch', 'catch_fail', 'prop_later', 'median_rt',
  'k_hyp', 'log_k_hyp', 'beta_hyp', 'nll_hyp', 'bic_hyp', 'pseudo_r2_hyp', 'k_at_bound',
  'k_exp', 'beta_exp', 'nll_exp', 'bic_exp', 'kirby_k', 'kirby_consistency', 'auc', 'jb_nonsystematic'];

// ---------------------------------------------------------------- web app

function doGet() {
  ensureSheets_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Delay Discounting Task')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function ss_() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    throw new Error('ไม่มีสิทธิ์เข้าถึงฐานข้อมูล: บัญชีนี้ยังไม่ได้รับแชร์ Google Sheet');
  }
}

function ensureSheets_() {
  var ss = ss_();
  [[SHEET_SESSIONS, SESSION_COLS], [SHEET_TRIALS, TRIAL_COLS]].forEach(function (p) {
    var sh = ss.getSheetByName(p[0]);
    if (!sh) {
      sh = ss.insertSheet(p[0]);
      sh.getRange(1, 1, 1, p[1].length).setValues([p[1]]).setFontWeight('bold');
      sh.setFrozenRows(1);
      // Plain text so IDs like "001" and ISO timestamps are not converted.
      TEXT_COLS.forEach(function (c) {
        var j = p[1].indexOf(c);
        if (j >= 0) sh.getRange(1, j + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      });
    }
  });
  if (!ss.getSheetByName(SHEET_SETTINGS)) {
    var st = ss.insertSheet(SHEET_SETTINGS);
    st.getRange(1, 1, 8, 4).setValues([
      ['กลุ่ม (group)', 'ครั้งที่ (session_label)', 'ค่า (setting)', 'value'],
      ['control', 'baseline', 'default_mode', 'grid'],
      ['patient', 'follow-up', 'scale', 10],
      ['', 'retest', 'currency', 'บาท'],
      ['', '', 'practice', 'TRUE'],
      ['', '', 'catch_trials', 'TRUE'],
      ['', '', 'max_catch_fail', 1],
      ['', '', '', '']
    ]);
    st.getRange(1, 1, 1, 4).setFontWeight('bold');
    st.setFrozenRows(1);
  }
}

function readSettings_() {
  var vals = ss_().getSheetByName(SHEET_SETTINGS).getDataRange().getValues();
  var groups = [], labels = [], defaults = {};
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim()) groups.push(String(vals[i][0]).trim());
    if (String(vals[i][1]).trim()) labels.push(String(vals[i][1]).trim());
    if (String(vals[i][2]).trim()) defaults[String(vals[i][2]).trim()] = vals[i][3];
  }
  return { groups: groups, labels: labels, defaults: defaults };
}

/** Called by the client on load. */
function getConfig() {
  ensureSheets_();
  var s = readSettings_();
  s.user = Session.getActiveUser().getEmail() || '';
  s.sheetUrl = ss_().getUrl();
  return s;
}

// ---------------------------------------------------------------- helpers

function sheetObjects_(name) {
  var sh = ss_().getSheetByName(name);
  var vals = sh.getDataRange().getValues();
  var head = vals[0];
  return vals.slice(1).map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) {
      var v = r[j];
      o[h] = v instanceof Date ? v.toISOString() : v;
    });
    return o;
  });
}

function findSession_(id) {
  var list = sheetObjects_(SHEET_SESSIONS);
  for (var i = 0; i < list.length; i++) if (String(list[i].session_id) === String(id)) return list[i];
  return null;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง');
  try { return fn(); } finally { lock.releaseLock(); }
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  return isFinite(n) ? n : '';
}

// ---------------------------------------------------------------- API

/** Warn before starting if the same participant already did this mode/session. */
function checkDuplicate(subjID, mode, label) {
  return sheetObjects_(SHEET_SESSIONS).filter(function (s) {
    return String(s.subjID) === String(subjID) && s.mode === mode && s.session_label === label;
  }).map(function (s) { return { session_id: s.session_id, finished_at: s.finished_at }; });
}

/**
 * Save a finished session. Idempotent on session_id so the client can retry
 * after a network error without creating duplicates.
 */
function saveSession(payload) {
  var cfg = readSettings_();
  var s = payload.session || {};
  var trials = payload.trials || [];

  if (!s.session_id || !/^[A-Za-z0-9_-]{6,64}$/.test(String(s.session_id))) throw new Error('session_id ไม่ถูกต้อง');
  if (!String(s.subjID || '').trim()) throw new Error('ไม่มีรหัสผู้เข้าร่วม');
  if (MODES.indexOf(s.mode) < 0) throw new Error('mode ไม่ถูกต้อง: ' + s.mode);
  if (cfg.groups.indexOf(s.group) < 0) throw new Error('กลุ่มไม่อยู่ในรายการตั้งค่า: ' + s.group);
  if (cfg.labels.indexOf(s.session_label) < 0) throw new Error('ครั้งที่ไม่อยู่ในรายการตั้งค่า: ' + s.session_label);
  if (!trials.length) throw new Error('ไม่มีข้อมูล trial');
  trials.forEach(function (t, i) {
    if (t.choice !== 0 && t.choice !== 1) throw new Error('choice ต้องเป็น 0/1 (trial ' + (i + 1) + ')');
    if (!(Number(t.amount_later) > 0) || !(Number(t.amount_sooner) > 0)) throw new Error('จำนวนเงินไม่ถูกต้อง (trial ' + (i + 1) + ')');
  });

  return withLock_(function () {
    if (findSession_(s.session_id)) return { ok: true, duplicate: true, session_id: s.session_id };

    var now = Date.now(); // numeric so the conflict check survives Sheets formatting
    var rec = {};
    SESSION_COLS.forEach(function (c) { rec[c] = s[c] === undefined ? '' : s[c]; });
    NUMERIC_SESSION.forEach(function (c) { rec[c] = num_(rec[c]); });
    rec.subjID = String(s.subjID).trim();
    rec.exclude = s.exclude ? 1 : 0;
    rec.saved_by = Session.getActiveUser().getEmail() || '';
    rec.updatedAt = now;

    var shS = ss_().getSheetByName(SHEET_SESSIONS);
    shS.appendRow(SESSION_COLS.map(function (c) { return rec[c]; }));

    var shT = ss_().getSheetByName(SHEET_TRIALS);
    var rows = trials.map(function (t) {
      return TRIAL_COLS.map(function (c) {
        if (c === 'session_id') return s.session_id;
        if (c === 'subjID') return rec.subjID;
        if (c === 'group') return s.group;
        if (c === 'session_label') return s.session_label;
        return t[c] === undefined ? '' : t[c];
      });
    });
    shT.getRange(shT.getLastRow() + 1, 1, rows.length, TRIAL_COLS.length).setValues(rows);
    return { ok: true, duplicate: false, session_id: s.session_id };
  });
}

function listSessions() {
  return sheetObjects_(SHEET_SESSIONS).map(function (s) { delete s._row; return s; }).reverse();
}

/** Edit group / session label / exclude / note, with an updatedAt conflict check. */
function updateSession(id, fields, updatedAt) {
  var cfg = readSettings_();
  return withLock_(function () {
    var cur = findSession_(id);
    if (!cur) throw new Error('ไม่พบข้อมูล session นี้');
    if (Number(cur.updatedAt) !== Number(updatedAt)) throw new Error('ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว กรุณาโหลดใหม่');
    if (fields.group !== undefined && cfg.groups.indexOf(fields.group) < 0) throw new Error('กลุ่มไม่อยู่ในรายการตั้งค่า');
    if (fields.session_label !== undefined && cfg.labels.indexOf(fields.session_label) < 0) throw new Error('ครั้งที่ไม่อยู่ในรายการตั้งค่า');

    var sh = ss_().getSheetByName(SHEET_SESSIONS);
    var now = Date.now();
    var upd = { updatedAt: now };
    ['group', 'session_label', 'note'].forEach(function (k) { if (fields[k] !== undefined) upd[k] = String(fields[k]); });
    if (fields.exclude !== undefined) upd.exclude = fields.exclude ? 1 : 0;
    Object.keys(upd).forEach(function (k) {
      sh.getRange(cur._row, SESSION_COLS.indexOf(k) + 1).setValue(upd[k]);
    });

    // Keep group / label in the trials sheet consistent.
    if (upd.group !== undefined || upd.session_label !== undefined) {
      var shT = ss_().getSheetByName(SHEET_TRIALS);
      var vals = shT.getDataRange().getValues();
      var gi = TRIAL_COLS.indexOf('group'), li = TRIAL_COLS.indexOf('session_label');
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]) === String(id)) {
          if (upd.group !== undefined) vals[i][gi] = upd.group;
          if (upd.session_label !== undefined) vals[i][li] = upd.session_label;
        }
      }
      shT.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
    }
    return { ok: true, updatedAt: now };
  });
}

function deleteSession(id, updatedAt) {
  return withLock_(function () {
    var cur = findSession_(id);
    if (!cur) throw new Error('ไม่พบข้อมูล session นี้');
    if (Number(cur.updatedAt) !== Number(updatedAt)) throw new Error('ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว กรุณาโหลดใหม่');
    ss_().getSheetByName(SHEET_SESSIONS).deleteRow(cur._row);

    var shT = ss_().getSheetByName(SHEET_TRIALS);
    var vals = shT.getDataRange().getValues();
    var keep = vals.filter(function (r, i) { return i === 0 || String(r[0]) !== String(id); });
    var removed = vals.length - keep.length;
    if (removed > 0) {
      shT.getRange(1, 1, vals.length, vals[0].length).clearContent();
      shT.getRange(1, 1, keep.length, keep[0].length).setValues(keep);
    }
    return { ok: true, removedTrials: removed };
  });
}

/**
 * Write trials.csv and sessions.csv to the "DDT exports" Drive folder for
 * analysis in Python/R. Excluded sessions are kept but flagged.
 */
function exportCsv() {
  var folders = DriveApp.getFoldersByName(EXPORT_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(EXPORT_FOLDER);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyyMMdd-HHmm');

  var excluded = {};
  sheetObjects_(SHEET_SESSIONS).forEach(function (s) { if (Number(s.exclude) === 1) excluded[s.session_id] = 1; });

  function toCsv(name, extraCol) {
    var vals = ss_().getSheetByName(name).getDataRange().getValues();
    return vals.map(function (r, i) {
      var row = r.map(function (v) { return v instanceof Date ? v.toISOString() : v; });
      if (extraCol) row.push(i === 0 ? 'exclude' : (excluded[r[0]] ? 1 : 0));
      return row.map(function (v) {
        var s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n') + '\n';
  }

  var fT = folder.createFile('ddt_trials_' + stamp + '.csv', toCsv(SHEET_TRIALS, true), MimeType.CSV);
  var fS = folder.createFile('ddt_sessions_' + stamp + '.csv', toCsv(SHEET_SESSIONS, false), MimeType.CSV);
  return { trialsUrl: fT.getUrl(), sessionsUrl: fS.getUrl(), folderUrl: folder.getUrl() };
}
