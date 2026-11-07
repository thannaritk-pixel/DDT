// Build dist/Index.html for Apps Script by inlining the shared task code.
// Usage: node webapp/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = [read('task/style.css'), read('webapp/src/app.css')].join('\n');
const js = ['task/designs.js', 'task/core.js', 'task/fit.js', 'webapp/src/app.js']
  .map((p) => '// ---- ' + p + ' ----\n' + read(p)).join('\n')
  // Keep "</script>" sequences out of the inline script.
  .replace(/<\/script/gi, '<\\/script');

const html = read('webapp/src/index.html')
  .replace('/*@@CSS@@*/', () => css)
  .replace('/*@@JS@@*/', () => js);

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'Index.html'), html);
console.log('wrote webapp/dist/Index.html (' + Math.round(html.length / 1024) + ' KB)');
