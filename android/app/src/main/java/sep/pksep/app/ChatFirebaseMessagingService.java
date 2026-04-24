package sep.pksep.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Process;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.List;
import java.util.Map;

public class ChatFirebaseMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        NotificationChannelHelper.ensureDefaultChannel(this);

        Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) {
            return;
        }

        String type = data.get("type");
        if (!"incoming_call".equals(type)) {
            return;
        }

        String roomId = data.get("roomId");
        if (roomId == null || roomId.trim().isEmpty()) {
            return;
        }

        String callerId = data.get("callerId");
        if (callerId == null || callerId.trim().isEmpty()) {
            callerId = data.get("fromUserId");
        }

        String topicId = data.get("topicId");
        String callerName = data.get("callerName");
        String topicType = data.get("topicType");

        if (isAppInForeground()) {
            return;
        }

        IncomingCallNotificationHelper.showIncomingCall(
            this,
            callerId,
            callerName,
            roomId,
            topicId,
            topicType
        );
    }

    private boolean isAppInForeground() {
        ActivityManager activityManager =
            (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) {
            return false;
        }

        List<ActivityManager.RunningAppProcessInfo> appProcesses =
            activityManager.getRunningAppProcesses();
        if (appProcesses == null) {
            return false;
        }

        int currentPid = Process.myPid();

        for (ActivityManager.RunningAppProcessInfo appProcess : appProcesses) {
            if (
                appProcess.pid == currentPid &&
                appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
            ) {
                return true;
            }
        }

        return false;
    }
}
