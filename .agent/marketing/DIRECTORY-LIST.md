# 제출 가능 디렉터리 107곳 — SaaSHub 관리 목록 (2026-08-24 확보)

출처: https://www.saashub.com/submit/list (무료·상시 갱신)
Pop = SaaSHub 인기도 / DS = 도메인 점수 / Traffic = 월 방문

**우리에게 의미 있는 것만 추린다.** AI 툴 디렉터리(Toolify·Futurepedia·TopAi 등 30여 곳)는
우리 앱이 AI 툴이 아니라 «금융 데이터 앱»이라 맞지 않는다. 억지로 넣으면 반려되거나
맞지 않는 청중에게 노출돼 의미가 없다.

## 이미 처리함
| 디렉터리 | DS | 트래픽 | 상태 |
|---|---|---|---|
| AlternativeTo | 87 | 5.5M | 3앱 등재, **몇 달 대기줄** ($5 로 1~2일 단축 가능) |
| Product Hunt | 90 | 3.2M | UC 런치 완료(0포인트) · WIM 8/29 · SIGNUM 8/30 |
| r/SideProject | 93 | 176K | 게시 완료, 살아있음 |
| Launching Next | 43 | 16.2K | 3앱 제출(무료 큐 4개월) |
| Uneed.best | 44 | 74K | SIGNUM 등록, 런치는 유료 |
| MicroLaunch | 27 | 50.4K | 유료 전용 |
| BetaList | 59 | 152K | 유료 |

## 다음 대상 (우리 앱에 맞고 무료)

### 8/24 추가 처리
| 디렉터리 | DS | 트래픽 | 상태 |
|---|---|---|---|
| PitchWall | 57 | 83K | **3앱 제출 완료**(8/24) · 무료 큐 30일+ |
| OpenHunts | 37 | 48K | SIGNUM 제출 완료(8/24) · **무료는 주 1개**, 최단 슬롯이 2028-07 |
| SourceForge | 92 | 18.4M | **reCAPTCHA 이미지 챌린지에서 막힘** → 대표 |
| Alternative.me | 55 | 1.6M | **이메일+비번 가입 필요**(OAuth 없음) → 대표 |

### 남은 곳
| 디렉터리 | DS | 트래픽 | 비고 |
|---|---|---|---|
| **Hacker News** | 89 | 13.5M | 최대. 아이디·비번 가입 필요 → 대표 |
| **SourceForge** | 92 | 18.4M | 트래픽 1위. 소프트웨어 등재 |
| **Slashdot** | 89 | 3.3M | SourceForge 계열 |
| **Indie Hackers** | 69 | 850K | 1인 개발 커뮤니티 |
| **StartupRanking** | 71 | 129K | 스타트업 랭킹 |
| **Startup Stash** | 56 | 185K | 큐레이션 |
| **PitchWall** | 57 | 83K | **모바일 앱 전용** — 우리와 정확히 맞음 |
| **StartupInspire** | 30 | 11.7K | |
| **Startup Buffer** | 42 | 57K | |
| **Startup Fame** | 49 | 5.2K | |
| **OpenHunts** | 37 | 48K | |
| **PeerPush** | 47 | - | 커뮤니티 기반 |
| **Make.rs** | 29 | 2.2K | |
| **SideProjectors** | 48 | 53K | |
| **AppRater** | 14 | 11.3K | **앱 평가** — 리뷰 0인 우리에게 의미 |
| **Website Hunt** | 21 | 56K | |
| **Tool Battles** | 11 | 100 | |
| **10words.io** | 22 | 1.4K | 한 줄 소개 |
| **DevHunt** | 44 | 104K | 개발자 대상 |
| **Alternative.me** | 55 | 1.6M | AlternativeTo 대안 |

## 맞지 않아 제외
- AI 툴 디렉터리 30여 곳(Toolify, Futurepedia, TopAi, aitools.fyi, EliteAI …)
  → 우리는 AI 툴이 아니라 금융 데이터 앱. 카테고리 불일치.
- G2 / Capterra / GetApp / Crozdesk / SelectHub / SoftwareSuggest / SaaSworthy
  → **B2B SaaS 리뷰 플랫폼**. 소비자 무료 앱은 대상이 아니다.
- AppSumo → 유료 라이프타임 딜 마켓. 무료 앱은 팔 게 없다.
- CyberSecTools / GoodFirms / TechImply → 분야 불일치.


---

## 2026-08-24 실측 메모

- **먼저 «이미 냈는지»를 확인할 것.** AlternativeTo 에 3앱을 또 넣으려다
  「An app with the name SIGNUM HQ already exists」로 막혔다. 확인해보니
  **8/22 에 3앱 다 제출**돼 있었다(`alternativeto.net/my-submissions`). 이 문서에도
  그렇게 적혀 있었는데 안 읽고 시작한 게 원인.
- **자동생성 소개문을 그대로 두면 안 된다.** OpenHunts 의 URL 자동채움이
  「premium data worth over $450/month」라는 **근거 없는 금액 주장**을 넣었다.
  UC 를 넣을 때도 SIGNUM 데이터를 그대로 재사용해 **제품 이미지까지 SIGNUM 배너**였다.
  전부 직접 덮어썼다.
- **무료 큐는 대부분 실질적으로 죽어 있다.** PitchWall 30일+, AlternativeTo 몇 달,
  OpenHunts **2028년 7월**. 유료 우회는 전부 결제라 손대지 않았다.
- OpenHunts 는 숨겨진 file input 이라 업로드가 안 됐다 →
  JS 로 `style` 을 덮어 노출시킨 뒤 ref 를 잡아 업로드했다.
