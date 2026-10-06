// ============================================================================
// 공유 루프 — 앱 화면의 콘텐츠를 «그 콘텐츠의 공개 URL» 로 내보낸다. (2026-09-29)
// ----------------------------------------------------------------------------
// 왜: 대표 지시 «앱 설치 트래픽을 기하급수적으로». 설치는 폰에서 난다(자사 웹 CTA 는 폰 80%,
//   소셜 클릭은 PC 78% — research/INFLOW-MAX-2026-09-27.md). 앱 사용자가 친구에게 보내는
//   링크는 폰에서 폰으로 간다 → 설치에 가장 가까운 클릭이다.
//
// URL 규칙: https://www.signumhq.com/<locale>/<경로>?<…>&from=share&via=ios|android|web
//   · from=share — 받은 쪽 페이지가 이걸 보면 앱 CTA 를 /app?from=share 로 달아 준다
//     → 기존 스마트링크 집계(mkt:attr:hit:share:<ET날짜>)가 «그대로» 센다. 새 집계 경로 없음.
//   · via — 보낸 쪽 플랫폼. Capacitor 가 네이티브 웹뷰에 주입하는 window.Capacitor 로만
//     판정한다(@capacitor/core import 0 — 번들 무증가).
//
// 공유 수단: Web Share API(iOS WKWebView·모바일 브라우저) → 없으면(안드로이드 WebView 등)
//   링크 복사 → 그것도 막히면 prompt 로 주소를 보여준다(Capacitor 가 네이티브 대화상자로 그린다).
//   @capacitor/share 는 설치돼 있지 않다 — 넣으려면 스토어 빌드가 필요해서 웹만으로 한다.
// ============================================================================

export type ShareSurface = 'ticker' | 'rank' | 'uc' | 'wim'
  // ★2026-10-06 «친구에게 PRO 1개월 선물»(lib/gift) — gift_set = 설정 카드 · gift_dash = 대시보드 맨 아래 단추. tap·sent 만(받은 쪽은 /app?from=gift 가 센다)
  | 'gift_set' | 'gift_dash';
export type ShareVia = 'ios' | 'android' | 'web';
export type ShareEvent = 'tap' | 'sent' | 'open' | 'click';
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** 공유 링크는 항상 운영 도메인이다 — 프리뷰에서 눌러도 받는 사람은 운영 페이지를 본다. */
export const SHARE_ORIGIN = 'https://www.signumhq.com';

type CapGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

/** 보낸 쪽 플랫폼. 네이티브 셸이 아니면 전부 web. */
export function shareVia(): ShareVia {
  try {
    const cap = (window as unknown as { Capacitor?: CapGlobal }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.();
      if (p === 'ios' || p === 'android') return p;
    }
  } catch { /* SSR·웹 */ }
  return 'web';
}

/** `/ko/flow/NVDA` + {…} → 운영 도메인 공유 URL(from=share&via=… 를 붙인다). */
export function buildShareUrl(path: string, params: Record<string, string> = {}, via: ShareVia = shareVia()): string {
  const u = new URL(path, SHARE_ORIGIN);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  u.searchParams.set('from', 'share');
  u.searchParams.set('via', via);
  return u.toString();
}

/**
 * 공유 퍼널 한 칸을 센다(tap → sent → open → click). 응답을 기다리지 않는다.
 * 저장은 EC2 레디스 전용 키(share:*)라 Upstash 트래픽이 늘지 않는다 — /api/share-hit 참고.
 */
export function shareBeacon(e: ShareEvent, s: ShareSurface, via?: string | null): void {
  try {
    const v = via === 'ios' || via === 'android' || via === 'web' ? via : 'na';
    const q = `/api/share-hit?e=${e}&s=${s}&v=${v}`;
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(q)) return;
    void fetch(q, { method: 'POST', keepalive: true }).catch(() => {});
  } catch { /* 집계 실패가 공유를 막지 않는다 */ }
}

/**
 * 시스템 공유 시트 → 링크 복사 → prompt 순서.
 * ⚠️ 클릭 핸들러에서 «곧바로» 부른다. iOS 는 사용자 제스처가 살아 있을 때만 시트를 연다.
 */
export async function shareOrCopy(data: { title?: string; text?: string; url: string }): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // ★ 링크는 문구 «안에» 넣어 한 덩어리로 넘긴다. text 와 url 을 따로 주면 iOS 공유 시트의 «복사»가
  //   문구만 클립보드에 넣고 링크를 떨군다(2026-09-29 시뮬레이터 실측: pbpaste = 문구뿐).
  //   카톡·아이메시지·왓츠앱은 문구 속 링크로 미리보기 카드를 만든다 — 링크가 두 번 찍히는 일도 없다.
  const line = data.text ? `${data.text}\n${data.url}` : data.url;
  if (typeof nav.share === 'function') {
    const payload: ShareData = data.text ? { text: line } : { url: data.url };
    if (data.title) payload.title = data.title;
    let allowed = true;
    try { allowed = nav.canShare ? nav.canShare(payload) : true; } catch { allowed = true; }
    if (allowed) {
      try {
        await nav.share(payload);
        return 'shared';
      } catch (err) {
        // 사용자가 시트를 닫은 것 — 실패가 아니다. 복사로 넘어가지 않는다.
        if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
        // NotAllowedError(제스처 만료) 등은 아래 복사로 내려간다.
      }
    }
  }
  try {
    await navigator.clipboard.writeText(line);
    return 'copied';
  } catch { /* 권한·비보안 문맥 → 아래 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = line;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, line.length);
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) return 'copied';
  } catch { /* 아래 */ }
  // 마지막 수단: 주소를 대화상자에 띄워 사용자가 직접 복사하게 한다(복사 «성공»으로 세지 않는다).
  try { window.prompt(data.title || 'Link', data.url); } catch { /* 대화상자도 막힌 환경 */ }
  return 'failed';
}
