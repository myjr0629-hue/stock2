import { inRegularSession } from '@/lib/signals/calendar';

/** 현물 라벨만 표시한다. 등락값과 다른 칸의 세션·데이터에는 관여하지 않는다. */
export function CashMarketStatusLabel({
  label,
  className,
  badgeClassName,
  nowMs = Date.now(),
}: {
  label: string;
  className: string;
  badgeClassName: string;
  nowMs?: number;
}) {
  // marketCalendar 기반 공용 판정: 휴장·주말·조기 폐장 포함.
  // 대시보드의 기존 30초 시계 갱신 때 함께 다시 판정한다.
  return (
    <div className={className}>
      {label}{!inRegularSession(nowMs) && <> <span className={badgeClassName}>CLOSE</span></>}
    </div>
  );
}
