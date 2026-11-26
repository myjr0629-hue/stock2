// ============================================================================
// ★11/26 안드 첫 실행 법적 고지 — 체크 상자 + [계속] 2단계를 «동의하고 계속» 한 번 누름으로 (안드 앱만 · iOS·웹 그대로)
// ----------------------------------------------------------------------------
// 실측(fx:* 퍼널, ET 11/20~11/26 · 화면 만짐 계측이 생긴 뒤): 안드 노출 66 → 화면 만짐 36(55%) → 동의 체크 19(29%) → 마침 20(30%).
//   같은 기간 iOS 는 노출 77 → 만짐 72 → 체크 72 → 마침 72(94%). 안드에서 만진 사람의 절반(17명)이 체크를 못/안 하고,
//   체크한 사람은 사실상 전원(19→20) 마친다 → 막힘은 «체크 상자» 단계다. 안드 노출의 42%(28/66)는 체크 줄이 화면 밖이라
//   고정 체크 줄(11/19)이 떠야 했고, 회색 [계속]만 보이는 화면이 «안 눌리는 앱»으로 읽혔다(11/17·11/19·11/25 수리로도 29~44%).
// 바꾼 것: 안드 앱에서만 체크 상자를 그리지 않고, 같은 동의 문장(copy.ack)을 붙박이 버튼 줄 안 버튼 바로 위에 글로 보이게 두고,
//   버튼을 처음부터 켠 «동의하고 계속»으로 — 누르는 순간이 동의(클릭랩: 동의 문장이 버튼 바로 위에 늘 보임 · 약관·개인정보 링크 그대로).
//   고지 본문·4개 항목·약관/개인정보 링크·제목·단계 표시 글은 그대로다.
// 끄기: ANDROID_ONE_TAP_LEGAL = false (또는 이 커밋 되돌리기) → 안드도 11/25 화면(체크 상자 + [계속])으로 돌아간다.
// ============================================================================

/** 끄기 스위치 — false 면 안드도 예전 체크 상자 + [계속] */
export const ANDROID_ONE_TAP_LEGAL = true;

/** 한 번 누름 동의를 쓰나 — 안드 «앱»(Capacitor 네이티브)만. iOS·웹·안드 브라우저는 false(화면 불변) */
export function legalOneTapOn(platform: string | null | undefined, enabled: boolean = ANDROID_ONE_TAP_LEGAL): boolean {
  return enabled && platform === 'android';
}

/** 지금 셸의 플랫폼 — funnelBeacon 과 같은 판정(Capacitor 네이티브일 때만 ios/android, 아니면 web) */
export function shellPlatform(win: unknown = typeof window !== 'undefined' ? window : undefined): 'ios' | 'android' | 'web' {
  try {
    const cap = (win as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } } | undefined)?.Capacitor;
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.();
      return p === 'ios' ? 'ios' : p === 'android' ? 'android' : 'web';
    }
  } catch { /* 웹 */ }
  return 'web';
}

/** 한 번 누름 버튼 글 — 버튼 글만 바뀐다(동의 문장은 copy.ack 그대로) */
export const LEGAL_AGREE_LABEL: Record<'ko' | 'en' | 'ja', string> = {
  ko: '동의하고 계속',
  en: 'Agree & continue',
  ja: '同意して続ける',
};

export function legalAgreeLabel(locale: string): string {
  return LEGAL_AGREE_LABEL[(locale === 'ko' || locale === 'ja') ? locale : 'en'];
}
