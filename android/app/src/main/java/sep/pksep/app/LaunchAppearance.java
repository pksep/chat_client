package sep.pksep.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.drawable.ColorDrawable;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

final class LaunchAppearance {
    private static final String PREFS = "launch_appearance";
    private static final String DARK_THEME = "dark_theme";
    private static final int LIGHT_BACKGROUND = 0xFFF8F9FD;
    private static final int DARK_BACKGROUND = 0xFF212531;

    private LaunchAppearance() {}

    static boolean isDark(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(DARK_THEME, false);
    }

    static int backgroundColor(Context context) {
        return isDark(context) ? DARK_BACKGROUND : LIGHT_BACKGROUND;
    }

    static void setDark(Context context, boolean dark) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(DARK_THEME, dark)
            .apply();
        // Disabling the alias that launched the current task makes Android
        // finish the visible activity, even with DONT_KILL_APP.
        updateLauncherIcon(context, dark, false);
    }

    static void finishLauncherIconUpdate(Context context) {
        updateLauncherIcon(context, isDark(context), true);
    }

    static void applySystemBars(Activity activity) {
        boolean dark = isDark(activity);
        int color = dark ? DARK_BACKGROUND : LIGHT_BACKGROUND;
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(color));
        activity.getWindow().getDecorView().setBackgroundColor(color);
        android.view.View content = activity.findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(color);
        activity.getWindow().setStatusBarColor(color);
        activity.getWindow().setNavigationBarColor(color);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            activity.getWindow(),
            activity.getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }

    private static void updateLauncherIcon(
        Context context,
        boolean dark,
        boolean disablePrevious
    ) {
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
        if (!enabledByDefault &&
            enabledState != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
            manager.setComponentEnabledSetting(
                enabled,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            );
        }
        if (!disablePrevious) return;
        int disabledState = manager.getComponentEnabledSetting(disabled);
        boolean disabledByDefault = disabled.equals(darkIcon) &&
            disabledState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT;
        if (!disabledByDefault &&
            disabledState != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
            manager.setComponentEnabledSetting(
                disabled,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            );
        }
    }
}
