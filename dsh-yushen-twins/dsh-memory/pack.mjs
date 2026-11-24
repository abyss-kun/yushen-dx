// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜dsh-memory/pack.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: dsh-memory-pack
 * kind: script
 * tags: 记忆, 独立插件, 打包, 自带库, 复制
 * created: 2026-11-07 22:50:00
 * changed: 2026-11-17 21:45:00
 * 改｜2026-11-17 21:45｜大鱼·工作台会话｜授权：老板「检查记忆插件」｜pack.mjs:31-37,CORE_RUNTIME/CORE_FILES｜
 *   独立包漏件：query.js 依赖的 runtime/time-range.js、runtime/share.js 不在白名单，打包后 import 直接 ERR_MODULE_NOT_FOUND；
 *   另 CORE_FILES 只带 pick.mjs，独立包的 heartbeat() 报「核心太旧」。两处补齐，打包 47→50 个文件。
 *   验证：扫描独立包 import 缺失=0；打包后 import + status/remember/recall/heartbeat 全通（backend 分别为 lite / memory-core/pick / memory-core/heartbeat.mjs）。
 *  why: 原 changed 2026-11-07 22:55:00
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 S4 任务书：pack.mjs——独立打包时把库带上；S5：bundle 层与显示资源一起带）
 * why: dsh-memory 是壳，记忆库本体在 ../memory-core/；独立发出去时对方机器上没有那个目录，
 *      所以打包前把「独立包真能用的那部分库」复制进壳里（壳找库的顺序是：仓里那份 → 壳里这份）。
 * result: pack() / CLI：复制 memory-core/pick.mjs → <out>/memory-core/，再带两样库依赖（别名表、脱敏规则）。
 *         out 不是壳目录时连壳的文件（index.js/package.json/README.md/cordis.patch.yml/icon.svg + locale/）一起复制成完整包。
 * mutable: 可改
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const CORE_SRC = path.join(REPO, 'memory-core')
const LIB_SRC = path.join(REPO, 'lib')
// 壳自己的文件：入口 + 清单 + 说明 + bundle 层（cordis.patch.yml）+ 显示资源（locale/ icon）。
// cordis.patch.yml 是 S5 补的：没有它，独立包只是「普通依赖」，宿主不会 apply。
const SHELL_FILES = ['index.js', 'client.js', 'control.js', 'root-config.js', 'package.json', 'README.md', 'cordis.patch.yml', 'icon.svg']
const SHELL_DIRS = ['locale']
// 库里「独立包真能用」的只有 pick.mjs（召回选法，零外部依赖）。
// store.mjs 要鱼神名册（lib/characters.js）、审计、逻辑时钟；search.mjs 要 lib/recall-now.js——
// 这些拷进独立包也加载不起来，还会把「人格/角色」拖进来。写走壳内置写手（同格式），status 里 backend 会写明 lite。
// 2026-11-17：独立壳要能看「最近跳了什么」，heartbeat.mjs 也得带上（它只依赖 node 内置，独立包能加载）；
// 原先只带 pick.mjs，独立包的 heartbeat() 直接报「核心太旧」。
const CORE_FILES = ['pick.mjs', 'heartbeat.mjs']
const CORE_RUNTIME = [
  'generic/definitions.js', 'generic/self-memory.js', 'generic/now-page.js', 'generic/cards.js',
  'runtime/root.js', 'runtime/control.js', 'runtime/source.js', 'runtime/transcript.js',
  'runtime/projection.js', 'runtime/capture.js', 'runtime/middle.js', 'runtime/filter.js',
  'runtime/markers.js', 'runtime/archive.js', 'runtime/time.js', 'runtime/time-range.js', 'runtime/shelf.js', 'runtime/query.js',
  'runtime/refine-queue.js', 'runtime/shallow.js', 'runtime/role.js', 'runtime/refine-judge.js', 'runtime/feedback.js', 'runtime/recall-use.js', 'runtime/tier.js', 'runtime/manual.js', 'runtime/links.js', 'runtime/tombstone.js', 'runtime/relink.js', 'runtime/merge.js', 'runtime/backfill-turnid.js', 'runtime/cards.js', 'runtime/tasks.js', 'runtime/heartbeat-digest.js', 'runtime/person-card.js', 'runtime/incidents.js',
  'runtime/heat.js', 'runtime/usage.js', 'runtime/open-loops.js', 'runtime/share.js',
]
const LIB_FILES = ['aliases.json', 'redact.js']

function samePath(a, b) {
  const norm = (p) => path.resolve(String(p || '')).replace(/[\\/]+$/, '').toLowerCase()
  return Boolean(a) && Boolean(b) && norm(a) === norm(b)
}

/**
 * 把库带进壳里。
 * @param {{out?: string}} [opts] out 默认就是壳目录；传别的目录会连壳文件一起复制（独立包）。
 * @returns {string[]} 写出来的文件（绝对路径）
 */
export function pack({ out = HERE } = {}) {
  if (!fs.existsSync(path.join(CORE_SRC, 'pick.mjs'))) throw new Error(`找不到记忆库：${CORE_SRC}`)
  const dest = path.resolve(out)
  const written = []
  fs.mkdirSync(path.join(dest, 'memory-core'), { recursive: true })
  for (const name of CORE_FILES) {
    const from = path.join(CORE_SRC, name)
    if (!fs.existsSync(from)) throw new Error(`记忆库缺 ${name}：${CORE_SRC}`)
    const to = path.join(dest, 'memory-core', name)
    fs.copyFileSync(from, to)
    written.push(to)
  }
  for (const name of CORE_RUNTIME) {
    const from = path.join(CORE_SRC, name)
    // 2026-11-17：原来是 continue——白名单和 memory-core 对不上时静默少带，独立包 import 才炸。
    // 宁可打包当场报错，也不要发出一个「看起来打包成功、装上去跑不起来」的包。
    if (!fs.existsSync(from)) throw new Error(`记忆库缺 ${name}（白名单与 memory-core 对不上）：${CORE_SRC}`)
    const to = path.join(dest, 'memory-core', name)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    written.push(to)
  }
  fs.mkdirSync(path.join(dest, 'lib'), { recursive: true })
  for (const name of LIB_FILES) {
    const from = path.join(LIB_SRC, name)
    if (!fs.existsSync(from)) throw new Error(`打包缺库文件 ${name}：${LIB_SRC}`)
    const to = path.join(dest, 'lib', name)
    if (path.resolve(from) === path.resolve(to)) continue
    fs.copyFileSync(from, to)
    written.push(to)
  }
  if (!samePath(dest, HERE)) {
    for (const name of SHELL_FILES) {
      const from = path.join(HERE, name)
      if (!fs.existsSync(from)) throw new Error(`壳缺文件 ${name}：${HERE}`)
      const to = path.join(dest, name)
      fs.copyFileSync(from, to)
      written.push(to)
    }
    for (const dir of SHELL_DIRS) {
      const fromDir = path.join(HERE, dir)
      if (!fs.existsSync(fromDir)) continue
      fs.mkdirSync(path.join(dest, dir), { recursive: true })
      for (const name of fs.readdirSync(fromDir)) {
        const from = path.join(fromDir, name)
        if (!fs.statSync(from).isFile()) continue
        const to = path.join(dest, dir, name)
        fs.copyFileSync(from, to)
        written.push(to)
      }
    }
    // 仓库里的 control.js 指向 ../memory-core（同级仓库）；独立包根目录下要改成 ./memory-core。
    const standaloneControl = path.join(dest, 'control.js')
    fs.writeFileSync(standaloneControl, "export * from './memory-core/runtime/control.js'\n", 'utf8')
    written.push(standaloneControl)
    // index.js 里有一条静态 import '../memory-core/...'；独立包里库在 ./memory-core，改掉。
    const standaloneIndex = path.join(dest, 'index.js')
    if (fs.existsSync(standaloneIndex)) {
      const s = fs.readFileSync(standaloneIndex, 'utf8').replaceAll("'../memory-core/", "'./memory-core/")
      fs.writeFileSync(standaloneIndex, s, 'utf8')
    }
  }
  return written
}

// CLI：node dsh-memory/pack.mjs [输出目录]
if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  const out = path.resolve(process.argv[2] || HERE)
  const files = pack({ out })
  console.log(`[dsh-memory] 打包：${files.length} 个文件 → ${out}`)
  for (const file of files) console.log(`  ${path.relative(out, file).replace(/\\/g, '/')}`)
}
