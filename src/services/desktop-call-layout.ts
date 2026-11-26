export function desktopCallPageSize(width: number, height: number): 6 | 9 {
  // Для 3×3 оставляем каждой плитке минимум 300×170 и учитываем промежутки.
  return width >= 924 && height >= 534 ? 9 : 6;
}
