/* 기존 snapshot.live의 광고·앱 AI 비용 계약만 표시한다. 수집 요청은 하지 않는다. */
(function (root) {
    'use strict';
    root.HUDCosts = function (s, ui) {
        const { obj, arr, esc, num, time, source, card, pending } = ui;
        const live = obj(s.live), ads = obj(live.ads), ai = obj(live.aiCredit);
        const google = obj(live.google), g = obj(google.read), gm = obj(google.meta);
        const googleBody = '<div class="table-scroll"><table class="table"><thead><tr><th>집계일 · 뉴욕</th><th>지출 · 원</th><th>설치</th><th>설치당 비용 · 원</th></tr></thead><tbody><tr><td>' + esc(g.day || '판독 대기') + '</td>' + ['spendKrw', 'installs', 'cpiKrw'].map(k => '<td>' + num(g[k]) + '</td>').join('') + '</tr></tbody></table></div>' +
            '<div class="chart-note">' + esc(gm.country || '일본') + ' · ' + esc(gm.platform || '안드로이드') + ' · 구글 귀속 설치 · 일일 예산 ' + num(gm.budgetKrwPerDay) + '원</div>';
        const names = { SG: '싱가포르', HK: '홍콩', TW: '대만', JP: '일본', KR: '한국', US: '미국' };
        const periods = [['yesterday', '어제'], ['today', '오늘 · 부분'], ['week', '최근 7일']];
        const blocks = periods.map(([key, label]) => {
            const p = ads[key]; if (!p) return '<h3>' + label + '</h3>' + pending();
            const rows = arr(p.countries).map(r => ({ ...r, country: names[r.code] || r.code }));
            rows.push({ ...obj(p.total), country: '합계 · 콘솔 합계 줄' });
            return '<h3>' + label + ' · 뉴욕 ' + esc(p.nyDate || [p.nyFrom, p.nyTo].filter(Boolean).join('~')) + '</h3>' +
                '<div class="table-scroll"><table class="table"><thead><tr><th>나라</th><th>지출 · 달러</th><th>노출</th><th>클릭</th><th>설치</th><th>설치당 비용 · 달러</th><th>상태</th></tr></thead><tbody>' +
                rows.map(r => '<tr><td>' + esc(r.country) + '</td>' + ['spend', 'impr', 'taps', 'installs', 'cpa'].map(k => '<td>' + num(r[k]) + '</td>').join('') + '<td>' + esc(r.state || '판독 대기') + '</td></tr>').join('') + '</tbody></table></div>' +
                source(p.file || '애플 광고 판독', p.readAt, p.totalMatches === false ? '캠페인 행 합과 콘솔 합계가 다름 · 콘솔 합계 사용' : key === 'yesterday' && !p.complete ? '완결 전 · 미반영 가능 시간 ' + num(p.missingH) : key === 'today' ? '최근 약 3시간 미반영 가능' : '오늘 제외');
        }).join('');
        const session = obj(ads.session), warning = session.streak > 0 ? '<div class="notice">광고 판독 연속 실패 ' + num(session.streak) + '회 · 마지막 정상값 표시 · 마지막 실패 ' + esc(time(session.lastFailAt)) + '</div>' : '';
        const labels = { spentUsd: '누적 지출', targetUsd: '목표', capUsd: '상한', todayTargetUsd: '오늘 목표 속도', last24hUsd: '최근 24시간', projectedEndUsd: '기간 말 예상 지출', projectedUsedPct: '예상 사용 비율', level: '단계', ratio: '속도 비율', daysLeft: '남은 일수' };
        const aiBody = Object.keys(ai).length ? '<div class="stat-list">' + Object.entries(labels).map(([key, label]) => '<div class="stat-line"><span>' + label + (key.endsWith('Usd') ? ' · 달러' : '') + '</span><strong>' + num(ai[key]) + '</strong></div>').join('') + '<div class="stat-line"><span>모드</span><strong>' + esc(({ bootstrap: '초기 가동', measuring: '속도 측정 중', 'on-pace': '목표 속도 유지', raising: '신선도 단계 올림', lowering: '신선도 단계 내림', endgame: '기간 말 속도 조절', landing: '남은 예산 보호 · 증가분 정지', done: '목표 도달 · 증가분 정지', 'credit-off': '크레딧 불가 · 증가분 정지', normal: '정상', boost: '확대', conserve: '절약', pause: '일시정지', paused: '일시정지', off: '꺼짐', auto: '자동' })[ai.mode] || '판독 대기') + '</strong></div></div><div class="chart-note">다음 갱신 · ' + esc(time(ai.renewsAt)) + '</div>' : pending();
        return card('광고 지출 상세', warning + blocks, source('기존 광고 판독 원천', ads.readAt)) + card('구글 광고 지출 상세', googleBody, source('구글 광고 판독 원천', g.at, google.state !== 'ok' ? '판독 대기' : g.ageMs > 216e5 ? '판독 지연 · 마지막 판독값' : null)) + card('앱 인공지능 비용', aiBody, source(ai.file || '앱 인공지능 비용 판독', ai.at));
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
