import { createServer, type Server } from 'node:http'
import type { Kernel } from '@yatoi/kernel'
import { Jobs, Middleware, Routes } from './contract.js'
import type { Job, RequestHandler, ServerRequest, ServerResponse } from './contract.js'

export function createServerHost(kernel: Kernel) {
  // A re-contributed job is a new object, so it intentionally runs on the next tick.
  const lastRun = new WeakMap<Job, number>()

  async function core(req: ServerRequest): Promise<ServerResponse> {
    const route = kernel
      .list(Routes)
      .find((entry) => entry.value.method === req.method && entry.value.path === req.path)
    return route ? route.value.handle(req) : { status: 404, body: 'Not found' }
  }

  async function handle(req: ServerRequest): Promise<ServerResponse> {
    const middleware = [...kernel.list(Middleware)].sort((a, b) => a.priority - b.priority)
    let next: RequestHandler = core
    for (const entry of middleware) {
      const inner = next
      const fn = entry.value
      next = (request) => fn(request, inner)
    }
    return next(req)
  }

  async function tickJobs(now: number): Promise<string[]> {
    const ran: string[] = []
    for (const entry of kernel.list(Jobs)) {
      const job = entry.value
      const previous = lastRun.get(job)
      if (previous !== undefined && now - previous < job.everyMs) continue
      await job.run()
      lastRun.set(job, now)
      ran.push(job.name)
    }
    return ran
  }

  async function listen(port = 0): Promise<{ port: number; close(): Promise<void> }> {
    const server: Server = createServer(async (req, res) => {
      const response = await handle({ method: req.method ?? 'GET', path: req.url ?? '/' })
      res.statusCode = response.status
      res.end(response.body)
    })
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('server did not bind a TCP port')
    return {
      port: address.port,
      close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    }
  }

  return { handle, tickJobs, listen }
}
