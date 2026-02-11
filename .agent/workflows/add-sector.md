---
description: 새 섹터 리포트 추가 (M7 템플릿 기반)
---

# 새 섹터 리포트 추가

M7 리포트를 기본 템플릿으로 사용하여 새 섹터를 추가하는 워크플로우입니다.
종목 리스트와 테마만 바꾸면 전체 리포트가 자동 생성됩니다.

## 1. SectorConfig 파일 생성

`src/configs/{sector_id}.config.ts` 파일 생성:

```ts
import type { SectorConfig } from '@/types/sector';

export const {sectorId}Config: SectorConfig = {
    id: '{sector_id}',
    name: '{Sector Full Name}',
    shortName: '{SHORT}',
    description: '{One-line description}',
    icon: '{emoji}',
    theme: {
        accent: '{tailwind color}',     // e.g. 'cyan', 'violet', 'emerald', 'rose'
        accentHex: '{hex color}',        // e.g. '#06b6d4'
        bg: 'bg-{color}-500/5',
        border: 'border-{color}-500/20',
        glow: 'shadow-[0_0_20px_rgba({r},{g},{b},0.15)]',
        gradient: 'from-{color}-500/20 to-transparent',
    },
    tickers: ['TICK1', 'TICK2', 'TICK3', ...],  // 7개 추천
    apiEndpoints: {
        live: '/api/intel/{sector_id}',
        snapshot: '/api/intel/snapshot?sector={sector_id}',
        calendar: '/api/{sector_id}/calendar',   // Finnhub earnings + recommendations
    },
};
```

## 2. Calendar API 엔드포인트 생성

`src/app/api/{sector_id}/calendar/route.ts` 생성.
기존 `/api/intel/m7-calendar/route.ts` 또는 `/api/physicalai/calendar/route.ts`를 참고하여,
새 config의 tickers로 Finnhub API 호출.

## 3. Live Data API 엔드포인트 생성

`src/app/api/intel/{sector_id}/route.ts` 생성.
기존 `/api/intel/m7/route.ts`를 참고하여 새 config의 tickers로 데이터 호출.

## 4. IntelClientPage에 탭 및 섹션 추가

`src/app/[locale]/intel/IntelClientPage.tsx`에서:

### 4.1 Import 추가
```ts
import { {sectorId}Config } from "@/configs/{sector_id}.config";
```

### 4.2 탭 버튼 추가
기존 탭 버튼 배열에 새 탭 추가.

### 4.3 섹션 렌더링 추가
기존 M7/PhysicalAI 패턴과 동일하게:
```tsx
<div className={activeTab === '{SECTOR_TAB_ID}' ? "space-y-4" : "hidden"}>
    <section>
        <SectorSessionGrid config={{sectorId}Config} quotes={sectorData.{sectorId}} />
    </section>
    <section>
        <SectorRankingRow config={{sectorId}Config} quotes={sectorData.{sectorId}} />
    </section>
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectorAnalystConsensus config={{sectorId}Config} />
        <SectorEarningsCalendar config={{sectorId}Config} />
    </section>
    <section>
        <TacticalReportDeck config={{sectorId}Config} />
    </section>
</div>
```

### 4.4 Shared Data Hook에 새 섹터 데이터 추가
`src/hooks/useIntelSharedData.ts`에서 새 섹터의 실시간 데이터 fetch 추가.

## 5. Snapshot API (선택)

일일 스냅샷이 필요하면 `/api/intel/snapshot` 라우트에서 새 sector_id 처리 추가.

## 제네릭 컴포넌트 (이미 구현됨)

| 컴포넌트 | 용도 | 위치 |
|---------|------|------|
| `SectorSessionGrid` | 실시간 상황판 | Zone A |
| `SectorRankingRow` | Money Flow / Squeeze / Pain Divergence 3카드 | Zone A-2 |
| `SectorAnalystConsensus` | 애널리스트 컨센서스 (자동 fetch 지원) | Zone B |
| `SectorEarningsCalendar` | 실적 캘린더 3개 (자동 fetch 지원) | Zone B |
| `TacticalReportDeck` | 장마감 고정 보고서 | Zone C |

## 정렬 규칙 (템플릿에 내장됨)

- **Money Flow**: 내림차순 (양수 상위, 음수 하위) — `b.value - a.value`
- **Squeeze Proximity**: 오름차순 (가까울수록 위험) — `a.value - b.value`
- **Pain Divergence**: 절대값 내림차순 (괴리 큰 순) — `Math.abs(b.value) - Math.abs(a.value)`
