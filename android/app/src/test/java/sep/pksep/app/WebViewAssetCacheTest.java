package sep.pksep.app;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.nio.file.Files;
import static org.junit.Assert.*;

public class WebViewAssetCacheTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void updateRemovesOldWorkerButPreservesFilesAndCompiledCode() throws Exception {
        File root = temporary.newFolder("app");
        String[] preserved = {
            "cache/attachment.mp4", "code_cache/compiled", "shared_prefs/session.xml",
            "app_webview/Cache/image", "app_webview/Code Cache/script",
            "app_webview/Default/GPUCache/shader", "app_webview/Default/blob_storage/file",
            "app_webview/Default/IndexedDB/outbox", "app_webview/Default/Local Storage/session"
        };
        String[] removed = {
            "app_webview/Service Worker/Database/old-worker",
            "app_webview/Default/Service Worker/CacheStorage/old-index"
        };
        for (String path : preserved) seed(root, path);
        for (String path : removed) seed(root, path);
        assertTrue(WebViewAssetCache.clearLegacyServiceWorkers(root));
        for (String path : preserved) assertArrayEquals(new byte[] {1, 2, 3}, Files.readAllBytes(new File(root, path).toPath()));
        for (String path : removed) assertFalse(new File(root, path).exists());
        assertTrue(WebViewAssetCache.clearLegacyServiceWorkers(root));
    }

    private static void seed(File root, String path) throws Exception {
        File file = new File(root, path);
        Files.createDirectories(file.getParentFile().toPath());
        Files.write(file.toPath(), new byte[] {1, 2, 3});
    }
}
