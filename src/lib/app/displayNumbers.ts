/** Display only: preserve missing values and never print a rounded negative zero. */
export function compactUsd(value: number | null | undefined, signed = false, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  let scale = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  // Rounding near a unit boundary must not produce $1000.0K or $1000.0M.
  if (scale < 1e9 && Number((abs / scale).toFixed(scale === 1 ? 0 : digits)) >= 1000) scale *= 1000;
  const suffix = scale === 1e9 ? 'B' : scale === 1e6 ? 'M' : scale === 1e3 ? 'K' : '';
  const text = (abs / scale).toFixed(scale === 1 ? 0 : digits);
  const sign = Number(text) === 0 ? '' : value < 0 ? '−' : signed ? '+' : '';
  return `${sign}$${text}${suffix}`;
}

export function signedPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const text = Math.abs(value).toFixed(digits);
  return `${Number(text) === 0 ? '' : value < 0 ? '−' : '+'}${text}%`;
}

/** Put IV / call IV is a dimensionless ratio. */
export function ivSkewRatioText(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}×`;
}
