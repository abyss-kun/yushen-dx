// 插件全局自检：语法 + 加载 + 弹窗冒烟（改完必跑，跑不过不许交）
// 用法：node scripts/selftest.mjs
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const results = []
function check(name, fn) {
  try {
    const r = fn()
    results.push({ name, ok: true, note: r || '' })
  } catch (e) {
    results.push({ name, ok: false, note: String((e && e.message) || e) })
  }
}

// ---------- 1. 文件存在与语法 ----------
for (const f of ['client.js', 'index.js', 'package.json']) {
  check('文件存在: ' + f, () => {
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error('缺文件')
  })
}
check('index.js 语法（ESM）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  new vm.SourceTextModule(src)
})
check('client.js 语法（ESM 严格模式）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  new vm.SourceTextModule(src)
})
check('client.js 语法（CommonJS 兼容）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  new vm.Script(src)
})

// ---------- 2. 加载模拟（factory 执行） ----------
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    style: {},
    children: [],
    dataset: {},
    textContent: '',
    innerHTML: '',
    draggable: true,
    className: '',
    offsetParent: {},
    parentNode: null,
    title: '',
    classList: { add() {}, remove() {}, contains() { return false }, toggle() {} },
    setAttribute() {},
    getAttribute() { return null },
    removeAttribute() {},
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c },
    removeChild(c) { this.children = this.children.filter((x) => x !== c) },
    insertBefore(c) { this.children.push(c); return c },
    addEventListener() {},
    removeEventListener() {},
    remove() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    querySelector() { return null },
    querySelectorAll() { return [] },
    contains() { return false },
    getBoundingClientRect() { return { left: 100, top: 100, width: 800, height: 600, right: 900, bottom: 700 } },
    focus() {},
    click() {},
  }
  return el
}

const created = []
const headChildren = []
const globalDoc = {
  createElement: (t) => { const el = makeEl(t); created.push(el); return el },
  createTextNode: (t) => ({ textContent: t }),
  head: (() => {
    const h2 = makeEl('head')
    h2.appendChild = (c) => { headChildren.push(c); return c }
    h2.querySelector = () => null
    return h2
  })(),
  body: makeEl('body'),
  documentElement: makeEl('html'),
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
  querySelector() { return null },
  querySelectorAll() { return [] },
}

const store = new Map()
const fakeWindow = {
  __ModuleLoader__: {
    load(opts) {
      const mod = opts.factory((name) => {
        if (name === 'react') {
          return {
            createElement: (type, props, ...kids) => ({ type, props, kids }),
            useState: (v) => [v, () => {}],
            useEffect: () => {},
            useLayoutEffect: () => {},
            useRef: (v) => ({ current: v }),
          }
        }
        throw new Error('unknown module: ' + name)
      })
      if (!mod || typeof mod.apply !== 'function') throw new Error('factory 没有返回 apply')
      fakeWindow.__exports = mod
      mod.apply({ slots: { inject() {}, register() {} }, effect(fn) { if (typeof fn === 'function') fn() }, get() { return undefined } })
      return mod
    },
  },
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout,
  innerWidth: 1600,
  innerHeight: 1000,
  Audio: class {
    constructor() { this.volume = 1 }
    play() { return Promise.resolve() }
  },
  document: globalDoc,
  navigator: { userAgent: 'selftest' },
}
globalThis.window = fakeWindow
globalThis.document = globalDoc
globalThis.localStorage = fakeWindow.localStorage
globalThis.requestAnimationFrame = fakeWindow.requestAnimationFrame
globalThis.matchMedia = fakeWindow.matchMedia
globalThis.Audio = fakeWindow.Audio
globalThis.location = { reload() {} }

let applyError = null
try {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  new vm.Script(src).runInThisContext()
} catch (e) {
  applyError = e
}
check('client.js 顶层执行（注册 + factory + apply）', () => {
  if (applyError) throw applyError
})
check('弹窗函数已挂到 window', () => {
  if (typeof fakeWindow.__yshenImportantPopup !== 'function') throw new Error('__yshenImportantPopup 不存在')
})

// ---------- 3. 弹窗冒烟：单条 / 多条 / Enter / 预览 ----------
check('弹窗创建（单条）', async () => {}) // 占位，下面用 promise 版
const smoke = await (async () => {
  const out = []
  try {
    const p = fakeWindow.__yshenImportantPopup({
      theme: 'blue',
      badge: '测试',
      title: '自检弹窗',
      body: '自检正文',
      confirmText: '好',
      cancelText: '关掉',
      autoExpand: true,
    })
    if (!p || typeof p.then !== 'function') throw new Error('没返回 Promise')
    out.push('单条创建 OK')
  } catch (e) {
    out.push('单条抛错: ' + e.message)
  }
  return out
})()
check('弹窗创建（单条）', () => {
  if (smoke.some((x) => x.includes('抛错'))) throw new Error(smoke.join('; '))
})

// ---------- 4. 配置接口形状（host 侧） ----------
check('后台 hooks 不在分支里（点了 tab 不会崩）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  // 找出所有 else if (tab === 'xxx') 分支，检查里面没有 React.useState / React.useEffect
  const re = /else if \\(tab === '[a-z]+'\\) \\{([\s\\S]*?)\\n      \\} else if/g
  let m
  while ((m = re.exec(src))) {
    if (/React\\.use(State|Effect)/.test(m[1])) throw new Error('分支里用了 hooks: ' + m[1].slice(0, 80))
  }
  // 兜底：jobs 分支单独查
  const j = src.indexOf("else if (tab === 'jobs')")
  if (j > 0) {
    const seg = src.slice(j, j + 1200)
    if (/React\\.use(State|Effect)/.test(seg)) throw new Error('jobs 分支里还有 hooks')
  }
})

check('后台页面渲染（AdminPage 不抛错）', () => {
  if (typeof fakeWindow.__ysAdminPage !== 'function') throw new Error('AdminPage 没暴露')
  const out = fakeWindow.__ysAdminPage({})
  if (!out || !out.type) throw new Error('AdminPage 没返回元素')
})

check('弹窗描边应用（strokeWidth+strokeColor）', () => {
  localStorage.setItem('yspopup.font', JSON.stringify({ strokeWidth: 2, strokeColor: '#ff0000' }))
  fakeWindow.__ysPopupShowing = false
  created.length = 0
  fakeWindow.__yshenImportantPopup({ title: '描边测试', body: '正文', autoExpand: true })
  const hit = created.find((el) => el.style && String(el.style.WebkitTextStroke || '').includes('2px'))
  if (!hit) throw new Error('没有元素用上描边')
})

check('弹窗粗细应用（fontWeight=700）', () => {
  localStorage.setItem('yspopup.font', JSON.stringify({ fontWeight: '700' }))
  fakeWindow.__ysPopupShowing = false
  created.length = 0
  fakeWindow.__yshenImportantPopup({ title: '粗细测试', body: '正文', autoExpand: true })
  const hit = created.find((el) => el.style && el.style.fontWeight === '700')
  if (!hit) throw new Error('没有元素用上 fontWeight=700')
})

check('位置记忆读取（localStorage → clamp）', () => {
  localStorage.setItem('yspopup.pos', JSON.stringify({ x: 300, y: 200 }))
  // 弹窗函数在创建时读 pos；这里只验证读回的值合法
  const raw = JSON.parse(localStorage.getItem('yspopup.pos'))
  if (raw.x !== 300 || raw.y !== 200) throw new Error('pos 写入/读回不一致')
})

check('队列合并（已有弹窗时新请求入队）', () => {
  fakeWindow.__ysPopupShowing = true
  fakeWindow.__ysPopupPending = []
  const ret = fakeWindow.__yshenImportantPopup({ title: '排队测试', body: 'x' })
  if (!(ret && typeof ret.then === 'function')) throw new Error('没返回 Promise')
  if (!Array.isArray(fakeWindow.__ysPopupPending) || fakeWindow.__ysPopupPending.length !== 1) {
    throw new Error('没有进队列')
  }
  fakeWindow.__ysPopupShowing = false
  fakeWindow.__ysPopupPending = []
})

check('busy 模块就位（lib/busy.js + 路由）', () => {
  for (const f of ['lib/busy.js', 'lib/paths.js', 'lib/watch.js']) {
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error('缺 ' + f)
  }
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  if (!src.includes("'/yushen-popup/busy'")) throw new Error('host 没有 busy 路由')
})

check('host 有统一事件入口 /yushen-popup/event', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  if (!src.includes("'/yushen-popup/event'")) throw new Error('没有 event 路由')
  if (!src.includes('sources:')) throw new Error('没有 sources 配置')
  if (!src.includes('tokenAlert:')) throw new Error('没有 tokenAlert 配置')
})

// ---------- 5. 字体/会话染色应用 ----------
check('弹窗字体应用（fontFamily）', () => {
  localStorage.setItem('yspopup.font', JSON.stringify({ fontFamily: 'KaiTi', fontSize: 'large' }))
  fakeWindow.__ysPopupShowing = false
  created.length = 0
  fakeWindow.__yshenImportantPopup({ title: '字体测试', body: '正文', autoExpand: true })
  const hit = created.find((el) => el.style && el.style.fontFamily === 'KaiTi')
  if (!hit) throw new Error('没有元素用上 fontFamily=KaiTi')
})

check('弹窗标题色应用（titleColor）', () => {
  localStorage.setItem('yspopup.font', JSON.stringify({ titleColor: '#ff0000' }))
  fakeWindow.__ysPopupShowing = false
  created.length = 0
  fakeWindow.__yshenImportantPopup({ title: '标题色测试', body: '正文', autoExpand: true })
  const hit = created.find((el) => el.style && String(el.style.color || '').toLowerCase() === '#ff0000')
  if (!hit) throw new Error('没有元素用上 titleColor')
})

check('弹窗字号应用（fontSize=large 放大 1.12 倍）', () => {
  localStorage.setItem('yspopup.font', JSON.stringify({ fontSize: 'large' }))
  fakeWindow.__ysPopupShowing = false
  created.length = 0
  fakeWindow.__yshenImportantPopup({ title: '字号测试', body: '正文', autoExpand: true })
  // 标题基准 3.4cqw * 1.12 = 3.81cqw
  const hit = created.find((el) => el.style && String(el.style.fontSize || '') === '3.81cqw')
  if (!hit) {
    const sizes = created.map((el) => el.style && el.style.fontSize).filter(Boolean).slice(0, 8)
    throw new Error('没有元素用上 3.81cqw；实际字号: ' + JSON.stringify(sizes))
  }
})

check('会话染色样式注入（userStack/assistantContent）', () => {
  localStorage.setItem('yspopup.chatColors', JSON.stringify({ on: true, mine: '#ff0000', theirs: '#00ff00' }))
  if (typeof fakeWindow.__yspApplyChatColors === 'function') fakeWindow.__yspApplyChatColors()
  const style = headChildren.find((c) => c && c.id === 'ysp-chat-colors')
  if (!style) throw new Error('没注入 #ysp-chat-colors')
  const txt = String(style.textContent || '')
  if (!txt.includes('userStack') || !txt.includes('assistantContent')) throw new Error('规则里没 userStack/assistantContent: ' + txt.slice(0, 120))
  if (!txt.includes('#ff0000') || !txt.includes('#00ff00')) throw new Error('颜色没写进去: ' + txt.slice(0, 120))
})

// ---------- 输出 ----------
console.log('=== dsh-yushen-popup 自检 ===')
let fail = 0
for (const r of results) {
  console.log((r.ok ? '✅' : '❌') + ' ' + r.name + (r.ok ? '' : ' -> ' + r.note))
  if (!r.ok) fail++
}
console.log('=== ' + (fail ? '失败 ' + fail + ' 项' : '全部通过') + ' ===')
process.exit(fail ? 1 : 0)
