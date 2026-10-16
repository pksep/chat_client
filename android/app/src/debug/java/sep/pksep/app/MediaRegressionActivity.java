package sep.pksep.app;

import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;
import android.widget.TextView;

/** Изолированный экран для Android-тестов без WebView и подключения к чату. */
public final class MediaRegressionActivity extends AppCompatActivity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView text = new TextView(this);
        text.setText("Проверка фоновой отправки");
        setContentView(text);
    }
}
