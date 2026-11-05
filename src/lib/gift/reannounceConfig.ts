import { GIFT_REANNOUNCE_TIMEOUT_MS } from './giftAnnounce';

/** 재안내 설정 조회(3초 상한) — 늦거나 실패하면 false 로 한 번만 확정, 늦게 온 응답은 버린다. 기존 안내는 이 결과를 기다리지 않는다. */
export function loadReannounceConfig(onResult: (enabled: boolean) => void, timeoutMs = GIFT_REANNOUNCE_TIMEOUT_MS): () => void {
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
