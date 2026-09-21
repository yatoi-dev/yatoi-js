import { defineCollection, defineService } from '@yatoi/kernel'

export interface ServerConfig {
  dbUrl: string
  features: string[]
}

export interface DatabaseConnection {
  query(sql: string): string
  closed: boolean
}

export interface ServerRequest {
  method: string
  path: string
}

export interface ServerResponse {
  status: number
  body: string
}

export interface Route {
  method: string
  path: string
  handle(req: ServerRequest): ServerResponse | Promise<ServerResponse>
}

export interface Job {
  name: string
  everyMs: number
  run(): void | Promise<void>
}

export type RequestHandler = (req: ServerRequest) => Promise<ServerResponse>
export type RequestMiddleware = (req: ServerRequest, next: RequestHandler) => Promise<ServerResponse>

export const Config = defineService<ServerConfig>('server.config')
export const DbConnection = defineService<DatabaseConnection>('server.database')
export const Routes = defineCollection<Route>('server.routes')
export const Jobs = defineCollection<Job>('server.jobs')
export const Middleware = defineCollection<RequestMiddleware>('server.middleware')
