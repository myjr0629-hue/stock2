package com.signumhq.app.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * «내 종목» 위젯 저장소 — 앱(웹뷰)의 목록을 위젯이 읽을 수 있게 둔다.
 *
 * 웹뷰의 목록은 localStorage(sg-watchlist-v1)에만 있어 위젯이 직접 못 읽는다 → WidgetBridgePlugin 이 여기에 적는다.
 *   SharedPreferences "signum_widget": tickers(JSON 배열 · 앱 순서) · names(JSON) · locale · syncedAt · holidays · earlyCloses
 *   files/widget/logos/TICKER.png : 로고(앱이 그린 그대로 · 없으면 위젯이 받아 만든다)
 *   files/widget/quotes.json      : 마지막으로 잘 받은 가격(네트워크 실패 때 흐리게)
 * 설계서: .agent/product/WIDGET-PLAN-2026-09-29.md
 */
public final class WidgetStore {
    static final String PREFS = "signum_widget";
    static final int MAX_ITEMS = 100;
    private static final Pattern TICKER = Pattern.compile("^[A-Z][A-Z0-9.\\-]{0,9}$");
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private WidgetStore() {}

    public static final class Snapshot {
        public final List<String> tickers;
        public final Map<String, String> names;
        public final String locale;
        public final long syncedAt;
        public final List<String> holidays;
        public final List<String> earlyCloses;

        Snapshot(List<String> tickers, Map<String, String> names, String locale, long syncedAt,
                 List<String> holidays, List<String> earlyCloses) {
            this.tickers = tickers;
            this.names = names;
            this.locale = locale;
            this.syncedAt = syncedAt;
            this.holidays = holidays;
            this.earlyCloses = earlyCloses;
        }

        public boolean synced() { return syncedAt > 0; }
    }

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 웹 normalizeTicker 와 같은 규칙 */
    public static String normalizeTicker(String raw) {
        if (raw == null) return null;
        String t = raw.trim().toUpperCase(java.util.Locale.ROOT);
        return TICKER.matcher(t).matches() ? t : null;
    }

    static boolean isDate(String s) { return s != null && DATE.matcher(s).matches(); }

    public static Snapshot read(Context c) {
        SharedPreferences p = prefs(c);
        return new Snapshot(
                parseList(p.getString("tickers", null), true),
                parseMap(p.getString("names", null)),
                p.getString("locale", null),
                p.getLong("syncedAt", 0L),
                parseList(p.getString("holidays", null), false),
                parseList(p.getString("earlyCloses", null), false));
    }

    /** 목록을 적는다. 바뀐 것이 있으면 true(위젯을 다시 그릴 까닭). */
    public static synchronized boolean writeWatchlist(Context c, List<String> tickers, Map<String, String> names,
                                                     String locale, List<String> holidays, List<String> earlyCloses) {
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        for (String raw : tickers) {
            String t = normalizeTicker(raw);
            if (t != null) seen.add(t);
            if (seen.size() >= MAX_ITEMS) break;
        }
        List<String> list = new ArrayList<>(seen);
        JSONObject nm = new JSONObject();
        for (Map.Entry<String, String> e : names.entrySet()) {
            String t = normalizeTicker(e.getKey());
            String v = e.getValue() == null ? "" : e.getValue().trim();
            if (t == null || !seen.contains(t) || v.isEmpty()) continue;
            try { nm.put(t, v.length() > 40 ? v.substring(0, 40) : v); } catch (Exception ignored) { }
        }
        String loc = ("ko".equals(locale) || "en".equals(locale) || "ja".equals(locale)) ? locale : null;
        JSONArray tl = new JSONArray(list);
        SharedPreferences p = prefs(c);
        boolean changed = !tl.toString().equals(p.getString("tickers", null))
                || !nm.toString().equals(p.getString("names", null))
                || (loc != null && !loc.equals(p.getString("locale", null)))
                || p.getLong("syncedAt", 0L) == 0L;
        SharedPreferences.Editor ed = p.edit()
                .putString("tickers", tl.toString())
                .putString("names", nm.toString())
                .putLong("syncedAt", System.currentTimeMillis());
        if (loc != null) ed.putString("locale", loc);
        List<String> hol = filterDates(holidays);
        List<String> early = filterDates(earlyCloses);
        if (!hol.isEmpty()) ed.putString("holidays", new JSONArray(hol).toString());
        if (!early.isEmpty()) ed.putString("earlyCloses", new JSONArray(early).toString());
        ed.apply();
        return changed;
    }

    private static List<String> filterDates(List<String> in) {
        List<String> out = new ArrayList<>();
        if (in == null) return out;
        for (String s : in) if (isDate(s)) out.add(s);
        return out;
    }

    static List<String> parseList(String json, boolean tickers) {
        List<String> out = new ArrayList<>();
        if (json == null) return out;
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < a.length(); i++) {
                String s = a.optString(i, null);
                if (tickers) s = normalizeTicker(s);
                if (s != null) out.add(s);
            }
        } catch (Exception ignored) { }
        return out;
    }

    static Map<String, String> parseMap(String json) {
        Map<String, String> out = new HashMap<>();
        if (json == null) return out;
        try {
            JSONObject o = new JSONObject(json);
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String k = it.next();
                String v = o.optString(k, "");
                if (!v.isEmpty()) out.put(k, v);
            }
        } catch (Exception ignored) { }
        return out;
    }

    // ── 파일 ──────────────────────────────────────────────────────────

    static File dir(Context c, String sub) {
        File d = new File(new File(c.getApplicationContext().getFilesDir(), "widget"), sub);
        if (!d.exists()) //noinspection ResultOfMethodCallIgnored
            d.mkdirs();
        return d;
    }

    public static File logoFile(Context c, String ticker) {
        String t = normalizeTicker(ticker);
        return t == null ? null : new File(dir(c, "logos"), t + ".png");
    }

    static File quotesFile(Context c) { return new File(dir(c, ""), "quotes.json"); }

    /** 같은 바이트면 false. 원자적으로(임시 파일 → 이름 바꾸기) */
    public static synchronized boolean writeBytes(File f, byte[] data) {
        if (f == null || data == null) return false;
        try {
            if (f.exists() && f.length() == data.length && Arrays.equals(readBytes(f, data.length + 1), data)) return false;
            File tmp = new File(f.getParentFile(), f.getName() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(data); }
            if (!tmp.renameTo(f)) { //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                return false;
            }
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    public static byte[] readBytes(File f, int max) {
        if (f == null || !f.exists() || f.length() > max) return null;
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int off = 0;
            while (off < buf.length) {
                int n = in.read(buf, off, buf.length - off);
                if (n < 0) break;
                off += n;
            }
            return off == buf.length ? buf : null;
        } catch (IOException e) {
            return null;
        }
    }

    // ── 로고를 못 받은 종목(SVG·실패) — 하루 동안 다시 묻지 않는다 ─────────

    static long logoMissAt(Context c, String ticker) {
        try {
            JSONObject o = new JSONObject(prefs(c).getString("logoMiss", "{}"));
            return o.optLong(ticker, 0L);
        } catch (Exception e) {
            return 0L;
        }
    }

    static synchronized void noteLogoMiss(Context c, String ticker, boolean miss) {
        try {
            JSONObject o = new JSONObject(prefs(c).getString("logoMiss", "{}"));
            if (miss) o.put(ticker, System.currentTimeMillis()); else o.remove(ticker);
            if (o.length() > 200) o = new JSONObject();
            prefs(c).edit().putString("logoMiss", o.toString()).apply();
        } catch (Exception ignored) { }
    }
}
