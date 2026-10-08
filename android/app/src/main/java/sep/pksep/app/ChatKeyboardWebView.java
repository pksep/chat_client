package sep.pksep.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import com.getcapacitor.CapacitorWebView;
import sep.pksep.app.plugins.KeyboardMediaPlugin;

public class ChatKeyboardWebView extends CapacitorWebView {
    private boolean keyboardMediaEnabled;

    public ChatKeyboardWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void setKeyboardMediaEnabled(boolean enabled) {
        if (keyboardMediaEnabled == enabled) return;
        keyboardMediaEnabled = enabled;
        InputMethodManager manager = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (manager != null) manager.restartInput(this);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection connection = super.onCreateInputConnection(outAttrs);
        if (connection == null || !keyboardMediaEnabled) return connection;
        EditorInfoCompat.setContentMimeTypes(outAttrs, KeyboardMediaPlugin.MIME_TYPES);
        return InputConnectionCompat.createWrapper(connection, outAttrs,
            (content, flags, opts) -> keyboardMediaEnabled && KeyboardMediaPlugin.receiveContent(content, flags));
    }
}
