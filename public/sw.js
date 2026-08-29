// SIGNUM HQ — Service Worker
//
// ══════════════════════════════════════════════════════════════════════
// ★ [2026-08-30] 왜 다시 썼나
//   예전 버전은 CACHE_NAME 이 'signum-hq-v1' 로 **고정**이었다.
//   그러면 배포를 해도 activate 의 «옛 캐시 삭제»가 아무것도 안 지운다
//   (지울 대상 이름이 늘 자기 자신이니까). 게다가 등록 URL 도 '/sw.js' 로
//   고정이라 브라우저가 «같은 워커»로 보고 갱신 자체를 안 돌렸다.
//
//   결과: **웹으로 배포한 수정이 사용자 화면에 반영되지 않는다.**
//   (실측 2026-08-30: 새 지표가 안 떠서 SW 캐시를 수동으로 지우니 즉시 나왔다)
//
//   → 등록을 '/sw.js?v=<빌드스탬프>' 로 하고, 캐시 이름에 그 v 를 넣는다.
//     배포마다 URL 과 캐시 이름이 함께 바뀌므로 갱신이 «반드시» 일어난다.
//
// [원칙]  이 앱은 시세를 다룬다. 오래된 코드는 오래된 숫자를 그린다.
//   캐시는 «오프라인일 때의 마지막 수단»이지 기본 경로가 아니다.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `signum-hq-${VERSION}`;

// 앱 껍데기에 꼭 필요한 것만. HTML·JS 는 여기 넣지 않는다.
const STATIC_ASSETS = [
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/manifest.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .catch(() => { })   // 아이콘 하나 실패로 설치가 막히면 안 된다
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                // 이름에 버전이 들어가므로 이제 «이전 배포» 캐시가 실제로 지워진다
                names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

// 페이지가 «지금 넘어와라»라고 하면 즉시 넘어간다.
// (안 하면 열려 있는 탭을 전부 닫아야 새 워커가 활성화된다)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    let url;
    try { url = new URL(request.url); } catch { return; }

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // 시세·분석은 절대 캐시하지 않는다
    if (url.pathname.startsWith('/api/')) return;

    // ⚠️ Next.js 빌드 산출물은 **손대지 않는다.**
    //   파일명에 콘텐츠 해시가 들어 있어 브라우저 캐시만으로 충분하고,
    //   여기서 cache-first 로 잡으면 배포 후에도 옛 청크가 살아남는다.
    //   («?dpl=» 쿼리 때문에 URL 이 매번 달라져 옛 항목이 무한히 쌓이기도 했다)
    if (url.pathname.startsWith('/_next/')) return;

    // 아이콘·폰트 같은 정적 자산만 cache-first (거의 안 변한다)
    if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|eot)$/.test(url.pathname)) {
        event.respondWith(
            caches.match(request).then((cached) => cached || fetch(request).then((res) => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => { });
                }
                return res;
            }))
        );
        return;
    }

    // HTML: 네트워크 우선, 오프라인일 때만 캐시
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => { });
                    return res;
                })
                .catch(() => caches.match(request))
        );
    }
});
