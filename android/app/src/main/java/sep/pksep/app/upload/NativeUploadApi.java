package sep.pksep.app.upload;

import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;

/** Сетевые этапы отправки не зависят от WebView. */
public final class NativeUploadApi {
    public interface Progress { void update(long bytes, long total); }
    private final String baseUrl;
    private final Supplier<String> token;
    public NativeUploadApi(String baseUrl, Supplier<String> token) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.token = token;
    }
    public JSONObject post(String path, JSONObject body) throws Exception {
        return json("POST", path, body);
    }
    public JSONObject get(String path) throws Exception { return json("GET", path, null); }
    private JSONObject json(String method, String path, JSONObject body) throws Exception {
        HttpURLConnection connection = connection(baseUrl + path);
        try {
            connection.setRequestMethod(method);
            connection.setRequestProperty("Authorization", "Bearer " + token.get());
            connection.setRequestProperty("Content-Type", "application/json");
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new ApiException(status);
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int read;
                while ((read = input.read(buffer)) != -1) {
                    if (out.size() + read > 8 * 1024 * 1024) throw new IOException("Слишком большой ответ сервера");
                    out.write(buffer, 0, read);
                }
                return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { connection.disconnect(); }
    }
    public void put(String url, File file, String contentType, Progress progress) throws Exception {
        putBytes(url, file, 0, file.length(), contentType, false, progress);
    }
    public void putPart(String path, File file, long offset, long length, Progress progress) throws Exception {
        putBytes(baseUrl + path, file, offset, length, "application/octet-stream", true, progress);
    }
    private void putBytes(String url, File file, long offset, long length, String contentType, boolean authorized, Progress progress) throws Exception {
        // Проверяем отправителя и перед подписанным PUT, которому Bearer не нужен.
        token.get();
        HttpURLConnection connection = connection(url);
        try {
            connection.setRequestMethod("PUT");
            connection.setRequestProperty("Content-Type", contentType);
            if (authorized) connection.setRequestProperty("Authorization", "Bearer " + token.get());
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(length);
            try (RandomAccessFile input = new RandomAccessFile(file, "r"); OutputStream out = connection.getOutputStream()) {
                input.seek(offset);
                byte[] buffer = new byte[256 * 1024]; long total = 0; int read;
                while (total < length && (read = input.read(buffer, 0, (int) Math.min(buffer.length, length - total))) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
                    out.write(buffer, 0, read); total += read;
                    progress.update(total, length);
                }
                if (total != length) throw new EOFException("Локальное вложение неполное");
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new ApiException(status);
        } finally { connection.disconnect(); }
    }
    private HttpURLConnection connection(String value) throws IOException {
        URL url = new URL(value);
        if (!"https".equals(url.getProtocol()) &&
            !("http".equals(url.getProtocol()) && ("127.0.0.1".equals(url.getHost()) || "localhost".equals(url.getHost()))))
            throw new IOException("Для отправки требуется HTTPS");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        return connection;
    }
    public static final class ApiException extends IOException {
        public final int status;
        public ApiException(int status) { super("HTTP " + status); this.status = status; }
        public boolean retryable() { return status == 408 || status == 409 || status == 425 || status == 429 || status >= 500; }
    }
}
