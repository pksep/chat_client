package sep.pksep.app.plugins;

import org.junit.Test;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

public class NativeFileTransferTest {
    private static final class DownloadServer implements AutoCloseable {
        final ServerSocket listener = new ServerSocket(0);
        final Thread worker;
        DownloadServer(byte[] body, int declaredSize, int status) throws Exception {
            worker = new Thread(() -> {
                try (Socket socket = listener.accept()) {
                    InputStream input = socket.getInputStream();
                    int matched = 0;
                    byte[] terminator = "\r\n\r\n".getBytes(StandardCharsets.US_ASCII);
                    for (int value; matched < 4 && (value = input.read()) != -1;) {
                        matched = value == terminator[matched] ? matched + 1 : 0;
                    }
                    String headers = "HTTP/1.1 " + status + " Test\r\nConnection: close\r\nContent-Length: " + declaredSize + "\r\n\r\n";
                    socket.getOutputStream().write(headers.getBytes(StandardCharsets.US_ASCII));
                    socket.getOutputStream().write(body);
                } catch (Exception error) { throw new RuntimeException(error); }
            });
            worker.start();
        }
        HttpURLConnection connection() throws Exception {
            HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:" + listener.getLocalPort()).openConnection();
            connection.setReadTimeout(3000);
            return connection;
        }
        public void close() throws Exception { listener.close(); worker.join(3000); }
    }

    @Test public void largeFileStreamsIntactWithoutFloodingProgress() throws Exception {
        byte[] body = new byte[8 * 1024 * 1024];
        for (int index = 0; index < body.length; index++) body[index] = (byte) (index % 251);
        try (DownloadServer server = new DownloadServer(body, body.length, 200)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            List<Long> progress = new ArrayList<>();
            NativeFileTransfer.copy(server.connection(), output, (bytes, total) -> {
                assertEquals(body.length, total); progress.add(bytes);
            });
            assertArrayEquals(body, output.toByteArray());
            assertEquals(Long.valueOf(0), progress.get(0));
            assertEquals(Long.valueOf(body.length), progress.get(progress.size() - 1));
            assertTrue(progress.size() < 100);
        }
    }

    @Test public void truncatedResponseIsNotReportedAsComplete() throws Exception {
        try (DownloadServer server = new DownloadServer(new byte[3], 10, 200)) {
            try {
                NativeFileTransfer.copy(server.connection(), new ByteArrayOutputStream(), null);
                fail("Оборванная загрузка должна завершаться ошибкой");
            } catch (EOFException expected) {
                assertTrue(expected.getMessage().contains("3 из 10"));
            }
        }
    }

    @Test public void unexpectedPartialResponseIsNotSavedAsAWholeFile() throws Exception {
        try (DownloadServer server = new DownloadServer(new byte[3], 3, 206)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try {
                NativeFileTransfer.copy(server.connection(), output, null);
                fail("Частичный ответ нельзя сохранять как полный файл");
            } catch (java.io.IOException expected) {
                assertTrue(expected.getMessage().contains("206"));
            }
            assertEquals(0, output.size());
        }
    }
}
