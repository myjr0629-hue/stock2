'use strict';
// Public endpoints only. The vendor feed is shared by production and preview;
// it must never be replaced by a hub cache or an arbitrary key-bearing URL.
const BASE = 'https://www.signumhq.com';
const HUB = 'wss://ws.signumhq.com';
const SOURCE = 'https://api-v2.intrinio.com';
const FEED = 'equities_edge';

function endpoint(value, protocols) {
    const u = new URL(value);
    if (!protocols.includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error('Invalid public endpoint');
    return u.href.replace(/\/$/, '');
}

function resolve({ base = BASE, hub = HUB, source = SOURCE, feed = FEED } = {}) {
    try {
        base = endpoint(base, ['http:', 'https:']);
        hub = endpoint(hub, ['ws:', 'wss:']);
        if (source !== SOURCE || feed !== FEED) return null;
        const appProduction = ['www.signumhq.com', 'signumhq.com'].includes(new URL(base).hostname);
        const hubProduction = new URL(hub).hostname === 'ws.signumhq.com';
        if (appProduction !== hubProduction) return null;
        return { base, hub, source, feed };
    } catch { return null; }
}

function matches(actual, expected) {
    if (!actual || !expected) return false;
    const clean = resolve(actual);
    return !!clean && ['base', 'hub', 'source', 'feed'].every((k) => actual[k] === clean[k] && clean[k] === expected[k]);
}

function hubHttp(target) {
    const u = new URL(target.hub);
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    return new URL('/last', u).href;
}

module.exports = { resolve, matches, hubHttp };
