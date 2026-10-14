'use strict';
// 네트워크 없이 로컬 origin/main 객체를 읽는다. 기준 ref도 같은 원자료에서 별도로 만든다.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const revision = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: root, encoding: 'utf8' }).trim();
function baselineLoader(overrides = {}) {
    const cache = new Map();
    return function load(name) {
        if (overrides[name]) return overrides[name];
        if (cache.has(name)) return cache.get(name).exports;
        const file = path.join(root, 'scripts/integrity', name + '.js');
        const mod = new Module(file, module);
        mod.filename = file;
        mod.paths = Module._nodeModulePaths(path.dirname(file));
        const nativeRequire = mod.require.bind(mod);
        mod.require = (id) => id.startsWith('./') ? load(id.slice(2).replace(/\.js$/, '')) : nativeRequire(id);
        cache.set(name, mod);
        mod._compile(execFileSync('git', ['show', `${revision}:scripts/integrity/${name}.js`], { cwd: root, encoding: 'utf8' }), file);
        return mod.exports;
    };
}
const decisions = (rows) => rows.map(({ msg, timing, referenceCoverage, ...rest }) => rest);
function installRuleParity() {
    const current = require('../../scripts/integrity/rules');
    const baseline = baselineLoader()('rules');
    const original = { ...current }, refs = new WeakMap();
    let comparisons = 0;
    current.deriveRef = (...args) => {
        const expected = baseline.deriveRef(...args), actual = original.deriveRef(...args);
        refs.set(actual, expected);
        return actual;
    };
    for (const name of Object.keys(original).filter((k) => k.startsWith('judge') || k === 'extLiveVerdict')) {
        current[name] = (...args) => {
            const expected = baseline[name](...args.map((x) => refs.get(x) || x));
            const actual = original[name](...args);
            assert.deepEqual(actual, expected, `${name}: origin/main 판정 불일치`);
            comparisons++;
            return actual;
        };
    }
    return { report() { assert.ok(comparisons > 0); console.log(`origin/main ${revision.slice(0, 9)}: ${comparisons}/${comparisons} rule comparisons passed`); } };
}
module.exports = { baselineLoader, installRuleParity, decisions, revision };
