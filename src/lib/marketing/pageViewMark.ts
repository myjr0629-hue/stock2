// 서버 컴포넌트(페이지·레이아웃)에서 한 줄로 부르는 «사람 페이지뷰» 표시 — 규칙·키·상한은 pageViewHuman.ts (2026-10-04)
//   await markPageView('ticker', locale);
// 응답을 막지 않는다: 헤더를 읽어 분류만 하고(마이크로초), 쓰기는 after() 로 응답 «뒤»에 한다. 렌더 출력은 없다(클라이언트 JS 0).
import { headers, cookies } from 'next/headers';
import { after } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { etDate, pageViewFields, pvLocale, recordPageView, type PvGroup } from './pageViewHuman';

export async function markPageView(group: PvGroup, locale?: string): Promise<void> {
  // headers()·cookies() 는 try 밖에 둔다 — Next 의 «동적 렌더» 신호를 삼키면 안 된다. (대상 페이지는 이미 [locale]/layout 때문에 동적이다)
  const h = await headers();
  const jar = await cookies();
  try {
    // 앱 웹뷰 = 셸이 심는 sig_native 쿠키(iOS·안드 공통) 또는 UA 의 패키지명. 쿠키는 읽기만 한다(심지 않는다).
    const native = (h.get('user-agent') || '').includes('com.signumhq.app') || jar.get('sig_native')?.value === '1';
    const f = pageViewFields(h, 'GET', native);   // 서버 컴포넌트는 메서드를 모른다 — HEAD 는 사람 브라우저가 이동에 쓰지 않는다
    if (!f) return;
    // 로케일: 페이지가 넘긴 값 → next-intl 미들웨어가 붙이는 요청 헤더 → 주소 첫 칸(그래도 없으면 xx)
    const loc = pvLocale(locale ?? h.get('x-next-intl-locale') ?? (h.get('x-pathname') || '').split('/')[1]);
    const day = etDate();
    after(() => recordPageView(group, loc, day, f));
  } catch (e) {
    unstable_rethrow(e);
    /* 집계 준비 실패는 화면에 닿지 않는다 */
  }
}
