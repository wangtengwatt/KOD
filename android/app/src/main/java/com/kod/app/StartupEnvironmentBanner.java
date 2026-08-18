package com.kod.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class StartupEnvironmentBanner {
    private static final long DISPLAY_MS = 3000L;

    private StartupEnvironmentBanner() {}

    static void show(Activity activity, String expectedEnvironment) {
        EnvironmentMarker marker = readMarker(activity, expectedEnvironment);
        TextView banner = new TextView(activity);
        banner.setText("KOD · " + marker.displayName + " · " + marker.environment);
        banner.setContentDescription("KOD startup environment: " + marker.environment);
        banner.setTextColor(Color.WHITE);
        banner.setTextSize(12);
        banner.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        banner.setGravity(Gravity.CENTER);
        banner.setPadding(24, 12, 24, 12);
        banner.setBackgroundColor("localtest".equals(marker.environment) ? Color.rgb(198, 92, 0) : Color.rgb(32, 89, 69));
        banner.setElevation(16f);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        );
        activity.addContentView(banner, params);
        banner.postDelayed(() -> {
            if (banner.getParent() instanceof ViewGroup) {
                ((ViewGroup) banner.getParent()).removeView(banner);
            }
        }, DISPLAY_MS);
    }

    private static EnvironmentMarker readMarker(Activity activity, String expectedEnvironment) {
        try (InputStream input = activity.getAssets().open("kod-build-environment.json")) {
            String json = readUtf8(input);
            JSONObject marker = new JSONObject(json);
            String environment = marker.getString("environment");
            String displayName = marker.getString("displayName");
            if (!expectedEnvironment.equals(environment)) {
                throw new IllegalStateException("Packaged Android environment marker mismatch");
            }
            return new EnvironmentMarker(environment, displayName);
        } catch (Exception error) {
            String fallback = "localtest".equals(expectedEnvironment) ? "KOD 本地测试" : "KOD 生产环境";
            return new EnvironmentMarker(expectedEnvironment, fallback);
        }
    }

    private static String readUtf8(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }

    private static final class EnvironmentMarker {
        final String environment;
        final String displayName;

        EnvironmentMarker(String environment, String displayName) {
            this.environment = environment;
            this.displayName = displayName;
        }
    }
}
