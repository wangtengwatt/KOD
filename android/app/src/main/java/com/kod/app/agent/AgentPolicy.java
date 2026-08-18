package com.kod.app.agent;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class AgentPolicy {
    public static final String WECHAT = "wechat";
    public static final String QQ = "qq";

    private static final Map<String, String> ALLOWED_APPS;
    private static final Set<String> SENSITIVE_TERMS = Set.of(
        "支付", "付款", "收款", "转账", "红包", "提现", "银行卡", "验证码", "密码", "口令", "指纹",
        "payment", "pay now", "transfer", "bank card", "verification code", "otp", "password", "passcode"
    );
    private static final Set<String> PASSWORD_HINTS = Set.of("password", "passcode", "pin", "密码", "口令");

    static {
        Map<String, String> apps = new LinkedHashMap<>();
        apps.put(WECHAT, "com.tencent.mm");
        apps.put(QQ, "com.tencent.mobileqq");
        ALLOWED_APPS = Collections.unmodifiableMap(apps);
    }

    private AgentPolicy() {}

    public static Map<String, String> allowedApps() {
        return ALLOWED_APPS;
    }

    public static String packageForApp(String appId) {
        return ALLOWED_APPS.get(appId);
    }

    public static boolean isAllowedPackage(String packageName) {
        return packageName != null && ALLOWED_APPS.containsValue(packageName);
    }

    public static boolean isExpectedPackage(String expectedPackage, String actualPackage) {
        return isAllowedPackage(expectedPackage) && expectedPackage.equals(actualPackage);
    }

    public static boolean containsSensitiveTerm(CharSequence value) {
        if (value == null) return false;
        String normalized = value.toString().toLowerCase(Locale.ROOT);
        for (String term : SENSITIVE_TERMS) {
            if (normalized.contains(term)) return true;
        }
        return false;
    }

    public static boolean looksLikePasswordTarget(CharSequence text, CharSequence description,
                                                   CharSequence viewId, CharSequence className,
                                                   boolean passwordFlag) {
        if (passwordFlag) return true;
        String combined = String.join(" ", safe(text), safe(description), safe(viewId), safe(className))
            .toLowerCase(Locale.ROOT);
        for (String hint : PASSWORD_HINTS) {
            if (combined.contains(hint)) return true;
        }
        return false;
    }

    private static String safe(CharSequence value) {
        return value == null ? "" : value.toString();
    }
}
