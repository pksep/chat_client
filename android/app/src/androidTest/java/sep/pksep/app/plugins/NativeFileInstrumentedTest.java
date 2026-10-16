package sep.pksep.app.plugins;

import android.app.Instrumentation;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.appcompat.app.AppCompatActivity;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;
import sep.pksep.app.MediaRegressionActivity;
import sep.pksep.app.sync.ChatBackgroundSyncStore;
import sep.pksep.app.upload.NativeUploadStore;
import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeFileInstrumentedTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void findsPdfInMediaStoreAndHandsItsUriToViewer() throws Exception {
        try (ActivityScenario<MediaRegressionActivity> activity = ActivityScenario.launch(MediaRegressionActivity.class);
             Fixture fixture = new Fixture(activity)) {
            CapturedCall status = new CapturedCall(fixture.options());
            fixture.plugin.getFileStatus(status);
            JSObject downloaded = status.await();
            assertNull(status.errorCode);
            assertTrue(downloaded.getBool("downloaded"));
            assertEquals(fixture.uri.toString(), downloaded.getString("path"));
            IntentFilter filter = new IntentFilter(Intent.ACTION_VIEW);
            filter.addDataType("application/pdf");
            Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
            Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(filter,
                new Instrumentation.ActivityResult(Activity.RESULT_OK, null), true);
            try {
                CapturedCall open = new CapturedCall(fixture.options().put("localUri", downloaded.getString("path")));
                fixture.plugin.openDownloadedFile(open);
                JSObject opened = open.await();
                assertNull(open.errorCode);
                assertEquals(fixture.uri.toString(), opened.getString("path"));
                assertEquals("application/pdf", opened.getString("mimeType"));
                assertEquals(1, monitor.getHits());
                assertTrue(opened.getJSObject("timings").getInt("lookupMs") >= 0);
                assertTrue(opened.getJSObject("timings").getInt("queueMs") >= 0);
                assertTrue(opened.getJSObject("timings").getInt("launchMs") >= 0);
            } finally { instrumentation.removeMonitor(monitor); }
        }
    }

    @Test public void reportsDeletedLocalPdfWithoutLaunchingViewer() throws Exception {
        try (ActivityScenario<MediaRegressionActivity> activity = ActivityScenario.launch(MediaRegressionActivity.class);
             Fixture fixture = new Fixture(activity)) {
            context.getContentResolver().delete(fixture.uri, null, null);
            CapturedCall open = new CapturedCall(fixture.options().put("localUri", fixture.uri.toString()));
            fixture.plugin.openDownloadedFile(open);
            open.await();
            assertEquals("FILE_NOT_FOUND", open.errorCode);
            CapturedCall status = new CapturedCall(fixture.options());
            fixture.plugin.getFileStatus(status);
            assertFalse(status.await().getBool("downloaded"));
        }
    }

    @Test public void cancellationBeforeNativePreparationPreventsLaterEnqueue() throws Exception {
        String id = UUID.randomUUID().toString();
        TestPlugin plugin = new TestPlugin();
        ChatBackgroundSyncStore.saveSession(context, "test-token", "test-user", "http://127.0.0.1:1");
        try {
            CapturedCall cancel = new CapturedCall(new JSObject().put("id", id));
            plugin.cancelMessageUpload(cancel); cancel.await();
            assertNull(cancel.errorCode);
            CapturedCall prepare = new CapturedCall(new JSObject().put("id", id).put("userId", "test-user")
                .put("apiUrl", "http://127.0.0.1:1").put("traceId", "test-trace")
                .put("message", new JSONObject().put("ex", new JSONObject().put("clientId", id)))
                .put("files", new JSONArray().put(new JSONObject().put("originName", "test.mp4").put("size", 3))));
            plugin.prepareMessageUpload(prepare);
            assertEquals("cancelled", prepare.await().getString("status"));
            assertNull(prepare.errorCode);
            CapturedCall enqueue = new CapturedCall(new JSObject().put("id", id));
            plugin.enqueueMessageUpload(enqueue); enqueue.await();
            assertNotNull("Отменённое сообщение не должно вставать в очередь", enqueue.errorCode);
            assertEquals("cancelled", NativeUploadStore.read(context, id).getString("status"));
        } finally {
            plugin.close(); ChatBackgroundSyncStore.clearSession(context);
            File directory = NativeUploadStore.directory(context, id);
            File[] files = directory.listFiles();
            if (files != null) for (File file : files) file.delete();
            directory.delete();
        }
    }

    private static final class CapturedCall extends PluginCall {
        final CompletableFuture<JSObject> result = new CompletableFuture<>();
        volatile String errorCode;
        CapturedCall(JSObject options) { super(null, "NativeFile", "test", "test", options); }
        @Override public void resolve(JSObject data) { result.complete(data); }
        @Override public void resolve() { result.complete(new JSObject()); }
        @Override public void reject(String message, String code, Exception error, JSObject data) {
            errorCode = code == null ? message : code;
            result.complete(new JSObject());
        }
        JSObject await() throws Exception { return result.get(10, TimeUnit.SECONDS); }
    }

    private final class Fixture implements AutoCloseable {
        final String name = "media-regression-" + UUID.randomUUID() + ".pdf";
        final Uri uri;
        final int size;
        final TestPlugin plugin = new TestPlugin();
        Fixture(ActivityScenario<MediaRegressionActivity> activity) throws Exception {
            activity.onActivity(value -> plugin.activity = value);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            PdfDocument pdf = new PdfDocument();
            try {
                PdfDocument.Page page = pdf.startPage(new PdfDocument.PageInfo.Builder(200, 200, 1).create());
                page.getCanvas().drawColor(android.graphics.Color.WHITE);
                pdf.finishPage(page); pdf.writeTo(bytes);
            } finally { pdf.close(); }
            size = bytes.size();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            assertNotNull(uri);
            try (OutputStream output = context.getContentResolver().openOutputStream(uri, "w")) { bytes.writeTo(output); }
            values.clear(); values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            context.getContentResolver().update(uri, values, null, null);
        }
        JSObject options() {
            return new JSObject().put("url", "http://127.0.0.1:1/unused.pdf").put("fileName", name)
                .put("mimeType", "application/pdf").put("size", size);
        }
        @Override public void close() {
            plugin.close();
            context.getContentResolver().delete(uri, null, null);
        }
    }

    private final class TestPlugin extends NativeFilePlugin {
        AppCompatActivity activity;
        @Override public Context getContext() { return context; }
        @Override public AppCompatActivity getActivity() { return activity; }
        void close() { handleOnDestroy(); }
    }
}
