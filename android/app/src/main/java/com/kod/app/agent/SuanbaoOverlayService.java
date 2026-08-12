package com.kod.app.agent;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;

import androidx.core.app.NotificationCompat;

import com.kod.app.MainActivity;
import com.kod.app.R;

public class SuanbaoOverlayService extends Service {
    private static final String CHANNEL_ID = "suanbao_overlay";
    private static final int NOTIFICATION_ID = 2206;
    private static final String PREFS = "suanbao_overlay";
    private static final String ACTION_STOP = "com.kod.app.agent.STOP_SUANBAO_OVERLAY";

    private WindowManager windowManager;
    private View overlayView;
    private WindowManager.LayoutParams layoutParams;

    public static boolean canDraw(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    public static void start(Context context) {
        Intent intent = new Intent(context, SuanbaoOverlayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, SuanbaoOverlayService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
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
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        FrameLayout root = new FrameLayout(this);
        root.setPadding(dp(4), dp(4), dp(4), dp(4));

        ImageView mascot = new ImageView(this);
        mascot.setImageResource(R.drawable.suanbao_mascot);
        mascot.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        root.addView(mascot, new FrameLayout.LayoutParams(dp(92), dp(108)));

        ImageButton close = new ImageButton(this);
        close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        close.setBackgroundColor(0xCCFFFFFF);
        close.setPadding(dp(4), dp(4), dp(4), dp(4));
        close.setContentDescription("关闭蒜宝桌宠");
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.END | Gravity.TOP);
        root.addView(close, closeParams);
        close.setOnClickListener(view -> stopSelf());

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        layoutParams = new WindowManager.LayoutParams(
            dp(100), dp(116), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        layoutParams.x = prefs.getInt("x", dp(16));
        layoutParams.y = prefs.getInt("y", dp(180));

        root.setOnTouchListener(new View.OnTouchListener() {
            private int startX;
            private int startY;
            private float touchX;
            private float touchY;
            private boolean moved;

            @Override
            public boolean onTouch(View view, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = layoutParams.x;
                        startY = layoutParams.y;
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = Math.round(event.getRawX() - touchX);
                        int dy = Math.round(event.getRawY() - touchY);
                        moved = moved || Math.abs(dx) > dp(4) || Math.abs(dy) > dp(4);
                        layoutParams.x = startX + dx;
                        layoutParams.y = startY + dy;
                        windowManager.updateViewLayout(overlayView, layoutParams);
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        prefs.edit().putInt("x", layoutParams.x).putInt("y", layoutParams.y).apply();
                        if (!moved && event.getActionMasked() == MotionEvent.ACTION_UP) openApp();
                        return true;
                    default:
                        return false;
                }
            }
        });

        overlayView = root;
        windowManager.addView(overlayView, layoutParams);
        setRunning(true);
    }

    private void openApp() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
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
            .setContentText("点击返回 KOD，或选择关闭桌宠")
            .setContentIntent(openPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭", stopPending)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
    }

    private android.app.Notification buildNotification() {
        return notificationBuilder().build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "蒜宝桌宠", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("保持蒜宝悬浮桌宠运行");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private void setRunning(boolean running) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("running", running).apply();
    }

    public static boolean isRunning(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("running", false);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onDestroy() {
        if (overlayView != null && windowManager != null) {
            windowManager.removeView(overlayView);
            overlayView = null;
        }
        setRunning(false);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
