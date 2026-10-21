/** 애플 맞춤 코드의 기본 사용 한도(numberOfCodes). 기존 코드·알 수 없는 코드는 그대로 둔다. */
export const APPLE_CODE_LIMIT = 500;
const CODE_LIMIT = new Map([
  ['SIGNUMPRO', 5000],
]);

export function promoCodeLimit(raw: string | null): number {
  return CODE_LIMIT.get((raw || '').trim().toUpperCase()) ?? APPLE_CODE_LIMIT;
}
