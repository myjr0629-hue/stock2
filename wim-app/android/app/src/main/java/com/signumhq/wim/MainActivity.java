package com.signumhq.wim;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * targetSdk 35+ draws the app edge-to-edge, but the Android WebView reports
 * env(safe-area-inset-*) as 0 — the web layer has no way to learn how tall the
 * status bar or the gesture/navigation bar actually is. A hardcoded floor is
 * wrong on any device whose bars differ from the guess (24dp vs a 48dp
 * punch-hole cutout, gesture bar vs 3-button nav), which is exactly why the
 * layout came out different from device to device.
 *
 * So measure the real insets natively and publish them as the CSS variables the
 * page reads: --wim-top-floor / --wim-bottom-floor. iOS is unaffected — there
 * env() works and the floors simply stay 0.
 */
public class MainActivity extends BridgeActivity {

    private int topDp = 0;
    private int bottomDp = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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

        // The page is remote, so it is usually not parsed yet when the first
        // insets arrive. Re-publish while it loads instead of racing it.
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
                "d.style.setProperty('--wim-top-floor','" + topDp + "px');" +
                "d.style.setProperty('--wim-bottom-floor','" + bottomDp + "px');})();";
        getBridge().getWebView().evaluateJavascript(js, null);
    }
}
