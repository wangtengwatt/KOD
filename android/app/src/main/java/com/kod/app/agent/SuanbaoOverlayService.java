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

import androidx.core.app.NotificationCompat;

import com.kod.app.MainActivity;
import com.kod.app.R;

public class SuanbaoOverlayService extends Service {
    private static final String CHANNEL_ID = "suanbao_overlay";
    private static final int NOTIFICATION_ID = 2206;
    private static final String PREFS = "suanbao_overlay";
    private static final String ACTION_STOP = "com.kod.app.agent.STOP_SUANBAO_OVERLAY";
    private static final int POSITION_SCHEMA = 2;

    private static volatile boolean visible;
    private static volatile String lifecycleState = "stopped";
    private static volatile String interactionState = "idle";
    private static volatile String lastError;

    private WindowManager windowManager;
    private View overlayView;
    private View menuView;
    private ImageView mascotView;
    private WindowManager.LayoutParams layoutParams;
    private WindowManager.LayoutParams menuLayoutParams;
    private ValueAnimator snapAnimator;

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
        lifecycleState = "starting";
        interactionState = "idle";
        lastError = null;
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        if (canDraw(this)) showOverlay();
        else stopSelf();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
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

        mascotView = new ImageView(this);
        mascotView.setImageResource(R.drawable.suanbao_mascot);
        mascotView.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        root.addView(mascotView, new FrameLayout.LayoutParams(dp(82), dp(96)));

        layoutParams = createLayoutParams(dp(88), dp(102), false);
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        overlayView = root;
        restorePosition();
        root.setOnTouchListener(new PetTouchListener());

        try {
            windowManager.addView(overlayView, layoutParams);
            visible = true;
            lifecycleState = "visible";
            lastError = null;
            setRunning(true);
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
            ? WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
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
                    mascotView.animate().scaleX(1.04f).scaleY(1.04f).alpha(0.9f).setDuration(100).start();
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
                    restoreMascotFeedback();
                    if (dragging) snapToNearestEdge();
                    else if (!longPressed) showMenu(false);
                    activePointerId = MotionEvent.INVALID_POINTER_ID;
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    view.removeCallbacks(longPress);
                    pointerDown = false;
                    restoreMascotFeedback();
                    if (dragging) snapToNearestEdge();
                    activePointerId = MotionEvent.INVALID_POINTER_ID;
                    return true;
                default:
                    return false;
            }
        }
    }

    private void restoreMascotFeedback() {
        mascotView.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(120).start();
    }

    private void moveTo(int x, int y) {
        if (overlayView == null) return;
        SuanbaoOverlayGeometry.Point point = SuanbaoOverlayGeometry.clamp(
            new SuanbaoOverlayGeometry.Point(x, y), safeBounds(layoutParams.width, layoutParams.height));
        layoutParams.x = point.x();
        layoutParams.y = point.y();
        try { windowManager.updateViewLayout(overlayView, layoutParams); } catch (RuntimeException ignored) {}
    }

    private void snapToNearestEdge() {
        interactionState = "snapping";
        sendStateChanged();
        SuanbaoOverlayGeometry.Bounds bounds = safeBounds(layoutParams.width, layoutParams.height);
        int targetX = SuanbaoOverlayGeometry.nearestEdgeX(layoutParams.x, bounds);
        int start = layoutParams.x;
        cancelSnap();
        snapAnimator = ValueAnimator.ofInt(start, targetX);
        snapAnimator.setDuration(190);
        snapAnimator.setInterpolator(new DecelerateInterpolator());
        snapAnimator.addUpdateListener(animation -> moveTo((int) animation.getAnimatedValue(), layoutParams.y));
        snapAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(android.animation.Animator animation) {
                persistPosition();
                interactionState = "idle";
                sendStateChanged();
            }
            @Override public void onAnimationCancel(android.animation.Animator animation) {
                interactionState = "idle";
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
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putInt("position_schema", POSITION_SCHEMA)
            .putFloat("normalized_x", SuanbaoOverlayGeometry.normalize(layoutParams.x, bounds.minX(), bounds.maxX()))
            .putFloat("normalized_y", SuanbaoOverlayGeometry.normalize(layoutParams.y, bounds.minY(), bounds.maxY()))
            .apply();
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
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭", stopPending)
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

    private void sendStateChanged() {
        Intent intent = new Intent(getPackageName() + ".SUANBAO_OVERLAY_STATE_CHANGED");
        intent.setPackage(getPackageName());
        sendBroadcast(intent);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override
    public void onDestroy() {
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
