package com.kod.app.agent;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KodFile")
public class KodFilePlugin extends Plugin {
    static final int MAX_FILES = 1;
    static final long MAX_BYTES = 25L * 1024L * 1024L;
    private static final String[] ALLOWED_TYPES = {"image/*", "application/pdf", "text/plain", "text/csv"};
    private final ShortLivedFileTokenStore tokens = new ShortLivedFileTokenStore();
    private PluginCall pendingPicker;

    @Override
    protected void handleOnDestroy() {
        tokens.clear(getContext().getContentResolver());
        pendingPicker = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void pickFile(PluginCall call) {
        if (pendingPicker != null) { reject(call, "PICKER_ACTIVE", "A file picker is already active"); return; }
        pendingPicker = call;
        Intent intent;
        String kind = call.getString("kind", "document");
        if (Build.VERSION.SDK_INT >= 33 && "image".equals(kind)) {
            intent = new Intent("android.provider.action.PICK_IMAGES");
            intent.setType("image/*");
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, ALLOWED_TYPES);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        }
        startActivityForResult(call, intent, "filePickerResult");
    }

    @ActivityCallback
    private void filePickerResult(PluginCall call, ActivityResult result) {
        pendingPicker = null;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true)); return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) { reject(call, "FILE_URI_REQUIRED", "Only content URIs are supported"); return; }
        if (!"content".equalsIgnoreCase(uri.getScheme())) { reject(call, "FILE_URI_REQUIRED", "Only content URIs are supported"); return; }
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) { }
        FileInfo info = inspect(uri);
        if (info == null) { reject(call, "FILE_UNREADABLE", "The selected file cannot be inspected"); return; }
        if (info.size < 0 || info.size > MAX_BYTES) { reject(call, "FILE_TOO_LARGE", "File exceeds the 25 MiB limit"); return; }
        if (!isAllowedMime(info.mimeType)) { reject(call, "FILE_TYPE_BLOCKED", "This file type is not supported"); return; }
        String token = tokens.put(getContext(), uri, info.name, info.mimeType, info.size);
        JSObject file = new JSObject(); file.put("token", token); file.put("name", info.name); file.put("mimeType", info.mimeType); file.put("size", info.size);
        JSObject response = new JSObject(); response.put("cancelled", false); response.put("files", new JSArray().put(file)); call.resolve(response);
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        ShortLivedFileTokenStore.Entry entry = tokens.consumeForShare(call.getString("token"));
        if (entry == null) { reject(call, "TOKEN_INVALID", "File token is expired, invalid, or already shared"); return; }
        Uri shareUri;
        try { shareUri = androidx.core.content.FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", copyToCache(entry)); }
        catch (Exception error) { reject(call, "FILE_SHARE_FAILED", "Unable to prepare file for sharing"); return; }
        Intent intent = new Intent(Intent.ACTION_SEND).setType(entry.mimeType());
        intent.putExtra(Intent.EXTRA_STREAM, shareUri); intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getContext().startActivity(Intent.createChooser(intent, "分享文件"));
            call.resolve(new JSObject().put("shared", true));
        } catch (RuntimeException error) {
            deleteCachedCopy(entry);
            reject(call, "FILE_SHARE_UNAVAILABLE", "No compatible share target is available");
        }
    }

    @PluginMethod
    public void revokeFile(PluginCall call) {
        ShortLivedFileTokenStore.Entry entry = tokens.revoke(call.getString("token"));
        if (entry != null) {
            tokens.release(getContext().getContentResolver(), entry.uri());
            deleteCachedCopy(entry);
        }
        call.resolve(new JSObject().put("revoked", entry != null));
    }

    @PluginMethod
    public void getLimits(PluginCall call) {
        call.resolve(new JSObject().put("maxFiles", MAX_FILES).put("maxBytes", MAX_BYTES).put("contentUriOnly", true).put("tokenTtlMs", ShortLivedFileTokenStore.TOKEN_TTL_MS));
    }

    private FileInfo inspect(Uri uri) {
        String name = "selected-file"; long size = -1; String mime = getContext().getContentResolver().getType(uri);
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME); int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIndex >= 0 && cursor.getString(nameIndex) != null) name = cursor.getString(nameIndex);
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex);
            }
        } catch (Exception ignored) { return null; }
        return new FileInfo(name, mime == null ? "application/octet-stream" : mime, size);
    }

    static boolean isAllowedMime(String mime) { if (mime == null) return false; for (String allowed : ALLOWED_TYPES) if (allowed.endsWith("/*") ? mime.startsWith(allowed.substring(0, allowed.length() - 1)) : allowed.equalsIgnoreCase(mime)) return true; return false; }
    private java.io.File cachedCopy(ShortLivedFileTokenStore.Entry entry) {
        java.io.File dir = new java.io.File(getContext().getCacheDir(), "shared");
        String extension = ".bin";
        if ("application/pdf".equals(entry.mimeType())) extension = ".pdf";
        else if ("text/plain".equals(entry.mimeType())) extension = ".txt";
        else if ("text/csv".equals(entry.mimeType())) extension = ".csv";
        else if (entry.mimeType().startsWith("image/")) extension = ".img";
        return new java.io.File(dir, "kod-" + java.util.UUID.randomUUID() + extension);
    }
    private void deleteCachedCopy(ShortLivedFileTokenStore.Entry entry) {
        java.io.File cached = cachedCopy(entry);
        if (cached.exists()) cached.delete();
    }
    private java.io.File copyToCache(ShortLivedFileTokenStore.Entry entry) throws Exception {
        java.io.File dir = new java.io.File(getContext().getCacheDir(), "shared"); if (!dir.exists() && !dir.mkdirs()) throw new java.io.IOException("cache");
        java.io.File out = new java.io.File(new java.io.File(getContext().getCacheDir(), "shared"), entry.cacheName());
        try (java.io.InputStream input = getContext().getContentResolver().openInputStream(entry.uri()); java.io.OutputStream output = new java.io.FileOutputStream(out)) {
            if (input == null) throw new java.io.IOException("input"); byte[] buffer = new byte[8192]; int read; long total = 0;
            while ((read = input.read(buffer)) != -1) { total += read; if (total > MAX_BYTES) throw new java.io.IOException("size"); output.write(buffer, 0, read); }
        }
        return out;
    }
    private static void reject(PluginCall call, String code, String message) { call.reject(code + ": " + message, code); }
    private record FileInfo(String name, String mimeType, long size) { }
}
