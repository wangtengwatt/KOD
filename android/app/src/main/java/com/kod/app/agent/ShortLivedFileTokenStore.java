package com.kod.app.agent;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

final class ShortLivedFileTokenStore {
    static final long TOKEN_TTL_MS = 15 * 60_000L;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Entry> entries = new HashMap<>();

    synchronized String put(Context context, Uri uri, String name, String mimeType, long size) {
        purgeExpired();
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        entries.put(token, new Entry(uri, name, mimeType, size, System.currentTimeMillis() + TOKEN_TTL_MS, false, randomCacheName(mimeType)));
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
        return token == null ? null : entries.remove(token);
    }

    synchronized void clear(ContentResolver resolver) {
        for (Entry entry : entries.values()) release(resolver, entry.uri());
        entries.clear();
    }

    void release(ContentResolver resolver, Uri uri) {
        try { resolver.releasePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION); }
        catch (SecurityException ignored) { }
    }

    private void purgeExpired() {
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, Entry>> iterator = entries.entrySet().iterator();
        while (iterator.hasNext()) {
            if (iterator.next().getValue().expiresAt() <= now) iterator.remove();
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
