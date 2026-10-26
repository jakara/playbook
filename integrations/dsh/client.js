window.__ModuleLoader__.load({
  id: 'playbook-dsh',
  factory: require => {
    const React = require('react')
    const id = 'playbook'
    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id }, () => React.createElement('iframe', { src: 'http://127.0.0.1:43188/', title: 'Playbook', style: { width: '100%', height: '100%', border: 0, display: 'block' } }))), 'playbook main')
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: 1, label: () => 'Playbook' }, ({ size }) => React.createElement('span', { style: { fontSize: size * .7 } }, '▶'))), 'playbook sidebar')
      }
    }
  }
})
