package com.kod.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.Test;

public class AndroidNativeContractTest {
    private static String source(String relativePath) throws Exception {
        return new String(
                Files.readAllBytes(new File(relativePath).toPath()), StandardCharsets.UTF_8);
    }

    @Test
    public void mainActivityRegistersPlatformPluginsAndStartupEnvironment() throws Exception {
        String source = source("src/main/java/com/kod/app/MainActivity.java");

        assertTrue(source.contains("registerPlugin(AndroidAgentPlugin.class)"));
        assertTrue(source.contains("registerPlugin(KodFilePlugin.class)"));
        assertTrue(source.contains("StartupEnvironmentBanner.show"));
        assertTrue(source.indexOf("registerPlugin(AndroidAgentPlugin.class)") < source.indexOf("super.onCreate"));
    }

    @Test
    public void manifestKeepsNativeServicesPrivateAndPermissionsMinimal() throws Exception {
        String manifest = source("src/main/AndroidManifest.xml");

        assertTrue(manifest.contains(".agent.KodAccessibilityService"));
        assertTrue(manifest.contains(".agent.SuanbaoOverlayService"));
        assertTrue(manifest.contains("android:exported=\"false\""));
        assertTrue(manifest.contains("android.permission.SYSTEM_ALERT_WINDOW"));
        assertTrue(manifest.contains("android.permission.FOREGROUND_SERVICE_SPECIAL_USE"));
        assertFalse(manifest.contains("android.permission.MANAGE_EXTERNAL_STORAGE"));
        assertFalse(manifest.contains("android.permission.QUERY_ALL_PACKAGES"));
    }

    @Test
    public void productionLinksAndSharedFilePathsStayNarrow() throws Exception {
        String mainManifest = source("src/main/AndroidManifest.xml");
        String releaseManifest = source("src/release/AndroidManifest.xml");
        String filePaths = source("src/main/res/xml/file_paths.xml");

        assertFalse(mainManifest.contains("kod.kai.com"));
        assertTrue(releaseManifest.contains("android:autoVerify=\"true\""));
        assertTrue(releaseManifest.contains("android:host=\"kod.kai.com\""));
        assertTrue(filePaths.contains("path=\"shared/\""));
        assertFalse(filePaths.contains("external-path"));
        assertFalse(filePaths.contains("path=\".\""));
    }

    @Test
    public void AndroidEightIsTheNativeCompatibilityFloor() throws Exception {
        String variables = source("../variables.gradle");
        assertTrue(variables.contains("minSdkVersion = 26"));
    }

    @Test
    public void instrumentationChecksBothVariantIdentities() throws Exception {
        String instrumentation = source("src/androidTest/java/com/kod/app/ExampleInstrumentedTest.java");

        assertTrue(instrumentation.contains("BuildConfig.APPLICATION_ID"));
        assertTrue(instrumentation.contains("com.kod.app.localtest"));
        assertTrue(instrumentation.contains("com.kod.app"));
    }
}
