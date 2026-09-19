# 다음 앱 버전이 나갈 때 «반드시 같이» 처리할 것

라이브 버전(`READY_FOR_SALE`)에서는 못 고치고 **편집 가능한 새 버전이 있어야만** 되는 것들이다.
빌드가 나갈 때 이걸 안 하면 다음 버전까지 또 몇 주를 그대로 간다.

## 라이브 버전에서 «되는 것 / 안 되는 것» (2026-09-19 실측)

| 필드 | 라이브에서 수정 | 근거 |
|---|---|---|
| `promotionalText` | ✅ 된다 | 오늘 36칸 전부 썼고 재쓰기도 성공 |
| `marketingUrl` | ❌ 409 | `Attribute 'marketingUrl' cannot be edited at this time` |
| `supportUrl` | ❌ 409 | `Attribute 'supportUrl' cannot be edited at this time` |
| 앱 미리보기(`appPreviewSets`) | ❌ 409 | `ENTITY_ERROR.ATTRIBUTE.INVALID.INVALID_STATE` |
| 인앱이벤트 `deepLink` | ❌ 409(승인 후) | `territorySchedules`·`priority` 만 허용 |
| 이름·부제·키워드 | ❌ 빌드 필요 | 기존 기록 |

## 체크리스트

### 1. 제품 페이지 링크에 추적 태그 — **3앱 × 전 로케일이 전부 무태그다**
현재 상태(2026-09-19 실측):

| 앱 | marketingUrl | supportUrl |
|---|---|---|
| SIGNUM | `https://www.signumhq.com` (3 로케일) | `https://www.signumhq.com` (12 로케일) |
| Undercurrent | `https://www.signumhq.com` (12) | `https://www.signumhq.com` (12) |
| WIM | `https://www.signumhq.com/{en,ja,ko}/wim` (12) | `…/wim/support` (12) |

→ 바꿀 값: 뒤에 **`?from=appstore_site`**(marketing) · **`?from=appstore_support`**(support) 를 붙인다.
   목적지는 같고 추적만 붙는다. 지금은 이 클릭이 전부 무태그로 섞여 `from=home` 에 묻힌다.

### 2. 앱 미리보기 영상(`appPreviewSets`)
- 규격 1080×1920 / 30fps / 15~30초. Remotion 파이프라인이 그 규격을 이미 만든다.
- ⚠️ 애플은 «앱이 실제 동작하는 화면»을 요구한다 — 데이터 모션그래픽은 반려 위험. **앱 화면 캡처**로 만든다.
- 순서: en-US 한 편 올려 통과 확인 → ko/ja 복제.

### 3. 인앱 이벤트를 새로 만들 때
- **`deepLink` 에 `?from=` 을 «생성 시점»에 넣는다.** 승인 후엔 잠긴다(§45).
- 현재 SIGNUM 이벤트가 그래서 무태그다. 다음 이벤트부터 적용.

### 4. 이름·부제·키워드
- 빌드가 있어야 바뀐다. 한국어 ASO 실측(붙여쓰기 한 칸이 순위 12칸)을 반영할 기회다.
