package com.jruan.studyos;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Notification;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "StudyDevice")
public class StudyDevicePlugin extends Plugin {
    @PluginMethod
    public void configureChannels(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build();
            for (int sound = 0; sound <= 1; sound++) for (int vibration = 0; vibration <= 1; vibration++) {
                NotificationChannel channel = new NotificationChannel("studyos-reminder-" + sound + "-" + vibration, "学习提醒" + (sound == 1 ? " · 声音" : " · 静音") + (vibration == 1 ? " · 振动" : ""), NotificationManager.IMPORTANCE_DEFAULT);
                channel.setSound(sound == 1 ? Settings.System.DEFAULT_NOTIFICATION_URI : null, attributes);
                channel.enableVibration(vibration == 1);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
                manager.createNotificationChannel(channel);
            }
            NotificationChannel status = new NotificationChannel("studyos-status", "专注状态", NotificationManager.IMPORTANCE_LOW);
            status.setSound(null, attributes);
            status.enableVibration(false);
            status.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(status);
        }
        call.resolve();
    }

    @PluginMethod
    public void setStatusExpiry(PluginCall call) {
        Integer id = call.getInt("id");
        Double at = call.getDouble("at");
        if (id == null || at == null) { call.reject("Missing notification expiry"); return; }
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            for (android.service.notification.StatusBarNotification item : manager.getActiveNotifications()) {
                if (item.getId() == id) {
                    Notification notification = Notification.Builder.recoverBuilder(getContext(), item.getNotification())
                        .setTimeoutAfter(Math.max(1000L, at.longValue() - System.currentTimeMillis()))
                        .setOnlyAlertOnce(true).build();
                    manager.notify(id, notification);
                }
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void saveDocument(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "StudyOS.json");
        if (data == null || data.length() > 200000000) { call.reject("备份为空或过大"); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[/\\\\\\p{Cntrl}]", "_"));
        startActivityForResult(call, intent, "documentCreated");
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) { call.resolve(new JSObject().put("saved", false)); return; }
        if (result.getData() == null || result.getData().getData() == null) { call.reject("没有选择保存位置"); return; }
        getBridge().execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
                if (stream == null) throw new IllegalStateException("无法写入所选文件");
                stream.write(Base64.decode(call.getString("data"), Base64.DEFAULT));
                stream.flush();
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception e) { call.reject("备份保存失败，请重试", e); }
        });
    }
}
