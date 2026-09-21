package sep.pksep.app.plugins;

import android.content.ContentValues;
import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
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
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@CapacitorPlugin(name = "NativeFile")
public class NativeFilePlugin extends Plugin {
    private static final String CACHE_DIR_NAME = "shared_files";
    private static final String EVENT_FILE_DOWNLOAD_PROGRESS = "fileDownloadProgress";

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
        String url = call.getString("url");
        String fileName = sanitizeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");
        String localUri = call.getString("localUri");
        long expectedSize = call.getData().optLong("size", 0L);

        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

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
                call.reject("File is not downloaded");
                return;
            }

            openDownloadedFileWithViewer(downloadedFile);

            JSObject result = new JSObject();
            result.put("path", getDownloadedFilePath(downloadedFile));
            result.put("mimeType", downloadedFile.mimeType);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Failed to open downloaded file: " + error.getMessage(), error);
        }
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
