// ═══════════════════════════════════════════════════════════════════
// SIGNUM Marketing Lambda — Self-contained AWS Lambda Handler
// Buffer 13채널 자동 발송 + TTS 영상 생성 + 이벤트 감지
// Vercel 의존성 ZERO — 100% AWS (Lambda + EventBridge + S3 + Polly)
// ═══════════════════════════════════════════════════════════════════

const { Redis } = require('@upstash/redis');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// ── Config ──────────────────────────────────────────────────────
const S3_BUCKET   = process.env.S3_MARKETING_BUCKET || 'signum-marketing';
const AWS_REGION  = process.env.AWS_REGION || 'us-east-1';
const DRY_RUN     = process.env.DRY_RUN === 'true';

// ── Redis Client (lazy — reads env at first use) ────────────────
let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

async function safeGet(key) {
  try { return await getRedis().get(key); } catch { return null; }
}
async function safeSet(key, value, ttl) {
  try {
    if (ttl) await getRedis().setex(key, ttl, typeof value === 'string' ? value : JSON.stringify(value));
    else await getRedis().set(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) { console.warn(`[Redis] set(${key}) failed:`, e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// CONTENT ENGINES — 콘텐츠 생성 로직 (3개국어)
// ═══════════════════════════════════════════════════════════════════

async function fetchMarketData() {
  const [spyRaw, qqqRaw, vixRaw, gexRaw] = await Promise.all([
    safeGet('market:realtime:SPY'), safeGet('market:realtime:QQQ'),
    safeGet('market:realtime:VIX'), safeGet('analysis:gex:regime'),
  ]);
  return {
    spy: extractNum(spyRaw, 'changePercent') || 0,
    qqq: extractNum(qqqRaw, 'changePercent') || 0,
    vix: extractNum(vixRaw, 'price') || 18,
    gexRegime: parseStr(gexRaw, 'regime') || 'neutral',
  };
}

function extractNum(d, f) { if (!d) return null; const p = typeof d === 'string' ? JSON.parse(d) : d; return p?.[f] ?? null; }
function parseStr(d, f) { if (!d) return null; if (typeof d === 'string') { try { return JSON.parse(d)?.[f] ?? d; } catch { return d; } } return d?.[f] ?? null; }

function generatePulse(data) {
  const { spy, qqq, vix, gexRegime } = data;
  const dir = spy >= 0 ? 'up' : 'down';
  const dirKo = spy >= 0 ? '상승' : '하락';
  const dirJa = spy >= 0 ? '上昇' : '下落';
  const vixLabel = vix > 25 ? '⚠️ HIGH' : vix > 20 ? '🟡 ELEVATED' : '🟢 LOW';

  return {
    en: { text: `📊 Market Pulse\n\n🔹 S&P 500: ${dir} ${Math.abs(spy).toFixed(2)}%\n🔹 NASDAQ: ${dir} ${Math.abs(qqq).toFixed(2)}%\n📉 VIX: ${vix.toFixed(1)} ${vixLabel}\n⚡ GEX: ${gexRegime.toUpperCase()}\n\nStructural data. Not financial advice.`, cta: 'liveStructure' },
    ko: { text: `📊 마켓 펄스\n\n🔹 S&P 500: ${Math.abs(spy).toFixed(2)}% ${dirKo}\n🔹 나스닥: ${Math.abs(qqq).toFixed(2)}% ${dirKo}\n📉 VIX: ${vix.toFixed(1)} ${vixLabel}\n⚡ GEX: ${gexRegime.toUpperCase()}\n\n구조적 데이터 기반. 투자 조언이 아닙니다.`, cta: 'liveStructure' },
    ja: { text: `📊 マーケットパルス\n\n🔹 S&P 500: ${Math.abs(spy).toFixed(2)}% ${dirJa}\n🔹 ナスダック: ${Math.abs(qqq).toFixed(2)}% ${dirJa}\n📉 VIX: ${vix.toFixed(1)} ${vixLabel}\n⚡ GEX: ${gexRegime.toUpperCase()}\n\n構造データ基盤。投資助言ではありません。`, cta: 'liveStructure' },
  };
}

function generateMorning(data) {
  const { spy, qqq, vix, gexRegime } = data;
  const outlook = vix > 25 ? 'Volatility elevated — structure defensive' : gexRegime === 'positive' ? 'Dealer gamma positive — dip-buying support likely' : 'Gamma neutral — directional risk balanced';
  const outlookKo = vix > 25 ? '변동성 확대 — 방어적 구조' : gexRegime === 'positive' ? '딜러 감마 양수 — 저가매수 지지 예상' : '감마 중립 — 방향성 위험 균형';
  const outlookJa = vix > 25 ? 'ボラティリティ上昇 — 防御構造' : gexRegime === 'positive' ? 'ディーラーガンマ陽 — 押し目買い支援予想' : 'ガンマ中立 — 方向リスク均衡';

  return {
    en: { text: `☀️ Morning Briefing\n\nPre-market snapshot:\n• SPY prev close: ${spy >= 0 ? '+' : ''}${spy.toFixed(2)}%\n• VIX: ${vix.toFixed(1)}\n• GEX: ${gexRegime}\n\n🔍 ${outlook}\n\nFull analysis at signumhq.com`, cta: 'fullReport' },
    ko: { text: `☀️ 모닝 브리핑\n\n프리마켓 스냅샷:\n• SPY 전일: ${spy >= 0 ? '+' : ''}${spy.toFixed(2)}%\n• VIX: ${vix.toFixed(1)}\n• GEX: ${gexRegime}\n\n🔍 ${outlookKo}\n\n전체 분석: signumhq.com`, cta: 'fullReport' },
    ja: { text: `☀️ モーニングブリーフィング\n\nプレマーケット:\n• SPY前日: ${spy >= 0 ? '+' : ''}${spy.toFixed(2)}%\n• VIX: ${vix.toFixed(1)}\n• GEX: ${gexRegime}\n\n🔍 ${outlookJa}\n\n全分析: signumhq.com`, cta: 'fullReport' },
  };
}

const EDUCATION_TOPICS = [
  { id: 'gex', en: '📚 What is GEX?\n\nGamma Exposure (GEX) measures dealer hedging pressure.\n\n• Positive GEX → Dealers buy dips, sell rips → Low volatility\n• Negative GEX → Dealers amplify moves → High volatility\n• Gamma Flip → Point where dealer behavior reverses\n\nUnderstand market microstructure at signumhq.com',
    ko: '📚 GEX란?\n\nGamma Exposure(GEX)는 딜러의 헤지 압력을 측정합니다.\n\n• 양수 GEX → 딜러가 하락 시 매수 → 저변동성\n• 음수 GEX → 딜러가 움직임 증폭 → 고변동성\n• Gamma Flip → 딜러 행동 반전 지점\n\n시장 미시구조를 signumhq.com에서 확인하세요',
    ja: '📚 GEXとは？\n\nGamma Exposure(GEX)はディーラーのヘッジ圧力を測定します。\n\n• 陽GEX → ディーラーが下落時に買い → 低ボラティリティ\n• 陰GEX → ディーラーが動きを増幅 → 高ボラティリティ\n• Gamma Flip → ディーラー行動反転点\n\n詳細: signumhq.com' },
  { id: 'dark_pool', en: '📚 Dark Pool Activity\n\nDark pools are private exchanges where large institutions trade.\n\n• High dark pool % → Institutions actively positioning\n• Low dark pool % → Retail-dominated flow\n• Block trades → Large single-order prints\n\nTrack institutional flow at signumhq.com',
    ko: '📚 다크풀 활동\n\n다크풀은 대형 기관이 거래하는 사설 거래소입니다.\n\n• 높은 다크풀 % → 기관 적극 포지셔닝\n• 낮은 다크풀 % → 개인 중심 플로우\n• 블록 트레이드 → 대량 단일 주문\n\n기관 플로우 추적: signumhq.com',
    ja: '📚 ダークプール活動\n\nダークプールは大手機関が取引する私設取引所です。\n\n• 高ダークプール% → 機関が積極的にポジショニング\n• 低ダークプール% → リテール主導\n• ブロック取引 → 大口注文\n\n詳細: signumhq.com' },
];

function generateEducation(topicId) {
  const topic = EDUCATION_TOPICS.find(t => t.id === (topicId || 'gex')) || EDUCATION_TOPICS[0];
  return {
    en: { text: topic.en, cta: 'liveStructure' },
    ko: { text: topic.ko, cta: 'liveStructure' },
    ja: { text: topic.ja, cta: 'liveStructure' },
  };
}

// ═══════════════════════════════════════════════════════════════════
// BUFFER CLIENT — 13채널 발송
// ═══════════════════════════════════════════════════════════════════

const CHANNELS = [
  { id: '69a92ae13f3b94a121198602', name: 'SignumHQ',          service: 'twitter',   tier: 1, lang: 'en' },
  { id: '69ca785caf47dacb696d62f3', name: 'SignumHQ_KR',       service: 'twitter',   tier: 1, lang: 'ko' },
  { id: '69ca6aa3af47dacb696d24c0', name: 'signumhq_official', service: 'instagram', tier: 2, lang: 'en' },
  { id: '69ca6b08af47dacb696d263d', name: 'signumhq_official', service: 'threads',   tier: 2, lang: 'en' },
  { id: '69ca7b31af47dacb696d6df6', name: 'signumhq_kr',      service: 'instagram', tier: 2, lang: 'ko' },
  { id: '69ca7b99af47dacb696d6f8d', name: 'signumhq_kr',      service: 'threads',   tier: 2, lang: 'ko' },
  { id: '69ca84bbaf47dacb696d9d0f', name: 'SIGNUM HQ',        service: 'bluesky',   tier: 2, lang: 'en' },
  { id: '69ca78a7af47dacb696d6446', name: 'SignumHQ_JP',       service: 'twitter',   tier: 3, lang: 'ja' },
  { id: '69ca7dbeaf47dacb696d7704', name: 'signumhq_jp',      service: 'instagram', tier: 3, lang: 'ja' },
  { id: '69ca7df5af47dacb696d77ad', name: 'signumhq_jp',      service: 'threads',   tier: 3, lang: 'ja' },
  { id: '69ca9432af47dacb696deb5c', name: 'Pinterest',         service: 'pinterest', tier: 3, lang: 'en' },
  { id: '69ca95e7af47dacb696df35a', name: 'signumhq',          service: 'tiktok',    tier: 3, lang: 'en' },
  { id: '69ca9615af47dacb696df427', name: 'SIGNUM HQ',         service: 'youtube',   tier: 3, lang: 'en' },
];

const CHAR_LIMITS = { twitter: 280, threads: 500, instagram: 2200, bluesky: 300, pinterest: 500, tiktok: 2200, youtube: 5000 };
const CTA_MAP = {
  en: { liveStructure: (u) => `📊 Live → signumhq.com/command?${u}`, fullReport: (u) => `📋 Report → signumhq.com/guardian?${u}` },
  ko: { liveStructure: (u) => `📊 실시간 → signumhq.com/command?${u}`, fullReport: (u) => `📋 리포트 → signumhq.com/guardian?${u}` },
  ja: { liveStructure: (u) => `📊 リアルタイム → signumhq.com/command?${u}`, fullReport: (u) => `📋 レポート → signumhq.com/guardian?${u}` },
};

function truncate(text, service) { const limit = CHAR_LIMITS[service] || 280; return text.length <= limit ? text : text.substring(0, limit - 3) + '...'; }

async function bufferPost(channelIds, text, dryRun) {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const orgId = process.env.BUFFER_ORGANIZATION_ID;
  if (!token || !orgId) { console.warn('[Buffer] No BUFFER_ACCESS_TOKEN — skipping (set it to enable)'); return { success: true, skipped: true, error: 'No credentials' }; }
  if (dryRun) { console.log(`[Buffer] DRY_RUN: ${channelIds.length}ch "${text.substring(0, 80)}..."`); return { success: true, dryRun: true }; }

  try {
    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        query: `mutation($input: PostCreateInput!) { postCreate(input: $input) { ... on PostCreateSuccess { post { id status } } ... on CoreError { message } } }`,
        variables: { input: { organizationId: orgId, channelIds, content: { text } } },
      }),
    });
    const json = await res.json();
    const post = json?.data?.postCreate?.post;
    if (post?.id) return { success: true, postId: post.id };
    return { success: false, error: json?.data?.postCreate?.message || 'Unknown' };
  } catch (e) { return { success: false, error: e.message }; }
}

async function dispatchToBuffer(content, campaign, dryRun) {
  const results = [];
  for (const lang of ['en', 'ko', 'ja']) {
    const langContent = content[lang];
    if (!langContent?.text) continue;
    const channels = CHANNELS.filter(c => c.lang === lang);
    const ctaFn = CTA_MAP[lang]?.[langContent.cta];
    for (const ch of channels) {
      const utm = `utm_source=${ch.service}&utm_medium=social&utm_campaign=${campaign}`;
      const cta = ctaFn ? ctaFn(utm) : '';
      const isShort = ch.service === 'twitter' || ch.service === 'bluesky';
      const fullText = isShort ? langContent.text : `${langContent.text}\n\n${cta}`;
      const text = truncate(fullText, ch.service);
      const result = await bufferPost([ch.id], text, dryRun);
      results.push({ channel: ch.name, service: ch.service, lang, ...result });
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════
// EVENT DETECTION — GEX Flip / VIX Spike / SEC 8-K
// ═══════════════════════════════════════════════════════════════════

async function detectEvents() {
  const events = [];

  // GEX Flip
  const curGex = parseStr(await safeGet('analysis:gex:regime'), 'regime');
  const prevGex = await safeGet('marketing:event:gex:previous');
  if (curGex) await safeSet('marketing:event:gex:previous', curGex, 86400);
  if (curGex && prevGex && curGex !== prevGex) {
    const flip = (prevGex === 'positive' && curGex === 'negative') || (prevGex === 'negative' && curGex === 'positive');
    if (flip) events.push({ ticker: 'SPY', type: 'gex_shift', details: `GEX flipped ${prevGex.toUpperCase()} → ${curGex.toUpperCase()}` });
  }

  // VIX Spike (>15% change)
  const vixRaw = await safeGet('market:realtime:VIX');
  if (vixRaw) {
    const vix = typeof vixRaw === 'string' ? JSON.parse(vixRaw) : vixRaw;
    const chg = vix?.changePercent ?? vix?.changePct;
    if (chg != null && Math.abs(chg) >= 15) {
      events.push({ ticker: 'VIX', type: 'vix_spike', details: `VIX ${chg > 0 ? 'surged' : 'dropped'} ${Math.abs(chg).toFixed(1)}%` });
    }
  }

  return events;
}

function generateEventContent(event, data) {
  return {
    en: { text: `🚨 ${event.type === 'gex_shift' ? 'GEX FLIP' : 'VIX ALERT'}\n\n${event.details}\n\nSPY: ${data.spy >= 0 ? '+' : ''}${data.spy.toFixed(2)}% | VIX: ${data.vix.toFixed(1)}\n\nTrack live at signumhq.com`, cta: 'liveStructure' },
    ko: { text: `🚨 ${event.type === 'gex_shift' ? 'GEX 전환' : 'VIX 경보'}\n\n${event.details}\n\nSPY: ${data.spy >= 0 ? '+' : ''}${data.spy.toFixed(2)}% | VIX: ${data.vix.toFixed(1)}\n\n실시간 추적: signumhq.com`, cta: 'liveStructure' },
    ja: { text: `🚨 ${event.type === 'gex_shift' ? 'GEXフリップ' : 'VIXアラート'}\n\n${event.details}\n\nSPY: ${data.spy >= 0 ? '+' : ''}${data.spy.toFixed(2)}% | VIX: ${data.vix.toFixed(1)}\n\nリアルタイム: signumhq.com`, cta: 'liveStructure' },
  };
}

// ═══════════════════════════════════════════════════════════════════
// TTS + VIDEO — AWS Polly + S3
// ═══════════════════════════════════════════════════════════════════

const VOICES = {
  en: { voiceId: 'Matthew', engine: 'neural', langCode: 'en-US' },
  ko: { voiceId: 'Seoyeon', engine: 'neural', langCode: 'ko-KR' },
  ja: { voiceId: 'Takumi',  engine: 'neural', langCode: 'ja-JP' },
};

async function synthesizeTTS(text, lang, dryRun) {
  if (dryRun) { console.log(`[TTS] DRY_RUN: ${lang} "${text.substring(0, 60)}..."`); return { audioUrl: '', dryRun: true }; }
  try {
    const voice = VOICES[lang];
    const polly = new PollyClient({ region: AWS_REGION });
    const result = await polly.send(new SynthesizeSpeechCommand({ Text: text, VoiceId: voice.voiceId, Engine: voice.engine, LanguageCode: voice.langCode, OutputFormat: 'mp3' }));
    const chunks = []; for await (const c of result.AudioStream) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const key = `tts/${lang}/${new Date().toISOString().split('T')[0]}/${Date.now()}.mp3`;
    const s3 = new S3Client({ region: AWS_REGION });
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buf, ContentType: 'audio/mpeg', ACL: 'public-read' }));
    return { audioUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`, dryRun: false };
  } catch (e) { console.error('[TTS]', e.message); return { audioUrl: '', dryRun: true }; }
}

function generateVideoHTML(data, lang) {
  const { spy, qqq, vix, gexRegime } = data;
  const up = spy >= 0;
  const accent = up ? '#00d4aa' : '#ff4757';
  const arrow = up ? '▲' : '▼';
  const bg = up ? 'linear-gradient(135deg,#0a1628,#0f3460)' : 'linear-gradient(135deg,#1a0a0a,#3d1010)';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:1080px;height:1920px;background:${bg};font-family:Inter,sans-serif;color:#fff}.c{padding:80px 60px;height:100%;display:flex;flex-direction:column;justify-content:space-between}.logo{font-size:28px;letter-spacing:8px;opacity:.5}.title{font-size:72px;font-weight:800;margin:40px 0}.title span{color:${accent}}.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:48px;margin:20px 0}.cl{font-size:24px;opacity:.5;letter-spacing:2px;margin-bottom:12px}.cv{font-size:64px;font-weight:700}.cc{font-size:36px;color:${accent};margin-top:8px}.row{display:flex;gap:24px}.row .card{flex:1}.badge{display:inline-block;background:${accent};color:#000;padding:12px 32px;border-radius:50px;font-size:28px;font-weight:700}.ft{text-align:center}.ft .b{font-size:36px;font-weight:700;letter-spacing:4px}.ft .s{font-size:22px;opacity:.4;margin-top:8px}</style></head><body><div class="c"><div><div class="logo">SIGNUM HQ</div><div class="title">MARKET PULSE <span>${arrow}</span></div></div><div><div class="row"><div class="card"><div class="cl">S&P 500</div><div class="cv">${Math.abs(spy).toFixed(2)}%</div><div class="cc">${arrow}</div></div><div class="card"><div class="cl">NASDAQ</div><div class="cv">${Math.abs(qqq).toFixed(2)}%</div><div class="cc">${arrow}</div></div></div><div class="card"><div class="cl">VIX</div><div class="cv" style="color:${vix>25?'#ff4757':vix>20?'#ffa502':'#00d4aa'}">${vix.toFixed(1)}</div></div><div class="card" style="text-align:center"><div class="cl">GEX REGIME</div><div style="margin-top:16px"><span class="badge">${gexRegime.toUpperCase()}</span></div></div></div><div class="ft"><div class="b">SIGNUM HQ</div><div class="s">signumhq.com</div></div></div></body></html>`;
}

async function renderVideo(data, lang, dryRun) {
  if (dryRun) { console.log(`[Video] DRY_RUN: ${lang}`); return { status: 'dry_run' }; }
  try {
    const narration = `Market Pulse. S&P 500 ${data.spy >= 0 ? 'up' : 'down'} ${Math.abs(data.spy).toFixed(2)} percent. VIX at ${data.vix.toFixed(1)}. GEX regime ${data.gexRegime}.`;
    const tts = await synthesizeTTS(narration, lang, false);
    const html = generateVideoHTML(data, lang);
    const dateKey = new Date().toISOString().split('T')[0];
    const s3 = new S3Client({ region: AWS_REGION });
    const htmlKey = `videos/pulse/${lang}/${dateKey}/${Date.now()}.html`;
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: htmlKey, Body: html, ContentType: 'text/html', ACL: 'public-read' }));
    const manifest = { type: 'pulse', lang, dateKey, htmlUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${htmlKey}`, ttsUrl: tts.audioUrl, status: 'ready', createdAt: new Date().toISOString() };
    const mKey = `videos/manifest/${dateKey}-pulse-${lang}.json`;
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: mKey, Body: JSON.stringify(manifest, null, 2), ContentType: 'application/json' }));
    return { status: 'uploaded', htmlUrl: manifest.htmlUrl, ttsUrl: tts.audioUrl, manifestUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${mKey}` };
  } catch (e) { console.error('[Video]', e.message); return { status: 'error', error: e.message }; }
}

// ═══════════════════════════════════════════════════════════════════
// LAMBDA HANDLER — Single entry point, action by event type
// ═══════════════════════════════════════════════════════════════════

exports.handler = async (event) => {
  const action = event.action || event.type || 'pulse';
  const dryRun = event.dryRun ?? DRY_RUN;
  const dateKey = new Date().toISOString().split('T')[0];

  console.log(`[Marketing] action=${action} dryRun=${dryRun} date=${dateKey}`);

  try {
    switch (action) {

      // ── Daily Pulse ──────────────────────────────
      case 'pulse': {
        const data = await fetchMarketData();
        const content = generatePulse(data);
        await safeSet(`marketing:pulse:${dateKey}`, content, 86400);
        const results = await dispatchToBuffer(content, 'pulse', dryRun);
        return { success: true, action, dryRun, channels: results.length, successful: results.filter(r => r.success).length, results };
      }

      // ── Morning Briefing ─────────────────────────
      case 'morning': {
        const data = await fetchMarketData();
        const content = generateMorning(data);
        await safeSet(`marketing:morning:${dateKey}`, content, 86400);
        const results = await dispatchToBuffer(content, 'morning', dryRun);
        return { success: true, action, dryRun, channels: results.length, successful: results.filter(r => r.success).length, results };
      }

      // ── Education ────────────────────────────────
      case 'education': {
        const topicIdx = new Date().getDay() % EDUCATION_TOPICS.length;
        const content = generateEducation(EDUCATION_TOPICS[topicIdx].id);
        await safeSet(`marketing:education:${dateKey}`, content, 86400 * 7);
        const results = await dispatchToBuffer(content, 'education', dryRun);
        return { success: true, action, dryRun, channels: results.length, successful: results.filter(r => r.success).length, results };
      }

      // ── Event Detect ─────────────────────────────
      case 'event-detect': {
        const dailyCount = parseInt(await safeGet(`marketing:event:count:${dateKey}`) || '0');
        if (dailyCount >= 3) return { success: true, skipped: true, reason: 'Daily limit (3)' };
        const cooldown = await safeGet('marketing:event:last_time');
        if (cooldown && Date.now() - parseInt(cooldown) < 30 * 60 * 1000) return { success: true, skipped: true, reason: 'Cooldown' };
        const events = await detectEvents();
        if (events.length === 0) return { success: true, skipped: true, reason: 'No events' };
        const ev = events[0];
        const data = await fetchMarketData();
        const content = generateEventContent(ev, data);
        await safeSet(`marketing:event:${dateKey}`, content, 86400);
        await safeSet(`marketing:event:sent:${ev.type}:${ev.ticker}:${dateKey}`, '1', 86400);
        await safeSet('marketing:event:last_time', String(Date.now()), 1800);
        await safeSet(`marketing:event:count:${dateKey}`, String(dailyCount + 1), 86400);
        const results = await dispatchToBuffer(content, 'event', dryRun);
        return { success: true, action, event: ev, dryRun, results };
      }

      // ── Video Render ─────────────────────────────
      case 'video': {
        const data = await fetchMarketData();
        const results = {};
        for (const lang of ['en', 'ko', 'ja']) {
          results[lang] = await renderVideo(data, lang, dryRun);
        }
        return { success: true, action, dryRun, results };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (err) {
    console.error('[Marketing] Error:', err);
    return { success: false, error: err.message };
  }
};

// ── CLI support for testing ─────────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
  // Re-init config after env load
  const action = process.argv[2] || 'pulse';
  const dryRun = process.argv[3] !== 'live';
  console.log(`\n🚀 Running marketing action: ${action} (${dryRun ? 'DRY_RUN' : 'LIVE'})\n`);
  exports.handler({ action, dryRun }).then(r => console.log('\n✅ Result:', JSON.stringify(r, null, 2))).catch(e => console.error('❌', e));
}
