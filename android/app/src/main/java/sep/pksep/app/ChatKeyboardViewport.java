package sep.pksep.app;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.Interpolator;
import android.webkit.WebView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Передаёт движение IME композитору чата, не перевёрстывая WebView каждый кадр. */
public final class ChatKeyboardViewport implements AutoCloseable {
    interface FrameListener {
        void onFrame(int bottom, String phase);
        default void onAnimation(int from, int to, long duration, long startedAt, double[] fractions) {}
        default void onDismissOverlay() {}
    }

    private final Window window;
    private final View webView;
    private final ViewGroup parent;
    private final FrameListener listener;
    private final int originalSoftInputMode;
    private final Set<WindowInsetsAnimationCompat> animations = new HashSet<>();
    private WindowInsetsCompat targetInsets;
    private int bottom;
    private boolean closed;
    private WindowInsetsAnimationCompat compositorAnimation;
    private boolean overlayOpen;
    private OverlayBackRegistration overlayBackRegistration;

    final WindowInsetsAnimationCompat.Callback animationCallback =
        new WindowInsetsAnimationCompat.Callback(
            WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE
        ) {
            @Override public void onPrepare(WindowInsetsAnimationCompat animation) {
                if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) {
                    if (animations.isEmpty()) listener.onFrame(bottom, "prepare");
                    animations.add(animation);
                }
            }

            @Override public WindowInsetsCompat onProgress(
                WindowInsetsCompat insets,
                List<WindowInsetsAnimationCompat> runningAnimations
            ) {
                if (compositorAnimation == null) publish(insets, "progress");
                else bottom = keyboardBottom(insets);
                return withoutIme(insets);
            }

            @Override public WindowInsetsAnimationCompat.BoundsCompat onStart(
                WindowInsetsAnimationCompat animation,
                WindowInsetsAnimationCompat.BoundsCompat bounds
            ) {
                if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0 &&
                    targetInsets != null && compositorAnimation != animation) {
                    compositorAnimation = animation;
                    int target = keyboardBottom(targetInsets);
                    Interpolator interpolator = animation.getInterpolator();
                    double[] fractions = new double[33];
                    for (int i = 0; i < fractions.length; i++) {
                        float fraction = i / (float) (fractions.length - 1);
                        fractions[i] = interpolator == null ? fraction : interpolator.getInterpolation(fraction);
                    }
                    // Следуем единственной системной анимации. Перехват IME отменял
                    // начавшееся открытие и запускал его повторно, вызывая рывок.
                    listener.onAnimation(bottom, target, Math.max(1L, animation.getDurationMillis()),
                        System.currentTimeMillis(), fractions);
                }
                return bounds;
            }

            @Override public void onEnd(WindowInsetsAnimationCompat animation) {
                if (compositorAnimation == animation) compositorAnimation = null;
                if (animations.remove(animation) && animations.isEmpty()) sync();
            }
        };

    public static ChatKeyboardViewport attach(Activity activity, WebView webView) {
        // На старых Android сохраняем системный adjustResize.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R ||
            !(webView.getParent() instanceof ViewGroup)) return null;
        return new ChatKeyboardViewport(activity.getWindow(), webView, new FrameListener() {
            @Override public void onFrame(int bottom, String phase) {
                webView.evaluateJavascript(
                    "window.__sepAndroidKeyboard?.(" + bottom + ",'" + phase + "')", null);
            }
            @Override public void onAnimation(int from, int to, long duration, long startedAt, double[] fractions) {
                webView.evaluateJavascript("window.__sepAndroidKeyboardAnimate?.(" + from + "," +
                    to + "," + duration + "," + startedAt + "," + Arrays.toString(fractions) + ")", null);
            }
            @Override public void onDismissOverlay() {
                webView.evaluateJavascript("window.__sepAndroidDismissComposerOverlay?.()", null);
            }
        });
    }

    ChatKeyboardViewport(Window window, View webView, FrameListener listener) {
        this.window = window;
        this.webView = webView;
        this.listener = listener;
        parent = (ViewGroup) webView.getParent();
        originalSoftInputMode = window.getAttributes().softInputMode;
        window.setSoftInputMode(
            (originalSoftInputMode & ~WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST) |
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
        );
        ViewCompat.setWindowInsetsAnimationCallback(parent, animationCallback);
        ViewCompat.setOnApplyWindowInsetsListener(parent, (view, insets) -> {
            targetInsets = insets;
            if (animations.isEmpty()) publish(insets, "end");
            // EdgeToEdge продолжает учитывать системные панели, но IME уже обрабатывает чат.
            return withoutIme(insets);
        });
        sync();
        ViewCompat.requestApplyInsets(parent);
    }

    public void sync() {
        if (!animations.isEmpty()) return;
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(parent);
        publish(insets != null ? insets : targetInsets, "end");
    }

    private int bottomMargin() {
        return ((ViewGroup.MarginLayoutParams) webView.getLayoutParams()).bottomMargin;
    }

    public void setOverlayOpen(boolean open) {
        overlayOpen = open;
        if (Build.VERSION.SDK_INT < 33) return;
        if (open && overlayBackRegistration == null) {
            overlayBackRegistration = new OverlayBackRegistration(window, this::dismissOverlay);
        } else if (!open && overlayBackRegistration != null) {
            overlayBackRegistration.close();
            overlayBackRegistration = null;
        }
    }

    void dismissOverlay() {
        if (!overlayOpen) return;
        setOverlayOpen(false);
        listener.onDismissOverlay();
    }

    private static final class OverlayBackRegistration {
        private final OnBackInvokedDispatcher dispatcher;
        private final OnBackInvokedCallback callback;
        OverlayBackRegistration(Window window, Runnable dismiss) {
            dispatcher = window.getOnBackInvokedDispatcher();
            callback = dismiss::run;
            if (dispatcher != null) dispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_OVERLAY, callback);
        }
        void close() {
            if (dispatcher != null) dispatcher.unregisterOnBackInvokedCallback(callback);
        }
    }

    private int keyboardBottom(WindowInsetsCompat insets) {
        return Math.max(0, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom - bottomMargin());
    }

    private void publish(WindowInsetsCompat insets, String phase) {
        if (closed || insets == null) return;
        bottom = keyboardBottom(insets);
        listener.onFrame(bottom, phase);
    }

    private static WindowInsetsCompat withoutIme(WindowInsetsCompat insets) {
        return new WindowInsetsCompat.Builder(insets)
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
            .setVisible(WindowInsetsCompat.Type.ime(), false)
            .build();
    }

    @Override public void close() {
        if (closed) return;
        closed = true;
        setOverlayOpen(false);
        compositorAnimation = null;
        animations.clear();
        ViewCompat.setWindowInsetsAnimationCallback(parent, null);
        ViewCompat.setOnApplyWindowInsetsListener(parent, null);
        listener.onFrame(0, "end");
        window.setSoftInputMode(originalSoftInputMode);
        ViewCompat.requestApplyInsets(parent);
    }
}
