package sep.pksep.app.plugins;

import android.content.ContentValues;
import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.BaseColumns;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileNotFoundException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;
import org.json.JSONArray;
import sep.pksep.app.upload.NativeUploadStore;
import sep.pksep.app.upload.NativeUploadWorker;
import sep.pksep.app.sync.ChatBackgroundSyncStore;

@CapacitorPlugin(name = "NativeFile")
public class NativeFilePlugin extends Plugin {
    private static final String CACHE_DIR_NAME = "shared_files";
    private static final String EVENT_FILE_DOWNLOAD_PROGRESS = "fileDownloadProgress";
    private final ExecutorService statusExecutor = Executors.newFixedThreadPool(2);
    private final ExecutorService openExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService uploadExecutor = Executors.newFixedThreadPool(2);

    @Override
    protected void handleOnDestroy() {
        statusExecutor.shutdownNow();
        openExecutor.shutdownNow();
        uploadExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getMessageUploadCapabilities(PluginCall call) {
        call.resolve(new JSObject().put("version", 1));
    }

    @PluginMethod
    public void prepareMessageUpload(PluginCall call) {
        uploadExecutor.execute(() -> {
            try {
                String id = call.getString("id");
                JSONObject state = new JSONObject(call.getData().toString());
                ChatBackgroundSyncStore.Session session = ChatBackgroundSyncStore.getSession(getContext());
                if (!session.isValid() || !session.userId.equals(state.optString("userId")) ||
                    !session.apiUrl.equals(state.optString("apiUrl"))) throw new SecurityException();
                NativeUploadStore.cleanup(getContext(), id);
                JSONObject existing = NativeUploadStore.read(getContext(), id);
                if (existing != null && (!session.userId.equals(existing.optString("userId")) ||
                    !session.apiUrl.equals(existing.optString("apiUrl")))) throw new SecurityException();
                if (existing != null && !"staging".equals(existing.optString("status"))) {
                    call.resolve(new JSObject().put("status", existing.optString("status"))); return;
                }
                JSONArray files = state.getJSONArray("files");
                if (files.length() < 1 || files.length() > 10) throw new IllegalArgumentException();
                state.put("status", "staging"); NativeUploadStore.saveActive(getContext(), id, state);
                call.resolve(new JSObject().put("status", "staging"));
            } catch (Exception error) { call.reject("Не удалось подготовить фоновую отправку", error); }
        });
    }

    @PluginMethod
    public void stageMessageUploadChunk(PluginCall call) {
        uploadExecutor.execute(() -> {
            try {
                String id = call.getString("id");
                JSONObject state = NativeUploadStore.read(getContext(), id);
                if (state == null || !"staging".equals(state.optString("status"))) throw new IllegalStateException();
                int index = call.getInt("index", -1);
                if (index < 0 || index >= state.getJSONArray("files").length()) throw new IllegalArgumentException();
                long offset = call.getData().getLong("offset");
                String base64 = call.getString("base64", "");
                if (base64.length() > 1500000) throw new IllegalArgumentException();
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                long expected = state.getJSONArray("files").getJSONObject(index).getLong("size");
                if (offset < 0 || offset + bytes.length > expected) throw new IllegalArgumentException();
                File file = new File(NativeUploadStore.directory(getContext(), id), index + ".bin");
                if (offset > 0 && file.length() != offset) throw new IllegalStateException();
                try (FileOutputStream out = new FileOutputStream(file, offset != 0)) { out.write(bytes); }
                call.resolve();
            } catch (Exception error) { call.reject("Не удалось сохранить вложение для отправки", error); }
        });
    }

    @PluginMethod
    public void enqueueMessageUpload(PluginCall call) {
        uploadExecutor.execute(() -> {
            try {
                String id = call.getString("id");
                JSONObject state = NativeUploadStore.read(getContext(), id);
                if (state == null) throw new IllegalStateException();
                if ("cancelled".equals(state.optString("status"))) throw new IllegalStateException();
                JSONArray files = state.getJSONArray("files");
                for (int i = 0; i < files.length(); i++) {
                    File file = new File(NativeUploadStore.directory(getContext(), id), i + ".bin");
                    if (file.length() != files.getJSONObject(i).getLong("size")) throw new IllegalStateException();
                }
                state.put("status", "queued"); NativeUploadStore.saveActive(getContext(), id, state);
                NativeUploadWorker.enqueue(getContext(), id);
                call.resolve();
            } catch (Exception error) { call.reject("Не удалось поставить сообщение в очередь", error); }
        });
    }

    @PluginMethod
    public void getMessageUpload(PluginCall call) {
        uploadExecutor.execute(() -> {
            try {
                String id = call.getString("id");
                JSONObject state = NativeUploadStore.read(getContext(), id);
                ChatBackgroundSyncStore.Session session = ChatBackgroundSyncStore.getSession(getContext());
                if (state == null || !session.userId.equals(state.optString("userId")) ||
                    !session.apiUrl.equals(state.optString("apiUrl"))) {
                    call.resolve(new JSObject().put("status", "missing")); return;
                }
                if ("queued".equals(state.optString("status"))) NativeUploadWorker.enqueue(getContext(), id);
                JSObject result = new JSObject().put("status", state.optString("status"));
                result.put("fileIndex", state.optInt("fileIndex"));
                result.put("percent", state.optInt("percent"));
                if (state.has("result")) result.put("message", state.getJSONObject("result"));
                if (state.has("error")) result.put("error", state.getString("error"));
                call.resolve(result);
            } catch (Exception error) { call.reject("Не удалось проверить отправку", error); }
        });
    }

    @PluginMethod
    public void cancelMessageUpload(PluginCall call) {
        uploadExecutor.execute(() -> {
            try {
                String id = call.getString("id");
                JSONObject state = NativeUploadStore.read(getContext(), id);
                if (state == null) {
                    // Удаление сообщения может прийти раньше передачи файлов из WebView.
                    ChatBackgroundSyncStore.Session session = ChatBackgroundSyncStore.getSession(getContext());
                    state = new JSONObject().put("id", id).put("userId", session.userId).put("apiUrl", session.apiUrl);
                }
                if (!"completed".equals(state.optString("status"))) {
                    state.put("status", "cancelled"); NativeUploadStore.save(getContext(), id, state);
                    androidx.work.WorkManager.getInstance(getContext()).cancelUniqueWork("message-upload-" + id).getResult().get();
                }
                call.resolve();
            } catch (Exception error) { call.reject("Не удалось отменить отправку", error); }
        });
    }

    @PluginMethod
    public void retryMessageUpload(PluginCall call) {
        uploadExecutor.execute(() -> {
            try {
                String id = call.getString("id");
                JSONObject state = NativeUploadStore.read(getContext(), id);
                ChatBackgroundSyncStore.Session session = ChatBackgroundSyncStore.getSession(getContext());
                if (state == null || !session.userId.equals(state.optString("userId")) ||
                    !session.apiUrl.equals(state.optString("apiUrl"))) throw new SecurityException();
                if ("failed".equals(state.optString("status"))) {
                    state.put("status", "queued"); state.remove("error");
                    NativeUploadStore.saveActive(getContext(), id, state);
                    NativeUploadWorker.enqueue(getContext(), id);
                }
                call.resolve();
            } catch (Exception error) { call.reject("Не удалось повторить отправку", error); }
        });
    }

    private interface DownloadProgressCallback extends NativeFileTransfer.ProgressListener {}

    private static class DownloadedFile {
        Uri uri;
        File file;
        String fileName;
        String mimeType;

        DownloadedFile(Uri uri, File file, String fileName, String mimeType) {
            this.uri = uri;
            this.file = file;
            this.fileName = fileName;
            this.mimeType = mimeType;
        }
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String url = call.getString("url");
        String fileName = sanitizeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");

        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        new Thread(() -> {
            try {
                File file = getCachedFile(url, fileName);

                if (!isUsableFile(file)) {
                    file = downloadToCache(url, fileName, mimeType, null);
                }

                File readyFile = file;
                String resolvedMimeType = resolveMimeType(readyFile.getName(), mimeType, url);

                getActivity().runOnUiThread(() -> {
                    try {
                        openFileWithViewer(readyFile, resolvedMimeType, readyFile.getName());

                        JSObject result = new JSObject();
                        result.put("path", readyFile.getAbsolutePath());
                        result.put("mimeType", resolvedMimeType);
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("Failed to open file: " + error.getMessage(), error);
                    }
                });
            } catch (Exception error) {
                call.reject("Failed to prepare file: " + error.getMessage(), error);
            }
        }).start();
    }

    @PluginMethod
    public void openDownloadedFile(PluginCall call) {
        long requestedAt = SystemClock.elapsedRealtime();
        String url = call.getString("url");
        String fileName = sanitizeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");
        String localUri = call.getString("localUri");
        long expectedSize = call.getData().optLong("size", 0L);

        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        openExecutor.execute(() -> {
          long lookupStartedAt = SystemClock.elapsedRealtime();
          try {
            DownloadedFile downloadedFile;
            String resolvedFileName = fileName.isEmpty() ? deriveFileName(url) : fileName;
            String resolvedMimeType = resolveMimeType(resolvedFileName, mimeType, url);

            if (localUri != null && !localUri.trim().isEmpty()) {
                Uri parsedUri = Uri.parse(localUri);
                downloadedFile =
                    parsedUri.getScheme() == null
                        ? new DownloadedFile(
                            null,
                            new File(localUri),
                            resolvedFileName,
                            resolvedMimeType
                        )
                        : new DownloadedFile(
                            parsedUri,
                            null,
                            resolvedFileName,
                            resolvedMimeType
                        );
            } else {
                downloadedFile = findDownloadedFile(
                    url,
                    fileName,
                    mimeType,
                    expectedSize
                );
            }

            if (downloadedFile == null) {
                call.reject("Файл больше не находится в загрузках", "FILE_NOT_FOUND");
                return;
            }

            // Проверяем сохранённый URI вне очереди Capacitor и UI-потока.
            if (downloadedFile.uri != null) {
                try (AssetFileDescriptor descriptor = getContext().getContentResolver()
                    .openAssetFileDescriptor(downloadedFile.uri, "r")) {
                    if (descriptor == null) throw new FileNotFoundException();
                }
            } else if (!isUsableFile(downloadedFile.file)) {
                throw new FileNotFoundException();
            }
            long lookupFinishedAt = SystemClock.elapsedRealtime();
            DownloadedFile readyFile = downloadedFile;
            getActivity().runOnUiThread(() -> {
                try {
                    openDownloadedFileWithViewer(readyFile);
                    JSObject timings = new JSObject();
                    timings.put("queueMs", lookupStartedAt - requestedAt);
                    timings.put("lookupMs", lookupFinishedAt - lookupStartedAt);
                    timings.put("launchMs", SystemClock.elapsedRealtime() - lookupFinishedAt);
                    JSObject result = new JSObject();
                    result.put("path", getDownloadedFilePath(readyFile));
                    result.put("mimeType", readyFile.mimeType);
                    result.put("timings", timings);
                    call.resolve(result);
                } catch (ActivityNotFoundException error) {
                    call.reject("Нет приложения для открытия этого файла", "VIEWER_UNAVAILABLE", error);
                } catch (Exception error) {
                    call.reject("Не удалось открыть файл", "OPEN_FAILED", error);
                }
            });
          } catch (FileNotFoundException error) {
            call.reject("Файл больше не находится в загрузках", "FILE_NOT_FOUND", error);
          } catch (Exception error) {
            call.reject("Не удалось подготовить файл к открытию", "OPEN_FAILED", error);
          }
        });
    }

    @PluginMethod
    public void getFileStatus(PluginCall call) {
        String url = call.getString("url");
        String fileName = sanitizeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");
        long expectedSize = call.getData().optLong("size", 0L);

        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        statusExecutor.execute(() -> {
          try {
            DownloadedFile downloadedFile = findDownloadedFile(
                url,
                fileName,
                mimeType,
                expectedSize
            );
            String resolvedFileName = fileName.isEmpty() ? deriveFileName(url) : fileName;
            String resolvedMimeType = resolveMimeType(resolvedFileName, mimeType, url);

            JSObject result = new JSObject();
            result.put("downloaded", downloadedFile != null);
            result.put(
                "path",
                downloadedFile != null ? getDownloadedFilePath(downloadedFile) : ""
            );
            result.put(
                "fileName",
                downloadedFile != null ? downloadedFile.fileName : resolvedFileName
            );
            result.put(
                "mimeType",
                downloadedFile != null ? downloadedFile.mimeType : resolvedMimeType
            );
            call.resolve(result);
          } catch (Exception error) {
            call.reject("Failed to read file status: " + error.getMessage(), error);
          }
        });
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        String url = call.getString("url");
        String fileName = sanitizeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");

        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        try {
            DownloadManager downloadManager =
                (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);

            if (downloadManager == null) {
                call.reject("DownloadManager is unavailable");
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String resolvedFileName = fileName.isEmpty() ? deriveFileName(url) : fileName;
            String resolvedMimeType = resolveMimeType(resolvedFileName, mimeType, url);

            request.setTitle(resolvedFileName);
            request.setDescription(resolvedFileName);
            request.setMimeType(resolvedMimeType);
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    resolvedFileName
                );
            } else {
                request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    resolvedFileName
                );
            }

            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isEmpty()) {
                request.addRequestHeader("Cookie", cookies);
            }

            String userAgent = System.getProperty("http.agent");
            if (userAgent != null && !userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", userAgent);
            }

            long downloadId = downloadManager.enqueue(request);

            JSObject result = new JSObject();
            result.put("downloadId", downloadId);
            result.put("fileName", resolvedFileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Failed to enqueue download: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void downloadFileToDownloads(PluginCall call) {
        String requestId = call.getString("requestId");
        String url = call.getString("url");
        String fileName = sanitizeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");

        if (requestId == null || requestId.trim().isEmpty()) {
            call.reject("requestId is required");
            return;
        }

        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        new Thread(() -> {
            try {
                DownloadedFile downloadedFile = downloadToDownloads(
                    url,
                    fileName,
                    mimeType,
                    (bytesDownloaded, totalBytes) ->
                        notifyDownloadProgress(requestId, bytesDownloaded, totalBytes)
                );

                JSObject result = new JSObject();
                result.put("path", getDownloadedFilePath(downloadedFile));
                result.put("fileName", downloadedFile.fileName);
                result.put("mimeType", downloadedFile.mimeType);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Failed to download file: " + error.getMessage(), error);
            }
        }).start();
    }

    @PluginMethod
    public void downloadBase64(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String fileName = sanitizeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("base64Data is required");
            return;
        }

        try {
            String resolvedFileName = fileName.isEmpty() ? "file" : fileName;
            String resolvedMimeType =
                resolveMimeType(resolvedFileName, mimeType, resolvedFileName);
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            Uri uri = saveBytesToDownloads(bytes, resolvedFileName, resolvedMimeType);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("fileName", resolvedFileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Failed to save file: " + error.getMessage(), error);
        }
    }

    private File getCachedFile(String url, String fileName) throws Exception {
        File cacheDir = new File(getContext().getCacheDir(), CACHE_DIR_NAME);
        if (!cacheDir.exists() && !cacheDir.mkdirs()) {
            throw new IllegalStateException("Failed to create cache directory");
        }

        File fileCacheDir = new File(cacheDir, getCacheKey(url));
        if (!fileCacheDir.exists() && !fileCacheDir.mkdirs()) {
            throw new IllegalStateException("Failed to create file cache directory");
        }

        String resolvedFileName = fileName.isEmpty() ? deriveFileName(url) : fileName;
        return new File(fileCacheDir, resolvedFileName);
    }

    private boolean isUsableFile(File file) {
        return file.exists() && file.isFile() && file.length() > 0;
    }

    private File downloadToCache(
        String url,
        String fileName,
        String mimeType,
        DownloadProgressCallback progressCallback
    ) throws Exception {
        File targetFile = getCachedFile(url, fileName);

        try (OutputStream outputStream = new FileOutputStream(targetFile, false)) {
            writeUrlToOutputStream(
                url,
                targetFile.getName(),
                mimeType,
                outputStream,
                progressCallback
            );
            outputStream.flush();
        } catch (Exception error) {
            targetFile.delete();
            throw error;
        }

        return targetFile;
    }

    private DownloadedFile downloadToDownloads(
        String url,
        String fileName,
        String mimeType,
        DownloadProgressCallback progressCallback
    ) throws Exception {
        String resolvedFileName = fileName.isEmpty() ? deriveFileName(url) : fileName;
        String resolvedMimeType = resolveMimeType(resolvedFileName, mimeType, url);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();

            values.put(MediaStore.MediaColumns.DISPLAY_NAME, resolvedFileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, resolvedMimeType);
            values.put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                Environment.DIRECTORY_DOWNLOADS
            );
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IllegalStateException("Failed to create download entry");
            }

            try (OutputStream outputStream = resolver.openOutputStream(uri, "w")) {
                if (outputStream == null) {
                    throw new IllegalStateException("Failed to open download stream");
                }

                writeUrlToOutputStream(
                    url,
                    resolvedFileName,
                    resolvedMimeType,
                    outputStream,
                    progressCallback
                );
                outputStream.flush();
            } catch (Exception error) {
                resolver.delete(uri, null, null);
                throw error;
            }

            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, values, null, null);

            return new DownloadedFile(uri, null, resolvedFileName, resolvedMimeType);
        }

        File downloadsDir =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);

        if (!downloadsDir.exists() && !downloadsDir.mkdirs()) {
            throw new IllegalStateException("Failed to create downloads directory");
        }

        File targetFile = new File(downloadsDir, resolvedFileName);

        try (OutputStream outputStream = new FileOutputStream(targetFile, false)) {
            writeUrlToOutputStream(
                url,
                resolvedFileName,
                resolvedMimeType,
                outputStream,
                progressCallback
            );
            outputStream.flush();
        } catch (Exception error) {
            targetFile.delete();
            throw error;
        }

        return new DownloadedFile(null, targetFile, resolvedFileName, resolvedMimeType);
    }

    private void writeUrlToOutputStream(
        String url,
        String fileName,
        String mimeType,
        OutputStream outputStream,
        DownloadProgressCallback progressCallback
    ) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);

        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null && !cookies.isEmpty()) {
            connection.setRequestProperty("Cookie", cookies);
        }

        String resolvedMimeType = resolveMimeType(fileName, mimeType, url);
        if (!resolvedMimeType.isEmpty()) {
            connection.setRequestProperty("Accept", resolvedMimeType + ", */*");
        }

        String userAgent = System.getProperty("http.agent");
        if (userAgent != null && !userAgent.isEmpty()) {
            connection.setRequestProperty("User-Agent", userAgent);
        }

        NativeFileTransfer.copy(connection, outputStream, progressCallback);
    }

    private void notifyDownloadProgress(
        String requestId,
        long bytesDownloaded,
        long totalBytes
    ) {
        JSObject payload = new JSObject();
        payload.put("requestId", requestId);
        payload.put("bytesDownloaded", bytesDownloaded);
        payload.put("totalBytes", totalBytes);

        if (totalBytes > 0) {
            int percent = (int) Math.min(
                100,
                Math.max(0, Math.round((bytesDownloaded * 100f) / totalBytes))
            );
            payload.put("percent", percent);
        }

        getActivity().runOnUiThread(() ->
            notifyListeners(EVENT_FILE_DOWNLOAD_PROGRESS, payload)
        );
    }

    private DownloadedFile findDownloadedFile(
        String url,
        String fileName,
        String mimeType,
        long expectedSize
    ) throws Exception {
        String resolvedFileName = fileName.isEmpty() ? deriveFileName(url) : fileName;
        String resolvedMimeType = resolveMimeType(resolvedFileName, mimeType, url);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            String[] projection = {
                BaseColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.MIME_TYPE
            };
            String selection = MediaStore.MediaColumns.DISPLAY_NAME + " = ? AND " +
                MediaStore.MediaColumns.IS_PENDING + " = 0";
            String[] selectionArgs = new String[] { resolvedFileName };

            try (
                Cursor cursor = resolver.query(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    projection,
                    selection,
                    selectionArgs,
                    MediaStore.MediaColumns.DATE_MODIFIED + " DESC"
                )
            ) {
                if (cursor == null) {
                    return null;
                }

                DownloadedFile fallbackFile = null;

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(cursor.getColumnIndexOrThrow(BaseColumns._ID));
                    long storedSize = cursor.getLong(
                        cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
                    );
                    String displayName = cursor.getString(
                        cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                    );
                    String storedMimeType = cursor.getString(
                        cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
                    );
                    Uri uri = ContentUris.withAppendedId(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        id
                    );
                    DownloadedFile candidate = new DownloadedFile(
                        uri,
                        null,
                        displayName != null ? displayName : resolvedFileName,
                        storedMimeType != null &&
                            !storedMimeType.isEmpty() &&
                            !isGenericMimeType(storedMimeType)
                            ? storedMimeType
                            : resolvedMimeType
                    );

                    if (expectedSize > 0 && storedSize == expectedSize) {
                        return candidate;
                    }

                    if (fallbackFile == null && expectedSize <= 0 && storedSize > 0) {
                        fallbackFile = candidate;
                    }
                }

                return fallbackFile;
            }
        }

        File downloadsDir =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File file = new File(downloadsDir, resolvedFileName);

        if (!isUsableFile(file)) {
            return null;
        }

        if (expectedSize > 0 && file.length() != expectedSize) {
            return null;
        }

        return new DownloadedFile(null, file, resolvedFileName, resolvedMimeType);
    }

    private String getDownloadedFilePath(DownloadedFile downloadedFile) {
        if (downloadedFile.uri != null) {
            return downloadedFile.uri.toString();
        }

        return downloadedFile.file != null ? downloadedFile.file.getAbsolutePath() : "";
    }

    private void openDownloadedFileWithViewer(DownloadedFile downloadedFile) {
        if (downloadedFile.uri != null) {
            openUriWithViewer(downloadedFile.uri, downloadedFile.mimeType);
            return;
        }

        if (downloadedFile.file == null) {
            throw new IllegalStateException("Downloaded file path is unavailable");
        }

        openFileWithViewer(
            downloadedFile.file,
            downloadedFile.mimeType,
            downloadedFile.fileName
        );
    }

    private Uri saveBytesToDownloads(byte[] bytes, String fileName, String mimeType)
        throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();

            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                Environment.DIRECTORY_DOWNLOADS
            );
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IllegalStateException("Failed to create download entry");
            }

            try (OutputStream outputStream = resolver.openOutputStream(uri, "w")) {
                if (outputStream == null) {
                    throw new IllegalStateException("Failed to open download stream");
                }

                outputStream.write(bytes);
                outputStream.flush();
            }

            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        }

        File downloadsDir =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);

        if (!downloadsDir.exists() && !downloadsDir.mkdirs()) {
            throw new IllegalStateException("Failed to create downloads directory");
        }

        File targetFile = new File(downloadsDir, fileName);

        try (OutputStream outputStream = new FileOutputStream(targetFile, false)) {
            outputStream.write(bytes);
            outputStream.flush();
        }

        return Uri.fromFile(targetFile);
    }

    private void openUriWithViewer(Uri uri, String mimeType) {
        Intent viewIntent = new Intent(Intent.ACTION_VIEW);

        viewIntent.setDataAndType(uri, mimeType);
        viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        getActivity().startActivity(viewIntent);
    }

    private void openFileWithViewer(File file, String mimeType, String chooserTitle) {
        Uri fileUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );

        openUriWithViewer(fileUri, mimeType);
    }

    private String resolveMimeType(String fileName, String mimeType, String url) {
        if (
            mimeType != null &&
                !mimeType.trim().isEmpty() &&
                !isGenericMimeType(mimeType)
        ) {
            return mimeType;
        }

        String knownMimeType = getKnownMimeType(getFileExtension(fileName));
        if (knownMimeType != null && !knownMimeType.isEmpty()) {
            return knownMimeType;
        }

        String extension = MimeTypeMap.getFileExtensionFromUrl(
            fileName != null && !fileName.isEmpty() ? fileName : url
        );

        if (extension != null && !extension.isEmpty()) {
            String resolvedMimeType =
                MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase());
            if (resolvedMimeType != null && !resolvedMimeType.isEmpty()) {
                return resolvedMimeType;
            }
        }

        return "application/octet-stream";
    }

    private String getKnownMimeType(String extension) {
        if (extension == null || extension.isEmpty()) {
            return null;
        }

        switch (extension.toLowerCase()) {
            case "pdf":
                return "application/pdf";
            case "doc":
                return "application/msword";
            case "docx":
                return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xls":
                return "application/vnd.ms-excel";
            case "xlsx":
                return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "ppt":
                return "application/vnd.ms-powerpoint";
            case "pptx":
                return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "txt":
                return "text/plain";
            case "csv":
                return "text/csv";
            case "zip":
                return "application/zip";
            case "rar":
                return "application/vnd.rar";
            case "7z":
                return "application/x-7z-compressed";
            default:
                return null;
        }
    }

    private String getFileExtension(String fileName) {
        if (fileName == null || fileName.trim().isEmpty()) {
            return "";
        }

        String cleanFileName = fileName.split("[?#]", 2)[0];
        int dotIndex = cleanFileName.lastIndexOf(".");

        if (dotIndex < 0 || dotIndex >= cleanFileName.length() - 1) {
            return "";
        }

        return cleanFileName.substring(dotIndex + 1).toLowerCase();
    }

    private boolean isGenericMimeType(String mimeType) {
        return "application/octet-stream".equalsIgnoreCase(mimeType);
    }

    private String deriveFileName(String url) {
        String guessedFileName = URLUtil.guessFileName(url, null, null);
        return sanitizeFileName(guessedFileName);
    }

    private String getCacheKey(String url) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(url.getBytes(StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder();

        for (int i = 0; i < 8 && i < hash.length; i++) {
            builder.append(String.format("%02x", hash[i]));
        }

        return builder.toString();
    }

    private String sanitizeFileName(String fileName) {
        if (fileName == null) {
            return "";
        }

        return fileName
            .replaceAll("[\\\\/:*?\"<>|]", "_")
            .trim();
    }
}
