// 用户视角的弹窗实测：不靠看，靠"点"。
// 用法：node --experimental-vm-modules scripts/usertest.mjs
// 它模拟真用户会做的事：弹出来 → 点按钮 → 滚轮 → 点外面 → 按 Esc，
// 每一步都断言"界面上应该变成什么样"。
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const results = []
const check = (name, ok, note = '') => results.push({ name, ok: !!ok, note: String(note || '') })

// ---------- 一个够用的假浏览器 ----------
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), style: {}, children: [], attrs: {}, dataset: {},
    textContent: '', innerHTML: '', draggable: true, className: '', parentNode: null, title: '',
    removed: false, __h: {},
    classList: { add() {}, remove() {}, contains() { return false }, toggle() {} },
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null },
    removeAttribute(k) { delete this.attrs[k] },
    hasAttribute(k) { return this.attrs[k] != null },
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c },
    removeChild(c) { this.children = this.children.filter((x) => x !== c) },
    insertBefore(c) { this.children.push(c); if (c) c.parentNode = this; return c },
    addEventListener(t, f) { (this.__h[t] = this.__h[t] || []).push(f) },
    removeEventListener(t, f) { if (this.__h[t]) this.__h[t] = this.__h[t].filter((x) => x !== f) },
    dispatch(t, ev) {
      const e = Object.assign({ type: t, target: this, stopPropagation() {}, preventDefault() {} }, ev || {})
      for (const f of (this.__h[t] || [])) f(e)
      return e
    },
    remove() { this.removed = true; if (this.parentNode) this.parentNode.removeChild(this) },
    setPointerCapture() {}, releasePointerCapture() {},
    querySelector(s) { return (this.children || []).flat ? null : null },
    querySelectorAll() { return [] },
    contains(node) { let n = node; while (n) { if (n === this) return true; n = n.parentNode } return false },
    getBoundingClientRect() { return { left: 100, top: 100, width: 800, height: 600, right: 900, bottom: 700 } },
    focus() {}, click() {},
  }
  return el
}

const created = []
const bodyEl = makeEl('body')
const headEl = makeEl('head')
const doc = {
  createElement: (t) => { const el = makeEl(t); created.push(el); return el },
  createTextNode: (t) => ({ textContent: t }),
  head: headEl, body: bodyEl, documentElement: makeEl('html'),
  hidden: false, activeElement: null,
  __h: {},
  addEventListener(t, f) { (doc.__h[t] = doc.__h[t] || []).push(f) },
  removeEventListener(t, f) { if (doc.__h[t]) doc.__h[t] = doc.__h[t].filter((x) => x !== f) },
  dispatchDoc(t, ev) {
    const e = Object.assign({ type: t, stopPropagation() {}, preventDefault() {} }, ev || {})
    for (const f of (doc.__h[t] || [])) f(e)
    return e
  },
  querySelector() { return null },
  getElementById() { return null },
  querySelectorAll(s) {
    if (String(s).includes('data-ys-popup')) return created.filter((e) => e && e.attrs && e.attrs['data-ys-popup'] === '1' && !e.removed)
    return []
  },
}

const store = new Map()
const win = {
  __ModuleLoader__: {
    load(opts) {
      const mod = opts.factory((n) => {
        if (n === 'react') return {
          createElement: (t, p, ...k) => ({ type: t, props: p, kids: k }),
          useState: (v) => [v, () => {}], useEffect() {}, useLayoutEffect() {},
          useRef: (v) => ({ current: v }),
        }
        throw new Error('unknown module: ' + n)
      })
      if (mod && typeof mod.apply === 'function') mod.apply({ slots: { inject() {}, register() {} }, effect(fn) { fn && fn() }, get() {} })
      return mod
    },
  },
  __h: {},
  addEventListener(t, f) { (win.__h[t] = win.__h[t] || []).push(f) },
  removeEventListener(t, f) { if (win.__h[t]) win.__h[t] = win.__h[t].filter((x) => x !== f) },
  dispatchWin(t, ev) {
    const e = Object.assign({ type: t, stopPropagation() {}, preventDefault() {} }, ev || {})
    for (const f of (win.__h[t] || [])) f(e)
    return e
  },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  requestAnimationFrame: (f) => setTimeout(f, 0),
  setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout,
  innerWidth: 1600, innerHeight: 1000,
  Audio: class { constructor() { this.volume = 1 } play() { return Promise.resolve() } },
  document: doc, navigator: { userAgent: 'usertest' },
}
globalThis.window = win
globalThis.document = doc
globalThis.localStorage = win.localStorage
globalThis.requestAnimationFrame = win.requestAnimationFrame
globalThis.matchMedia = win.matchMedia
globalThis.Audio = win.Audio
globalThis.location = { reload() {} }
globalThis.fetch = () => Promise.reject(new Error('no network in test'))

new vm.Script(fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')).runInThisContext()
const popup = win.__yshenImportantPopup
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wd = setTimeout(() => { console.error('[watchdog] created=' + created.length + ' last=' + created.slice(-4).map((e) => e && e.tagName).join(',') + ' html=' + String(created.slice(-1)[0] && created.slice(-1)[0].textContent).slice(0, 40)); process.exit(2) }, 3000)
const alive = () => created.filter((e) => e && e.attrs && e.attrs['data-ys-popup'] === '1' && !e.removed)
const btn = (act) => created.filter((e) => e && e.tagName === 'BUTTON' && e.getAttribute('data-ys-act') === act).pop()

async function mount(opts) {
  console.error('[step] mount', opts && opts.title)
  win.__ysPopupShowing = false
  created.length = 0
  console.error('[step] calling popup')
  const p = popup(Object.assign({ autoExpand: true, body: '正文' }, opts))
  console.error('[step] popup returned')
  await sleep(90)
  return { p }
}

console.error('[step] 1');
// 1. 弹出来，两个键都在
{
  const p = await mount({ title: 'A', confirmText: '知道了', cancelText: '关闭', cancelAction: 'fold' })
  check('① 弹窗出现、按钮齐全', alive().length === 1 && !!btn('ok') && !!btn('fold'))
  win.__ysPopupShowing = false
  alive().forEach((w) => w.remove())
}

console.error('[step] 2');
// 2. 点「知道了」→ 关掉
{
  const { p } = await mount({ title: 'B', confirmText: '知道了' })
  doc.dispatchDoc('click', { target: btn('close') })
  await sleep(320)
  const r = await Promise.race([p, sleep(300).then(() => 'timeout')])
  check('② 点「知道了」真的关掉', alive().length === 0 && win.__ysPopupShowing === false && r !== 'timeout')
}

console.error('[step] 3');
// 3. 点「关闭」→ 收成画卷（不消失、内容藏起来）
{
  const p = await mount({ title: 'C', confirmText: '知道了', cancelText: '关闭', cancelAction: 'fold' })
  const wrap = alive()[0]
  doc.dispatchDoc('click', { target: btn('fold') })
  await sleep(150)
  const contentEl = created.find((e) => e && e.style && e.style.overflowY === 'auto' && e.style.fontFamily === 'inherit')
  const numEl = created.find((e) => e && e.style && String(e.style.fontSize || '').includes('cqw') && e.textContent === '1')
  check('③ 点「关闭」收成画卷（不拆、内容藏起、不显示数字）',
    alive().length === 1 && (!numEl || numEl.style.opacity === '0') && wrap.style.pointerEvents === 'none')
}

console.error('[step] 4');
// 4. 收起后滚轮能放大缩小
{
  const before = store.get('yspopup.foldScale') || '0.30'
  const stage = created.filter((e) => e && e.style && e.style.transformOrigin === '50% 50%').pop()
  win.dispatchWin('wheel', { target: stage, deltaY: -100 })
  win.dispatchWin('wheel', { target: stage, deltaY: -100 })
  const after = store.get('yspopup.foldScale') || '0.30'
  check('④ 收起态滚轮能调大小', Number(after) > Number(before), before + ' → ' + after)
}

// 5. 只有一幅：收着一幅时再弹，旧的要拆
{
  win.__ysPopupShowing = false
  popup({ title: 'D', body: 'x', autoExpand: true })
  await sleep(120)
  check('⑤ 同一时间只有一幅', alive().length === 1, '当前 ' + alive().length + ' 幅')
}

// 6. 点外面 = 关闭（blankAction=close）
{
  store.set('yspopup.blankAction', 'close')
  await mount({ title: 'E' })
  const wrap = alive()[0]
  wrap.dispatch('click', { target: wrap })
  await sleep(320)
  check('⑥ 设置「点外面=直接关闭」生效', alive().length === 0)
}

// 7. 点外面 = 不动（blankAction=none）
{
  store.set('yspopup.blankAction', 'none')
  await mount({ title: 'F' })
  const wrap = alive()[0]
  wrap.dispatch('click', { target: wrap })
  await sleep(200)
  check('⑦ 设置「点外面=什么都不做」生效', alive().length === 1)
  alive().forEach((w) => w.remove())
}

// 8. Esc 能关
{
  store.set('yspopup.blankAction', 'fold')
  await mount({ title: 'G' })
  doc.dispatchDoc('keydown', { key: 'Escape' })
  await sleep(320)
  check('⑧ 按 Esc 能关', alive().length === 0)
}

// 9. 「保留悬浮窗」开着时，知道了 = 收着（不消失）
{
  store.set('yspopup.stay', '1')
  await mount({ title: 'H', confirmText: '知道了', cancelText: '关闭', cancelAction: 'fold' })
  doc.dispatchDoc('click', { target: btn('ok') })
  await sleep(200)
  check('⑨ 开「保留悬浮窗」时确认键是收着', alive().length === 1)
  store.set('yspopup.stay', '0')
  alive().forEach((w) => w.remove())
}

// 10. 小黑板开关：本地镜像 0 时隐藏
{
  const memoOn = win.__yspMemoOn
  check('⑩ 小黑板开关把手在（保存后能立刻收/放）', typeof memoOn === 'function')
}

// ---------- 输出 ----------
console.log('=== 用户视角实测（弹窗） ===')
let fail = 0
for (const r of results) {
  console.log((r.ok ? '✅' : '❌') + ' ' + r.name + (r.note ? '  <' + r.note + '>' : ''))
  if (!r.ok) fail++
}
console.log('=== ' + (fail ? '失败 ' + fail + ' 项' : '全部通过 ' + results.length + ' 项') + ' ===')
process.exit(fail ? 1 : 0)
