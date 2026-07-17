// ============================================================================
// Resilient normalizers for Toss API payloads. The response shapes are not
// fully documented, so instead of guessing one field name we scan the payload
// for numeric leaves under priority-ordered key patterns. Deterministic,
// side-effect free, and safe against shape drift.
// ============================================================================

type Leaf = { key: string; value: number; depth: number };

function numericLeaves(o: unknown, maxDepth = 5): Leaf[] {
  const out: Leaf[] = [];
  const walk = (node: unknown, depth: number) => {
    if (node == null || depth > maxDepth || out.length > 400) return;
    if (Array.isArray(node)) { for (const x of node.slice(0, 30)) walk(x, depth + 1); return; }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (v != null && typeof v === 'object') walk(v, depth + 1);
        else {
          const n = Number(v);
          if (Number.isFinite(n) && typeof v !== 'boolean') out.push({ key: k, value: n, depth });
        }
      }
    }
  };
  walk(o, 0);
  return out;
}

/** First numeric leaf matching the priority regex list within [min,max]. */
export function pickNum(o: unknown, patterns: RegExp[], min = -Infinity, max = Infinity): number | null {
  const leaves = numericLeaves(o);
  for (const re of patterns) {
    const hit = leaves
      .filter((l) => re.test(l.key) && l.value >= min && l.value <= max)
      .sort((a, b) => a.depth - b.depth)[0];
    if (hit) return hit.value;
  }
  return null;
}

export function pickStr(o: unknown, patterns: RegExp[]): string | null {
  const walk = (node: unknown, depth: number): string | null => {
    if (node == null || depth > 5) return null;
    if (Array.isArray(node)) { for (const x of node.slice(0, 20)) { const r = walk(x, depth + 1); if (r) return r; } return null; }
    if (typeof node === 'object') {
      for (const re of patterns) {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (typeof v === 'string' && v.trim() && re.test(k)) return v;
        }
      }
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (v && typeof v === 'object') { const r = walk(v, depth + 1); if (r) return r; }
      }
    }
    return null;
  };
  return walk(o, 0);
}

/** Find the first array of objects anywhere in the payload (rows of a list). */
export function pickList(o: unknown): Record<string, unknown>[] {
  const q: unknown[] = [o];
  let depth = 0;
  while (q.length && depth < 200) {
    const c = q.shift(); depth++;
    if (Array.isArray(c)) {
      if (c.length && typeof c[0] === 'object' && c[0] !== null) return c as Record<string, unknown>[];
      continue;
    }
    if (c && typeof c === 'object') for (const v of Object.values(c as Record<string, unknown>)) if (v && typeof v === 'object') q.push(v);
  }
  return [];
}

export const PX_PATTERNS = [/^close$/i, /^(current|trade|last|now)?price$/i, /^last$/i, /^tradeprice$/i, /^currentprice$/i, /price/i];
export const CHG_PATTERNS = [/^change(rate|percent|pct)$/i, /^(daily)?rate$/i, /changerate/i, /rate$/i];
export const NAME_PATTERNS = [/^(eng|en)?name$/i, /stockname/i, /^label$/i, /name/i];
