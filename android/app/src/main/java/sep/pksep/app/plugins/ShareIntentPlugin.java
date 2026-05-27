package sep.pksep.app.plugins;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {
    private static final String EVENT_SHARE_INTENT = "shareIntentReceived";
    private static final String SHARED_CACHE_DIR_NAME = "incoming_share";
    private static ShareIntentPlugin instance;
    private static JSObject pendingShareIntent;

    @Override
    public void load() {
        super.load();
        instance = this;
        flushPendingShareIntent();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }

        super.handleOnDestroy();
    }

    public static void dispatchShareIntent(Context context, Intent intent) {
        JSObject payload = buildSharePayload(context, intent);

        if (payload == null) {
            return;
        }

        pendingShareIntent = payload;

        if (instance != null) {
            instance.flushPendingShareIntent();
        }
    }

    private void flushPendingShareIntent() {
        if (pendingShareIntent == null) {
            return;
        }

        notifyListeners(EVENT_SHARE_INTENT, pendingShareIntent, true);
    }

    @PluginMethod
    public void consumePendingShareIntent(PluginCall call) {
        JSObject payload = pendingShareIntent;
        pendingShareIntent = null;

        if (payload == null) {
            payload = new JSObject();
        }

        call.resolve(payload);
    }

    private static JSObject buildSharePayload(Context context, Intent intent) {
        if (context == null || intent == null) {
            return null;
        }

        String action = intent.getAction();
        boolean isSingleShare = Intent.ACTION_SEND.equals(action);
        boolean isMultipleShare = Intent.ACTION_SEND_MULTIPLE.equals(action);

        if (!isSingleShare && !isMultipleShare) {
            return null;
        }

        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        ArrayList<Uri> sharedUris = collectSharedUris(intent);

        if (sharedUris.isEmpty() && isNullOrBlank(sharedText)) {
            return null;
        }

        String shareId = UUID.randomUUID().toString();
        File shareCacheDir = new File(
            context.getCacheDir(),
            SHARED_CACHE_DIR_NAME + File.separator + shareId
        );

        if (!shareCacheDir.exists() && !shareCacheDir.mkdirs()) {
            return null;
        }

        JSArray files = new JSArray();

        for (int index = 0; index < sharedUris.size(); index++) {
            JSObject sharedFile = copySharedUriToCache(
                context,
                sharedUris.get(index),
                shareCacheDir,
                index
            );

            if (sharedFile != null) {
                files.put(sharedFile);
            }
        }

        if (files.length() == 0) {
            return null;
        }

        JSObject payload = new JSObject();
        payload.put("shareId", shareId);
        payload.put("receivedAt", System.currentTimeMillis());
        payload.put("files", files);

        if (!isNullOrBlank(sharedText)) {
            payload.put("text", sharedText.trim());
        }

        return payload;
    }

    private static ArrayList<Uri> collectSharedUris(Intent intent) {
        LinkedHashSet<String> uniqueUris = new LinkedHashSet<>();
        ArrayList<Uri> collectedUris = new ArrayList<>();

        String action = intent.getAction();
        boolean isSingleShare = Intent.ACTION_SEND.equals(action);
        boolean isMultipleShare = Intent.ACTION_SEND_MULTIPLE.equals(action);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (isSingleShare) {
                Uri singleUri = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);

                if (singleUri != null && uniqueUris.add(singleUri.toString())) {
                    collectedUris.add(singleUri);
                }
            }

            if (isMultipleShare) {
                ArrayList<Uri> multipleUris = getParcelableArrayListExtraSafely(intent);

                if (multipleUris != null) {
                    for (Uri uri : multipleUris) {
                        if (uri != null && uniqueUris.add(uri.toString())) {
                            collectedUris.add(uri);
                        }
                    }
                }
            }
        } else {
            if (isSingleShare) {
                Uri singleUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);

                if (singleUri != null && uniqueUris.add(singleUri.toString())) {
                    collectedUris.add(singleUri);
                }
            }

            if (isMultipleShare) {
                ArrayList<Uri> multipleUris = getParcelableArrayListExtraSafely(intent);

                if (multipleUris != null) {
                    for (Uri uri : multipleUris) {
                        if (uri != null && uniqueUris.add(uri.toString())) {
                            collectedUris.add(uri);
                        }
                    }
                }
            }
        }

        ClipData clipData = intent.getClipData();

        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index++) {
                Uri uri = clipData.getItemAt(index).getUri();

                if (uri != null && uniqueUris.add(uri.toString())) {
                    collectedUris.add(uri);
                }
            }
        }

        return collectedUris;
    }

    private static ArrayList<Uri> getParcelableArrayListExtraSafely(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
            }

            return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        } catch (ClassCastException ignored) {
            return null;
        }
    }

    private static JSObject copySharedUriToCache(
        Context context,
        Uri uri,
        File shareCacheDir,
        int index
    ) {
        try {
            ContentResolver contentResolver = context.getContentResolver();
            String displayName = queryDisplayName(contentResolver, uri);
            String mimeType = resolveMimeType(contentResolver, uri, displayName);
            String fileName = !isNullOrBlank(displayName)
                ? sanitizeFileName(displayName)
                : buildFallbackFileName(index, mimeType);
            File targetFile = createUniqueTargetFile(shareCacheDir, fileName);

            try (
                InputStream inputStream = contentResolver.openInputStream(uri);
                FileOutputStream outputStream = new FileOutputStream(targetFile)
            ) {
                if (inputStream == null) {
                    return null;
                }

                byte[] buffer = new byte[8192];
                int bytesRead;

                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                }
            }

            JSObject file = new JSObject();
            file.put("filePath", targetFile.getAbsolutePath());
            file.put("name", targetFile.getName());
            file.put("size", targetFile.length());
            file.put("lastModified", targetFile.lastModified());
            file.put("isMedia", isMediaMimeType(mimeType));

            if (!isNullOrBlank(mimeType)) {
                file.put("mimeType", mimeType);
            }

            return file;
        } catch (Exception error) {
            return null;
        }
    }

    private static String queryDisplayName(ContentResolver contentResolver, Uri uri) {
        Cursor cursor = null;

        try {
            cursor = contentResolver.query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
            );

            if (cursor != null && cursor.moveToFirst()) {
                int columnIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);

                if (columnIndex >= 0) {
                    return cursor.getString(columnIndex);
                }
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }

        return null;
    }

    private static String resolveMimeType(
        ContentResolver contentResolver,
        Uri uri,
        String displayName
    ) {
        String mimeType = contentResolver.getType(uri);

        if (!isNullOrBlank(mimeType)) {
            return mimeType;
        }

        String extension = getExtension(displayName);

        if (isNullOrBlank(extension)) {
            extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        }

        if (isNullOrBlank(extension)) {
            return "application/octet-stream";
        }

        String resolvedMimeType = MimeTypeMap
            .getSingleton()
            .getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));

        return isNullOrBlank(resolvedMimeType)
            ? "application/octet-stream"
            : resolvedMimeType;
    }

    private static String buildFallbackFileName(int index, String mimeType) {
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        String normalizedExtension = isNullOrBlank(extension)
            ? "bin"
            : extension.toLowerCase(Locale.ROOT);

        return "shared-file-" + (index + 1) + "." + normalizedExtension;
    }

    private static File createUniqueTargetFile(File parentDir, String fileName) {
        String safeFileName = sanitizeFileName(fileName);
        String baseName = safeFileName;
        String extension = "";
        int extensionIndex = safeFileName.lastIndexOf('.');

        if (extensionIndex > 0) {
            baseName = safeFileName.substring(0, extensionIndex);
            extension = safeFileName.substring(extensionIndex);
        }

        File targetFile = new File(parentDir, safeFileName);
        int copyIndex = 1;

        while (targetFile.exists()) {
            targetFile = new File(
                parentDir,
                baseName + "-" + copyIndex + extension
            );
            copyIndex++;
        }

        return targetFile;
    }

    private static String sanitizeFileName(String value) {
        if (isNullOrBlank(value)) {
            return "shared-file.bin";
        }

        return value.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static String getExtension(String value) {
        if (isNullOrBlank(value)) {
            return "";
        }

        int extensionIndex = value.lastIndexOf('.');

        if (extensionIndex < 0 || extensionIndex >= value.length() - 1) {
            return "";
        }

        return value.substring(extensionIndex + 1);
    }

    private static boolean isMediaMimeType(String mimeType) {
        if (isNullOrBlank(mimeType)) {
            return false;
        }

        return mimeType.startsWith("image/") || mimeType.startsWith("video/");
    }

    private static boolean isNullOrBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
