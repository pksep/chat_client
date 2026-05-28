Place the local Noto Emoji webfont in this folder.

Expected paths:

- `public/emoji/noto/fonts/Noto-COLRv1.ttf`
- `public/emoji/noto/fonts/Noto-COLRv1-emojicompat.ttf`
- `public/emoji/noto/fonts/NotoColorEmoji_WindowsCompatible.ttf`
- `public/emoji/noto/fonts/NotoColorEmoji.ttf`

The app now uses the font as the primary cross-platform emoji source, which
avoids per-emoji image requests when opening chats and pickers.

Noto Emoji does not currently ship official animated emoji assets.
