window.__ModuleLoader__.load({
  id: 'playbook-dsh',
  factory: require => {
    const React = require('react')
    const id = 'playbook'
    return {
      inject: ['slots', 'layout', 'uiWorkspace'],
      apply(ctx) {
        function Playbook() {
          const [endpoint, setEndpoint] = React.useState({})
          const [attempt, retry] = React.useReducer(value => value + 1, 0)
          const frame = React.useRef(null)
          React.useEffect(() => ctx.on('connection/reset', retry), [])
          React.useEffect(() => {
            if (!endpoint.url) return
            const origin = new URL(endpoint.url).origin
            let active
            const receive = event => {
              if (!frame.current || event.source !== frame.current.contentWindow || event.origin !== origin
                || event.data?.type !== 'playbook:choose-directory' || event.ports.length !== 1) return
              const port = event.ports[0]
              if (active) { port.postMessage({ error: '请先完成当前文件夹选择' }); port.close(); return }
              active = port; port.postMessage({ ready: true })
              Promise.resolve().then(() => window.__DSH_DIRECTORY_PICKER__
                ? window.__DSH_DIRECTORY_PICKER__.pick() : ctx.uiWorkspace.pickDirectory())
                .then(directory => port.postMessage({ path: directory }), error => port.postMessage({ error: error?.message || '文件夹选择失败' }))
                .finally(() => { port.close(); if (active === port) active = null })
            }
            window.addEventListener('message', receive)
            return () => {
              window.removeEventListener('message', receive)
              if (active) { active.postMessage({ error: 'Playbook 面板已关闭' }); active.close(); active = null }
            }
          }, [endpoint.url])
          React.useEffect(() => {
            const controller = new AbortController()
            setEndpoint({})
            void fetch('api/playbook/endpoint', { signal: controller.signal, cache: 'no-store' }).then(async response => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              const { url } = await response.json()
              if (typeof url !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/$/.test(url) || new URL(url).port === '') throw new Error('无效的播放地址')
              if (!controller.signal.aborted) setEndpoint({ url })
            }).catch(() => { if (!controller.signal.aborted) setEndpoint({ error: true }) })
            return () => controller.abort()
          }, [attempt])
          if (endpoint.url) return React.createElement('iframe', { ref: frame, src: endpoint.url, title: 'Playbook', style: { width: '100%', height: '100%', border: 0, display: 'block' } })
          return React.createElement('div', { style: { padding: 24 }, role: 'status' }, endpoint.error
            ? React.createElement(React.Fragment, null, 'Playbook 暂时无法连接。', React.createElement('button', { onClick: retry }, '重试'))
            : '正在打开 Playbook…')
        }
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id }, Playbook)), 'playbook main')
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: 1, label: () => 'Playbook' }, ({ size }) => React.createElement('span', { style: { fontSize: size * .7 } }, '▶'))), 'playbook sidebar')
      }
    }
  }
})
