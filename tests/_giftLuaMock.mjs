/**
 * 선물 Lua 시험용 순수 JS 모의 — 로컬 redis-server 가 없을 때도 «실제 Lua 원문»을 실행해 원자성을 검증한다.
 *
 * - miniLua: atomic.cjs 의 스크립트가 쓰는 Lua 5.1 부분집합(지역 변수·if/elseif·수치/ipairs for·표·문자열 연결·
 *   tonumber·math.floor·string.find/sub·cjson·redis.call)을 해석한다. 스크립트를 JS 로 옮겨 적지 않으므로
 *   Lua 원문이 바뀌면 이 모의도 바뀐 원문 그대로 실행한다.
 * - mockRedis: 메모리 Redis. eval 은 기본적으로 «스크립트 하나를 통째로 직렬 실행»한다(Redis 의 EVAL 원자성).
 *   atomic:false 로 만들면 redis.call 마다 다른 요청이 끼어들 수 있게 양보한다 — 시험이 비원자 구현을 실제로
 *   잡아내는지 확인하는 대조군이다.
 * 외부 접속·파일 쓰기는 없다.
 */

// ── Lua 값 ──────────────────────────────────────────────
export class LuaTable {
  constructor() { this.map = new Map(); }
  get(k) { return this.map.get(normKey(k)); }
  set(k, v) { const key = normKey(k); if (v === undefined || v === null) this.map.delete(key); else this.map.set(key, v); }
  len() { let n = 0; while (this.map.has(n + 1)) n++; return n; }
}
const normKey = (k) => (typeof k === 'number' && Number.isInteger(k) ? k : k);
const truthy = (v) => v !== undefined && v !== null && v !== false;
const luaNumStr = (n) => (Number.isInteger(n) && Math.abs(n) < 1e15 ? String(n) : String(Number(n.toPrecision(14))));
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (/^-?0[xX][0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return undefined;
  return Number(s);
}
function toStr(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return luaNumStr(v);
  throw new Error('문자열이 아닌 값을 연결');
}
function arith(a, b, op) {
  const x = toNumber(a), y = toNumber(b);
  if (x === undefined || y === undefined) throw new Error('산술 대상이 숫자가 아님');
  switch (op) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return x / y; case '%': return x - Math.floor(x / y) * y; case '^': return x ** y; }
  throw new Error(op);
}
function compare(a, b, op) {
  if (!((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) throw new Error('비교 대상 형식 불일치');
  switch (op) { case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b; }
  throw new Error(op);
}
const byteLen = (s) => Buffer.byteLength(s, 'utf8');

// ── 토큰화 ──────────────────────────────────────────────
const KEYWORDS = new Set(['local', 'if', 'then', 'elseif', 'else', 'end', 'for', 'in', 'do', 'return', 'and', 'or', 'not', 'nil', 'true', 'false', 'while', 'break', 'function']);
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('--', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++; const w = src.slice(i, j); out.push(KEYWORDS.has(w) ? { t: w } : { t: 'name', v: w }); i = j; continue; }
    if (/\d/.test(c)) { const m = /^\d+(\.\d+)?([eE][-+]?\d+)?/.exec(src.slice(i)); out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1, s = '';
      while (src[j] !== c) {
        if (j >= src.length) throw new Error('문자열 끝 없음');
        if (src[j] === '\\') { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; } else s += src[j++];
      }
      out.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    const three = src.slice(i, i + 3), two = src.slice(i, i + 2);
    if (three === '...') { out.push({ t: '...' }); i += 3; continue; }
    if (['==', '~=', '<=', '>=', '..'].includes(two)) { out.push({ t: two }); i += 2; continue; }
    if ('+-*/%^#<>=(){}[];:,.'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`해석할 수 없는 문자: ${c}`);
  }
  out.push({ t: 'eof' });
  return out;
}

// ── 구문 분석 ───────────────────────────────────────────
function parse(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const next = () => tk[p++];
  const accept = (t) => (tk[p].t === t ? tk[p++] : null);
  const expect = (t) => { if (tk[p].t !== t) throw new Error(`구문 오류: ${t} 필요, ${tk[p].t} 발견`); return tk[p++]; };
  const blockEnd = () => ['end', 'else', 'elseif', 'eof'].includes(peek().t);

  function block() {
    const body = [];
    while (!blockEnd()) {
      if (peek().t === 'return') {
        next();
        const values = blockEnd() || peek().t === ';' ? [] : exprList();
        accept(';');
        body.push({ k: 'return', values });
        break;
      }
      const s = statement();
      if (s) body.push(s);
    }
    return body;
  }
  function statement() {
    if (accept(';')) return null;
    if (accept('break')) return { k: 'break' };
    if (accept('local')) {
      const names = [expect('name').v];
      while (accept(',')) names.push(expect('name').v);
      const values = accept('=') ? exprList() : [];
      return { k: 'local', names, values };
    }
    if (accept('if')) {
      const arms = [];
      let cond = expr(); expect('then'); arms.push({ cond, body: block() });
      let orelse = null;
      for (;;) {
        if (accept('elseif')) { cond = expr(); expect('then'); arms.push({ cond, body: block() }); continue; }
        if (accept('else')) { orelse = block(); }
        expect('end');
        break;
      }
      return { k: 'if', arms, orelse };
    }
    if (accept('for')) {
      const first = expect('name').v;
      if (accept('=')) {
        const start = expr(); expect(','); const stop = expr();
        const step = accept(',') ? expr() : null;
        expect('do'); const body = block(); expect('end');
        return { k: 'fornum', name: first, start, stop, step, body };
      }
      const names = [first];
      while (accept(',')) names.push(expect('name').v);
      expect('in'); const iter = expr(); expect('do'); const body = block(); expect('end');
      return { k: 'forin', names, iter, body };
    }
    const target = suffixed();
    if (accept('=')) {
      if (!['name', 'index'].includes(target.k)) throw new Error('대입 대상 오류');
      return { k: 'assign', target, value: expr() };
    }
    if (target.k !== 'call') throw new Error('문장은 호출이어야 함');
    return { k: 'exprstat', e: target };
  }
  function exprList() { const list = [expr()]; while (accept(',')) list.push(expr()); return list; }
  const BIN = [['or'], ['and'], ['<', '>', '<=', '>=', '~=', '=='], ['..'], ['+', '-'], ['*', '/', '%']];
  function expr(level = 0) {
    if (level === BIN.length) return unary();
    if (BIN[level][0] === '..') {
      const left = expr(level + 1);
      if (accept('..')) return { k: 'bin', op: '..', a: left, b: expr(level) }; // 오른쪽 결합
      return left;
    }
    let left = expr(level + 1);
    while (BIN[level].includes(peek().t)) { const op = next().t; left = { k: 'bin', op, a: left, b: expr(level + 1) }; }
    return left;
  }
  function unary() {
    if (['not', '#', '-'].includes(peek().t)) { const op = next().t; return { k: 'un', op, a: unary() }; }
    const base = simple();
    if (accept('^')) return { k: 'bin', op: '^', a: base, b: unary() };
    return base;
  }
  function simple() {
    const t = peek();
    if (t.t === 'num' || t.t === 'str') { next(); return { k: 'const', v: t.v }; }
    if (t.t === 'nil') { next(); return { k: 'const', v: undefined }; }
    if (t.t === 'true' || t.t === 'false') { next(); return { k: 'const', v: t.t === 'true' }; }
    if (t.t === '{') return table();
    return suffixed();
  }
  function table() {
    expect('{');
    const items = [];
    while (!accept('}')) {
      if (peek().t === 'name' && tk[p + 1].t === '=') { const key = next().v; next(); items.push({ key: { k: 'const', v: key }, value: expr() }); }
      else if (accept('[')) { const key = expr(); expect(']'); expect('='); items.push({ key, value: expr() }); }
      else items.push({ value: expr() });
      if (!accept(',')) accept(';');
    }
    return { k: 'table', items };
  }
  function suffixed() {
    let e;
    if (accept('(')) { e = { k: 'paren', e: expr() }; expect(')'); }
    else e = { k: 'name', name: expect('name').v };
    for (;;) {
      if (accept('.')) e = { k: 'index', obj: e, key: { k: 'const', v: expect('name').v } };
      else if (accept('[')) { const key = expr(); expect(']'); e = { k: 'index', obj: e, key }; }
      else if (accept('(')) { const args = peek().t === ')' ? [] : exprList(); expect(')'); e = { k: 'call', fn: e, args }; }
      else return e;
    }
  }
  const body = block();
  expect('eof');
  return body;
}

// ── 실행 ────────────────────────────────────────────────
class Scope {
  constructor(parent) { this.parent = parent; this.vars = new Map(); }
  lookup(name) { for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s; return null; }
}
const IPAIRS = Symbol('ipairs');

async function evaluate(e, scope) {
  switch (e.k) {
    case 'const': return e.v;
    case 'paren': return evaluate(e.e, scope);
    case 'name': { const s = scope.lookup(e.name); return s ? s.vars.get(e.name) : undefined; }
    case 'index': {
      const obj = await evaluate(e.obj, scope);
      const key = await evaluate(e.key, scope);
      if (!(obj instanceof LuaTable)) throw new Error('표가 아닌 값을 색인');
      return obj.get(key);
    }
    case 'call': {
      const fn = await evaluate(e.fn, scope);
      if (typeof fn !== 'function') throw new Error('함수가 아닌 값을 호출');
      const args = [];
      for (const a of e.args) args.push(await evaluate(a, scope));
      return fn(...args);
    }
    case 'table': {
      const t = new LuaTable();
      let i = 1;
      for (const item of e.items) {
        const v = await evaluate(item.value, scope);
        if (item.key) t.set(await evaluate(item.key, scope), v); else t.set(i++, v);
      }
      return t;
    }
    case 'un': {
      const a = await evaluate(e.a, scope);
      if (e.op === 'not') return !truthy(a);
      if (e.op === '-') return -toNumber(a);
      if (typeof a === 'string') return byteLen(a);
      if (a instanceof LuaTable) return a.len();
      throw new Error('# 대상 오류');
    }
    case 'bin': {
      if (e.op === 'and') { const a = await evaluate(e.a, scope); return truthy(a) ? evaluate(e.b, scope) : a; }
      if (e.op === 'or') { const a = await evaluate(e.a, scope); return truthy(a) ? a : evaluate(e.b, scope); }
      const a = await evaluate(e.a, scope), b = await evaluate(e.b, scope);
      if (e.op === '==') return a === b;
      if (e.op === '~=') return a !== b;
      if (e.op === '..') return toStr(a) + toStr(b);
      if (['<', '>', '<=', '>='].includes(e.op)) return compare(a, b, e.op);
      return arith(a, b, e.op);
    }
  }
  throw new Error(`알 수 없는 식 ${e.k}`);
}

async function execBlock(body, parent) {
  const scope = new Scope(parent);
  for (const s of body) {
    const r = await execStat(s, scope);
    if (r) return r;
  }
  return null;
}
async function execStat(s, scope) {
  switch (s.k) {
    case 'local': {
      const values = [];
      for (const v of s.values) values.push(await evaluate(v, scope));
      s.names.forEach((n, i) => scope.vars.set(n, values[i]));
      return null;
    }
    case 'assign': {
      const value = await evaluate(s.value, scope);
      if (s.target.k === 'name') { const owner = scope.lookup(s.target.name) || rootOf(scope); owner.vars.set(s.target.name, value); return null; }
      const obj = await evaluate(s.target.obj, scope);
      if (!(obj instanceof LuaTable)) throw new Error('표가 아닌 값에 대입');
      obj.set(await evaluate(s.target.key, scope), value);
      return null;
    }
    case 'exprstat': await evaluate(s.e, scope); return null;
    case 'break': return { breaking: true };
    case 'if': {
      for (const arm of s.arms) if (truthy(await evaluate(arm.cond, scope))) return execBlock(arm.body, scope);
      return s.orelse ? execBlock(s.orelse, scope) : null;
    }
    case 'fornum': {
      const start = toNumber(await evaluate(s.start, scope)), stop = toNumber(await evaluate(s.stop, scope));
      const step = s.step ? toNumber(await evaluate(s.step, scope)) : 1;
      for (let i = start; step > 0 ? i <= stop : i >= stop; i += step) {
        const inner = new Scope(scope); inner.vars.set(s.name, i);
        const r = await execBlock(s.body, inner);
        if (r?.breaking) break;
        if (r) return r;
      }
      return null;
    }
    case 'forin': {
      const it = await evaluate(s.iter, scope);
      if (!it || !it[IPAIRS]) throw new Error('ipairs 만 지원');
      const t = it[IPAIRS];
      for (let i = 1; t.get(i) !== undefined; i++) {
        const inner = new Scope(scope); inner.vars.set(s.names[0], i); if (s.names[1]) inner.vars.set(s.names[1], t.get(i));
        const r = await execBlock(s.body, inner);
        if (r?.breaking) break;
        if (r) return r;
      }
      return null;
    }
    case 'return': {
      const values = [];
      for (const v of s.values) values.push(await evaluate(v, scope));
      return { values };
    }
  }
  throw new Error(`알 수 없는 문장 ${s.k}`);
}
const rootOf = (scope) => { let s = scope; while (s.parent) s = s.parent; return s; };

// cjson: Lua 표 ↔ JSON
function luaFromJson(v) {
  if (v === null) return undefined;
  if (Array.isArray(v)) { const t = new LuaTable(); v.forEach((x, i) => t.set(i + 1, luaFromJson(x))); return t; }
  if (typeof v === 'object') { const t = new LuaTable(); for (const [k, x] of Object.entries(v)) t.set(k, luaFromJson(x)); return t; }
  return v;
}
function jsonFromLua(v) {
  if (v instanceof LuaTable) {
    const n = v.len();
    if (n > 0 && n === v.map.size) return Array.from({ length: n }, (_, i) => jsonFromLua(v.get(i + 1)));
    const o = {};
    for (const [k, x] of v.map) o[String(k)] = jsonFromLua(x);
    return o;
  }
  return v === undefined ? null : v;
}
function luaPatternToRegExp(pattern) {
  const classes = { d: '0-9', a: 'A-Za-z', l: 'a-z', u: 'A-Z', s: '\\s', w: 'A-Za-z0-9', x: '0-9A-Fa-f', p: '!-/:-@\\[-`{-~' };
  let out = '', inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '%') {
      const e = pattern[++i];
      if (classes[e]) out += inClass ? classes[e] : `[${classes[e]}]`;
      else out += `\\${e}`;
      continue;
    }
    if (c === '[') inClass = true; else if (c === ']') inClass = false;
    out += c;
  }
  return new RegExp(out);
}

const compiled = new Map();
/** Lua 원문을 실행한다. redisCall(cmd, ...args) 는 Redis 응답을 Lua 값으로 돌려준다. */
export async function runLua(script, keys, argv, redisCall) {
  if (!compiled.has(script)) compiled.set(script, parse(script));
  const g = new Scope(null);
  const KEYS = new LuaTable(); keys.forEach((k, i) => KEYS.set(i + 1, String(k)));
  const ARGV = new LuaTable(); argv.forEach((a, i) => ARGV.set(i + 1, String(a)));
  const redis = new LuaTable(); redis.set('call', (...args) => redisCall(...args.map((a) => (typeof a === 'number' ? luaNumStr(a) : a))));
  const cjson = new LuaTable();
  cjson.set('encode', (v) => JSON.stringify(jsonFromLua(v)));
  cjson.set('decode', (s) => luaFromJson(JSON.parse(s)));
  const math = new LuaTable(); math.set('floor', (n) => Math.floor(toNumber(n)));
  const string = new LuaTable();
  string.set('find', (s, pat) => { const m = luaPatternToRegExp(pat).exec(s); return m ? m.index + 1 : undefined; });
  string.set('sub', (s, i, j) => {
    const len = s.length; let a = i === undefined ? 1 : i; let b = j === undefined ? -1 : j;
    if (a < 0) a = Math.max(len + a + 1, 1); else if (a === 0) a = 1;
    if (b < 0) b = len + b + 1; else if (b > len) b = len;
    return a > b ? '' : s.slice(a - 1, b);
  });
  for (const [k, v] of Object.entries({ KEYS, ARGV, redis, cjson, math, string, tonumber: toNumber, ipairs: (t) => ({ [IPAIRS]: t }) })) g.vars.set(k, v);
  const r = await execBlock(compiled.get(script), g);
  return r ? r.values[0] : undefined;
}

// ── 메모리 Redis ────────────────────────────────────────
const WRONGTYPE = () => new Error('WRONGTYPE');
export function mockRedis({ atomic = true } = {}) {
  const db = new Map(); // key → { type, value }
  const ofType = (key, type, create) => {
    const e = db.get(key);
    if (!e) { if (!create) return null; const fresh = { type, value: type === 'string' ? '' : type === 'list' ? [] : type === 'set' ? new Set() : new Map() }; db.set(key, fresh); return fresh; }
    if (e.type !== type) throw WRONGTYPE();
    return e;
  };
  const dropEmpty = (key) => { const e = db.get(key); if (e && e.type !== 'string' && (e.value.size ?? e.value.length) === 0) db.delete(key); };
  const parseScore = (s) => (s === '+inf' ? Infinity : s === '-inf' ? -Infinity : Number(s));
  // Redis 응답(JS): null=nil, 문자열, 정수, 배열, { ok } 상태
  function command(cmd, ...args) {
    const [key] = args;
    switch (String(cmd).toUpperCase()) {
      case 'GET': { const e = ofType(key, 'string'); return e ? e.value : null; }
      case 'SET': { db.set(key, { type: 'string', value: String(args[1]) }); return { ok: 'OK' }; }
      case 'EXISTS': return args.filter((k) => db.has(k)).length;
      case 'INCR': { const e = ofType(key, 'string', true); const n = (e.value === '' ? 0 : Number(e.value)) + 1; if (!Number.isInteger(n)) throw new Error('ERR not integer'); e.value = String(n); return n; }
      case 'EXPIRE': return db.has(key) ? 1 : 0;
      case 'TYPE': return { ok: db.get(key)?.type || 'none' };
      case 'ZADD': { const e = ofType(key, 'zset', true); let added = 0; for (let i = 1; i < args.length; i += 2) { if (!e.value.has(args[i + 1])) added++; e.value.set(args[i + 1], Number(args[i])); } return added; }
      case 'ZRANGEBYSCORE': {
        const e = ofType(key, 'zset'); if (!e) return [];
        const min = parseScore(args[1]), max = parseScore(args[2]);
        return [...e.value].filter(([, s]) => s >= min && s <= max).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([m]) => m);
      }
      case 'RPUSH': { const e = ofType(key, 'list', true); e.value.push(...args.slice(1).map(String)); return e.value.length; }
      case 'LINDEX': { const e = ofType(key, 'list'); if (!e) return null; const i = Number(args[1]); const v = e.value.at(i); return v === undefined ? null : v; }
      case 'LPOP': { const e = ofType(key, 'list'); if (!e) return null; const v = e.value.shift(); dropEmpty(key); return v ?? null; }
      case 'LLEN': { const e = ofType(key, 'list'); return e ? e.value.length : 0; }
      case 'LSET': { const e = ofType(key, 'list'); if (!e) throw new Error('ERR no such key'); const i = Number(args[1]); e.value[i < 0 ? e.value.length + i : i] = String(args[2]); return { ok: 'OK' }; }
      case 'SADD': { const e = ofType(key, 'set', true); let n = 0; for (const m of args.slice(1)) if (!e.value.has(m)) { e.value.add(String(m)); n++; } return n; }
      case 'SISMEMBER': { const e = ofType(key, 'set'); return e && e.value.has(String(args[1])) ? 1 : 0; }
      case 'HSET': { const e = ofType(key, 'hash', true); let n = 0; for (let i = 1; i < args.length; i += 2) { if (!e.value.has(args[i])) n++; e.value.set(String(args[i]), String(args[i + 1])); } return n; }
      case 'HGET': { const e = ofType(key, 'hash'); return e ? e.value.get(String(args[1])) ?? null : null; }
      case 'HEXISTS': { const e = ofType(key, 'hash'); return e && e.value.has(String(args[1])) ? 1 : 0; }
      case 'HLEN': { const e = ofType(key, 'hash'); return e ? e.value.size : 0; }
      case 'FLUSHDB': db.clear(); return { ok: 'OK' };
    }
    throw new Error(`모의에 없는 명령 ${cmd}`);
  }
  // Redis 응답 → Lua 값(EVAL 규칙: nil→false, 배열→표, 상태→{ok=})
  const toLua = (r) => {
    if (r === null) return false;
    if (Array.isArray(r)) { const t = new LuaTable(); r.forEach((x, i) => t.set(i + 1, toLua(x))); return t; }
    if (r && typeof r === 'object') { const t = new LuaTable(); t.set('ok', r.ok); return t; }
    return r;
  };
  // Lua 반환값 → Redis 응답(숫자는 정수로 자름, 표는 첫 nil 전까지 배열, false→nil, ok 표→상태 문자열)
  const fromLua = (v) => {
    if (v === undefined || v === false) return null;
    if (v === true) return 1;
    if (typeof v === 'number') return Math.trunc(v);
    if (v instanceof LuaTable) { if (v.get('ok') !== undefined) return v.get('ok'); const out = []; for (let i = 1; v.get(i) !== undefined; i++) out.push(fromLua(v.get(i))); return out; }
    return v;
  };
  // 원자 모드: 스크립트들을 한 줄로 세워 통째로 실행한다(Redis 단일 스레드 EVAL 과 같은 보장).
  let queue = Promise.resolve();
  const yieldTick = () => new Promise((r) => setImmediate(r));
  async function evalScript(script, numkeys, ...rest) {
    const keys = rest.slice(0, numkeys), argv = rest.slice(numkeys);
    const call = atomic
      ? async (...a) => toLua(command(...a))
      : async (...a) => { await yieldTick(); return toLua(command(...a)); };
    const job = async () => fromLua(await runLua(script, keys, argv, call));
    if (!atomic) { await yieldTick(); return job(); }
    const result = queue.then(job);
    queue = result.catch(() => {});
    await yieldTick(); // 호출자 쪽에서는 비동기로 보이게(동시 요청 흉내)
    return result;
  }
  const plain = (cmd) => async (...a) => { const r = command(cmd, ...a); return r && typeof r === 'object' && !Array.isArray(r) ? r.ok : r; };
  return {
    eval: evalScript,
    set: plain('SET'), flushdb: plain('FLUSHDB'), llen: plain('LLEN'), hlen: plain('HLEN'), hget: plain('HGET'),
    lset: plain('LSET'), exists: plain('EXISTS'), sadd: plain('SADD'),
    disconnect() {},
  };
}
