import { startServer } from './server.mjs'
export const name = 'playbook-dsh'
export const inject = []
export async function apply(ctx) {
  const stop = await startServer()
  ctx.effect(() => stop, 'playbook-dsh server')
}
