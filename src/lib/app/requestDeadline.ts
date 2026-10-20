/** 요청·본문 수신을 포함하는 상한. abort를 무시하는 구현도 호출자는 기한에 끝낸다. */
export async function withinDeadline<T>(work: () => Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('요청 시간 초과');
      error.name = 'AbortError';
      reject(error);
      onTimeout?.();
    }, ms);
  });
  try { return await Promise.race([work(), limit]); }
  finally { clearTimeout(timer); }
}

/** 본문을 모두 받은 응답만 반환한다. JSON 파싱 오류는 기존 호출자의 catch로 전달한다. */
export async function fetchResponseWithDeadline(
  url: string, ms: number, init: RequestInit = {}, fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const ctl = new AbortController();
  const abort = () => ctl.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) ctl.abort();
  try {
    return await withinDeadline(async () => {
      const res = await fetchImpl(url, { ...init, signal: ctl.signal });
      if (!res.ok) { ctl.abort(); return res; }
      const body = await res.arrayBuffer();
      return new Response(res.status === 204 || res.status === 205 ? null : body, {
        status: res.status, statusText: res.statusText, headers: res.headers,
      });
    }, ms, abort);
  } finally { init.signal?.removeEventListener('abort', abort); }
}
