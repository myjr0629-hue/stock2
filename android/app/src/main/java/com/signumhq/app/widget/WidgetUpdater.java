package com.signumhq.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** 위젯 다시 그리기·갱신 예약 — 공급자·플러그인·작업이 함께 쓴다 */
final class WidgetUpdater {
    static final String PERIODIC = "signum-widget-periodic";
    static final String ONESHOT = "signum-widget-refresh";
    static final Class<?>[] PROVIDERS = {WatchlistWidgetSmall.class, WatchlistWidgetMedium.class, WatchlistWidgetLarge.class};
    static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private WidgetUpdater() {}

    static int[] idsOf(Context c, Class<?> cls) {
        try {
            return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, cls));
        } catch (Exception e) {
            return new int[0];
        }
    }

    static boolean hasWidgets(Context c) {
        for (Class<?> cls : PROVIDERS) if (idsOf(c, cls).length > 0) return true;
        return false;
    }

    /** 포지셔닝 바를 그리는 위젯(중간·크게 — 실제 크기 기준)이 하나라도 있나 */
    static boolean needsLevels(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> cls : PROVIDERS) {
            int mode = WidgetRenderer.modeOf(cls);
            for (int id : idsOf(c, cls)) {
                if (WidgetRenderer.sizeDp(m, id, mode)[0] >= 220) return true;
            }
        }
        return false;
    }

    /** 저장된 목록·마지막 가격으로 곧바로 그린다(네트워크 없음) */
    static void render(Context c, Class<?> cls, int[] ids) {
        if (ids == null || ids.length == 0) return;
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        WidgetStore.Snapshot snap = WidgetStore.read(c);
        Map<String, WidgetData.Quote> quotes = WidgetData.loadCache(c);
        long now = System.currentTimeMillis();
        int mode = WidgetRenderer.modeOf(cls);
        for (int id : ids) {
            try {
                RemoteViews v = WidgetRenderer.build(c, WidgetRenderer.sizeDp(m, id, mode), mode, snap, quotes, now);
                m.updateAppWidget(id, v);
            } catch (Exception ignored) { /* 한 위젯의 실패가 나머지를 막지 않게 */ }
        }
    }

    static void renderAll(Context c) {
        for (Class<?> cls : PROVIDERS) render(c, cls, idsOf(c, cls));
    }

    static void renderAllAsync(Context c) {
        final Context app = c.getApplicationContext();
        IO.execute(() -> renderAll(app));
    }

    private static Constraints network() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    /** 30분마다(네트워크 있을 때) — 이미 있으면 그대로 둔다 */
    static void schedulePeriodic(Context c) {
        try {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(WidgetRefreshWorker.class, 30, TimeUnit.MINUTES)
                    .setConstraints(network())
                    .build();
            WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req);
        } catch (Exception ignored) { }
    }

    static void cancelPeriodic(Context c) {
        try { WorkManager.getInstance(c).cancelUniqueWork(PERIODIC); } catch (Exception ignored) { }
    }

    /** 곧 한 번(목록이 바뀜·위젯 추가) — 앞선 예약은 바꿔 끼운다 */
    static void refreshSoon(Context c) {
        try {
            OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
                    .setConstraints(network())
                    .build();
            WorkManager.getInstance(c).enqueueUniqueWork(ONESHOT, ExistingWorkPolicy.REPLACE, req);
        } catch (Exception ignored) { }
    }
}
