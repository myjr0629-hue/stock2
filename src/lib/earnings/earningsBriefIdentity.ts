import { COMPANY_NAMES } from '../companyNames';

export interface BriefCompany {
  name: string;
  sector: string | null;
  industry: string | null;
  source: 'mapping' | 'profile';
}
export interface BriefCompanyProfile {
  symbol?: string;
  companyName?: string;
  name?: string;
  sector?: string | null;
  industry?: string | null;
}

// TER·TDC는 별개 회사. SEO 표시명을 바꾸지 않고 AI 회사 식별만 고정한다.
const PINNED: Record<string, BriefCompany> = {
  TER: { name: 'Teradyne', sector: 'Technology', industry: 'Semiconductor test equipment', source: 'mapping' },
  TDC: { name: 'Teradata', sector: 'Technology', industry: 'Data warehousing and analytics software', source: 'mapping' },
};
export const BRIEF_LOCAL_NAMES: Record<string, { ko: string; ja: string }> = {
  TER: { ko: '테라다인', ja: 'テラダイン' },
  TDC: { ko: '테라데이타', ja: 'テラデータ' },
};

/** 법인 접미사·대소문자·구두점만 동치. 부분 문자열/편집 거리로 다른 회사를 통과시키지 않는다. */
export function normalizeBriefCompanyName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').toLowerCase().replace(/\s*\(google\)/g, '')
    .replace(/[.,'’®™]/g, '').replace(/&/g, ' and ').replace(/[-–—]/g, ' ')
    .trim().replace(/(?:\s+(?:incorporated|inc|corporation|corp|limited|ltd|plc|company|co|nv|sa))+$/g, '')
    .replace(/\s+/g, ' ').trim();
}

export function briefCompanyFor(ticker: string, profile?: BriefCompanyProfile | null): BriefCompany | null {
  const tk = ticker.toUpperCase();
  if (PINNED[tk]) return { ...PINNED[tk] };
  if (profile?.symbol && profile.symbol.toUpperCase() !== tk) return null;
  const rawName = profile?.companyName || profile?.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const realName = name && (name.toUpperCase() !== tk || profile?.symbol?.toUpperCase() === tk) ? name : null;
  const mapped = COMPANY_NAMES[tk]?.en;
  if (!realName && !mapped) return null;
  return {
    name: realName || mapped!,
    sector: typeof profile?.sector === 'string' && profile.sector.trim() ? profile.sector.trim() : null,
    industry: typeof profile?.industry === 'string' && profile.industry.trim() ? profile.industry.trim() : null,
    source: realName ? 'profile' : 'mapping',
  };
}

export function checkBriefCompany(entry: { en?: { name?: string } } | null | undefined, company: BriefCompany | null | undefined): { ok: boolean; reason: string | null } {
  if (!company) return { ok: false, reason: 'company-unresolved' };
  const actual = normalizeBriefCompanyName(entry?.en?.name);
  if (!actual) return { ok: false, reason: 'company-name-missing' };
  return actual === normalizeBriefCompanyName(company.name)
    ? { ok: true, reason: null } : { ok: false, reason: 'company-name-mismatch' };
}

/** 회사명만 있고 업종이 없으면 모델에 티커 추측을 다시 맡기지 않는다. */
export const briefCompanyReady = (company: BriefCompany | null | undefined): company is BriefCompany =>
  !!company?.name && !!(company.industry || company.sector);
