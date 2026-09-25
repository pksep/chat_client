package sep.pksep.app;

import android.content.Context;
import android.content.Intent;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.ImageView;

import org.json.JSONArray;

/** Keeps the original app logo visible while the real WebView is prepared. */
final class PreparedStartupView extends FrameLayout {
    // splash_icon has the Android splash safe-zone baked into a 288 dp canvas.
    // Keeping its intrinsic canvas size prevents the logo from shrinking when
    // the system splash hands off to this view.
    private static final int SPLASH_ICON_BOX_DP = 288;

    PreparedStartupView(Context context, Intent intent, boolean topicLaunch) {
        super(context);
        setClickable(true);
        setBackgroundColor(LaunchAppearance.backgroundColor(context));
        setContentDescription("startup-logo");

        ImageView logo = new ImageView(context);
        logo.setImageResource(LaunchAppearance.isDark(context)
            ? R.drawable.splash_icon_dark
            : R.drawable.splash_icon_light);
        logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        addView(
            logo,
            new FrameLayout.LayoutParams(
                dp(SPLASH_ICON_BOX_DP),
                dp(SPLASH_ICON_BOX_DP),
                Gravity.CENTER
            )
        );
    }

    void render(JSONArray rows, boolean offline) {
        // История продолжает готовиться в фоне; стартовый кадр остаётся логотипом.
    }

    void renderUpdating(JSONArray rows) {
        // Не заменяем логотип промежуточным списком или экраном переписки.
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
