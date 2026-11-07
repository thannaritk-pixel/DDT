// In-memory mocks of the Apps Script services used by Code.gs.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function makeSheet(name) {
  const data = []; // array of rows
  const width = () => data.reduce((m, r) => Math.max(m, r.length), 0);
  const pad = (r, c) => { while (data.length < r) data.push([]); data.forEach((row) => { while (row.length < c) row.push(''); }); };
  const sheet = {
    name, data,
    getName: () => name,
    getLastRow: () => { for (let i = data.length - 1; i >= 0; i--) if (data[i].some((v) => v !== '')) return i + 1; return 0; },
    getMaxRows: () => 1000,
    setFrozenRows() {},
    appendRow(row) { const r = sheet.getLastRow() + 1; pad(r, row.length); data[r - 1] = row.slice(); pad(r, width()); },
    deleteRow(r) { data.splice(r - 1, 1); },
    getDataRange() {
      const nr = Math.max(1, sheet.getLastRow()), nc = Math.max(1, width());
      return sheet.getRange(1, 1, nr, nc);
    },
    getRange(r, c, nr = 1, nc = 1) {
      const rng = {
        getValues() { pad(r + nr - 1, c + nc - 1); return data.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)); },
        setValues(v) { pad(r + nr - 1, c + nc - 1); v.forEach((row, i) => row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; })); return rng; },
        setValue(x) { pad(r, c); data[r - 1][c - 1] = x; return rng; },
        clearContent() { pad(r + nr - 1, c + nc - 1); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = ''; return rng; },
        setFontWeight() { return rng; }, setNumberFormat() { return rng; }
      };
      return rng;
    }
  };
  return sheet;
}

function createGas({ user = 'researcher@example.com' } = {}) {
  const sheets = {};
  const files = [];
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/MOCK'
  };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    Session: { getActiveUser: () => ({ getEmail: () => user }), getScriptTimeZone: () => 'Asia/Bangkok' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 16).replace(/[-:T]/g, '') },
    MimeType: { CSV: 'text/csv' },
    DriveApp: {
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: (n) => ({ getUrl: () => 'https://drive/' + n,
        createFile: (name, content) => { files.push({ name, content }); return { getUrl: () => 'https://drive/file/' + name }; } })
    },
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 0 },
      createHtmlOutputFromFile: () => { const o = { setTitle: () => o, addMetaTag: () => o, setXFrameOptionsMode: () => o }; return o; }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  ctx.ensureSheets_();
  return { ctx, sheets, files };
}

module.exports = { createGas };
