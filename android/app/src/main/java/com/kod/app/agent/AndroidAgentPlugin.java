package com.kod.app.agent;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "AndroidAgent")
public class AndroidAgentPlugin extends Plugin {
    static final int DEFAULT_BUDGET = 30;
    static final int MAX_BUDGET = 100;
    static final long DEFAULT_DEADLINE_MS = 5 * 60_000L;
    static final long MAX_DEADLINE_MS = 15 * 60_000L;
    static final long APPROVAL_TTL_MS = 30_000L;
    static final String PROTOCOL_VERSION = "p1";

    private final Object taskLock = new Object();
    private final SecureRandom secureRandom = new SecureRandom();
    private final Map<String, ApprovalGrant> approvals = new HashMap<>();
    private AgentTask activeTask;

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
        result.put("protocolVersion", PROTOCOL_VERSION);
        call.resolve(result);
    }

    @PluginMethod
    public void startTask(PluginCall call) {
        String appId = call.getString("appId");
        String packageName = AgentPolicy.packageForApp(appId);
        if (packageName == null) { reject(call, "APP_NOT_ALLOWED", "App is not allowed"); return; }
        String goal = call.getString("goal", "").trim();
        if (goal.isEmpty() || goal.length() > 500 || AgentPolicy.containsSensitiveTerm(goal)) {
            reject(call, "GOAL_BLOCKED", "Task goal is empty, too long, or sensitive"); return;
        }
        if (!isAccessibilityEnabled()) { reject(call, "ACCESSIBILITY_DISABLED", "Accessibility service is not enabled"); return; }
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
        if (intent == null) { reject(call, "APP_NOT_INSTALLED", "App is not installed"); return; }
        int budget = Math.min(Math.max(call.getInt("budget", DEFAULT_BUDGET), 1), MAX_BUDGET);
        long durationMs = Math.min(Math.max(call.getLong("durationMs", DEFAULT_DEADLINE_MS), 10_000L), MAX_DEADLINE_MS);
        synchronized (taskLock) {
            refreshTaskLocked();
            if (activeTask != null && !activeTask.isTerminal()) {
                reject(call, "TASK_ACTIVE", "Another Android agent task is active"); return;
            }
            approvals.clear();
            long now = System.currentTimeMillis();
            int generation = activeTask == null ? 1 : activeTask.generation() + 1;
            activeTask = new AgentTask(UUID.randomUUID().toString(), generation, appId, packageName, goal,
                TaskState.RUNNING, now, now + durationMs, budget, budget, null);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve(taskJson(activeTask));
    }

    @PluginMethod
    public void getTaskStatus(PluginCall call) {
        synchronized (taskLock) {
            refreshTaskLocked();
            if (activeTask == null) {
                JSObject result = new JSObject();
                result.put("state", TaskState.IDLE.value);
                result.put("protocolVersion", PROTOCOL_VERSION);
                call.resolve(result);
                return;
            }
            call.resolve(taskJson(activeTask));
        }
    }

    @PluginMethod public void pauseTask(PluginCall call) { updateTaskState(call, TaskState.RUNNING, TaskState.PAUSED); }
    @PluginMethod public void resumeTask(PluginCall call) { updateTaskState(call, TaskState.PAUSED, TaskState.RUNNING); }

    @PluginMethod
    public void stopTask(PluginCall call) {
        synchronized (taskLock) {
            AgentTask task = requireTask(call);
            if (task == null) return;
            activeTask = task.terminate(TaskState.STOPPED, "user_stopped");
            approvals.clear();
            call.resolve(taskJson(activeTask));
        }
    }

    @PluginMethod
    public void registerApproval(PluginCall call) {
        synchronized (taskLock) {
            AgentTask task = requireRunnableTask(call);
            if (task == null) return;
            int generation = call.getInt("generation", -1);
            String actionId = call.getString("actionId");
            String action = call.getString("action");
            String snapshotId = call.getString("snapshotId");
            if (generation != task.generation() || isBlank(actionId) || !isMutatingAction(action) || isBlank(snapshotId)) {
                reject(call, "APPROVAL_INVALID", "Approval does not match the active generation or action"); return;
            }
            String token = randomToken();
            long expiresAt = Math.min(System.currentTimeMillis() + APPROVAL_TTL_MS, task.deadlineAt());
            approvals.put(token, new ApprovalGrant(token, task.id(), generation, actionId, action, snapshotId, expiresAt));
            JSObject result = new JSObject();
            result.put("approvalToken", token);
            result.put("expiresAt", expiresAt);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void getAccessibilityStatus(PluginCall call) {
        JSObject result = new JSObject(); result.put("enabled", isAccessibilityEnabled()); call.resolve(result);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(intent); call.resolve();
    }

    @PluginMethod
    public void getOverlayStatus(PluginCall call) {
        call.resolve(overlayStatus());
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void startOverlayPet(PluginCall call) {
        if (!SuanbaoOverlayService.canDraw(getContext())) {
            reject(call, "OVERLAY_PERMISSION_REQUIRED", "Display over other apps permission is required"); return;
        }
        SuanbaoOverlayService.start(getContext());
        JSObject result = overlayStatus();
        result.put("running", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopOverlayPet(PluginCall call) {
        SuanbaoOverlayService.stop(getContext());
        JSObject result = overlayStatus();
        result.put("running", false);
        call.resolve(result);
    }

    private JSObject overlayStatus() {
        JSObject result = new JSObject();
        result.put("permissionGranted", SuanbaoOverlayService.canDraw(getContext()));
        result.put("running", SuanbaoOverlayService.isRunning(getContext()));
        return result;
    }

    @PluginMethod
    public void getForegroundApp(PluginCall call) {
        KodAccessibilityService service = requireService(call); if (service == null) return;
        JSObject result = new JSObject();
        result.put("packageName", service.getForegroundPackage());
        result.put("allowed", AgentPolicy.isAllowedPackage(service.getForegroundPackage())); call.resolve(result);
    }

    @PluginMethod
    public void readUiTree(PluginCall call) {
        ExecutionContext context = requireExecutionContext(call, "read", false); if (context == null) return;
        int limit = Math.min(Math.max(call.getInt("limit", 80), 1), 150);
        KodAccessibilityService.UiSnapshot snapshot = context.service().readVisibleNodes(context.task().packageName(), limit);
        if (!snapshot.success()) { terminateForContextChange(); reject(call, snapshot.errorCode(), snapshot.message()); return; }
        JSArray nodes = new JSArray();
        for (KodAccessibilityService.NodeSummary summary : snapshot.nodes()) {
            JSObject node = new JSObject(); node.put("text", summary.text()); node.put("description", summary.description());
            node.put("viewId", summary.viewId()); node.put("className", summary.className()); node.put("clickable", summary.clickable());
            node.put("editable", summary.editable()); node.put("scrollable", summary.scrollable()); nodes.put(node);
        }
        JSObject result = new JSObject(); result.put("packageName", context.task().packageName()); result.put("nodes", nodes);
        result.put("snapshotId", snapshot.snapshotId()); result.put("windowId", snapshot.windowId());
        result.put("generation", context.task().generation()); call.resolve(result);
    }

    @PluginMethod
    public void clickElement(PluginCall call) {
        ExecutionContext context = requireExecutionContext(call, "click", true); if (context == null) return;
        resolveAction(call, context, context.service().click(context.task().packageName(), call.getString("snapshotId"),
            call.getString("text"), call.getString("description"), call.getString("viewId")));
    }

    @PluginMethod
    public void inputText(PluginCall call) {
        ExecutionContext context = requireExecutionContext(call, "input", true); if (context == null) return;
        String value = call.getString("value");
        if (value == null || value.isEmpty() || value.length() > 500 || AgentPolicy.containsSensitiveTerm(value)) {
            reject(call, "INPUT_BLOCKED", "Input must contain 1-500 non-sensitive characters"); return;
        }
        resolveAction(call, context, context.service().inputText(context.task().packageName(), call.getString("snapshotId"), value,
            call.getString("text"), call.getString("description"), call.getString("viewId")));
    }

    @PluginMethod
    public void scroll(PluginCall call) {
        ExecutionContext context = requireExecutionContext(call, "scroll", true); if (context == null) return;
        resolveAction(call, context, context.service().scroll(context.task().packageName(), call.getString("snapshotId"),
            !"backward".equals(call.getString("direction"))));
    }

    @PluginMethod
    public void back(PluginCall call) {
        ExecutionContext context = requireExecutionContext(call, "back", true); if (context == null) return;
        resolveAction(call, context, context.service().back(context.task().packageName(), call.getString("snapshotId")));
    }

    private void updateTaskState(PluginCall call, TaskState expected, TaskState next) {
        synchronized (taskLock) {
            AgentTask task = requireTask(call); if (task == null) return;
            if (task.state() != expected) { reject(call, "INVALID_TRANSITION", "Task cannot transition to " + next.value); return; }
            activeTask = task.withState(next); call.resolve(taskJson(activeTask));
        }
    }

    private AgentTask requireTask(PluginCall call) {
        refreshTaskLocked();
        String taskId = call.getString("taskId");
        int generation = call.getInt("generation", activeTask == null ? -1 : activeTask.generation());
        if (activeTask == null || taskId == null || !activeTask.id().equals(taskId) || generation != activeTask.generation()) {
            reject(call, "TASK_NOT_FOUND", "Active task generation not found"); return null;
        }
        return activeTask;
    }

    private AgentTask requireRunnableTask(PluginCall call) {
        AgentTask task = requireTask(call); if (task == null) return null;
        if (task.state() != TaskState.RUNNING) { reject(call, "TASK_NOT_RUNNING", "Task is not running"); return null; }
        return task;
    }

    private ExecutionContext requireExecutionContext(PluginCall call, String action, boolean approvalRequired) {
        KodAccessibilityService service = requireService(call); if (service == null) return null;
        synchronized (taskLock) {
            AgentTask task = requireRunnableTask(call); if (task == null) return null;
            if (!AgentPolicy.isExpectedPackage(task.packageName(), service.getForegroundPackage())) {
                activeTask = task.terminate(TaskState.FAILED, "foreground_changed"); approvals.clear();
                reject(call, "FOREGROUND_CHANGED", "Foreground app does not match the active task"); return null;
            }
            String snapshotId = call.getString("snapshotId");
            if (approvalRequired && !consumeApprovalLocked(call, task, action, snapshotId)) return null;
            if (approvalRequired && task.remainingBudget() <= 0) {
                activeTask = task.terminate(TaskState.FAILED, "budget_exhausted"); approvals.clear();
                reject(call, "BUDGET_EXHAUSTED", "Action budget is exhausted"); return null;
            }
            return new ExecutionContext(task, service);
        }
    }

    private boolean consumeApprovalLocked(PluginCall call, AgentTask task, String action, String snapshotId) {
        String token = call.getString("approvalToken"); String actionId = call.getString("actionId");
        ApprovalGrant grant = token == null ? null : approvals.remove(token);
        long now = System.currentTimeMillis();
        if (grant == null || now > grant.expiresAt() || !grant.taskId().equals(task.id()) || grant.generation() != task.generation()
            || !grant.actionId().equals(actionId) || !grant.action().equals(action) || !grant.snapshotId().equals(snapshotId)) {
            reject(call, "APPROVAL_INVALID", "Approval token is absent, expired, consumed, or mismatched"); return false;
        }
        return true;
    }

    private void resolveAction(PluginCall call, ExecutionContext context, KodAccessibilityService.ActionResult action) {
        synchronized (taskLock) {
            if (activeTask == null || activeTask.generation() != context.task().generation()) {
                reject(call, "GENERATION_STALE", "Task generation changed during action"); return;
            }
            activeTask = activeTask.consumeBudget();
            if ("FOREGROUND_CHANGED".equals(action.errorCode()) || "SNAPSHOT_STALE".equals(action.errorCode())) {
                activeTask = activeTask.terminate(TaskState.FAILED,
                    "FOREGROUND_CHANGED".equals(action.errorCode()) ? "foreground_changed" : "snapshot_stale"); approvals.clear();
            } else if (activeTask.remainingBudget() == 0) {
                activeTask = activeTask.terminate(TaskState.FAILED, "budget_exhausted"); approvals.clear();
            }
            JSObject result = new JSObject(); result.put("success", action.success()); result.put("message", action.message());
            result.put("errorCode", action.errorCode()); result.put("matchCount", action.matchCount());
            result.put("remainingBudget", activeTask.remainingBudget()); result.put("state", activeTask.state().value);
            result.put("terminalReason", activeTask.terminalReason()); call.resolve(result);
        }
    }

    private KodAccessibilityService requireService(PluginCall call) {
        KodAccessibilityService service = KodAccessibilityService.getInstance();
        if (service == null) reject(call, "ACCESSIBILITY_DISABLED", "Accessibility service is not enabled"); return service;
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

    private void terminateForContextChange() {
        synchronized (taskLock) {
            if (activeTask != null && !activeTask.isTerminal()) activeTask = activeTask.terminate(TaskState.FAILED, "foreground_changed");
            approvals.clear();
        }
    }

    private void refreshTaskLocked() {
        if (activeTask == null || activeTask.isTerminal()) return;
        if (System.currentTimeMillis() > activeTask.deadlineAt()) {
            activeTask = activeTask.terminate(TaskState.FAILED, "deadline_exceeded"); approvals.clear(); return;
        }
        KodAccessibilityService service = KodAccessibilityService.getInstance();
        if (service != null && service.getForegroundPackage() != null
            && !AgentPolicy.isExpectedPackage(activeTask.packageName(), service.getForegroundPackage())) {
            activeTask = activeTask.terminate(TaskState.FAILED, "foreground_changed"); approvals.clear();
        }
    }

    private JSObject taskJson(AgentTask task) {
        JSObject result = new JSObject(); result.put("taskId", task.id()); result.put("generation", task.generation());
        result.put("appId", task.appId()); result.put("packageName", task.packageName()); result.put("goal", task.goal());
        result.put("state", task.state().value); result.put("startedAt", task.startedAt()); result.put("deadlineAt", task.deadlineAt());
        result.put("budget", task.budget()); result.put("remainingBudget", task.remainingBudget());
        result.put("terminalReason", task.terminalReason()); result.put("protocolVersion", PROTOCOL_VERSION); return result;
    }

    private String randomToken() {
        byte[] bytes = new byte[32]; secureRandom.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static boolean isMutatingAction(String action) { return "click".equals(action) || "input".equals(action) || "scroll".equals(action) || "back".equals(action); }
    private static boolean isBlank(String value) { return value == null || value.isBlank(); }
    private static void reject(PluginCall call, String code, String message) { call.reject(code + ": " + message, code); }

    private enum TaskState {
        IDLE("idle"), RUNNING("running"), PAUSED("paused"), STOPPED("stopped"), FAILED("failed");
        private final String value; TaskState(String value) { this.value = value; }
    }

    private record AgentTask(String id, int generation, String appId, String packageName, String goal, TaskState state,
                             long startedAt, long deadlineAt, int budget, int remainingBudget, String terminalReason) {
        AgentTask withState(TaskState next) { return new AgentTask(id, generation, appId, packageName, goal, next, startedAt, deadlineAt, budget, remainingBudget, terminalReason); }
        AgentTask consumeBudget() { return new AgentTask(id, generation, appId, packageName, goal, state, startedAt, deadlineAt, budget, Math.max(0, remainingBudget - 1), terminalReason); }
        AgentTask terminate(TaskState terminal, String reason) { return new AgentTask(id, generation, appId, packageName, goal, terminal, startedAt, deadlineAt, budget, remainingBudget, reason); }
        boolean isTerminal() { return state == TaskState.STOPPED || state == TaskState.FAILED; }
    }

    private record ApprovalGrant(String token, String taskId, int generation, String actionId, String action,
                                 String snapshotId, long expiresAt) {}
    private record ExecutionContext(AgentTask task, KodAccessibilityService service) {}
}
