package com.signumhq.app;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Disable pull-to-refresh / overscroll bounce
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
}
