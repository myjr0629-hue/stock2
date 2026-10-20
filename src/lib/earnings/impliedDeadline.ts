/** One absolute budget shared by all chunks; ordinary readers keep their existing behavior. */
export const IMPLIED_REFRESH_BUDGET_MS = 45_000;
export const IMPLIED_SAVE_RESERVE_MS = 5_000;

export class ImpliedDeadlineError extends Error {
  constructor() { super('implied deadline'); }
}

export async function withinImpliedDeadline<T>(work: () => Promise<T>, deadlineMs?: number): Promise<T> {
  if (deadlineMs == null) return work();
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) throw new ImpliedDeadlineError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => {
        if (Date.now() >= deadlineMs) throw new ImpliedDeadlineError();
        return work();
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ImpliedDeadlineError()), remaining); }),
    ]);
    if (Date.now() >= deadlineMs) throw new ImpliedDeadlineError();
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
