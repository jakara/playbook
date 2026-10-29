import { startServer } from './server.mjs'
export const name = 'playbook-dsh'
export const inject = ['connection']
export async function apply(ctx) {
  const { url, stop, call } = await startServer()
  const calls = new Set()
  let closing = false
  ctx.effect(function* () {
    yield ctx.effect(() => async () => {
      closing = true
      await Promise.allSettled([...calls])
      await stop()
    }, 'playbook-dsh server')
    yield ctx.provide('playbook', {
      call(method, input) {
        if (closing) return Promise.reject(new Error('Playbook is stopping'))
        const task = call(method, input)
        calls.add(task)
        return task.finally(() => calls.delete(task))
      },
    })
    yield ctx.connection.fetch.register({
      path: '/api/playbook/endpoint', methods: ['GET'], requestBody: 'buffered',
      fetch: () => Response.json({ url }, { headers: { 'Cache-Control': 'no-store' } }),
    })
  })
}
