package com.signumhq.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * targetSdk 36 draws the app edge-to-edge, but the Android WebView reports
 * env(safe-area-inset-*) as 0 — a known WebView bug — so the page cannot tell how
 * tall the status bar or the gesture/navigation bar actually is. v1.0 worked around
 * it with a hardcoded 24dp guess in native-app.css, which is wrong on any device
 * whose bars differ (48dp punch-hole cutout, 3-button nav vs gesture bar). That is
 * why the layout came out different from device to device.
 *
 * Measure the real insets here and publish them as CSS variables the page reads:
 * --sig-top-floor / --sig-bottom-floor. iOS is untouched (env() works there).
 *
 * NOTE the web layer keeps `var(--sig-top-floor, 24px)` — the old guess stays as the
 * fallback, because signumhq.com is shared with users still on v1.0 who have no
 * native publisher. They must keep behaving exactly as before.
 */
public class MainActivity extends BridgeActivity {

    /** Upper bound for the system font scale inside the WebView. Above this the
     *  fixed-height chrome starts to overflow; below it the user's choice stands. */
    private static final int MAX_TEXT_ZOOM = 115;

    private int barsTopPx = 0;
    private int barsBottomPx = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android ≤14 는 시스템 내비바가 앱 위에 겹치지 않고 «흰 띠»로 남는다.
        // 다크 앱인 SIGNUM 에서만 경계가 도드라진다(UC 는 밝아서 안 보인다).
        // Android 15+ 는 엣지투엣지 강제라 이 호출을 무시한다 → 레이아웃·인셋 불변.
        getWindow().setNavigationBarColor(android.graphics.Color.parseColor("#050a14"));
        new androidx.core.view.WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView())
                .setAppearanceLightNavigationBars(false);

        // Disable pull-to-refresh / overscroll bounce
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);

        // CAP the WebView's text scale rather than pinning it. Android's system
        // font-size slider multiplies every px in the page, and past a point that
        // overflows the fixed-height tab bar and the dashboard cards — a break that
        // never shows at default settings. But pinning to 100 silently discards the
        // choice of every user who enlarged their text for a reason (verified on a
        // real device). So honour the setting up to a bound the layout survives.
        WebSettings ws = getBridge().getWebView().getSettings();
        ws.setTextZoom(Math.min(ws.getTextZoom(), MAX_TEXT_ZOOM));

        final View root = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            barsTopPx = bars.top;
            barsBottomPx = bars.bottom;
            publishInsets();
            return windowInsets;
        });

        // The page is remote, so it is usually not parsed yet when the first insets
        // arrive. Re-publish while it loads instead of racing it.
        handler.postDelayed(this::publishInsets, 300);
        handler.postDelayed(this::publishInsets, 1200);
        handler.postDelayed(this::publishInsets, 3000);
    }

    @Override
    public void onResume() {
        super.onResume();
        publishInsets();
    }

    /**
     * Publish only the part of each system bar the WebView is NOT already clear of.
     *
     * The window always reports the full bar height, but depending on the Android
     * version and what Capacitor does with the decor, the WebView may already start
     * below the status bar. Publishing the window's number in that case adds the bar
     * height a SECOND time — verified on an Android 15 emulator, where the masthead
     * dropped ~135px below where it belonged. So measure where the WebView actually
     * sits and hand the page only the remainder, which is 0 when the platform has
     * already handled it.
     */
    private void publishInsets() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final WebView wv = getBridge().getWebView();
        if (wv.getHeight() <= 0) return;   // not laid out yet — a later republish covers it

        final int[] loc = new int[2];
        wv.getLocationOnScreen(loc);
        final int screenPx = getResources().getDisplayMetrics().heightPixels;

        final int clearTopPx = loc[1];                          // gap already above the WebView
        // ★ clamp. 삼성 실기기에서 heightPixels 가 내비바를 «제외한» 값을 돌려줘
        //   이 식이 −205 가 됐고, 아래 max(0, barsBottom − clearBottom) 이 뺄셈이
        //   아니라 «덧셈»이 되면서 내비바 48dp 를 126dp 로 부풀려 게시했다.
        //   그러면 웹의 탭바가 화면에서 140px 떠 버린다(2026-07 실측).
        //   clearBottom 은 «WebView 아래 남은 여백»이라 음수일 수 없다.
        final int clearBottomPx = Math.max(0, screenPx - (loc[1] + wv.getHeight()));

        final float density = getResources().getDisplayMetrics().density;
        final int topDp = Math.round(Math.max(0, barsTopPx - clearTopPx) / density);
        final int bottomDp = Math.round(Math.max(0, barsBottomPx - clearBottomPx) / density);

        final String js =
                "(function(){var d=document.documentElement;if(!d)return;" +
                "d.style.setProperty('--sig-top-floor','" + topDp + "px');" +
                "d.style.setProperty('--sig-bottom-floor','" + bottomDp + "px');})();";
        wv.evaluateJavascript(js, null);
    }
}
