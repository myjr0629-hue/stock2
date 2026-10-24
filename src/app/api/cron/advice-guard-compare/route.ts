/**
 * PREVIEW ONLY(병합 금지) — T25 권유어 가드 실모델 비교. 운영과 같은 사다리(callBedrock)·같은 TRI_SYSTEM·같은 출구(gateText)로 첫 생성만 하고,
 * 각 언어 글을 새 가드(배포본 adviceHit)와 옛 가드(origin/main 사본 adviceGuardOld)로 함께 판정한다. Redis·DB 쓰기 0(gateText 는 순수 검사).
 * 입력(프롬프트·숫자)은 호출자가 운영 실입력으로 만든 것을 그대로 받는다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { triLangGate } from '@/lib/ai/ladderGates';
import { _rotationCompareHooks as H } from '@/services/guardian/intelligenceNode';
import { adviceHit } from '@/lib/ai/adviceGuard';
import { adviceHit as oldAdviceHit } from '@/lib/ai/adviceGuardOld';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const LOCALES = ['ko', 'en', 'ja'] as const;
const NAMES = { ko: 'KOREAN', en: 'ENGLISH', ja: 'JAPANESE' } as const;

type Job = { type: 'reality' | 'rotation'; label: string; nums: any; prompts: Record<'ko' | 'en' | 'ja', string>; reps: number };

async function once(job: Job) {
    const blocks = LOCALES.map((l) => `=== ${NAMES[l]} (${l}) INSTRUCTIONS ===\n${job.prompts[l] + H.tokenRulesFor(job.type, l, job.nums)}`).join('\n\n');
    const user = `Write the analysis once, in three languages, following each language's own instruction block below. All three must carry the same facts and the same placeholders. Return the JSON object only.\n\n${blocks}`;
    const t0 = Date.now();
    try {
        const r = await callBedrock({ modelId: MODELS.HAIKU_35, system: H.TRI_SYSTEM, userPrompt: user, maxTokens: 3500, temperature: 0.2, timeoutMs: 32000,
            fallbackModel: null, jsonPrefill: false, label: `Guardian/${job.type.toUpperCase()}_TRI`, expectJson: true, locale: 'multi', validate: triLangGate() });
        const raw = H.restoreSectorLabels(H.parseTriJson(r.text || '')) as Partial<Record<string, string>> | null;
        const out = LOCALES.map((l) => {
            if (!raw?.[l]) return { locale: l, text: '', reasons: ['model:failed'], newAdvice: null, oldAdvice: null };
            const g = H.gateText(job.type, H.tokenizeInsight(job.type, raw[l] as string, job.nums), l, job.nums, job.nums, true, job.prompts[l]);
            return { locale: l, text: g.text, reasons: g.reasons, newAdvice: adviceHit(g.text), oldAdvice: oldAdviceHit(g.text) };
        });
        return { ok: true, ms: Date.now() - t0, model: r.model, provider: r.provider, out };
    } catch (e: any) {
        return { ok: false, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 120), out: [] };
    }
}

export async function POST(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json() as { jobs: Job[] };
    const deadline = Date.now() + 250_000;
    const results: any[] = [];
    for (const job of body.jobs || []) {
        for (let rep = 1; rep <= Math.min(job.reps || 1, 6); rep += 3) {
            if (Date.now() > deadline) break;
            const n = Math.min(3, (job.reps || 1) - rep + 1);
            const batch = await Promise.all(Array.from({ length: n }, () => once(job)));
            batch.forEach((b, i) => results.push({ type: job.type, label: job.label, rep: rep + i, ...b }));
        }
    }
    return NextResponse.json({ results });
}
