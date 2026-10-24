// Offline only: run real collectors with in-memory HTTP streams; never load workers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const KO = '국채 금리가 오르고 옵션 포지션을 확인합니다.';
const JA = '市場が変動する中で、オプションのポジションを確認します。';
const expected = { ko: KO, ja: JA, nested: [{ text: KO + JA }] };
const bytes = Buffer.from(JSON.stringify(expected), 'utf8');
let checked = 0;

function transport(chunks, { status = 200, error, timeout = false } = {}) {
    const requests = [];
    function request(url, options, callback) {
        const req = new EventEmitter();
        const record = { url, options, payload: '', destroyed: false };
        requests.push(record);
        req.write = data => { record.payload += data; };
        req.destroy = () => { record.destroyed = true; };
        req.end = () => process.nextTick(() => {
            if (error) return req.emit('error', new Error(error));
            if (timeout) return req.emit('timeout');
            const res = new PassThrough();
            res.statusCode = status;
            callback(res);
            // Every write remains a separate Buffer/data event, including one-byte chunks.
            for (const chunk of chunks) res.write(chunk);
            res.end();
        });
        return req;
    }
    return { requests, request, get(url, options, callback) {
        const req = request(url, options, callback);
        req.end();
        return req;
    } };
}

const worker = read('scripts/ec2-guardian-worker.js');
const start = worker.indexOf('function fetchJSON(');
const end = worker.indexOf('function polygonGet(', start);
assert.ok(start >= 0 && end > start);
const collectors = worker.slice(start, end);
function loadWorker(io) {
    return vm.runInNewContext(collectors + '\n;({fetchJSON, postJSON})', {
        URL, Buffer, http: io, https: io,
    });
}

async function main() {
    // Reproduce both 1+2 and 2+1 splits of Korean/Japanese three-byte characters.
    for (const [text, char] of [[KO, '오'], [JA, '中']]) {
        const buf = Buffer.from(text);
        const offset = buf.indexOf(Buffer.from(char));
        for (const n of [1, 2]) {
            const chunks = [buf.subarray(0, offset + n), buf.subarray(offset + n)];
            const legacy = chunks.reduce((data, chunk) => data + chunk, '');
            assert.ok(legacy.includes('\uFFFD'), 'old collector must reproduce corruption');
            assert.equal(legacy.replace(/\uFFFD/g, ''), text.replace(char, ''), 'stripping loses the whole character');
        }
    }

    // Every byte boundary, plus the harsh case where every byte is its own chunk.
    const partitions = [];
    for (let split = 1; split < bytes.length; split++) {
        partitions.push([bytes.subarray(0, split), bytes.subarray(split)]);
    }
    partitions.push(Array.from(bytes, (_, i) => bytes.subarray(i, i + 1)));
    for (const chunks of partitions) {
        for (const protocol of ['http:', 'https:']) {
            const io = transport(chunks);
            const { fetchJSON, postJSON } = loadWorker(io);
            const url = protocol + '//offline.invalid/json';
            assert.deepEqual(JSON.parse(JSON.stringify(await fetchJSON(url))), expected);
            assert.deepEqual(JSON.parse(JSON.stringify(await postJSON(url, { ko: KO, ja: JA }))), expected);
            const post = io.requests[1];
            assert.equal(post.options.headers['Content-Length'], Buffer.byteLength(post.payload));
            assert.deepEqual(JSON.parse(post.payload), { ko: KO, ja: JA });
            checked += 2;
        }
    }
    for (const method of ['fetchJSON', 'postJSON']) {
        for (const opts of [{ error: 'offline error' }, { timeout: true }]) {
            const io = transport([], opts);
            await assert.rejects(loadWorker(io)[method]('http://offline.invalid', {}), /offline error|Request timeout/);
            if (opts.timeout) assert.equal(io.requests[0].destroyed, true);
        }
        await assert.rejects(loadWorker(transport([Buffer.from('{bad')]))[method]('http://offline.invalid', {}), /JSON parse error/);
    }
    await assert.rejects(loadWorker(transport([bytes], { status: 503 })).postJSON('http://offline.invalid', {}), /status 503/);

    // Keep the parity reader's 256 KiB limit in bytes, even with multibyte text.
    const parity = read('scripts/integrity/source-parity-worker.js');
    const parityCode = parity.slice(parity.indexOf('function readJson('), parity.indexOf('\nasync function run('));
    const loadParity = io => vm.runInNewContext(parityCode + '\n;readJson', { URL, Buffer, http: io, https: io, setTimeout, clearTimeout });
    const result = await loadParity(transport(partitions.at(-1)))('http://offline.invalid', Date.now() + 10000);
    assert.deepEqual(JSON.parse(JSON.stringify(result.body)), expected);
    const tooLarge = Buffer.from(JSON.stringify({ text: '한'.repeat(90000) }));
    assert.ok(tooLarge.length > 256 * 1024 && tooLarge.toString('utf8').length < 256 * 1024);
    assert.equal((await loadParity(transport([tooLarge]))('http://offline.invalid', Date.now() + 10000)).body, null);
    assert.equal((await loadParity(transport([bytes], { status: 503 }))('http://offline.invalid', Date.now() + 10000)).body, null);

    console.log(`httpUtf8Collectors: 통과 (${checked} worker round trips; ko/ja 모든 바이트 경계·1바이트 청크; 오류·시간초과·바이트 상한)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
