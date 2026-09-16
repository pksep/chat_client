package sep.pksep.app;

import java.io.File;
import java.io.IOException;

final class WebViewAssetCache {
    private WebViewAssetCache() {}

    static boolean clearLegacyServiceWorkers(File appDataDir) {
        try {
            File root = appDataDir.getCanonicalFile();
            boolean cleared = true;
            for (String path : new String[] {
                "app_webview/Service Worker", "app_webview/Default/Service Worker"
            }) {
                // Имена локальных ресурсов уже версионируются сборщиком, а index
                // Capacitor отдаёт с no-cache. Остальные кеши сбрасывать не нужно.
                cleared &= deleteWithin(new File(root, path), root);
            }
            return cleared;
        } catch (IOException error) {
            return false;
        }
    }

    private static boolean deleteWithin(File target, File root) throws IOException {
        if (!target.exists()) return true;
        if (!target.getCanonicalPath().startsWith(root.getPath() + File.separator)) return false;
        if (target.isDirectory()) {
            File[] children = target.listFiles();
            if (children == null) return false;
            for (File child : children) {
                if (!deleteWithin(child, root)) return false;
            }
        }
        return target.delete();
    }
}
