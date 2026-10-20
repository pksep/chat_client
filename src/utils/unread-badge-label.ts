/** Ограничивает подпись плашки, не изменяя фактическое число непрочитанных. */
export function unreadBadgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}
