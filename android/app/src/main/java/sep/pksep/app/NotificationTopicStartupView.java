package sep.pksep.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Shader;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

final class NotificationTopicStartupView {
    private static final int MAIN_COLOR = 0xFFF8F9FD;
    private static final int SURFACE_COLOR = 0xFFFFFFFF;
    private static final int SKELETON_COLOR = 0xFFE7E7E7;
    private static final int SKELETON_HIGHLIGHT_COLOR = 0xFFF5F5F5;

    private NotificationTopicStartupView() {}

    static View create(Context context, Intent intent) {
        FrameLayout root = new FrameLayout(context);
        root.setClickable(true);
        root.setBackgroundColor(MAIN_COLOR);
        applyWallpaper(context, root);

        // The wallpaper deliberately continues beneath the composer, but it
        // must not bleed through the transparent top inset above the header.
        View statusBarBackground = new View(context);
        statusBarBackground.setBackgroundColor(SURFACE_COLOR);
        root.addView(
            statusBarBackground,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                Gravity.TOP
            )
        );

        LinearLayout topicShell = new LinearLayout(context);
        topicShell.setOrientation(LinearLayout.VERTICAL);
        topicShell.setBackgroundColor(0x00000000);
        ViewCompat.setOnApplyWindowInsetsListener(
            topicShell,
            (view, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                );
                view.setPadding(0, systemBars.top, 0, systemBars.bottom);
                ViewGroup.LayoutParams statusBarParams =
                    statusBarBackground.getLayoutParams();
                if (statusBarParams.height != systemBars.top) {
                    statusBarParams.height = systemBars.top;
                    statusBarBackground.setLayoutParams(statusBarParams);
                }
                return windowInsets;
            }
        );
        root.addView(
            topicShell,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        ViewCompat.requestApplyInsets(topicShell);

        topicShell.addView(
            createHeader(context),
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(context, 60)
            )
        );

        FrameLayout messages = new FrameLayout(context);
        topicShell.addView(
            messages,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        );

        LinearLayout skeletons = new LinearLayout(context);
        skeletons.setOrientation(LinearLayout.VERTICAL);
        skeletons.setPadding(
            dp(context, 8),
            dp(context, 18),
            dp(context, 8),
            dp(context, 55)
        );
        messages.addView(
            skeletons,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        boolean showAvatars = "GROUP".equalsIgnoreCase(
            intent == null ? null : intent.getStringExtra("topicType")
        );
        addMessageSkeleton(
            context,
            skeletons,
            true,
            showAvatars,
            180,
            46,
            SKELETON_COLOR
        );
        addFlexibleSpacer(context, skeletons);
        addMediaSkeleton(context, skeletons);
        addFlexibleSpacer(context, skeletons);
        addMessageSkeleton(
            context,
            skeletons,
            true,
            showAvatars,
            280,
            46,
            SKELETON_COLOR
        );
        addFlexibleSpacer(context, skeletons);
        addMessageSkeleton(
            context,
            skeletons,
            false,
            false,
            306,
            46,
            SKELETON_COLOR
        );
        addFlexibleSpacer(context, skeletons);
        addMessageSkeleton(
            context,
            skeletons,
            true,
            showAvatars,
            150,
            46,
            SKELETON_COLOR
        );
        addFlexibleSpacer(context, skeletons);
        addMessageSkeleton(
            context,
            skeletons,
            false,
            false,
            250,
            46,
            SKELETON_COLOR
        );
        addFlexibleSpacer(context, skeletons);
        addMessageSkeleton(
            context,
            skeletons,
            true,
            showAvatars,
            280,
            46,
            SKELETON_COLOR
        );

        topicShell.addView(
            createComposer(context),
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(context, 75)
            )
        );
        return root;
    }

    private static View createHeader(Context context) {
        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(
            dp(context, 16),
            dp(context, 7),
            dp(context, 16),
            dp(context, 7)
        );
        header.setBackgroundColor(SURFACE_COLOR);

        header.addView(
            createBlock(context, 40, 40, SKELETON_COLOR, 20, true),
            new LinearLayout.LayoutParams(dp(context, 40), dp(context, 40))
        );

        LinearLayout profile = new LinearLayout(context);
        profile.setOrientation(LinearLayout.VERTICAL);
        profile.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams profileParams = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.MATCH_PARENT,
            1f
        );
        profileParams.setMargins(dp(context, 10), 0, dp(context, 12), 0);
        header.addView(profile, profileParams);

        View titleLine = createBlock(
            context,
            150,
            14,
            SKELETON_COLOR,
            5,
            false
        );
        LinearLayout.LayoutParams titleLineParams = new LinearLayout.LayoutParams(
            dp(context, 150),
            dp(context, 14)
        );
        titleLineParams.setMargins(0, 0, 0, dp(context, 6));
        profile.addView(titleLine, titleLineParams);
        profile.addView(
            createBlock(context, 92, 10, SKELETON_COLOR, 5, false),
            new LinearLayout.LayoutParams(dp(context, 92), dp(context, 10))
        );

        addHeaderAction(context, header);
        addHeaderAction(context, header);
        return header;
    }

    private static void addHeaderAction(
        Context context,
        LinearLayout header
    ) {
        View action = createBlock(
            context,
            24,
            24,
            SKELETON_COLOR,
            12,
            true
        );
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            dp(context, 24),
            dp(context, 24)
        );
        params.setMargins(dp(context, 8), 0, 0, 0);
        header.addView(action, params);
    }

    private static void addMessageSkeleton(
        Context context,
        LinearLayout container,
        boolean incoming,
        boolean showAvatar,
        int widthDp,
        int heightDp,
        int color
    ) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.BOTTOM);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(context, Math.max(42, heightDp))
        );
        rowParams.setMargins(0, 0, 0, dp(context, 12));
        container.addView(row, rowParams);

        if (!incoming) {
            row.addView(
                new View(context),
                new LinearLayout.LayoutParams(0, 1, 1f)
            );
        } else if (showAvatar) {
            View avatar = createBlock(context, 35, 35, color, 18, true);
            LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(
                dp(context, 35),
                dp(context, 35)
            );
            avatarParams.setMargins(0, 0, dp(context, 8), 0);
            row.addView(avatar, avatarParams);
        }

        row.addView(
            createBlock(context, widthDp, heightDp, color, 18, false),
            new LinearLayout.LayoutParams(
                dp(context, widthDp),
                dp(context, heightDp)
            )
        );
    }

    private static void addFlexibleSpacer(
        Context context,
        LinearLayout container
    ) {
        container.addView(
            new View(context),
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        );
    }

    private static void addMediaSkeleton(
        Context context,
        LinearLayout container
    ) {
        FrameLayout media = new FrameLayout(context);
        media.setBackground(
            createRoundedBackground(context, SKELETON_COLOR, 18, 0)
        );
        LinearLayout.LayoutParams mediaParams = new LinearLayout.LayoutParams(
            dp(context, 268),
            dp(context, 155)
        );
        mediaParams.gravity = Gravity.END;
        container.addView(media, mediaParams);

        media.addView(
            createBlock(
                context,
                42,
                42,
                SKELETON_HIGHLIGHT_COLOR,
                12,
                false
            ),
            new FrameLayout.LayoutParams(
                dp(context, 42),
                dp(context, 42),
                Gravity.CENTER
            )
        );
    }

    private static View createComposer(Context context) {
        FrameLayout composer = new FrameLayout(context);
        composer.setPadding(
            dp(context, 10),
            dp(context, 5),
            dp(context, 10),
            dp(context, 20)
        );

        LinearLayout editor = new LinearLayout(context);
        editor.setOrientation(LinearLayout.HORIZONTAL);
        editor.setGravity(Gravity.CENTER_VERTICAL);
        editor.setPadding(dp(context, 14), 0, dp(context, 14), 0);
        editor.setBackground(
            createRoundedBackground(
                context,
                SURFACE_COLOR,
                25,
                SKELETON_COLOR
            )
        );
        composer.addView(
            editor,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        editor.addView(
            createBlock(context, 22, 22, SKELETON_COLOR, 11, true),
            new LinearLayout.LayoutParams(
                dp(context, 22),
                dp(context, 22)
            )
        );

        View textLine = createBlock(
            context,
            -1,
            14,
            SKELETON_COLOR,
            5,
            false
        );
        LinearLayout.LayoutParams textLineParams = new LinearLayout.LayoutParams(
            0,
            dp(context, 14),
            1f
        );
        textLineParams.setMargins(dp(context, 10), 0, dp(context, 10), 0);
        editor.addView(textLine, textLineParams);

        editor.addView(
            createBlock(context, 22, 22, SKELETON_COLOR, 11, true),
            new LinearLayout.LayoutParams(
                dp(context, 22),
                dp(context, 22)
            )
        );
        return composer;
    }

    private static void applyWallpaper(Context context, FrameLayout messages) {
        messages.setBackgroundColor(MAIN_COLOR);
        String selectedWallpaperId = readWallpaperFile(context, "selected-id.txt");

        if ("none".equals(selectedWallpaperId)) {
            return;
        }

        if (
            selectedWallpaperId != null &&
            selectedWallpaperId.startsWith("custom-wallpaper-")
        ) {
            Bitmap customWallpaper = decodeCustomWallpaper(
                readWallpaperFile(context, selectedWallpaperId + ".txt")
            );

            if (customWallpaper != null) {
                ImageView wallpaperView = new ImageView(context);
                wallpaperView.setImageBitmap(customWallpaper);
                wallpaperView.setScaleType(ImageView.ScaleType.CENTER_CROP);
                messages.addView(
                    wallpaperView,
                    new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                );
                return;
            }
        }

        messages.setBackground(createFallbackWallpaper(context));
    }

    private static String readWallpaperFile(Context context, String fileName) {
        if (fileName == null || fileName.trim().isEmpty()) {
            return null;
        }

        File wallpaperFile = new File(
            new File(context.getFilesDir(), "chat-wallpapers"),
            fileName
        );

        if (!wallpaperFile.isFile()) {
            return null;
        }

        try {
            return new String(
                Files.readAllBytes(wallpaperFile.toPath()),
                StandardCharsets.UTF_8
            ).trim();
        } catch (IOException ignored) {
            return null;
        }
    }

    private static Bitmap decodeCustomWallpaper(String dataUrl) {
        if (dataUrl == null || dataUrl.trim().isEmpty()) {
            return null;
        }

        int separatorIndex = dataUrl.indexOf(',');
        String encodedImage = separatorIndex >= 0
            ? dataUrl.substring(separatorIndex + 1)
            : dataUrl;

        try {
            byte[] imageBytes = Base64.decode(encodedImage, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static Drawable createFallbackWallpaper(Context context) {
        Bitmap bitmap = BitmapFactory.decodeResource(
            context.getResources(),
            R.drawable.chat_wallpaper_startup
        );
        if (bitmap == null) {
            return new ColorDrawable(MAIN_COLOR);
        }

        BitmapDrawable pattern = new BitmapDrawable(context.getResources(), bitmap);
        pattern.setTileModeX(Shader.TileMode.REPEAT);
        pattern.setTileModeY(Shader.TileMode.REPEAT);
        return new LayerDrawable(
            new Drawable[] { new ColorDrawable(MAIN_COLOR), pattern }
        );
    }

    private static GradientDrawable createRoundedBackground(
        Context context,
        int fillColor,
        int radiusDp,
        int strokeColor
    ) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(fillColor);
        background.setCornerRadius(dp(context, radiusDp));
        if (strokeColor != 0) {
            background.setStroke(1, strokeColor);
        }
        return background;
    }

    private static View createBlock(
        Context context,
        int widthDp,
        int heightDp,
        int color,
        int radiusDp,
        boolean oval
    ) {
        View view = new View(context);
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        if (oval) {
            background.setShape(GradientDrawable.OVAL);
        } else {
            background.setCornerRadius(dp(context, radiusDp));
        }
        view.setBackground(background);
        return view;
    }

    private static int dp(Context context, int value) {
        return Math.round(
            value * context.getResources().getDisplayMetrics().density
        );
    }
}
