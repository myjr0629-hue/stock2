// [P0 Patch] Grade Labels - GRx Korean Localization
// GRA/GRB/GRC → 신뢰 A/B/C with tooltips

export type GradeLevel = 'GRA' | 'GRB' | 'GRC';

export interface GradeInfo {
    code: GradeLevel;
    label: string;           // "신뢰 A"
    labelShort: string;      // "A"
    tooltip: string;         // Hover text
    tooltipDetail: string;   // Extended description
    color: string;           // Tailwind color class
    bgColor: string;         // Badge background
}

export const GRADE_LABELS: Record<GradeLevel, GradeInfo> = {
    GRA: {
        code: 'GRA',
        label: '신뢰 A',
        labelShort: 'A',
        tooltip: '직접 수집된 확정 데이터',
        tooltipDetail: '공식 API에서 직접 수집된 데이터로, 결정에 반영됩니다.',
        color: 'text-green-400',
        bgColor: 'bg-green-500/20'
    },
    GRB: {
        code: 'GRB',
        label: '신뢰 B',
        labelShort: 'B',
        tooltip: '단일 소스 + 가격 반응',
        tooltipDetail: '단일 데이터 소스 기반이며 가격 반응으로 교차검증됩니다.',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20'
    },
    GRC: {
        code: 'GRC',
        label: '신뢰 C',
        labelShort: 'C',
        tooltip: '불완전 / 결정권 미반영',
        tooltipDetail: '데이터가 불완전하거나 결정 참고용으로만 사용됩니다.',
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/20'
    }
};

// Get grade info from stealth label (A/B/C)
export function getGradeFromLabel(label: 'A' | 'B' | 'C'): GradeInfo {
    const gradeMap: Record<string, GradeLevel> = {
        'A': 'GRA',
        'B': 'GRB',
        'C': 'GRC'
    };
    return GRADE_LABELS[gradeMap[label] || 'GRC'];
}

// Get grade info from code (GRA/GRB/GRC)
export function getGradeFromCode(code: string): GradeInfo {
    return GRADE_LABELS[code as GradeLevel] || GRADE_LABELS.GRC;
}

// Determine grade from evidence completeness
export function calculateGradeFromEvidence(evidence: {
    price?: { complete?: boolean };
    options?: { complete?: boolean; status?: string };
    flow?: { complete?: boolean };
    macro?: { complete?: boolean };
}): GradeInfo {
    const allComplete =
        evidence.price?.complete &&
        evidence.options?.complete &&
        evidence.options?.status !== 'PENDING' &&
        evidence.flow?.complete &&
        evidence.macro?.complete;

    const partialComplete =
        evidence.price?.complete &&
        (evidence.options?.complete || evidence.options?.status === 'NO_OPTIONS') &&
        evidence.macro?.complete;

    if (allComplete) return GRADE_LABELS.GRA;
    if (partialComplete) return GRADE_LABELS.GRB;
    return GRADE_LABELS.GRC;
}
