package com.kod.app.agent;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AgentPolicyTest {
    @Test
    public void allowsOnlyConfiguredPackages() {
        assertTrue(AgentPolicy.isAllowedPackage("com.tencent.mm"));
        assertTrue(AgentPolicy.isExpectedPackage("com.tencent.mobileqq", "com.tencent.mobileqq"));
        assertFalse(AgentPolicy.isExpectedPackage("com.tencent.mm", "com.tencent.mobileqq"));
        assertFalse(AgentPolicy.isAllowedPackage("com.example.other"));
    }

    @Test
    public void blocksSensitiveTextAndPasswordTargets() {
        assertTrue(AgentPolicy.containsSensitiveTerm("请输入验证码"));
        assertTrue(AgentPolicy.containsSensitiveTerm("Confirm transfer"));
        assertFalse(AgentPolicy.containsSensitiveTerm("给测试联系人发消息"));
        assertTrue(AgentPolicy.looksLikePasswordTarget("", "", "login_password", "EditText", false));
        assertTrue(AgentPolicy.looksLikePasswordTarget("", "", "", "EditText", true));
    }

    @Test
    public void selectorUsesAndSemanticsAndRejectsEmptySelectors() {
        assertTrue(KodAccessibilityService.matchesValues("发送", "send", "composer.send", "发送", null, "composer.send"));
        assertFalse(KodAccessibilityService.matchesValues("发送", "send", "composer.send", "发送", "other", null));
        assertFalse(KodAccessibilityService.matchesValues("发送", "send", "composer.send", null, null, null));
    }

    @Test
    public void mutatingApprovalActionsAreClosedSet() {
        assertTrue(AndroidAgentPlugin.isMutatingAction("click"));
        assertTrue(AndroidAgentPlugin.isMutatingAction("input"));
        assertTrue(AndroidAgentPlugin.isMutatingAction("scroll"));
        assertTrue(AndroidAgentPlugin.isMutatingAction("back"));
        assertFalse(AndroidAgentPlugin.isMutatingAction("send"));
        assertFalse(AndroidAgentPlugin.isMutatingAction("shell"));
    }
}
