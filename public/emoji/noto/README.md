Place the local Noto Emoji webfont in this folder.

Expected paths:

- `public/emoji/noto/fonts/Noto-COLRv1.ttf`
- `public/emoji/noto/fonts/Noto-COLRv1-emojicompat.ttf`
- `public/emoji/noto/fonts/NotoColorEmoji_WindowsCompatible.ttf`
- `public/emoji/noto/fonts/NotoColorEmoji.ttf`

The app now uses the font as the primary cross-platform emoji source, which
avoids per-emoji image requests when opening chats and pickers.

Для сообщения с одним эмодзи используется Google Animated Noto Emoji:
https://googlefonts.github.io/noto-emoji-animation/.

Список из 881 поддерживаемого кодпоинта сохранён из официального каталога
08.10.2026 в `src/utils/noto-animated-codepoints.json`. Анимации загружаются
по необходимости с официального CDN Google и повторяются непрерывно.
Если анимации нет или загрузка не удалась, используется локальный PNG,
а затем системный шрифт. Во время загрузки показывается статичное превью;
размер компонента сообщения сохраняется.

Лицензия анимаций — CC BY 4.0, автор Google. Полный текст лицензии,
атрибуция и сведения об источнике находятся в `animations/`.
Для собственного зеркала можно задать `VITE_EMOJI_ANIMATION_ASSET_BASE_URL`;
ожидаемый путь — `<base>/<codepoint>/512.webp`, как у Google.

Эти анимации используются для обычных эмодзи. Каталог стикеров содержит
только 15 локальных роботов SEP из предоставленных папок.
