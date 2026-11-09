import fs from 'node:fs'

const OUT = process.argv[2] || 'D:\\DSH\\大小鱼\\鱼神常驻\\popup-console.log'
const lines = []
function log(s) { lines.push(String(s)) }

async function main() {
  log('=== capture start ' + new Date().toISOString() + ' ===')
  let list = null
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9222/json/list')
      if (r.ok) {
        const txt = await r.text()
        if (txt && txt.trim().startsWith('[')) {
          const arr = JSON.parse(txt)
          if (arr.length) { list = arr; break }
        }
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!list) { log('CDP 没连上（9222）'); fs.writeFileSync(OUT, lines.join('\n')); return }

  const targets = list.filter((t) => t.type === 'page')
  log('pages: ' + targets.length)
  for (const t of targets) {
    log('--- page: ' + (t.url || '').slice(0, 120) + ' ---')
    try {
      const ws = new WebSocket(t.webSocketDebuggerUrl)
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
      let seq = 0
      const pending = new Map()
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data)
        if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) }
        else if (m.method === 'Runtime.exceptionThrown') {
          const d = m.params && m.params.exceptionDetails
          log('EXCEPTION: ' + ((d && (d.exception && d.exception.description)) || (d && d.text) || '').slice(0, 600))
        } else if (m.method === 'Runtime.consoleAPICalled') {
          const args = (m.params && m.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 600)
          if (args) log((m.params.type || 'log').toUpperCase() + ': ' + args)
        }
      }
      const cmd = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
      await cmd('Runtime.enable')
      await cmd('Page.enable')
      // 让页面重新加载一次，把 import 阶段错误再触发一遍
      await cmd('Page.reload', { ignoreCache: true })
      await new Promise((r) => setTimeout(r, 8000))
      try { ws.close() } catch { /* 忽略 */ }
    } catch (e) {
      log('page 连接失败: ' + String(e && e.message || e))
    }
  }
  log('=== capture end ===')
  fs.writeFileSync(OUT, lines.join('\n'))
  console.log('written: ' + OUT)
}
main().catch((e) => { log('脚本错误: ' + (e && e.stack || e)); fs.writeFileSync(OUT, lines.join('\n')) })
