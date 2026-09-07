package sep.pksep.app;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class NotificationLaunchActivity extends AppCompatActivity {
    static final String EXTRA_PREPARED_NOTIFICATION_LAUNCH =
        "preparedNotificationLaunch";

    private boolean mainActivityStarted = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(true);
        insetsController.setAppearanceLightNavigationBars(true);

        View startupView = NotificationTopicStartupView.create(this, getIntent());
        setContentView(startupView);

        // Let Android commit the lightweight native topic frame before the
        // WebView activity starts its heavier initialization on the UI thread.
        startupView.postOnAnimation(
            () -> startupView.postOnAnimation(this::startMainActivity)
        );
    }

    private void startMainActivity() {
        if (mainActivityStarted || isFinishing()) {
            return;
        }

        mainActivityStarted = true;
        Intent mainIntent = new Intent(getIntent());
        mainIntent.setClass(this, MainActivity.class);
        mainIntent.putExtra(EXTRA_PREPARED_NOTIFICATION_LAUNCH, true);
        mainIntent.addFlags(
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP |
            Intent.FLAG_ACTIVITY_NO_ANIMATION
        );
        startActivity(mainIntent);
        finish();
        overridePendingTransition(0, 0);
    }
}
