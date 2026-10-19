/** Keep the existing sections visible when no actual EOD contracts can be shown. */
export function OptionsEodNotice({ title, data, locale }: { title: string; data: any; locale: string }) {
  const text = (ko: string, en: string, ja: string) => locale === 'ko' ? ko : locale === 'ja' ? ja : en;
  const reason = data?.reason;
  const message = reason === 'ticker-not-in-universe' && data.collectionStatus === 'not-targeted'
    ? text('옵션 EOD 수집 대상 아님', 'Outside the options EOD collection universe', 'オプションEOD収集対象外')
    : reason === 'ticker-not-collected'
      ? text('수집 대상 · 옵션 EOD 미적재', 'Collection target · options EOD not loaded', '収集対象・オプションEOD未取得')
      : reason === 'collection-status-unknown' || reason === 'ticker-not-in-universe'
        ? text('옵션 EOD 미적재 · 수집 대상 여부 미확인', 'Options EOD not loaded · collection status unconfirmed', 'オプションEOD未取得・収集対象未確認')
        : data?.available
          ? text('기록된 옵션 계약 없음', 'No recorded option contracts', '記録されたオプション契約なし')
          : text('옵션 EOD 조회 실패 · 보관된 실제 값 확인 불가', 'Options EOD unavailable · stored observation unconfirmed', 'オプションEOD取得失敗・保存された実測値を確認不可');
  return <div className="premium-card" style={{ padding: '16px 15px' }}>
    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 10 }}>{title}</div>
    <div style={{ fontSize: 12, color: 'var(--app-lbl-anchor)' }}>{message}</div>
    {data?.date && <div style={{ fontSize: 10, marginTop: 6, color: 'var(--app-lbl-aux)' }}>
      {data.available ? data.date : text('묶음 기준일', 'Bundle date', 'バンドル基準日') + ' ' + data.date}
    </div>}
  </div>;
}
