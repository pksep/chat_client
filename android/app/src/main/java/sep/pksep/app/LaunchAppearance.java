package sep.pksep.app;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.PathInterpolator;

import androidx.core.graphics.Insets;
import androidx.core.graphics.ColorUtils;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.util.Arrays;

final class LaunchAppearance {
    private static final String PREFS = "launch_appearance";
    private static final String DARK_THEME = "dark_theme";
    private static final int LIGHT_BACKGROUND = 0xFFF8F9FD;
    private static final int DARK_BACKGROUND = 0xFF212531;
    private static final int LIGHT_STATUS_BAR = 0xFFFFFFFF;
    private static final int DARK_STATUS_BAR = 0xFF262A38;
    private static final long TRANSITION_DURATION_MS = 200L;

    private LaunchAppearance() {}

    static boolean isDark(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(DARK_THEME, false);
    }

    static int backgroundColor(Context context) {
        return isDark(context) ? DARK_BACKGROUND : LIGHT_BACKGROUND;
    }

    static int statusBarColor(Context context) {
        return isDark(context) ? DARK_STATUS_BAR : LIGHT_STATUS_BAR;
    }

    static void setDark(Context context, boolean dark) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(DARK_THEME, dark)
            .apply();
    }

    static void finishLauncherIconUpdate(Context context) {
        updateLauncherIcon(context, isDark(context));
    }

    static void applySystemBars(Activity activity) {
        applySystemBars(activity, null);
    }

    static void applySystemBars(Activity activity, View webView) {
        paintSystemBars(
            activity,
            backgroundColor(activity),
            statusBarColor(activity),
            webView
        );
    }

    static ValueAnimator animateSystemBars(
        Activity activity,
        int fromBackgroundColor,
        int toBackgroundColor,
        int fromStatusBarColor,
        int toStatusBarColor,
        View webView
    ) {
        if (
            fromBackgroundColor == toBackgroundColor &&
            fromStatusBarColor == toStatusBarColor
        ) {
            paintSystemBars(
                activity,
                toBackgroundColor,
                toStatusBarColor,
                webView
            );
            return null;
        }
        ValueAnimator animator = ValueAnimator.ofArgb(
            fromBackgroundColor,
            toBackgroundColor
        );
        animator.setDuration(TRANSITION_DURATION_MS);
        animator.setInterpolator(new PathInterpolator(0.25f, 0.1f, 0.25f, 1f));
        animator.addUpdateListener(animation -> {
            int statusBarColor = ColorUtils.blendARGB(
                fromStatusBarColor,
                toStatusBarColor,
                animation.getAnimatedFraction()
            );
            paintSystemBars(
                activity,
                (int) animation.getAnimatedValue(),
                statusBarColor,
                webView
            );
        });
        animator.start();
        return animator;
    }

    private static void paintSystemBars(
        Activity activity,
        int backgroundColor,
        int statusBarColor,
        View webView
    ) {
        activity.getWindow().setBackgroundDrawable(
            new ColorDrawable(backgroundColor)
        );
        activity.getWindow().getDecorView().setBackgroundColor(backgroundColor);
        View content = activity.findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(backgroundColor);
        if (webView != null) {
            webView.setBackgroundColor(backgroundColor);
            paintEdgeToEdgeOverlays(
                webView,
                statusBarColor,
                backgroundColor
            );
        }
        activity.getWindow().setStatusBarColor(statusBarColor);
        activity.getWindow().setNavigationBarColor(backgroundColor);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            activity.getWindow(),
            activity.getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(
            ColorUtils.calculateLuminance(statusBarColor) > 0.5d
        );
        controller.setAppearanceLightNavigationBars(
            ColorUtils.calculateLuminance(backgroundColor) > 0.5d
        );
    }

    private static void paintEdgeToEdgeOverlays(
        View webView,
        int statusBarColor,
        int navigationBarColor
    ) {
        if (!(webView.getParent() instanceof ViewGroup)) return;
        WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(webView);
        if (windowInsets == null) return;

        ViewGroup parent = (ViewGroup) webView.getParent();
        Insets statusBars = windowInsets.getInsets(
            WindowInsetsCompat.Type.statusBars() |
            WindowInsetsCompat.Type.displayCutout()
        );
        Insets navigationBars = windowInsets.getInsets(
            WindowInsetsCompat.Type.navigationBars()
        );
        for (int index = 0; index < parent.getChildCount(); index++) {
            View child = parent.getChildAt(index);
            if (child == webView) continue;
            boolean isStatusBarOverlay = statusBars.top > 0 &&
                child.getTop() == 0 &&
                child.getHeight() == statusBars.top;
            boolean isNavigationBarOverlay = navigationBars.bottom > 0 &&
                child.getBottom() == parent.getHeight() &&
                child.getHeight() == navigationBars.bottom;
            if (isStatusBarOverlay) child.setBackgroundColor(statusBarColor);
            if (isNavigationBarOverlay) {
                child.setBackgroundColor(navigationBarColor);
            }
        }
    }

    private static void updateLauncherIcon(Context context, boolean dark) {
        PackageManager manager = context.getPackageManager();
        ComponentName light = new ComponentName(
            context,
            context.getPackageName() + ".LightLauncherActivity"
        );
        ComponentName darkIcon = new ComponentName(
            context,
            context.getPackageName() + ".DarkLauncherActivity"
        );
        ComponentName enabled = dark ? darkIcon : light;
        ComponentName disabled = dark ? light : darkIcon;

        int enabledState = manager.getComponentEnabledSetting(enabled);
        boolean enabledByDefault = enabled.equals(light) &&
            enabledState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT;
        int disabledState = manager.getComponentEnabledSetting(disabled);
        boolean disabledByDefault = disabled.equals(darkIcon) &&
            disabledState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT;
        boolean alreadyUpdated = (
            enabledByDefault ||
            enabledState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        ) && (
            disabledByDefault ||
            disabledState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        );
        if (alreadyUpdated) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            manager.setComponentEnabledSettings(Arrays.asList(
                new PackageManager.ComponentEnabledSetting(
                    enabled,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
                ),
                new PackageManager.ComponentEnabledSetting(
                    disabled,
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
                )
            ));
            return;
        }

        manager.setComponentEnabledSetting(
            enabled,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        );
        manager.setComponentEnabledSetting(
            disabled,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        );
    }
}
