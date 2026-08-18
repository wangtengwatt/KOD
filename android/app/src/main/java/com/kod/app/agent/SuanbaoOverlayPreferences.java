package com.kod.app.agent;

import android.content.Context;
import android.content.SharedPreferences;

final class SuanbaoOverlayPreferences {
    static final String SMALL = "small";
    static final String MEDIUM = "medium";
    static final String LARGE = "large";
    static final String MOTION_FULL = "full";
    static final String MOTION_REDUCED = "reduced";
    static final String MOTION_OFF = "off";

    record Snapshot(String size, float opacity, String motion, boolean edgeSnap, boolean positionLocked) {}

    private final SharedPreferences prefs;

    SuanbaoOverlayPreferences(Context context) {
        prefs = context.getSharedPreferences("suanbao_overlay", Context.MODE_PRIVATE);
    }

    Snapshot get() {
        return new Snapshot(
            validSize(prefs.getString("size", MEDIUM)),
            clampOpacity(prefs.getFloat("opacity", 1f)),
            validMotion(prefs.getString("motion", MOTION_FULL)),
            prefs.getBoolean("edge_snap", true),
            prefs.getBoolean("position_locked", false)
        );
    }

    Snapshot update(String size, Float opacity, String motion, Boolean edgeSnap, Boolean positionLocked) {
        Snapshot current = get();
        Snapshot next = new Snapshot(
            size == null ? current.size() : validSize(size),
            opacity == null ? current.opacity() : clampOpacity(opacity),
            motion == null ? current.motion() : validMotion(motion),
            edgeSnap == null ? current.edgeSnap() : edgeSnap,
            positionLocked == null ? current.positionLocked() : positionLocked
        );
        prefs.edit()
            .putString("size", next.size())
            .putFloat("opacity", next.opacity())
            .putString("motion", next.motion())
            .putBoolean("edge_snap", next.edgeSnap())
            .putBoolean("position_locked", next.positionLocked())
            .apply();
        return next;
    }

    static int visibleWidthDp(String size) {
        return SMALL.equals(size) ? 66 : LARGE.equals(size) ? 104 : 82;
    }

    static int visibleHeightDp(String size) {
        return Math.round(visibleWidthDp(size) * 96f / 82f);
    }

    static float clampOpacity(float opacity) {
        if (Float.isNaN(opacity) || Float.isInfinite(opacity)) return 1f;
        return Math.max(0.5f, Math.min(opacity, 1f));
    }

    private static String validSize(String size) {
        return SMALL.equals(size) || LARGE.equals(size) ? size : MEDIUM;
    }

    private static String validMotion(String motion) {
        return MOTION_REDUCED.equals(motion) || MOTION_OFF.equals(motion) ? motion : MOTION_FULL;
    }
}
