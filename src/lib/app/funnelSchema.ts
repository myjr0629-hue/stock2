// ============================================================================
// 구독 퍼널 — 닫힌 목록과 키 규칙 (순수 모듈: 클라이언트 funnel.ts · 서버 /api/funnel-hit · 시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜 (2026-09-30): RevenueCat 28일 신규 121 · 체험 0 · 구독 0 — 어디서 끊기는지 볼 수단이 없었다.
//   페이월이 몇 번 열렸나(어디서) → 몇 번 눌렀나 → 결제 결과(성공·취소·오류 코드) → 복원.
//
// 싣는 것: 단계 · 출처(화면) · 플랫폼 · 앱 버전 · (오류일 때) 오류 코드 — 전부 닫힌 목록.
// 싣지 않는 것: 기기 식별자·사용자 ID·IP·종목·가격·거래 ID. 서버는 «하루 합계 숫자»만 남긴다.
//   애플 개인정보 라벨: «사용 데이터 › 제품 상호작용 — 분석 — 사용자와 연결되지 않음» 선언 범위.
//   Play 데이터 보안 «앱 활동 › 앱 상호작용 — 분석 — 공유 안 함»은 2026-10-14 선언·심사 제출 → 안드로이드 앱도 보낸다(funnelBeacon.ts FUNNEL_SEND_ANDROID).
// ============================================================================

export const FUNNEL_STAGES = [
  'open',          // 페이월(또는 «내 종목» 판매 시트)이 열렸다
  'cta',           // 구매 버튼을 눌렀다
  'buy_ok', 'buy_cancel', 'buy_err',            // 결제 결과
  'restore_ok', 'restore_none', 'restore_err',  // 복원 결과(none = 복원할 구매 없음)
  'code_open', 'code_cta', 'code_pro',          // 🎟 쿠폰 코드 입력을 열었다 · (안드) 안내 시트의 [계속] = 구독 결제 창 열기(2026-10-06, lib/app/couponGuide.ts)
                                                //   · 코드 흐름 뒤 PRO 확인(2026-10-05, lib/app/redeem.ts). 결제 결과는 다른 결제와 같이 buy_* 로 센다
  'push_open',     // 푸시 알림을 눌러 앱이 열렸다(2026-10-12, app-view/layout.tsx) — 출처 push_morning·push_closing
  'active',        // 앱 활성 — 기기마다 ET 하루 1회(기기에서 날짜로 중복을 거른다 — 식별자 없음, 2026-10-12) — 출처 app
  'ai_seen', 'ai_tap',                          // «내 종목» AI 한 줄(2026-10-12): 줄이 보였다(앱 실행당 종목마다 한 번) · 줄이 보이는 행을 눌러 종목 화면으로 갔다 — 출처 'wl_ai' · 대시보드 «오늘 볼 것»: 카드가 보였다(앱 실행당 한 번) · 항목을 눌러 전체보기로 갔다 — 출처 'today_picks'
  // 첫 실행 «가치 먼저»(2026-10-12, lib/app/firstRunValue.ts) — 출처 = 어느 단계(onb_*). 하루 합계만, 식별자·종목 없음
  'onb_show',      // 단계 화면이 보였다(실행당 단계마다 한 번) — 출처 onb_legal·onb_value·onb_notif·onb_oldalert
  'onb_done',      // 단계를 마쳤다([계속]·[담고 계속]·[알림 받기]·옛 [시작하기]) — 같은 출처
  'onb_skip',      // 건너뛰었다(가치 단계 [건너뛰기]·알림 단계 [나중에]) — onb_value·onb_notif
  'onb_pick',      // 가치 단계에서 고른 종목 수 — 출처 onb_n1·onb_n2·onb_n3 (종목 이름은 싣지 않는다) · 기본 선택 onb_dflt(골라 둔 채 시작)·onb_dkeep(그대로 담음)·onb_dedit(바꿔 담음)
  'onb_perm',      // 알림 권한 창의 결과(네이티브) — 출처 onb_allow·onb_deny
  'onb_card',      // 이 단계를 떠날 때(담고 계속·건너뛰기), 한 번이라도 고른 종목마다 — 출처 onb_ai(떠날 때까지 AI 한 줄이 «한 번이라도» 떴다)·onb_noai(끝내 안 떴다)·onb_earn(실적 14일 안 줄이 떴다 — 옵션 반영 변동폭 포함, 값이 있으면)
  'onb_nudge',     // ★11/17 법적 고지에서 동의 전 회색 [계속]을 눌렀다(실행당 한 번) → 동의 체크 줄로 굴림·깜빡임(lib/app/legalNudge) — 출처 onb_legal
  'onb_pin',       // ★11/19 법적 고지에서 진짜 동의 체크 줄이 화면 밖이라 [계속] 바로 위에 고정 체크 줄을 띄웠다(실행당 한 번 · lib/app/legalNudge legalPinNext) — 출처 onb_legal
  'onb_tap', 'onb_check', 'onb_hide', // ★11/20 법적 고지 진단(lib/app/legalDiag · 실행당 한 번 · 출처 onb_legal): 화면을 한 번이라도 만졌다 · 동의 체크를 켰다 · 마치기 전에 앱이 뒤로 갔다
  'onb_back',      // ★11/22 안드 첫 실행 화면에서 뒤로 가기(버튼·제스처)를 눌렀다 — 앱을 닫지 않고 화면에 알림(2초 안 두 번째면 앱 내림 · lib/app/onbBack · 실행당 한 번) — 출처 = 그 단계(onb_legal·onb_value·onb_notif)
  'trial_notice_show', 'trial_notice_manage', 'trial_notice_snooze', // 체험 종료 안내 표시·관리 탭·7일 숨김. 동의 완료/유료 전환이 아님
  'cancel_reason:show', 'cancel_reason:skip', 'cancel_reason:price', 'cancel_reason:not_used', 'cancel_reason:missing_feature', 'cancel_reason:other_app', 'cancel_reason:other',
  'trial_off_show', 'trial_off_manage', 'trial_off_close', 'trial_off_expired', // 갱신 끈 체험 안내의 익명 합계
  'trial_off_plans', // ★11/11 체험 종료 안내의 «PRO 요금제 보기»(페이월 열림·구매는 출처 trial_off 의 open·cta·buy_* 로 센다)
  'trial_push_shown', 'trial_push_accept', 'trial_push_os_granted', 'trial_push_os_denied', 'trial_push_dismiss', // ★11/18 체험자 알림 다시 묻기(lib/app/trialPushOptIn): 시트 보임 · [알림 켜기] · OS 허용 · OS 거절 · [나중에] — 출처 tpush_ai·tpush_day1
  'fr_judge',      // ★11/20 첫 실행 체험 페이월 판정(lib/app/firstRunPaywall · 실행당 한 번씩): 출처 fr_try = 판정 시작 · fr_late = 재시도·늦게 보임 · 그 밖의 fr_* = 안 보인 이유(페이월이 보이면 open/first_run 으로 센다)
  'reward_ok',     // ★11/20 광고 잠금해제(1시간 · 11/20 오후부터 누른 잠금 하나만 — lib/app/adUnlockScope)가 주어졌다(ValueWall useAdUnlockGate) — 출처 value_wall = 보상형 광고 끝까지 봄 · ad_modal = 광고 없을 때 30초 대체 창 · rw_more = 위 둘 중 다른 잠금이 이미 열린 채 또 열었다(같은 해제에 덧붙여 한 번 더)
  'rv_cap', 'rv_ask', 'rv_block', 'rv_why', // ★11/20 스토어 평점 요청(lib/app/reviewBeacon — 구매 퍼널 아님): 플러그인 있나(기기당 ET 하루 1회, rv_yes·rv_no) · OS 평점 API 실제 요청 · 순간이 왔지만 못 부름(출처 = 순간 rv_day…rv_pro) · 못 부른 이유(rv_modal…rv_noplug)
  'rw_then',       // ★11/20 해제 뒤 24시간 안에 이 기기에서 처음 일어난 페이월 열림·구매 버튼·결제 성공(기기 안에서만 잇고 서버엔 하루 합계만) — 출처 rw_open·rw_cta·rw_buy
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_SRCS = [
  'settings',    // 설정 › SIGNUM Pro
  'value_wall',  // 프리미엄 데이터 가치 벽의 «광고 없이 보기»
  'ad_modal',    // 보상형 광고 창의 «매번 기다리지 않으려면»
  'dash_gate',   // 대시보드 게이트의 광고 제거
  'wl_limit',    // «내 종목» 한도 시트(무료 5개)
  'wl_upsell',   // «내 종목» PRO·알림 안내 시트
  'wl_paywall',  // «내 종목» 시트가 연 페이월(스토어 가격을 못 받았을 때)
  'preview',     // 프리뷰 배포의 페이월 확인 화면
  'other',
  'push_morning', 'push_closing',   // 푸시 탭(push_open)의 종류 (2026-10-12)
  'push_sig_wall', 'push_sig_pain', 'push_sig_dark', 'push_sig_oi', 'push_sig_earn', 'push_sig_price',   // push_sig_price = PRO 가격 레벨 알림(2026-11-12) · «내 종목 이상 신호» 푸시 탭(push_open)의 종류 — 콜월·풋플로어·감마플립 / 맥스페인 / 다크풀 / 미결제약정 / 실적 D-1 (2026-10-13). 발송은 서버가 센다(push:stats:signal:{ET날짜})
  'app',                            // 앱 활성(active) (2026-10-12)
  'wl_ai',                          // «내 종목» AI 한 줄(ai_seen·ai_tap 전용 — 구매 출처로 쓰지 않는다, 2026-10-12)
  'today_picks',                    // 대시보드 «✦ AI 오늘 볼 것» 카드(ai_seen·ai_tap 전용 — 구매 출처로 쓰지 않는다, 2026-10-13)
  'today_page',                     // «오늘 볼 것» 전체 페이지(app-view/today — ai_seen = 페이지가 열렸다 · ai_tap = 항목을 눌러 종목 화면으로 갔다, 2026-10-13)
  'news_page',                      // 뉴스 펄스 «전체 보기» 페이지(app-view/guardian/news — ai_seen = 페이지가 열렸다 = 카드의 «전체 보기»를 눌렀다, 구매 출처로 쓰지 않는다, 2026-10-13). ai_tap 은 «✦AI 한 줄 → 종목 화면»(평점 순간 ③)이라 쓰지 않는다
  // 첫 실행(onb_* 단계 전용 — 구매 출처로 쓰지 않는다, 2026-10-12)
  'onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert',   // 단계: 법적 고지 · 가치(종목 고르기) · 알림 · 옛 흐름의 2/2 알림 단계(끄기 스위치 onb2:off 일 때)
  'onb_n1', 'onb_n2', 'onb_n3',                            // 고른 종목 수
  'onb_allow', 'onb_deny',                                 // 알림 권한 결과
  'onb_ai', 'onb_noai', 'onb_earn',                        // 카드 상태
  'onb_lko', 'onb_len', 'onb_lja', 'onb_lrep',             // ★11/20 법적 고지 진단(lib/app/legalDiag): onb_show·onb_done 의 언어별 몫(ko·en·ja) · onb_show 중 이 기기가 전에도 본 노출(재실행)
  'onb_dflt', 'onb_dkeep', 'onb_dedit',                    // 기본 선택(2026-11-13, onb_pick 전용): 실적 임박 인기 종목을 골라 둔 채 단계가 시작됐다 · 담고 계속 = 기본 그대로 · 바꿔서
  'trial_notice',                   // 대시보드 체험 종료 안내 — 식별자·국가·가격·종료일 없음
  'trial_off',
  'trial_off_early',                // ★11/11 갱신 끈 직후 1회 안내(같은 시트 · 시트 단계와 그 시트가 연 페이월의 open·cta·buy_*)
  'push_trial',                     // ★11/11 체험 종료 D-2 푸시 탭(push_open 전용)
  'push_trial_d3', 'push_trial_d6', // ★11/19 체험 중 가치 알림 탭(push_open 전용 · /api/cron/trial-push · lib/push/trialValuePush) — 3일째(내 종목 AI 한 줄·AI 브리핑) · 6일째(장 마감 리포트)
  'push_comeback',                  // ★11/21 체험 만료 D+1 «다시 시작» 할인 코드 푸시 탭(push_open · 이어서 애플 적용 화면 code_open·code_pro · lib/push/comebackPush)
  'push_announce',                  // ★11/14 관리자 공지 푸시 탭(push_open 전용 · /api/admin/announce)
  'trial_expired',                  // ★11/11 체험 만료 뒤 첫 실행 1회 페이월(open = 보였다 · cta · buy_* · restore_*)
  'trial_expired_offer',            // ★11/12 그 페이월 안의 «월간 첫 달 할인» 카드(open = 카드가 보였다 · cta = 할인 카드로 결제 단추 · buy_* = 할인 결제 결과)
  'gate_first',                     // ★11/16 하루 첫 게이트 탭(«광고 보고 잠금해제»)이 광고 전에 연 페이월(lib/app/gatePaywall ①) — 닫으면 광고가 이어진다
  'ad_nofill',                      // ★11/16 네이티브 보상형 광고가 안 나왔을 때 대체 30초 창 전에 연 페이월(lib/app/gatePaywall ②)
  'first_run',                      // ★11/16 첫 실행이 끝난 직후 1회 «7일 무료 체험» 페이월(lib/app/firstRunPaywall — 체험 자격 확인된 무료 사용자만)
  'trial_announce',                 // ★11/16 밤 기존 무료 사용자 1회 «새로 생긴 7일 무료 체험» 페이월(lib/app/trialAnnounce — 체험 자격·이력 0 확인된 무료 사용자만, 앱 포그라운드 때)
  'tpush_ai', 'tpush_day1',         // ★11/18 체험자 알림 다시 묻기의 트리거(trial_push_* 전용 — 구매 출처로 쓰지 않는다): 내 종목 첫 AI 한 줄 · 체험 다음 날 첫 실행
  'rw_more', 'rw_open', 'rw_cta', 'rw_buy', // ★11/20 광고 잠금해제 계측 전용(구매 출처로 쓰지 않는다): reward_ok 의 «다른 잠금이 이미 열림» · rw_then 의 열림·버튼·결제
  // ★11/20 첫 실행 체험 페이월 판정(fr_judge 전용 — 구매 출처로 쓰지 않는다, lib/app/firstRunPaywall FIRST_RUN_SKIPS 와 같아야 한다)
  'fr_try', 'fr_late',              // 판정 시작(네이티브·첫 실행을 막 마침) · 재시도 끝에 또는 예전 상한(8초) 뒤에 보였다
  'fr_pro', 'fr_seen', 'fr_noiap', 'fr_noelig', 'fr_unk', 'fr_nooffer', 'fr_wait', 'fr_chk', 'fr_busy', // 안 보인 이유: PRO(코드 포함)·결제 중 · 이미 봄/저장소 막힘 · 결제 불가 · 체험 자격 없음(확정) · 자격 끝내 모름 · 오퍼링 없음 · PRO 상태 못 받음 · 스토어 재조회 실패 · 다른 시트·페이월과 겹침
  // ★11/20 스토어 평점 요청(rv_* 전용 — 구매 출처로 쓰지 않는다, lib/app/reviewBeacon)
  'rv_yes', 'rv_no',                // rv_cap: InAppReview 플러그인 있음 · 없음
  'rv_day', 'rv_run', 'rv_watch', 'rv_ai', 'rv_intel', 'rv_earn', 'rv_push', 'rv_pro', // 순간: 사용일 2·7 · 앱 실행(3·4·10번째) · 담기 2번째 · ✦AI 한 줄 2번째 · 인텔 열람 2·7 · 실적(발표 완료 행·범위 안 반응) · 알림 탭 · PRO 성공
  'rv_modal', 'rv_ad', 'rv_gift', 'rv_hidden', 'rv_today', 'rv_gone', 'rv_noplug', // 못 부른 이유: 시트·페이월 떠 있음 · 광고 중·직후 · 선물 안내 직후 · 앱이 뒤로 감 · 오늘 다른 순간이 이미 물음 · 화면 이동·취소 · 플러그인 없음
  // ★11/22 블랙프라이데이 앱 안 안내(lib/app/blackFriday): bf_sheet = 자동 1회 시트가 보였다(open) · bf_line = 페이월·설정 블프 줄이 연 시트(open)
  //   bf_sy·bf_sm = 시트의 연간·월간 단추(code_open → 돌아와 PRO 면 code_pro)
  'bf_sheet', 'bf_line', 'bf_sy', 'bf_sm',
  // ★11/23 무료 네이티브 사용자 «하루 한 번» 앱 열 때 체험 페이월(lib/app/dailyPaywall — 첫 실행 직후 세션 제외 · 스토어 재조회 무료 확인 · 다른 시트와 같은 날 겹치지 않게): open·cta·buy_*
  'daily_open',
] as const;
export type FunnelSrc = (typeof FUNNEL_SRCS)[number];

export const FUNNEL_PLATFORMS = ['ios', 'android', 'web'] as const;
export type FunnelPlatform = (typeof FUNNEL_PLATFORMS)[number];

const STAGE_SET = new Set<string>(FUNNEL_STAGES);
const SRC_SET = new Set<string>(FUNNEL_SRCS);
const PLAT_SET = new Set<string>(FUNNEL_PLATFORMS);

export const isFunnelStage = (x: unknown): x is FunnelStage => typeof x === 'string' && STAGE_SET.has(x);
export const isFunnelSrc = (x: unknown): x is FunnelSrc => typeof x === 'string' && SRC_SET.has(x);
export const isFunnelPlatform = (x: unknown): x is FunnelPlatform => typeof x === 'string' && PLAT_SET.has(x);

/** 앱 버전 — 숫자 점 형식만(최대 4마디·15자). 아니면 'na'. */
export function normalizeVersion(v: unknown): string {
  const s = String(v ?? '').trim();
  return s.length <= 15 && /^\d{1,3}(\.\d{1,3}){0,3}$/.test(s) ? s : 'na';
}

/**
 * 오류 코드 — RevenueCat PURCHASES_ERROR_CODE("0"~"42") → rc<숫자>, 우리 서비스의 사유 → 짧은 이름.
 *   rc1 = 사용자 취소 · rc2 = 스토어 문제 · rc3 = 결제 불가 기기 · rc5 = 상품 없음 · rc10 = 네트워크
 *   rc11 = 자격 오류(Play 서비스 계정 등) · rc15 = 이미 진행 중 · rc20 = 결제 대기 · rc23 = 설정 오류
 *   iap = 이 기기에서 구매 불가(웹·SDK 미설정) · nooffer = 스토어 가격(오퍼링) 없음 · noent = 결제됐는데 권한 미반영
 */
export function normalizeCode(c: unknown): string {
  const s = String(c ?? '').trim().toLowerCase();
  if (/^rc\d{1,2}$/.test(s)) return s;
  if (s === 'iap' || s === 'nooffer' || s === 'noent') return s;
  return 'x';
}

/** 구매·복원 결과(PurchaseOutcome) → 퍼널 단계와 코드. */
export type OutcomeLike = { ok: boolean; isPro: boolean; cancelled?: boolean; error?: string; code?: string };
export function outcomeStage(kind: 'buy' | 'restore', o: OutcomeLike): { stage: FunnelStage; code?: string } {
  const code = o.code ? normalizeCode(o.code)
    : o.error === 'iap_unavailable' ? 'iap' : o.error === 'no_offering' ? 'nooffer' : 'x';
  if (kind === 'buy') {
    if (o.ok) return o.isPro ? { stage: 'buy_ok' } : { stage: 'buy_ok', code: 'noent' };
    if (o.cancelled) return { stage: 'buy_cancel' };
    return { stage: 'buy_err', code };
  }
  if (o.ok) return { stage: o.isPro ? 'restore_ok' : 'restore_none' };
  return { stage: 'restore_err', code };
}

/**
 * 레디스 키. 접두사 fx·fxp 는 redisClient 의 복제 정책(REPLICATE_PREFIXES·UPSTASH_ONLY_PREFIXES) 밖 →
 *   TTL 쓰기는 EC2 에만 간다(Upstash 명령 0 — 프록시 장애 때만 폴백). 프리뷰·로컬은 fxp(운영 숫자 오염 방지).
 *   ①  <ns>:<단계>:<출처>:<플랫폼>:<ET날짜>   정수 — 퍼널 본표
 *   ②  <ns>:v:<ET날짜>   {"단계|플랫폼|버전": n}   버전별(열린 목록이라 한 키에 모은다)
 *   ③  <ns>:c:<ET날짜>   {"단계|플랫폼|코드": n}   오류 코드별(오류·noent 일 때만)
 */
export function funnelNs(vercelEnv: string | undefined): 'fx' | 'fxp' {
  return vercelEnv === 'production' ? 'fx' : 'fxp';
}
export function funnelKeys(ns: string, day: string, stage: FunnelStage, src: FunnelSrc, plat: FunnelPlatform) {
  return {
    main: `${ns}:${stage}:${src}:${plat}:${day}`,
    ver: `${ns}:v:${day}`,
    code: `${ns}:c:${day}`,
  };
}

/** 미국 동부 날짜(YYYY-MM-DD) — /app 의 etDate()·mkt:attr 키와 같은 날짜 경계. */
export function etDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
