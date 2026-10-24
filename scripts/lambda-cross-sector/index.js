const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const https = require('https');
const KEYLEVELS = require('./keyLevels');
const INDEXLEVELS = require('./indexLevels');
const CLOSING = require('./closingReport');

const SECTOR_IDS = [
    'm7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse',
    'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress',
];

const SECTOR_LABELS = {
    m7: 'M7 (Magnificent 7)',
    physical_ai: 'Physical AI (Robotics & Embodied)',
    silicon_core: 'Silicon Core (AI Infra & Chips)',
    power_matrix: 'Power Matrix (Energy & Nuclear)',
    bio_pulse: 'Bio Pulse (GLP-1 & Biotech)',
    cyber_shield: 'Cyber Shield (AI Security & Zero Trust)',
    orbit_defense: 'Orbit Defense (Space & Defense)',
    quantum_edge: 'Quantum Edge (Quantum & AI Infra)',
    fintech_pulse: 'Fintech Pulse (Digital Finance)',
    cloud_fortress: 'Cloud Fortress (Cloud & SaaS)',
};

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const EC2_PROXY_URL = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const EC2_PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const MASSIVE_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || '';

// Redis helpers
async function redisGet(key) {
    try {
        try {
            const resEc2 = await fetch(`${EC2_PROXY_URL}/get?key=${encodeURIComponent(key)}`, {
                headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}` }
            });
            if (resEc2.ok) {
                const data = await resEc2.json();
                if (data && data.result !== undefined) {
                    return data.result;
                }
            }
        } catch (ec2Err) {
            console.warn('EC2 Proxy get failed:', ec2Err.message);
        }

        const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
        });
        const data = await res.json();
        if (data.result) {
            try { return JSON.parse(data.result); } catch (e) { return data.result; }
        }
        return null;
    } catch {
        return null;
    }
}

async function redisSet(key, value, ttlSeconds) {
    try {
        try {
            await fetch(`${EC2_PROXY_URL}/set`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value, ttl: ttlSeconds })
            });
        } catch (ec2Err) {
            console.warn('EC2 Proxy set failed:', ec2Err.message);
        }

        const payload = JSON.stringify(value);
        await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}?EX=${ttlSeconds}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
            body: payload
        });
    } catch (e) {
        console.error('Redis Set Error:', e.message);
    }
}

// Supabase fetching via REST to bypass massive client package
async function getLatestSnapshot(sectorId) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_sector_snapshots?sector_id=eq.${sectorId}&select=*&order=snapshot_date.desc&limit=1`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await res.json();
        return data && data.length > 0 ? data[0] : null;
    } catch (e) {
        console.error(`Supabase fetch failed for ${sectorId}:`, e.message);
        return null;
    }
}

// Massive/Polygon fetch
async function fetchMassiveNews() {
    try {
        const res = await fetch(`https://api.polygon.io/v2/reference/news?ticker=SPY,QQQ,DIA,TLT,GLD&limit=10&order=desc&sort=published_utc&apiKey=${MASSIVE_KEY}`);
        const data = await res.json();
        if (!data || !data.results) return [];
        return data.results;
    } catch (e) {
        console.error('Polygon News fetch failed:', e.message);
        return [];
    }
}

function getTodayET() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function getDayOfWeekET() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
}

const YAHOO_CACHE_KEYS = {
    VIX: 'yahoo:vix',
    VIX3M: 'yahoo:vix3m',
    NQ: 'yahoo:nq',
    TNX: 'yahoo:tnx',
    SPX: 'yahoo:spx',
    BTC: 'yahoo:btc',
    GOLD: 'yahoo:gold',
    TLT: 'yahoo:tlt',
    OIL: 'yahoo:oil',
    RUT: 'yahoo:rut',
    USDKRW: 'yahoo:usdkrw',
    USDJPY: 'yahoo:usdjpy',
    IDX_NASDAQ: 'yahoo:idx:nasdaq',
    IDX_DOW: 'yahoo:idx:dow',
    IDX_SPX: 'yahoo:idx:spx'
};

exports.handler = async (event, context) => {
    console.log('[CrossSector Lambda V3] Execution starting...');
    const startTime = Date.now();

    try {
        const now = new Date();
        const todayDate = getTodayET();
        const closeMinutes = CLOSING.cashCloseMinutes(todayDate);
        // 1. Fetch all sector snapshots
        console.log('Fetching 10 sector snapshots from Supabase...');
        const snapshotsRes = await Promise.all(
            SECTOR_IDS.map(async (id) => {
                const snap = await getLatestSnapshot(id);
                return { id, sessionDate: snap?.snapshot_date, data: snap?.snapshot_date === todayDate ? snap.data_json : null };
            })
        );
        const validSnapshots = snapshotsRes.filter(s => s.data);
        
        if (validSnapshots.length === 0) {
            console.warn('No sector snapshots available');
            return { statusCode: 404, body: 'No snapshots' };
        }

        // 2. Fetch Redis Macro + News
        console.log('Fetching Redis macros and market news...');
        let [
            redisVix, redisVix3m, redisSpx, redisNq, redisTnx,
            redisBtc, redisFng, redisGold, redisOil, redisTlt,
            redisRut, redisUsdkrw, redisUsdjpy,
            redisIdxNasdaq, redisIdxDow, redisIdxSpx,
            fmpCalendar, marketNews, redisDxy,
            ...structureVersions
        ] = await Promise.all([
            redisGet(YAHOO_CACHE_KEYS.VIX),
            redisGet(YAHOO_CACHE_KEYS.VIX3M),
            redisGet(YAHOO_CACHE_KEYS.SPX),
            redisGet(YAHOO_CACHE_KEYS.NQ),
            redisGet(YAHOO_CACHE_KEYS.TNX),
            redisGet('yahoo:quote:BTC-USD'),
            redisGet('market:fear_greed'),
            redisGet(YAHOO_CACHE_KEYS.GOLD),
            redisGet(YAHOO_CACHE_KEYS.OIL),
            redisGet(YAHOO_CACHE_KEYS.TLT),
            redisGet(YAHOO_CACHE_KEYS.RUT),
            redisGet(YAHOO_CACHE_KEYS.USDKRW),
            redisGet(YAHOO_CACHE_KEYS.USDJPY),
            redisGet(YAHOO_CACHE_KEYS.IDX_NASDAQ),
            redisGet(YAHOO_CACHE_KEYS.IDX_DOW),
            redisGet(YAHOO_CACHE_KEYS.IDX_SPX),
            redisGet('fmp:econ-calendar'),
            fetchMassiveNews().then(items => CLOSING.newsEvidence(items, todayDate, now, closeMinutes)),
            redisGet('yahoo:dxy'),
            // ★2026-10-11 지수 ETF 옵션 구조 판본(structure:v2:{T}) — 앱·웹이 읽는 «한 문»의 저장본. 계산하지 않고 읽기만(없으면 블록을 뺀다)
            ...INDEXLEVELS.TICKERS.map((t) => redisGet(`structure:v2:${t}`)),
        ]);

        // All prompt and display readings must belong to the same ET session.
        [redisVix, redisVix3m, redisSpx, redisNq, redisTnx, redisBtc, redisFng,
            redisGold, redisOil, redisTlt, redisRut, redisUsdkrw, redisUsdjpy, redisDxy] =
            [redisVix, redisVix3m, redisSpx, redisNq, redisTnx, redisBtc, redisFng,
                redisGold, redisOil, redisTlt, redisRut, redisUsdkrw, redisUsdjpy, redisDxy]
                .map(q => CLOSING.sessionReading(q, todayDate, now));

        const cashCloses = {
            spx: CLOSING.regularClose(redisIdxSpx, '^GSPC', todayDate, now, closeMinutes),
            nasdaq: CLOSING.regularClose(redisIdxNasdaq, '^IXIC', todayDate, now, closeMinutes),
            dow: CLOSING.regularClose(redisIdxDow, '^DJI', todayDate, now, closeMinutes),
        };
        if (!cashCloses.spx || !cashCloses.nasdaq) return { statusCode: 503, body: 'Regular-session cash closes unavailable' };
        const idxNasdaq = cashCloses.nasdaq;
        const idxSpx = cashCloses.spx;
        const idxDow = cashCloses.dow;

        // 2c. 지수 ETF 옵션 구조 레벨(SPY·QQQ·IWM) — 입력에 진짜 레벨이 없어 keyLevels 가 [VIX3M] 한 칸·빈 배열이 되던 것을 푼다(Vercel 판과 같은 블록·같은 출구)
        const nowMsLv = Date.now();
        const indexRows = INDEXLEVELS.TICKERS.map((t, i) => INDEXLEVELS.rowFromStored(t, structureVersions[i], nowMsLv)).filter(r => r && r.asOf != null && new Date(r.asOf).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayDate);
        const levelsBlock = INDEXLEVELS.buildLevelsBlock(indexRows);
        console.log(`[CrossSector] index levels: ${indexRows.map((r) => `${r.ticker}(${r.putFloor ?? '-'}/${r.callWall ?? '-'})`).join(' ') || 'none'}`);

        // 3. Sector summaries
        const sectorSummaries = validSnapshots.map(s => {
            const summary = s.data?.sector_summary || {};
            const tickers = s.data?.tickers || [];
            const sorted = tickers.filter(t => t.change_pct != null && Number.isFinite(t.change_pct))
                .sort((a, b) => b.change_pct - a.change_pct);
            const leader = sorted[0];
            const laggard = sorted[sorted.length - 1];
            const news = CLOSING.newsEvidence((summary.newsDigest || []).slice(0, 3), todayDate, now, closeMinutes, s.id);

            return {
                sector: SECTOR_LABELS[s.id] || s.id,
                sectorId: s.id,
                sessionDate: s.sessionDate,
                changePct: sorted.length ? sorted.reduce((sum, t) => sum + t.change_pct, 0) / sorted.length : null,
                outlook: summary.outlook || 'NEUTRAL',
                gainers: summary.gainers || 0,
                losers: summary.losers || 0,
                avgAlpha: summary.avg_alpha ?? null,
                avgPcr: summary.avg_pcr ?? null,
                totalGex: summary.total_gex ?? null,
                dominantRegime: summary.dominant_regime || 'NEUTRAL',
                leader: leader ? `${leader.ticker} ${leader.change_pct >= 0 ? '+' : ''}${leader.change_pct.toFixed(2)}%` : '-',
                laggard: laggard ? `${laggard.ticker} ${laggard.change_pct.toFixed(2)}%` : '-',
                newsSentiment: summary.newsSentimentOverall || 'NEUTRAL',
                news,
            };
        });

        // 4. Macro string
        // 금리 변화는 bp — «(+1.08%)»(수익률의 상대 %)를 모델이 «+1.08%p»로 옮겨 쓴다 (2026-09-29, src/lib/yieldChange.ts 와 같은 규칙)
        const tnxBp = (q) => {
            const abs = Number.isFinite(q?.change) ? q.change
                : (Number.isFinite(q?.price) && Number.isFinite(q?.changePct) && q.changePct > -100 ? q.price - q.price / (1 + q.changePct / 100) : null);
            if (abs == null) return '—';
            const bp = Math.round(abs * 100);
            return `${bp > 0 ? '+' : ''}${bp}bp`;
        };
        const fmt = (q, label, suffix = '') =>
            q ? `${label}: ${q.price.toFixed(suffix === '%' ? 2 : (q.price > 1000 ? 0 : 2))}${suffix} (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%)` : null;

        const macroStr = [
            fmt(redisVix, 'VIX'), fmt(redisVix3m, 'VIX3M'),
            redisVix && redisVix3m ? `VIX/VIX3M Ratio: ${(redisVix.price / (redisVix3m.price || 1)).toFixed(3)} (${redisVix.price > redisVix3m.price ? 'BACKWARDATION ⚠️' : 'CONTANGO ✓'})` : null,
            fmt(idxSpx, 'S&P500'), fmt(idxNasdaq, 'NASDAQ'), fmt(idxDow, 'DOW'), fmt(redisSpx, 'ES=F daily futures change (not since cash close)'),
            fmt(redisNq, 'NQ=F NASDAQ100 daily futures change (not NASDAQ Composite)'),
            fmt(redisRut, 'RTY=F daily futures change (not cash close)'),
            redisTnx ? `US10Y: ${redisTnx.price.toFixed(2)}% (${tnxBp(redisTnx)})` : null,
            fmt(redisDxy, 'DXY'), fmt(redisTlt, 'TLT(20Y+Bond)'), fmt(redisGold, 'Gold'), fmt(redisOil, 'WTI Oil'),
            redisBtc ? `BTC: $${redisBtc.price.toFixed(0)} (${redisBtc.changePct >= 0 ? '+' : ''}${redisBtc.changePct.toFixed(2)}%)` : null,
            redisFng ? `Fear & Greed: ${redisFng.value || redisFng.score || 'N/A'}` : null,
            redisUsdkrw ? `USD/KRW: ${redisUsdkrw.price.toFixed(2)} (${redisUsdkrw.changePct >= 0 ? '+' : ''}${redisUsdkrw.changePct.toFixed(2)}%)` : null,
            redisUsdjpy ? `USD/JPY: ${redisUsdjpy.price.toFixed(2)} (${redisUsdjpy.changePct >= 0 ? '+' : ''}${redisUsdjpy.changePct.toFixed(2)}%)` : null,
        ].filter(Boolean).join(' | ');

        const upcomingEvents = CLOSING.calendarEvidence(fmpCalendar, now);

        const readings = { btc: redisBtc, fearGreed: redisFng, vix: redisVix, vix3m: redisVix3m, us10y: redisTnx, dollar: redisDxy,
            usdkrw: redisUsdkrw, usdjpy: redisUsdjpy, gold: redisGold, oil: redisOil, tlt: redisTlt,
            futures: { es: redisSpx, nq: redisNq, rty: redisRut } };
        const reportEvidence = { sessionDate: todayDate, readings, regularClose: cashCloses, news: [...marketNews, ...sectorSummaries.flatMap(s => s.news)], events: upcomingEvents };
        const prompt = CLOSING.buildClosingPrompt({ sessionDate: todayDate, macroStr, levelsSection: INDEXLEVELS.levelsPromptSection(levelsBlock.block),
            evidence: reportEvidence, sectorSummaries, keyLevelsSchema: KEYLEVELS.SCHEMA_EXAMPLE, keyLevelsRequirement: KEYLEVELS.REQUIREMENT });

        console.log(`Calling Bedrock Claude with ${sectorSummaries.length} sectors + 13 macro indicators...`);
        const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

        const requestBody = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 12000, // 2026-10-24 v2 5단 서사×3언어 — 출력 약 8천 토큰(8192 면 잘림→압축 재요청)
            temperature: 0.4,
            system: "You are SIGNUM Intelligence, an elite institutional-grade financial analyst. Return ONLY valid JSON. No markdown fences.",
            messages: [{ role: "user", content: prompt }]
        };

        const command = new InvokeModelCommand({
            // ★ 2026-09-14: 구 모델 claude-sonnet-4-20250514 는 AWS 공지상 2026-10-14 EOL.
            //   그날 이후 호출이 통째로 실패하므로 만료 전에 4.6 으로 올렸다.
            modelId: "us.anthropic.claude-sonnet-4-6",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(requestBody),
        });

        // ★ 2026-09-16: 9/15 21:50 실행이 «JSON parse failed» 로 죽어 그날 브리프가 비었다(원문은 `{`
        //   로 시작 — 펜스 문제가 아니라 잘림(max_tokens) 또는 문자열 안 제어문자·후행 콤마).
        //   처방은 사례가 아니라 종류: ① 바깥 중괄호만 추출 ② 후행 콤마·제어문자 복구 ③ stop_reason 기록
        //   ④ 잘림(max_tokens)이면 «같은 JSON 을 더 짧게» 1회 재요청. 그래도 안 되면 그때 500.
        const invokeOnce = async (body) => {
            const raw = await bedrockClient.send(new InvokeModelCommand({ modelId: command.input.modelId, contentType: 'application/json', accept: 'application/json', body: JSON.stringify(body) }));
            const parsed = JSON.parse(new TextDecoder().decode(raw.body));
            return { text: parsed.content?.[0]?.text || '', stopReason: parsed.stop_reason || null, usage: parsed.usage || null };
        };
        const extractJson = (txt) => {
            let t = String(txt || '').replace(/```json/gi, '').replace(/```/g, '').trim();
            const s = t.indexOf('{'), e = t.lastIndexOf('}');
            if (s >= 0 && e > s) t = t.slice(s, e + 1);
            return t;
        };
        const tryParse = (txt) => {
            try { return JSON.parse(txt); } catch (_) { /* fallthrough */ }
            // 복구 시도: 후행 콤마, 문자열 안 원시 제어문자(개행 등)
            const repaired = txt.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
            try { const v = JSON.parse(repaired); console.warn('[CrossSector] JSON repaired (trailing commas / control chars)'); return v; } catch (_) { return null; }
        };

        let attempt = await invokeOnce(requestBody);
        let responseText = extractJson(attempt.text);
        let structured = tryParse(responseText);
        if (!structured && attempt.stopReason === 'max_tokens') {
            console.warn(`[CrossSector] output truncated (stop_reason=max_tokens, len=${responseText.length}) — retrying once with a compact instruction`);
            const compactBody = { ...requestBody, messages: [{ role: 'user', content: prompt + '\n\n## OUTPUT SIZE\nThe previous answer was cut off. Return the SAME JSON schema but HALVE every text field. Absolute maximum 1 short sentence per field. Return ONLY the JSON object.' }] };
            attempt = await invokeOnce(compactBody);
            responseText = extractJson(attempt.text);
            structured = tryParse(responseText);
        }
        if (!structured) {
            console.error(`JSON parse failed (stop_reason=${attempt.stopReason}, len=${responseText.length}, usage=${JSON.stringify(attempt.usage)}). Head:`, responseText.substring(0, 300), '| Tail:', responseText.slice(-200));
            return { statusCode: 500, body: 'Bedrock returned invalid JSON' };
        }
        console.log(`[CrossSector] Bedrock JSON ok (stop_reason=${attempt.stopReason}, len=${responseText.length})`);

        if (!structured.marketOverview) {
            return { statusCode: 500, body: 'Bedrock response missing required sections' };
        }
        // marketOverview.summary = verdict (코드로 복사) · 서사 검사 탈락이면 사유를 보여 주고 closingNarrative 만 고쳐 받는다(최대 2회, Vercel 판과 같은 계약)
        CLOSING.alignSummary(structured, reportEvidence);
        // 고침을 부르는 사유 = 근거 검사 + 권유어 의심(서빙 가드는 TS 라 Lambda 가 못 부른다, 관문 10241403). 저장 거부는 근거 검사만으로.
        const repairReasons = s => [...new Set([...CLOSING.evidenceProblems(s, reportEvidence), ...CLOSING.adviceSuspects(s)])];
        // 고친 판 채택: 근거 검사 수가 줄면 채택, 같으면 권유어 의심 수로 — 의심(넓게 잡음)이 근거 검사를 고친 판을 버리게 하지 않는다(관문 10241426)
        const score = s => [CLOSING.evidenceProblems(s, reportEvidence).length, CLOSING.adviceSuspects(s).length];
        const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
        let narrativeErrors = repairReasons(structured);
        const firstNarrativeErrors = narrativeErrors;
        // Lambda 는 15분 한도라 고침을 3회까지(Vercel 은 300초 예산 안에서 2회) — 10/24 Sonnet 4.6 모의 1/3 → 길이·언어 간 숫자 고침이 2회로 모자랐다
        for (let round = 0; round < 3 && narrativeErrors.length; round++) {
            try {
                const fixPrompt = CLOSING.narrativeRepairPrompt({ sessionDate: todayDate, evidence: reportEvidence, macroStr, narrative: structured.closingNarrative, reasons: narrativeErrors });
                const fix = await invokeOnce({ ...requestBody, max_tokens: 8000, temperature: 0.2, messages: [{ role: 'user', content: fixPrompt }] });
                const n = tryParse(extractJson(fix.text))?.closingNarrative;
                if (!n) continue;
                const candidate = CLOSING.alignSummary({ ...structured, marketOverview: { ...structured.marketOverview }, closingNarrative: n }, reportEvidence);
                if (better(score(candidate), score(structured))) { structured = candidate; narrativeErrors = repairReasons(candidate); }
            } catch (e) { console.warn('[CrossSector] narrative repair failed:', e.message); break; }
        }
        if (narrativeErrors.length) console.warn(`[CrossSector] 서사 사유 남음(${narrativeErrors.join(', ')}) — 근거 검사 실패만 저장 거부, 권유어는 서빙 가드가 판정`);
        narrativeErrors = CLOSING.evidenceProblems(structured, reportEvidence);
        if (narrativeErrors.length) return { statusCode: 500, body: JSON.stringify({ error: 'Closing narrative rejected', reasons: narrativeErrors, firstReasons: firstNarrativeErrors }) };

        // ★2026-10-11 keyLevels 출구 — 입력(macroStr + 지수 ETF 레벨 근거 줄)에 없는 수준은 걸러 낸다(예전 프롬프트 예시가 S&P 지지·저항 4칸을 요구해 매일 지어냈다). Vercel 판과 같은 규칙.
        //   이어서 라벨↔값 대조 + 범위 바 순서(Put Floor → Call Wall, 빠진 쪽은 입력의 값 그대로).
        const lvlOut = INDEXLEVELS.finalizeCrossSectorKeyLevels(structured, macroStr, indexRows);
        if (lvlOut.dropped) console.warn(`[CrossSector] keyLevels: 입력에 없는/라벨이 어긋난 수준 ${lvlOut.dropped}칸 제거`);
        if (lvlOut.added) console.warn(`[CrossSector] keyLevels: 범위 바 닻 ${lvlOut.added}칸을 입력의 레벨 그대로 채움`);

        // 7. Format Macros for display
        const macroIndicators = [
            redisVix ? { key: 'VIX', value: redisVix.price, changePct: redisVix.changePct, category: 'volatility' } : null,
            redisVix3m ? { key: 'VIX3M', value: redisVix3m.price, changePct: redisVix3m.changePct, category: 'volatility' } : null,
            idxSpx ? { key: 'S&P 500', value: idxSpx.price, changePct: idxSpx.changePct, category: 'equity' } : null,
            idxNasdaq ? { key: 'NASDAQ', value: idxNasdaq.price, changePct: idxNasdaq.changePct, category: 'equity' } : null,
            idxDow ? { key: 'DOW', value: idxDow.price, changePct: idxDow.changePct, category: 'equity' } : null,
            redisRut ? { key: 'Russell 2K', value: redisRut.price, changePct: redisRut.changePct, category: 'equity' } : null,
            redisTnx ? { key: 'US 10Y', value: redisTnx.price, changePct: redisTnx.changePct, category: 'bond' } : null,
            redisTlt ? { key: 'TLT', value: redisTlt.price, changePct: redisTlt.changePct, category: 'bond' } : null,
            redisGold ? { key: 'Gold', value: redisGold.price, changePct: redisGold.changePct, category: 'commodity' } : null,
            redisOil ? { key: 'WTI Oil', value: redisOil.price, changePct: redisOil.changePct, category: 'commodity' } : null,
            redisBtc ? { key: 'BTC', value: redisBtc.price, changePct: redisBtc.changePct, category: 'crypto' } : null,
            redisFng ? { key: 'Fear & Greed', value: Number(redisFng.value || redisFng.score || 50), changePct: 0, category: 'sentiment' } : null,
            redisUsdkrw ? { key: 'USD/KRW', value: redisUsdkrw.price, changePct: redisUsdkrw.changePct, category: 'fx' } : null,
            redisUsdjpy ? { key: 'USD/JPY', value: redisUsdjpy.price, changePct: redisUsdjpy.changePct, category: 'fx' } : null,
        ].filter(Boolean);

        const vixPrice = redisVix?.price || 0;
        const vixTermStructure = vixPrice && redisVix3m ? {
            vix: vixPrice,
            vix3m: redisVix3m.price,
            ratio: +(vixPrice / (redisVix3m.price || 1)).toFixed(3),
            state: vixPrice > redisVix3m.price ? 'BACKWARDATION' : 'CONTANGO',
        } : null;

        // 8. Save to Redis
        const today = todayDate;
        const briefData = {
            structured,
            reportEvidence,
            sectorInputs: sectorSummaries,
            reportSource: prompt,
            provider: 'bedrock',
            model: command.input.modelId,
            usage: attempt.usage,
            generatedAt: new Date().toISOString(),
            date: today,
            sectorCount: validSnapshots.length,
            macroSnapshot: macroStr,
            // 지수 ETF 옵션 구조 레벨(입력에 실제로 넣은 값) — 서빙 출구의 근거 줄(src/lib/ai/keyLevels sanitizeServedBrief) + 웹 범위 바 현재가(ETF 기준가)
            optionLevels: indexRows,
            levelsSnapshot: levelsBlock.ground,
            macroIndicators,
            vixTermStructure,
            upcomingEvents,
            version: 'v3',
        };

        const cacheKey = `postmarket:cross-brief-v3:${today}`;
        // 확인용 실행(event.dryRun === true, 수동 호출만) — 저장하지 않고 결과(keyLevels·입력 블록)만 돌려준다. 예약 실행(EventBridge)의 이벤트에는 이 값이 없다.
        if (event && event.dryRun === true) {
            return { statusCode: 200, body: JSON.stringify({ success: true, dryRun: true, cacheKey, elapsedMs: Date.now() - startTime, ...briefData,
                model: command.input.modelId, provider: 'bedrock', usage: attempt.usage, levelsBlock: levelsBlock.block }) };
        }
        await redisSet(cacheKey, briefData, 259200); // 72h TTL

        const elapsed = Date.now() - startTime;
        console.log(`✅ Generated Bloomberg-grade brief in ${elapsed}ms`);

        return { statusCode: 200, body: JSON.stringify({ success: true, cacheKey, elapsedMs: elapsed, macroIndicatorsCount: macroIndicators.length }) };

    } catch (e) {
        console.error('Lambda Error:', e);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
