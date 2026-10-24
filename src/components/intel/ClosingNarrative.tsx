import type { ClosingNarrative as Narrative } from '@/lib/ai/closingReport';

const COPY = {
    ko: ['오늘 한 줄 판정', '무슨 일이 있었나', '왜', '그래서 지표는', '내일 볼 것', '리포트 읽기'],
    en: ["Today's verdict", 'What happened', 'Why', 'What the indicators mean', 'What to watch next', 'Read report'],
    ja: ['今日の判定', '何が起きたか', 'なぜ', '指標の意味', '次に注目すること', 'レポートを読む'],
};

/** The whole generated text remains reachable; no ellipsis, clamp or clipping. */
export function ClosingNarrative({ narrative, locale }: { narrative: Narrative; locale: string }) {
    const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
    const copy = COPY[loc];
    const paragraph = (field: 'verdict' | 'whatHappened' | 'why' | 'indicators' | 'watchNext', i: number) => (
        <div key={field} style={{ margin: '0 0 12px', overflowWrap: 'anywhere' }}>
            <strong style={{ fontSize: '0.9em' }}>{copy[i]}</strong>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-line', lineHeight: 1.75 }}>{narrative[field][loc]}</p>
        </div>
    );
    return <div>
        {paragraph('verdict', 0)}
        {paragraph('whatHappened', 1)}
        <details>
            <summary style={{ cursor: 'pointer', marginBottom: 12 }}>{copy[5]}</summary>
            {paragraph('why', 2)}
            {paragraph('indicators', 3)}
            {paragraph('watchNext', 4)}
        </details>
    </div>;
}
