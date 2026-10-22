package sep.pksep.app;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Application;
import android.os.Build;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AccelerateInterpolator;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {30, 35}, manifest = Config.NONE, application = Application.class)
public class ChatKeyboardViewportTest {
    private Activity activity;
    private FrameLayout parent;
    private View webView;
    private ChatKeyboardViewport viewport;
    private WindowInsetsCompat childInsets;
    private final List<String> frames = new ArrayList<>();
    private int dismissedOverlays;
    private int animationStarts;
    private double[] animationFractions;

    @Before public void setup() {
        activity = Robolectric.buildActivity(Activity.class).setup().get();
        activity.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        parent = new FrameLayout(activity);
        webView = new View(activity);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(-1, -1);
        params.topMargin = 20;
        params.bottomMargin = 40;
        parent.addView(webView, params);
        parent.measure(View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(2400, View.MeasureSpec.EXACTLY));
        parent.layout(0, 0, 1080, 2400);
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            childInsets = insets;
            return WindowInsetsCompat.CONSUMED;
        });
        if (Build.VERSION.SDK_INT >= 30) {
            viewport = new ChatKeyboardViewport(activity.getWindow(), webView,
                new ChatKeyboardViewport.FrameListener() {
                    @Override public void onFrame(int bottom, String phase) { frames.add(phase + ":" + bottom); }
                    @Override public void onDismissOverlay() { dismissedOverlays++; }
                    @Override public void onAnimation(int from, int to, long duration, long startedAt, double[] fractions) {
                        animationStarts++;
                        assertEquals(0, from);
                        assertEquals(860, to);
                        assertEquals(250L, duration);
                        animationFractions = fractions;
                    }

                });
            ViewCompat.dispatchApplyWindowInsets(parent, insets(0));
        }
    }

    private WindowInsetsCompat insets(int keyboard) {
        return new WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.of(0, 20, 0, 40))
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, keyboard))
            .setVisible(WindowInsetsCompat.Type.ime(), keyboard > 0)
            .build();
    }

    private WindowInsetsAnimationCompat animation() {
        return new WindowInsetsAnimationCompat(WindowInsetsCompat.Type.ime(), null, 250L);
    }

    @Test public void openingAndClosingPublishActualFramesWithoutResizingChromium() {
        WindowInsetsAnimationCompat opening = animation();
        viewport.animationCallback.onPrepare(opening);
        ViewCompat.dispatchApplyWindowInsets(parent, insets(900));
        assertEquals("prepare:0", frames.get(frames.size() - 1));
        assertEquals(0, childInsets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
        assertEquals(40, childInsets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom);
        for (int keyboard : new int[] {100, 250, 500, 700, 900}) {
            viewport.animationCallback.onProgress(insets(keyboard), Collections.singletonList(opening));
            assertEquals("progress:" + (keyboard - 40), frames.get(frames.size() - 1));
            assertEquals(2340, webView.getHeight());
            assertEquals(-1, webView.getLayoutParams().height);
        }
        viewport.animationCallback.onEnd(opening);
        assertEquals("end:860", frames.get(frames.size() - 1));
        WindowInsetsAnimationCompat closing = animation();
        viewport.animationCallback.onPrepare(closing);
        ViewCompat.dispatchApplyWindowInsets(parent, insets(0));
        assertEquals("prepare:860", frames.get(frames.size() - 1));
        for (int keyboard : new int[] {800, 650, 400, 200, 0}) {
            viewport.animationCallback.onProgress(insets(keyboard), Collections.singletonList(closing));
            assertEquals("progress:" + Math.max(0, keyboard - 40), frames.get(frames.size() - 1));
            assertEquals(2340, webView.getHeight());
        }
        viewport.animationCallback.onEnd(closing);
        assertEquals("end:0", frames.get(frames.size() - 1));
    }

    @Test public void interruptedOpeningDoesNotSettleToItsOldTarget() {
        WindowInsetsAnimationCompat opening = animation();
        WindowInsetsAnimationCompat closing = animation();
        viewport.animationCallback.onPrepare(opening);
        ViewCompat.dispatchApplyWindowInsets(parent, insets(900));
        viewport.animationCallback.onProgress(insets(400), Collections.singletonList(opening));
        viewport.animationCallback.onPrepare(closing);
        ViewCompat.dispatchApplyWindowInsets(parent, insets(0));
        viewport.animationCallback.onEnd(opening);
        assertEquals("progress:360", frames.get(frames.size() - 1));
        viewport.animationCallback.onProgress(insets(0), Collections.singletonList(closing));
        viewport.animationCallback.onEnd(closing);
        assertEquals("end:0", frames.get(frames.size() - 1));
    }

    @Test public void systemAnimationStartsOnceAndDoesNotSendFramesAcrossWebViewBridge() {
        WindowInsetsAnimationCompat opening = new WindowInsetsAnimationCompat(
            WindowInsetsCompat.Type.ime(), new AccelerateInterpolator(), 250L);
        viewport.animationCallback.onPrepare(opening);
        ViewCompat.dispatchApplyWindowInsets(parent, insets(900));
        WindowInsetsAnimationCompat.BoundsCompat bounds = new WindowInsetsAnimationCompat.BoundsCompat(
            Insets.NONE, Insets.of(0, 0, 0, 900));
        viewport.animationCallback.onStart(opening, bounds);
        viewport.animationCallback.onStart(opening, bounds);
        assertEquals(1, animationStarts);
        assertEquals(0.25, animationFractions[16], 0.001);
        int bridgeCalls = frames.size();
        for (int keyboard : new int[] {100, 250, 500, 700, 900})
            viewport.animationCallback.onProgress(insets(keyboard), Collections.singletonList(opening));
        assertEquals(bridgeCalls, frames.size());
        viewport.animationCallback.onEnd(opening);
        assertEquals("end:860", frames.get(frames.size() - 1));
        assertEquals(2340, webView.getHeight());
    }

    @Test public void closeRestoresSystemModeAndResetsChat() {
        ViewCompat.dispatchApplyWindowInsets(parent, insets(900));
        viewport.close();
        assertEquals("end:0", frames.get(frames.size() - 1));
        assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
            activity.getWindow().getAttributes().softInputMode);
    }

    @Test public void backDismissesOnlyAttachmentWithoutChangingKeyboardPosition() {
        ViewCompat.dispatchApplyWindowInsets(parent, insets(900));
        viewport.setOverlayOpen(true);
        int count = frames.size();
        viewport.dismissOverlay();
        assertEquals(1, dismissedOverlays);
        assertEquals(count, frames.size());
        assertEquals("end:860", frames.get(frames.size() - 1));
        viewport.dismissOverlay();
        assertEquals(1, dismissedOverlays);
    }

    @Test @Config(sdk = 28) public void olderAndroidKeepsSystemResize() {
        assertNull(ChatKeyboardViewport.attach(activity, null));
        assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
            activity.getWindow().getAttributes().softInputMode);
    }
}
