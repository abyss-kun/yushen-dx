// 模拟 DSH web boot：import client.js，看顶层执行和 factory 初始化是否抛错
globalThis.window = {
  __ModuleLoader__: {
    load(opts) {
      console.log('load 被调用, id =', opts.id)
      // DSH 会立刻调用 factory 来拿 exports（inject/apply）
      try {
        const mod = opts.factory((name) => {
          if (name === 'react') {
            return {
              createElement: (...a) => ({ type: a[0], props: a[1] }),
              useState: (v) => [v, () => {}],
              useEffect: () => {},
            }
          }
          throw new Error('unknown module: ' + name)
        })
        console.log('factory 执行 OK, exports keys =', Object.keys(mod || {}))
      } catch (e) {
        console.log('FACTORY 抛错:', e && e.stack || e)
        process.exitCode = 1
      }
    },
  },
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {},
}
globalThis.document = {
  createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {}, setAttribute: () => {}, remove: () => {} }),
  addEventListener: () => {},
  head: { appendChild: () => {} },
  body: { appendChild: () => {} },
  querySelector: () => null,
}
await import('file:///D:/deepseekTools/dsh-yushen-popup/client.js')
console.log('import 阶段完成（没抛错）')
