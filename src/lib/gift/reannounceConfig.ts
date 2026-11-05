/** 재안내 설정이 응답하지 않아도 기존 안내가 계속 진행되게 한다. */
export function loadReannounceConfig(onResult: (enabled: boolean) => void, timeoutMs = 3000): () => void {
  const controller = new AbortController();
  let done = false;
  const finish = (enabled: boolean) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    onResult(enabled);
  };
  const timer = setTimeout(() => { finish(false); controller.abort(); }, timeoutMs);
  void Promise.resolve()
    .then(() => fetch('/api/gift/reannounce-config', { cache: 'no-store', signal: controller.signal }))
    .then((r) => r.ok ? r.json() : null)
    .then((v) => finish(v?.enabled === true))
    .catch(() => finish(false));
  return () => { done = true; clearTimeout(timer); controller.abort(); };
}
