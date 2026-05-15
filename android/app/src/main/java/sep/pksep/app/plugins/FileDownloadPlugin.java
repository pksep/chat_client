package sep.pksep.app.plugins;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.text.TextUtils;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FileDownload")
public class FileDownloadPlugin extends Plugin {
    private static final String TAG = "MessageFileDownload";

    @PluginMethod
    public void downloadFile(PluginCall call) {
        String url = call.getString("url");
        String fileName = sanitizeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");

        if (TextUtils.isEmpty(url)) {
            Log.e(TAG, "downloadFile rejected: empty url");
            call.reject("File url is required");
            return;
        }

        if (TextUtils.isEmpty(fileName)) {
            fileName = "file";
        }

        try {
            DownloadManager downloadManager =
                (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);

            if (downloadManager == null) {
                Log.e(TAG, "downloadFile rejected: DownloadManager is unavailable");
                call.reject("DownloadManager is unavailable");
                return;
            }

            Uri downloadUri = Uri.parse(url);
            DownloadManager.Request request = new DownloadManager.Request(downloadUri);
            String resolvedMimeType = !TextUtils.isEmpty(mimeType)
                ? mimeType
                : resolveMimeType(url, fileName);
            String cookies = CookieManager.getInstance().getCookie(url);

            request.setTitle(fileName);
            request.setDescription("Скачивание файла");
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setVisibleInDownloadsUi(true);
            request.addRequestHeader("User-Agent", System.getProperty("http.agent"));

            if (!TextUtils.isEmpty(cookies)) {
                request.addRequestHeader("Cookie", cookies);
            }

            if (!TextUtils.isEmpty(resolvedMimeType)) {
                request.setMimeType(resolvedMimeType);
            }

            request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                fileName
            );

            long downloadId = downloadManager.enqueue(request);

            Log.i(
                TAG,
                "Enqueued file download: id=" + downloadId
                    + ", fileName=" + fileName
                    + ", mimeType=" + resolvedMimeType
                    + ", url=" + url
            );

            JSObject result = new JSObject();
            result.put("downloadId", String.valueOf(downloadId));
            call.resolve(result);
        } catch (Exception error) {
            Log.e(
                TAG,
                "Failed to enqueue file download: fileName=" + fileName + ", url=" + url,
                error
            );
            call.reject("Failed to enqueue file download", error);
        }
    }

    @NonNull
    private String sanitizeFileName(String fileName) {
        if (TextUtils.isEmpty(fileName)) {
            return "file";
        }

        return fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private String resolveMimeType(String url, String fileName) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(url);

        if (TextUtils.isEmpty(extension) && !TextUtils.isEmpty(fileName)) {
            int lastDot = fileName.lastIndexOf('.');
            if (lastDot >= 0 && lastDot < fileName.length() - 1) {
                extension = fileName.substring(lastDot + 1);
            }
        }

        if (TextUtils.isEmpty(extension)) {
            return "application/octet-stream";
        }

        String mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(
            extension.toLowerCase()
        );

        return !TextUtils.isEmpty(mimeType) ? mimeType : "application/octet-stream";
    }
}
