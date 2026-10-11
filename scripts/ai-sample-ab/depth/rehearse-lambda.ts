/**
 * Lambda 리허설(크로스섹터) — «진짜 Lambda 핸들러(scripts/lambda-cross-sector/index.js)»를 금요일 시계 + 운영 Redis·Supabase 실데이터로 끝까지 돌린다.
 *   화면이 읽는 v3 저장본은 AWS Lambda(Bedrock Sonnet 4.6)가 만든다 — Vercel 라우트(rehearse-route.ts, Haiku 5.5 사다리)와 다른 모델·다른 경로라서 따로 본다.
 *   저장은 하네스 fetch 가드가 막는다(EC2 프록시·Upstash 쓰기 차단) — 막기 직전에 briefData 를 가로채 keyLevels 를 읽고, Bedrock 응답 원문도 가로채
 *   «출구 필터 전»에 모델이 쓴 칸까지 센다(입력에 없는 수준이 몇 칸이었나).
 *   사용: rehearse-lambda.ts <ENVFILE(전체 운영 env 임시 사본)> [N=3] [LAMBDA_DIR=scripts/lambda-cross-sector]
 *         LAMBDA_DIR 에 수리 전 코드(옛 워크트리)를 주면 같은 입력·같은 모델로 «전/후»를 나란히 볼 수 있다.
 * 출력: 회차마다 JSON 한 줄(원문 칸·최종 칸·제거/채움 경고) + 마지막에 요약 JSON.
 */
import path from 'node:path';
import { bootHarness, setClock } from '../core';
import { isGroundedLevel, sanitizeServedBrief } from '@/lib/ai/keyLevels';

const [envFile, nArg, dirArg] = process.argv.slice(2);
bootHarness({ envFile });
const FRI_CLOSE = '2026-10-09T21:50:00Z';

(async () => {
    const dir = path.resolve(dirArg || 'scripts/lambda-cross-sector');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bedrock = require('@aws-sdk/client-bedrock-runtime');   // Lambda 가 쓰는 같은 모듈(심링크 node_modules 의 실제 경로가 같다)
    const rawTexts: string[] = [];
    const origSend = bedrock.BedrockRuntimeClient.prototype.send;
    bedrock.BedrockRuntimeClient.prototype.send = async function (cmd: any) {
        const r = await origSend.call(this, cmd);
        try { const j = JSON.parse(new TextDecoder().decode(r.body)); rawTexts.push(String(j?.content?.[0]?.text || '')); } catch { /* 원문을 못 읽어도 실행은 계속 */ }
        return r;
    };
    // 저장 가로채기(차단은 하네스 가드가 한다)
    const guarded = globalThis.fetch;
    let saved: any = null;
    (globalThis as any).fetch = async (input: any, init: any = {}) => {
        try {
            const url = typeof input === 'string' ? input : String(input?.url || input);
            if (String(init?.method || 'GET').toUpperCase() === 'POST' && /\/set$/.test(new URL(url).pathname) && typeof init.body === 'string') {
                const b = JSON.parse(init.body);
                if (String(b.key).startsWith('postmarket:cross-brief-v3:')) saved = b.value;
            } else if (String(init?.method || 'GET').toUpperCase() === 'POST' && /\/set\//.test(url) && typeof init.body === 'string') {
                const v = JSON.parse(init.body);
                if (v && v.structured && decodeURIComponent(url).includes('postmarket:cross-brief-v3:')) saved = saved || v;
            }
        } catch { /* 무시 */ }
        return guarded(input, init);
    };

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lambda = require(path.join(dir, 'index.js'));
    const warns: string[] = [];
    const origWarn = console.warn; console.warn = (...a: any[]) => { warns.push(a.map(String).join(' ')); origWarn(...a); };
    const logs: string[] = [];
    const origLog = console.log; console.log = (...a: any[]) => { logs.push(a.map(String).join(' ')); };

    const rounds = Number(nArg) || 3;
    const out: any[] = [];
    for (let i = 0; i < rounds; i++) {
        warns.length = 0; logs.length = 0; rawTexts.length = 0; saved = null;
        setClock(FRI_CLOSE);
        const t0 = Date.now();
        const r = await lambda.handler({}, {});
        setClock(null);
        const ms = Date.now() - t0;
        let raw: any[] = [];
        try { const txt = rawTexts[rawTexts.length - 1] || ''; const s = txt.indexOf('{'), e = txt.lastIndexOf('}'); raw = JSON.parse(txt.slice(s, e + 1))?.outlook?.keyLevels || []; } catch { /* 원문 파싱 실패 */ }
        const fin: any[] = saved?.structured?.outlook?.keyLevels || [];
        const ground = `${saved?.macroSnapshot || ''}\n${saved?.levelsSnapshot || ''}`;
        // 화면이 받는 최종 칸 = 저장본 → 서빙 출구(GET 의 sanitizeServedBrief)를 거친 결과
        const served: any[] = saved ? (sanitizeServedBrief(saved).brief as any).structured?.outlook?.keyLevels || [] : [];
        const row = {
            round: i + 1, status: r?.statusCode, ms,
            served: served.map((k: any) => `${k.label}=${k.value}`),
            raw: raw.map((k: any) => `${k.label}=${k.value}`),
            rawUngrounded: raw.filter((k: any) => !isGroundedLevel(k, ground)).length,
            final: fin.map((k: any) => `${k.label}=${k.value}`),
            finalUngrounded: fin.filter((k: any) => !isGroundedLevel(k, ground)).length,
            warns: warns.filter((w) => /keyLevels/.test(w)),
            indexLevelsLog: logs.filter((l) => /index levels/.test(l)),
            hasLevelsBlock: !!saved?.levelsSnapshot,
        };
        origLog(JSON.stringify(row));
        out.push(row);
    }
    origLog(JSON.stringify({
        dir, rounds, ok: out.filter((x) => x.status === 200).length,
        finalCells: out.map((x) => x.final.length),
        servedCells: out.map((x) => x.served.length),
        servedRunsWithTwoPlus: out.filter((x) => x.served.length >= 2).length,
        rawUngroundedTotal: out.reduce((a, x) => a + x.rawUngrounded, 0), rawCellsTotal: out.reduce((a, x) => a + x.raw.length, 0),
        finalUngroundedTotal: out.reduce((a, x) => a + x.finalUngrounded, 0),
        runsWithTwoPlusCells: out.filter((x) => x.final.length >= 2).length,
        levelsSeen: [...new Set(out.flatMap((x) => x.final))],
    }, null, 1));
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
