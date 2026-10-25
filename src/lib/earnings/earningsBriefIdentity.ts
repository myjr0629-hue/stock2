// 실적 관전 포인트의 «회사 신원» 검사 — 정적 정식명 표(earningsCompanies.ts)만 쓴다. 공급사 호출·저장 프로필 없음.
//   표에 있는 종목: en.name 이 정식명(또는 aka)과 같아야 저장·표시. en.name 이 없으면 같은 회사인지 알 수 없어 거절.
//   표에 없는 종목: 검증 대상 밖(company = null) — 표시는 기존 그대로, 새 생성은 보류(모델에 티커 추측을 맡기지 않는다).
import { EARNINGS_COMPANIES } from './earningsCompanies';

export interface BriefCompany {
  name: string;
  ko: string;
  ja: string;
  industry: string;
  aka: readonly string[];
}

/** 법인 접미사·대소문자·구두점·앞의 «The»만 동치. 부분 문자열/편집 거리로 다른 회사를 통과시키지 않는다. */
export function normalizeBriefCompanyName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').toLowerCase()
    .replace(/[.,'’®™]/g, '').replace(/&/g, ' and ').replace(/[-–—/]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^the\s+/, '')
    .replace(/(?:\s+(?:incorporated|inc|corporation|corp|limited|ltd|plc|company|co|nv|sa|ag))+$/g, '')
    .trim();
}

export function briefCompanyFor(ticker: string): BriefCompany | null {
  const c = EARNINGS_COMPANIES[String(ticker || '').toUpperCase()];
  return c ? { name: c.en, ko: c.ko, ja: c.ja, industry: c.industry, aka: c.aka ?? [] } : null;
}

export function checkBriefCompany(
  entry: { en?: { name?: string } } | null | undefined,
  company: BriefCompany | null | undefined,
): { ok: boolean; reason: string | null } {
  if (!company) return { ok: false, reason: 'company-unresolved' };
  const actual = normalizeBriefCompanyName(entry?.en?.name);
  if (!actual) return { ok: false, reason: 'company-name-missing' };
  const allowed = [company.name, ...company.aka].map(normalizeBriefCompanyName);
  return allowed.includes(actual) ? { ok: true, reason: null } : { ok: false, reason: 'company-name-mismatch' };
}
