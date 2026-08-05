package com.kod.app.agent;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidAgent")
public class AndroidAgentPlugin extends Plugin {
    @PluginMethod
    public void listAllowedApps(PluginCall call) {
        PackageManager manager = getContext().getPackageManager();
        JSArray apps = new JSArray();
        AgentPolicy.allowedApps().forEach((id, packageName) -> {
            JSObject app = new JSObject();
            app.put("id", id);
            app.put("packageName", packageName);
            app.put("installed", manager.getLaunchIntentForPackage(packageName) != null);
            apps.put(app);
        });
        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String appId = call.getString("appId");
        String packageName = AgentPolicy.packageForApp(appId);
        if (packageName == null) {
            call.reject("App is not allowed");
            return;
        }
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
        if (intent == null) {
            call.reject("App is not installed");
            return;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getAccessibilityStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", isAccessibilityEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getForegroundApp(PluginCall call) {
        KodAccessibilityService service = requireService(call);
        if (service == null) return;
        JSObject result = new JSObject();
        result.put("packageName", service.getForegroundPackage());
        result.put("allowed", AgentPolicy.isAllowedPackage(service.getForegroundPackage()));
        call.resolve(result);
    }

    @PluginMethod
    public void readUiTree(PluginCall call) {
        KodAccessibilityService service = requireAllowedForeground(call);
        if (service == null) return;
        int limit = Math.min(Math.max(call.getInt("limit", 80), 1), 150);
        JSArray nodes = new JSArray();
        for (KodAccessibilityService.NodeSummary summary : service.readVisibleNodes(limit)) {
            JSObject node = new JSObject();
            node.put("text", summary.text());
            node.put("description", summary.description());
            node.put("viewId", summary.viewId());
            node.put("className", summary.className());
            node.put("clickable", summary.clickable());
            node.put("editable", summary.editable());
            node.put("scrollable", summary.scrollable());
            nodes.put(node);
        }
        JSObject result = new JSObject();
        result.put("packageName", service.getForegroundPackage());
        result.put("nodes", nodes);
        call.resolve(result);
    }

    @PluginMethod
    public void clickElement(PluginCall call) {
        KodAccessibilityService service = requireAllowedForeground(call);
        if (service == null) return;
        resolveAction(call, service.click(call.getString("text"), call.getString("description"), call.getString("viewId")));
    }

    @PluginMethod
    public void inputText(PluginCall call) {
        KodAccessibilityService service = requireAllowedForeground(call);
        if (service == null) return;
        String value = call.getString("value");
        if (value == null || value.length() > 500) {
            call.reject("Input must contain 1-500 characters");
            return;
        }
        resolveAction(call, service.inputText(value, call.getString("text"), call.getString("description"), call.getString("viewId")));
    }

    @PluginMethod
    public void scroll(PluginCall call) {
        KodAccessibilityService service = requireAllowedForeground(call);
        if (service == null) return;
        boolean success = service.scroll(!"backward".equals(call.getString("direction")));
        JSObject result = new JSObject();
        result.put("success", success);
        call.resolve(result);
    }

    @PluginMethod
    public void back(PluginCall call) {
        KodAccessibilityService service = requireService(call);
        if (service == null) return;
        JSObject result = new JSObject();
        result.put("success", service.back());
        call.resolve(result);
    }

    private void resolveAction(PluginCall call, KodAccessibilityService.ActionResult action) {
        JSObject result = new JSObject();
        result.put("success", action.success());
        result.put("message", action.message());
        result.put("matchCount", action.matchCount());
        call.resolve(result);
    }

    private KodAccessibilityService requireService(PluginCall call) {
        KodAccessibilityService service = KodAccessibilityService.getInstance();
        if (service == null) call.reject("Accessibility service is not enabled");
        return service;
    }

    private KodAccessibilityService requireAllowedForeground(PluginCall call) {
        KodAccessibilityService service = requireService(call);
        if (service != null && !AgentPolicy.isAllowedPackage(service.getForegroundPackage())) {
            call.reject("Foreground app is not allowed");
            return null;
        }
        return service;
    }

    private boolean isAccessibilityEnabled() {
        int enabled = Settings.Secure.getInt(getContext().getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 0);
        if (enabled != 1) return false;
        String expected = new ComponentName(getContext(), KodAccessibilityService.class).flattenToString();
        String services = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (services == null) return false;
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(services);
        while (splitter.hasNext()) {
            if (expected.equalsIgnoreCase(splitter.next())) return true;
        }
        return false;
    }
}
