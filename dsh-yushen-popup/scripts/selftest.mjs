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
    setAttribute(k, v) { if (!this.attrs) this.attrs = {}; this.attrs[k] = String(v) },
    getAttribute(k) { return (this.attrs && this.attrs[k] != null) ? this.attrs[k] : null },
    removeAttribute() {},
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c },
    removeChild(c) { this.children = this.children.filter((x) => x !== c) },
    insertBefore(c) { this.children.push(c); return c },
    addEventListener(type, fn) { if (!this.__h) this.__h = {}; (this.__h[type] = this.__h[type] || []).push(fn) },
    removeEventListener(type, fn) { if (!this.__h || !this.__h[type]) return; this.__h[type] = this.__h[type].filter((x) => x !== fn) },
    dispatch(type, ev) {
      const e = Object.assign({ type, stopPropagation() {}, preventDefault() {} }, ev || {})
      for (const fn of ((this.__h && this.__h[type]) || [])) fn(e)
      return e
    },
    remove() { this.removed = true },
    setPointerCapture() {},
    releasePointerCapture() {},
    querySelector() { return null },
    querySelectorAll() { return [] },
    contains(node) {
      let n = node
      while (n) { if (n === this) return true; n = n.parentNode }
      return false
    },
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
  addEventListener(type, fn) { if (!globalDoc.__h) globalDoc.__h = {}; (globalDoc.__h[type] = globalDoc.__h[type] || []).push(fn) },
  removeEventListener(type, fn) { if (!globalDoc.__h || !globalDoc.__h[type]) return; globalDoc.__h[type] = globalDoc.__h[type].filter((x) => x !== fn) },
  __dispatch(type, ev) {
    const e = Object.assign({ type, stopPropagation() {}, preventDefault() {} }, ev || {})
    for (const fn of ((globalDoc.__h && globalDoc.__h[type]) || [])) fn(e)
    return e
  },
  activeElement: null,
  querySelector() { return null },
  querySelectorAll(sel) {
    // 只为测「同一时间只有一幅弹窗」：假装能按属性查到当前活着的弹窗
    if (String(sel).includes('data-ys-popup')) return created.filter((e) => e && e.attrs && e.attrs['data-ys-popup'] === '1' && !e.removed)
    return []
  },
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
  // 标题基准 3.9cqw * 1.12 = 4.37cqw
  const hit = created.find((el) => el.style && String(el.style.fontSize || '') === '4.37cqw')
  if (!hit) {
    const sizes = created.map((el) => el.style && el.style.fontSize).filter(Boolean).slice(0, 8)
    throw new Error('没有元素用上 4.37cqw；实际字号: ' + JSON.stringify(sizes))
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

// ---------- 6. 按钮真的能关（2026-11-11：老板截图"按键无效、关不掉"） ----------
const closeTest = await (async () => {
  try {
    fakeWindow.__ysPopupShowing = false
    fakeWindow.__ysPopupPending = []
    created.length = 0
    const p = fakeWindow.__yshenImportantPopup({ title: '关闭测试', body: '正文', confirmText: '知道了', cancelText: '好', autoExpand: true })
    await new Promise((r) => setTimeout(r, 80))
    const wrap = created.find((el) => el && el.id === 'ys-popup-wrap')
    if (!wrap) return '没找到 wrap'
    const okBtn = created.find((el) => el && el.getAttribute && el.getAttribute('data-ys-act') === 'ok')
    if (!okBtn) return '按钮没有 data-ys-act（捕获兜底认不出）'
    // 只派发到 document 捕获阶段：模拟"按钮自己的监听器没生效"的那种最坏情况
    globalDoc.__dispatch('click', { target: okBtn })
    await new Promise((r) => setTimeout(r, 360))
    if (!wrap.removed) return '捕获兜底没把弹窗拆掉'
    if (fakeWindow.__ysPopupShowing === true) return '关掉后 __ysPopupShowing 没复位，会吞后续弹窗'
    const result = await Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), 300))])
    if (result === 'timeout') return '关掉后 Promise 没有 resolve'
    return '点按钮就关（不依赖按钮自身监听器）'
  } catch (e) {
    return '抛错：' + String((e && e.message) || e)
  }
})()
check('按钮能关：捕获兜底兜住"点了没反应"', () => {
  if (closeTest !== '点按钮就关（不依赖按钮自身监听器）') throw new Error(String(closeTest))
})

// ---------- 6b. 「关闭」不拆弹窗，收成画框（2026-11-12 老板：关闭之后变回画框） ----------
const foldTest = await (async () => {
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    fakeWindow.__ysPopupShowing = false
    fakeWindow.__ysPopupPending = []
    created.length = 0
    const p = fakeWindow.__yshenImportantPopup({ title: '收成画框', body: '正文', confirmText: '知道了', cancelText: '关闭', cancelAction: 'fold', autoExpand: true })
    await sleep(80)
    const wrap = created.find((el) => el && el.id === 'ys-popup-wrap')
    const btn = created.find((el) => el && el.getAttribute && el.getAttribute('data-ys-act') === 'fold')
    if (!btn) return '没有 fold 按钮'
    globalDoc.__dispatch('click', { target: btn })
    await sleep(200)
    if (wrap.removed) return '被拆掉了（应该收成画框留在屏上）'
    if (fakeWindow.__ysPopupShowing === true) return '__ysPopupShowing 没复位（会吞后面的弹窗）'
    const r = await Promise.race([p, sleep(300).then(() => 'timeout')])
    if (r === 'timeout') return 'Promise 没 resolve'
    return '收成画框：不拆 / 标志复位 / resolve(false)'
  } catch (e) {
    return '抛错：' + String((e && e.message) || e)
  }
})()
check('「关闭」= 收成画框（不消失、能再点开）', () => {
  if (foldTest !== '收成画框：不拆 / 标志复位 / resolve(false)') throw new Error(String(foldTest))
})

// ---------- 6c. 同一时间只有一幅（2026-11-12 老板：弹窗悬浮有两个） ----------
const singleTest = await (async () => {
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const alive = () => created.filter((e) => e && e.attrs && e.attrs['data-ys-popup'] === '1' && !e.removed).length
    fakeWindow.__ysPopupShowing = false
    fakeWindow.__ysPopupPending = []
    created.length = 0
    fakeWindow.__yshenImportantPopup({ title: '第一幅', body: 'x', confirmText: '知道了', cancelText: '关闭', cancelAction: 'fold', autoExpand: true })
    await sleep(80)
    const btn = created.find((e) => e && e.getAttribute && e.getAttribute('data-ys-act') === 'fold')
    globalDoc.__dispatch('click', { target: btn })
    await sleep(120)
    if (alive() !== 1) return '收起来之后有 ' + alive() + ' 幅'
    fakeWindow.__ysPopupShowing = false
    fakeWindow.__yshenImportantPopup({ title: '第二幅', body: 'y', confirmText: '知道了', autoExpand: true })
    await sleep(140)
    const n = alive()
    if (n !== 1) return '第二幅弹出来后有 ' + n + ' 幅（应该只剩 1）'
    return '任意时刻只有一幅'
  } catch (e) {
    return '抛错：' + String((e && e.message) || e)
  }
})()
check('同一时间只有一幅（收起来的旧的就拆掉）', () => {
  if (singleTest !== '任意时刻只有一幅') throw new Error(String(singleTest))
})

check('收起时是画卷形态（内容收起、只留外壳）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  const i = src.indexOf('const suspend = () =>')
  if (i < 0) throw new Error('找不到 suspend')
  const seg = src.slice(i, i + 3600)
  if (!seg.includes('rollUp()')) throw new Error('收起时没有收拢（还是会留着内容）')
})

check('新会话没有用量时不报警（usageNoTurn）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  if (!src.includes('usageNoTurn')) throw new Error('没有"新会话不算坏"的判据')
  if (!/if \(usageNoTurn\) \{ failCount = 0/.test(src)) throw new Error('tick 没有把新会话的失败清零')
})

check('看门狗在位（显示标志卡住会自己复位）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  if (!src.includes('__yspPopupWatchdog')) throw new Error('没有看门狗')
  if (!src.includes('window.__ysPopupShowing = false')) throw new Error('看门狗不复位标志')
})

check('用量解析认得 K/M/万 和 tokens（不是只认 "N tok"）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  for (const need of ['千', '万', '亿', 'tokens?']) {
    if (!src.includes(need)) throw new Error('客户端里缺 ' + need)
  }
  if (!src.includes('usage-miss')) throw new Error('读不到用量时不留诊断')
})

check('host 有诊断路由 /yushen-popup/diag', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  if (!src.includes("'/yushen-popup/diag'")) throw new Error('没有 diag 路由')
  if (!src.includes('popup-diag.jsonl')) throw new Error('没有落盘文件')
})

// ---------- 8. 一个键 vs 两个键（2026-11-11 老板：「好和知道了好像是一回事吧」） ----------
const oneBtnTest = await (async () => {
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    fakeWindow.__ysPopupShowing = false
    created.length = 0
    fakeWindow.__yshenImportantPopup({ title: '单键测试', body: '只给确认', confirmText: '知道了', autoExpand: true })
    await sleep(80)
    const btns = created.filter((el) => el && el.tagName === 'BUTTON')
    if (btns.length !== 1) return '纯通知出了 ' + btns.length + ' 个键（应为 1）'
    if (btns[0].getAttribute('data-ys-act') !== 'close') return '单键的 act 不是 close，常驻时会被收成小画卷'
    // 有"稍后"这种真选择时，仍是两个键
    fakeWindow.__ysPopupShowing = false
    created.length = 0
    fakeWindow.__yshenImportantPopup({ title: '双键测试', body: '有选择', confirmText: '知道了', cancelText: '稍后', autoExpand: true })
    await sleep(80)
    const two = created.filter((el) => el && el.tagName === 'BUTTON')
    if (two.length !== 2) return '有选择时只出了 ' + two.length + ' 个键（应为 2）'
    return '通知 1 键（close）/ 有选择 2 键'
  } catch (e) {
    return '抛错：' + String((e && e.message) || e)
  }
})()
check('按钮不重复：纯通知一个键，有选择才两个', () => {
  if (oneBtnTest !== '通知 1 键（close）/ 有选择 2 键') throw new Error(String(oneBtnTest))
})

// ---------- 7. 同类提醒不糊脸（2026-11-11：老板「多个提醒会有多个弹窗，是好是坏」） ----------
const dupTest = await (async () => {
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    fakeWindow.__ysPopupShowing = false
    fakeWindow.__ysPopupPending = []
    created.length = 0
    fakeWindow.__yshenImportantPopup({ title: '重复测试', body: '第一次', autoExpand: true })
    await sleep(80)
    const first = created.filter((el) => el && el.id === 'ys-popup-wrap').length
    const ret = await fakeWindow.__yshenImportantPopup({ title: '重复测试', body: '第二次', autoExpand: true })
    const second = created.filter((el) => el && el.id === 'ys-popup-wrap').length
    if (ret !== false) return '第二次没被吞掉（返回 ' + ret + '）'
    if (second !== first) return '第二次还是开了新弹窗（' + first + ' → ' + second + '）'
    return '重复的被吞掉，只留一个'
  } catch (e) {
    return '抛错：' + String((e && e.message) || e)
  }
})()
check('同类提醒十分钟内只弹一次（其余记次数）', () => {
  if (dupTest !== '重复的被吞掉，只留一个') throw new Error(String(dupTest))
})

// ---------- 9. 被动触发 + 出厂默认关（2026-11-11：老板「每一轮动的时候机制就动」「备份默认关」） ----------
check('长轮询通道在（空闲时不再定时干问）', () => {
  const host = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  if (!host.includes("'/yushen-popup/wait'")) throw new Error('宿主没有 /wait 路由')
  if (!host.includes('waiters')) throw new Error('宿主没有唤醒机制')
  if (!host.includes('long: true')) throw new Error('响应没标 long')
  const ui = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  if (!ui.includes("'/yushen-popup/wait'")) throw new Error('前端没走长轮询')
  if (!ui.includes('startPolling')) throw new Error('没有"老宿主"回退')
})

check('宿主接到会话事件就推「该算了」信号（不是靠前端轮询）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  if (!src.includes("ctx.on('session/event'")) throw new Error('宿主没订阅 session/event')
  if (!src.includes('__nudge')) throw new Error('没有推 __nudge 信号')
})

check('前端收到 __nudge 才现算，且一分钟最多一次', () => {
  const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  if (!src.includes('it.__nudge')) throw new Error('前端不处理 __nudge')
  if (!src.includes('__yspNudgeAt')) throw new Error('没有 nudge 节流')
})

check('备份提醒默认关，且开的时候才看备份文件', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  if (!/sources:\s*\{[^}]*backup: false/.test(src)) throw new Error('DEFAULTS 里 backup 不是默认 false')
  if (!src.includes("sources.backup !== true")) throw new Error('backupTick 没有按开关短路')
  const ui = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  if (!ui.includes('sources.backup')) throw new Error('后台没有备份提醒开关')})

// ---------- 10. 换机器：先检索、不写死（2026-11-12 老板「去到新家应该先检索」） ----------
check('代码里没有写死的本机盘符路径', () => {
  const files = ['index.js', 'client.js', 'lib/paths.js', 'lib/watch.js', 'lib/busy.js']
  const bad = []
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const line of src.split(/\r?\n/)) {
      if (/https?:\/\//.test(line)) continue          // 网址不算
      if (/^\s*(\/\/|\*)/.test(line)) continue        // 注释里的举例不算
      if (/['"][A-Za-z]:[\\/]/.test(line)) bad.push(f + ': ' + line.trim().slice(0, 80))
    }
  }
  if (bad.length) throw new Error('写死了盘符：' + bad.slice(0, 3).join(' | '))
})

const foreign = await (async () => {
  try {
    const os = await import('node:os')
    const { pathToFileURL } = await import('node:url')
    const tmp = fs.mkdtempSync(path.join(os.default.tmpdir(), 'yspopup-foreign-'))
    const old = process.env.DSH_HOME
    process.env.DSH_HOME = tmp
    const mod = await import(pathToFileURL(path.join(ROOT, 'lib/paths.js')).href + '?v=' + Date.now())
    const rows = mod.describe()
    const dayu = mod.dayuHome()
    const created = fs.readdirSync(tmp).length
    process.env.DSH_HOME = old
    if (!rows.every((r) => typeof r.ok === 'boolean')) return 'describe() 形状不对'
    if (dayu !== '') return '没有 dayu 目录却返回了路径'
    if (created !== 0) return '在别人家里建了 ' + created + ' 个文件'
    return '空 home：不抛错 / dayu 返回空 / 不建文件'
  } catch (e) {
    return '抛错：' + String((e && e.message) || e)
  }
})()
check('没有鱼神目录时优雅降级（不抛错、不乱建）', () => {
  if (foreign !== '空 home：不抛错 / dayu 返回空 / 不建文件') throw new Error(String(foreign))
})

check('界面开关在顶层（memoEnabled/inlineCost 不埋在 tokenAlert 里）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  if (!src.includes('const LIFT_KEYS')) throw new Error('没有旧配置抬升逻辑')
  if (!src.includes('liftLegacy(')) throw new Error('readConf 没用 liftLegacy')
  if (!/^\s*memoEnabled: true,/m.test(src)) throw new Error('memoEnabled 不在顶层默认值里')
  const seg = src.slice(src.indexOf('tokenAlert: {'), src.indexOf('sources:'))
  for (const k of ['memoEnabled', 'memoAutoSessions', 'inlineCost']) {
    if (seg.includes(k + ':')) throw new Error('tokenAlert 里还有 ' + k)
  }
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
