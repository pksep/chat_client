package sep.pksep.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import sep.pksep.app.plugins.CallScreenPlugin;

public class CallActionReceiver extends BroadcastReceiver {
    public static void dispatchAction(
        Context context,
        String action,
        String roomId,
        String topicId
    ) {
        if ("decline".equals(action)) {
            IncomingCallNotificationHelper.dismissIncomingCall(context, roomId);
        }

        CallScreenPlugin.dispatchCallAction(action, roomId, topicId);
    }

    public static Intent createIntent(
        Context context,
        String action,
        String roomId,
        String topicId,
        String callerId,
        String callerName,
        String topicType
    ) {
        Intent intent = new Intent(context, CallActionReceiver.class);
        intent.setAction(IncomingCallNotificationHelper.ACTION_DECLINE_CALL);
        intent.putExtra(IncomingCallNotificationHelper.EXTRA_CALL_ACTION, action);

        if (roomId != null) {
            intent.putExtra(IncomingCallNotificationHelper.EXTRA_ROOM_ID, roomId);
        }

        if (topicId != null) {
            intent.putExtra(IncomingCallNotificationHelper.EXTRA_TOPIC_ID, topicId);
        }

        if (callerId != null) {
            intent.putExtra(IncomingCallNotificationHelper.EXTRA_CALLER_ID, callerId);
        }

        if (callerName != null) {
            intent.putExtra(IncomingCallNotificationHelper.EXTRA_CALLER_NAME, callerName);
        }

        if (topicType != null) {
            intent.putExtra(IncomingCallNotificationHelper.EXTRA_TOPIC_TYPE, topicType);
        }

        intent.putExtra(IncomingCallNotificationHelper.EXTRA_TYPE, "incoming_call");
        return intent;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }

        String action = intent.getStringExtra(
            IncomingCallNotificationHelper.EXTRA_CALL_ACTION
        );
        String roomId = intent.getStringExtra(
            IncomingCallNotificationHelper.EXTRA_ROOM_ID
        );
        String topicId = intent.getStringExtra(
            IncomingCallNotificationHelper.EXTRA_TOPIC_ID
        );

        dispatchAction(context, action, roomId, topicId);
    }
}
