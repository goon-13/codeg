/** Unicode 标量个数，对齐 Rust `chars()` / 簇 `normalize_title`。 */
export const SESSION_TITLE_MAX_CHARS = 80
export const CLUSTER_TITLE_MAX_CHARS = 64

export function normalizeTitle(raw: string, maxChars: number): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return [...trimmed].slice(0, maxChars).join("")
}
