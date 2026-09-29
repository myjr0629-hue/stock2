package com.signumhq.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import com.signumhq.app.MainActivity;
import com.signumhq.app.R;

import java.util.List;
import java.util.Map;

/**
 * «내 종목» 위젯 그리기 — 대시보드 «내 종목» 카드(dSurf)와 같은 남색·금색 하트. 새 색·새 모양 없음.
 * 크기에 따라 세 모양(작게 2×2 · 중간 4×2 · 크게 4×4)을 고르고, 행 수는 실제 높이에 맞춘다.
 * 포지셔닝 바(풋 플로어 ─ ◆맥스 페인 ─ ●가격 ─ 콜 월)는 비트맵으로 그린다(RemoteViews 는 자유 배치가 안 된다).
 */
final class WidgetRenderer {
    static final int SMALL = 0, MEDIUM = 1, LARGE = 2;
    static final int UP = 0xFF34D399, DOWN = 0xFFF87171, FLAT = 0xFF94A3B8;
    private WidgetRenderer() {}

    static int modeOf(Class<?> provider) {
        if (provider == WatchlistWidgetSmall.class) return SMALL;
        if (provider == WatchlistWidgetLarge.class) return LARGE;
        return MEDIUM;
    }

    /** 세로 화면 기준 크기(dp) — 옵션이 없으면 위젯 종류의 기본 크기 */
    static int[] sizeDp(AppWidgetManager m, int id, int mode) {
        Bundle o = m.getAppWidgetOptions(id);
        int w = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (w <= 0) w = mode == SMALL ? 150 : 320;
        if (h <= 0) h = mode == LARGE ? 330 : 160;
        return new int[]{w, h};
    }

    static PendingIntent open(Context c, String url) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse(url))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(c, url.hashCode(), i, flags);
    }

    static final String WATCHLIST_URL = "signumhq-app://watchlist";

    static String tickerUrl(String t) { return "signumhq-app://ticker/" + t; }

    static RemoteViews build(Context c, int[] sizeDp, int requestedMode, WidgetStore.Snapshot snap,
                             Map<String, WidgetData.Quote> quotes, long now) {
        int wDp = sizeDp[0], hDp = sizeDp[1];
        // 실제 크기가 모양을 이긴다(사용자가 늘리거나 줄였다)
        int mode = wDp < 220 ? SMALL : hDp < 230 ? MEDIUM : LARGE;
        String loc = WidgetData.resolveLocale(snap.locale);
        WidgetData.Text tx = WidgetData.text(loc);
        WidgetData.MarketCalendar cal = new WidgetData.MarketCalendar(snap.holidays, snap.earlyCloses);

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_root);
        float d = c.getResources().getDisplayMetrics().density;
        int padH = Math.round((mode == SMALL ? 13 : mode == LARGE ? 16 : 15) * d);
        int padT = Math.round((mode == LARGE ? 15 : 12) * d);
        int padB = Math.round((mode == SMALL ? 10 : 10) * d);
        v.setViewPadding(R.id.widget_root_content, padH, padT, padH, padB);
        v.setTextViewText(R.id.widget_title, tx.title);
        v.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP, mode == SMALL ? 13.5f : 14f);
        v.setOnClickPendingIntent(R.id.widget_root_content, open(c, WATCHLIST_URL));
        v.setOnClickPendingIntent(R.id.widget_header, open(c, WATCHLIST_URL));
        v.removeAllViews(R.id.widget_rows);

        if (!snap.synced() || snap.tickers.isEmpty()) {
            v.setViewVisibility(R.id.widget_rows, View.GONE);
            v.setViewVisibility(R.id.widget_basis, View.GONE);
            v.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            v.setTextViewText(R.id.widget_empty_text, snap.synced() ? tx.empty : tx.notSynced);
            v.setTextViewText(R.id.widget_open, tx.openApp);
            return v;
        }
        v.setViewVisibility(R.id.widget_empty, View.GONE);
        v.setViewVisibility(R.id.widget_rows, View.VISIBLE);

        int headerDp = 22, rowDp = mode == SMALL ? 34 : mode == LARGE ? 48 : 40;
        int availDp = hDp - Math.round((padT + padB) / d) - headerDp - 6;
        int cap = mode == LARGE ? 6 : 3;
        int fit = Math.max(1, Math.min(cap, (availDp + 1) / (rowDp + 1)));
        List<String> tickers = snap.tickers.subList(0, Math.min(fit, snap.tickers.size()));

        // 머리 오른쪽 기준(작은 모양은 자리가 없어 뺀다) — «가장 최근에 받은 행»의 세션 · 그 시각
        WidgetData.Quote freshest = null;
        for (String t : tickers) {
            WidgetData.Quote q = quotes.get(t);
            if (q != null && q.session != null && q.receivedAt > 0 && (freshest == null || q.receivedAt > freshest.receivedAt)) freshest = q;
        }
        if (mode != SMALL && freshest != null) {
            v.setViewVisibility(R.id.widget_basis, View.VISIBLE);
            v.setTextViewText(R.id.widget_basis, WidgetData.basis(freshest.session, freshest.receivedAt, cal, loc));
        } else {
            v.setViewVisibility(R.id.widget_basis, View.GONE);
        }

        long staleLimit = cal.isRegularOpen(now) ? 30 * 60_000L : 3 * 3_600_000L;
        int rowLayout = mode == SMALL ? R.layout.widget_row_small : mode == LARGE ? R.layout.widget_row_large : R.layout.widget_row_medium;
        // 바 폭(dp) = 위젯 폭 − 여백 − 로고 − 이름 칸 − 가격 칸 − 사이 간격(레이아웃과 같은 값)
        int barWDp = mode == LARGE ? wDp - 2 * 16 - 24 - 86 - 66 - 9 * 3 : wDp - 2 * 15 - 22 - 76 - 66 - 8 * 3;
        int barHDp = mode == LARGE ? 26 : 14;

        for (int i = 0; i < tickers.size(); i++) {
            String t = tickers.get(i);
            WidgetData.Quote q = quotes.get(t);
            boolean dim = q != null && q.receivedAt > 0 && now - q.receivedAt > staleLimit;
            int a = dim ? 0x80 : 0xFF;
            if (i > 0) v.addView(R.id.widget_rows, new RemoteViews(c.getPackageName(), R.layout.widget_row_separator));
            RemoteViews r = new RemoteViews(c.getPackageName(), rowLayout);
            Bitmap logo = WidgetLogos.load(c, t);
            if (logo == null) logo = WidgetLogos.initialChip(t, 72);
            r.setImageViewBitmap(R.id.row_logo, logo);
            r.setInt(R.id.row_logo, "setImageAlpha", a);
            r.setTextViewText(R.id.row_ticker, t);
            r.setTextColor(R.id.row_ticker, withAlpha(0xFFF8FAFC, a));
            Double px = q == null ? null : q.price;
            Double ch = q == null ? null : q.changePct;
            String priceText = WidgetData.price(px);
            r.setTextViewText(R.id.row_price, priceText);
            if (mode != SMALL && priceText.length() >= 10) {
                // $12,345.67 처럼 긴 값은 칸(66dp) 안에 들게 한 단계 작게
                r.setTextViewTextSize(R.id.row_price, TypedValue.COMPLEX_UNIT_SP, priceText.length() >= 11 ? 10f : 11f);
            }
            r.setTextColor(R.id.row_price, withAlpha(mode == SMALL ? 0xFF9FB0C8 : 0xFFDBE5F1, a));
            String pct = WidgetData.pct(ch);
            r.setTextViewText(R.id.row_pct, pct.isEmpty() && mode == SMALL && px == null ? "—" : pct);
            int dir = WidgetData.direction(ch);
            r.setTextColor(R.id.row_pct, withAlpha(dir > 0 ? UP : dir < 0 ? DOWN : FLAT, a));
            String name = snap.names.get(t);
            if (mode != SMALL) {
                r.setTextViewText(R.id.row_name, name == null ? "" : name);
                r.setViewVisibility(R.id.row_name, name == null || name.isEmpty() ? View.GONE : View.VISIBLE);
                r.setTextColor(R.id.row_name, withAlpha(0xFF8EA3C2, a));
                WidgetData.MapGeometry g = WidgetData.geometry(q, now, cal);
                if (g != null && barWDp > 30) {
                    r.setImageViewBitmap(R.id.row_bar, bar(c, g, barWDp, barHDp, mode == LARGE));
                    r.setInt(R.id.row_bar, "setImageAlpha", a);
                    r.setViewVisibility(R.id.row_bar, View.VISIBLE);
                } else {
                    r.setViewVisibility(R.id.row_bar, View.INVISIBLE);   // 자리는 지킨다(행마다 칸이 맞게)
                }
            }
            StringBuilder desc = new StringBuilder(t);
            if (name != null && !name.isEmpty()) desc.append(' ').append(name);
            if (px != null) desc.append(", ").append(WidgetData.price(px));
            if (!pct.isEmpty()) desc.append(", ").append(pct);
            r.setContentDescription(R.id.row_root, desc.toString());
            if (mode != SMALL) r.setOnClickPendingIntent(R.id.row_root, open(c, tickerUrl(t)));
            v.addView(R.id.widget_rows, r);
        }
        return v;
    }

    private static int withAlpha(int argb, int a) { return (argb & 0x00FFFFFF) | (a << 24); }

    /** 포지셔닝 바 — 트랙 · ◆→● 띠(슬레이트, ● 쪽 짙게) · 양 끝 눈금 · ◆ 금색 · ● 시안 · (크게) 양 끝 숫자 */
    static Bitmap bar(Context c, WidgetData.MapGeometry g, int wDp, int hDp, boolean labels) {
        float d = c.getResources().getDisplayMetrics().density;
        int w = Math.max(1, Math.round(wDp * d)), h = Math.max(1, Math.round(hDp * d));
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float inset = 7 * d;                         // ◆·● 가 양 끝에서 잘리지 않게
        float x0 = inset, x1 = w - inset, span = x1 - x0;
        float trackY = labels ? 4 * d : h / 2f - 2 * d;
        float cy = trackY + 2 * d;
        // 트랙
        p.setColor(Color.argb(43, 148, 163, 184));
        cv.drawRoundRect(new RectF(x0, trackY, x1, trackY + 4 * d), 2 * d, 2 * d, p);
        float pxX = x0 + (float) g.px * span, mpX = x0 + (float) g.mp * span;
        // 띠
        float l = Math.min(pxX, mpX), r = Math.max(pxX, mpX);
        if (r - l > 0.5f) {
            int dark = Color.argb(128, 148, 163, 184), light = Color.argb(31, 148, 163, 184);
            Paint band = new Paint(Paint.ANTI_ALIAS_FLAG);
            band.setShader(new LinearGradient(pxX, 0, mpX, 0, dark, light, Shader.TileMode.CLAMP));
            cv.drawRect(l, trackY, r, trackY + 4 * d, band);
        }
        // 양 끝 눈금
        p.setShader(null);
        p.setColor(0xFF71859F);
        cv.drawRoundRect(new RectF(x0 - d, trackY - 3 * d, x0 + d, trackY + 7 * d), d, d, p);
        cv.drawRoundRect(new RectF(x1 - d, trackY - 3 * d, x1 + d, trackY + 7 * d), d, d, p);
        // ◆ 맥스 페인
        cv.save();
        cv.rotate(45, mpX, cy);
        p.setColor(0xFF0E1727);
        cv.drawRoundRect(new RectF(mpX - 5 * d, cy - 5 * d, mpX + 5 * d, cy + 5 * d), 2 * d, 2 * d, p);
        Paint gold = new Paint(Paint.ANTI_ALIAS_FLAG);
        gold.setColor(0xFFFBBF24);
        gold.setShadowLayer(3 * d, 0, 0, Color.argb(115, 251, 191, 36));
        cv.drawRoundRect(new RectF(mpX - 3.5f * d, cy - 3.5f * d, mpX + 3.5f * d, cy + 3.5f * d), 1.5f * d, 1.5f * d, gold);
        cv.restore();
        // ● 가격
        p.setColor(0xFF0E1727);
        cv.drawCircle(pxX, cy, 6.5f * d, p);
        Paint cyan = new Paint(Paint.ANTI_ALIAS_FLAG);
        cyan.setColor(0xFF22D3EE);
        cyan.setShadowLayer(4 * d, 0, 0, Color.argb(166, 34, 211, 238));
        cv.drawCircle(pxX, cy, 4.5f * d, cyan);
        if (labels) {
            Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
            tp.setColor(0xFF7489AB);
            tp.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 9, c.getResources().getDisplayMetrics()));
            tp.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
            if (Build.VERSION.SDK_INT >= 21) tp.setFontFeatureSettings("tnum");
            float base = trackY + 9 * d - tp.ascent();
            tp.setTextAlign(Paint.Align.LEFT);
            cv.drawText(WidgetData.level(g.pf), x0 - d, base, tp);
            tp.setTextAlign(Paint.Align.RIGHT);
            cv.drawText(WidgetData.level(g.cw), x1 + d, base, tp);
        }
        return b;
    }
}
