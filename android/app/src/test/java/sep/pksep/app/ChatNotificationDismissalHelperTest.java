package sep.pksep.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ChatNotificationDismissalHelperTest {
    @Test
    public void dismissesNotificationForDeletedDisplayedMessage() {
        assertTrue(
            ChatNotificationDismissalHelper.shouldDismissMessageNotification(
                "message-id",
                "message-id"
            )
        );
    }

    @Test
    public void keepsNotificationWhenOlderMessageWasDeleted() {
        assertFalse(
            ChatNotificationDismissalHelper.shouldDismissMessageNotification(
                "new-message-id",
                "old-message-id"
            )
        );
    }

    @Test
    public void keepsNotificationWhenDisplayedMessageIsUnknown() {
        assertFalse(
            ChatNotificationDismissalHelper.shouldDismissMessageNotification(
                "",
                "deleted-message-id"
            )
        );
    }

    @Test
    public void rejectsMessageOlderThanReadState() {
        assertFalse(
            ChatNotificationDismissalHelper.isMessageNotificationCurrent(
                1_000L,
                2_000L,
                0L
            )
        );
    }

    @Test
    public void rejectsMessageOlderThanAlreadyReceivedMessage() {
        assertFalse(
            ChatNotificationDismissalHelper.isMessageNotificationCurrent(
                2_000L,
                0L,
                3_000L
            )
        );
    }

    @Test
    public void acceptsMessageNewerThanReadAndReceivedState() {
        assertTrue(
            ChatNotificationDismissalHelper.isMessageNotificationCurrent(
                4_000L,
                2_000L,
                3_000L
            )
        );
    }
}
