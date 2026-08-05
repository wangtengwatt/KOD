package com.kod.app.agent;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

public class KodAccessibilityService extends AccessibilityService {
    private static KodAccessibilityService instance;
    private String foregroundPackage;

    public static KodAccessibilityService getInstance() {
        return instance;
    }

    public String getForegroundPackage() {
        return foregroundPackage;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        AccessibilityServiceInfo info = getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        setServiceInfo(info);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        CharSequence packageName = event.getPackageName();
        foregroundPackage = packageName == null ? null : packageName.toString();
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    public List<NodeSummary> readVisibleNodes(int limit) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !AgentPolicy.isAllowedPackage(foregroundPackage)) return List.of();

        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        List<NodeSummary> nodes = new ArrayList<>();
        queue.add(root);
        while (!queue.isEmpty() && nodes.size() < limit) {
            AccessibilityNodeInfo node = queue.removeFirst();
            CharSequence text = node.getText();
            CharSequence description = node.getContentDescription();
            if (!AgentPolicy.containsSensitiveTerm(text) && !AgentPolicy.containsSensitiveTerm(description)) {
                nodes.add(new NodeSummary(
                    safe(text),
                    safe(description),
                    safe(node.getViewIdResourceName()),
                    safe(node.getClassName()),
                    node.isClickable(),
                    node.isEditable(),
                    node.isScrollable()
                ));
            }
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return nodes;
    }

    public ActionResult click(String text, String description, String viewId) {
        List<AccessibilityNodeInfo> matches = findMatches(text, description, viewId);
        if (matches.size() != 1) return new ActionResult(false, "Expected exactly one matching node", matches.size());
        AccessibilityNodeInfo target = matches.get(0);
        if (AgentPolicy.containsSensitiveTerm(target.getText()) || AgentPolicy.containsSensitiveTerm(target.getContentDescription())) {
            return new ActionResult(false, "Sensitive target blocked", 1);
        }
        AccessibilityNodeInfo clickable = target;
        while (clickable != null && !clickable.isClickable()) clickable = clickable.getParent();
        boolean success = clickable != null && clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        return new ActionResult(success, success ? "Clicked" : "Target is not clickable", 1);
    }

    public ActionResult inputText(String text, String selectorText, String description, String viewId) {
        if (AgentPolicy.containsSensitiveTerm(text)) return new ActionResult(false, "Sensitive input blocked", 0);
        List<AccessibilityNodeInfo> matches = findMatches(selectorText, description, viewId);
        if (matches.size() != 1) return new ActionResult(false, "Expected exactly one matching node", matches.size());
        AccessibilityNodeInfo node = matches.get(0);
        if (!node.isEditable()) return new ActionResult(false, "Target is not editable", 1);
        Bundle arguments = new Bundle();
        arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        boolean success = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments);
        return new ActionResult(success, success ? "Text entered" : "Text input failed", 1);
    }

    public boolean scroll(boolean forward) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !AgentPolicy.isAllowedPackage(foregroundPackage)) return false;
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.removeFirst();
            if (node.isScrollable()) {
                int action = forward ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
                if (node.performAction(action)) return true;
            }
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return false;
    }

    public boolean back() {
        return performGlobalAction(GLOBAL_ACTION_BACK);
    }

    private List<AccessibilityNodeInfo> findMatches(String text, String description, String viewId) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !AgentPolicy.isAllowedPackage(foregroundPackage)) return List.of();
        List<AccessibilityNodeInfo> matches = new ArrayList<>();
        if (viewId != null && !viewId.isBlank()) matches.addAll(root.findAccessibilityNodeInfosByViewId(viewId));
        if (text != null && !text.isBlank()) {
            for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText(text)) {
                if (text.contentEquals(node.getText())) matches.add(node);
            }
        }
        if (description != null && !description.isBlank()) collectDescriptionMatches(root, description, matches);
        return matches.stream().distinct().toList();
    }

    private void collectDescriptionMatches(AccessibilityNodeInfo node, String description, List<AccessibilityNodeInfo> matches) {
        if (description.contentEquals(node.getContentDescription())) matches.add(node);
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) collectDescriptionMatches(child, description, matches);
        }
    }

    private static String safe(CharSequence value) {
        if (value == null) return "";
        String text = value.toString();
        return text.length() > 120 ? text.substring(0, 120) : text;
    }

    public record NodeSummary(String text, String description, String viewId, String className,
                              boolean clickable, boolean editable, boolean scrollable) {}
    public record ActionResult(boolean success, String message, int matchCount) {}
}
