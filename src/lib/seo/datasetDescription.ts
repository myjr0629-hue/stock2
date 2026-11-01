type DatasetLocale = 'en' | 'ko' | 'ja';

// General facts common to all five datasets; do not promise a specific refresh interval.
const FALLBACK: Record<DatasetLocale, string> = {
  en: 'SIGNUM HQ publishes this dataset about US stocks and options. Its values and dates depend on the available market data.',
  ko: 'SIGNUM HQ는 미국 주식과 옵션에 관한 이 데이터셋을 제공합니다. 수치와 날짜는 이용 가능한 시장 자료에 따라 달라집니다.',
  ja: 'SIGNUM HQは米国株とオプションに関するこのデータセットを提供しています。数値と日付は利用可能な市場データによって変わります。',
};

/** Dataset JSON-LD only: keep both UTF-16 and Unicode character counts within the limit. */
export function datasetDescription(text: string, locale: string): string {
  const language: DatasetLocale = locale === 'ko' || locale === 'ja' ? locale : 'en';
  let result = text.trim();
  if (Array.from(result).length < 50) result = [result, FALLBACK[language]].filter(Boolean).join(' ');
  if (result.length > 5000) {
    let prefix = result.slice(0, 5000);
    if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
    const boundaries = [...prefix.matchAll(/[.!?。！？](?=\s|$|[^\x00-\x7F])/gu)];
    const end = boundaries.length ? boundaries[boundaries.length - 1].index! + 1 : 0;
    // A single exceptionally long sentence has no usable boundary.
    result = end >= 50 && Array.from(prefix.slice(0, end)).length >= 50 ? prefix.slice(0, end) : prefix;
  }
  return result;
}
