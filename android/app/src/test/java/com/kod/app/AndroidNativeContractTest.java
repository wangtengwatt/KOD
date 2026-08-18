package com.kod.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
    public void productionJavaAvoidsConvenienceApisUnavailableOnAndroidEight() throws Exception {
        StringBuilder productionJava = new StringBuilder();
        try (java.util.stream.Stream<Path> files = Files.walk(new File("src/main/java").toPath())) {
            files.filter(path -> path.toString().endsWith(".java"))
                    .forEach(path -> {
                        try {
                            productionJava.append(new String(Files.readAllBytes(path), StandardCharsets.UTF_8));
                        } catch (Exception error) {
                            throw new RuntimeException(error);
                        }
                    });
        }

        String source = productionJava.toString();
        assertFalse(source.contains(".readAllBytes("));
        assertFalse(source.contains("Set.of("));
        assertFalse(source.contains("List.of("));
        assertFalse(source.contains(".isBlank("));
    }

    @Test
    public void packageVisibilityIsLimitedToTheTwoAllowedAgentTargets() throws Exception {
        String manifest = source("src/main/AndroidManifest.xml");
        Matcher queries = Pattern.compile("<queries>([\\s\\S]*?)</queries>").matcher(manifest);
        assertTrue(queries.find());

        Matcher packages = Pattern.compile("<package\\s+android:name=\"([^\"]+)\"\\s*/>").matcher(queries.group(1));
        Set<String> visiblePackages = new HashSet<>();
        while (packages.find()) visiblePackages.add(packages.group(1));

        assertEquals(new HashSet<>(Arrays.asList("com.tencent.mm", "com.tencent.mobileqq")), visiblePackages);
        assertFalse(manifest.contains("QUERY_ALL_PACKAGES"));
    }

    @Test
    public void instrumentationChecksBothVariantIdentities() throws Exception {
        String instrumentation = source("src/androidTest/java/com/kod/app/ExampleInstrumentedTest.java");

        assertTrue(instrumentation.contains("BuildConfig.APPLICATION_ID"));
        assertTrue(instrumentation.contains("com.kod.app.localtest"));
        assertTrue(instrumentation.contains("com.kod.app"));
    }
}
