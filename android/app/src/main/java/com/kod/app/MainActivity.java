package com.kod.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.kod.app.agent.AndroidAgentPlugin;
import com.kod.app.agent.KodFilePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidAgentPlugin.class);
        registerPlugin(KodFilePlugin.class);
        super.onCreate(savedInstanceState);
        StartupEnvironmentBanner.show(this, BuildConfig.KOD_ANDROID_ENV);
    }
}
