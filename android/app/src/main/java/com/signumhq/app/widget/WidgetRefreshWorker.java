package com.signumhq.app.widget;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.List;
import java.util.Map;

/**
 * 위젯 새 값 받기 — 앞 8종목(가장 큰 위젯이 그릴 수 있는 최대 행 수)의 가격(앱 공용 시세)·레벨(묶음 요청)을 받고, 없는 로고를 채운 뒤 전부 다시 그린다.
 * 실패해도 성공으로 끝낸다(다음 주기·다음 목록 변경에 다시) — 재시도 폭주를 만들지 않는다.
 */
public class WidgetRefreshWorker extends Worker {
    static final int MAX_ROWS = 8;

    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (!WidgetUpdater.hasWidgets(c)) return Result.success();
        WidgetStore.Snapshot snap = WidgetStore.read(c);
        if (snap.synced() && !snap.tickers.isEmpty()) {
            List<String> want = snap.tickers.subList(0, Math.min(MAX_ROWS, snap.tickers.size()));
            // 가격 = 앱 공용 시세 · 레벨(바) = 기존 묶음 요청 — 바를 그리는 크기가 있을 때만
            Map<String, WidgetData.Quote> live = WidgetData.fetchLive(want, 10_000);
            Map<String, WidgetData.Quote> batch = null;
            boolean needBatch = WidgetUpdater.needsLevels(c) || live == null;
            if (!needBatch) for (String t : want) {
                WidgetData.Quote q = live.get(t);
                if (q == null || q.changePct == null) { needBatch = true; break; }   // 프리마켓 등락 null → 묶음 값으로
            }
            if (needBatch) batch = WidgetData.fetch(want, 12_000);
            if (live != null || batch != null) WidgetData.saveCache(c, WidgetData.merge(live, batch, want), snap.tickers);
            WidgetLogos.ensure(c, want);
        }
        WidgetUpdater.renderAll(c);
        return Result.success();
    }
}
