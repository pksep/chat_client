package sep.pksep.app.upload;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

public final class NativeUploadStore {
    public static File directory(Context context, String id) throws IOException {
        if (id == null || !id.matches("[a-zA-Z0-9-]{1,100}")) throw new IOException("Некорректный ID отправки");
        File directory = new File(context.getNoBackupFilesDir(), "pending-uploads/" + id);
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Не удалось подготовить отправку");
        return directory;
    }
    public static synchronized JSONObject read(Context context, String id) throws Exception {
        AtomicFile file = new AtomicFile(new File(directory(context, id), "job.json"));
        try { return new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8)); }
        catch (FileNotFoundException missing) { return null; }
    }
    public static synchronized void save(Context context, String id, JSONObject state) throws Exception {
        state.put("updatedAt", System.currentTimeMillis());
        AtomicFile file = new AtomicFile(new File(directory(context, id), "job.json"));
        FileOutputStream out = file.startWrite();
        try {
            out.write(state.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(out);
        } catch (Exception error) { file.failWrite(out); throw error; }
    }
    public static synchronized void saveActive(Context context, String id, JSONObject state) throws Exception {
        JSONObject current = read(context, id);
        if (current != null && "cancelled".equals(current.optString("status")))
            throw new java.util.concurrent.CancellationException();
        save(context, id, state);
    }

    public static synchronized void cleanup(Context context, String keepId) {
        File root = new File(context.getNoBackupFilesDir(), "pending-uploads");
        File[] directories = root.listFiles();
        if (directories == null) return;
        long cutoff = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000;
        for (File directory : directories) {
            if (!directory.isDirectory() || directory.getName().equals(keepId)) continue;
            try {
                if (!directory.getCanonicalFile().getParentFile().equals(root.getCanonicalFile())) continue;
                JSONObject state = read(context, directory.getName());
                String status = state == null ? "missing" : state.optString("status");
                if ("queued".equals(status) || "uploading".equals(status)) continue;
                long updatedAt = state == null ? directory.lastModified()
                    : state.optLong("updatedAt", new File(directory, "job.json").lastModified());
                if (updatedAt >= cutoff) continue;
                // В этом каталоге только наша копия вложений и журнал очереди.
                File[] files = directory.listFiles();
                if (files != null) for (File file : files) if (file.isFile()) file.delete();
                directory.delete();
            } catch (Exception ignored) { /* Повторим очистку при следующей отправке. */ }
        }
    }
}
