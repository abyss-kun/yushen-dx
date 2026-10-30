// 路径总入口：所有外部目录都从这里来，别再往代码里写死盘符。
//
// 为什么要有（2026-10-28）：交付检查发现 51 处写死路径散在 34 个文件里
// （C:/Users/Administrator、D:/DSH、D:/deepseekTools、D:/AiTOOLS）。
// 换个机器、换个用户名，插件第一步就崩。
//
// 规矩：
//   1. 先看环境变量（给高级用户/测试用）；
//   2. 再看几个常见候选（老机器上原来那个位置）；
//   3. 都找不到 → 返回 ''，调用方必须优雅降级（不抛错、不假装能用）。
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()
const exists = (p) => { try { return Boolean(p) && fs.existsSync(p) } catch { return false } }
const firstExisting = (list, fallback = '') => list.find((p) => exists(p)) || fallback

/** DSH 家目录（几乎所有人都是 ~/.dsh）。 */
export function dshHome() {
  return process.env.DSH_HOME || path.join(HOME, '.dsh')
}

/** 鱼神自己的数据目录（记忆、运行时、账本都在这儿）。 */
export function dayuHome() {
  return path.join(dshHome(), 'dayu')
}

/** 包根目录（本文件在 lib/ 下，上一级就是包根）。
 * 注意：不能用 new URL(...).pathname——中文路径会被百分号编码（2026-10-28 实测踩过）。 */
export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

/**
 * 工作区：原来的 D:\DSH\大小鱼。
 * 顺序：YUSHEN_WS → DSH_WORKSPACE → 包根目录的父级 → cwd。
 */
/** 找 Python：先看环境变量，再看常见位置；找不到就回 'python'（让 PATH 兜）。 */
export function pythonPath() {
  if (process.env.DSH_PYTHON) return process.env.DSH_PYTHON
  const cands = [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
    '/usr/bin/python3',
    '/usr/local/bin/python3',
  ]
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c } catch { /* 忽略 */ }
  }
  return 'python'
}

export function workspace() {
  const env = process.env.YUSHEN_WS || ''
  if (env) return env
  // 包根目录的父级就是鱼神的工作区（那儿有员工手册/框架定义）——优先于 cwd，
  // 因为 DSH 里每条会话的 cwd 可能是别的地方（2026-10-28 实测踩过：被 DSH_WORKSPACE 带跑）。
  const parent = path.dirname(packageRoot())
  if (exists(path.join(parent, '员工手册.md')) || exists(path.join(parent, '大小鱼-框架定义.md'))) return parent
  return process.env.DSH_WORKSPACE || process.cwd()
}

/** QQ 桥根目录：装哪儿由用户定，找不到就是 ''。 */
export function qqBridgeRoot() {
  return process.env.QQ_BRIDGE_ROOT
    || firstExisting([
      path.join(workspace(), '..', 'deepseekTools', 'qq-bridge'),
      path.join(HOME, 'qq-bridge'),
      'D:/deepseekTools/qq-bridge',
    ])
}

/** 桥的状态目录（social-v2.json、人设状态都在这儿）。 */
export function qqBridgeState() {
  return process.env.QQ_BRIDGE_STATE || (qqBridgeRoot() ? path.join(qqBridgeRoot(), 'state') : '')
}

/** 桥的源码目录（读代码用）。 */
export function qqBridgeSrc() {
  return process.env.QQ_BRIDGE_SRC || (qqBridgeRoot() ? path.join(qqBridgeRoot(), 'src') : '')
}

/** 本地小模型（llama-server + 模型文件）。 */
export function localLlmDir() {
  return process.env.YUSHEN_LOCAL_DIR
    || firstExisting([path.join(workspace(), '..', 'deepseekTools', 'local-llm'), 'D:/deepseekTools/local-llm'])
}

/** 角色素材库（立绘原图）。 */
export function assetRoot() {
  return process.env.YUSHEN_ASSET_ROOT
    || firstExisting([path.join(workspace(), 'assets', 'character-library'), 'D:/AiTOOLS/角色素材库'])
}

/** DSH 安装目录里的 app.asar（读宿主内部实现用）。 */
export function asarPath() {
  if (process.env.DSH_ASAR) return process.env.DSH_ASAR
  const cands = [
    path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
    path.join(HOME, 'AppData', 'Local', 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
  ]
  return firstExisting(cands)
}

/** DSH 的插件材质目录（qq-chat-v2 预设等）。 */
export function pluginPresetsDir() {
  return process.env.YUSHEN_PRESETS_DIR || path.join(dshHome(), 'plugins', 'qq-agent-presets', 'presets')
}

/** 跨机器的"能用/不能用"清单：给安装文档和诊断用。 */
export function describe() {
  const rows = [
    ['DSH 家目录', dshHome()],
    ['工作区', workspace()],
    ['QQ 桥', qqBridgeRoot()],
    ['桥状态', qqBridgeState()],
    ['本地小模型', localLlmDir()],
    ['素材库', assetRoot()],
    ['宿主 asar', asarPath()],
    ['预设目录', pluginPresetsDir()],
  ]
  return rows.map(([name, p]) => ({ name, path: p, ok: exists(p) }))
}

/** 共享知识库（可选）：没有就是空，调用方跳过。 */
export function knowledgeBook() {
  return process.env.YUSHEN_WORKSPACE_BOOK
    || firstExisting([path.join(workspace(), '共享知识库.md'), 'D:/AiTOOLS/共享知识库.md'])
}

/** 异机备份目标盘：优先生成在工作区那块盘上，找不到再退回数据盘。 */
export function offsiteDir() {
  if (process.env.YUSHEN_OFFSITE_DIR) return process.env.YUSHEN_OFFSITE_DIR
  const wsDrive = path.parse(workspace()).root || ''
  const dataDrive = path.parse(dayuHome()).root || 'C:\\'
  const base = wsDrive || dataDrive
  return firstExisting([path.join(base, '鱼神备份'), path.join(dataDrive, '鱼神备份')], path.join(base, '鱼神备份'))
}

/** 宝藏图库（立绘/表情存放处）。 */
export function treasureDir() {
  return process.env.YUSHEN_TREASURE_ROOT
    || process.env.TREASURE_ROOT
    || firstExisting([path.join(dayuHome(), 'treasure'), 'D:/小肥鱼的宝藏'], path.join(dayuHome(), 'treasure'))
}

/** 统计磁盘用的盘：工作区在哪块盘就统计哪块（那才是数据盘）。 */
export function dataDrive() {
  return path.parse(workspace()).root || path.parse(dayuHome()).root || 'C:\\'
}