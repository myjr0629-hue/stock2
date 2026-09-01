#!/usr/bin/env node
// ============================================================================
// make-narration — 랭킹 영상에 «음성»을 붙인다.
//
// 왜 (2026-09-01 실측):
//   우리가 만든 영상은 전부 **오디오 스트림이 아예 없다**. 틱톡·쇼츠는
//   무음 영상을 밀어주지 않고, 시청자도 소리 없는 화면을 넘긴다.
//   실측: 틱톡 50회 조회 · 좋아요 0 · 댓글 0. 노출은 됐는데 반응이 0이다.
//   유튜브 영어판이 조회당 5초에 끊기는 것도 같은 원인일 수 있다.
//
//   ElevenLabs 키가 .env.local 에 있고 Creator 플랜에 5.9만 자가 남아 있었다.
//   놀고 있던 유료 자원이다 — 이걸로 «말하는» 영상을 만든다.
//
// 실행: node scripts/make-narration.js <spec.json> <out.mp3> [ko|en|ja]
// ============================================================================
const fs = require('fs');
const path = require('path');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = process.env.ELEVENLABS_API_KEY;
// 다국어 모델 — 한국어·일본어를 같은 음성으로 읽는다.
const MODEL = 'eleven_multilingual_v2';
// Matilda: knowledgable/professional. 금융 데이터를 읽을 때 과장 없이 들린다.
// ⚠️ voice_id 는 «전체» 를 써야 한다 — 목록에서 잘라 본 앞 12자로는 404 다.
const VOICE = process.env.NARRATION_VOICE || 'XrExE9yKIg1WjnnlVkGX';

const SPEC = process.argv[2];
const OUT = process.argv[3] || '/tmp/narration.mp3';
const LOC = (process.argv[4] || 'ko').toLowerCase();

/** 대본 — 화면에 있는 숫자만 읽는다. 화면과 말이 어긋나면 그게 곧 오보다. */
function scriptFrom(spec, loc) {
    const cards = (spec.scenes || []).filter((s) => s.rank && s.symbol);
    if (!cards.length) return null;
    const L = {
        ko: {
            open: (n) => `오늘 미국 시장에서 평소와 가장 달랐던 ${n}개 종목입니다.`,
            item: (r, t, lab, today, usual, mult) =>
                `${r}위 ${t}. ${lab}이 오늘 ${today}, 평소 ${usual}. ${mult}입니다.`,
            close: '절대 크기가 아니라 그 종목 자신의 평소와 비교한 순위입니다. 전부 무료 앱에서 볼 수 있습니다.',
        },
        en: {
            open: (n) => `The ${n} US stocks that moved furthest from their own normal today.`,
            item: (r, t, lab, today, usual, mult) =>
                `Number ${r}, ${t}. ${lab} is ${today} today, against a usual ${usual}. That's ${mult}.`,
            close: 'Not the biggest names — the ones furthest from their own baseline. All free in the app.',
        },
        ja: {
            open: (n) => `本日、平常から最も外れた米国株${n}銘柄です。`,
            item: (r, t, lab, today, usual, mult) =>
                `${r}位、${t}。${lab}が本日${today}、平常は${usual}。${mult}です。`,
            close: '絶対値ではなく、その銘柄自身の平常と比べた順位です。すべて無料アプリで見られます。',
        },
    }[loc] || L?.en;

    const parts = [L.open(cards.length)];
    // 화면 순서(5위→1위)를 그대로 따른다 — 말이 화면보다 앞서거나 뒤처지면 안 된다.
    for (const c of cards) {
        const st = c.stats || [];
        const today = st[0]?.v ?? '', usual = st[1]?.v ?? '', mult = st[2]?.v ?? '';
        parts.push(L.item(c.rank, c.symbol, c.symbolSub || '', today, usual, mult));
    }
    parts.push(L.close);
    return parts.join(' ');
}

(async () => {
    if (!KEY) { console.error('ELEVENLABS_API_KEY 없음'); process.exit(1); }
    const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
    const text = scriptFrom(spec, LOC);
    if (!text) { console.error('대본을 만들 카드가 없다'); process.exit(2); }
    console.error(`[대본 ${text.length}자] ${text.slice(0, 90)}…`);

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
        method: 'POST',
        headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text, model_id: MODEL,
            // 데이터 낭독이므로 안정성을 높이고 과장을 줄인다
            voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
        }),
    });
    if (!r.ok) { console.error('TTS 실패', r.status, (await r.text()).slice(0, 200)); process.exit(3); }
    fs.writeFileSync(OUT, Buffer.from(await r.arrayBuffer()));
    console.log(OUT, fs.statSync(OUT).size, 'bytes ·', text.length, '자');
})();
