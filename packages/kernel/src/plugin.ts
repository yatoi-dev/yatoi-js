import type { AnyServiceToken } from './token.js'
import type { Plugin, PluginDef } from './types.js'
import { ruleError } from './errors.js'

/**
 * Identity at runtime; the generic pins `inject` as a tuple so `scope.get`
 * is typed non-null for exactly the tokens you declared.
 */
export function definePlugin<const I extends readonly AnyServiceToken[] = readonly []>(
  def: PluginDef<I>,
): Plugin<I> {
  if (!def.name) {
    throw ruleError(
      'Plugin definition failed',
      '<unnamed>',
      '`name` is empty',
      'Set `name` to a non-empty string',
      '3.1',
    )
  }
  return def
}
