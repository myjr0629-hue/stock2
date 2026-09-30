package com.signumhq.app.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/**
 * «내 종목» 위젯 공급자 — 작게(2×2)·중간(4×2)·크게(4×4) 세 항목이 이 한 클래스의 동작을 나눠 쓴다
 * (위젯 고르기 화면에 크기별로 보이게 셋을 등록한다 · 실제 모양은 늘리고 줄인 크기를 따른다).
 * 네트워크는 여기서 하지 않는다 — 곧바로 저장된 값으로 그리고, 새 값은 WorkManager 작업이 받는다.
 */
public abstract class WatchlistWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        final Class<?> cls = getClass();
        WidgetUpdater.IO.execute(() -> {
            try {
                WidgetUpdater.render(app, cls, ids);
                WidgetUpdater.schedulePeriodic(app);
                WidgetUpdater.refreshSoon(app);
            } finally {
                pending.finish();
            }
        });
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle newOptions) {
        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        final Class<?> cls = getClass();
        WidgetUpdater.IO.execute(() -> {
            try {
                WidgetUpdater.render(app, cls, new int[]{id});
            } finally {
                pending.finish();
            }
        });
    }

    @Override
    public void onEnabled(Context context) {
        WidgetUpdater.schedulePeriodic(context.getApplicationContext());
    }

    @Override
    public void onDisabled(Context context) {
        // 이 종류의 마지막 위젯이 빠졌다 — 다른 크기도 하나도 없을 때만 주기 작업을 멈춘다
        if (!WidgetUpdater.hasWidgets(context.getApplicationContext())) WidgetUpdater.cancelPeriodic(context.getApplicationContext());
    }
}
