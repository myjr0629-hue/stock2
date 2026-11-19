// ============================================================================
// ★11/20 첫 실행 법적 고지 «왜 안 넘어가나» 진단 계측 — 화면·문구·동의 방식은 그대로, 하루 합계만(식별자·기기 정보 없음)
// ----------------------------------------------------------------------------
// 11/19 ET 안드 법적 고지 노출 11 → 마침 1. 그런데 고정 체크 줄 보임은 2, 회색 [계속] 누름은 2 뿐이었다
// → 나머지 대부분은 «체크 줄이 보이는데도» 아무것도 안 하고 떠났다. 실기(안드 15 에뮬레이터, 375×812·360×640 글꼴 130%)에서
// 체크 → [계속] → 다음 단계가 정상 동작했다. 지금 계측으로는 «화면을 만졌나 / 체크했나 / 앱을 떠났나 / 어느 언어 사용자인가 /
// 같은 기기가 다시 연 노출인가»를 가를 수 없어 원인을 특정하지 못한다. 그래서 그 다섯 가지만 센다:
//   onb_show · onb_l{ko,en,ja}  법적 고지 노출의 언어별 몫(onb_show/onb_legal 과 같은 순간·같은 가드)
//   onb_done · onb_l{ko,en,ja}  법적 고지 마침의 언어별 몫
//   onb_show · onb_lrep         이 기기에서 법적 고지를 «전에도» 본 적 있는 노출(재실행) — 노출 수가 사람 수보다 부푼 정도
//   onb_tap  · onb_legal        법적 고지가 떠 있는 동안 화면을 한 번이라도 만졌다(실행당 한 번)
//   onb_check· onb_legal        동의 체크를 켰다(실행당 한 번)
//   onb_hide · onb_legal        동의를 마치기 전에 앱이 뒤로 갔다(홈·전환·끄기 — 실행당 한 번)
// ============================================================================

export type LegalLocaleSrc = 'onb_lko' | 'onb_len' | 'onb_lja';

/** 법적 고지 언어 → 출처. ko·ja 외에는 전부 영어 화면(COPY 폴백과 같다) */
export function legalLocaleSrc(locale: string | null | undefined): LegalLocaleSrc {
  return locale === 'ko' ? 'onb_lko' : locale === 'ja' ? 'onb_lja' : 'onb_len';
}

/** 언어별 마침(onb_done · onb_l*)의 세션 가드 이름 — 퍼널 단계·출처가 아니다(서버로 가지 않음). onb_ 로 시작하지 않게 둔다(닫힌 목록 대조 시험) */
export const LEGAL_LOCALE_DONE_GUARD = 'diag_legal_done';

/** 이 기기에서 법적 고지를 본 적이 있다는 표식(localStorage — 값은 '1' 하나, 식별자 아님) */
export const LEGAL_SEEN_KEY = 'signumhq.app.onb.legalSeen';

/**
 * 이번 법적 고지 노출이 «다시 본» 노출인가 — 표식이 이미 있으면 true, 없으면 표식을 남기고 false.
 * 저장소가 없거나 막혀 있으면 false(모르면 새 노출로 본다 — 부풀리지 않는다).
 */
export function legalSeenBefore(storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(LEGAL_SEEN_KEY) === '1') return true;
    storage.setItem(LEGAL_SEEN_KEY, '1');
  } catch {
    /* 저장소 오류 — 새 노출로 본다 */
  }
  return false;
}
