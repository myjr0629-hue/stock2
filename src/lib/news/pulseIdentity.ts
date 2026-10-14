/** 보관본과 화면이 공유하는 기사 판정. 서버 의존성 없이 같은 기준을 사용한다. */
export interface PulseIdentity {
  id?: string | null;
  headline?: string;
  _rawTitleKey?: string;
  k?: string;
  focusKey?: string;
}

/** 기존 pulseArchive.titleKey 규칙 그대로. */
export function titleKey(title: string): string {
  return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
}

/** 기존 toArchiveItem의 k 판정 그대로. mergeDay는 이 값 또는 id로 중복을 판단한다. */
export function archiveIdentityKey(item: PulseIdentity): string {
  return item._rawTitleKey || titleKey(item.headline || '') || item.id || '';
}

/** 같은 기사 판정 키의 FNV-1a 64비트 해시(16자리 hex). 번역문은 사용하지 않는다. */
export function newsFocusKey(item: PulseIdentity): string {
  if (item.focusKey) return item.focusKey;
  const key = item.k || archiveIdentityKey(item);
  if (!key) return '';
  let hash = BigInt('14695981039346656037');
  for (let i = 0; i < key.length; i++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(key.charCodeAt(i))) * BigInt('1099511628211'));
  }
  return hash.toString(16).padStart(16, '0');
}
