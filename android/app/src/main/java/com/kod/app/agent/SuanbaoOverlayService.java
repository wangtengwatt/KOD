package com.kod.app.agent;

import android.animation.ValueAnimator;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import com.kod.app.MainActivity;
import com.kod.app.R;

public class SuanbaoOverlayService extends Service {
    private static final String CHANNEL_ID = "suanbao_overlay";
    private static final int NOTIFICATION_ID = 2206;
    private static final String PREFS = "suanbao_overlay";
    private static final String ACTION_STOP = "com.kod.app.agent.STOP_SUANBAO_OVERLAY";
    private static final int POSITION_SCHEMA = 2;
    private static final int BUBBLE_DP = 36;

    private static volatile boolean visible;
    private static volatile String lifecycleState = "stopped";
    private static volatile String interactionState = "idle";
    private static volatile String lastError;
    private static volatile String assistantState = "idle";
    private static volatile String lastMessage;
    private static volatile SuanbaoOverlayService instance;

    private WindowManager windowManager;
    private View overlayView;
    private View menuView;
    private ImageView mascotView;
    private TextView bubbleView;
    private final Runnable hideBubbleRunnable = this::hideBubble;
    private WindowManager.LayoutParams layoutParams;
    private WindowManager.LayoutParams menuLayoutParams;
    private ValueAnimator snapAnimator;
    private ValueAnimator floatAnimator;
    private SuanbaoOverlayPreferences preferences;
    private SuanbaoOverlayPreferences.Snapshot appearance;
    private float floatPhase;
    private long lastFloatMs;
    private boolean userInteracting;

    public static boolean canDraw(android.content.Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    public static void start(android.content.Context context) {
        Intent intent = new Intent(context, SuanbaoOverlayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void stop(android.content.Context context) {
        context.stopService(new Intent(context, SuanbaoOverlayService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        lifecycleState = "starting";
        interactionState = "idle";
        lastError = null;
        preferences = new SuanbaoOverlayPreferences(this);
        appearance = preferences.get();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        if (canDraw(this)) showOverlay();
        else stopSelf();
    }

    private void startFloating() {
        if (SuanbaoOverlayPreferences.MOTION_OFF.equals(appearance.motion())) return;
        stopFloating();
        lastFloatMs = System.currentTimeMillis();
        floatAnimator = ValueAnimator.ofFloat(0f, 1f);
        floatAnimator.setDuration(SuanbaoOverlayPreferences.MOTION_REDUCED.equals(appearance.motion()) ? 4000 : 2600);
        floatAnimator.setRepeatCount(ValueAnimator.INFINITE);
        floatAnimator.setInterpolator(new android.view.animation.LinearInterpolator());
        floatAnimator.addUpdateListener(animation -> {
            if (userInteracting || overlayView == null || mascotView == null) return;
            long now = System.currentTimeMillis();
            floatPhase += (now - lastFloatMs) / 1000f * 2f;
            lastFloatMs = now;
            float bob = (float) Math.sin(floatPhase) * dp(2);
            mascotView.setTranslationY(bob);
            if ("thinking".equals(assistantState)) mascotView.setTranslationX((float) Math.sin(floatPhase * 0.7f) * dp(1));
        });
        floatAnimator.start();
    }

    private void stopFloating() {
        if (floatAnimator != null) {
            floatAnimator.cancel();
            floatAnimator = null;
        }
        if (mascotView != null) {
            mascotView.setTranslationX(0f);
            mascotView.setTranslationY(0f);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && "com.kod.app.agent.REFRESH_SUANBAO_OVERLAY".equals(intent.getAction())) {
            refreshAppearance();
            return START_STICKY;
        }
        if (overlayView == null && canDraw(this)) showOverlay();
        return START_STICKY;
    }

    private void showOverlay() {
        if (overlayView != null) return;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        FrameLayout root = new FrameLayout(this);
        root.setPadding(dp(3), dp(3), dp(3), dp(3));
        root.setContentDescription("蒜宝桌宠，点击打开菜单，拖动调整位置");

        int visibleWidth = dp(SuanbaoOverlayPreferences.visibleWidthDp(appearance.size()));
        int visibleHeight = dp(SuanbaoOverlayPreferences.visibleHeightDp(appearance.size()));

        bubbleView = new TextView(this);
        bubbleView.setVisibility(View.GONE);
        bubbleView.setTextSize(12);
        bubbleView.setGravity(Gravity.CENTER);
        bubbleView.setPadding(dp(10), dp(6), dp(10), dp(6));
        bubbleView.setMaxWidth(dp(150));
        bubbleView.setBackground(bubbleBackground(assistantState));
        root.addView(bubbleView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL | Gravity.TOP));

        mascotView = new ImageView(this);
        updateMascotImage();
        mascotView.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        mascotView.setAlpha(appearance.opacity());
        root.addView(mascotView, new FrameLayout.LayoutParams(visibleWidth, visibleHeight, Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM));

        layoutParams = createLayoutParams(visibleWidth + dp(6), visibleHeight + dp(6), false);
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        overlayView = root;
        restorePosition();
        root.setOnTouchListener(new PetTouchListener());
        if (lastMessage != null) updateBubbleInternal();

        try {
            windowManager.addView(overlayView, layoutParams);
            visible = true;
            lifecycleState = "visible";
            lastError = null;
            setRunning(true);
            startFloating();
            sendStateChanged();
        } catch (RuntimeException error) {
            overlayView = null;
            visible = false;
            lifecycleState = "error";
            lastError = error.getClass().getSimpleName();
            setRunning(false);
            sendStateChanged();
            stopSelf();
        }
    }

    private WindowManager.LayoutParams createLayoutParams(int width, int height, boolean focusable) {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        int flags = focusable
            ? WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            : WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        return new WindowManager.LayoutParams(width, height, type, flags, PixelFormat.TRANSLUCENT);
    }

    private final class PetTouchListener implements View.OnTouchListener {
        private final int touchSlop = ViewConfiguration.get(SuanbaoOverlayService.this).getScaledTouchSlop();
        private int activePointerId = MotionEvent.INVALID_POINTER_ID;
        private int startX;
        private int startY;
        private float touchX;
        private float touchY;
        private boolean dragging;
        private boolean pointerDown;
        private boolean longPressed;
        private final Runnable longPress = () -> {
            if (!dragging && pointerDown) {
                longPressed = true;
                overlayView.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                showMenu(true);
            }
        };

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    userInteracting = true;
                    stopFloating();
                    if (appearance.positionLocked()) {
                        showMenu(false);
                        return true;
                    }
                    cancelSnap();
                    hideMenu();
                    activePointerId = event.getPointerId(0);
                    startX = layoutParams.x;
                    startY = layoutParams.y;
                    touchX = event.getRawX();
                    touchY = event.getRawY();
                    dragging = false;
                    pointerDown = true;
                    longPressed = false;
                    interactionState = "pressed";
                    sendStateChanged();
                    if (!SuanbaoOverlayPreferences.MOTION_OFF.equals(appearance.motion())) {
                        mascotView.animate().scaleX(1.06f).scaleY(1.06f).alpha(Math.max(0.5f, appearance.opacity() - 0.15f)).setDuration(100).start();
                    }
                    view.postDelayed(longPress, ViewConfiguration.getLongPressTimeout());
                    return true;
                case MotionEvent.ACTION_MOVE:
                    int pointerIndex = event.findPointerIndex(activePointerId);
                    if (pointerIndex < 0) return false;
                    int dx = Math.round(event.getRawX() - touchX);
                    int dy = Math.round(event.getRawY() - touchY);
                    if (!dragging && (Math.abs(dx) > touchSlop || Math.abs(dy) > touchSlop)) {
                        dragging = true;
                        interactionState = "dragging";
                        sendStateChanged();
                        view.removeCallbacks(longPress);
                        view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
                    }
                    if (dragging) moveTo(startX + dx, startY + dy);
                    return true;
                case MotionEvent.ACTION_UP:
                    view.removeCallbacks(longPress);
                    pointerDown = false;
                    userInteracting = false;
                    restoreMascotFeedback();
                    startFloating();
                    if (dragging) {
                        if (appearance.edgeSnap()) snapToNearestEdge();
                        else { persistPosition(); interactionState = "idle"; sendStateChanged(); }
                    }
                    else if (!longPressed) showMenu(false);
                    activePointerId = MotionEvent.INVALID_POINTER_ID;
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    view.removeCallbacks(longPress);
                    pointerDown = false;
                    userInteracting = false;
                    restoreMascotFeedback();
                    startFloating();
                    if (dragging) {
                        if (appearance.edgeSnap()) snapToNearestEdge();
                        else { persistPosition(); interactionState = "idle"; sendStateChanged(); }
                    }
                    activePointerId = MotionEvent.INVALID_POINTER_ID;
                    return true;
                default:
                    return false;
            }
        }
    }

    private void updateMascotImage() {
        if (mascotView == null) return;
        if ("thinking".equals(assistantState)) {
            mascotView.setImageResource(R.drawable.suanbao_thinking);
        } else {
            mascotView.setImageResource(R.drawable.suanbao_mascot);
        }
    }

    private void refreshAppearance() {
        if (preferences == null) preferences = new SuanbaoOverlayPreferences(this);
        appearance = preferences.get();
        if (overlayView == null || mascotView == null) { sendStateChanged(); return; }
        int width = dp(SuanbaoOverlayPreferences.visibleWidthDp(appearance.size()));
        int height = dp(SuanbaoOverlayPreferences.visibleHeightDp(appearance.size()));
        FrameLayout.LayoutParams mascotParams = new FrameLayout.LayoutParams(width, height, Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM);
        mascotView.setLayoutParams(mascotParams);
        mascotView.setAlpha(appearance.opacity());
        layoutParams.width = width + dp(6);
        layoutParams.height = height + dp(6);
        if (bubbleView != null && bubbleView.getVisibility() == View.VISIBLE) layoutParams.height += dp(BUBBLE_DP);
        moveTo(layoutParams.x, layoutParams.y);
        sendStateChanged();
    }

    public static void setAssistantState(android.content.Context context, String state, String message) {
        assistantState = state == null ? "idle" : state;
        lastMessage = message == null ? null : message.trim();
        SuanbaoOverlayService service = instance;
        if (service != null) service.postBubbleUpdate();
        else if (visible) {
            Intent intent = new Intent(context, SuanbaoOverlayService.class).setAction("com.kod.app.agent.REFRESH_SUANBAO_OVERLAY");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
        }
    }

    private void postBubbleUpdate() {
        if (overlayView != null) overlayView.post(() -> {
            updateMascotImage();
            updateBubbleInternal();
        });
    }

    public static String assistantState() { return assistantState; }
    public static String lastMessage() { return lastMessage; }

    private void updateBubbleInternal() {
        if (bubbleView == null || overlayView == null) return;
        boolean show = lastMessage != null && !lastMessage.isEmpty() && !"idle".equals(assistantState);
        boolean visibleNow = bubbleView.getVisibility() == View.VISIBLE;
        overlayView.removeCallbacks(hideBubbleRunnable);
        if (!show) {
            if (visibleNow) {
                bubbleView.setVisibility(View.GONE);
                layoutParams.height -= dp(BUBBLE_DP);
                layoutParams.y += dp(BUBBLE_DP);
                applyLayoutAndClamp();
            }
            sendStateChanged();
            return;
        }
        bubbleView.setText(lastMessage);
        bubbleView.setTextColor(bubbleTextColor(assistantState));
        bubbleView.setBackground(bubbleBackground(assistantState));
        if (!visibleNow) {
            bubbleView.setVisibility(View.VISIBLE);
            layoutParams.height += dp(BUBBLE_DP);
            layoutParams.y -= dp(BUBBLE_DP);
            applyLayoutAndClamp();
        }
        if ("success".equals(assistantState) || "error".equals(assistantState)) {
            overlayView.postDelayed(hideBubbleRunnable, 3500);
        }
        sendStateChanged();
    }

    private void hideBubble() {
        if (bubbleView == null) return;
        lastMessage = null;
        updateBubbleInternal();
    }

    private void applyLayoutAndClamp() {
        SuanbaoOverlayGeometry.Point point = SuanbaoOverlayGeometry.clamp(
            new SuanbaoOverlayGeometry.Point(layoutParams.x, layoutParams.y), safeBounds(layoutParams.width, layoutParams.height));
        layoutParams.x = point.x();
        layoutParams.y = point.y();
        try { windowManager.updateViewLayout(overlayView, layoutParams); } catch (RuntimeException ignored) {}
    }

    private GradientDrawable bubbleBackground(String state) {
        GradientDrawable background = new GradientDrawable();
        background.setCornerRadius(dp(10));
        background.setStroke(dp(1), bubbleStrokeColor(state));
        background.setColor(bubbleFillColor(state));
        background.setAlpha(240);
        return background;
    }

    private int bubbleFillColor(String state) {
        switch (state == null ? "" : state) {
            case "success": return 0xFFE6F4EA;
            case "error": return 0xFFFDECEA;
            case "waitingApproval": return 0xFFFFF4E5;
            case "thinking": return 0xFFF1F3F5;
            default: return 0xFFFFFFFF;
        }
    }

    private int bubbleStrokeColor(String state) {
        switch (state == null ? "" : state) {
            case "success": return 0xFF4CAF7D;
            case "error": return 0xFFEF8A82;
            case "waitingApproval": return 0xFFE6A23C;
            case "thinking": return 0xFFADB5BD;
            default: return 0xFFCBD2D9;
        }
    }

    private int bubbleTextColor(String state) {
        switch (state == null ? "" : state) {
            case "success": return 0xFF1E7B45;
            case "error": return 0xFFB3261E;
            case "waitingApproval": return 0xFF7A4E00;
            case "thinking": return 0xFF495057;
            default: return 0xFF1F2933;
        }
    }

    private void restoreMascotFeedback() {
        if (SuanbaoOverlayPreferences.MOTION_OFF.equals(appearance.motion())) {
            mascotView.setScaleX(1f);
            mascotView.setScaleY(1f);
            mascotView.setAlpha(appearance.opacity());
            return;
        }
        mascotView.animate().scaleX(1f).scaleY(1f).alpha(appearance.opacity()).setDuration(120).start();
    }

    private void moveTo(int x, int y) {
        if (overlayView == null) return;
        SuanbaoOverlayGeometry.Point point = SuanbaoOverlayGeometry.clamp(
            new SuanbaoOverlayGeometry.Point(x, y), safeBounds(layoutParams.width, layoutParams.height));
        layoutParams.x = point.x();
        layoutParams.y = point.y();
        try { windowManager.updateViewLayout(overlayView, layoutParams); } catch (RuntimeException ignored) {}
        applyEdgePeekState();
    }

    private void snapToNearestEdge() {
        interactionState = "snapping";
        sendStateChanged();
        SuanbaoOverlayGeometry.Bounds bounds = safeBounds(layoutParams.width, layoutParams.height);
        int targetX = SuanbaoOverlayGeometry.nearestEdgeX(layoutParams.x, bounds);
        int start = layoutParams.x;
        cancelSnap();
        if (SuanbaoOverlayPreferences.MOTION_OFF.equals(appearance.motion())) {
            moveTo(targetX, layoutParams.y);
            persistPosition();
            interactionState = "idle";
            sendStateChanged();
            return;
        }
        snapAnimator = ValueAnimator.ofInt(start, targetX);
        snapAnimator.setDuration(SuanbaoOverlayPreferences.MOTION_REDUCED.equals(appearance.motion()) ? 120 : 190);
        snapAnimator.setInterpolator(new DecelerateInterpolator());
        snapAnimator.addUpdateListener(animation -> moveTo((int) animation.getAnimatedValue(), layoutParams.y));
        snapAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(android.animation.Animator animation) {
                persistPosition();
                applyEdgePeekState();
                sendStateChanged();
            }
            @Override public void onAnimationCancel(android.animation.Animator animation) {
                applyEdgePeekState();
                sendStateChanged();
            }
        });
        snapAnimator.start();
    }

    private void cancelSnap() {
        if (snapAnimator != null) {
            snapAnimator.cancel();
            snapAnimator = null;
        }
    }

    private SuanbaoOverlayGeometry.Bounds safeBounds(int width, int height) {
        Rect screen = new Rect();
        int insetLeft = 0, insetTop = 0, insetRight = 0, insetBottom = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.view.WindowMetrics metrics = windowManager.getCurrentWindowMetrics();
            screen.set(metrics.getBounds());
            WindowInsets insets = metrics.getWindowInsets();
            android.graphics.Insets bars = insets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            insetLeft = bars.left; insetTop = bars.top; insetRight = bars.right; insetBottom = bars.bottom;
        } else {
            android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
            windowManager.getDefaultDisplay().getMetrics(metrics);
            screen.set(0, 0, metrics.widthPixels, metrics.heightPixels);
        }
        int margin = dp(8);
        int minX = screen.left + insetLeft + margin;
        int minY = screen.top + insetTop + margin;
        int maxX = screen.right - insetRight - width - margin;
        int maxY = screen.bottom - insetBottom - height - margin;
        return new SuanbaoOverlayGeometry.Bounds(minX, minY, Math.max(minX, maxX), Math.max(minY, maxY));
    }

    private void restorePosition() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        SuanbaoOverlayGeometry.Bounds bounds = safeBounds(layoutParams.width, layoutParams.height);
        if (prefs.getInt("position_schema", 1) >= POSITION_SCHEMA) {
            layoutParams.x = SuanbaoOverlayGeometry.denormalize(prefs.getFloat("normalized_x", 0f), bounds.minX(), bounds.maxX());
            layoutParams.y = SuanbaoOverlayGeometry.denormalize(prefs.getFloat("normalized_y", 0.25f), bounds.minY(), bounds.maxY());
        } else {
            SuanbaoOverlayGeometry.Point migrated = SuanbaoOverlayGeometry.clamp(
                new SuanbaoOverlayGeometry.Point(prefs.getInt("x", bounds.minX()), prefs.getInt("y", bounds.minY() + dp(160))), bounds);
            layoutParams.x = migrated.x();
            layoutParams.y = migrated.y();
            persistPosition();
        }
    }

    private void persistPosition() {
        SuanbaoOverlayGeometry.Bounds bounds = safeBounds(layoutParams.width, layoutParams.height);
        String edge = layoutParams.x <= (bounds.minX() + bounds.maxX()) / 2 ? "left" : "right";
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putInt("position_schema", POSITION_SCHEMA)
            .putFloat("normalized_x", SuanbaoOverlayGeometry.normalize(layoutParams.x, bounds.minX(), bounds.maxX()))
            .putFloat("normalized_y", SuanbaoOverlayGeometry.normalize(layoutParams.y, bounds.minY(), bounds.maxY()))
            .putString("edge", edge)
            .apply();
    }

    private void applyEdgePeekState() {
        if (overlayView == null || mascotView == null || layoutParams == null) return;
        SuanbaoOverlayGeometry.Bounds bounds = safeBounds(layoutParams.width, layoutParams.height);
        int centerX = layoutParams.x + layoutParams.width / 2;
        int centerY = layoutParams.y + layoutParams.height / 2;
        int minDist = Math.min(
            Math.min(centerX - bounds.minX(), bounds.maxX() - centerX),
            Math.min(centerY - bounds.minY(), bounds.maxY() - centerY)
        );
        int peek = dp(70);
        int hide = dp(35);
        String edgeState = minDist < hide ? "hiding" : minDist < peek ? "peeking" : "idle";
        if (!edgeState.equals(interactionState) && !"dragging".equals(interactionState) && !"pressed".equals(interactionState) && !"snapping".equals(interactionState)) {
            interactionState = edgeState;
            sendStateChanged();
        }
        if ("peeking".equals(edgeState)) {
            mascotView.setScaleX(0.82f);
            mascotView.setScaleY(0.82f);
            mascotView.setAlpha(Math.max(0.5f, appearance.opacity() * 0.85f));
        } else if ("hiding".equals(edgeState)) {
            mascotView.setScaleX(0.55f);
            mascotView.setScaleY(0.55f);
            mascotView.setAlpha(Math.max(0.4f, appearance.opacity() * 0.6f));
        } else {
            mascotView.setScaleX(1f);
            mascotView.setScaleY(1f);
            mascotView.setAlpha(appearance.opacity());
        }
    }

    private void showMenu(boolean full) {
        hideMenu();
        interactionState = "menuOpen";
        sendStateChanged();
        LinearLayout menu = new LinearLayout(this);
        menu.setOrientation(LinearLayout.VERTICAL);
        menu.setPadding(dp(8), dp(8), dp(8), dp(8));
        GradientDrawable background = new GradientDrawable();
        background.setColor(0xF7FFFFFF);
        background.setCornerRadius(dp(14));
        background.setStroke(dp(1), 0x22000000);
        menu.setBackground(background);
        menu.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_OUTSIDE) {
                hideMenu();
                return true;
            }
            return false;
        });

        menu.addView(menuButton("打开 KOD", view -> { hideMenu(); openApp(); }));
        if (full) menu.addView(menuButton("恢复默认位置", view -> { hideMenu(); resetPosition(); }));
        if (full) menu.addView(menuButton("关闭桌宠", view -> stopSelf(), Color.rgb(198, 40, 40)));

        menuLayoutParams = createLayoutParams(dp(168), WindowManager.LayoutParams.WRAP_CONTENT, true);
        menuLayoutParams.gravity = Gravity.TOP | Gravity.START;
        SuanbaoOverlayGeometry.Bounds menuBounds = safeBounds(dp(168), dp(full ? 156 : 60));
        boolean onLeft = layoutParams.x <= safeBounds(layoutParams.width, layoutParams.height).minX() + dp(16);
        int desiredX = onLeft ? layoutParams.x + layoutParams.width + dp(8) : layoutParams.x - dp(168) - dp(8);
        menuLayoutParams.x = SuanbaoOverlayGeometry.clamp(desiredX, menuBounds.minX(), menuBounds.maxX());
        menuLayoutParams.y = SuanbaoOverlayGeometry.clamp(layoutParams.y, menuBounds.minY(), menuBounds.maxY());
        menuView = menu;
        try { windowManager.addView(menuView, menuLayoutParams); } catch (RuntimeException error) { menuView = null; }
    }

    private Button menuButton(String text, View.OnClickListener listener) {
        return menuButton(text, listener, Color.rgb(35, 39, 45));
    }

    private Button menuButton(String text, View.OnClickListener listener, int color) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(color);
        button.setTextSize(14);
        button.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        button.setMinHeight(dp(48));
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setAllCaps(false);
        button.setOnClickListener(listener);
        return button;
    }

    private void hideMenu() {
        if (menuView != null && windowManager != null) {
            try { windowManager.removeView(menuView); } catch (RuntimeException ignored) {}
            menuView = null;
            interactionState = "idle";
            sendStateChanged();
        }
    }

    private void resetPosition() {
        SuanbaoOverlayGeometry.Bounds bounds = safeBounds(layoutParams.width, layoutParams.height);
        moveTo(bounds.minX(), bounds.minY() + Math.round((bounds.maxY() - bounds.minY()) * 0.25f));
        persistPosition();
    }

    private void openApp() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        hideMenu();
        cancelSnap();
        restorePosition();
        moveTo(layoutParams.x, layoutParams.y);
    }

    private NotificationCompat.Builder notificationBuilder() {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent openPending = PendingIntent.getActivity(this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stopIntent = new Intent(this, SuanbaoOverlayService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("蒜宝桌宠正在运行")
            .setContentText("点击返回 KOD；长按蒜宝可打开完整菜单")
            .setContentIntent(openPending)
            .addAction(android.R.drawable.ic_menu_view, "打开 KOD", openPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭桌宠", stopPending)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
    }

    private android.app.Notification buildNotification() { return notificationBuilder().build(); }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "蒜宝桌宠", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("保持蒜宝悬浮桌宠运行");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private void setRunning(boolean running) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("running", running).apply();
    }

    public static boolean isRunning(android.content.Context context) {
        return visible;
    }

    public static String lifecycleState() { return lifecycleState; }
    public static String interactionState() { return interactionState; }
    public static String lastError() { return lastError; }

    public static SuanbaoOverlayPreferences.Snapshot appearance(android.content.Context context) {
        return new SuanbaoOverlayPreferences(context).get();
    }

    public static SuanbaoOverlayPreferences.Snapshot updateAppearance(android.content.Context context, String size, Float opacity, String motion, Boolean edgeSnap, Boolean positionLocked) {
        SuanbaoOverlayPreferences.Snapshot snapshot = new SuanbaoOverlayPreferences(context).update(size, opacity, motion, edgeSnap, positionLocked);
        Intent intent = new Intent(context, SuanbaoOverlayService.class).setAction("com.kod.app.agent.REFRESH_SUANBAO_OVERLAY");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && visible) context.startForegroundService(intent);
        else if (visible) context.startService(intent);
        return snapshot;
    }

    private void sendStateChanged() {
        Intent intent = new Intent(getPackageName() + ".SUANBAO_OVERLAY_STATE_CHANGED");
        intent.setPackage(getPackageName());
        sendBroadcast(intent);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override
    public void onDestroy() {
        instance = null;
        stopFloating();
        cancelSnap();
        hideMenu();
        if (overlayView != null && windowManager != null) {
            try { windowManager.removeView(overlayView); } catch (RuntimeException ignored) {}
            overlayView = null;
        }
        visible = false;
        lifecycleState = "stopped";
        interactionState = "idle";
        setRunning(false);
        sendStateChanged();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
