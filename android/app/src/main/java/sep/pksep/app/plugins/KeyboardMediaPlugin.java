package sep.pksep.app.plugins;

import android.webkit.MimeTypeMap;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import sep.pksep.app.ChatKeyboardWebView;

@CapacitorPlugin(name = "KeyboardMedia")
public class KeyboardMediaPlugin extends Plugin {
    public static final String[] MIME_TYPES = { "image/gif", "image/webp", "image/png", "image/jpeg" };
    private static final long MAX_BYTES = 20L * 1024 * 1024;
    private static KeyboardMediaPlugin instance;
    private final ExecutorService reader = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        instance = this;
        File directory = new File(getContext().getCacheDir(), "keyboard-media");
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) {
            if (System.currentTimeMillis() - file.lastModified() > 86400000L) file.delete();
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        reader.shutdown();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (getBridge().getWebView() instanceof ChatKeyboardWebView) {
                ((ChatKeyboardWebView) getBridge().getWebView()).setKeyboardMediaEnabled(enabled);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void releaseFile(PluginCall call) {
        String path = call.getString("filePath");
        try {
            File directory = new File(getContext().getCacheDir(), "keyboard-media").getCanonicalFile();
            if (path != null) {
                File file = new File(path).getCanonicalFile();
                if (directory.equals(file.getParentFile())) file.delete();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Не удалось освободить файл клавиатуры");
        }
    }

    public static boolean receiveContent(InputContentInfoCompat content, int flags) {
        KeyboardMediaPlugin plugin = instance;
        if (plugin == null || plugin.reader.isShutdown() || !"content".equals(content.getContentUri().getScheme())) return false;
        String mime = null;
        for (String candidate : MIME_TYPES) {
            if (content.getDescription().hasMimeType(candidate)) { mime = candidate; break; }
        }
        if (mime == null) return false;
        boolean permission = (flags & InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION) != 0;
        try {
            if (permission) content.requestPermission();
        } catch (Exception error) { return false; }
        final String contentType = mime;
        plugin.reader.execute(() -> {
            File target = null;
            try {
                File directory = new File(plugin.getContext().getCacheDir(), "keyboard-media");
                if (!directory.exists() && !directory.mkdirs()) throw new Exception();
                String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(contentType);
                target = new File(directory, UUID.randomUUID() + "." + extension);
                long size = 0;
                try (InputStream input = plugin.getContext().getContentResolver().openInputStream(content.getContentUri());
                     FileOutputStream output = new FileOutputStream(target)) {
                    if (input == null) throw new Exception();
                    byte[] buffer = new byte[16384];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        size += count;
                        if (size > MAX_BYTES) throw new Exception("Стикер больше 20 МБ");
                        output.write(buffer, 0, count);
                    }
                }
                if (size == 0) throw new Exception();
                JSObject payload = new JSObject();
                payload.put("filePath", target.getAbsolutePath());
                payload.put("name", "keyboard-" + target.getName());
                payload.put("mimeType", contentType);
                payload.put("size", size);
                plugin.notifyListeners("mediaReceived", payload);
            } catch (Exception error) {
                if (target != null) target.delete();
                JSObject payload = new JSObject();
                payload.put("message", "Стикер больше 20 МБ".equals(error.getMessage())
                    ? error.getMessage() : "Не удалось получить стикер из клавиатуры");
                plugin.notifyListeners("mediaError", payload);
            } finally {
                if (permission) content.releasePermission();
            }
        });
        return true;
    }
}
