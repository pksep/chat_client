package sep.pksep.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;

import java.io.File;

public class RuStoreProjectMigrationProvider extends ContentProvider {
    private static final String PUSH_PREFERENCES = "rustore_push";
    private static final String PREF_PROJECT_ID = "project_id";
    private static final String SDK_PREFERENCES = "vkpns_client_sdk";
    private static final String SDK_TOKEN_FILE_PREFIX = "vkpns_push_token";

    @Override
    public boolean onCreate() {
        Context context = getContext();
        if (context == null) {
            return false;
        }

        String currentProjectId = context.getString(R.string.rustore_push_project_id);
        SharedPreferences preferences = context.getSharedPreferences(
            PUSH_PREFERENCES,
            Context.MODE_PRIVATE
        );
        String previousProjectId = preferences.getString(PREF_PROJECT_ID, null);

        if (currentProjectId.equals(previousProjectId)) {
            return true;
        }

        boolean cleared = clearTokenFiles(context.getFilesDir());
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            cleared = clearTokenFiles(context.getNoBackupFilesDir()) && cleared;
        }
        cleared = context
            .getSharedPreferences(SDK_PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .remove("push_token")
            .remove("last_delivered_push_token")
            .remove("push_token_delivered_to_client_app")
            .commit() && cleared;

        if (cleared) {
            preferences.edit().putString(PREF_PROJECT_ID, currentProjectId).commit();
        }

        return true;
    }

    private boolean clearTokenFiles(File directory) {
        if (directory == null || !directory.exists()) {
            return true;
        }

        File[] files = directory.listFiles();
        if (files == null) {
            return true;
        }

        boolean cleared = true;
        for (File file : files) {
            if (file.isDirectory()) {
                cleared = clearTokenFiles(file) && cleared;
                continue;
            }

            if (file.getName().startsWith(SDK_TOKEN_FILE_PREFIX)) {
                cleared = file.delete() && cleared;
            }
        }

        return cleared;
    }

    @Override
    public Cursor query(
        Uri uri,
        String[] projection,
        String selection,
        String[] selectionArgs,
        String sortOrder
    ) {
        return null;
    }

    @Override
    public String getType(Uri uri) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(
        Uri uri,
        ContentValues values,
        String selection,
        String[] selectionArgs
    ) {
        return 0;
    }
}
