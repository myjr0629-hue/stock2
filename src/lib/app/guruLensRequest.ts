import { rcAppUserId } from './watchlistAlerts';

/** 기존 앱 식별자를 전달한다. 권한 URL은 익명 공개 캐시와 분리한다. */
export async function fetchGuruLenses(isPro: boolean, signal: AbortSignal): Promise<Response> {
    const uid = isPro ? await rcAppUserId() : null;
    if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
    else if (signal.aborted) {
        const error = new Error('요청 취소');
        error.name = 'AbortError';
        throw error;
    }
    return fetch(uid ? '/api/guru-lens?access=pro' : '/api/guru-lens', {
        signal,
        ...(uid ? { headers: { 'x-rc-app-user-id': uid }, cache: 'no-store' as const } : {}),
    });
}
