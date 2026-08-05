package com.kod.app.agent;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public final class AgentPolicy {
    public static final String WECHAT = "wechat";
    public static final String QQ = "qq";

    private static final Map<String, String> ALLOWED_APPS;
    private static final Set<String> SENSITIVE_TERMS = Set.of(
        "支付", "付款", "转账", "红包", "提现", "验证码", "密码",
        "payment", "transfer", "password", "verification code"
    );

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
        return ALLOWED_APPS.containsValue(packageName);
    }

    public static boolean containsSensitiveTerm(CharSequence value) {
        if (value == null) return false;
        String normalized = value.toString().toLowerCase();
        for (String term : SENSITIVE_TERMS) {
            if (normalized.contains(term)) return true;
        }
        return false;
    }
}
