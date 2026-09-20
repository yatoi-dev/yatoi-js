/**
 * Which marketplace plugin ids the user has installed, persisted so a
 * reload re-installs them (CLAUDE.md doesn't ask the kernel to remember
 * this — installed-ness is app state, not kernel state).
 */
const STORAGE_KEY = 'weft-todo:installed'

export function loadInstalled(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function saveInstalled(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // storage full/unavailable — installs still work this session
  }
}
