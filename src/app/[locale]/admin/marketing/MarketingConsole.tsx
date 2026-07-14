'use client';

import { useState, useEffect, useCallback } from 'react';
import './marketing-console.css';

// ============================================================================
// 마케팅 콘솔 (Phase 1.5) — Donezo 라이트 테마, 6탭 세분화, 전체 한글.
// 독립: SIGNUM 다크 앱과 컴포넌트/CSS 공유 0.
// 데이터는 아직 미연결(샘플 표기) — 엔진은 Phase 2~5에서 각 탭에 연결.
// ============================================================================

type TabKey = 'today' | 'generate' | 'x' | 'reddit' | 'metrics' | 'assets';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'generate', label: '생성' },
  { key: 'x', label: 'X 운용' },
  { key: 'reddit', label: '레딧' },
  { key: 'metrics', label: '성과' },
  { key: 'assets', label: '자산' },
];

const TAB_META: Record<TabKey, { title: string; sub: string }> = {
  today: { title: '오늘', sub: '감지 사건 · 승인 대기 초안 · 채널별 볼륨 캡 · 데드맨 · 할 일 롤업' },
  generate: { title: '생성', sub: '캡처 업로드 → 숫자 판독 → 채널별 네이티브 글 4종 + 카드 + 린트 검사' },
  x: { title: 'X 운용', sub: '답글 타깃 스캔 · 초안 큐 · 60분 답글 타이머 · 내 포스트 인박스 (@signumhq / @signumhq_jp)' },
  reddit: { title: '레딧', sub: '스레드 발굴 · 밸류 코멘트 초안 · 카르마/계정나이 트래커 (게시는 사람 재작성)' },
  metrics: { title: '성과', sub: '콜드스타트 퍼널 — 답글수·프로필클릭·팔로워증감 (조회수는 히어로 지표 아님)' },
  assets: { title: '자산', sub: 'VERDICT 스코어보드 · 포스트 카드 4종 · pSEO 레벨페이지 · 계정 상태' },
};

const SAMPLE = () => <span className="mkc-sample">샘플·미연결</span>;

export default function MarketingConsole({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<TabKey>('today');
  const initial = (adminEmail[0] || 'S').toUpperCase();

  return (
    <div className="mkc-root">
      {/* 사이드바 */}
      <aside className="mkc-side">
        <div className="mkc-logo">
          <span className="mkc-logo-dot" />
          SIGNUM MKT
        </div>

        <div className="mkc-side-label">콘솔</div>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`mkc-nav-btn${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}

        <div className="mkc-side-promo">
          <strong>초안 전용 파이프라인</strong>
          <span className="mkc-promo-note">
            발행은 항상 사람 클릭. 이 콘솔에 자동 발행 경로는 존재하지 않습니다.
          </span>
        </div>
      </aside>

      {/* 메인 */}
      <div className="mkc-main">
        <header className="mkc-topbar">
          <input className="mkc-search" placeholder="티커 · 초안 · 스레드 검색…" />
          <div className="mkc-top-right">
            <div className="mkc-admin-chip">
              <span className="mkc-avatar">{initial}</span>
              {adminEmail}
            </div>
          </div>
        </header>

        <main className="mkc-content">
          <div className="mkc-head-row">
            <div>
              <h1 className="mkc-h1">{TAB_META[tab].title}</h1>
              <p className="mkc-sub">{TAB_META[tab].sub}</p>
            </div>
            <div className="mkc-head-actions">
              <button className="mkc-btn mkc-btn-ghost">새로고침</button>
            </div>
          </div>

          {tab === 'today' && <TodayTab />}
          {tab === 'generate' && <GenerateTab />}
          {tab === 'x' && <XOpsTab />}
          {tab === 'reddit' && <RedditTab />}
          {tab === 'metrics' && <MetricsTab />}
          {tab === 'assets' && <AssetsTab />}
        </main>
      </div>
    </div>
  );
}

/* ===================== ① 오늘 ===================== */
function TodayTab() {
  return (
    <>
      <div className="mkc-kpis">
        <div className="mkc-kpi is-hero">
          <span className="mkc-kpi-label">볼륨 캡 · X-US</span>
          <span className="mkc-kpi-value">0 / 3</span>
          <span className="mkc-kpi-note">하루 상한 3 — 성과 나빠도 절대 안 늘림</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">승인 대기 초안</span>
          <span className="mkc-kpi-value">—</span>
          <span className="mkc-kpi-note">생성 엔진 연결 시 집계 · Phase 2</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">감지 사건</span>
          <span className="mkc-kpi-value">—</span>
          <span className="mkc-kpi-note">사건 탐지 크론 · Phase 5</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">유입 히트 (?from=)</span>
          <span className="mkc-kpi-value">—</span>
          <span className="mkc-kpi-note">/app 패치 · Phase 3</span>
        </div>
      </div>

      {/* 채널별 볼륨 현황 */}
      <div className="mkc-section">
        <h2>채널별 오늘 현황</h2>
        <span className="mkc-section-note">사건 밀도가 볼륨을 정한다 (시계 아님)</span>
        <span className="mkc-section-right">{SAMPLE()}</span>
      </div>
      <div className="mkc-cols-3">
        {[
          { ch: 'X-US · @signumhq', cur: 0, note: '평시 1 · 사건일 2 · 무사건 0~1' },
          { ch: 'X-JP · @signumhq_jp', cur: 0, note: 'US와 같은 사건, ja 네이티브' },
          { ch: 'Bluesky', cur: 0, note: 'X 미러 1 (재사용 합법)' },
        ].map((c) => (
          <div className="mkc-card-box" key={c.ch}>
            <div className="mkc-panel-title" style={{ fontSize: 13 }}>{c.ch}</div>
            <div style={{ fontSize: 26, fontWeight: 800, margin: '6px 0' }}>
              {c.cur} <span style={{ fontSize: 14, color: 'var(--mkc-ink-2)' }}>/ 3</span>
            </div>
            <div className="mkc-muted" style={{ fontSize: 11.5 }}>{c.note}</div>
          </div>
        ))}
      </div>

      <div className="mkc-grid" style={{ marginTop: 14 }}>
        {/* 액션 큐 */}
        <div className="mkc-panel">
          <h3 className="mkc-panel-title">액션 큐 <SampleInline /></h3>
          <p className="mkc-panel-sub">승인 대기 초안 (우선순위 순)</p>
          <div className="mkc-todo">
            <strong>생성 엔진 연결 시 여기에 뜸 · Phase 2</strong>
            캡처 → 숫자 판독 → 4채널 초안이 이곳에 적재되어 원클릭 승인.
          </div>
        </div>

        {/* 데드맨 & 가드레일 */}
        <div className="mkc-panel">
          <h3 className="mkc-panel-title">데드맨 &amp; 가드레일</h3>
          <p className="mkc-panel-sub">7중 안전장치 상태</p>
          <div className="mkc-row"><span className="grow">자동 발행 경로</span><span className="mkc-pill g">없음 (초안 전용)</span></div>
          <div className="mkc-row"><span className="grow">페르소나 UI</span><span className="mkc-pill g">부재</span></div>
          <div className="mkc-row"><span className="grow">볼륨 캡 (채널당 3/일)</span><span className="mkc-pill g">강제</span></div>
          <div className="mkc-row"><span className="grow">데드맨 (2주 연속 바닥)</span><span className="mkc-pill n">추적 대기</span></div>
          <div className="mkc-row"><span className="grow">감사 로그</span><span className="mkc-pill n">Phase 3</span></div>
        </div>

        {/* 답글 타이머 */}
        <div className="mkc-panel is-dark">
          <h3 className="mkc-panel-title">답글 타이머</h3>
          <p className="mkc-panel-sub">발행 후 60분 상주 창</p>
          <div className="mkc-timer">--:--:--</div>
          <span style={{ color: '#9db3a6', fontSize: 12 }}>
            포스트 발행 표시 시 시작 (Phase 3). 내 포스트 답글 100% 반응 = 최상위 레버.
          </span>
        </div>
      </div>

      {/* 할 일 롤업 */}
      <div className="mkc-section"><h2>할 일 롤업</h2><span className="mkc-section-note">사람이 해야 하는 것만</span></div>
      <div className="mkc-card-box">
        <div className="mkc-row"><span className="grow">X 답글 게임 (큰 계정 3곳 · 내 포스트 답글 전원)</span><span className="mkc-pill n">대기</span></div>
        <div className="mkc-row"><span className="grow">Bluesky 미응답 답글 백로그</span><span className="mkc-pill a">59개</span></div>
        <div className="mkc-row"><span className="grow">주간 판정 (일요일 매트릭스)</span><span className="mkc-pill n">주 1회</span></div>
      </div>
    </>
  );
}

/* ===================== ② 생성 ===================== */
function GenerateTab() {
  const drafts = [
    { ch: 'toss', chLabel: '토스 · ko', voice: '주주 관찰체', body: '$SOXL 오늘 -13.7%. 옵션판은 이미 수준을 낮춰뒀어요 — 넷 프리미엄 -$2,200만 풋 우세, 맥스페인 190 괴리 9%+. 저는 오늘도 그냥 들고 갑니다.', action: '복사' },
    { ch: 'st', chLabel: 'Stocktwits · en', voice: '캐주얼 en', body: '$SOXL down hard but the options tape priced it in — net premium -$22M put-heavy, max pain 190 (9%+ gap). Structure said it before the chart did.', action: '복사' },
    { ch: 'xen', chLabel: 'X · en', voice: 'SpotGamma 레인', body: '$SOXL sits 9% above max pain (190) after the drop. Net premium -$22M, put-dominant. Dealers positioned for this — the chart is just catching up.', action: '버퍼 초안 적재' },
    { ch: 'xja', chLabel: 'X · ja', voice: 'KessanMan式', body: '$SOXL、急落だけど オプション市場はとっくに水準を下げてた。ネットプレミアム -$2,200万のプット優勢、マックスペイン190。地図は前からあったわけね。', action: '버퍼 초안 적재' },
  ] as const;

  return (
    <>
      {/* 입력 */}
      <div className="mkc-section"><h2>1. 소스 입력</h2><span className="mkc-section-note">캡처 업로드 또는 티커 지정</span></div>
      <div className="mkc-card-box">
        <div className="mkc-dropzone">
          <strong>앱 캡처 이미지를 여기에 드롭</strong>
          Bedrock 비전이 숫자를 판독합니다. 또는 아래에서 티커·로케일을 지정하면 서버가 자동 캡처 (EC2 워커 · Phase 2).
        </div>
        <div className="mkc-inline" style={{ marginTop: 14 }}>
          <div className="mkc-field" style={{ margin: 0 }}>
            <label>티커</label>
            <input className="mkc-input" placeholder="예: NVDA" defaultValue="SOXL" />
          </div>
          <div className="mkc-field" style={{ margin: 0 }}>
            <label>사건 유형</label>
            <select className="mkc-select" defaultValue="event">
              <option value="event">사건형 (단일 티커·이상 숫자 1개)</option>
              <option value="receipt">영수증형 (VERDICT 사후검증)</option>
              <option value="anchor">데일리 앵커 (같은 카드·같은 시각)</option>
              <option value="divergence">괴리형 (News vs Money)</option>
            </select>
          </div>
          <div className="mkc-field" style={{ margin: 0 }}>
            <label>&nbsp;</label>
            <button className="mkc-btn mkc-btn-primary" style={{ height: 38 }}>4채널 초안 생성</button>
          </div>
        </div>
        <div className="mkc-warn" style={{ marginTop: 12 }}>
          <span className="mkc-warn-ic">ⓘ</span>
          <span>판독된 숫자는 우리 Redis(`/api/live/options/structure`) 값과 대조 후 사용. 불일치 시 수동 입력 폴백.</span>
        </div>
      </div>

      {/* 초안 4종 */}
      <div className="mkc-section">
        <h2>2. 채널별 초안 4종</h2>
        <span className="mkc-section-note">채널별 네이티브 보이스 · 페르소나 없음(단일 운영자 목소리)</span>
        <span className="mkc-section-right">{SAMPLE()}</span>
      </div>
      <div className="mkc-cols-2">
        {drafts.map((d) => (
          <div className="mkc-draft" key={d.ch}>
            <div className="mkc-draft-head">
              <span className={`mkc-ch ${d.ch}`}>{d.chLabel}</span>
              <span className="mkc-draft-meta">보이스: {d.voice}</span>
            </div>
            <div className="mkc-draft-body">{d.body}</div>
            <div className="mkc-lints">
              <span className="mkc-pill g">링크 0 ✓</span>
              <span className="mkc-pill g">이모지 ≤2 ✓</span>
              <span className="mkc-pill g">지표 ≤3 ✓</span>
              <span className="mkc-pill g">금지어 ✓</span>
              <span className="mkc-pill g">예측 프레이밍 ✓</span>
              {d.ch === 'xja' && <span className="mkc-pill g">en≠ja ✓</span>}
            </div>
            <div className="mkc-draft-actions">
              <button className="mkc-btn-sm pri">{d.action}</button>
              <button className="mkc-btn-sm out">카드 첨부</button>
              <button className="mkc-btn-sm sec">재생성</button>
            </div>
          </div>
        ))}
      </div>

      {/* 카드 */}
      <div className="mkc-section"><h2>3. 카드 이미지</h2><span className="mkc-section-note">og 레벨 카드 + 앱 실캡처</span></div>
      <div className="mkc-cols-2">
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>레벨 사다리 카드</div>
          <p className="mkc-panel-sub">/api/og/level — 티커·레벨 넣으면 1200×675 PNG</p>
          <div className="mkc-todo" style={{ padding: '18px' }}>미리보기 · Phase 2 연결</div>
        </div>
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>앱 실캡처 (로케일별)</div>
          <p className="mkc-panel-sub">EC2 워커 → /{'{'}ko|en|ja{'}'}/app-view/cmd?t=TICKER</p>
          <div className="mkc-todo" style={{ padding: '18px' }}>미리보기 · Phase 2 연결</div>
        </div>
      </div>
    </>
  );
}

/* ===================== ③ X 운용 (실 데이터 연결) ===================== */
interface ScanTweet {
  id: string; author: string; text: string; createdAt: string;
  likes: number; replies: number; retweets: number; impressions: number;
  score: number; ticker: string | null; url: string;
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}분`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}시간` : `${Math.round(h / 24)}일`;
}

function XOpsTab() {
  const [lang, setLang] = useState<'en' | 'ja'>('en');
  const [tweets, setTweets] = useState<ScanTweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { text: string; grounded: boolean; loading: boolean }>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/mkt/x/scan?lang=${lang}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '스캔 실패');
      setTweets(j.tweets || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { scan(); }, [scan]);

  const genDraft = async (t: ScanTweet) => {
    setDrafts((d) => ({ ...d, [t.id]: { text: '', grounded: false, loading: true } }));
    try {
      const r = await fetch('/api/admin/mkt/x/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet: t, lang }),
      });
      const j = await r.json();
      setDrafts((d) => ({ ...d, [t.id]: { text: j.draft || '(우리 데이터 없음 — 수동 작성)', grounded: !!j.grounded, loading: false } }));
    } catch {
      setDrafts((d) => ({ ...d, [t.id]: { text: '초안 생성 실패', grounded: false, loading: false } }));
    }
  };

  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* noop */ }
  };

  return (
    <>
      {/* 연결 상태 */}
      <div className="mkc-section"><h2>계정 연결 상태</h2><span className="mkc-section-note">OAuth 승인 = 답글 게시 활성 조건</span></div>
      <div className="mkc-cols-2">
        <div className="mkc-card-box">
          <div className="mkc-row"><span className="grow"><span className="mkc-dot off" /> @signumhq (US)</span><span className="mkc-pill a">연결 대기 (Phase 3)</span></div>
          <div className="mkc-row"><span className="grow"><span className="mkc-dot off" /> @signumhq_jp (JP)</span><span className="mkc-pill a">연결 대기 (Phase 3)</span></div>
          <div className="mkc-muted" style={{ fontSize: 11.5, marginTop: 8 }}>연결 페이지에서 승인하면 [게시]가 활성화됩니다. 지금은 읽기·초안까지 실작동.</div>
        </div>
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>API 상태 (실측)</div>
          <div className="mkc-row"><span className="grow">읽기 (Bearer · api.x.com)</span><span className="mkc-pill g">실작동</span></div>
          <div className="mkc-row"><span className="grow">초안 (Bedrock · grounded)</span><span className="mkc-pill g">실작동</span></div>
          <div className="mkc-row"><span className="grow">쓰기 (답글 게시)</span><span className="mkc-pill a">연결 후</span></div>
        </div>
      </div>

      {/* 답글 타깃 */}
      <div className="mkc-section">
        <h2>답글 타깃 리스트</h2>
        <span className="mkc-section-note">타깃 계정 최신글 실시간 스캔 → 효과 스코어링. 초안은 우리 실데이터 grounded</span>
        <span className="mkc-section-right" style={{ display: 'flex', gap: 8 }}>
          <button className={`mkc-btn-sm ${lang === 'en' ? 'pri' : 'sec'}`} onClick={() => setLang('en')}>US 타깃</button>
          <button className={`mkc-btn-sm ${lang === 'ja' ? 'pri' : 'sec'}`} onClick={() => setLang('ja')}>JP 타깃</button>
          <button className="mkc-btn-sm out" onClick={scan} disabled={loading}>{loading ? '스캔 중…' : '다시 스캔'}</button>
        </span>
      </div>

      {error && <div className="mkc-warn red" style={{ marginBottom: 12 }}><span className="mkc-warn-ic">⚠</span><span>스캔 오류: {error}</span></div>}
      {loading && tweets.length === 0 && <div className="mkc-card-box"><div className="mkc-todo">타깃 계정 실시간 스캔 중…</div></div>}
      {!loading && tweets.length === 0 && !error && <div className="mkc-card-box"><div className="mkc-todo">최근 7일 내 타깃 글이 없습니다.</div></div>}

      <div className="mkc-card-box">
        {tweets.map((t) => {
          const d = drafts[t.id];
          return (
            <div className="mkc-target" key={t.id}>
              <div className="mkc-target-main">
                <div className="mkc-draft-head">
                  <span className="mkc-ch xen">@{t.author}</span>
                  {t.ticker && <span className="mkc-pill g">${t.ticker}</span>}
                  <span className="mkc-draft-meta">글 나이 {ago(t.createdAt)} · ♥ {t.likes} · 💬 {t.replies} · 👁 {t.impressions.toLocaleString()}</span>
                </div>
                <div className="mkc-target-src" style={{ marginTop: 6 }}>{t.text}</div>
                {d?.text && (
                  <div className="mkc-target-draft">
                    답글 초안 {d.grounded ? <span className="mkc-pill g" style={{ marginLeft: 4 }}>실데이터 grounded</span> : <span className="mkc-pill a" style={{ marginLeft: 4 }}>수동 필요</span>}
                    <div style={{ marginTop: 4 }}>{d.text}</div>
                  </div>
                )}
                <div className="mkc-draft-actions" style={{ marginTop: 8 }}>
                  <button className="mkc-btn-sm pri" disabled title="계정 연결(Phase 3) 후 활성">게시 (연결 필요)</button>
                  <a className="mkc-btn-sm out" href={t.url} target="_blank" rel="noreferrer">원글 열기</a>
                  <button className="mkc-btn-sm sec" onClick={() => genDraft(t)} disabled={d?.loading}>{d?.loading ? '생성 중…' : d?.text ? '초안 재생성' : '초안 생성'}</button>
                  {d?.text && <button className="mkc-btn-sm sec" onClick={() => copy(t.id, d.text)}>{copied === t.id ? '복사됨 ✓' : '초안 복사'}</button>}
                </div>
              </div>
              <div className="mkc-target-side">효과 점수<br /><strong style={{ fontSize: 16, color: 'var(--mkc-green-deep)' }}>{t.score}</strong></div>
            </div>
          );
        })}
      </div>

      {/* 내 포스트 인박스 */}
      <div className="mkc-section"><h2>내 포스트 답글 인박스</h2><span className="mkc-section-note">전원 반응 = 작성자 반응 최상위 레버 (60분 상주 폐지)</span></div>
      <div className="mkc-card-box">
        <div className="mkc-todo">
          <strong>OAuth 연결 후 자동 수집 · Phase 3</strong>
          내 포스트에 달린 답글을 read로 자동 수집 → 여기서 100% 체크리스트로 응대.
        </div>
      </div>
    </>
  );
}

/* ===================== ④ 레딧 ===================== */
function RedditTab() {
  const threads = [
    { sub: 'r/options', title: 'Anyone else watching MU into earnings? Chart looks scary', draft: 'MU\'s still 10%+ above max pain ($845) and 17% above gamma flip ($795). The tape sold off but dealer positioning didn\'t flip — worth checking the options structure, not just the candle.', age: '1시간', gate: '통과' },
    { sub: 'r/thetagang', title: 'Selling puts on SOXL after the drop — thoughts on levels?', draft: 'Net premium on SOXL is -$22M, put-dominant, and it\'s sitting 9% above max pain (190). That gap is the kind of level put sellers usually watch — structure-wise it\'s stretched.', age: '3시간', gate: '통과' },
  ];
  return (
    <>
      {/* R0 카르마 */}
      <div className="mkc-section"><h2>R0 · 카르마 빌딩 현황</h2><span className="mkc-section-note">금융 서브 본인 참여 (자동 파밍 금지)</span></div>
      <div className="mkc-cols-3">
        <div className="mkc-stat"><div className="l">댓글 카르마</div><div className="v">— <span className="mkc-sample">미연결</span></div><div className="mkc-progress"><span style={{ width: '0%' }} /></div><div className="d">목표: 서브 게이트 100~500</div></div>
        <div className="mkc-stat"><div className="l">계정 나이</div><div className="v">—</div><div className="d">많은 서브가 30일+ 요구</div></div>
        <div className="mkc-stat"><div className="l">사용 계정</div><div className="v">1개</div><div className="d">게시=본인 · 읽기=별도 app-only</div></div>
      </div>

      {/* 서브별 게이트 */}
      <div className="mkc-section"><h2>타깃 서브 게이트</h2><span className="mkc-section-note">AutoMod 최소 카르마·나이</span></div>
      <div className="mkc-card-box">
        {[
          { s: 'r/options', role: '밸류', gate: '카르마 게이트 확인 필요' },
          { s: 'r/thetagang', role: '밸류', gate: '카르마 게이트 확인 필요' },
          { s: 'r/Daytrading', role: '밸류', gate: '⚠ R4: AI 생성 금지 → 재작성 필수' },
          { s: 'r/stocks · r/investing', role: '카르마 겸용', gate: '진짜 가치 참여로 카르마 적립' },
        ].map((r) => (
          <div className="mkc-row" key={r.s}>
            <span className="grow"><strong>{r.s}</strong> <span className="mkc-muted">· {r.role}</span></span>
            <span className={`mkc-pill ${r.gate.startsWith('⚠') ? 'r' : 'n'}`}>{r.gate}</span>
          </div>
        ))}
      </div>

      {/* 발굴 */}
      <div className="mkc-section">
        <h2>스레드 발굴 · 밸류 코멘트 초안</h2>
        <span className="mkc-section-note">"우리 데이터가 답이 되는 글" — 읽기: 공식 API(app-only) / insane-search 폴백</span>
        <span className="mkc-section-right">{SAMPLE()}</span>
      </div>
      <div className="mkc-warn red" style={{ marginBottom: 12 }}>
        <span className="mkc-warn-ic">⚠</span>
        <span><strong>게시 전 사람이 실질 재작성 필수.</strong> r/Daytrading R4 = AI 생성 명시 금지 · 밴 시 도메인 블랙리스트 비가역. 콘솔은 초안만 제공, 게시는 링크 나가서 재작성 후 사람이.</span>
      </div>
      <div className="mkc-card-box">
        {threads.map((t, i) => (
          <div className="mkc-target" key={i}>
            <div className="mkc-target-main">
              <div className="mkc-draft-head">
                <span className="mkc-ch rdt">{t.sub}</span>
                <span className="mkc-draft-meta">글 나이 {t.age} · 게이트 {t.gate}</span>
              </div>
              <div className="mkc-target-src" style={{ marginTop: 6 }}>원글: {t.title}</div>
              <div className="mkc-target-draft">밸류 초안 (앱 언급 0): {t.draft}</div>
              <div className="mkc-draft-actions" style={{ marginTop: 8 }}>
                <button className="mkc-btn-sm out">원글 열기</button>
                <button className="mkc-btn-sm sec">초안 복사</button>
              </div>
            </div>
            <div className="mkc-target-side">서브당<br />1댓글/일 캡</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ===================== ⑤ 성과 ===================== */
function MetricsTab() {
  return (
    <>
      <div className="mkc-warn" style={{ marginBottom: 14 }}>
        <span className="mkc-warn-ic">◎</span>
        <span><strong>콜드스타트 지표 우선.</strong> 오리지널 포스트 조회수는 지금 볼 숫자가 아닙니다. 히어로 지표 = 답글수·프로필클릭·팔로워증감. "포스팅 더" 트랩 차단.</span>
      </div>

      <div className="mkc-cols-4">
        <div className="mkc-stat"><div className="l">답글 게시 / 일</div><div className="v">— <span className="mkc-sample">미연결</span></div><div className="d">목표 3~6 (큰 계정 스레드)</div></div>
        <div className="mkc-stat"><div className="l">프로필 클릭</div><div className="v">—</div><div className="d">첫 2주 수동 입력</div></div>
        <div className="mkc-stat"><div className="l">팔로워 증감</div><div className="v">—</div><div className="d">주간 대사</div></div>
        <div className="mkc-stat"><div className="l">?from= 유입 히트</div><div className="v">—</div><div className="d">/app 패치 후 자동</div></div>
      </div>

      {/* 퍼널 */}
      <div className="mkc-section"><h2>유입 퍼널 (채널별)</h2><span className="mkc-section-note">노출 → 프로필클릭 → ?from= 히트 → 설치</span><span className="mkc-section-right">{SAMPLE()}</span></div>
      <div className="mkc-card-box">
        <div className="mkc-funnel">
          {[
            { l: '노출', w: '100%', v: '—' },
            { l: '프로필 클릭', w: '32%', v: '—' },
            { l: '?from= 히트', w: '14%', v: '—' },
            { l: '설치', w: '6%', v: '—' },
          ].map((f) => (
            <div className="mkc-funnel-row" key={f.l}>
              <span className="fl">{f.l}</span>
              <span className="mkc-funnel-bar"><span style={{ width: f.w }} /></span>
              <span className="fv">{f.v}</span>
            </div>
          ))}
        </div>
        <div className="mkc-muted" style={{ fontSize: 11.5, marginTop: 10 }}>정직한 한계: 히트만 자동. 노출·프로필클릭·설치는 첫 2주 수동 입력 (X 애널리틱스·스토어 대사).</div>
      </div>

      {/* 주간 판정 매트릭스 */}
      <div className="mkc-section"><h2>주간 판정 매트릭스</h2><span className="mkc-section-note">매주 일요일 자동 진단</span></div>
      <div className="mkc-card-box">
        {[
          { sym: '노출 있음 + 답글 0', dx: '콘텐츠 실패', rx: '그 포맷 폐기' },
          { sym: '노출 <50 지속', dx: '유통 실패', rx: '답글 게임 증량 · 볼륨 유지' },
          { sym: '답글 있는데 팔로우 0', dx: '프로필/핀 문제', rx: '바이오·고정포스트 정비' },
          { sym: '2주 연속 전 지표 바닥', dx: '데드맨 발동', rx: '전면 정지 + 보고 · "더 많이" 금지' },
        ].map((m) => (
          <div className="mkc-row" key={m.sym}>
            <span className="grow"><strong>{m.sym}</strong></span>
            <span className="mkc-muted" style={{ flex: '0 0 130px' }}>{m.dx}</span>
            <span className="mkc-pill n" style={{ flex: '0 0 auto' }}>{m.rx}</span>
          </div>
        ))}
      </div>

      {/* 수동 입력 */}
      <div className="mkc-section"><h2>수동 입력 (첫 2주)</h2><span className="mkc-section-note">X API 지표 자동화 전까지</span></div>
      <div className="mkc-card-box mkc-cols-3" style={{ boxShadow: 'none', padding: 0, background: 'transparent' }}>
        <div className="mkc-field"><label>X 노출 (주간)</label><input className="mkc-input" placeholder="0" /></div>
        <div className="mkc-field"><label>프로필 클릭 (주간)</label><input className="mkc-input" placeholder="0" /></div>
        <div className="mkc-field"><label>신규 설치 (주간)</label><input className="mkc-input" placeholder="0" /></div>
      </div>
    </>
  );
}

/* ===================== ⑥ 자산 ===================== */
function AssetsTab() {
  return (
    <>
      {/* VERDICT */}
      <div className="mkc-section"><h2>VERDICT 스코어보드</h2><span className="mkc-section-note">스스로 채점하는 공개 기록 = 복사 불가 자산</span><span className="mkc-section-right">{SAMPLE()}</span></div>
      <div className="mkc-cols-3">
        <div className="mkc-card-box">
          <div className="mkc-gauge"><div className="g-num">—</div><div className="g-lab">이번주 적중률</div></div>
        </div>
        <div className="mkc-stat"><div className="l">이번 달 전적</div><div className="v">— / —</div><div className="d">손실도 공개 유지</div></div>
        <div className="mkc-stat"><div className="l">전체 누적</div><div className="v">— / —</div><div className="d">시간-잠금 장부</div></div>
      </div>

      {/* 카드 4종 */}
      <div className="mkc-section"><h2>포스트 카드 4종</h2><span className="mkc-section-note">.agent/assets/card-designs</span></div>
      <div className="mkc-cols-4">
        {['히어로 숫자', '레벨 사다리', '괴리 대면', 'VERDICT 스탬프'].map((c) => (
          <div className="mkc-card-box" key={c}>
            <div className="mkc-panel-title" style={{ fontSize: 12.5 }}>{c}</div>
            <div className="mkc-todo" style={{ padding: 14, marginTop: 8 }}>미리보기 연결 · Phase 5</div>
          </div>
        ))}
      </div>

      {/* pSEO + 계정 상태 */}
      <div className="mkc-cols-2" style={{ marginTop: 14 }}>
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>pSEO 레벨 페이지</div>
          <p className="mkc-panel-sub">일일 티커 레벨 페이지 + 임베드 위젯</p>
          <div className="mkc-row"><span className="grow">상태</span><span className="mkc-pill n">Phase 5 예정</span></div>
        </div>
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>계정 상태</div>
          <div className="mkc-row"><span className="grow"><span className="mkc-dot on" /> @signumhq · Premium+</span><span className="mkc-pill g">활성</span></div>
          <div className="mkc-row"><span className="grow"><span className="mkc-dot on" /> @signumhq_jp · Premium+</span><span className="mkc-pill g">활성</span></div>
          <div className="mkc-row"><span className="grow">다운그레이드 리마인더</span><span className="mkc-pill a">8/13 (PC 예약)</span></div>
        </div>
      </div>
    </>
  );
}

function SampleInline() {
  return <span className="mkc-sample" style={{ marginLeft: 6 }}>샘플</span>;
}
