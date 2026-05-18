package sep.pksep.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.HashSet;
import java.util.Set;

public final class IncomingCallNotificationHelper {
    public static final String CHANNEL_ID = "incoming_call_v3";
    public static final String EXTRA_CALL_ACTION = "callAction";
    public static final String EXTRA_CALLER_ID = "callerId";
    public static final String EXTRA_CALLER_NAME = "callerName";
    public static final String EXTRA_ROOM_ID = "roomId";
    public static final String EXTRA_TOPIC_ID = "topicId";
    public static final String EXTRA_TOPIC_TYPE = "topicType";
    public static final String EXTRA_TYPE = "type";
    public static final String ACTION_DECLINE_CALL =
        "sep.pksep.app.action.DECLINE_CALL";

    private static final String PREFS_NAME = "incoming_call_notifications";
    private static final String PREF_ACTIVE_ROOM_IDS = "active_room_ids";

    private IncomingCallNotificationHelper() {}

    public static void showIncomingCall(
        Context context,
        String callerId,
        String callerName,
        String roomId,
        String topicId,
        String topicType
    ) {
        createChannel(context);

        String resolvedCallerName =
            callerName != null && !callerName.trim().isEmpty()
                ? callerName
                : "Входящий вызов...";

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            buildRequestCode(roomId, 0),
            createIncomingCallScreenIntent(
                context,
                roomId,
                topicId,
                callerId,
                callerName,
                topicType
            ),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent acceptPendingIntent = PendingIntent.getActivity(
            context,
            buildRequestCode(roomId, 1),
            createCallIntent(
                context,
                "accept",
                roomId,
                topicId,
                callerId,
                callerName,
                topicType
            ),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
            context,
            buildRequestCode(roomId, 2),
            CallActionReceiver.createIntent(
                context,
                "decline",
                roomId,
                topicId,
                callerId,
                callerName,
                topicType
            ),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_stat_chat)
            .setContentTitle("Incoming call")
            .setContentText(resolvedCallerName)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setVibrate(new long[] { 0, 400, 250, 400 })
            .setContentIntent(contentIntent)
            .setFullScreenIntent(contentIntent, true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent)
            .addAction(android.R.drawable.sym_action_call, "Answer", acceptPendingIntent);

        NotificationManagerCompat.from(context).notify(
            buildNotificationId(roomId),
            builder.build()
        );
        rememberActiveCall(context, roomId);
        IncomingCallRingtonePlayer.start(context);
    }

    public static void dismissIncomingCall(Context context, String roomId) {
        NotificationManagerCompat.from(context).cancel(buildNotificationId(roomId));
        IncomingCallActivity.dismissIfMatches(roomId);
        forgetActiveCall(context, roomId);
        if (getActiveCallRoomIds(context).isEmpty()) {
            IncomingCallRingtonePlayer.stop();
        }
    }

    public static void dismissAllIncomingCalls(Context context) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);

        for (String roomId : getActiveCallRoomIds(context)) {
            manager.cancel(buildNotificationId(roomId));
        }

        IncomingCallActivity.dismissActiveCall();
        clearActiveCalls(context);
        IncomingCallRingtonePlayer.stop();
    }

    static Intent createCallIntent(
        Context context,
        String action,
        String roomId,
        String topicId,
        String callerId,
        String callerName,
        String topicType
    ) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );

        if (action != null) {
            intent.putExtra(EXTRA_CALL_ACTION, action);
        }

        if (roomId != null) {
            intent.putExtra(EXTRA_ROOM_ID, roomId);
        }

        if (topicId != null) {
            intent.putExtra(EXTRA_TOPIC_ID, topicId);
        }

        if (callerId != null) {
            intent.putExtra(EXTRA_CALLER_ID, callerId);
        }

        if (callerName != null) {
            intent.putExtra(EXTRA_CALLER_NAME, callerName);
        }

        if (topicType != null) {
            intent.putExtra(EXTRA_TOPIC_TYPE, topicType);
        }

        intent.putExtra(EXTRA_TYPE, "incoming_call");
        return intent;
    }

    private static Intent createIncomingCallScreenIntent(
        Context context,
        String roomId,
        String topicId,
        String callerId,
        String callerName,
        String topicType
    ) {
        Intent intent = new Intent(context, IncomingCallActivity.class);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );

        if (roomId != null) {
            intent.putExtra(EXTRA_ROOM_ID, roomId);
        }

        if (topicId != null) {
            intent.putExtra(EXTRA_TOPIC_ID, topicId);
        }

        if (callerId != null) {
            intent.putExtra(EXTRA_CALLER_ID, callerId);
        }

        if (callerName != null) {
            intent.putExtra(EXTRA_CALLER_NAME, callerName);
        }

        if (topicType != null) {
            intent.putExtra(EXTRA_TOPIC_TYPE, topicType);
        }

        intent.putExtra(EXTRA_TYPE, "incoming_call");
        return intent;
    }

    private static int buildNotificationId(String roomId) {
        return 700000 + Math.abs((roomId != null ? roomId : "incoming-call").hashCode());
    }

    private static int buildRequestCode(String roomId, int salt) {
        return buildNotificationId(roomId) + salt;
    }

    private static void createChannel(Context context) {
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Incoming calls",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Incoming call notifications");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setSound(null, null);
        channel.setBypassDnd(true);
        manager.createNotificationChannel(channel);
    }

    private static void rememberActiveCall(Context context, String roomId) {
        if (roomId == null || roomId.trim().isEmpty()) {
            return;
        }

        SharedPreferences preferences = getPreferences(context);
        Set<String> activeRoomIds = new HashSet<>(
            preferences.getStringSet(PREF_ACTIVE_ROOM_IDS, new HashSet<>())
        );

        activeRoomIds.add(roomId);
        preferences.edit().putStringSet(PREF_ACTIVE_ROOM_IDS, activeRoomIds).apply();
    }

    private static void forgetActiveCall(Context context, String roomId) {
        if (roomId == null || roomId.trim().isEmpty()) {
            return;
        }

        SharedPreferences preferences = getPreferences(context);
        Set<String> activeRoomIds = new HashSet<>(
            preferences.getStringSet(PREF_ACTIVE_ROOM_IDS, new HashSet<>())
        );

        if (!activeRoomIds.remove(roomId)) {
            return;
        }

        preferences.edit().putStringSet(PREF_ACTIVE_ROOM_IDS, activeRoomIds).apply();
    }

    private static Set<String> getActiveCallRoomIds(Context context) {
        return new HashSet<>(
            getPreferences(context).getStringSet(PREF_ACTIVE_ROOM_IDS, new HashSet<>())
        );
    }

    private static void clearActiveCalls(Context context) {
        getPreferences(context).edit().remove(PREF_ACTIVE_ROOM_IDS).apply();
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
