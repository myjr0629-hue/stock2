package com.signumhq.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebSettings;

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

    private int topDp = 0;
    private int bottomDp = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Disable pull-to-refresh / overscroll bounce
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Pin the WebView's text scale. Android's system font-size slider otherwise
        // multiplies every px in the page, overflowing the fixed-height tab bar and
        // the dashboard cards for anyone on "large" text — a break that never shows
        // up at default settings, so neither we nor a reviewer would ever see it.
        WebSettings ws = getBridge().getWebView().getSettings();
        ws.setTextZoom(100);

        final View root = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float density = getResources().getDisplayMetrics().density;
            topDp = Math.round(bars.top / density);
            bottomDp = Math.round(bars.bottom / density);
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

    private void publishInsets() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final String js =
                "(function(){var d=document.documentElement;if(!d)return;" +
                "d.style.setProperty('--sig-top-floor','" + topDp + "px');" +
                "d.style.setProperty('--sig-bottom-floor','" + bottomDp + "px');})();";
        getBridge().getWebView().evaluateJavascript(js, null);
    }
}
