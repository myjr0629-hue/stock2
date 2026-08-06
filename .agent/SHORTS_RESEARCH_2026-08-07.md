# 쇼츠 조사 원문 — 수익화·시각 리텐션·대본 트리 (2026-08-07)

7에이전트 워크플로(3조사 + 3적대검증 + 1종합) 결과 원문.
반영 현황·적용 판단은 `SHORTS_ENGINE_MASTER.md` §5 가 정본이다.

---

{
  "summary": "쇼츠 수익화 기준·시각 리텐션 기법·대본 트리구조 병렬 조사 + 적대검증",
  "agentCount": 7,
  "logs": [],
  "result": {
    "synthesis": "## 수익화 요건(사실만)\n\n**확정(공식 문서 재검증 완료, 2026-08 기준):**\n\n- 광고 수익쉐어(풀 YPP) 관문: **구독 1,000명 + 90일 유효 공개 Shorts 뷰 1,000만** 또는 구독 1,000명 + 12개월 공개 시청 4,000시간. Shorts 피드 시청시간은 4,000시간에 **집계되지 않으므로**, 쇼츠 전용 채널의 실질 경로는 90일 1,000만 뷰뿐.\n- 구독 500명 조기 티어는 팬펀딩(Super Thanks·멤버십·Shopping)만 열림. **광고수익 없음.**\n- 배분 구조: 국가별 월간 풀 → 음악 라이선스 차감 → engaged views 비중대로 배분 → 크리에이터 **45%** 수령.\n- **음악 사용 여부는 «내» 수령액을 깎지 않는다.** 라이선스 비용은 국가 풀 전체에서 차감(사회화)되고 개인 배분은 음악 무관 engaged views 기준(공식 문구: \"regardless if music was used or not\"). → **«수익 때문에 무음악» 규칙은 근거 없음. BGM 결정은 리텐션 기준으로만.**\n- RPM 실측: Shorts 전체 평균 **$0.03–$0.10/1천뷰**(vidIQ 실측 468,500뷰 = $16.61). 국가별 풀 구조이므로 **시청자 지역이 단가를 직접 결정** → en 콘텐츠·미국 시청 비중이 전제 조건.\n\n**(미확정 — 공식 문서 출처이나 별도 검증 미실시):**\n\n- 2024-10-15 이후 3분 이하 세로 영상은 전부 Shorts 수익쉐어 → 42초 목표는 분류상 안전.\n- 수익쉐어는 모듈 수락 이후 조회만 집계되며 **비독창(reused) 콘텐츠 제외** → 자동 생산 쇼츠는 자체 데이터·자체 렌더 그래픽이라는 독창성 증빙이 최대 리스크 관리 포인트.\n- Finance 니치 RPM $0.04–$0.32, 롱폼 대비 1/50–1/100, 광고가 주수입인 크리에이터 ~34% → 쇼츠 광고수익은 부수입이고 **경제적 본질은 자체 앱 유입 깔때기**라는 설계 방향 자체는 유지.\n\n## 시각 리텐션 — 적용할 수치\n\n**적용(복수 독립 소스 교차 확인):**\n\n- **컷 간격 2–4초**가 교차 확인된 권고 대역(OpusClip 2–4초·ClipFlip 2–3초·blitzcut 2–3초). «상위 100 Shorts 평균 2.5초 = 완주율 +35%» 통계 자체는 원출처 불명이므로 근거로 쓰지 말 것.\n- **단일 숏 3초 초과 시 주의력 이탈** — 3초 넘는 씬에는 내부 시각 변화(펀치인·데이터 하이라이트) 필수.\n- 첫 3초 집중 이탈은 방향성 일치(개별 %는 미확정) → 훅 구간에 시각 예산 최우선 배정.\n- **자막 번인 자체가 완주율 +12–15%, 형식 무관** — 카라오케(워드 단위) 우위 주장은 반증됨. 데이터/교육형은 **2–5단어 구 단위 블록**이 안전한 선택.\n- 색·대비(고신뢰): WCAG 4.5:1(일반)/3:1(큰 텍스트)은 하한일 뿐, **다크 배경은 WCAG가 대비를 과대평가하므로 APCA로 재검증**. 강조색은 60-30-10의 10%를 액션·포커스에만(희소성). **등락 빨강/초록은 색 단독 금지 — 화살표·+/− 부호 제2채널 병행**(적록색각 ~8%).\n- 플랫폼 사실: **Shorts는 커스텀 썸네일 불가** → 첫 프레임 자체를 썸네일급으로 설계해야 함.\n- 리텐션 벤치마크 고정값(«60% 최소·80% 최상위», «15–30초 최적»)은 소스 간 충돌로 판단 불가 — 자평 지표는 리텐션 %가 아니라 YouTube 내장 «유사 길이 대비» 비교와 Viewed vs Swiped를 쓸 것.\n\n**(미확정 — 벤더 단일 소스, 방향만 채택):**\n\n- 텍스트 타이밍: 팝인 0.2초, 새 텍스트 비트 1–2초 간격, 읽기 상한 20자/초, 최소 유지 0.5초, 동시 애니메이션 속성 ≤3.\n- 펀치인: 100%→120% 즉시 스케일, 줌 지속 0.3–0.5초.\n- 첫 프레임 텍스트 0–3단어 + 두꺼운 아웃라인, 120px 축소 상태 가독 테스트.\n- 세이프존(1080×1920): 핵심 요소는 중앙 ~900×1160px, 상·하단 380px·우측 120px 회피.\n\n## 대본 트리구조 — 적용할 규칙\n\n(이 토픽은 검증 패스 결과가 미수신 — found 단계 신뢰도 기준, 전체를 (미확정)으로 취급하되 고신뢰 항목을 규칙화)\n\n- **시간 배분**: 훅 1–3초 / 바디 70–80% / 페이오프 10–20%. 30초 기준 비트: 0–3 훅 → 3–8 맥락 → 8–22 포인트 2–3개 → 22–27 페이오프 → 27–30 CTA.\n- **에스컬레이션 원칙**: 증거(가지)는 약→강 순서로 배치, 각 포인트가 직전보다 흥미로워야 함. 최강 증거를 선두에 쓰지 말 것.\n- **one video, one idea**: 영상당 큰 주장 1개, 비트당 문장 1개. 메시지가 끝나는 시점 = 영상이 끝나는 시점(알고리즘은 총 시청초가 아니라 완주율 보상). 목표 길이를 채우려 늘리기 금지.\n- **오픈 루프 예산**: 30–45초 쇼츠는 메인 루프 1개(훅에서 열고 페이오프에서 닫음) + 미니 루프 최대 1개 (미확정). **모든 루프는 반드시 닫는다** — 닫지 않으면 리텐션 이득 소멸.\n- **구조적 루프** (미확정): 엔딩이 오프닝으로 회귀하는 설계 — 2025-03-31부터 리플레이가 개별 조회수로 집계되어 알고리즘 보상 있음.\n- **훅 공식**(데이터 쇼츠 직결 3종): ①숫자 드랍(«68%가…» — 구체 수치 > 일반화) ②역발상/통념 부정 ③실수·경고(손실 회피). «숨겨진 정보/적 설정» 프레임은 효과 보고가 있으나 우리 컴플라이언스 톤과 충돌 가능 — 도입 시 별도 검토.\n- **CTA** (미확정): 페이오프가 떨어지는 순간 즉시 컷이 정석. 영상 내 CTA는 최대 2초, 나머지는 캡션·고정댓글로 이동.\n- **시각 리듬**: 시각 변화 없는 발화 최대 8초 — 컷 규칙을 지키면 자동 충족.\n\n## 우리 현재 스펙과의 차이(갭 목록)\n\n| # | 항목 | 현재 | 목표 | 조치 |\n|---|------|------|------|------|\n| 1 | 본문 컷 | 3.2–3.8초 | 2.5–3.2초 | 교차 확인 대역(2–4초)의 상단 밖. 본문 컷 단축 |\n| 2 | 증거 씬 | 4.5초 단일 컷 | 유지하되 2단 분할 | 전 소스 권고 초과. 1.5–2초 시점에 펀치인(100→120%·0.3–0.5초)+데이터 하이라이트로 내부 인터럽트 삽입 |\n| 3 | CTA | 4초 | ≤2초 | 남는 2초는 페이오프 강화 또는 첫 프레임 회귀형 루프 엔딩으로 재배정 (미확정이나 복수 소스 방향 일치) |\n| 4 | 커리오시티 루프 | 컷마다 미답 질문 | 메인 1 + 미니 1 | 컷마다 열면 못 닫는 루프 발생 → 리텐션 이득 소멸. 대본 린트에 «열린 질문 전부 닫혔는가» 체크 추가 |\n| 5 | 자막 유지 | 1.5–3초 | 1–2초 위주 | 새 텍스트 비트 1–2초 권고(미확정) 대비 3초 유지는 과다. 26자·1.5초=17자/초로 읽기 상한(20자/초) 이내 — 하한은 유지 |\n| 6 | 자막 크기 | 74px | 유지 | (미확정) 권고 54–70pt(≈72–93px) 대역 안. 형식은 2–5단어 블록 유지 — 카라오케 전환 불필요(우위 반증됨) |\n| 7 | 첫 프레임 | 스펙 없음 | 썸네일급 프레임 0 신설 | 커스텀 썸네일 불가(플랫폼 사실). 0–3단어 초대형 텍스트+티커, 120px 축소 가독을 기존 자동 검수 게이트(밝기·컷 하한)에 편입 |\n| 8 | 세이프존 | 미정의 | 중앙 ~900×1160px | (미확정 수치) 자막·티커·CTA 좌표 전수 점검, 우측 120px·하단 380px 회피 |\n| 9 | 색 검증 | WCAG만 | APCA 병행 + 제2채널 | 다크 배경은 WCAG 과대평가. 등락 표기에 화살표/부호 강제, 강조색 희소성(10%) 토큰화 |\n| 10 | 42초 목표 | 고정 목표 | 상한으로 재정의 | 분류상 안전(3분 이하, 미확정·공식문서). 단 one-idea 종료 시점이 우선 — 30초에 끝나면 30초로 출고 |\n| 11 | 증거 배치 순서 | 규칙 없음 | 약→강 에스컬레이션 | 대본 생성기에 증거 정렬 규칙 추가 |\n| 12 | BGM 정책 | (무음악=수익 유리 가정 시) | 폐기 | 개인 수령액은 음악 무관(공식 확정). 리텐션 기준으로만 결정 |\n| 13 | 언어·지역 | — | en 우선 | 국가별 풀 확정 → 미국 시청 비중이 RPM 결정. 광고수익은 부수입, CTA 깔때기는 자체 앱으로 |\n| 14 | 독창성 증빙 | — | 자체 데이터·자체 렌더 명시 | reused content 판정 리스크(미확정·공식문서) — 스톡 소스 단독 구성 금지 |",
    "raw": [
      {
        "topic": "monetization",
        "nClaims": 18
      },
      {
        "topic": "visual-retention",
        "nClaims": 18
      },
      {
        "topic": "script-tree",
        "nClaims": 21
      }
    ]
  },
  "workflowProgress": [
    {
      "type": "workflow_phase",
      "index": 1,
      "title": "Research"
    },
    {
      "type": "workflow_phase",
      "index": 2,
      "title": "Verify"
    },
    {
      "type": "workflow_phase",
      "index": 3,
      "title": "Synthesize"
    },
    {
      "type": "workflow_agent",
      "index": 1,
      "label": "research:monetization",
      "phaseIndex": 1,
      "phaseTitle": "Research",
      "agentId": "af8bcb3f619a4f281",
      "model": "claude-fable-5",
      "state": "done",
      "startedAt": 1786031383922,
      "queuedAt": 1786031380941,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "2025-2026 기준 쇼츠 «실수익» 조건 조사 결과. (1) 가입 임계…",
      "promptPreview": "웹서치로 조사하라 (ToolSearch로 WebSearch/WebFetch를 로드해서 사용).\n주제: 2025-2026 기준 쇼츠(YouTube Shorts 중심, TikTok/Reels 보조)로 «실제 수익»을 내기 위한 조건.\n반드시 확인할 것:\n1. YouTube Shorts 수익화(revenue sharing) 가입 조건 — 구독자 수·조회수 임계값의 정확한 현재 수치\n2. Shorts RPM 실측 범위 — 특히 finance/투자 니치의 RPM이 일반 대비 얼마나 높은지\n3. 영상 길이와 수익의 관계 — 1분 이상/이하, 3분 확장 후 변화\n4. 조회수→수익 외의 수익 경로(제휴·스폰서)에서 finance 쇼츠 채널이 실제로 쓰는 방식\n각 주장에 출처 URL을 붙여라. 최종 텍스트가 아니라 구조화된…",
      "lastProgressAt": 1786031628574,
      "tokens": 53952,
      "toolCalls": 15,
      "durationMs": 244647,
      "resultPreview": "{\"claims\":[{\"claim\":\"YouTube Shorts 광고 수익쉐어(풀 YPP) 가입 조건은 «구독자 1,000명 + 최근 90일 유효 공개 Shorts 조회수 1,000만» 또는 «구독자 1,000명 + 최근 12개월 유효 공개 시청 4,000시간» 중 하나다 (2026-08 시점 공식 문서 기준, 변동 없음).\",\"source\":\"https://support.google.com/youtube/answer/72851\",\"confidence\":\"high\"},{\"claim\":\"Shorts 시청시간은 4,000시간 경로에 집계되지 않는다 — Shorts로만 가려면 90일 1,000만 뷰 경로뿐이며, 두 경로 모두 국가 지원 + 심사 통과가 별도 필요하다.\",\"source\":\"https://vidiq.…"
    },
    {
      "type": "workflow_agent",
      "index": 2,
      "label": "research:visual-retention",
      "phaseIndex": 1,
      "phaseTitle": "Research",
      "agentId": "a688215695cd91a2a",
      "model": "claude-fable-5",
      "state": "done",
      "startedAt": 1786031384017,
      "queuedAt": 1786031380942,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "데이터/금융 쇼츠의 시선 장악 기법을 수치·사례 중심으로 조사…",
      "promptPreview": "웹서치로 조사하라 (ToolSearch로 WebSearch/WebFetch를 로드해서 사용).\n주제: 데이터/금융 쇼츠에서 «시각적으로 시선을 잡는» 구체 기법 — 감이 아니라 수치와 사례.\n반드시 확인할 것:\n1. 패턴 인터럽트 주기 — 몇 초마다 화면 변화를 줘야 리텐션이 유지되는지 (실측/연구)\n2. 텍스트 애니메이션 — 워드 단위 팝인 vs 라인 단위, 타이밍 수치\n3. 모션 기법 — 줌/펀치인 강도, 카메라 흔들림, 속도 램프의 실제 사용 수치\n4. 색·대비 — 다크 배경 금융 쇼츠에서 강조색 사용 규칙, 첫 프레임(썸네일 프레임) 설계\n5. 잘 되는 faceless 데이터 쇼츠 채널 2-3곳의 실제 시각 문법 해부\n각 주장에 출처를 붙여라.",
      "lastProgressAt": 1786031765884,
      "tokens": 70509,
      "toolCalls": 24,
      "durationMs": 381867,
      "resultPreview": "{\"claims\":[{\"claim\":\"패턴 인터럽트 주기: 쇼츠에서는 3–5초마다 화면 변화(컷·텍스트 등장·앵글 전환·그래픽) 하나가 표준 권고이며, 첫 1–2초 내 시각 변화가 훅 레이트를 올린다. 롱폼은 30–60초마다 1회면 충분\",\"source\":\"https://edicionvideopro.com/en/editing-for-platforms-video-marketing/pattern-interrupts-tiktok-retention-guide/ ; https://blitzcutai.com/blog/increase-tiktok-watch-time-editing\",\"confidence\":\"medium\"},{\"claim\":\"인터럽트 유무 실측(에이전시 내부 데이터, TikTok 200+편, 2024.10…"
    },
    {
      "type": "workflow_agent",
      "index": 3,
      "label": "research:script-tree",
      "phaseIndex": 1,
      "phaseTitle": "Research",
      "agentId": "a65d20aac47ef8079",
      "model": "claude-fable-5",
      "state": "done",
      "startedAt": 1786031385145,
      "queuedAt": 1786031380942,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "금융/데이터 쇼츠 대본 구조 웹 조사 완료. 핵심 결론: (1) 훅 …",
      "promptPreview": "웹서치로 조사하라 (ToolSearch로 WebSearch/WebFetch를 로드해서 사용).\n주제: 성공한 금융/데이터 쇼츠의 «대본 구조» — 트리 구조(주장→가지→증거→수렴)가 영상 흐름에 어떻게 드러나는지.\n반드시 확인할 것:\n1. 훅 공식 — 금융 쇼츠에서 실제로 쓰이는 첫 문장 패턴 5개 이상 (실제 채널 사례)\n2. 정보 계층 — 큰 주장 1개 + 지지 증거 N개를 어떤 순서/시간 배분으로 배치하는지\n3. 오픈 루프(답 미루기) 기법의 실제 사용 예와 한 영상당 적정 횟수\n4. CTA — 구독/팔로우 요청 없이도 전환되는 마무리 패턴 (금융 컴플라이언스 채널 사례)\n5. 30-45초 대본의 단어 수/문장 수 실측 범위\n각 주장에 출처를 붙여라.",
      "lastProgressAt": 1786031700378,
      "tokens": 58450,
      "toolCalls": 17,
      "durationMs": 315232,
      "resultPreview": "{\"claims\":[{\"claim\":\"훅 공식 #1 — «스킷 시나리오 훅»: Erika Kullberg(팔로워 2,100만)는 첫 문장을 상황극 대사로 연다. 실제 사례: \\\"Hi, my shoe has a tear, can I get a new pair?\\\"(75.4M 조회), \\\"Hi my AirPods got stolen so I'm here to get new ones for free\\\"(26.9M 조회). 브랜드 로고를 그린스크린 배경으로 깔아 0초부터 인지도를 훔친다.\",\"source\":\"https://startupspells.com/p/exposing-erika-kullbergs-21-million-followers-growth-strategy\",\"confidence\":\"high\"},{\"cla…"
    },
    {
      "type": "workflow_agent",
      "index": 4,
      "label": "verify:monetization",
      "phaseIndex": 2,
      "phaseTitle": "Verify",
      "agentId": "a6621a54bc76060d0",
      "model": "claude-fable-5",
      "state": "done",
      "startedAt": 1786031632371,
      "queuedAt": 1786031630509,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "promptPreview": "다음 주장들을 «반박»하라. 웹서치(ToolSearch로 WebSearch 로드)로 각 주장이 틀렸거나 낡았을 가능성을 적극적으로 찾아라. 특히 수치(임계값·RPM·초 단위 타이밍)는 2026년 현재 기준으로 재확인하라. 확실히 반증되면 refuted, 재확인되면 confirmed, 판단 불가면 uncertain.\n\n1. YouTube Shorts 광고 수익쉐어(풀 YPP) 가입 조건은 «구독자 1,000명 + 최근 90일 유효 공개 Shorts 조회수 1,000만» 또는 «구독자 1,000명 + 최근 12개월 유효 공개 시청 4,000시간» 중 하나다 (2026-08 시점 공식 문서 기준, 변동 없음). (출처: https://support.google.com/youtube/answer/72851)\n2. …",
      "lastProgressAt": 1786031795215,
      "tokens": 47751,
      "toolCalls": 9,
      "durationMs": 162843,
      "resultPreview": "{\"verdicts\":[{\"claim\":\"풀 YPP(광고 수익쉐어) 가입 조건 = 구독자 1,000명 + 90일 Shorts 조회 1,000만 뷰 OR 구독자 1,000명 + 12개월 시청 4,000시간 (2026-08 변동 없음)\",\"verdict\":\"confirmed\",\"why\":\"오늘(2026-08-07) 공식 문서(support.google.com/youtube/answer/72851)를 직접 페치해 확인: \\\"1,000 subscribers with 4,000 valid public watch hours in the last 12 months\\\" 또는 \\\"1,000 subscribers with 10 million valid public Shorts views in the last 90 days\\\"…"
    },
    {
      "type": "workflow_agent",
      "index": 5,
      "label": "verify:script-tree",
      "phaseIndex": 2,
      "phaseTitle": "Verify",
      "agentId": "a0e6afab16bdaa8f1",
      "model": "claude-fable-5",
      "state": "done",
      "startedAt": 1786031706122,
      "queuedAt": 1786031703875,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "promptPreview": "다음 주장들을 «반박»하라. 웹서치(ToolSearch로 WebSearch 로드)로 각 주장이 틀렸거나 낡았을 가능성을 적극적으로 찾아라. 특히 수치(임계값·RPM·초 단위 타이밍)는 2026년 현재 기준으로 재확인하라. 확실히 반증되면 refuted, 재확인되면 confirmed, 판단 불가면 uncertain.\n\n1. 훅 공식 #1 — «스킷 시나리오 훅»: Erika Kullberg(팔로워 2,100만)는 첫 문장을 상황극 대사로 연다. 실제 사례: \"Hi, my shoe has a tear, can I get a new pair?\"(75.4M 조회), \"Hi my AirPods got stolen so I'm here to get new ones for free\"(26.9M 조회). 브랜드 로고를 그…",
      "lastProgressAt": 1786031875923,
      "tokens": 50980,
      "toolCalls": 12,
      "durationMs": 169798,
      "resultPreview": "{\"verdicts\":[{\"claim\":\"훅 공식 #1 — 스킷 시나리오 훅 (Erika Kullberg 2,100만·신발 75.4M·에어팟 26.9M·그린스크린 로고)\",\"verdict\":\"confirmed\",\"why\":\"출처 원문 재확인: 21M 팔로워·두 대사·두 조회수·그린스크린 브랜드 로고(Nike/Apple/Amazon 등) 전부 기재됨. 독립 교차검증: Newsweek가 신발 영상의 대사 \\\"Hi my shoe has a tear, can I get a new pair?\\\"를 그대로 인용하며 게재 시점 67M→이후 75M+ 조회로 보도, 에어팟 영상도 실존(좋아요 2.9M, iTechPost 보도). 2,100만은 2026년 현재도 erika.com·Entrepreneur가 쓰는 수치이나 단일 …"
    },
    {
      "type": "workflow_agent",
      "index": 6,
      "label": "verify:visual-retention",
      "phaseIndex": 2,
      "phaseTitle": "Verify",
      "agentId": "aa3d89f8ea47e83e3",
      "model": "claude-fable-5",
      "state": "done",
      "startedAt": 1786031770811,
      "queuedAt": 1786031768176,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "promptPreview": "다음 주장들을 «반박»하라. 웹서치(ToolSearch로 WebSearch 로드)로 각 주장이 틀렸거나 낡았을 가능성을 적극적으로 찾아라. 특히 수치(임계값·RPM·초 단위 타이밍)는 2026년 현재 기준으로 재확인하라. 확실히 반증되면 refuted, 재확인되면 confirmed, 판단 불가면 uncertain.\n\n1. 패턴 인터럽트 주기: 쇼츠에서는 3–5초마다 화면 변화(컷·텍스트 등장·앵글 전환·그래픽) 하나가 표준 권고이며, 첫 1–2초 내 시각 변화가 훅 레이트를 올린다. 롱폼은 30–60초마다 1회면 충분 (출처: https://edicionvideopro.com/en/editing-for-platforms-video-marketing/pattern-interrupts-tiktok-retenti…",
      "lastProgressAt": 1786032223251,
      "tokens": 70468,
      "toolCalls": 20,
      "durationMs": 452436,
      "resultPreview": "{\"verdicts\":[{\"claim\":\"패턴 인터럽트 주기: 쇼츠 3–5초마다 화면 변화가 표준 권고, 첫 1–2초 시각 변화가 훅 레이트 상승, 롱폼은 30–60초마다 1회\",\"verdict\":\"uncertain\",\"why\":\"edicionvideopro는 3–5초(숏폼)·30–60초(롱폼)를 실제로 명시하나, 함께 인용된 blitzcut은 '2–3초마다'를 권고해 주장의 인용 소스끼리부터 어긋난다. 2026년 소스 다수가 더 빠른 간격을 권고한다(OpusClip 컷 2–4초, ClipFlip 2–3초, 쇼츠 분석사 Shortimize는 '1–2초마다 무언가 변화'). 즉 3–5초는 업계 스펙트럼(1–5초)의 가장 느린 끝이라 '표준'이라 부르기 어렵다. '첫 1–2초 시각 변화→훅 레이트' 문구는 두 …"
    },
    {
      "type": "workflow_agent",
      "index": 7,
      "label": "synthesize",
      "phaseIndex": 3,
      "phaseTitle": "Synthesize",
      "agentId": "a287d39c798d49501",
      "model": "claude-fable-5",
      "state": "done",
      "startedAt": 1786032228327,
      "queuedAt": 1786032225345,
      "attempt": 1,
      "promptPreview": "너는 SIGNUM HQ의 쇼츠 엔진(Remotion 기반, 1080x1920, 다크 금융 브리핑) 설계자다.\n아래 조사+검증 결과를 종합해서, «우리 템플릿에 지금 적용할 구체적 변경 목록»을 한국어 마크다운으로 작성하라.\n형식: ## 수익화 요건(사실만) / ## 시각 리텐션 — 적용할 수치 / ## 대본 트리구조 — 적용할 규칙 / ## 우리 현재 스펙과의 차이(갭 목록)\n현재 우리 스펙: 자막 74px·26자·1.5~3초, 컷 3.2~3.8초, 42초 목표, 훅3s/본문3.2s/증거4.5s/CTA4s, 연쇄 커리오시티 루프(컷마다 미답 질문).\nrefuted 된 주장은 쓰지 말고, confirmed 위주로, uncertain 은 (미확정) 표기.\n결과는 보고서 텍스트 그대로 반환.\n\n[\n {\n  \"to…",
      "lastProgressAt": 1786032399405,
      "tokens": 52578,
      "toolCalls": 0,
      "durationMs": 171077,
      "resultPreview": "## 수익화 요건(사실만)\n\n**확정(공식 문서 재검증 완료, 2026-08 기준):**\n\n- 광고 수익쉐어(풀 YPP) 관문: **구독 1,000명 + 90일 유효 공개 Shorts 뷰 1,000만** 또는 구독 1,000명 + 12개월 공개 시청 4,000시간. Shorts 피드 시청시간은 4,000시간에 **집계되지 않으므로**, 쇼츠 전용 채널의 실질 경로는 90일 1,000만 뷰뿐.\n- 구독 500명 조기 티어는 팬펀딩(Super Thanks·멤버십·Shopping)만 열림. **광고수익 없음.**\n- 배분 구조: 국가별 월간 풀 → 음악 라이선스 차감 → engaged views 비중대로 배분 → 크리에이터 **45%** 수령.\n- **음악 사용 여부는 «내» 수령액을 깎지 않는다.** 라이선스 …"
    }
  ],
  "totalTokens": 404688,
  "totalToolCalls": 97
}
