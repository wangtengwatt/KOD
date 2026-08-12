package com.kod.app.agent;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SuanbaoOverlayPreferencesTest {
    @Test
    public void clampsOpacity() {
        assertEquals(0.5f, SuanbaoOverlayPreferences.clampOpacity(0.1f), 0.001f);
        assertEquals(1f, SuanbaoOverlayPreferences.clampOpacity(2f), 0.001f);
        assertEquals(0.75f, SuanbaoOverlayPreferences.clampOpacity(0.75f), 0.001f);
    }

    @Test
    public void mapsThreeSizePresets() {
        assertEquals(66, SuanbaoOverlayPreferences.visibleWidthDp("small"));
        assertEquals(82, SuanbaoOverlayPreferences.visibleWidthDp("medium"));
        assertEquals(104, SuanbaoOverlayPreferences.visibleWidthDp("large"));
    }
}
