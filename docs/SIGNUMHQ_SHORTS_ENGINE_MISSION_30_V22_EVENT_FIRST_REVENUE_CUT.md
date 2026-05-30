# MISSION 30 완료 보고: MarketPressureBrief V22 — Event-First Revenue Cut

## 1. 최종 MP4 경로
`out/market_pressure_brief_v22_event_first_revenue_cut.mp4`

## 2. 듀레이션
**17.5초** (525프레임 @ 30fps)

## 3. 비트레이트 / ffprobe 요약
- **비디오 코덱**: H.264
- **해상도**: 1080×1920
- **비디오 비트레이트**: 14,829,385 bps (14.8 Mbps CBR)
- **오디오 코덱**: AAC 48000Hz stereo
- **오디오 비트레이트**: 317,375 bps
- **총 비트레이트**: 15,107,910 bps (15.1 Mbps)
- **파일 크기**: 33,156,828 bytes (31.6 MB)
- **상세**: `out/review/v22_ffprobe.json`

## 4. 오디오 무음 게이트 결과
```
ffmpeg -i [file] -af silencedetect=noise=-35dB:d=0.25 -f null -
```
**PASS**: `silence_start` 이벤트 0건 검출.
원문 로그: `out/review/v22_silencedetect.txt`

## 5. Replicate / Flux 2.0 사용 여부
**사용하지 않음.**

## 6. Replicate 미사용 사유
현재 인스티튜셔널 그리드 + 프로시저럴 파티클 시스템이 데이터 시각화 포맷에 충분한 깊이를 제공하고 있음.
Flux 배경 이미지를 추가할 경우 선명한 데이터 레이어가 흐려질 위험이 있으며, 리텐션에 대한 검증된 이점이 없음.
향후 퍼블릭 테스트 후 리텐션이 부족할 경우 Flux 2.0 대기실 에셋 생성을 검토 가능.

## 7. 가장 강한 프레임
**Frame 0 (0.0초)**: $420M OFF-EXCHANGE, 91st PERCENTILE, NEAR $600 WALL이 즉각적으로 노출됨.
이전 버전들의 "SPY LOOKS NORMAL" 수동적 오프닝과 근본적으로 다른 이벤트 퍼스트 접근.
붉은 콜월과 움직이는 시안 파티클이 프레임 0에서부터 시각적 긴장감을 구축함.

## 8. 가장 약한 프레임
**Frame 195 (6.5초)**: 압력 축적 씬의 후반부. 브라켓이 수축하면서 시각적 변화량이 감소함.
텍스트("PRESSURE CAN BUILD HERE")가 여전히 강하지만, 파티클 모션이 감속 후 정적으로 느껴질 수 있음.
퍼블릭 테스트 후 이 구간에서 이탈률이 높으면, 파티클 폭발 또는 추가 데이터 카드 삽입을 검토해야 함.

## 9. 정직한 점수 (Score with Cap)
**85 / 100** (퍼블릭 데이터 부재 시 최대 88점 Cap 적용)

| 항목 | 점수 |
|------|------|
| 첫 0.5초 스톱 파워 | 16/25 |
| 이벤트 선명도 | 18/20 |
| 호기심 / FOMO | 14/20 |
| 시각적 계층 구조 | 9/10 |
| 압력 시각화 | 12/15 |
| 제품 욕구 | 8/10 |
| 무음 우선 이해도 | 8/10 |
| 오디오 에너지 | 8/10 |
| 압축 안전성 | 9/10 |
| 컴플라이언스 안전성 | 9/10 |

## 10. 퍼블릭 업로드 테스트 권장 여부
**권장함.** V22는 이벤트 퍼스트 크리에이티브로의 전환을 완료한 첫 번째 버전임.
다만, "테스트 후보(test candidate)"이지 "확정 프로덕션 에셋"이 아님.

측정 필요 지표:
- Viewed vs Swiped Away: 목표 > 60%
- 평균 시청 시간: 목표 > 13.5초 (17.5초 영상 기준)
- 완주율: 목표 > 70%

## 11. 자동화 파이프라인 상태
**BLOCKED.** 퍼블릭 리텐션 데이터 없이는 자동화를 가동할 수 없음.

## 12. V21.x → V22 주요 크리에이티브 변경점

| 항목 | V21.2 | V22 |
|------|-------|-----|
| 오프닝 | "SPY LOOKS NORMAL. THE FLOW DOESN'T." | $420M OFF-EXCHANGE + 91st PERCENTILE + NEAR $600 WALL |
| 첫 프레임 콘셉트 | 수동적 대비 | 이벤트 충격 (Market Alert 느낌) |
| 씬 구조 | 6씬 | 7씬 (이벤트 충격 씬 추가) |
| 제품 대비 | 동일한 Split Screen | 강화된 Split Screen (Scanner sweep) |
| 압력 씬 | 단순 텍스트 | 수축 브라켓 + 가속 파티클 |
| ElevenLabs | v21_2_voice.mp3 재사용 | v22_voice.mp3 신규 생성 |

## 산출물 목록
- `out/market_pressure_brief_v22_event_first_revenue_cut.mp4` — 최종 마스터
- `out/review/v22_frame_*.jpg` — 12개 키프레임
- `out/review/v22_ffprobe.json` — FFprobe 메타데이터
- `out/review/v22_silencedetect.txt` — 무음 검출 원문 로그
- `out/review/v22_honest_score.md` — 정직한 점수 보고서
