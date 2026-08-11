package com.kod.app.agent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class KodFilePluginTest {
    @Test
    public void fixedLimitsRemainNarrow() {
        assertEquals(1, KodFilePlugin.MAX_FILES);
        assertEquals(25L * 1024L * 1024L, KodFilePlugin.MAX_BYTES);
        assertEquals(15 * 60_000L, ShortLivedFileTokenStore.TOKEN_TTL_MS);
    }

    @Test
    public void onlyAllowsExpectedPickerTypes() {
        assertTrue(KodFilePlugin.isAllowedMime("image/jpeg"));
        assertTrue(KodFilePlugin.isAllowedMime("application/pdf"));
        assertTrue(KodFilePlugin.isAllowedMime("text/plain"));
        assertFalse(KodFilePlugin.isAllowedMime("application/zip"));
        assertFalse(KodFilePlugin.isAllowedMime(null));
    }
}
