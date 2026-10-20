// 자식 번들 시험에는 전달하지 않는 TypeScript 로더.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const crypto = require('node:crypto');
const cacheDir = path.join(require('node:os').tmpdir(), 'signum-ux-gate-compile-cache');
fs.mkdirSync(cacheDir, { recursive: true });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return resolve.call(this, id.startsWith('@/') ? path.join(__dirname, '../src', id.slice(2)) : id, ...args);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const key = crypto.createHash('sha256').update(filename).update(source).update(ts.version).digest('hex');
  const cached = path.join(cacheDir, key + '.cjs');
  const output = fs.existsSync(cached) ? fs.readFileSync(cached, 'utf8') : ts.transpileModule(source, { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  if (!fs.existsSync(cached)) fs.writeFileSync(cached, output);
  mod._compile(output, filename);
};
