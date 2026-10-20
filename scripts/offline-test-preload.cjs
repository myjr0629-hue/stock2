// 시험에서 환경 파일과 외부 통신을 차단한다. 운영 모듈은 변경하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const blocked = p => /^\.env/.test(path.basename(String(p)));
for (const target of [fs, fs.promises]) {
  for (const name of ['readFileSync', 'readFile', 'openSync', 'open']) {
    if (!target[name]) continue;
    const original = target[name];
    target[name] = function(p, ...args) {
      if (blocked(p)) { const e = new Error('환경 파일 읽기 차단'); e.code = 'ENOENT'; throw e; }
      return original.call(this, p, ...args);
    };
  }
}
const exists = fs.existsSync;
fs.existsSync = p => !blocked(p) && exists(p);
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const a = Array.isArray(args[0]) ? args[0] : args;
  const o = typeof a[0] === 'object' ? a[0] : { host: typeof a[1] === 'string' ? a[1] : 'localhost' };
  if (o.host && !['localhost', '127.0.0.1', '::1'].includes(o.host)) throw new Error('외부 통신 차단');
  return connect.apply(this, args);
};
const fetch = global.fetch;
global.fetch = (input, ...args) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return Promise.reject(new Error('외부 통신 차단'));
  return fetch(input, ...args);
};
// 외장 디스크의 동일 소스 재읽기를 줄인다. 경로·수정 시각·크기가 바뀌면 새로 읽는다.
const crypto = require('node:crypto');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const cacheDir = path.join(os.tmpdir(), 'signum-ux-gate-source-cache');
fs.mkdirSync(cacheDir, { recursive: true });
const read = fs.readFileSync;
fs.readFileSync = function(file, options) {
  const absolute = path.resolve(String(file));
  if (['src', 'tests', 'scripts'].some(dir => absolute.startsWith(path.join(root, dir) + path.sep)) && !blocked(file)) {
    const info = fs.statSync(file);
    const key = crypto.createHash('sha256').update(`${absolute}:${info.mtimeMs}:${info.ctimeMs}:${info.size}`).digest('hex');
    const cached = path.join(cacheDir, key);
    if (!exists(cached)) fs.writeFileSync(cached, read.call(this, file));
    return read.call(this, cached, options);
  }
  return read.call(this, file, options);
};
