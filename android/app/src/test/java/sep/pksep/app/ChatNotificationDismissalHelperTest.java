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
}
