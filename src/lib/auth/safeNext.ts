// ============================================================================
// 로그인 뒤 돌아갈 경로(next) — 같은 사이트의 절대 경로만 (2026-09-30)
// ----------------------------------------------------------------------------
// 쓰는 곳: 로그인 화면(비밀번호·구글·이메일 가입) · /auth/callback · /api/stripe/checkout(로그인 요구)
// 왜: 웹 결제가 로그인 없이 세션을 만들어 계정에 연결되지 않았다 → 결제 전에 로그인을 요구하고,
//     로그인이 끝나면 «결제를 이어가는» 주소로 돌려보낸다. 그 주소는 쿼리로 오가므로 반드시 검사한다.
//     예전 /auth/callback 은 next 를 검사하지 않고 `${origin}${next}` 로 붙였다 —
//     next="@evil.com" 이면 https://www.signumhq.com@evil.com(= evil.com)으로 가는 열린 리다이렉트였다.
// 규칙: «/» 로 시작, «//» 로 시작하지 않음, 역슬래시·제어문자 없음, 512자 이하. 아니면 fallback.
// ============================================================================

export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 512) return fallback;
  if (!s.startsWith('/') || s.startsWith('//')) return fallback;
  if (s.includes('\\') || /[\u0000-\u001f\u007f]/.test(s)) return fallback;
  return s;
}

/** 결제를 이어가는 주소(로그인 뒤 목적지). 서버가 세션을 만들어 Stripe 결제 화면으로 보낸다. */
export function checkoutResumePath(plan: string, billing: string, locale: string): string {
  return `/api/stripe/checkout?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}&locale=${encodeURIComponent(locale)}`;
}

/** 로그인 화면 주소 — 끝나면 next 로 돌아온다. */
export function loginPathWithNext(locale: string, next: string): string {
  const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  return `/${loc}/login?next=${encodeURIComponent(next)}`;
}

// ----------------------------------------------------------------------------
// 구글 로그인·이메일 가입은 Supabase 를 돌아 /auth/callback 으로 온다. 그 redirectTo 주소는 Supabase 의
// 허용 목록과 맞아야 해서 그대로 둔다(쿼리를 붙이면 목록 설정에 따라 로그인 자체가 깨질 수 있다 — 확인 불가).
// 대신 «돌아갈 곳»을 짧은 쿠키로 넘기고, 콜백이 읽은 뒤 지운다.
// ----------------------------------------------------------------------------
export const NEXT_COOKIE = 'shq_next';
export const NEXT_COOKIE_MAX_AGE = 1800; // 30분 — 이메일 확인 링크까지 기다린다

/** document.cookie 에 넣을 문자열. 검사를 통과한 next 면 저장, 아니면 지운다(예전 시도의 찌꺼기 방지). */
export function nextCookieString(next: string | null | undefined, secure = false): string {
  const v = safeNext(next, '');
  const tail = `; path=/; samesite=lax${secure ? '; secure' : ''}`;
  return v ? `${NEXT_COOKIE}=${encodeURIComponent(v)}; max-age=${NEXT_COOKIE_MAX_AGE}${tail}` : `${NEXT_COOKIE}=; max-age=0${tail}`;
}

/** 쿠키 값 → 검사한 경로(없거나 이상하면 빈 문자열). */
export function nextFromCookieValue(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    return safeNext(decodeURIComponent(raw), '');
  } catch {
    return '';
  }
}
