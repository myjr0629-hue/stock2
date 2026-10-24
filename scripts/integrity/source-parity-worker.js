'use strict';
// Executed in memory on EC2, via ec2-ssm.js; no files, caches, or processes changed.
const https = require('node:https');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const number = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

function remoteKey() {
    if (process.env.INTRINIO_API_KEY) return process.env.INTRINIO_API_KEY;
    // PM2 output is parsed in memory and never echoed. Do not load .env files.
    const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 1500, maxBuffer: 2 * 1024 * 1024 }));
    const hub = processes.find((p) => /(?:^|\/)ec2-price-ws\.js$/.test(p.pm2_env?.pm_exec_path || ''));
    return hub?.pm2_env?.INTRINIO_API_KEY || hub?.pm2_env?.env?.INTRINIO_API_KEY || null;
}

function readJson(url, deadline) {
    return new Promise((resolve) => {
        let done = false, req, timer;
        const finish = (body) => { if (done) return; done = true; clearTimeout(timer); resolve({ body, ended: Date.now() }); };
        timer = setTimeout(() => { finish(null); if (req) req.destroy(); }, Math.max(1, deadline - Date.now()));
        try {
            req = (new URL(url).protocol === 'http:' ? http : https).get(url, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } }, (res) => {
                const chunks = [];
                let bytes = 0;
                res.on('data', (part) => { bytes += part.length; if (bytes > 256 * 1024) { finish(null); req.destroy(); } else chunks.push(part); });
                res.on('error', () => finish(null));
                res.on('end', () => { try { finish(res.statusCode === 200 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); } catch { finish(null); } });
            });
            req.on('error', () => finish(null));
        } catch { finish(null); }
    });
}

async function run({ symbols, target }, { clock, targetConfig = require('./source-parity-target'), getKey = remoteKey, read = readJson, now = Date.now } = {}) {
    if (!targetConfig.matches(target, targetConfig.resolve(target || {}))) return { environmentMismatch: true };
    if (!Array.isArray(symbols) || symbols.length > 41 || !symbols.length || symbols.some((s) => !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s))) return { failure: true };
    if (clock.sessionAt(now()).session !== 'regular') return { sessionAborted: true };
    let apiKey;
    try { apiKey = getKey(); } catch { return { failure: true }; }
    if (typeof apiKey !== 'string' || !apiKey) return { failure: true };
    const at = now(), deadline = at + 2000;
    // Every request is dispatched before awaiting any response; app batches <=30
    // follow the app's own path. No vendor retry/fallback/redirect is permitted.
    const appJobs = [];
    for (let i = 0; i < symbols.length; i += 30) {
        const list = symbols.slice(i, i + 30);
        if (clock.sessionAt(now()).session !== 'regular') return { sessionAborted: true };
        appJobs.push(read(`${target.base}/api/live/quotes?symbols=${encodeURIComponent(list.join(','))}`, deadline));
    }
    if (clock.sessionAt(now()).session !== 'regular') return { sessionAborted: true };
    const hubJob = read(`${targetConfig.hubHttp(target)}?symbols=${encodeURIComponent(symbols.join(','))}`, deadline);
    const sourceJobs = [];
    for (const s of symbols) {
        // Key lookup and earlier dispatches can cross REG close. Discard the
        // whole partial round and stop dispatching as soon as that happens.
        if (clock.sessionAt(now()).session !== 'regular') return { sessionAborted: true };
        sourceJobs.push(read(`${target.source}/securities/${encodeURIComponent(s)}/prices/realtime?source=${target.feed}&api_key=${encodeURIComponent(apiKey)}`, deadline));
    }
    const [apps, hub, sources] = await Promise.all([Promise.all(appJobs), hubJob, Promise.all(sourceJobs)]);
    apiKey = null;
    const rows = {};
    symbols.forEach((sym, i) => {
        const a = apps[Math.floor(i / 30)], s = sources[i], q = a.body?.data?.[sym], h = hub.body?.ticks?.[sym], source = s.body;
        rows[sym] = {
            // Current app responses omit last_time: preserve that gap as null.
            // Do not replace a source trade timestamp with response lastUpdate.
            app: { p: number(q?.price), last_time: typeof q?.last_time === 'string' ? number(Date.parse(q.last_time)) : null }, hub: { p: number(h?.p), t: number(h?.trade) },
            source: source?.source === target.feed ? { p: number(source.last_price), t: number(Date.parse(source.last_time)) } : null,
            started: at, ended: Math.max(a.ended, hub.ended, s.ended),
        };
    });
    return { at, target, live: hub.body?.live === true, rows };
}
module.exports = { run, readJson, remoteKey };
