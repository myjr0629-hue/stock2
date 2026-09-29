package com.signumhq.app.widget;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/**
 * «내 종목» 위젯 — 데이터: 공개 API · 레벨 정의 검사 · ET 달력 · 숫자 모양 · 글자.
 * 가격은 앱 공용 시세(/api/live/quotes — 앱 전체가 쓰는 한 줄기), 옵션 레벨만 기존 묶음 요청(/api/watchlist/batch)에서 받는다.
 * 새 서버 경로는 없다(대표 9/30 «즐겨찾기가 별도로 운용할 이유가 없다»).
 * 웹 판정을 그대로 옮겼다(숫자를 지어내지 않는다):
 *   레벨 검사 = watchlistInsights.checkLevels(출처 구조 한 벌 · 정의 · 2거래일 이상 늦으면 숨김)
 *   가격 없음 = parseRealtime(가격 0 이하 → «못 받음», 0.00% 로 그리지 않는다)
 *   숫자 모양 = fmtPrice · fmtSignedPct(2) · fmtLevel · 마이너스 U+2212
 * iOS 판: ios/App/SignumWidget/WidgetData.swift (같은 규칙)
 */
public final class WidgetData {
    static final String BASE = "https://www.signumhq.com";
    private WidgetData() {}

    // ── 값 ────────────────────────────────────────────────────────────

    public static final class Quote {
        public String ticker;
        public Double price, changePct, callWall, putFloor, maxPain, gammaFlip;
        public String session, levelsSource, levelsChainDate;
        public boolean hasLevelsMeta;
        public long receivedAt;

        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("t", ticker);
                putNum(o, "p", price); putNum(o, "c", changePct); putNum(o, "cw", callWall); putNum(o, "pf", putFloor);
                putNum(o, "mp", maxPain); putNum(o, "gf", gammaFlip);
                if (session != null) o.put("s", session);
                if (levelsSource != null) o.put("ls", levelsSource);
                if (levelsChainDate != null) o.put("lc", levelsChainDate);
                o.put("lm", hasLevelsMeta);
                o.put("at", receivedAt);
            } catch (Exception ignored) { }
            return o;
        }

        static Quote fromJson(JSONObject o) {
            Quote q = new Quote();
            q.ticker = o.optString("t", null);
            q.price = optNum(o, "p"); q.changePct = optNum(o, "c"); q.callWall = optNum(o, "cw"); q.putFloor = optNum(o, "pf");
            q.maxPain = optNum(o, "mp"); q.gammaFlip = optNum(o, "gf");
            q.session = o.has("s") ? o.optString("s", null) : null;
            q.levelsSource = o.has("ls") ? o.optString("ls", null) : null;
            q.levelsChainDate = o.has("lc") ? o.optString("lc", null) : null;
            q.hasLevelsMeta = o.optBoolean("lm", false);
            q.receivedAt = o.optLong("at", 0L);
            return q;
        }
    }

    private static void putNum(JSONObject o, String k, Double v) throws Exception { if (v != null) o.put(k, v.doubleValue()); }

    private static Double optNum(JSONObject o, String k) {
        if (!o.has(k) || o.isNull(k)) return null;
        double d = o.optDouble(k, Double.NaN);
        return Double.isNaN(d) || Double.isInfinite(d) ? null : d;
    }

    // ── 공개 API ──────────────────────────────────────────────────────

    static Map<String, Quote> parse(String body, long now) {
        Map<String, Quote> out = new HashMap<>();
        try {
            JSONArray results = new JSONObject(body).optJSONArray("results");
            if (results == null) return out;
            for (int i = 0; i < results.length(); i++) {
                JSONObject r = results.optJSONObject(i);
                if (r == null) continue;
                String t = WidgetStore.normalizeTicker(r.optString("ticker", null));
                JSONObject rt = r.optJSONObject("realtime");
                if (t == null || rt == null) continue;
                Quote q = new Quote();
                q.ticker = t;
                Double px = optNum(rt, "price");
                boolean got = px != null && px > 0;
                q.price = got ? px : null;
                q.changePct = got ? optNum(rt, "changePct") : null;
                q.session = rt.has("session") && !rt.isNull("session") ? rt.optString("session", null) : null;
                q.callWall = optNum(rt, "callWall");
                q.putFloor = optNum(rt, "putFloor");
                q.maxPain = optNum(rt, "maxPain");
                q.gammaFlip = optNum(rt, "gammaFlipLevel");
                q.hasLevelsMeta = rt.has("levelsSource");
                q.levelsSource = rt.isNull("levelsSource") ? null : rt.optString("levelsSource", null);
                q.levelsChainDate = rt.isNull("levelsChainDate") ? null : rt.optString("levelsChainDate", null);
                q.receivedAt = now;
                out.put(t, q);
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** 실패하면 null(부르는 쪽이 마지막 정상값을 흐리게 쓴다) */
    static Map<String, Quote> fetch(List<String> tickers, int timeoutMs) {
        if (tickers.isEmpty()) return new HashMap<>();
        HttpURLConnection conn = null;
        try {
            String q = URLEncoder.encode(android.text.TextUtils.join(",", tickers), "UTF-8");
            URL url = new URL(BASE + "/api/watchlist/batch?mode=price&tickers=" + q);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setRequestProperty("Accept", "application/json");
            conn.setUseCaches(false);
            if (conn.getResponseCode() != 200) return null;
            String body = new String(readAll(conn.getInputStream(), 2_000_000), StandardCharsets.UTF_8);
            Map<String, Quote> rows = parse(body, System.currentTimeMillis());
            return rows.isEmpty() ? null : rows;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * 앱 공용 시세 — 가격·등락·세션. 정규장 밖 price 는 마지막 정규장 종가(앱 화면과 같은 뜻).
     * 프리마켓에 day 바가 비면 changePercent 가 null 로 온다(라우트: «클라이언트는 묶음 값으로 폴백») → null 로 둔다.
     */
    static Map<String, Quote> parseLive(String body, long now) {
        Map<String, Quote> out = new HashMap<>();
        try {
            JSONObject root = new JSONObject(body);
            JSONObject data = root.optJSONObject("data");
            String top = root.isNull("session") ? null : root.optString("session", null);
            if (data == null) return out;
            Iterator<String> it = data.keys();
            while (it.hasNext()) {
                String k = it.next();
                String t = WidgetStore.normalizeTicker(k);
                JSONObject q = data.optJSONObject(k);
                if (t == null || q == null) continue;
                Quote r = new Quote();
                r.ticker = t;
                Double px = optNum(q, "price");
                boolean got = px != null && px > 0;
                r.price = got ? px : null;
                r.changePct = got ? optNum(q, "changePercent") : null;
                String ses = q.has("session") && !q.isNull("session") ? q.optString("session", null) : top;
                r.session = "regular".equals(ses) ? "reg" : ses;
                r.receivedAt = got ? now : 0L;
                out.put(t, r);
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** 실패하면 null */
    static Map<String, Quote> fetchLive(List<String> tickers, int timeoutMs) {
        if (tickers.isEmpty()) return new HashMap<>();
        HttpURLConnection conn = null;
        try {
            String q = URLEncoder.encode(android.text.TextUtils.join(",", tickers), "UTF-8");
            conn = (HttpURLConnection) new URL(BASE + "/api/live/quotes?symbols=" + q).openConnection();
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setRequestProperty("Accept", "application/json");
            conn.setUseCaches(false);
            if (conn.getResponseCode() != 200) return null;
            Map<String, Quote> rows = parseLive(new String(readAll(conn.getInputStream(), 2_000_000), StandardCharsets.UTF_8),
                    System.currentTimeMillis());
            for (Quote r : rows.values()) if (r.price != null) return rows;
            return null;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** 가격·등락은 공용 시세가 이긴다(앱 다른 화면과 같은 숫자) · 레벨은 묶음 값 · 공용 시세가 못 준 칸은 묶음 값 그대로 */
    static Map<String, Quote> merge(Map<String, Quote> live, Map<String, Quote> batch, List<String> tickers) {
        Map<String, Quote> out = new HashMap<>();
        for (String t : tickers) {
            Quote l = live == null ? null : live.get(t);
            Quote b = batch == null ? null : batch.get(t);
            Quote row = b != null ? b : l;
            if (row == null) continue;
            if (l != null && l.price != null && row != l) {
                row.price = l.price;
                row.changePct = l.changePct != null ? l.changePct : b.changePct;
                if (l.session != null) row.session = l.session;
                row.receivedAt = l.receivedAt > 0 ? l.receivedAt : row.receivedAt;
            }
            out.put(t, row);
        }
        return out;
    }

    static byte[] readAll(InputStream in, int max) throws java.io.IOException {
        try (InputStream is = in; ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) {
                bo.write(buf, 0, n);
                if (bo.size() > max) throw new java.io.IOException("too large");
            }
            return bo.toByteArray();
        }
    }

    static Map<String, Quote> loadCache(Context c) {
        Map<String, Quote> out = new HashMap<>();
        byte[] b = WidgetStore.readBytes(WidgetStore.quotesFile(c), 1_000_000);
        if (b == null) return out;
        try {
            JSONObject o = new JSONObject(new String(b, StandardCharsets.UTF_8));
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String k = it.next();
                JSONObject v = o.optJSONObject(k);
                if (v != null) out.put(k, Quote.fromJson(v));
            }
        } catch (Exception ignored) { }
        return out;
    }

    static void saveCache(Context c, Map<String, Quote> rows, List<String> keepTickers) {
        Map<String, Quote> merged = loadCache(c);
        merged.putAll(rows);
        Set<String> keep = new HashSet<>(keepTickers);
        keep.addAll(rows.keySet());
        JSONObject o = new JSONObject();
        for (Map.Entry<String, Quote> e : merged.entrySet()) {
            if (!keep.contains(e.getKey())) continue;
            try { o.put(e.getKey(), e.getValue().toJson()); } catch (Exception ignored) { }
        }
        WidgetStore.writeBytes(WidgetStore.quotesFile(c), o.toString().getBytes(StandardCharsets.UTF_8));
    }

    // ── ET 달력 ────────────────────────────────────────────────────────

    public static final class MarketCalendar {
        static final Set<String> BUILTIN_HOLIDAYS = new HashSet<>(Arrays.asList(
                "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
                "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
                "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
                "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"));
        static final Set<String> BUILTIN_EARLY = new HashSet<>(Arrays.asList("2026-11-27", "2026-12-24", "2027-11-26"));
        static final TimeZone ET = TimeZone.getTimeZone("America/New_York");
        static final TimeZone UTC = TimeZone.getTimeZone("UTC");

        final Set<String> holidays;
        final Set<String> early;

        MarketCalendar(List<String> holidays, List<String> early) {
            this.holidays = holidays == null || holidays.isEmpty() ? BUILTIN_HOLIDAYS : new HashSet<>(holidays);
            this.early = early == null || early.isEmpty() ? BUILTIN_EARLY : new HashSet<>(early);
        }

        String etDate(long ms) {
            Calendar c = Calendar.getInstance(ET, Locale.US);
            c.setTimeInMillis(ms);
            return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
        }

        int etMinutes(long ms) {
            Calendar c = Calendar.getInstance(ET, Locale.US);
            c.setTimeInMillis(ms);
            return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        }

        private Calendar utcOf(String d) {
            String[] p = d.split("-");
            Calendar c = Calendar.getInstance(UTC, Locale.US);
            c.clear();
            c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
            return c;
        }

        /** 0=일 … 6=토 */
        int weekday(String d) {
            try { return utcOf(d).get(Calendar.DAY_OF_WEEK) - 1; } catch (Exception e) { return 1; }
        }

        String shift(String d, int delta) {
            try {
                Calendar c = utcOf(d);
                c.add(Calendar.DAY_OF_MONTH, delta);
                return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
            } catch (Exception e) {
                return d;
            }
        }

        boolean isTradingDay(String d) {
            int w = weekday(d);
            return w != 0 && w != 6 && !holidays.contains(d);
        }

        int closeMinutes(String d) { return early.contains(d) ? 13 * 60 : 16 * 60; }

        String prevTradingDay(String d) {
            String x = shift(d, -1);
            for (int i = 0; i < 12 && !isTradingDay(x); i++) x = shift(x, -1);
            return x;
        }

        String nextTradingDay(String d) {
            String x = shift(d, 1);
            for (int i = 0; i < 12 && !isTradingDay(x); i++) x = shift(x, 1);
            return x;
        }

        String lastCompletedSession(long ms) {
            String d = etDate(ms);
            if (isTradingDay(d) && etMinutes(ms) >= closeMinutes(d)) return d;
            return prevTradingDay(d);
        }

        String expectedChainDate(long ms) {
            String d = etDate(ms - 6 * 3_600_000L);
            String effective = isTradingDay(d) ? d : nextTradingDay(d);
            return prevTradingDay(effective);
        }

        boolean isTooStaleLevels(String chainDate, long ms) {
            if (chainDate == null || chainDate.length() < 10 || !WidgetStore.isDate(chainDate.substring(0, 10))) return false;
            return chainDate.substring(0, 10).compareTo(prevTradingDay(expectedChainDate(ms))) < 0;
        }

        boolean isRegularOpen(long ms) {
            String d = etDate(ms);
            int m = etMinutes(ms);
            return isTradingDay(d) && m >= 570 && m < closeMinutes(d);
        }
    }

    // ── 레벨 검사(웹 checkLevels) ──────────────────────────────────────

    public static final class MapGeometry {
        public final double px, mp, pf, cw;
        MapGeometry(double px, double mp, double pf, double cw) { this.px = px; this.mp = mp; this.pf = pf; this.cw = cw; }
    }

    private static Double pos(Double v) { return v != null && !v.isNaN() && !v.isInfinite() && v > 0 ? v : null; }

    /** 지도를 그려도 되면 기하, 아니면 null(바 생략) */
    static MapGeometry geometry(Quote q, long now, MarketCalendar cal) {
        if (q == null || !q.hasLevelsMeta || !"structure".equals(q.levelsSource)) return null;
        Double S = pos(q.price), pf = pos(q.putFloor), cw = pos(q.callWall), mp = pos(q.maxPain), gf = pos(q.gammaFlip);
        if (S == null || pf == null || cw == null || mp == null) return null;
        double eps = S * 1e-9;
        if (!(cw > S && cw <= S * 1.2 + eps)) return null;
        if (!(pf < S && pf >= S * 0.8 - eps)) return null;
        if (!(Math.abs(mp - S) <= S * 0.2 + eps)) return null;
        if (gf != null && !(Math.abs(gf - S) <= S * 0.15 + eps)) return null;
        if (cal.isTooStaleLevels(q.levelsChainDate, now)) return null;
        double span = cw - pf;
        double at = span > 0 ? (S - pf) / span : 0.5;
        double atMp = span > 0 ? (mp - pf) / span : 0.5;
        return new MapGeometry(clamp01(at), clamp01(atMp), pf, cw);
    }

    private static double clamp01(double x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

    // ── 숫자 모양 ─────────────────────────────────────────────────────

    static final String MINUS = "−";

    private static String number(double n, int min, int max) {
        DecimalFormat f = new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(Locale.US));
        f.setMinimumFractionDigits(min);
        f.setMaximumFractionDigits(max);
        f.setRoundingMode(java.math.RoundingMode.HALF_UP);
        // 이진 소수 그대로 반올림하면 1.005 → 1.00 이 된다. 웹(ICU)·iOS 처럼 «가장 짧은 십진 표기»에서 반올림한다(1.005 → 1.01)
        return f.format(new java.math.BigDecimal(Double.toString(n)));
    }

    static String price(Double n) {
        if (n == null) return "—";
        int d = n >= 100_000 ? 0 : 2;
        return "$" + number(n, d, d);
    }

    /** 반올림은 0 에서 먼 쪽으로(웹 toFixed · iOS rounded() 와 같다 — Math.round 는 음수 .5 를 위로 올린다) */
    private static double round2(double x) { return Math.signum(x) * Math.round(Math.abs(x) * 100.0) / 100.0; }

    static String pct(Double x) {
        if (x == null) return "";
        double r = round2(x);
        String abs = String.format(Locale.US, "%.2f", Math.abs(r));
        if (r > 0) return "+" + abs + "%";
        if (r < 0) return MINUS + abs + "%";
        return abs + "%";
    }

    static int direction(Double x) {
        if (x == null) return 0;
        double r = round2(x);
        return r > 0 ? 1 : r < 0 ? -1 : 0;
    }

    static String level(double n) { return number(n, 0, 2); }

    // ── 글자(앱에서 고른 언어) ─────────────────────────────────────────

    static final class Text {
        final String title, empty, notSynced, openApp;
        Text(String title, String empty, String notSynced, String openApp) {
            this.title = title; this.empty = empty; this.notSynced = notSynced; this.openApp = openApp;
        }
    }

    static String resolveLocale(String saved) {
        if ("ko".equals(saved) || "en".equals(saved) || "ja".equals(saved)) return saved;
        String dev = Locale.getDefault().getLanguage();
        return "ko".equals(dev) || "ja".equals(dev) ? dev : "en";
    }

    static Text text(String loc) {
        switch (loc) {
            case "ko": return new Text("내 종목", "앱에서 ♡ 로 담으면 여기 보입니다", "앱을 열면 내 종목이 여기 보입니다", "앱 열기");
            case "ja": return new Text("マイ銘柄", "アプリで♡を押すとここに表示されます", "アプリを開くとマイ銘柄がここに表示されます", "アプリを開く");
            default: return new Text("My Watchlist", "Tap ♡ in the app to see stocks here", "Open the app to see your watchlist here", "Open app");
        }
    }

    private static final Map<String, String[]> WEEKDAYS = new HashMap<>();
    static {
        WEEKDAYS.put("ko", new String[]{"일", "월", "화", "수", "목", "금", "토"});
        WEEKDAYS.put("ja", new String[]{"日", "月", "火", "水", "木", "金", "土"});
        WEEKDAYS.put("en", new String[]{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"});
    }

    private static String md(String d) {
        String[] p = d.split("-");
        if (p.length != 3) return d;
        return Integer.parseInt(p[1]) + "/" + Integer.parseInt(p[2]);
    }

    /** 머리 오른쪽 기준 — «9/29 장중 · 23:42» · «9/28(월) 종가» (웹 priceBasisLabel 과 같은 말) */
    static String basis(String session, long at, MarketCalendar cal, String loc) {
        if ("reg".equals(session)) {
            SimpleDateFormat f = "en".equals(loc)
                    ? new SimpleDateFormat("h:mm a", Locale.US)
                    : new SimpleDateFormat("HH:mm", Locale.US);
            String time = f.format(new Date(at));
            String d = md(cal.etDate(at));
            switch (loc) {
                case "ko": return d + " 장중 · " + time;
                case "ja": return d + " 取引中 · " + time;
                default: return "Intraday · " + time;
            }
        }
        String d = cal.lastCompletedSession(at);
        String[] wd = WEEKDAYS.get(loc);
        String w = wd == null ? "" : wd[cal.weekday(d)];
        switch (loc) {
            case "ko": return md(d) + "(" + w + ") 종가";
            case "ja": return md(d) + "(" + w + ") 終値";
            default: return w + " " + md(d) + " close";
        }
    }
}
