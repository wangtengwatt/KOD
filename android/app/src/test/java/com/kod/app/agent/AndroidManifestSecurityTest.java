package com.kod.app.agent;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.junit.Test;

public class AndroidManifestSecurityTest {
    @Test
    public void sourceManifestKeepsSensitivePermissionsNarrow() throws Exception {
        Path manifest = Paths.get("src/main/AndroidManifest.xml");
        if (!Files.exists(manifest)) {
            return;
        }
        String xml = Files.readString(manifest);
        assertFalse(xml.contains("MANAGE_EXTERNAL_STORAGE"));
        assertFalse(xml.contains("READ_EXTERNAL_STORAGE"));
        assertFalse(xml.contains("WRITE_EXTERNAL_STORAGE"));
        assertFalse(xml.contains("READ_MEDIA_IMAGES"));
        assertFalse(xml.contains("QUERY_ALL_PACKAGES"));
        assertTrue(xml.contains("android:exported=\"false\""));
    }
}
