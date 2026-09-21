import { defineCollection, defineService } from '@yatoi/kernel'

// The host's contract: tokens shared by the host and every skill plugin.
// No behaviour lives here, only shapes and the tokens that name them —
// same split as examples/todo/src/contract.

export interface ToolDef {
  name: string
  description: string
  run(args: Record<string, unknown>): Promise<string>
}

export interface PromptSection {
  text: string
}

export type ToolCall = { tool: string; args: Record<string, unknown> }

export type ModelReply = { kind: 'text'; text: string } | { kind: 'tool'; call: ToolCall }

export interface ModelProvider {
  complete(input: { system: string; user: string; tools: readonly ToolDef[] }): Promise<ModelReply>
}

export interface OAuthSession {
  accessToken: string
  account: string
}

export interface Turn {
  user: string
  system: string
  tools: readonly ToolDef[]
}

export type TurnResult = { reply: string; toolCalls: { tool: string; result: string }[] }

export type TurnMiddleware = (turn: Turn, next: (turn: Turn) => Promise<TurnResult>) => Promise<TurnResult>

export interface Summarizer {
  summarize(text: string): Promise<string>
}

// Services: single-value capabilities. Exactly one active provider at a time.
export const Model = defineService<ModelProvider>('agent.model')
export const GoogleAuth = defineService<OAuthSession>('auth.google')
export const SummarizerSvc = defineService<Summarizer>('agent.summarizer')

// Collections: many skills contribute, the host reads a priority-sorted list.
export const Tools = defineCollection<ToolDef>('agent.tools')
export const PromptSections = defineCollection<PromptSection>('agent.prompt')
export const Middleware = defineCollection<TurnMiddleware>('agent.middleware')
