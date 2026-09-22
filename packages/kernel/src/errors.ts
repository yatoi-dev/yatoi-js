export class YatoiError extends Error {}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function ruleMessage(
  happened: string,
  plugin: string,
  why: string,
  fix: string,
  section: string,
): string {
  return `[yatoi] ${happened} in plugin "${plugin}": ${why}. ${fix}. (spec §${section})`
}

export function ruleError(
  happened: string,
  plugin: string,
  why: string,
  fix: string,
  section: string,
  cause?: unknown,
): YatoiError {
  return new YatoiError(ruleMessage(happened, plugin, why, fix, section), { cause })
}

export function reportedError(
  happened: string,
  plugin: string,
  error: unknown,
  fix: string,
  section: string,
): Error {
  if (error instanceof YatoiError) return error
  return ruleError(happened, plugin, detail(error), fix, section, error)
}
