package com.signumhq.app.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.List;
import java.util.Locale;

/**
 * «내 종목» 위젯 — 로고: 앱이 그리는 그대로(AppTickerLogo).
 *   ① 앱(웹뷰)이 브리지로 넘긴 PNG(원형·테두리까지 그린 최종 모습)
 *   ② 없으면 /api/logo/T?v=3 → 불투명 정사각 아이콘은 원을 꽉 채움(cover), 투명·가로형 마크는 밝은 칩 위 12% 여백(contain)
 *      SVG(AMZN 큐레이션·이니셜 폴백)는 비트맵으로 못 그린다 → 하루 동안 다시 묻지 않고 ③
 *   ③ 이니셜 칩 — 서버 폴백(initialChipSvg)과 같은 색(hashHue)·같은 글자 크기
 */
final class WidgetLogos {
    static final int PX = 96;
    private WidgetLogos() {}

    static Bitmap load(Context c, String ticker) {
        File f = WidgetStore.logoFile(c, ticker);
        if (f == null || !f.exists()) return null;
        try { return BitmapFactory.decodeFile(f.getAbsolutePath()); } catch (Throwable t) { return null; }
    }

    /** 없는 로고만 받는다(순서대로 · 종목당 제한 시간). 받은 것이 있으면 true */
    static boolean ensure(Context c, List<String> tickers) {
        boolean any = false;
        long now = System.currentTimeMillis();
        for (String t : tickers) {
            File f = WidgetStore.logoFile(c, t);
            if (f == null || f.exists()) continue;
            long miss = WidgetStore.logoMissAt(c, t);
            if (miss > 0 && now - miss < 24 * 3_600_000L) continue;
            any |= fetchOne(c, t);
        }
        return any;
    }

    private static boolean fetchOne(Context c, String t) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(WidgetData.BASE + "/api/logo/" + URLEncoder.encode(t, "UTF-8") + "?v=3");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestProperty("Accept", "image/png,image/jpeg,image/*;q=0.8");
            int code = conn.getResponseCode();
            String type = conn.getContentType() == null ? "" : conn.getContentType().toLowerCase(Locale.ROOT);
            if (code != 200 || type.contains("svg")) { WidgetStore.noteLogoMiss(c, t, true); return false; }
            byte[] data = WidgetData.readAll(conn.getInputStream(), 1_000_000);
            Bitmap raw = BitmapFactory.decodeByteArray(data, 0, data.length);
            if (raw == null || raw.getWidth() < 8) { WidgetStore.noteLogoMiss(c, t, true); return false; }
            Bitmap chip = chip(raw, PX);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            chip.compress(Bitmap.CompressFormat.PNG, 100, bo);
            boolean ok = WidgetStore.writeBytes(WidgetStore.logoFile(c, t), bo.toByteArray());
            if (ok) WidgetStore.noteLogoMiss(c, t, false);
            return ok;
        } catch (Exception e) {
            return false;   // 네트워크 실패는 «없음»으로 굳히지 않는다
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** AppTickerLogo.decideFit — 거의 정사각이고 네 모서리가 불투명하면 앱 아이콘(꽉 채움) */
    static boolean isOpaqueSquare(Bitmap b) {
        double ar = (double) b.getWidth() / Math.max(1, b.getHeight());
        if (ar < 0.82 || ar > 1.22) return false;
        Bitmap s = Bitmap.createScaledBitmap(b, 12, 12, true);
        int[] idx = {0, 11};
        for (int x : idx) for (int y : idx) if (Color.alpha(s.getPixel(x, y)) <= 245) return false;
        return true;
    }

    /** 원형 칩(테두리 포함) — 앱 로고와 같은 모습 */
    static Bitmap chip(Bitmap img, int size) {
        boolean cover = isOpaqueSquare(img);
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        Path circle = new Path();
        circle.addCircle(size / 2f, size / 2f, size / 2f, Path.Direction.CW);
        cv.save();
        cv.clipPath(circle);
        if (cover) {
            cv.drawBitmap(img, new Rect(0, 0, img.getWidth(), img.getHeight()), new RectF(0, 0, size, size), p);
        } else {
            Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
            bg.setShader(new RadialGradient(size * 0.35f, size * 0.25f, size,
                    Color.argb(247, 255, 255, 255), Color.argb(235, 224, 231, 240), Shader.TileMode.CLAMP));
            cv.drawRect(0, 0, size, size, bg);
            float pad = Math.max(2, Math.round(size * 0.12f));
            float box = size - pad * 2;
            float s = Math.min(box / img.getWidth(), box / img.getHeight());
            float dw = img.getWidth() * s, dh = img.getHeight() * s;
            cv.drawBitmap(img, new Rect(0, 0, img.getWidth(), img.getHeight()),
                    new RectF((size - dw) / 2f, (size - dh) / 2f, (size + dw) / 2f, (size + dh) / 2f), p);
        }
        cv.restore();
        ring(cv, size, cover ? 26 : 41);
        return out;
    }

    private static void ring(Canvas cv, int size, int alpha) {
        Paint st = new Paint(Paint.ANTI_ALIAS_FLAG);
        st.setStyle(Paint.Style.STROKE);
        float lw = size / 22f;
        st.setStrokeWidth(lw);
        st.setColor(Color.argb(alpha, 255, 255, 255));
        cv.drawCircle(size / 2f, size / 2f, size / 2f - lw / 2f, st);
    }

    // ── 이니셜 칩(서버 initialChipSvg 와 같은 색) ─────────────────────────

    static int hue(String symbol) {
        long h = 0;
        for (int i = 0; i < symbol.length(); i++) h = (h * 31 + symbol.charAt(i)) & 0xffffffffL;
        return (int) (h % 360);
    }

    static String symbolOf(String ticker) {
        return ticker.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    static Bitmap initialChip(String ticker, int size) {
        String sym = symbolOf(ticker);
        String label = sym.length() > 4 ? sym.substring(0, 4) : sym;
        int hue = hue(sym);
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setShader(new RadialGradient(size * 0.35f, size * 0.25f, size,
                Color.argb(247, 255, 255, 255), Color.argb(235, 224, 231, 240), Shader.TileMode.CLAMP));
        cv.drawCircle(size / 2f, size / 2f, size / 2f, bg);
        float pad = Math.max(2, Math.round(size * 0.12f));
        float inner = size - pad * 2;
        Paint sq = new Paint(Paint.ANTI_ALIAS_FLAG);
        sq.setShader(new LinearGradient(pad, pad, pad + inner, pad + inner,
                Color.HSVToColor(hslToHsv(hue, 0.60f, 0.44f)), Color.HSVToColor(hslToHsv((hue + 26) % 360, 0.58f, 0.26f)),
                Shader.TileMode.CLAMP));
        cv.drawRoundRect(new RectF(pad, pad, pad + inner, pad + inner), inner * 0.24f, inner * 0.24f, sq);
        int fs = label.length() >= 4 ? 25 : label.length() == 3 ? 30 : label.length() == 2 ? 36 : 42;
        Paint tx = new Paint(Paint.ANTI_ALIAS_FLAG);
        tx.setColor(Color.WHITE);
        tx.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        tx.setTextAlign(Paint.Align.CENTER);
        tx.setTextSize(inner * fs / 100f);
        tx.setLetterSpacing(-0.01f);
        Paint.FontMetrics fm = tx.getFontMetrics();
        float cy = pad + inner / 2f - (fm.ascent + fm.descent) / 2f;
        cv.drawText(label, size / 2f, cy, tx);
        ring(cv, size, 41);
        return out;
    }

    private static float[] hslToHsv(float h, float s, float l) {
        float v = l + s * Math.min(l, 1 - l);
        float sv = v == 0 ? 0 : 2 * (1 - l / v);
        return new float[]{h, sv, v};
    }
}
