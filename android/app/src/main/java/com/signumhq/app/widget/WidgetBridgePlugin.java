package com.signumhq.app.widget;

import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * WidgetBridge — 웹뷰의 «내 종목» 목록을 홈 화면 위젯에 넘기는 앱 내 플러그인.
 * 웹: src/lib/app/widgetBridge.ts 가 Capacitor.isPluginAvailable('WidgetBridge') 일 때만 부른다(옛 앱 바이너리엔 없다).
 * 등록: MainActivity.onCreate → registerPlugin(WidgetBridgePlugin.class) (super.onCreate 보다 먼저)
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    private static final int MAX_LOGO_BYTES = 300_000;
    private long lastRefresh = 0L;

    @PluginMethod
    public void setWatchlist(PluginCall call) {
        List<String> tickers = strings(call.getArray("tickers"));
        Map<String, String> names = new HashMap<>();
        JSObject o = call.getObject("names");
        if (o != null) {
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (o.isNull(k)) continue;
                String v = o.optString(k, "");
                if (!v.isEmpty()) names.put(k, v);
            }
        }
        boolean changed = WidgetStore.writeWatchlist(getContext(), tickers, names, call.getString("locale"),
                strings(call.getArray("holidays")), strings(call.getArray("earlyCloses")));
        boolean refreshed = false;
        if (WidgetUpdater.hasWidgets(getContext())) {
            WidgetUpdater.renderAllAsync(getContext());   // 순서·목록은 곧바로(가격은 저장된 값)
            long now = System.currentTimeMillis();
            if (changed || now - lastRefresh > 5 * 60_000L) {
                lastRefresh = now;
                WidgetUpdater.refreshSoon(getContext());
                refreshed = true;
            }
        }
        JSObject ret = new JSObject();
        ret.put("stored", Math.min(tickers.size(), WidgetStore.MAX_ITEMS));
        ret.put("changed", changed);
        ret.put("reloaded", refreshed);
        call.resolve(ret);
    }

    @PluginMethod
    public void setLogos(PluginCall call) {
        JSObject logos = call.getObject("logos");
        if (logos == null) {
            call.reject("logos is required");
            return;
        }
        int saved = 0, seen = 0;
        Iterator<String> it = logos.keys();
        while (it.hasNext() && seen < 24) {
            String k = it.next();
            seen++;
            String t = WidgetStore.normalizeTicker(k);
            String b64 = logos.isNull(k) ? null : logos.optString(k, null);
            if (t == null || b64 == null || b64.length() > MAX_LOGO_BYTES * 4 / 3 + 8) continue;
            byte[] data;
            try { data = Base64.decode(b64, Base64.DEFAULT); } catch (IllegalArgumentException e) { continue; }
            if (data.length < 8 || data.length > MAX_LOGO_BYTES || (data[0] & 0xFF) != 0x89 || data[1] != 'P' || data[2] != 'N' || data[3] != 'G') continue;
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
            if (bounds.outWidth < 16 || bounds.outHeight < 16) continue;
            File f = WidgetStore.logoFile(getContext(), t);
            if (WidgetStore.writeBytes(f, data)) {
                saved++;
                WidgetStore.noteLogoMiss(getContext(), t, false);
            }
        }
        if (saved > 0 && WidgetUpdater.hasWidgets(getContext())) WidgetUpdater.renderAllAsync(getContext());
        JSObject ret = new JSObject();
        ret.put("saved", saved);
        call.resolve(ret);
    }

    private static List<String> strings(JSArray a) {
        List<String> out = new ArrayList<>();
        if (a == null) return out;
        for (int i = 0; i < a.length(); i++) {
            if (a.isNull(i)) continue;              // org.json 의 optString 은 null 을 "null" 글자로 돌려준다
            String s = a.optString(i, null);
            if (s != null) out.add(s);
        }
        return out;
    }
}
