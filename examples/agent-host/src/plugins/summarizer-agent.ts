import { definePlugin } from '@yatoi/kernel'
import { Model, SummarizerSvc, Tools } from '../contract.js'

/**
 * A sub-agent is just a plugin that `provide`s a service. It also
 * contributes itself as a tool — an agent exposing itself to the
 * top-level agent's tool list, delegating straight through to the
 * service it just provided. `inject: [Model]` means it cascades out
 * with the model it depends on, same as any other capability.
 */
export const summarizerAgentPlugin = definePlugin({
  name: 'summarizer-agent',
  inject: [Model],
  provides: [SummarizerSvc],
  setup(scope) {
    const model = scope.get(Model)

    async function summarize(text: string): Promise<string> {
      const reply = await model.complete({
        system: 'Summarize the user text in one short sentence.',
        user: text,
        tools: [],
      })
      return reply.kind === 'text' ? reply.text : `(summarizer got a tool call: ${reply.call.tool})`
    }

    scope.provide(SummarizerSvc, { summarize })

    scope.contribute(Tools, {
      name: 'summarize',
      description: 'Summarize a block of text.',
      async run(args) {
        return summarize(String(args['text'] ?? ''))
      },
    })
  },
})
