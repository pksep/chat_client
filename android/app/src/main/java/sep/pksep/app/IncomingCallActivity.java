package sep.pksep.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.lang.ref.WeakReference;
import java.util.Locale;

public class IncomingCallActivity extends AppCompatActivity {
    private static WeakReference<IncomingCallActivity> activeInstance =
        new WeakReference<>(null);

    private String roomId;
    private String topicId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        activeInstance = new WeakReference<>(this);
        setContentView(R.layout.activity_incoming_call);
        setIncomingCallWindowEnabled(true);

        Intent intent = getIntent();
        roomId = intent.getStringExtra(IncomingCallNotificationHelper.EXTRA_ROOM_ID);
        topicId = intent.getStringExtra(IncomingCallNotificationHelper.EXTRA_TOPIC_ID);
        String callerName =
            intent.getStringExtra(IncomingCallNotificationHelper.EXTRA_CALLER_NAME);

        TextView avatarView = findViewById(R.id.incoming_call_avatar);
        TextView callerNameView = findViewById(R.id.incoming_call_name);
        TextView callLabelView = findViewById(R.id.incoming_call_label);
        ImageButton acceptButton = findViewById(R.id.incoming_call_accept);
        ImageButton declineButton = findViewById(R.id.incoming_call_decline);

        callerNameView.setText(
            callerName != null && !callerName.trim().isEmpty()
                ? callerName
                : getString(R.string.incoming_call_default_name)
        );
        callLabelView.setText(R.string.incoming_call_label);
        avatarView.setText(resolveInitials(callerName));

        acceptButton.setOnClickListener(v -> {
            IncomingCallNotificationHelper.dismissIncomingCall(this, roomId);
            startActivity(
                IncomingCallNotificationHelper.createCallIntent(
                    this,
                    "accept",
                    roomId,
                    topicId,
                    intent.getStringExtra(IncomingCallNotificationHelper.EXTRA_CALLER_ID),
                    callerName,
                    intent.getStringExtra(IncomingCallNotificationHelper.EXTRA_TOPIC_TYPE)
                )
            );
            finish();
        });

        declineButton.setOnClickListener(v -> {
            IncomingCallNotificationHelper.dismissIncomingCall(this, roomId);
            CallActionReceiver.dispatchAction(this, "decline", roomId, topicId);
            finish();
        });
    }

    @Override
    protected void onDestroy() {
        IncomingCallActivity activity = activeInstance.get();
        if (activity == this) {
            activeInstance = new WeakReference<>(null);
        }
        super.onDestroy();
    }

    private void setIncomingCallWindowEnabled(boolean enabled) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(enabled);
            setTurnScreenOn(enabled);
        }

        if (enabled) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            if (enabled) {
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                );
            } else {
                getWindow().clearFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                );
            }
        }
    }

    public static void dismissIfMatches(String targetRoomId) {
        IncomingCallActivity activity = activeInstance.get();
        if (activity == null) {
            return;
        }

        if (
            targetRoomId == null ||
            activity.roomId == null ||
            targetRoomId.equals(activity.roomId)
        ) {
            activity.runOnUiThread(activity::finish);
        }
    }

    public static void dismissActiveCall() {
        IncomingCallActivity activity = activeInstance.get();
        if (activity != null) {
            activity.runOnUiThread(activity::finish);
        }
    }

    private String resolveInitials(String callerName) {
        if (callerName == null || callerName.trim().isEmpty()) {
            return "?";
        }

        String[] parts = callerName.trim().split("\\s+");
        if (parts.length == 1) {
            return parts[0]
                .substring(0, Math.min(2, parts[0].length()))
                .toUpperCase(Locale.getDefault());
        }

        String first = parts[0].isEmpty() ? "" : parts[0].substring(0, 1);
        String last =
            parts[parts.length - 1].isEmpty()
                ? ""
                : parts[parts.length - 1].substring(0, 1);

        return (first + last).toUpperCase(Locale.getDefault());
    }
}
