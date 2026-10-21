import { rcAppUserId } from './watchlistAlerts';

/** 기존 앱 식별자를 전달한다. 권한 URL은 익명 공개 캐시와 분리한다. */
export async function fetchGuruLenses(isPro: boolean, signal: AbortSignal): Promise<Response> {
    const uid = isPro ? await rcAppUserId() : null;
    signal.throwIfAborted();
    return fetch(uid ? '/api/guru-lens?access=pro' : '/api/guru-lens', {
        signal,
        ...(uid ? { headers: { 'x-rc-app-user-id': uid }, cache: 'no-store' as const } : {}),
    });
}
