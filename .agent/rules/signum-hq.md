---
description: SIGNUM HQ 플랫폼 개발 규칙 및 가이드라인
---

# SIGNUM HQ Platform Rules

## 1. Alpha Logic Priority (알파 로직 우선)

모든 분석과 결론은 Alpha Engine의 출력을 최우선으로 사용합니다:

- **Options Structure** (GEX, Gamma Flip, Max Pain)이 가격 예측의 핵심
- 뉴스 센티먼트보다 **옵션 플로우**가 우선
- 기술적 지표(RSI, VWAP)는 보조 역할

```
우선순위: Options Flow > Price Action > Technical > News
```

## 2. 번역 전략 (Translation Strategy)

### 금융 용어는 영어 유지
```
GEX, Max Pain, Gamma Flip, Call Wall, Put Floor, VWAP, RSI
```

### UI 텍스트는 현지화
```
ko: "숏감마 + Max Pain 상회 → 하방 압력, 관망"
en: "Short Gamma + Above Max Pain → Downside pressure, Hold"
ja: "ショートGamma + Max Pain上回り → 下落圧力、様子見"
```

### 번역 키 규칙
- 새 UI 텍스트 추가 시 반드시 3개 언어(ko/en/ja) 동시 추가
- 금융 용어 직역 금지, 트레이딩 관점에서 의역

## 3. 데이터 무결성 (Data Integrity)

### Mock 데이터 금지
- 모든 컴포넌트는 실제 API 데이터 또는 Alpha Engine 출력만 사용
- 데이터 없을 시 로딩 상태 또는 "N/A" 표시
- 절대 하드코딩 샘플 데이터 사용 금지

### 보고서 스냅샷 원칙
- 보고서는 **생성 시점의 스냅샷**
- 장 마감 후에도 생성 당시 데이터 표시
- `decisionSSOT.snapshotData`에 영구 저장

## 4. 일관성 규칙 (Consistency Rules)

### 동일 데이터 = 동일 소스
- Watchlist와 Command 페이지의 Gamma Flip은 동일 API 사용
- M7/PhysicalAI Deck과 보고서의 결론은 동일 키 사용

### 한줄 결론 SSOT
- 엔진에서 생성 → UI에서 표시
- 번역 키 기반으로 다국어 자동 지원

## 5. 성능 최적화

### Gemini API 호출
- Rate Limit 준수 (15 RPM)
- 장외시간 호출 스킵, Redis 캐시 활용
- 타임아웃 10초, 재시도 3회

### 데이터 캐싱
- Guardian Context: 5분
- 보고서: 생성 후 영구 저장
- 옵션 스냅샷: 주말 금요일 데이터 캐시
