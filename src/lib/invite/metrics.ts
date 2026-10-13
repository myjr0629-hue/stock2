/**
 * 바이럴 루프 지표 — 2026-10-14 (브랜치 feat/viral-loop). 서버 전용.
 *
 * 퍼널 한 줄(공유 단추 탭 → 공유 완료 → 받은 쪽 사람 클릭 → 설치 매칭 → 보상 배정):
 *   share:tap:<표면>:<via>:<ET날짜>      보낸 쪽이 공유 단추를 눌렀다(/api/share-hit — 클라이언트 비콘)        표면 = sh_pick · sh_line · sh_earn (+ 기존 gift_set·gift_dash·gift_pop)
 *   share:sent:<표면>:<via>:<ET날짜>     시스템 공유 시트 완료 또는 링크 복사(/api/share-hit)
 *   share:open:<표면>:<via>:<ET날짜>     받은 사람이 공유 카드 페이지를 열었다(서버 렌더 — 사람 판정만, lib/invite/landing)   via = 보낸 쪽 플랫폼
 *   clk:sg:<태그>:<ET날짜>               받은 쪽 «앱에서 이어 보기» 사람 클릭(기존 스마트링크 집계 — 태그 share_pick·share_line·share_earn·gift)
 *   share:arrive:all:<플랫폼>:<ET날짜>   앱을 «새로 설치해 처음 실행»했다고 앱이 알려 온 수(매칭 여부와 무관 — 매칭률의 분모)
 *   share:match:<표면>:<플랫폼>:<ET날짜>  그 도착이 «초대 링크 터치»와 매칭됐다(= 초대로 온 설치, 하한 — IP 가 달라지면 놓친다)    표면 = sh_*·gift
 *   share:credit:<표면>:<플랫폼>:<ET날짜> 매칭 중 초대자 보상이 적립됐다(상한·중복 걸러진 뒤)
 *   share:mint:all:<플랫폼>:<ET날짜>     초대자가 선물함을 열어 번호가 «배정»됐다(플랫폼 = 초대자 기기 — 표면은 이 시점에 모르므로 all)
 *   share:senders:<ET날짜>               그날 공유를 «완료»한 서로 다른 초대 id 목록(JSON 배열, 최대 600) — k 의 분모
 *
 * 바이럴 계수 k = (그날 매칭된 설치) ÷ (그날 공유를 완료한 서로 다른 초대자 수). 설치는 «IP 매칭된 것만» — 놓친 설치가 있으므로 k 는 하한이다.
 * 저장: EC2 레디스 전용(share: 접두사는 redisClient 복제 정책 밖 → Upstash 명령 0). 프리뷰·로컬은 share:probe: (운영 숫자 오염 방지).
 * 읽기: node scripts/mkt-viral.js [일수]
 */
import { getFromCache, setInCache } from '@/services/redisClient';
import { etDay } from './engine';

export type ServerShareEvent = 'open' | 'arrive' | 'match' | 'credit' | 'mint';
const TTL = 60 * 60 * 24 * 45;
const SENDERS_MAX = 600;

export const shareNs = (vercelEnv: string | undefined = process.env.VERCEL_ENV) => (vercelEnv === 'production' ? 'share' : 'share:probe');

async function bump(key: string): Promise<void> {
  const cur = (await getFromCache<number>(key)) || 0;
  await setInCache(key, cur + 1, TTL);
}

/** 서버가 직접 세는 퍼널 칸 — 응답 뒤 after() 안에서만. 실패는 삼킨다. */
export async function bumpShare(e: ServerShareEvent, surface: string, via: string, day = etDay()): Promise<void> {
  if (!/^[a-z_]{1,12}$/.test(surface) || !/^[a-z]{2,8}$/.test(via)) return;
  try { await bump(`${shareNs()}:${e}:${surface}:${via}:${day}`); } catch { /* 집계 실패는 삼킨다 */ }
}

/** 그날 공유를 완료한 초대 id 를 한 번씩 적는다(JSON 배열 — 동시 쓰기에서 드물게 한 건 놓칠 수 있다 → k 의 분모는 «하한에 가깝게»). */
export async function noteSender(ref: string, day = etDay()): Promise<void> {
  try {
    const key = `${shareNs()}:senders:${day}`;
    const cur = await getFromCache<string[]>(key);
    const list = Array.isArray(cur) ? cur.filter((x) => typeof x === 'string') : [];
    if (list.includes(ref) || list.length >= SENDERS_MAX) return;
    list.push(ref);
    await setInCache(key, list, TTL);
  } catch { /* 집계 실패는 삼킨다 */ }
}
