package sep.pksep.app.plugins;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

import sep.pksep.app.ScreenShareForegroundService;

@CapacitorPlugin(name = "AndroidScreenShare")
public class AndroidScreenSharePlugin extends Plugin {
    private static final String EVENT_SCREEN_SHARE_FRAME = "screenShareFrame";
    private static final String EVENT_SCREEN_SHARE_STOPPED = "screenShareStopped";
    private static final int MAX_FRAME_LONG_EDGE = 1280;
    private static final int JPEG_QUALITY = 62;
    private static final long FRAME_INTERVAL_MS = 1000L / 12L;
    private static final long FOREGROUND_SERVICE_TIMEOUT_MS = 5000L;

    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private DisplayManager displayManager;
    private DisplayManager.DisplayListener displayListener;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private MediaProjection.Callback mediaProjectionCallback;
    private int captureWidth;
    private int captureHeight;
    private int captureDensityDpi;
    private long lastFrameAt;
    private boolean stopping;

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP);
        call.resolve(result);
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            call.reject("Демонстрация экрана поддерживается только на Android 5 и выше");
            return;
        }

        if (mediaProjection != null) {
            call.resolve();
            return;
        }

        MediaProjectionManager projectionManager = getProjectionManager();
        if (projectionManager == null) {
            call.reject("Не удалось открыть системный запрос демонстрации экрана");
            return;
        }

        Intent intent = projectionManager.createScreenCaptureIntent();
        startActivityForResult(call, intent, "handleScreenSharePermission");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopCapture(true);
        call.resolve();
    }

    @ActivityCallback
    private void handleScreenSharePermission(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (
            result == null ||
            result.getResultCode() != Activity.RESULT_OK ||
            result.getData() == null
        ) {
            call.reject("Пользователь отменил демонстрацию экрана");
            return;
        }

        try {
            startForegroundService();
            runAfterForegroundServiceStarted(call, result.getResultCode(), result.getData());
        } catch (Exception error) {
            stopCapture(true);
            call.reject("Не удалось запустить демонстрацию экрана: " + error.getMessage(), error);
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopCapture(true);
        super.handleOnDestroy();
    }

    private MediaProjectionManager getProjectionManager() {
        return (MediaProjectionManager) getContext().getSystemService(
            Context.MEDIA_PROJECTION_SERVICE
        );
    }

    private void runAfterForegroundServiceStarted(
        PluginCall call,
        int resultCode,
        Intent resultData
    ) {
        Handler mainHandler = new Handler(Looper.getMainLooper());
        AtomicBoolean completed = new AtomicBoolean(false);
        Runnable timeout = () -> {
            if (!completed.compareAndSet(false, true)) {
                return;
            }

            stopCapture(true);
            call.reject("Не удалось запустить сервис демонстрации экрана");
        };

        mainHandler.postDelayed(timeout, FOREGROUND_SERVICE_TIMEOUT_MS);
        ScreenShareForegroundService.runWhenStarted(() ->
            mainHandler.post(() -> {
                if (!completed.compareAndSet(false, true)) {
                    return;
                }

                mainHandler.removeCallbacks(timeout);

                try {
                    MediaProjectionManager projectionManager = getProjectionManager();
                    if (projectionManager == null) {
                        call.reject("Не удалось получить доступ к демонстрации экрана");
                        return;
                    }

                    mediaProjection = projectionManager.getMediaProjection(
                        resultCode,
                        resultData
                    );

                    if (mediaProjection == null) {
                        call.reject("Не удалось запустить демонстрацию экрана");
                        stopForegroundService();
                        return;
                    }

                    startCapture();
                    call.resolve();
                } catch (Exception error) {
                    stopCapture(true);
                    call.reject(
                        "Не удалось запустить демонстрацию экрана: " + error.getMessage(),
                        error
                    );
                }
            })
        );
    }

    private void startCapture() {
        lastFrameAt = 0L;
        stopping = false;

        captureThread = new HandlerThread("AndroidScreenShareCapture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());

        displayManager = (DisplayManager) getContext().getSystemService(
            Context.DISPLAY_SERVICE
        );
        displayListener = new DisplayManager.DisplayListener() {
            @Override
            public void onDisplayAdded(int displayId) {}

            @Override
            public void onDisplayRemoved(int displayId) {}

            @Override
            public void onDisplayChanged(int displayId) {
                if (captureHandler != null) {
                    captureHandler.post(() -> recreateCaptureSurfaceIfNeeded());
                }
            }
        };

        if (displayManager != null) {
            displayManager.registerDisplayListener(displayListener, captureHandler);
        }

        mediaProjectionCallback = new MediaProjection.Callback() {
            @Override
            public void onStop() {
                stopCapture(false, false);
                notifyListeners(EVENT_SCREEN_SHARE_STOPPED, new JSObject());
            }
        };
        mediaProjection.registerCallback(mediaProjectionCallback, captureHandler);

        createCaptureSurface();
    }

    private void createCaptureSurface() {
        DisplayMetrics metrics = resolveCaptureMetrics();
        captureWidth = metrics.widthPixels;
        captureHeight = metrics.heightPixels;
        captureDensityDpi = metrics.densityDpi;

        imageReader = ImageReader.newInstance(
            captureWidth,
            captureHeight,
            PixelFormat.RGBA_8888,
            2
        );
        imageReader.setOnImageAvailableListener(reader -> {
            long now = System.currentTimeMillis();
            if (now - lastFrameAt < FRAME_INTERVAL_MS) {
                discardLatestImage(reader);
                return;
            }

            lastFrameAt = now;
            emitLatestImage(reader, now);
        }, captureHandler);

        virtualDisplay = mediaProjection.createVirtualDisplay(
            "SepChatScreenShare",
            captureWidth,
            captureHeight,
            captureDensityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(),
            null,
            captureHandler
        );
    }

    private void recreateCaptureSurfaceIfNeeded() {
        if (mediaProjection == null || stopping) {
            return;
        }

        DisplayMetrics metrics = resolveCaptureMetrics();

        if (
            metrics.widthPixels == captureWidth &&
            metrics.heightPixels == captureHeight &&
            metrics.densityDpi == captureDensityDpi
        ) {
            return;
        }

        releaseCaptureSurface();
        createCaptureSurface();
    }

    private void releaseCaptureSurface() {
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }

        if (imageReader != null) {
            imageReader.setOnImageAvailableListener(null, null);
            imageReader.close();
            imageReader = null;
        }
    }

    private DisplayMetrics resolveCaptureMetrics() {
        DisplayMetrics realMetrics = new DisplayMetrics();
        WindowManager windowManager =
            (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);

        if (windowManager != null) {
            windowManager.getDefaultDisplay().getRealMetrics(realMetrics);
        } else {
            realMetrics.setTo(getContext().getResources().getDisplayMetrics());
        }

        DisplayMetrics captureMetrics = new DisplayMetrics();
        captureMetrics.widthPixels = Math.max(realMetrics.widthPixels, 1);
        captureMetrics.heightPixels = Math.max(realMetrics.heightPixels, 1);
        captureMetrics.densityDpi = realMetrics.densityDpi;
        return captureMetrics;
    }

    private void discardLatestImage(ImageReader reader) {
        Image image = null;
        try {
            image = reader.acquireLatestImage();
        } finally {
            if (image != null) {
                image.close();
            }
        }
    }

    private void emitLatestImage(ImageReader reader, long timestamp) {
        Image image = null;
        Bitmap paddedBitmap = null;
        Bitmap frameBitmap = null;

        try {
            image = reader.acquireLatestImage();
            if (image == null) {
                return;
            }

            Image.Plane[] planes = image.getPlanes();
            if (planes.length == 0) {
                return;
            }

            ByteBuffer buffer = planes[0].getBuffer();
            int pixelStride = planes[0].getPixelStride();
            int rowStride = planes[0].getRowStride();
            int rowPadding = rowStride - pixelStride * captureWidth;
            int paddedWidth = captureWidth + rowPadding / pixelStride;

            paddedBitmap = Bitmap.createBitmap(
                paddedWidth,
                captureHeight,
                Bitmap.Config.ARGB_8888
            );
            paddedBitmap.copyPixelsFromBuffer(buffer);
            frameBitmap = Bitmap.createBitmap(paddedBitmap, 0, 0, captureWidth, captureHeight);

            Bitmap payloadBitmap = scaleFrameForPayload(frameBitmap);
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            payloadBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, outputStream);

            JSObject payload = new JSObject();
            payload.put("data", Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP));
            payload.put("width", payloadBitmap.getWidth());
            payload.put("height", payloadBitmap.getHeight());
            payload.put("timestamp", timestamp);
            notifyListeners(EVENT_SCREEN_SHARE_FRAME, payload);

            if (payloadBitmap != frameBitmap) {
                payloadBitmap.recycle();
            }
        } catch (Exception ignored) {
            // Пропускаем поврежденный кадр, следующий ImageReader отдаст заново.
        } finally {
            if (frameBitmap != null) {
                frameBitmap.recycle();
            }
            if (paddedBitmap != null) {
                paddedBitmap.recycle();
            }
            if (image != null) {
                image.close();
            }
        }
    }

    private Bitmap scaleFrameForPayload(Bitmap source) {
        int width = source.getWidth();
        int height = source.getHeight();
        int longEdge = Math.max(width, height);

        if (longEdge <= MAX_FRAME_LONG_EDGE) {
            return source;
        }

        float scale = (float) MAX_FRAME_LONG_EDGE / (float) longEdge;
        int scaledWidth = Math.max(Math.round(width * scale), 1);
        int scaledHeight = Math.max(Math.round(height * scale), 1);

        return Bitmap.createScaledBitmap(source, scaledWidth, scaledHeight, true);
    }

    private void stopCapture(boolean notifyStopped) {
        stopCapture(notifyStopped, true);
    }

    private void stopCapture(boolean notifyStopped, boolean stopProjection) {
        if (stopping) {
            return;
        }

        stopping = true;

        if (displayManager != null && displayListener != null) {
            displayManager.unregisterDisplayListener(displayListener);
        }
        displayManager = null;
        displayListener = null;

        releaseCaptureSurface();

        if (mediaProjection != null) {
            if (mediaProjectionCallback != null) {
                mediaProjection.unregisterCallback(mediaProjectionCallback);
            }
            if (stopProjection) {
                mediaProjection.stop();
            }
            mediaProjection = null;
        }

        mediaProjectionCallback = null;

        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
            captureHandler = null;
        }

        stopForegroundService();

        if (notifyStopped) {
            notifyListeners(EVENT_SCREEN_SHARE_STOPPED, new JSObject());
        }

        stopping = false;
    }

    private void startForegroundService() {
        Intent intent = new Intent(getContext(), ScreenShareForegroundService.class);
        intent.setAction(ScreenShareForegroundService.ACTION_START);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }

    private void stopForegroundService() {
        Intent intent = new Intent(getContext(), ScreenShareForegroundService.class);
        intent.setAction(ScreenShareForegroundService.ACTION_STOP);
        getContext().startService(intent);
    }
}
