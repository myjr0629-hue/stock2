// 제한된 동시성으로 일을 돌린다 — 예열이 «섹터 10곳을 같은 초에» 따로 띄우던 것을 한 번에 limit 곳씩으로 줄인다.
// 서버리스에서 같은 라우트를 동시에 부르면 인스턴스가 따로 떠서 인스턴스별 동시성 상한이 소용없다 — 한도는 호출하는 쪽이 지켜야 한다.
//   deadlineAt(ms epoch)을 넘기면 새 일을 시작하지 않는다(시작 못 한 일은 결과가 undefined — 다음 주기가 한다).
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  opts: { deadlineAt?: number; now?: () => number } = {},
): Promise<Array<R | undefined>> {
  const now = opts.now ?? Date.now;
  const out: Array<R | undefined> = new Array(items.length).fill(undefined);
  let next = 0;
  const n = Math.max(1, Math.floor(limit) || 1);
  const lane = async () => {
    for (;;) {
      if (opts.deadlineAt != null && now() >= opts.deadlineAt) return;
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
  return out;
}
