// Read delegation only: structureService remains the sole structure producer.
async function readCanonicalStructure(ticker, read, now = Date.now()) {
  const version = await read('structure:v2:' + ticker);
  const s = version && version.data;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  if (!s || s.options_status === 'NO_MARKET' || typeof s.netGex !== 'number'
      || !Number.isFinite(s.netGex) || typeof s.expiration !== 'string' || s.expiration < today) return null;
  return s;
}
module.exports = { readCanonicalStructure };
