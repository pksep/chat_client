package sep.pksep.app.plugins;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;

final class NativeFileTransfer {
    interface ProgressListener {
        void onProgress(long bytesDownloaded, long totalBytes);
    }

    static void copy(
        HttpURLConnection connection,
        OutputStream output,
        ProgressListener progress
    ) throws IOException {
        // Размер и прогресс относятся к исходному файлу, без HTTP-сжатия.
        connection.setRequestProperty("Accept-Encoding", "identity");
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IOException("Не удалось скачать файл: HTTP " + status);
            }
            long total = connection.getContentLengthLong();
            long received = 0;
            long lastProgress = System.nanoTime();
            if (progress != null) progress.onProgress(0, total);
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                    received += count;
                    long now = System.nanoTime();
                    if (progress != null && now - lastProgress >= 100_000_000L) {
                        progress.onProgress(received, total);
                        lastProgress = now;
                    }
                }
            }
            if (total >= 0 && received != total) {
                throw new EOFException("Загрузка файла прервалась: " + received + " из " + total + " байт");
            }
            output.flush();
            if (progress != null) progress.onProgress(received, total);
        } finally {
            connection.disconnect();
        }
    }

    private NativeFileTransfer() {}
}
