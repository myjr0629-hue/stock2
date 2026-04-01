# SIGNUM HQ — Shorts Video Pipeline TODO

## 🔧 즉시 수정 필요
- [ ] **배경 너무 어두움** — `filter: brightness()` 값을 0.3→0.45+ 로 올려서 배경 이미지가 더 잘 보이게 수정
- [ ] **Scene 3 (VIX Twist) 배경** — 빨간 캔들차트가 거의 안 보임, brightness 0.3→0.5 이상으로

## 🎨 디자인 개선
- [ ] **실제 뉴스 이미지 자동 삽입** — Unsplash/Pexels API로 당일 시장 관련 이미지 자동 다운로드
- [ ] **썸네일 최적화** — 첫 프레임을 별도 고해상도 썸네일로도 추출 (YouTube 업로드용)
- [ ] **장면 전환 효과** — 단순 페이드 대신 와이프/줌 전환 추가
- [ ] **숫자 카운팅 애니메이션** — CSS counter를 활용한 0→5,611 카운트업 효과
- [ ] **하단 자막 바** — 뉴스 채널 스타일 실시간 티커 하단 바

## 🌏 다국어 지원
- [ ] **한국어 버전** — TTS VoiceId: Seoyeon (KO), 템플릿 텍스트 한국어화
- [ ] **일본어 버전** — TTS VoiceId: Takumi (JA), 템플릿 텍스트 일본어화
- [ ] **자동 3개 언어 동시 생성** — render.js에 `--lang ko/en/ja` 옵션

## 🤖 자동화
- [ ] **실시간 Redis 데이터 주입** — 하드코딩 대신 Redis에서 당일 마켓 데이터 자동 로드
- [ ] **Lambda 통합** — AWS Lambda에서 자동 렌더링 트리거 (EC2 worker 필요)
- [ ] **YouTube Shorts 자동 업로드** — YouTube Data API v3 연동
- [ ] **TikTok 자동 업로드** — TikTok Content Posting API 연동
- [ ] **Instagram Reels 자동 업로드** — Instagram Graph API 연동

## 🎵 오디오 개선
- [ ] **프리미엄 BGM** — 로열티 프리 음원 다운로드 (Pixabay Audio 등) 또는 자체 제작
- [ ] **효과음 추가** — 장면 전환 시 whoosh, 숫자 표시 시 tick 효과음
- [ ] **BGM 자동 페이드** — TTS 음성 구간에서 BGM 자동 ducking

## 📊 콘텐츠 확장
- [ ] **섹터별 쇼츠** — M7, Physical AI 등 섹터별 전용 쇼츠 템플릿
- [ ] **주간 요약 쇼츠** — 월~금 5일간 데이터를 1분 쇼츠로 요약
- [ ] **Earnings Alert 쇼츠** — 실적 발표 전/후 자동 생성
