package sep.pksep.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class StartupPackagingTest {
    @Test
    public void installedDexCanBeReadWithoutDecompression() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        int dexCount = 0;
        try (ZipFile apk = new ZipFile(context.getApplicationInfo().sourceDir)) {
            Enumeration<? extends ZipEntry> entries = apk.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                if (!entry.getName().matches("classes(?:\\d+)?\\.dex")) {
                    continue;
                }
                dexCount++;
                assertEquals(
                    "DEX не должен распаковываться при холодном запуске: " + entry.getName(),
                    ZipEntry.STORED,
                    entry.getMethod()
                );
            }
        }
        assertTrue("В установленной APK должен присутствовать DEX", dexCount > 0);
    }
}
