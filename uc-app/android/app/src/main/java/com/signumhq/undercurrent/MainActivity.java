package com.signumhq.undercurrent;

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
 * targetSdk 35+ draws the app edge-to-edge, but the Android WebView reports
 * env(safe-area-inset-*) as 0 — the web layer has no way to learn how tall the
 * status bar or the gesture/navigation bar actually is, so content collides with
 * them. iOS is unaffected: there env() works and these floors simply stay 0.
 *
 * The earlier releases papered over this with a hardcoded padding guess, which is
 * wrong on any device whose bars differ from the guess (24dp vs a 48dp punch-hole
 * cutout, gesture bar vs 3-button nav) — that is exactly why the layout came out
 * different from device to device. So measure the real insets natively and publish
 * them as the CSS variables the page reads: --uc-top-floor / --uc-bottom-floor.
 *
 * Ported from the WIM shell, where this approach was verified on the emulator.
 */
public class MainActivity extends BridgeActivity {

    private int barsTopPx = 0;
    private int barsBottomPx = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Pin the WebView's text scale. Android's system font-size slider otherwise
        // multiplies every px in the page, which overflows the fixed-height cards and
        // the tab bar for anyone running "large" text — a layout break we cannot
        // reproduce at default settings and would never see in review.
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings ws = getBridge().getWebView().getSettings();
            ws.setTextZoom(100);
        }

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
        final int clearBottomPx = screenPx - (loc[1] + wv.getHeight());

        final float density = getResources().getDisplayMetrics().density;
        final int topDp = Math.round(Math.max(0, barsTopPx - clearTopPx) / density);
        final int bottomDp = Math.round(Math.max(0, barsBottomPx - clearBottomPx) / density);

        final String js =
                "(function(){var d=document.documentElement;if(!d)return;" +
                "d.style.setProperty('--uc-top-floor','" + topDp + "px');" +
                "d.style.setProperty('--uc-bottom-floor','" + bottomDp + "px');})();";
        wv.evaluateJavascript(js, null);
    }
}
