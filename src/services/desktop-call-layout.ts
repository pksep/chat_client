export function desktopCallPageSize(width: number, height: number): 4 | 6 | 9 {
  if (width <= 0 || height <= 0) return 6;
  // Для 3×3 оставляем каждой плитке минимум 300×170 и учитываем промежутки.
  if (width >= 924 && height >= 534) return 9;
  // В тесном окне две колонки сохраняют место для имени, аватара и индикаторов.
  return width >= 684 && height >= 312 ? 6 : 4;
}
