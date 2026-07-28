package com.signumhq.undercurrent;

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

    private int topDp = 0;
    private int bottomDp = 0;
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
                "d.style.setProperty('--uc-top-floor','" + topDp + "px');" +
                "d.style.setProperty('--uc-bottom-floor','" + bottomDp + "px');})();";
        getBridge().getWebView().evaluateJavascript(js, null);
    }
}
