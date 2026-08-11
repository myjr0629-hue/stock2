// ============================================================================
// kit/backdrops — «주제에 맞는 배경»을 자동으로 고른다 (정본 §4, §5)
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-11):
//   "잘 만들어도 안 보면 아무런 소용이 없다"
//   "보기 전부터 뉴스나 다큐 같은 느낌만 있는 것은 안 좋다"
//
// 그래서 «다큐»는 기본값이 아니라 «증거 구간 전용»으로 강등한다.
//   훅(첫 3초)  → hook · anime · fantasy 에서만 고른다. 다큐 금지.
//   증거 구간   → sector(다큐 실사). 신뢰가 필요한 자리.
//   오프너      → morning.
//   아웃트로    → endcard.
//   컷 전환     → stinger.
//
// 선택은 «결정론적»이다 — 같은 (역할·주제·시드)면 항상 같은 클립.
// 렌더가 재현 가능해야 하고, 같은 영상 안에서 배경이 흔들리면 안 되기 때문.
// ============================================================================

import lib from './bglib.json';
import type { BackdropSpec } from './Backdrop';
import type { BeatRole } from './spec';

type Entry = { key: string; src: string; topics: string[] };
type Cat = 'tech' | 'finance' | 'stylized' | 'morning' | 'hook' | 'anime' | 'fantasy'
  | 'sector' | 'plate' | 'endcard' | 'stinger' | 'unsorted';

const LIB = lib as Partial<Record<Cat, Entry[]>>;

/**
 * 역할별 «허용 카테고리» — 화이트리스트. 여기 없는 건 절대 안 나온다.
 *
 * 2026-08-11 재편 (대표 지적: "금융 테크 하이테크 종목들, 세련되고 흥미롭게"):
 *   소재는 tech·finance 로 «주제»를 맞추고, stylized 가 «흥미»를 만든다.
 *   범용 추상 B롤은 라이브러리에서 폐기했다 — 어떤 종목에도 안 붙었다.
 */
const ALLOW: Record<string, Cat[]> = {
  // 훅: 시선을 멈추는 결만. 다큐 톤(sector)은 의도적으로 제외한다.
  hook: ['stylized', 'tech', 'hook', 'anime', 'fantasy'],
  open: ['morning', 'stylized', 'anime'],
  // 본문 역할 (spec.BeatRole)
  market: ['finance', 'morning', 'stylized'],
  chips: ['tech', 'stylized', 'anime'],
  money: ['finance', 'tech', 'stylized'],
  conflict: ['stylized', 'hook', 'fantasy'],
  evidence: ['tech', 'finance', 'sector'],
  depth: ['tech', 'finance', 'sector'],
  verdict: ['stylized', 'fantasy', 'finance'],
  brand: ['endcard'],
  outro: ['endcard'],
  plate: ['plate'],
  stinger: ['stinger'],
};

/** 문자열 → 안정적인 정수 (같은 입력이면 항상 같은 값) */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 티커·섹터 라벨 → bglib 의 주제 태그 */
const TOPIC_OF: Record<string, string> = {
  NVDA: 'semis', AMD: 'semis', INTC: 'semis', MU: 'semis', AVGO: 'semis', SMCI: 'datacenter', TSM: 'semis',
  ARM: 'semis', ASML: 'semis', LRCX: 'semis', AMAT: 'semis', KLAC: 'semis',
  MSFT: 'datacenter', GOOGL: 'datacenter', META: 'datacenter', ORCL: 'datacenter', PLTR: 'datacenter',
  TSLA: 'auto', GM: 'auto', F: 'auto', RIVN: 'auto',
  XOM: 'energy', CVX: 'energy', OXY: 'energy', ENPH: 'energy', FSLR: 'energy',
  AMZN: 'retail', COST: 'retail', WMT: 'retail', TGT: 'retail',
  LLY: 'pharma', PFE: 'pharma', MRK: 'pharma', NVO: 'pharma', UNH: 'health', JNJ: 'health',
  JPM: 'bank', GS: 'bank', BAC: 'bank', MS: 'bank', COIN: 'bank',
  BA: 'airline', DAL: 'airline', UAL: 'airline', SPCX: 'space', RKLB: 'space', ASTS: 'network',
  IONQ: 'quantum', RGTI: 'quantum', QBTS: 'quantum',
  TSLA_FSD: 'auto', ISRG: 'robotics', ABB: 'robotics', SERV: 'robotics',
  CAT: 'mining', FCX: 'mining', NEM: 'mining',
  DE: 'agri', ADM: 'agri',
  AAPL: 'luxury', NFLX: 'city',
  SEMIS: 'semis', TECH: 'datacenter', ENERGY: 'energy', HEALTH: 'health', FINANCE: 'bank',
  INDUSTRIALS: 'mining', CONSUMER: 'retail', MATERIALS: 'mining', UTILITIES: 'energy',
};

export function topicFor(label?: string): string | null {
  if (!label) return null;
  return TOPIC_OF[label.toUpperCase().replace(/[^A-Z0-9]/g, '')] ?? null;
}

/**
 * 역할 + 주제 + 시드 → 배경 클립 1개.
 * 라이브러리에 마땅한 게 없으면 null (호출부가 절차 배경으로 폴백한다).
 */
export function resolveBackdrop(opts: {
  role: BeatRole | 'hook' | 'open' | 'outro' | 'plate' | 'stinger';
  /** 티커·섹터 라벨 (있으면 주제 매칭이 우선한다) */
  subject?: string;
  /** 같은 영상 안에서 배경이 겹치지 않게 하는 인덱스 */
  seed?: string | number;
  /** 이미 쓴 키 — 한 영상에서 같은 클립을 두 번 쓰지 않는다 */
  used?: Set<string>;
}): BackdropSpec | null {
  const cats = ALLOW[opts.role] ?? ['sector'];
  const pool: Entry[] = [];
  for (const c of cats) pool.push(...(LIB[c] ?? []));
  if (!pool.length) return null;

  const topic = topicFor(opts.subject);
  // 주제가 맞는 것 우선 → 없으면 역할 풀 전체
  const matched = topic ? pool.filter((e) => e.topics.includes(topic)) : [];
  let candidates = matched.length ? matched : pool;

  // 이미 쓴 건 뺀다 (다 썼으면 어쩔 수 없이 재사용)
  if (opts.used) {
    const fresh = candidates.filter((e) => !opts.used!.has(e.key));
    if (fresh.length) candidates = fresh;
  }

  const h = hash(`${opts.role}|${topic ?? ''}|${opts.seed ?? ''}`);
  const pick = candidates[h % candidates.length];
  opts.used?.add(pick.key);
  return { kind: 'video', src: pick.src };
}

/** 라이브러리 현황 — 렌더 전에 «자산이 있는지» 확인할 때 */
export function backdropStats(): Record<string, number> {
  return Object.fromEntries(Object.entries(LIB).map(([k, v]) => [k, (v ?? []).length]));
}
