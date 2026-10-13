/**
 * 공유 카드 + 선물함 문구(한·일·영) — 2026-10-14 (브랜치 feat/viral-loop)
 * 규칙: ① 자동 갱신 고지는 «무료» 문장 «안에» ② 가짜 희소성 금지(«선착순»·남은 수·타이머 없음) ③ 가격 숫자 없음(스토어가 사용자 통화로 청구) ④ 투자 권유·수익 약속 없음 —
 *   공유 문구는 화면에 «이미 그려진» 줄(규칙 문장·✦AI 해설·옵션 반영 변동폭)을 그대로 싣는다. 새로 지어내지 않는다.
 * 링크는 shareOrCopy 가 문구 «맨 끝»에 붙여 한 문자열로 넘긴다(iOS «복사»가 text·url 을 따로 받으면 링크를 떨군다 — lib/share/share.ts).
 */
import type { InviteLang, ShareKind } from './kinds';

export interface InviteCopy {
  /** 공유 단추 접근성 이름 */
  shareAria: Record<ShareKind, (ticker: string) => string>;
  /** 공유 시트 제목(메일 제목 등) */
  shareTitle: (ticker: string) => string;
  /** 메신저에 실리는 본문 — line 은 화면에 그려진 줄(없으면 null) */
  shareText: Record<ShareKind, (ticker: string, line: string | null) => string>;
  /** 링크 복사 토스트(안드로이드 셸·Web Share 가 없는 곳) */
  copied: string;
  /** 공유를 마친 뒤 «내게 오는 것» 한 줄(보상이 켜져 있을 때만, 기기에서 두 번까지) — 친구에게 가는 글이 아니다 */
  rewardHint: string;
  box: {
    title: string;
    close: string;
    /** 선물함이 비었을 때 */
    empty: string;
    friends: (n: number) => string;
    /** 번호가 쌓였는데 풀이 비어 «준비 중» */
    waiting: (n: number) => string;
    /** 새 번호가 왔을 때 알림 시트 제목·부제 */
    noticeTitle: string;
    noticeSub: string;
    itemLabel: string;
    use: string;
    /** «코드 사용하기» 를 누르면 번호를 복사하고 애플·구글 코드 입력 창을 연다 — 거기에 붙여넣으라는 한 줄 */
    pasteHint: string;
    copy: string;
    copiedBtn: string;
    /** 번호 아래 고지(자동 갱신은 «무료» 문장 안에) */
    fineIos: string;
    fineAndroid: string;
    /** 설정 행 부제 */
    rowSub: string;
    rowSubCodes: (n: number) => string;
  };
}

const clip = (s: string | null, n = 140) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const INVITE_COPY: Record<InviteLang, InviteCopy> = {
  ko: {
    shareAria: {
      pick: (t) => `${t} 오늘 볼 것 카드 공유`,
      line: (t) => `${t} AI 한 줄 카드 공유`,
      earn: (t) => `${t} 실적 변동폭 카드 공유`,
    },
    shareTitle: (t) => `SIGNUM HQ · ${t}`,
    shareText: {
      pick: (t, l) => `✦ AI가 고른 오늘 볼 것 · ${t}${l ? ` — ${clip(l)}` : ''}`,
      line: (t, l) => `✦ AI 한 줄 · ${t}${l ? ` — ${clip(l)}` : ''}`,
      earn: (t, l) => `${t} 실적 · 옵션이 반영한 변동폭${l ? ` ${clip(l)}` : ''}`,
    },
    copied: '링크를 복사했어요',
    rewardHint: '보냈어요 — 친구가 설치하면 PRO 1개월 코드가 선물함에 도착해요',
    box: {
      title: '선물함',
      close: '닫기',
      empty: '친구가 내 초대 링크로 앱을 설치하면 PRO 1개월 코드가 여기에 도착해요',
      friends: (n) => `내 링크로 설치한 친구 ${n}명`,
      waiting: (n) => `준비 중 ${n}건 — 번호가 곧 도착해요`,
      noticeTitle: '친구가 설치했어요',
      noticeSub: 'PRO 1개월 코드가 선물함에 도착했어요',
      itemLabel: 'PRO 1개월 무료 코드',
      use: '코드 사용하기',
      pasteHint: '코드를 복사했어요 — 열린 창에 붙여넣으세요',
      copy: '복사',
      copiedBtn: '복사됨',
      fineIos: '신규·구독 만료 회원 대상 · 무료 기간 뒤 자동 갱신, 언제든 해지',
      fineAndroid: 'Google 결제 수단 필요 · 30일 무료 뒤 자동 갱신, 언제든 해지',
      rowSub: '친구가 내 링크로 설치하면 PRO 1개월 코드가 도착해요',
      rowSubCodes: (n) => `받은 PRO 1개월 코드 ${n}개`,
    },
  },
  en: {
    shareAria: {
      pick: (t) => `Share ${t} from Worth Watching Today`,
      line: (t) => `Share the ${t} AI line`,
      earn: (t) => `Share the ${t} earnings implied move`,
    },
    shareTitle: (t) => `SIGNUM HQ · ${t}`,
    shareText: {
      pick: (t, l) => `✦ AI pick to watch today · ${t}${l ? ` — ${clip(l)}` : ''}`,
      line: (t, l) => `✦ AI line · ${t}${l ? ` — ${clip(l)}` : ''}`,
      earn: (t, l) => `${t} earnings · options-implied move${l ? ` ${clip(l)}` : ''}`,
    },
    copied: 'Link copied',
    rewardHint: 'Sent — if your friend installs, a PRO 1-month code lands in your gift box',
    box: {
      title: 'Gift box',
      close: 'Close',
      empty: 'When a friend installs the app from your invite link, a PRO 1-month code arrives here',
      friends: (n) => `${n} ${n === 1 ? 'friend' : 'friends'} installed from your link`,
      waiting: (n) => `${n} on the way — your code arrives soon`,
      noticeTitle: 'A friend installed the app',
      noticeSub: 'A PRO 1-month code is in your gift box',
      itemLabel: 'PRO 1-month free code',
      use: 'Use code',
      pasteHint: 'Code copied — paste it in the screen that opens',
      copy: 'Copy',
      copiedBtn: 'Copied',
      fineIos: 'New or lapsed subscribers · auto-renews after the free month, cancel anytime',
      fineAndroid: 'Google payment method required · auto-renews after 30 free days, cancel anytime',
      rowSub: 'When a friend installs from your link, a PRO 1-month code arrives',
      rowSubCodes: (n) => `${n} PRO 1-month ${n === 1 ? 'code' : 'codes'} received`,
    },
  },
  ja: {
    shareAria: {
      pick: (t) => `${t} 今日の注目カードを共有`,
      line: (t) => `${t} AI一言カードを共有`,
      earn: (t) => `${t} 決算の織り込み変動幅カードを共有`,
    },
    shareTitle: (t) => `SIGNUM HQ · ${t}`,
    shareText: {
      pick: (t, l) => `✦ AIが選んだ今日の注目 · ${t}${l ? ` — ${clip(l)}` : ''}`,
      line: (t, l) => `✦ AI一言 · ${t}${l ? ` — ${clip(l)}` : ''}`,
      earn: (t, l) => `${t} 決算 · オプションが織り込む変動幅${l ? ` ${clip(l)}` : ''}`,
    },
    copied: 'リンクをコピーしました',
    rewardHint: '送りました — 友だちがアプリを入れると、PRO 1か月コードがギフトボックスに届きます',
    box: {
      title: 'ギフトボックス',
      close: '閉じる',
      empty: '友だちが招待リンクからアプリを入れると、PRO 1か月コードがここに届きます',
      friends: (n) => `あなたのリンクから入れた友だち ${n}人`,
      waiting: (n) => `準備中 ${n}件 — コードがまもなく届きます`,
      noticeTitle: '友だちがアプリを入れました',
      noticeSub: 'PRO 1か月コードがギフトボックスに届きました',
      itemLabel: 'PRO 1か月無料コード',
      use: 'コードを使う',
      pasteHint: 'コードをコピーしました — 開いた画面に貼り付けてください',
      copy: 'コピー',
      copiedBtn: 'コピーしました',
      fineIos: '新規・期限切れの方が対象 · 無料期間のあとは自動更新、いつでも解約可',
      fineAndroid: 'Googleのお支払い方法が必要 · 30日間無料のあとは自動更新、いつでも解約可',
      rowSub: '友だちがリンクから入れると、PRO 1か月コードが届きます',
      rowSubCodes: (n) => `受け取ったPRO 1か月コード ${n}件`,
    },
  },
};
