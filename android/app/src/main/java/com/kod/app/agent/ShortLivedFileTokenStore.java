package com.kod.app.agent;

import android.net.Uri;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

final class ShortLivedFileTokenStore {
    static final long TOKEN_TTL_MS = 15 * 60_000L;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Entry> entries = new HashMap<>();
    private final LongSupplier clock;
    private final Consumer<Entry> cleanup;

    ShortLivedFileTokenStore(LongSupplier clock, Consumer<Entry> cleanup) {
        this.clock = clock;
        this.cleanup = cleanup;
    }

    synchronized String put(Uri uri, String name, String mimeType, long size) {
        purgeExpired();
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        entries.put(token, new Entry(uri, name, mimeType, size, clock.getAsLong() + TOKEN_TTL_MS, false, randomCacheName(mimeType)));
        return token;
    }

    synchronized Entry get(String token) {
        purgeExpired();
        if (token == null || token.isEmpty()) return null;
        return entries.get(token);
    }

    synchronized Entry consumeForShare(String token) {
        purgeExpired();
        if (token == null || token.isEmpty()) return null;
        Entry entry = entries.get(token);
        if (entry == null || entry.shared()) return null;
        Entry consumed = entry.withShared(true);
        entries.put(token, consumed);
        return consumed;
    }

    synchronized Entry revoke(String token) {
        purgeExpired();
        Entry removed = token == null ? null : entries.remove(token);
        if (removed != null) cleanup.accept(removed);
        return removed;
    }

    synchronized void clear() {
        for (Entry entry : entries.values()) cleanup.accept(entry);
        entries.clear();
    }

    private void purgeExpired() {
        long now = clock.getAsLong();
        Iterator<Map.Entry<String, Entry>> iterator = entries.entrySet().iterator();
        while (iterator.hasNext()) {
            Entry entry = iterator.next().getValue();
            if (entry.expiresAt() <= now) {
                iterator.remove();
                cleanup.accept(entry);
            }
        }
    }

    private String randomCacheName(String mimeType) {
        String extension = ".bin";
        if ("application/pdf".equals(mimeType)) extension = ".pdf";
        else if ("text/plain".equals(mimeType)) extension = ".txt";
        else if ("text/csv".equals(mimeType)) extension = ".csv";
        else if (mimeType != null && mimeType.startsWith("image/")) extension = ".img";
        return "kod-" + java.util.UUID.randomUUID() + extension;
    }

    record Entry(Uri uri, String name, String mimeType, long size, long expiresAt, boolean shared, String cacheName) {
        Entry withShared(boolean value) { return new Entry(uri, name, mimeType, size, expiresAt, value, cacheName); }
    }
}
