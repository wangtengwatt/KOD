package com.kod.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.kod.app.agent.AndroidAgentPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidAgentPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
