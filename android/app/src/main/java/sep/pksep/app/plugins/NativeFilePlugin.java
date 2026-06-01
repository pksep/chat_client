package sep.pksep.app.plugins;

import android.content.ContentValues;
import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
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
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "NativeFile")
public class NativeFilePlugin extends Plugin {
    private static final String CACHE_DIR_NAME = "shared_files";

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
                File file = downloadToCache(url, fileName, mimeType);
                String resolvedMimeType = resolveMimeType(file.getName(), mimeType, url);

                getActivity().runOnUiThread(() -> {
                    try {
                        openFileWithViewer(file, resolvedMimeType, file.getName());

                        JSObject result = new JSObject();
                        result.put("path", file.getAbsolutePath());
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

    private File downloadToCache(String url, String fileName, String mimeType) throws Exception {
        File cacheDir = new File(getContext().getCacheDir(), CACHE_DIR_NAME);
        if (!cacheDir.exists() && !cacheDir.mkdirs()) {
            throw new IllegalStateException("Failed to create cache directory");
        }

        String resolvedFileName = fileName.isEmpty() ? deriveFileName(url) : fileName;
        File targetFile = new File(cacheDir, resolvedFileName);

        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);

        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null && !cookies.isEmpty()) {
            connection.setRequestProperty("Cookie", cookies);
        }

        String resolvedMimeType = resolveMimeType(resolvedFileName, mimeType, url);
        if (!resolvedMimeType.isEmpty()) {
            connection.setRequestProperty("Accept", resolvedMimeType + ", */*");
        }

        String userAgent = System.getProperty("http.agent");
        if (userAgent != null && !userAgent.isEmpty()) {
            connection.setRequestProperty("User-Agent", userAgent);
        }

        connection.connect();

        int responseCode = connection.getResponseCode();
        if (responseCode < 200 || responseCode >= 300) {
            throw new IllegalStateException("Unexpected response code: " + responseCode);
        }

        try (
            InputStream inputStream = connection.getInputStream();
            OutputStream outputStream = new FileOutputStream(targetFile, false)
        ) {
            byte[] buffer = new byte[8192];
            int read;

            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }

            outputStream.flush();
        } finally {
            connection.disconnect();
        }

        return targetFile;
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

    private void openFileWithViewer(File file, String mimeType, String chooserTitle) {
        Uri fileUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );

        Intent viewIntent = new Intent(Intent.ACTION_VIEW);
        viewIntent.setDataAndType(fileUri, mimeType);
        viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        Intent chooserIntent = Intent.createChooser(viewIntent, chooserTitle);
        chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (viewIntent.resolveActivity(getContext().getPackageManager()) == null) {
            throw new IllegalStateException("No app available to open this file");
        }

        getActivity().startActivity(chooserIntent);
    }

    private String resolveMimeType(String fileName, String mimeType, String url) {
        if (mimeType != null && !mimeType.trim().isEmpty()) {
            return mimeType;
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

    private String deriveFileName(String url) {
        String guessedFileName = URLUtil.guessFileName(url, null, null);
        return sanitizeFileName(guessedFileName);
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
