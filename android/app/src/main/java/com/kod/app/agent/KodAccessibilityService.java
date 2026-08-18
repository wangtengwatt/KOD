package com.kod.app.agent;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.os.Bundle;
import android.text.InputType;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public class KodAccessibilityService extends AccessibilityService {
    private static volatile KodAccessibilityService instance;
    private volatile String foregroundPackage;
    private volatile SnapshotBinding latestSnapshot;

    public static KodAccessibilityService getInstance() { return instance; }
    public String getForegroundPackage() { return foregroundPackage; }

    @Override protected void onServiceConnected() {
        super.onServiceConnected(); instance = this;
        AccessibilityServiceInfo info = getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        setServiceInfo(info);
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        CharSequence packageName = event.getPackageName();
        String next = packageName == null ? null : packageName.toString();
        if (next == null || !next.equals(foregroundPackage) || event.getWindowId() != snapshotWindowId()) latestSnapshot = null;
        foregroundPackage = next;
    }

    @Override public void onInterrupt() {}
    @Override public void onDestroy() { if (instance == this) instance = null; latestSnapshot = null; super.onDestroy(); }

    public UiSnapshot readVisibleNodes(String expectedPackage, int limit) {
        AccessibilityNodeInfo root = requireSafeRoot(expectedPackage);
        if (root == null) return new UiSnapshot(false, "FOREGROUND_CHANGED", "Active root is unavailable or changed", null, -1, Collections.emptyList());
        String snapshotId = UUID.randomUUID().toString();
        int windowId = root.getWindowId();
        latestSnapshot = new SnapshotBinding(snapshotId, expectedPackage, windowId);
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        List<NodeSummary> nodes = new ArrayList<>(); queue.add(root);
        while (!queue.isEmpty() && nodes.size() < limit) {
            AccessibilityNodeInfo node = queue.removeFirst();
            if (!isSensitiveNode(node)) {
                nodes.add(new NodeSummary(safe(node.getText()), safe(node.getContentDescription()), safe(node.getViewIdResourceName()),
                    safe(node.getClassName()), node.isClickable(), node.isEditable(), node.isScrollable()));
            }
            addChildren(node, queue);
        }
        return new UiSnapshot(true, null, "UI read", snapshotId, windowId, nodes);
    }

    public ActionResult click(String expectedPackage, String snapshotId, String text, String description, String viewId) {
        AccessibilityNodeInfo root = requireBoundRoot(expectedPackage, snapshotId);
        if (root == null) return staleResult(expectedPackage);
        List<AccessibilityNodeInfo> matches = findMatches(root, text, description, viewId);
        if (matches.size() != 1) return result(false, "SELECTOR_MATCH_COUNT", "Expected exactly one matching node", matches.size());
        AccessibilityNodeInfo target = matches.get(0);
        if (isSensitiveNode(target)) return result(false, "SENSITIVE_TARGET", "Sensitive target blocked", 1);
        AccessibilityNodeInfo clickable = target;
        while (clickable != null && !clickable.isClickable()) {
            if (isSensitiveNode(clickable)) return result(false, "SENSITIVE_TARGET", "Sensitive target blocked", 1);
            clickable = clickable.getParent();
        }
        if (requireBoundRoot(expectedPackage, snapshotId) == null) return staleResult(expectedPackage);
        boolean success = clickable != null && clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        return result(success, success ? null : "ACTION_FAILED", success ? "Clicked" : "Target is not clickable", 1);
    }

    public ActionResult inputText(String expectedPackage, String snapshotId, String text, String selectorText,
                                  String description, String viewId) {
        if (AgentPolicy.containsSensitiveTerm(text)) return result(false, "INPUT_BLOCKED", "Sensitive input blocked", 0);
        AccessibilityNodeInfo root = requireBoundRoot(expectedPackage, snapshotId);
        if (root == null) return staleResult(expectedPackage);
        List<AccessibilityNodeInfo> matches = findMatches(root, selectorText, description, viewId);
        if (matches.size() != 1) return result(false, "SELECTOR_MATCH_COUNT", "Expected exactly one matching node", matches.size());
        AccessibilityNodeInfo node = matches.get(0);
        if (isPasswordNode(node)) return result(false, "PASSWORD_TARGET", "Password input blocked", 1);
        if (!node.isEditable()) return result(false, "NOT_EDITABLE", "Target is not editable", 1);
        if (requireBoundRoot(expectedPackage, snapshotId) == null) return staleResult(expectedPackage);
        Bundle arguments = new Bundle();
        arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        boolean success = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments);
        return result(success, success ? null : "ACTION_FAILED", success ? "Text entered" : "Text input failed", 1);
    }

    public ActionResult scroll(String expectedPackage, String snapshotId, boolean forward) {
        AccessibilityNodeInfo root = requireBoundRoot(expectedPackage, snapshotId);
        if (root == null) return staleResult(expectedPackage);
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>(); queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.removeFirst();
            if (node.isScrollable() && !isSensitiveNode(node)) {
                if (requireBoundRoot(expectedPackage, snapshotId) == null) return staleResult(expectedPackage);
                int action = forward ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
                if (node.performAction(action)) { latestSnapshot = null; return result(true, null, "Scrolled", 1); }
            }
            addChildren(node, queue);
        }
        return result(false, "NO_SCROLL_TARGET", "No scrollable target", 0);
    }

    public ActionResult back(String expectedPackage, String snapshotId) {
        if (requireBoundRoot(expectedPackage, snapshotId) == null) return staleResult(expectedPackage);
        boolean success = performGlobalAction(GLOBAL_ACTION_BACK); latestSnapshot = null;
        return result(success, success ? null : "ACTION_FAILED", success ? "Back performed" : "Back failed", 0);
    }

    private AccessibilityNodeInfo requireSafeRoot(String expectedPackage) {
        if (!AgentPolicy.isExpectedPackage(expectedPackage, foregroundPackage)) return null;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !expectedPackage.equals(root.getPackageName().toString())) return null;
        return root;
    }

    private AccessibilityNodeInfo requireBoundRoot(String expectedPackage, String snapshotId) {
        SnapshotBinding binding = latestSnapshot;
        if (binding == null || snapshotId == null || !binding.snapshotId().equals(snapshotId)
            || !binding.packageName().equals(expectedPackage)) return null;
        AccessibilityNodeInfo root = requireSafeRoot(expectedPackage);
        if (root == null || root.getWindowId() != binding.windowId()) return null;
        return root;
    }

    private ActionResult staleResult(String expectedPackage) {
        boolean foregroundChanged = !AgentPolicy.isExpectedPackage(expectedPackage, foregroundPackage);
        return result(false, foregroundChanged ? "FOREGROUND_CHANGED" : "SNAPSHOT_STALE",
            foregroundChanged ? "Foreground package changed" : "Snapshot or active window changed", 0);
    }

    private List<AccessibilityNodeInfo> findMatches(AccessibilityNodeInfo root, String text, String description, String viewId) {
        List<AccessibilityNodeInfo> candidates = new ArrayList<>();
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>(); queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.removeFirst();
            if (matchesSelector(node, text, description, viewId)) candidates.add(node);
            addChildren(node, queue);
        }
        return candidates;
    }

    static boolean matchesValues(String actualText, String actualDescription, String actualViewId,
                                 String text, String description, String viewId) {
        boolean hasSelector = !blank(text) || !blank(description) || !blank(viewId);
        return hasSelector && (blank(text) || text.equals(actualText))
            && (blank(description) || description.equals(actualDescription))
            && (blank(viewId) || viewId.equals(actualViewId));
    }

    private static boolean matchesSelector(AccessibilityNodeInfo node, String text, String description, String viewId) {
        return matchesValues(safe(node.getText()), safe(node.getContentDescription()), safe(node.getViewIdResourceName()), text, description, viewId);
    }

    private int snapshotWindowId() { SnapshotBinding binding = latestSnapshot; return binding == null ? -1 : binding.windowId(); }
    private static boolean blank(String value) { return value == null || value.trim().isEmpty(); }
    private static ActionResult result(boolean success, String code, String message, int count) { return new ActionResult(success, code, message, count); }
    private static void addChildren(AccessibilityNodeInfo node, ArrayDeque<AccessibilityNodeInfo> queue) {
        for (int i = 0; i < node.getChildCount(); i++) { AccessibilityNodeInfo child = node.getChild(i); if (child != null) queue.addLast(child); }
    }
    private static boolean isSensitiveNode(AccessibilityNodeInfo node) {
        return AgentPolicy.containsSensitiveTerm(node.getText()) || AgentPolicy.containsSensitiveTerm(node.getContentDescription()) || isPasswordNode(node);
    }
    private static boolean isPasswordNode(AccessibilityNodeInfo node) {
        int inputType = node.getInputType();
        boolean passwordInput = (inputType & InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0
            || (inputType & InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD) != 0
            || (inputType & InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD) != 0
            || (inputType & InputType.TYPE_NUMBER_VARIATION_PASSWORD) != 0;
        return AgentPolicy.looksLikePasswordTarget(node.getText(), node.getContentDescription(), node.getViewIdResourceName(),
            node.getClassName(), node.isPassword() || passwordInput);
    }
    private static String safe(CharSequence value) {
        if (value == null) return ""; String text = value.toString(); return text.length() > 120 ? text.substring(0, 120) : text;
    }

    private record SnapshotBinding(String snapshotId, String packageName, int windowId) {}
    public record UiSnapshot(boolean success, String errorCode, String message, String snapshotId, int windowId, List<NodeSummary> nodes) {}
    public record NodeSummary(String text, String description, String viewId, String className, boolean clickable, boolean editable, boolean scrollable) {}
    public record ActionResult(boolean success, String errorCode, String message, int matchCount) {}
}
