
// [V3.7.3] Trigger Definitions for UI Tooltips
const TRIGGER_DEFINITIONS: Record<string, { label: string; desc: string; color: string }> = {
    // 1. High Impact (Purple/Pink)
    'GEX_SQZ': {
        label: 'GEX.SQZ',
        desc: '감마 스퀴즈: 옵션 시장의 쏠림(Short Gamma)으로 인해 주가 변동성이 폭발적으로 확대되는 현상',
        color: 'text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10'
    },
    'WHALE_IN': {
        label: 'WHALE.IN',
        desc: '고래 유입: 500만 달러 이상의 대규모 매수 자금이 포착됨 (스마트머니 진입)',
        color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    },
    'WALL_BREAK': {
        label: 'WALL.BRK',
        desc: '저항 돌파: 콜 옵션 매도벽(Call Wall)을 강한 거래량으로 뚫어내는 강력한 상승 신호',
        color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'
    },

    // 2. Warning/Bearish (Red/Orange)
    'SELL_DOM': {
        label: 'SELL.DOM',
        desc: '매도 우위: 500만 달러 이상의 대규모 매도세가 우세함',
        color: 'text-rose-400 border-rose-500/30 bg-rose-500/10'
    },
    'ACCEL_DROP': {
        label: 'ACCEL.DROP',
        desc: '가속 하락: 풋 옵션 매수 급증과 숏 감마가 결합되어 하락 속도가 빨라짐',
        color: 'text-orange-400 border-orange-500/30 bg-orange-500/10'
    },
    'SUPPRESSED': {
        label: 'SUPPRESSED',
        desc: '상방 억제: 상승 하려는 힘은 있으나 과도한 콜 옵션 매도로 인해 상승폭이 제한됨',
        color: 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    },

    // 3. Neutral/Technical (Blue/Slate)
    'GEX_SAFE': {
        label: 'GEX.SAFE',
        desc: '안전 지대: 롱 감마(Long Gamma) 구간으로 진입하여 주가 변동성이 줄어들고 지지력이 강해짐',
        color: 'text-sky-400 border-sky-500/30 bg-sky-500/10'
    },
    'CORRECTION': {
        label: 'CORRECTION',
        desc: '건전 조정: 상승 추세 중 일시적인 매물 소화 과정 (지지력 확인 시 재매수 기회)',
        color: 'text-slate-300 border-slate-500/30 bg-slate-500/10'
    },
    'WALL_TEST': {
        label: 'WALL.TEST',
        desc: '저항 테스트: 현재 주가가 주요 저항벽(Call Wall) 근처에 도달하여 돌파 시도 중',
        color: 'text-violet-400 border-violet-500/30 bg-violet-500/10'
    }
};
