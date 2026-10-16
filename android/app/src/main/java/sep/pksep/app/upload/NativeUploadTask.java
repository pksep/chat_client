package sep.pksep.app.upload;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.IOException;

public final class NativeUploadTask {
    public interface Checkpoint { void save(JSONObject state) throws Exception; }
    public interface Progress { void update(int index, int percent); }
    public static JSONObject run(JSONObject state, File directory, NativeUploadApi api,
        Checkpoint checkpoint, Progress progress) throws Exception {
        JSONArray files = state.getJSONArray("files");
        JSONArray medias = new JSONArray();
        for (int i = 0; i < files.length(); i++) {
            JSONObject item = files.getJSONObject(i);
            JSONObject completed = item.optJSONObject("completed");
            if (completed == null) {
                File file = new File(directory, i + ".bin");
                if (!file.isFile() || file.length() != item.getLong("size"))
                    throw new IOException("Локальная копия вложения недоступна");
                JSONObject metadata = new JSONObject().put("originName", item.getString("originName"))
                    .put("size", item.getLong("size")).put("contentType", item.getString("contentType"))
                    .put("isMedia", item.optBoolean("isMedia"));
                metadata.put("clientTraceId", state.getString("traceId"));
                JSONObject target = item.optJSONObject("target");
                if (file.length() >= 32L * 1024 * 1024 && !item.optBoolean("uploaded")) {
                    final int index = i;
                    try {
                        target = uploadMultipart(state, item, metadata, file, api, checkpoint,
                            (bytes, total) -> progress.update(index, (int) (bytes * 100 / Math.max(1, total))));
                    } catch (NativeUploadApi.ApiException error) {
                        if (error.status == 404 || error.status == 410) {
                            item.remove("multipartId"); checkpoint.save(state);
                            throw new IOException("Сессия загрузки истекла", error);
                        }
                        throw error;
                    }
                    item.put("target", target).put("uploaded", true); checkpoint.save(state);
                }
                if (target == null) {
                    target = api.post("/media/upload-target", metadata);
                    item.put("target", target); checkpoint.save(state);
                }
                if (!item.optBoolean("uploaded")) {
                    final int index = i;
                    try {
                        api.put(target.getString("uploadUrl"), file, item.getString("contentType"),
                            (bytes, total) -> progress.update(index, (int) (bytes * 100 / Math.max(1, total))));
                    } catch (NativeUploadApi.ApiException error) {
                        if (error.status == 401 || error.status == 403) {
                            item.remove("target"); checkpoint.save(state);
                            throw new IOException("Ссылка загрузки истекла, запросим новую", error);
                        }
                        throw error;
                    }
                    item.put("uploaded", true); checkpoint.save(state);
                }
                JSONObject ex = item.optJSONObject("ex");
                if (ex != null) {
                    for (String dimension : new String[] { "width", "height", "previewWidth", "previewHeight" })
                        if (ex.has(dimension)) metadata.put(dimension, ex.get(dimension));
                }
                metadata.put("objectName", target.getString("objectName"));
                completed = api.post("/media/upload", metadata);
                item.put("completed", completed); checkpoint.save(state);
            }
            medias.put(new JSONObject()
                .put("path", completed.getString("objectName"))
                .put("thumbnailPath", completed.opt("thumbnailObjectName"))
                .put("originName", item.getString("originName"))
                .put("size", item.getLong("size"))
                .put("type", item.getString("type"))
                .put("ex", completed.optJSONObject("ex")));
        }
        JSONObject message = new JSONObject(state.getJSONObject("message").toString());
        message.put("medias", medias);
        // Повтор после потери ответа безопасен: clientId не меняется.
        return api.post("/messages/native-upload", message);
    }

    private static JSONObject uploadMultipart(JSONObject state, JSONObject item, JSONObject metadata, File file,
        NativeUploadApi api, Checkpoint checkpoint, NativeUploadApi.Progress progress) throws Exception {
        String id = item.optString("multipartId");
        JSONObject session;
        if (id.isEmpty()) {
            session = api.post("/media/multipart/init", metadata);
            id = session.getString("uploadId");
            item.put("multipartId", id); checkpoint.save(state);
        } else {
            session = api.get("/media/multipart/" + id + "/status");
        }
        if ("completed".equals(session.optString("status"))) return session.getJSONObject("completed");
        java.util.Set<Integer> uploaded = new java.util.HashSet<>();
        JSONArray parts = session.optJSONArray("uploadedParts");
        if (parts != null) for (int i = 0; i < parts.length(); i++) uploaded.add(parts.getJSONObject(i).getInt("partNumber"));
        long chunkSize = session.getLong("chunkSize");
        if (chunkSize <= 0) throw new IOException("Некорректный размер части загрузки");
        for (int part = 1; part <= session.getInt("partCount"); part++) {
            if (uploaded.contains(part)) continue;
            long offset = (part - 1) * chunkSize;
            if (offset >= file.length()) throw new IOException("Некорректный номер части загрузки");
            api.putPart("/media/multipart/" + id + "/parts/" + part, file, offset, Math.min(chunkSize, file.length() - offset),
                (bytes, total) -> progress.update(offset + bytes, file.length()));
        }
        return api.post("/media/multipart/" + id + "/complete", new JSONObject());
    }
}
