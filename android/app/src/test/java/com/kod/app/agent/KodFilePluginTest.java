package com.kod.app.agent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

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

    @Test
    public void expiredTokensInvokeCleanupExactlyOnceWithTheStoredEntry() {
        AtomicLong now = new AtomicLong(1_000L);
        List<ShortLivedFileTokenStore.Entry> cleaned = new ArrayList<>();
        ShortLivedFileTokenStore store = new ShortLivedFileTokenStore(now::get, cleaned::add);
        String token = store.put(null, "report.pdf", "application/pdf", 12L);

        now.addAndGet(ShortLivedFileTokenStore.TOKEN_TTL_MS + 1L);

        assertNull(store.get(token));
        assertEquals(1, cleaned.size());
        assertEquals("report.pdf", cleaned.get(0).name());
        assertEquals("application/pdf", cleaned.get(0).mimeType());
        assertNull(store.get(token));
        assertEquals(1, cleaned.size());
    }

    @Test
    public void revokedTokensInvokeCleanupWithTheRemovedEntry() {
        List<ShortLivedFileTokenStore.Entry> cleaned = new ArrayList<>();
        ShortLivedFileTokenStore store = new ShortLivedFileTokenStore(() -> 1_000L, cleaned::add);
        String token = store.put(null, "notes.txt", "text/plain", 4L);

        ShortLivedFileTokenStore.Entry removed = store.revoke(token);

        assertNotNull(removed);
        assertEquals(1, cleaned.size());
        assertEquals(removed.cacheName(), cleaned.get(0).cacheName());
    }

    @Test
    public void cachedCopyCleanupUsesTheEntryCacheName() throws Exception {
        Path cache = Files.createTempDirectory("kod-file-plugin-test");
        Path shared = Files.createDirectories(cache.resolve("shared"));
        Path stored = shared.resolve("stored-entry.pdf");
        Path unrelated = shared.resolve("other-entry.pdf");
        Files.write(stored, "stored".getBytes(StandardCharsets.UTF_8));
        Files.write(unrelated, "other".getBytes(StandardCharsets.UTF_8));
        ShortLivedFileTokenStore.Entry entry = new ShortLivedFileTokenStore.Entry(
                null, "report.pdf", "application/pdf", 6L, 10_000L, true, "stored-entry.pdf");

        KodFilePlugin.deleteCachedCopy(cache.toFile(), entry);

        assertFalse(Files.exists(stored));
        assertTrue(Files.exists(unrelated));
        Files.deleteIfExists(unrelated);
        Files.deleteIfExists(shared);
        Files.deleteIfExists(cache);
    }
}
