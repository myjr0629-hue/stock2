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
  { key: 'reddit', label: '커뮤니티' },
  { key: 'metrics', label: '성과' },
  { key: 'assets', label: '자산' },
];

const TAB_META: Record<TabKey, { title: string; sub: string }> = {
  today: { title: '오늘', sub: '감지 사건 · 승인 대기 초안 · 채널별 볼륨 캡 · 데드맨 · 할 일 롤업' },
  generate: { title: '생성', sub: '캡처 업로드 → 숫자 판독 → 채널별 네이티브 글 4종 + 카드 + 린트 검사' },
  x: { title: 'X 운용', sub: '답글 타깃 스캔 · 초안 큐 · 60분 답글 타이머 · 내 포스트 인박스 (@signumhq / @signumhq_jp)' },
  reddit: { title: '커뮤니티 (레딧 · Stocktwits)', sub: '발굴 + 초안 자동 → 복사 → 원글 열어 붙여넣기 (게시 수동). 레딧은 재작성 필수' },
  metrics: { title: '성과', sub: '콜드스타트 퍼널 — 답글수·프로필클릭·팔로워증감 (조회수는 히어로 지표 아님)' },
  assets: { title: '자산', sub: 'VERDICT 스코어보드 · 포스트 카드 4종 · pSEO 레벨페이지 · 계정 상태' },
};


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

/* ===================== ① 오늘 (실 모니터링) ===================== */
interface AuditEntry { at: number; who: string; action: string; detail?: string }
interface Overview {
  etDate: string; cap: number;
  volumes: { xUS: number; xJP: number; bluesky: number };
  connections: { en: { connected: boolean }; jp: { connected: boolean } };
  audit: AuditEntry[];
}

function auditLabel(a: string): string {
  const m: Record<string, string> = {
    generate: '초안 생성', 'buffer-draft': '버퍼 적재', 'x-oauth-connect': '계정 연결',
    'x-reply-posted': 'X 답글 게시',
  };
  return m[a] || a;
}

function TodayTab() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kill, setKill] = useState<boolean | null>(null);
  const [killBusy, setKillBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/mkt/overview', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setOv(j); else setErr(j.error || '로드 실패'); })
      .catch((e) => setErr(String(e)));
    fetch('/api/admin/mkt/killswitch', { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (j.ok) setKill(j.on); }).catch(() => {});
  }, []);

  const toggleKill = async () => {
    setKillBusy(true);
    try {
      const r = await fetch('/api/admin/mkt/killswitch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: !kill }),
      });
      const j = await r.json();
      if (j.ok) setKill(j.on);
    } catch { /* noop */ } finally { setKillBusy(false); }
  };

  const cap = ov?.cap ?? 3;
  const v = ov?.volumes ?? { xUS: 0, xJP: 0, bluesky: 0 };
  const bothConnected = ov ? ov.connections.en.connected && ov.connections.jp.connected : false;

  return (
    <>
      {err && <div className="mkc-warn red" style={{ marginBottom: 12 }}><span className="mkc-warn-ic">⚠</span><span>{err}</span></div>}

      {/* 킬스위치 — 총지휘소 통제 */}
      <div className="mkc-card-box" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${kill ? 'var(--mkc-red)' : 'var(--mkc-green)'}` }}>
        <div style={{ flex: 1 }}>
          <div className="mkc-panel-title" style={{ fontSize: 14 }}>
            {kill === null ? '킬스위치 로딩…' : kill ? '🔴 전체 발행 정지됨 (킬스위치 ON)' : '🟢 발행 정상 (킬스위치 OFF)'}
          </div>
          <div className="mkc-muted" style={{ fontSize: 12 }}>ON이면 모든 발행·버퍼 적재가 거부됩니다 (크론·수동 전부). 계정 위험·오작동 시 즉시 정지.</div>
        </div>
        <button className={`mkc-btn ${kill ? 'mkc-btn-primary' : 'mkc-btn-ghost'}`} onClick={toggleKill} disabled={killBusy || kill === null}
          style={kill ? {} : { color: 'var(--mkc-red)', borderColor: 'var(--mkc-red)' }}>
          {killBusy ? '…' : kill ? '발행 재개' : '전체 정지'}
        </button>
      </div>

      <div className="mkc-kpis">
        <div className="mkc-kpi is-hero">
          <span className="mkc-kpi-label">볼륨 캡 · X-US ({ov?.etDate || 'ET'})</span>
          <span className="mkc-kpi-value">{v.xUS} / {cap}</span>
          <span className="mkc-kpi-note">하루 상한 {cap} — 성과 나빠도 절대 안 늘림 (서버 강제)</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">X-JP 볼륨</span>
          <span className="mkc-kpi-value">{v.xJP} / {cap}</span>
          <span className="mkc-kpi-note">US와 같은 사건, ja 네이티브</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">계정 연결</span>
          <span className="mkc-kpi-value">{ov ? (Number(ov.connections.en.connected) + Number(ov.connections.jp.connected)) : 0} / 2</span>
          <span className="mkc-kpi-note">{bothConnected ? '게시 활성' : 'X 운용 탭에서 연결'}</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">최근 활동 (감사)</span>
          <span className="mkc-kpi-value">{ov?.audit.length ?? 0}</span>
          <span className="mkc-kpi-note">모든 생성·적재·게시 기록됨</span>
        </div>
      </div>

      <div className="mkc-grid" style={{ marginTop: 14 }}>
        {/* 감사 로그 (실데이터) */}
        <div className="mkc-panel">
          <h3 className="mkc-panel-title">감사 로그</h3>
          <p className="mkc-panel-sub">"몰래 1,000개"가 물리적으로 불가능한 이유</p>
          {ov && ov.audit.length === 0 && <div className="mkc-todo" style={{ padding: 16 }}>아직 활동 없음 — 생성·적재·게시하면 여기 기록됩니다.</div>}
          {ov?.audit.map((a, i) => (
            <div className="mkc-row" key={i}>
              <span className="grow">{auditLabel(a.action)} {a.detail ? <span className="mkc-muted">· {a.detail}</span> : null}</span>
              <span className="mkc-muted" style={{ fontSize: 11 }}>{new Date(a.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>

        {/* 데드맨 & 가드레일 (실 상태) */}
        <div className="mkc-panel">
          <h3 className="mkc-panel-title">데드맨 &amp; 가드레일</h3>
          <p className="mkc-panel-sub">7중 안전장치 상태</p>
          <div className="mkc-row"><span className="grow">자동 발행 경로</span><span className="mkc-pill g">없음 (초안 전용)</span></div>
          <div className="mkc-row"><span className="grow">페르소나 UI</span><span className="mkc-pill g">부재</span></div>
          <div className="mkc-row"><span className="grow">볼륨 캡 (채널당 {cap}/일)</span><span className="mkc-pill g">서버 강제</span></div>
          <div className="mkc-row"><span className="grow">감사 로그</span><span className="mkc-pill g">기록 중</span></div>
          <div className="mkc-row"><span className="grow">데드맨 (2주 연속 바닥)</span><span className="mkc-pill n">성과 데이터 후</span></div>
        </div>

        {/* 답글 타이머 */}
        <div className="mkc-panel is-dark">
          <h3 className="mkc-panel-title">답글 타이머</h3>
          <p className="mkc-panel-sub">발행 후 60분 상주 창</p>
          <div className="mkc-timer">--:--:--</div>
          <span style={{ color: '#9db3a6', fontSize: 12 }}>
            포스트 발행 표시 시 시작. 내 포스트 답글 100% 반응 = 최상위 레버.
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

/* ===================== ② 생성 (실 데이터 연결) ===================== */
interface LintCheck { key: string; label: string; ok: boolean }
interface GenDraft {
  channel: 'toss' | 'stocktwits' | 'x_en' | 'x_ja';
  label: string; lang: string; text: string;
  lint: { pass: boolean; checks: LintCheck[] };
}
interface GenResult { ticker: string; grounded: boolean; levels: Record<string, number> | null; drafts: GenDraft[] }

const CH_CLASS: Record<string, string> = { toss: 'toss', stocktwits: 'st', x_en: 'xen', x_ja: 'xja' };

function GenerateTab() {
  const [ticker, setTicker] = useState('NVDA');
  const [eventType, setEventType] = useState('event');
  const [gen, setGen] = useState<GenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pushMsg, setPushMsg] = useState<Record<string, string>>({});
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{ best: { ticker: string; reason: string } | null; ranked: { ticker: string; reason: string; notability: number }[]; session: MktSession } | null>(null);

  const suggest = async () => {
    setSuggesting(true);
    try {
      const r = await fetch('/api/admin/mkt/generate/suggest', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) {
        setSuggestion({ best: j.best, ranked: j.ranked || [], session: j.session });
        if (j.best?.ticker) setTicker(j.best.ticker);
      }
    } catch { /* noop */ } finally { setSuggesting(false); }
  };

  const run = async () => {
    setLoading(true); setError(null); setGen(null); setPushMsg({});
    try {
      const r = await fetch('/api/admin/mkt/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, eventType }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '생성 실패');
      if (!j.grounded) { setError(`${j.ticker}: 우리 옵션 데이터가 없어 grounding 불가 — 다른 티커를 시도하세요.`); }
      setGen(j);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };

  const copy = async (k: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { /* noop */ }
  };

  const push = async (d: GenDraft) => {
    setPushMsg((m) => ({ ...m, [d.channel]: '적재 중…' }));
    try {
      const r = await fetch('/api/admin/mkt/buffer/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelKey: d.channel, text: d.text }),
      });
      const j = await r.json();
      setPushMsg((m) => ({ ...m, [d.channel]: j.ok ? `버퍼 초안 적재됨 (${j.count}/${j.cap})` : `실패: ${j.error}` }));
    } catch { setPushMsg((m) => ({ ...m, [d.channel]: '적재 실패' })); }
  };

  return (
    <>
      {/* 입력 */}
      <div className="mkc-section">
        <h2>1. 소스 입력</h2><span className="mkc-section-note">티커 → 우리 실 옵션데이터로 grounded</span>
        <span className="mkc-section-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {suggestion?.session && <span className={`mkc-pill ${suggestion.session.goodToPost ? 'g' : 'a'}`} title={suggestion.session.note}>{suggestion.session.label}</span>}
          <button className="mkc-btn-sm pri" onClick={suggest} disabled={suggesting}>{suggesting ? '분석 중…' : '🎯 지금 최적 종목 추천'}</button>
        </span>
      </div>
      {suggestion?.best && (
        <div className="mkc-card-box" style={{ marginBottom: 12 }}>
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>추천: <span style={{ color: 'var(--mkc-green-deep)' }}>${suggestion.best.ticker}</span> <span className="mkc-muted" style={{ fontWeight: 400 }}>— {suggestion.best.reason}</span></div>
          <div className="mkc-lints" style={{ marginTop: 8 }}>
            {suggestion.ranked.map((r) => (
              <span key={r.ticker} className={`mkc-pill ${r.ticker === suggestion.best?.ticker ? 'g' : 'n'}`} style={{ cursor: 'pointer' }} onClick={() => setTicker(r.ticker)} title={r.reason}>${r.ticker} · {r.reason}</span>
            ))}
          </div>
          <div className="mkc-muted" style={{ fontSize: 11.5, marginTop: 6 }}>괴리 큰 종목일수록 "차트가 안 보여주는" 훅이 강함. 클릭하면 티커에 반영.</div>
        </div>
      )}
      <div className="mkc-card-box">
        <div className="mkc-inline">
          <div className="mkc-field" style={{ margin: 0 }}>
            <label>티커</label>
            <input className="mkc-input" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="예: NVDA" />
          </div>
          <div className="mkc-field" style={{ margin: 0 }}>
            <label>사건 유형</label>
            <select className="mkc-select" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="event">사건형 (단일 티커·이상 숫자 1개)</option>
              <option value="receipt">영수증형 (VERDICT 사후검증)</option>
              <option value="anchor">데일리 앵커 (같은 카드·같은 시각)</option>
              <option value="divergence">괴리형 (News vs Money)</option>
            </select>
          </div>
          <div className="mkc-field" style={{ margin: 0 }}>
            <label>&nbsp;</label>
            <button className="mkc-btn mkc-btn-primary" style={{ height: 38 }} onClick={run} disabled={loading}>{loading ? '생성 중…' : '4채널 초안 생성'}</button>
          </div>
        </div>
        <div className="mkc-warn" style={{ marginTop: 12 }}>
          <span className="mkc-warn-ic">ⓘ</span>
          <span>숫자는 우리 <code>/api/live/options/structure</code> 실값만 사용 (조작 0). 예측어·앱명·링크는 린트가 차단.</span>
        </div>
      </div>

      {error && <div className="mkc-warn red" style={{ marginBottom: 12 }}><span className="mkc-warn-ic">⚠</span><span>{error}</span></div>}
      {gen?.grounded && gen.levels && (
        <div className="mkc-card-box" style={{ marginBottom: 12 }}>
          <span className="mkc-pill g">grounded</span>
          <span style={{ marginLeft: 10, fontSize: 12.5 }} className="mkc-muted">
            {Object.entries(gen.levels).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k} ${v}`).join(' · ')}
          </span>
        </div>
      )}

      {/* 초안 4종 */}
      {gen && gen.drafts.length > 0 && (
        <>
          <div className="mkc-section"><h2>2. 채널별 초안 4종</h2><span className="mkc-section-note">채널별 네이티브 보이스 · 페르소나 없음(단일 운영자 목소리)</span></div>
          <div className="mkc-cols-2">
            {gen.drafts.map((d) => (
              <div className="mkc-draft" key={d.channel}>
                <div className="mkc-draft-head">
                  <span className={`mkc-ch ${CH_CLASS[d.channel]}`}>{d.label}</span>
                  <span className="mkc-draft-meta">{d.lint.pass ? <span className="mkc-pill g">린트 통과</span> : <span className="mkc-pill r">린트 실패</span>}</span>
                </div>
                <div className="mkc-draft-body">{d.text || '(빈 초안 — 재생성)'}</div>
                <div className="mkc-lints">
                  {d.lint.checks.map((c) => (
                    <span key={c.key} className={`mkc-pill ${c.ok ? 'g' : 'r'}`}>{c.label} {c.ok ? '✓' : '✗'}</span>
                  ))}
                </div>
                <div className="mkc-draft-actions">
                  <button className="mkc-btn-sm pri" onClick={() => copy(d.channel, d.text)} disabled={!d.text}>{copied === d.channel ? '복사됨 ✓' : '복사'}</button>
                  {(d.channel === 'x_en' || d.channel === 'x_ja') && (
                    <button className="mkc-btn-sm out" onClick={() => push(d)} disabled={!d.text || !d.lint.pass} title={!d.lint.pass ? '린트 통과해야 적재 가능' : ''}>버퍼 초안 적재</button>
                  )}
                </div>
                {pushMsg[d.channel] && <div className="mkc-muted" style={{ fontSize: 11.5 }}>{pushMsg[d.channel]}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 카드 */}
      <div className="mkc-section"><h2>3. 카드 이미지</h2><span className="mkc-section-note">og 레벨 카드 (실작동) + 앱 실캡처</span></div>
      <div className="mkc-cols-2">
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>레벨 사다리 카드</div>
          <p className="mkc-panel-sub">/api/og/level — 티커·레벨 넣으면 1200×675 PNG (실작동)</p>
          {gen?.grounded && gen.levels ? (
            <img
              alt="level card"
              style={{ width: '100%', borderRadius: 10, marginTop: 8, border: '1px solid var(--mkc-line)' }}
              src={`/api/og/level?ticker=${gen.ticker}${gen.levels.price ? `&price=${gen.levels.price}` : ''}${gen.levels.maxPain ? `&maxPain=${gen.levels.maxPain}` : ''}${gen.levels.gammaFlip ? `&gammaFlip=${gen.levels.gammaFlip}` : ''}${gen.levels.callWall ? `&callWall=${gen.levels.callWall}` : ''}${gen.levels.putFloor ? `&putFloor=${gen.levels.putFloor}` : ''}`}
            />
          ) : (
            <div className="mkc-todo" style={{ padding: 18 }}>티커 생성하면 카드가 여기 표시됩니다</div>
          )}
        </div>
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>앱 실캡처 (로케일별)</div>
          <p className="mkc-panel-sub">EC2 워커 → /{'{'}ko|en|ja{'}'}/app-view/cmd?t=TICKER</p>
          <div className="mkc-todo" style={{ padding: 18 }}>캡처 파이프라인 연결 예정 (워커 localStorage 패치)</div>
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
  replySettings?: string; canReply?: boolean;
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}분`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}시간` : `${Math.round(h / 24)}일`;
}

interface XConn { en: { connected: boolean; username?: string }; jp: { connected: boolean; username?: string } }
const ACCT_LABEL: Record<'en' | 'jp', string> = { en: '@signumhq', jp: '@signumhq_jp' };
interface MktSession { session: string; label: string; goodToPost: boolean; note: string }
interface RecItem extends ScanTweet { draft: string; grounded: boolean }
interface InboxItem { id: string; text: string; author: string; createdAt: string; url: string }

function XOpsTab() {
  const [lang, setLang] = useState<'en' | 'ja'>('en');
  const [tweets, setTweets] = useState<ScanTweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { text: string; grounded: boolean; loading: boolean }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [conn, setConn] = useState<XConn | null>(null);
  const [rec, setRec] = useState<{ recommended: RecItem[]; session: MktSession; scannedCount: number } | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[] | null>(null);

  const acctKey = lang === 'ja' ? 'jp' : 'en';
  const acctConnected = conn ? conn[acctKey].connected : false;

  useEffect(() => {
    fetch('/api/admin/mkt/x/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setConn({ en: j.en, jp: j.jp }); })
      .catch(() => {});
  }, []);

  const recommend = useCallback(async () => {
    setRecLoading(true);
    try {
      const r = await fetch('/api/admin/mkt/x/recommend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, top: 3 }),
      });
      const j = await r.json();
      if (j.ok) setRec({ recommended: j.recommended || [], session: j.session, scannedCount: j.scannedCount });
    } catch { /* noop */ } finally { setRecLoading(false); }
  }, [lang]);

  useEffect(() => { recommend(); }, [recommend]);

  useEffect(() => {
    if (!acctConnected) { setInbox(null); return; }
    fetch(`/api/admin/mkt/x/inbox?acct=${acctKey}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setInbox(j.items || []); })
      .catch(() => {});
  }, [acctKey, acctConnected]);

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
          <div className="mkc-row">
            <span className="grow"><span className={`mkc-dot ${conn?.en.connected ? 'on' : 'off'}`} /> @signumhq (US){conn?.en.username ? ` · @${conn.en.username}` : ''}</span>
            {conn?.en.connected
              ? <span className="mkc-pill g">연결됨</span>
              : <a className="mkc-btn-sm pri" href="/api/admin/x-oauth/start?acct=en">연결</a>}
          </div>
          <div className="mkc-row">
            <span className="grow"><span className={`mkc-dot ${conn?.jp.connected ? 'on' : 'off'}`} /> @signumhq_jp (JP){conn?.jp.username ? ` · @${conn.jp.username}` : ''}</span>
            {conn?.jp.connected
              ? <span className="mkc-pill g">연결됨</span>
              : <a className="mkc-btn-sm pri" href="/api/admin/x-oauth/start?acct=jp">연결</a>}
          </div>
          <div className="mkc-muted" style={{ fontSize: 11.5, marginTop: 8 }}>[연결] 클릭 → X 승인 → 돌아오면 [게시] 활성화. 계정당 1회 (이후 자동 갱신).</div>
        </div>
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>API 상태 (실측)</div>
          <div className="mkc-row"><span className="grow">읽기 (Bearer · api.x.com)</span><span className="mkc-pill g">실작동</span></div>
          <div className="mkc-row"><span className="grow">초안 (Bedrock · grounded)</span><span className="mkc-pill g">실작동</span></div>
          <div className="mkc-row"><span className="grow">API 콜드 답글</span><span className="mkc-pill r">X 정책상 불가 (수동)</span></div>
        </div>
      </div>

      <div className="mkc-warn" style={{ marginBottom: 4, marginTop: 14 }}>
        <span className="mkc-warn-ic">ⓘ</span>
        <span><strong>X가 2026년 API 자동 답글을 전면 차단했습니다</strong> (스팸 방지 · 전 요금제 · 원저자가 우리를 멘션/인용한 경우만 API 답글 가능). 그래서 콘솔은 <strong>어디에 달지 자동 선별 + 실데이터 초안 자동 작성</strong>까지 하고, 마지막은 <strong>[복사 + 원글 열기] → 손으로 붙여넣기</strong>. 수동 답글은 정상 작동합니다.</span>
      </div>

      {/* ★ 추천 큐 (자동 선별 + 자동 초안) */}
      <div className="mkc-section">
        <h2>🎯 지금 답글 추천</h2>
        <span className="mkc-section-note">효과·시점·우리데이터로 자동 선별 + 초안까지 자동 — 사람은 검토·게시만</span>
        <span className="mkc-section-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {rec?.session && (
            <span className={`mkc-pill ${rec.session.goodToPost ? 'g' : 'a'}`} title={rec.session.note}>
              {rec.session.goodToPost ? '게시 적기' : '대기'} · {rec.session.label}
            </span>
          )}
          <button className="mkc-btn-sm out" onClick={recommend} disabled={recLoading}>{recLoading ? '선별 중…' : '재선별'}</button>
        </span>
      </div>
      <div className="mkc-card-box">
        {recLoading && (!rec || rec.recommended.length === 0) && <div className="mkc-todo">타깃 스캔 → 효과 선별 → 초안 자동 생성 중…</div>}
        {rec && rec.recommended.length === 0 && !recLoading && (
          <div className="mkc-todo">지금 답글할 만한 글이 없습니다 (스캔 {rec.scannedCount}건 중 우리 데이터로 grounding 가능한 고효과 글 0). 잠시 후 재선별.</div>
        )}
        {rec?.recommended.map((t, i) => (
          <div className="mkc-target" key={t.id} style={{ background: i === 0 ? 'var(--mkc-green-soft)' : undefined, borderRadius: 10, padding: i === 0 ? 12 : undefined, marginBottom: i === 0 ? 6 : 0 }}>
            <div className="mkc-target-main">
              <div className="mkc-draft-head">
                {i === 0 && <span className="mkc-pill g">최우선</span>}
                <span className="mkc-ch xen">@{t.author}</span>
                {t.ticker && <span className="mkc-pill g">${t.ticker}</span>}
                <span className="mkc-draft-meta">효과 {t.score} · ♥ {t.likes} · 👁 {t.impressions.toLocaleString()} · {ago(t.createdAt)}</span>
              </div>
              <div className="mkc-target-src" style={{ marginTop: 6 }}>{t.text}</div>
              <div className="mkc-target-draft">답글 초안 <span className="mkc-pill g" style={{ marginLeft: 4 }}>실데이터 grounded</span><div style={{ marginTop: 4 }}>{t.draft}</div></div>
              <div className="mkc-draft-actions" style={{ marginTop: 8 }}>
                <button className="mkc-btn-sm pri" onClick={() => { copy(t.id, t.draft); window.open(t.url, '_blank'); }}>
                  {copied === t.id ? '복사됨 ✓ · 원글에 붙여넣기' : '복사 + 원글 열기'}
                </button>
                <button className="mkc-btn-sm sec" onClick={() => copy(t.id, t.draft)}>{copied === t.id ? '복사됨 ✓' : '초안만 복사'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 답글 타깃 (전체 스캔) */}
      <div className="mkc-section">
        <h2>답글 타깃 리스트 (전체)</h2>
        <span className="mkc-section-note">타깃 계정 최신글 실시간 스캔 → 효과 스코어링. 추천 외 글 수동 검토용</span>
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
                  {t.canReply === false && <span className="mkc-pill r">답글 제한(작성자 설정)</span>}
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
                  {!d?.text
                    ? <button className="mkc-btn-sm pri" onClick={() => genDraft(t)} disabled={d?.loading}>{d?.loading ? '생성 중…' : '초안 생성'}</button>
                    : <button className="mkc-btn-sm pri" onClick={() => { copy(t.id, d.text); window.open(t.url, '_blank'); }}>{copied === t.id ? '복사됨 ✓ · 붙여넣기' : '복사 + 원글 열기'}</button>}
                  {d?.text && <button className="mkc-btn-sm sec" onClick={() => genDraft(t)} disabled={d?.loading}>{d?.loading ? '…' : '재생성'}</button>}
                  <a className="mkc-btn-sm out" href={t.url} target="_blank" rel="noreferrer">원글 열기</a>
                </div>
              </div>
              <div className="mkc-target-side">효과 점수<br /><strong style={{ fontSize: 16, color: 'var(--mkc-green-deep)' }}>{t.score}</strong></div>
            </div>
          );
        })}
      </div>

      {/* 내 포스트 인박스 (실 데이터) */}
      <div className="mkc-section"><h2>내 포스트 답글 인박스 · {ACCT_LABEL[acctKey]}</h2><span className="mkc-section-note">전원 반응 = 작성자 반응 최상위 레버</span></div>
      <div className="mkc-card-box">
        {!acctConnected && <div className="mkc-todo">계정 연결 후 자동 수집됩니다.</div>}
        {acctConnected && inbox === null && <div className="mkc-todo">멘션·답글 수집 중…</div>}
        {acctConnected && inbox !== null && inbox.length === 0 && <div className="mkc-todo">아직 내 포스트에 달린 답글·멘션이 없습니다. (콜드스타트 — 답글 게임이 시작점)</div>}
        {inbox?.map((m) => (
          <div className="mkc-row" key={m.id}>
            <span className="grow"><strong>@{m.author}</strong> <span className="mkc-muted">{m.text.slice(0, 100)}</span></span>
            <a className="mkc-btn-sm out" href={m.url} target="_blank" rel="noreferrer">응대</a>
          </div>
        ))}
      </div>
    </>
  );
}

/* ===================== ④ 레딧 (실 스캔 / 온디맨드) ===================== */
interface RedThread { id: string; sub: string; title: string; author: string; score: number; numComments: number; permalink: string; ticker: string | null; relevance: number }

interface StMsg { id: number; ticker: string; body: string; user: string; followers: number; sentiment: string | null; likes: number; replies: number; url: string; score: number }

function RedditTab() {
  const [data, setData] = useState<{ configured: boolean; threads: RedThread[]; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [st, setSt] = useState<{ messages: StMsg[]; error?: string } | null>(null);
  const [stLoading, setStLoading] = useState(true);
  const [stDrafts, setStDrafts] = useState<Record<number, { text: string; loading: boolean }>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/mkt/reddit/scan', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setData({ configured: j.configured, threads: j.threads || [], error: j.error }))
      .catch((e) => setData({ configured: false, threads: [], error: String(e) }))
      .finally(() => setLoading(false));
    fetch('/api/admin/mkt/stocktwits/scan', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setSt({ messages: j.messages || [], error: j.error }))
      .catch((e) => setSt({ messages: [], error: String(e) }))
      .finally(() => setStLoading(false));
  }, []);

  const copy = async (k: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { /* noop */ }
  };
  const genStDraft = async (m: StMsg) => {
    setStDrafts((d) => ({ ...d, [m.id]: { text: '', loading: true } }));
    try {
      const r = await fetch('/api/admin/mkt/x/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet: { id: String(m.id), text: m.body, ticker: m.ticker, author: m.user }, lang: 'en' }),
      });
      const j = await r.json();
      setStDrafts((d) => ({ ...d, [m.id]: { text: j.draft || '(우리 데이터 없음 — 수동)', loading: false } }));
    } catch { setStDrafts((d) => ({ ...d, [m.id]: { text: '초안 실패', loading: false } })); }
  };

  return (
    <>
      {/* Stocktwits 발굴 (실 스캔) */}
      <div className="mkc-section"><h2>Stocktwits 발굴</h2><span className="mkc-section-note">$티커 스트림 실시간 스캔 → 고효과 글 + grounded 초안 → 복사→붙여넣기 (게시 수동)</span></div>
      {stLoading && <div className="mkc-card-box"><div className="mkc-todo">스트림 스캔 중…</div></div>}
      {st && st.messages.length === 0 && !stLoading && <div className="mkc-card-box"><div className="mkc-todo">지금 답글할 만한 글이 없습니다{st.error ? ` (${st.error})` : ''}.</div></div>}
      {st && st.messages.length > 0 && (
        <div className="mkc-card-box">
          {st.messages.map((m) => {
            const d = stDrafts[m.id];
            return (
              <div className="mkc-target" key={m.id}>
                <div className="mkc-target-main">
                  <div className="mkc-draft-head">
                    <span className="mkc-ch st">${m.ticker}</span>
                    {m.sentiment && <span className={`mkc-pill ${m.sentiment === 'Bullish' ? 'g' : 'r'}`}>{m.sentiment}</span>}
                    <span className="mkc-draft-meta">@{m.user} · 팔로워 {m.followers.toLocaleString()} · ♥ {m.likes} · 💬 {m.replies}</span>
                  </div>
                  <div className="mkc-target-src" style={{ marginTop: 6 }}>{m.body}</div>
                  {d?.text && <div className="mkc-target-draft">답글 초안: {d.text}</div>}
                  <div className="mkc-draft-actions" style={{ marginTop: 8 }}>
                    {!d?.text
                      ? <button className="mkc-btn-sm pri" onClick={() => genStDraft(m)} disabled={d?.loading}>{d?.loading ? '생성 중…' : '초안 생성'}</button>
                      : <button className="mkc-btn-sm pri" onClick={() => { copy(`st${m.id}`, d.text); window.open(m.url, '_blank'); }}>{copied === `st${m.id}` ? '복사됨 ✓ · 붙여넣기' : '복사 + 원글 열기'}</button>}
                    <a className="mkc-btn-sm out" href={m.url} target="_blank" rel="noreferrer">원글 열기</a>
                  </div>
                </div>
                <div className="mkc-target-side">효과<br /><strong style={{ color: 'var(--mkc-green-deep)' }}>{m.score}</strong></div>
              </div>
            );
          })}
        </div>
      )}

      {/* R0 카르마 */}
      <div className="mkc-section"><h2>R0 · 카르마 빌딩 현황</h2><span className="mkc-section-note">금융 서브 본인 참여 (자동 파밍 금지)</span></div>
      <div className="mkc-cols-3">
        <div className="mkc-stat"><div className="l">댓글 카르마</div><div className="v">— <span className="mkc-sample">본인계정 미연동</span></div><div className="mkc-progress"><span style={{ width: '0%' }} /></div><div className="d">목표: 서브 게이트 100~500</div></div>
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
      <div className="mkc-section"><h2>스레드 발굴 · 밸류 코멘트 초안</h2><span className="mkc-section-note">"우리 데이터가 답이 되는 글"</span></div>
      <div className="mkc-warn red" style={{ marginBottom: 12 }}>
        <span className="mkc-warn-ic">⚠</span>
        <span><strong>게시 전 사람이 실질 재작성 필수.</strong> r/Daytrading R4 = AI 생성 명시 금지 · 밴 시 도메인 블랙리스트 비가역. 콘솔은 발굴만, 게시는 링크 나가서 재작성 후 사람이.</span>
      </div>

      {loading && <div className="mkc-card-box"><div className="mkc-todo">서브 스캔 중…</div></div>}

      {data && !data.configured && (
        <div className="mkc-card-box">
          <div className="mkc-todo">
            <strong>Reddit 자동 발굴 = 미연동 (온디맨드 사용)</strong>
            공식 Data API는 승인 게이트가 있어 콘솔 자동 발굴은 보류 상태입니다. 지금은 <strong>세션에서 "레딧 지금 찾아줘"</strong>라고 하면
            insane-search로 r/options·thetagang을 스캔해 "우리 데이터가 답인 글"을 찾아 밸류 초안을 드립니다 (승인 불필요).<br />
            <span className="mkc-muted" style={{ fontSize: 11.5 }}>승인+키(REDDIT_CLIENT_ID/SECRET)를 넣으면 이 자리에 실 스레드가 자동으로 뜹니다.</span>
          </div>
        </div>
      )}

      {data?.configured && (
        <div className="mkc-card-box">
          {data.threads.length === 0 && <div className="mkc-todo">지금 우리 데이터가 답이 될 만한 글이 없습니다.</div>}
          {data.threads.map((t) => (
            <div className="mkc-target" key={t.id}>
              <div className="mkc-target-main">
                <div className="mkc-draft-head">
                  <span className="mkc-ch rdt">r/{t.sub}</span>
                  {t.ticker && <span className="mkc-pill g">${t.ticker}</span>}
                  <span className="mkc-draft-meta">관련도 {t.relevance} · ↑{t.score} · 💬{t.numComments}</span>
                </div>
                <div className="mkc-target-src" style={{ marginTop: 6 }}>{t.title}</div>
                <div className="mkc-draft-actions" style={{ marginTop: 8 }}>
                  <a className="mkc-btn-sm out" href={t.permalink} target="_blank" rel="noreferrer">원글 열기 (재작성 후 게시)</a>
                </div>
              </div>
              <div className="mkc-target-side">서브당<br />1댓글/일 캡</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ===================== ⑤ 성과 (실 저장/조회) ===================== */
interface MetricsData {
  manual: { impressions?: number; profileClicks?: number; followerDelta?: number; installs?: number; repliesPosted?: number; weekOf?: string } | null;
  hits: Record<string, number>;
}

function MetricsTab() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [form, setForm] = useState({ impressions: '', profileClicks: '', followerDelta: '', installs: '', repliesPosted: '' });
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = () => fetch('/api/admin/mkt/metrics', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
    if (j.ok) { setData({ manual: j.manual, hits: j.hits || {} });
      if (j.manual) setForm({
        impressions: String(j.manual.impressions ?? ''), profileClicks: String(j.manual.profileClicks ?? ''),
        followerDelta: String(j.manual.followerDelta ?? ''), installs: String(j.manual.installs ?? ''), repliesPosted: String(j.manual.repliesPosted ?? ''),
      });
    }
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaveMsg('저장 중…');
    try {
      const r = await fetch('/api/admin/mkt/metrics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v) || 0]))),
      });
      const j = await r.json();
      setSaveMsg(j.ok ? '저장됨 ✓' : `실패: ${j.error}`);
      if (j.ok) load();
    } catch { setSaveMsg('저장 실패'); }
  };

  const m = data?.manual;
  const totalHits = data ? Object.values(data.hits).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <div className="mkc-warn" style={{ marginBottom: 14 }}>
        <span className="mkc-warn-ic">◎</span>
        <span><strong>콜드스타트 지표 우선.</strong> 오리지널 포스트 조회수는 지금 볼 숫자가 아닙니다. 히어로 지표 = 답글수·프로필클릭·팔로워증감. "포스팅 더" 트랩 차단.</span>
      </div>

      <div className="mkc-cols-4">
        <div className="mkc-stat"><div className="l">답글 게시 (주간)</div><div className="v">{m?.repliesPosted ?? '—'}</div><div className="d">목표 3~6/일 (큰 계정 스레드)</div></div>
        <div className="mkc-stat"><div className="l">프로필 클릭</div><div className="v">{m?.profileClicks ?? '—'}</div><div className="d">수동 입력</div></div>
        <div className="mkc-stat"><div className="l">팔로워 증감</div><div className="v">{m?.followerDelta ?? '—'}</div><div className="d">주간 대사</div></div>
        <div className="mkc-stat"><div className="l">?from= 유입 히트 (오늘)</div><div className="v">{totalHits || '—'}</div><div className="d">/app 패치 후 자동</div></div>
      </div>

      {/* 주간 판정 매트릭스 */}
      <div className="mkc-section"><h2>주간 판정 매트릭스</h2><span className="mkc-section-note">일요일 진단 기준</span></div>
      <div className="mkc-card-box">
        {[
          { sym: '노출 있음 + 답글 0', dx: '콘텐츠 실패', rx: '그 포맷 폐기', hit: (m?.impressions ?? 0) > 0 && (m?.repliesPosted ?? 0) === 0 },
          { sym: '노출 <50 지속', dx: '유통 실패', rx: '답글 게임 증량 · 볼륨 유지', hit: (m?.impressions ?? 999) < 50 },
          { sym: '답글 있는데 팔로우 0', dx: '프로필/핀 문제', rx: '바이오·고정포스트 정비', hit: (m?.repliesPosted ?? 0) > 0 && (m?.followerDelta ?? 0) === 0 },
          { sym: '2주 연속 전 지표 바닥', dx: '데드맨 발동', rx: '전면 정지 + 보고 · "더 많이" 금지', hit: false },
        ].map((mx) => (
          <div className="mkc-row" key={mx.sym}>
            <span className="grow"><strong>{mx.sym}</strong> {mx.hit && <span className="mkc-pill r" style={{ marginLeft: 6 }}>현재 해당</span>}</span>
            <span className="mkc-muted" style={{ flex: '0 0 120px' }}>{mx.dx}</span>
            <span className="mkc-pill n" style={{ flex: '0 0 auto' }}>{mx.rx}</span>
          </div>
        ))}
        <div className="mkc-muted" style={{ fontSize: 11.5, marginTop: 8 }}>아래 주간 지표를 입력하면 자동 진단 칩이 켜집니다.</div>
      </div>

      {/* 수동 입력 (실 저장) */}
      <div className="mkc-section"><h2>주간 지표 입력</h2><span className="mkc-section-note">X 애널리틱스·스토어 대사 {m?.weekOf ? `· 마지막 저장 주 ${m.weekOf}` : ''}</span></div>
      <div className="mkc-card-box">
        <div className="mkc-cols-3">
          <div className="mkc-field"><label>답글 게시 수 (주간)</label><input className="mkc-input" value={form.repliesPosted} onChange={(e) => setForm({ ...form, repliesPosted: e.target.value })} placeholder="0" /></div>
          <div className="mkc-field"><label>X 노출 (주간)</label><input className="mkc-input" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} placeholder="0" /></div>
          <div className="mkc-field"><label>프로필 클릭 (주간)</label><input className="mkc-input" value={form.profileClicks} onChange={(e) => setForm({ ...form, profileClicks: e.target.value })} placeholder="0" /></div>
          <div className="mkc-field"><label>팔로워 증감 (주간)</label><input className="mkc-input" value={form.followerDelta} onChange={(e) => setForm({ ...form, followerDelta: e.target.value })} placeholder="0" /></div>
          <div className="mkc-field"><label>신규 설치 (주간)</label><input className="mkc-input" value={form.installs} onChange={(e) => setForm({ ...form, installs: e.target.value })} placeholder="0" /></div>
          <div className="mkc-field"><label>&nbsp;</label><button className="mkc-btn mkc-btn-primary" style={{ height: 38 }} onClick={save}>저장</button></div>
        </div>
        {saveMsg && <div className="mkc-muted" style={{ fontSize: 12 }}>{saveMsg}</div>}
      </div>
    </>
  );
}

/* ===================== ⑥ 자산 (실 상태 + 라이브 카드) ===================== */
function AssetsTab() {
  const [conn, setConn] = useState<XConn | null>(null);
  const [cardTicker, setCardTicker] = useState('NVDA');
  useEffect(() => {
    fetch('/api/admin/mkt/x/status', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j.ok) setConn({ en: j.en, jp: j.jp }); }).catch(() => {});
  }, []);

  return (
    <>
      {/* VERDICT */}
      <div className="mkc-section"><h2>VERDICT 스코어보드</h2><span className="mkc-section-note">스스로 채점하는 공개 기록 = 복사 불가 자산</span></div>
      <div className="mkc-cols-3">
        <div className="mkc-card-box"><div className="mkc-gauge"><div className="g-num">—</div><div className="g-lab">이번주 적중률</div></div></div>
        <div className="mkc-stat"><div className="l">이번 달 전적</div><div className="v">— / —</div><div className="d">손실도 공개 유지</div></div>
        <div className="mkc-stat"><div className="l">전체 누적</div><div className="v">— / —</div><div className="d">시간-잠금 장부</div></div>
      </div>
      <div className="mkc-muted" style={{ fontSize: 11.5, marginTop: 6 }}>VERDICT 채점 파이프라인(괴리 플래그 → 3일 후 자동 판정)은 별도 빌드 — 데이터 소스 확정 후 연결.</div>

      {/* 카드 라이브 미리보기 */}
      <div className="mkc-section">
        <h2>포스트 카드 (라이브)</h2><span className="mkc-section-note">/api/og/level 실시간 렌더</span>
        <span className="mkc-section-right"><input className="mkc-input" style={{ padding: '6px 10px', width: 120 }} value={cardTicker} onChange={(e) => setCardTicker(e.target.value.toUpperCase())} placeholder="티커" /></span>
      </div>
      <div className="mkc-card-box">
        <img alt="og card" style={{ width: '100%', maxWidth: 600, borderRadius: 10, border: '1px solid var(--mkc-line)' }}
          src={`/api/og/level?ticker=${cardTicker || 'NVDA'}`} />
        <div className="mkc-muted" style={{ fontSize: 11.5, marginTop: 6 }}>레벨 값은 생성 탭에서 실데이터로 채워 첨부. 여기선 티커 카드 렌더 확인용.</div>
      </div>

      {/* pSEO + 계정 상태 */}
      <div className="mkc-cols-2" style={{ marginTop: 14 }}>
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>pSEO 레벨 페이지</div>
          <p className="mkc-panel-sub">일일 티커 레벨 페이지 + 임베드 위젯</p>
          <div className="mkc-row"><span className="grow">상태</span><span className="mkc-pill n">예정</span></div>
        </div>
        <div className="mkc-card-box">
          <div className="mkc-panel-title" style={{ fontSize: 13 }}>계정 상태 (실측)</div>
          <div className="mkc-row"><span className="grow"><span className={`mkc-dot ${conn?.en.connected ? 'on' : 'off'}`} /> @signumhq{conn?.en.username ? ` · @${conn.en.username}` : ''}</span><span className={`mkc-pill ${conn?.en.connected ? 'g' : 'n'}`}>{conn?.en.connected ? 'API 연결됨' : '연결 대기'}</span></div>
          <div className="mkc-row"><span className="grow"><span className={`mkc-dot ${conn?.jp.connected ? 'on' : 'off'}`} /> @signumhq_jp{conn?.jp.username ? ` · @${conn.jp.username}` : ''}</span><span className={`mkc-pill ${conn?.jp.connected ? 'g' : 'n'}`}>{conn?.jp.connected ? 'API 연결됨' : '연결 대기'}</span></div>
          <div className="mkc-row"><span className="grow">Premium+ 다운그레이드 리마인더</span><span className="mkc-pill a">8/13 (PC 예약)</span></div>
        </div>
      </div>
    </>
  );
}
