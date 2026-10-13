// ============================================================================
// «내 종목 이상 신호» 푸시 발송 — 기기마다 다른 문구를 보내고, 기기별 성공/실패를 돌려준다(실패한 기기는 하루 상한·중복 장부를 되돌릴 수 있게).
//   · iOS → APNs 직접(send.ts 와 같은 .p8 키·같은 게이트웨이 폴백) / Android → FCM(firebase-admin).
//   · 조용한 시간(기기 현지 23~07시): iOS 는 interruption-level=passive + 소리 없음, Android 는 보통 우선순위(소리는 채널 설정을 따른다).
//   · 데이터 페이로드: type=wl_signal · path(그 종목 Flow 화면, 앱 안 경로만) · ev(신호 종류) · t(티커) — 앱이 탭을 계측하고 이동한다.
// 이 파일은 «보내기»만 한다. 누구에게 무엇을 보낼지는 services/signalAlertsService 가 정한다.
// ============================================================================
import 'server-only';
import http2 from 'node:http2';
import { apnsAuthToken, getMessaging, APNS_BUNDLE, APNS_PROD_HOST, APNS_SANDBOX_HOST } from '@/lib/push/send';
import type { Platform } from '@/lib/signals/types';

export interface SignalPushItem {
    /** 결과를 돌려받는 이름 — 같은 기기에 두 통이 가도 따로 센다 */
    id: string;
    token: string;
    platform: Platform;
    title: string;
    body: string;
    /** 문자열 값만(FCM 데이터 규칙) */
    data: Record<string, string>;
    quiet: boolean;
    /** 알림 센터에서 같은 종목끼리 묶는 이름 */
    thread: string;
}

export type SendOutcome = 'ok' | 'fail' | 'dead';

/** APNs 한 게이트웨이로 한 묶음 — 토큰별 결과(200 = ok · BadDeviceToken = 다른 게이트웨이 · 410/Unregistered = 영구 소멸) */
async function apnsEach(host: string, items: SignalPushItem[]): Promise<Map<string, 'ok' | 'bad' | 'gone' | 'fail'>> {   // 키 = item.id
    const out = new Map<string, 'ok' | 'bad' | 'gone' | 'fail'>();
    if (!items.length) return out;
    const jwt = apnsAuthToken();
    const client = http2.connect(host);
    client.on('error', () => { /* 요청별 error 로 처리 */ });
    try {
        await Promise.all(items.map((it) => new Promise<void>((resolve) => {
            const aps: Record<string, unknown> = { alert: { title: it.title, body: it.body }, 'thread-id': it.thread };
            if (it.quiet) aps['interruption-level'] = 'passive'; else aps.sound = 'default';
            const payload = JSON.stringify({ aps, ...it.data });
            const req = client.request({
                ':method': 'POST',
                ':path': '/3/device/' + it.token,
                authorization: 'bearer ' + jwt,
                'apns-topic': APNS_BUNDLE,
                'apns-push-type': 'alert',
                'apns-priority': it.quiet ? '5' : '10',
                'content-type': 'application/json',
            });
            let status = 0, body = '';
            req.on('response', (h) => { status = Number(h[':status']) || 0; });
            req.setEncoding('utf8');
            req.on('data', (d) => { body += d; });
            req.on('end', () => {
                if (status === 200) out.set(it.id, 'ok');
                else if (/BadDeviceToken/.test(body)) out.set(it.id, 'bad');
                else if (status === 410 || /Unregistered/.test(body)) out.set(it.id, 'gone');
                else out.set(it.id, 'fail');
                resolve();
            });
            req.on('error', () => { out.set(it.id, 'fail'); resolve(); });
            req.setTimeout(15_000, () => { try { req.close(); } catch { /* noop */ } });
            req.write(payload);
            req.end();
        })));
    } finally {
        try { client.close(); } catch { /* noop */ }
    }
    return out;
}

/** 항목(id)별 결과 */
export async function sendSignalPushes(items: SignalPushItem[]): Promise<Map<string, SendOutcome>> {
    const result = new Map<string, SendOutcome>();
    const ios = items.filter((i) => i.platform === 'ios');
    const android = items.filter((i) => i.platform === 'android');

    if (ios.length) {
        try {
            const primary = process.env.APNS_SANDBOX === 'true' ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
            const fallback = primary === APNS_PROD_HOST ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
            const first = await apnsEach(primary, ios);
            const retry = ios.filter((i) => first.get(i.id) === 'bad');
            const second = retry.length ? await apnsEach(fallback, retry) : new Map();
            for (const it of ios) {
                const a = first.get(it.id);
                if (a === 'ok') { result.set(it.id, 'ok'); continue; }
                if (a === 'gone') { result.set(it.id, 'dead'); continue; }
                if (a === 'bad') {
                    const b = second.get(it.id);
                    result.set(it.id, b === 'ok' ? 'ok' : b === 'gone' || b === 'bad' ? 'dead' : 'fail');   // 두 게이트웨이 모두 BadDeviceToken → 정말 죽은 토큰
                    continue;
                }
                result.set(it.id, 'fail');
            }
        } catch {
            for (const it of ios) if (!result.has(it.id)) result.set(it.id, 'fail');
        }
    }

    if (android.length) {
        try {
            const messaging = await getMessaging();
            for (let i = 0; i < android.length; i += 500) {
                const batch = android.slice(i, i + 500);
                const res = await messaging.sendEach(batch.map((it) => ({
                    token: it.token,
                    notification: { title: it.title, body: it.body },
                    data: it.data,
                    android: { priority: it.quiet ? 'normal' : 'high', collapseKey: it.thread },
                })));
                res.responses.forEach((r: any, idx: number) => {
                    const code = r.error?.code || '';
                    result.set(batch[idx].id, r.success ? 'ok' : /registration-token-not-registered|invalid-argument|not-registered/.test(code) ? 'dead' : 'fail');
                });
            }
        } catch {
            for (const it of android) if (!result.has(it.id)) result.set(it.id, 'fail');
        }
    }
    return result;
}
