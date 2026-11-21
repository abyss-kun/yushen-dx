// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 每日维护：备份 / 归档 / 索引 / 审计 / 清理，**全部在这个独立进程里做**。
//
// 为什么要有它（2026-11-03 00:0x，老板亲口）：「这种东西为什么要放在宿主里面去做，
// 不应该做个脚本之类的放到本地去，宿主只需要发个命令」。实况：00:02:56–00:05:39
// 宿主的心跳断了 164 秒、界面冻住，因为 backupTick 在宿主进程里同步跑
// `fs.cpSync` 拷 3 万文件 + 一串 `spawnSync`——事件循环被堵死，网页看着像掉线。
//
// 现在：宿主只 spawn 一次这个脚本（不等待、不读输出），所有同步重活都在这里。
// 宿主下一轮读 `runtime/maintenance-last.json`，把 lines 说出来。
//
// 用法：
//   node scripts/maintenance.mjs                 # 该跑的都跑（同一个小时里重复跑会走护栏）
//   node scripts/maintenance.mjs --plan          # 只看这一轮会跑什么，不动任何东西
//   node scripts/maintenance.mjs --only=offsite  # 只跑某几步（逗号分隔）
//   node scripts/maintenance.mjs --home=<目录>   # 用别的家目录（测试用）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 2026-11-04 老板：本地进程不能占着不放（宿主崩了也得能修）。硬超时自己退。
import { hardTimeout } from '../lib/offline-guard.js'
hardTimeout(30, 'maintenance.mjs')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const planOnly = Boolean(flag('plan'));
const onlyArg = flag('only');
const only = onlyArg ? new Set(String(onlyArg.split('=')[1] || '').split(',').map((s) => s.trim()).filter(Boolean)) : null;
const homeArg = flag('home');
if (homeArg) process.env.DSH_HOME = String(homeArg.split('=')[1] || '');

// 库在 import 时读 DSH_HOME，所以必须在设完环境之后再动态加载。
const { offsiteDir, offsiteSecondDir } = await import('../lib/paths.js');
const { runOffsiteBackup, runFullBackup, fullRoots } = await import('../lib/offsite.js');
const { fingerprint } = await import('../lib/fingerprint.js');
const { archiveSessions } = await import('../lib/session-archive.js');
const { buildDailyRecords } = await import('../lib/records.js');
const { buildKeyPoints } = await import('../lib/key-points.js');
const { checkTempCache } = await import('../lib/temp-cache.js');
const { verifyBackup, writeBackupReport, localDate } = await import('../lib/backup-verify.js');
const { noteIncident } = await import('../lib/incidents.js');
const { observe: observeLineage } = await import('../lib/content-lineage.js');
const { pruneBackups } = await import('../lib/prune.js');
const { archiveOld } = await import('../lib/archive.js');
const { rotateLogs } = await import('../lib/rotate.js');
const { isMobile } = await import('../lib/platform.js');
const { today: localToday } = await import('../lib/clock.js');
const { isPeak } = await import('../lib/peak.js');
const { refineQuota } = await import('../lib/refine-quota.js');
const { atFileOf, readRows, pickFreshOwnerMentions, ownerMentionLine, writeOwnerMentions } = await import('../lib/bili-inbox.js');

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const DATA = path.join(HOME, 'dayu');
const RUNTIME = path.join(DATA, 'runtime');
const OUT = path.join(RUNTIME, 'maintenance-last.json');
const LOG = path.join(RUNTIME, 'maintenance.log');

const started = Date.now();
const lines = [];
const steps = [];
const ownerMentions = [];
const say = (text) => { if (text) { lines.push(String(text)); } };

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function lastAt(file) {
  return Date.parse(readState(file).lastAt || readState(file).at || '') || 0;
}
function writeState(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value) + '\n', 'utf8');
  } catch { /* 状态写不下不影响已经做完的活 */ }
}
/** 同一天只跑一次的那套日期护栏（用本机日期，不用 UTC）。 */
// 2026-11-09 老板：「这么多东西一起是不是太频繁了」——按小时节流，别每次启动跑全套。
function throttleHours(markFile, hours) {
  try {
    const at = Date.parse(JSON.parse(fs.readFileSync(markFile, 'utf8')).at || '') || 0
    if (Date.now() - at < hours * 3600 * 1000) return false
  } catch { /* 没有标记 = 该跑 */ }
  return true
}
function markRan(markFile) {
  try {
    fs.mkdirSync(path.dirname(markFile), { recursive: true })
    fs.writeFileSync(markFile, JSON.stringify({ at: new Date().toISOString() }) + '\n', 'utf8')
  } catch { /* 写不上不影响主流程 */ }
}

function dueToday(markFile) {
  const today = localDate();
  return { due: String(readState(markFile).date || '') !== today, today };
}
function runScript(script, args = [], timeout = 120000) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    encoding: 'utf8', timeout, cwd: ROOT, windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE || '1' },
  });
  return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}
const lastLine = (text) => String(text || '').trim().split('\n').pop() || '';
const firstLine = (text) => String(text || '').trim().split('\n')[0] || '';
const clipText = (text, n = 120) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * 精提炼的积压数（只读）。
 * 2026-11-16：新链路只写 library/中层（state=queued），旧目录 library/待提炼、library/手抄本只做兼容读。
 * 规则：先数中层；旧目录有就数、没有不报错；同一个 id 只算一次（中层优先），免得新旧两份重复计入配额。
 * 只数带 turnId 的行——没有身份证的旧卡 refine --linked 也不炼，数进来只会让配额虚高。
 * @param {string} dataDir 数据根（默认本进程的 <DSH_HOME>/dayu）
 */
function countRefinePending(dataDir = DATA) {
  const seen = new Set();
  let pending = 0;
  const walk = (dir, accept) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return } // 目录不在 = 这一层没有
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, accept); continue }
      if (!e.name.endsWith('.jsonl')) continue;
      let text = '';
      try { text = fs.readFileSync(p, 'utf8') } catch { continue }
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let row = null;
        try { row = JSON.parse(line.replace(/^\uFEFF/, '')) } catch { continue } // 坏行不算
        if (!row || typeof row !== 'object' || !row.turnId) continue;
        const id = row.id ? String(row.id) : '';
        if (id && seen.has(id)) continue;
        if (!accept(row)) continue;
        if (id) seen.add(id);
        pending += 1;
      }
    }
  };
  // 新链路：中层只认显式 queued（和 memory-core/runtime/refine-queue.js 的口径一致）。
  walk(path.join(dataDir, 'library', '中层'), (row) => row.state === 'queued');
  // 旧目录兼容：待提炼（pending/queued/无 state），手抄本（queued）。没有就跳过，不报错。
  walk(path.join(dataDir, 'library', '待提炼'), (row) => !row.state || row.state === 'pending' || row.state === 'queued');
  walk(path.join(dataDir, 'library', '手抄本'), (row) => row.state === 'queued');
  return pending;
}

// 2026-11-03：磁盘上已经有一份比 state 更新的 FULL，就认领它（写完 manifest 才算完成）。
// 为什么：runFullBackup 不写状态，手动/子代理跑完以后这一份永远不被系统看见，24 小时内不会再排。
function adoptNewestFull(stateFile) {
  try {
    const root = path.join(offsiteDir(), 'FULL');
    const dirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(e.name))
      .map((e) => e.name)
      .sort();
    const newest = dirs[dirs.length - 1];
    if (!newest) return false;
    const dir = path.join(root, newest);
    const manifestFile = path.join(dir, 'manifest.json');
    const atMs = fs.statSync(manifestFile).mtimeMs; // 没写完的目录没有 manifest，直接抛错跳过
    // 2026-11-07（照微）：太旧的整份**不认领**。认领的意思是「这份是新的、系统没看见」，
    // 不是「磁盘上有一份就算数」。不卡年龄的话，机器关一夜回来会一直认领三天前那份，
    // 每天的真备份永远轮不上——11-04 和 11-07 两次的红都是我手动补的。
    // 26 小时：正常的每日全盘（24 小时一档）能认领，隔了一整天的旧份不能。
    if (Date.now() - atMs > 26 * 3600 * 1000) return false;
    const prev = readState(stateFile);
    if (atMs <= (Date.parse(prev.lastAt || '') || 0)) return false;
    let files = 0;
    try { files = Number(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).totalFiles) || 0; } catch { /* 读不到就记 0 */ }
    writeState(stateFile, { ...prev, lastAt: new Date(atMs).toISOString(), dir, files, adopted: true });
    say(`全盘备份：认领磁盘上已有的一份（${dir}，${files} 个文件）`);
    return true;
  } catch { return false; }
}

function want(step) {
  if (only) return only.has(step);
  return true;
}

// 2026-11-09 老板：重启不要自动备份。开关放文件里，脚本每轮重读，改完不用重启。
function autoBackupOff(step) {
  try {
    const sw = JSON.parse(fs.readFileSync(path.join(DATA, 'backup-switch.json'), 'utf8'));
    if (sw && sw.auto === false) {
      say(`自动备份已关（backup-switch.json）：跳过 ${step}`);
      return true;
    }
  } catch { /* 没有开关文件 = 按原行为备份 */ }
  return false;
}

const STEPS = {
  // 每次维护导出一份插件清单（重装后按清单恢复）；不挡备份，失败只记一行
  plugins() {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'export-plugins.mjs'), 'desktop'], { encoding: 'utf8', windowsHide: true, timeout: 20000 })
    if (r.error) throw r.error
    const line = String(r.stdout || '').split(/\r?\n/).find((x) => x.includes('插件清单'))
    say(line || '插件清单已导出')
    return 'done'
  },
  // 每小时一次离线快照（55 分钟一档，和 1 小时 tick 错开）。
  offsite() {
    if (autoBackupOff('offsite')) return 'skipped-off';
    if (isMobile()) return 'skip';
    // 全量到点的那一轮，小备份跳过（全量已经包含这些内容），等下一个小时
    if (!autoBackupOff('full')) {
      const fullState = path.join(DATA, 'full-backup.json');
      if (Date.now() - lastAt(fullState) >= 3 * 3600 * 1000) {
        say('小备份跳过：这一轮跑全量');
        return 'skipped-full';
      }
    }
    const stateFile = path.join(DATA, 'offsite.json');
    if (Date.now() - lastAt(stateFile) < 55 * 60 * 1000) return 'not-due';
    // 2026-11-04 老板问：「宿主没启动、代码没改，也要备份吗」——不用。备份是为了"变了能还原"，
    // 一点没变再备一份，只是多占磁盘、多读一遍家目录。所以先比指纹：没变就只推时间戳（跟 full 一个口径）。
    let fp = '';
    try { fp = fingerprint(fullRoots()); } catch { /* 算不了就照常备 */ }
    const prev = readState(stateFile);
    if (fp && prev.fingerprint === fp) {
      writeState(stateFile, { ...prev, lastAt: new Date().toISOString() });
      say('离线快照跳过：一点没变');
      return 'skipped-same';
    }
    const out = runOffsiteBackup({ target: offsiteDir(), keep: 14 });
    if (out.ok) {
      writeState(stateFile, { lastAt: new Date().toISOString(), dir: out.dir, files: out.manifest?.totalFiles || 0, fingerprint: fp });
      say(`离线快照：${out.dir}（${out.manifest?.totalFiles || 0} 个文件，清掉 ${out.pruned?.length || 0} 份旧的）`);
      return 'done';
    }
    say(`离线快照跳过：${out.reason || '目标不可用'}`);
    return 'failed';
  },
  // 一天一次全盘；先比指纹，一点没变就只推时间戳。
  full() {
    if (autoBackupOff('full')) return 'skipped-off';
    const stateFile = path.join(DATA, 'full-backup.json');
    // 2026-11-03（全量备份验收时发现）：runFullBackup 只写目标目录和 manifest，**不写这个状态文件**；
    // 状态只有这里会写。于是手动/子代理跑过一份全量以后，宿主仍以为"24 小时内不用再备"，
    // 那份新备份永远不被系统看见。这里先认领磁盘上比 state 更新的一份，再谈该不该跑。
    const adopted = adoptNewestFull(stateFile);
    if (adopted) return 'adopted';
    if (Date.now() - lastAt(stateFile) <= 3 * 3600 * 1000) return 'not-due';
    const prev = readState(stateFile);
    let fp = '';
    try { fp = fingerprint(fullRoots()); } catch { /* 算不了就照常备 */ }
    if (fp && prev.fingerprint === fp) {
      writeState(stateFile, { ...prev, lastAt: new Date().toISOString() });
      say('全盘备份跳过：一点没变');
      return 'skipped-same';
    }
    const full = runFullBackup({ keep: 3 });
    if (full.ok) {
      writeState(stateFile, { lastAt: new Date().toISOString(), dir: full.dir, files: full.manifest?.totalFiles || 0, fingerprint: fp });
      say(`全盘备份：${full.dir}（${full.manifest?.totalFiles || 0} 个文件）`);
      return 'done';
    }
    say(`全盘备份跳过：${full.reason || '目标不可用'}`);
    return 'failed';
  },
  // 第二块盘（防磁盘坏），一天一次。
  second() {
    if (autoBackupOff('second')) return 'skipped-off';
    if (Date.now() - lastAt(path.join(DATA, 'offsite-second.json')) <= 24 * 3600 * 1000) return 'not-due';
    const dir = offsiteSecondDir();
    if (!dir) return 'skip';
    const out = runOffsiteBackup({ target: dir, keep: 3 });
    if (out.ok) {
      writeState(path.join(DATA, 'offsite-second.json'), { lastAt: new Date().toISOString(), dir: out.dir, files: out.manifest?.totalFiles || 0 });
      say(`第二盘备份：${out.dir}（${out.manifest?.totalFiles || 0} 个文件）`);
      return 'done';
    }
    say(`第二盘备份跳过：${out.reason || '目标不可用'}`);
    return 'failed';
  },
  // 会话归档 + 各本索引 + 自审计（都不调模型）。
  archive() {
    const ar = archiveSessions();
    if (ar.written) say(`会话归档：新写 ${ar.written} 个（${ar.messages} 条消息）`);
    const hc = runScript('check-archive-health.mjs', ['--json'], 120000);
    if (hc.status === 1) {
      let why = '有问题（读不出详情）';
      try { why = (JSON.parse(hc.stdout || '{}').problems || []).join('；') || why; } catch { /* 用兜底文案 */ }
      say(`归档健康：${why}`);
    }
    const rec = buildDailyRecords();
    if (rec.written) say(`完整记录：新写 ${rec.written} 份（${rec.messages} 段）`);
    try { const kp = buildKeyPoints(); if (kp.days) say(`关键节点：${kp.days} 天 / ${kp.rows} 条`); } catch { /* 不影响别的 */ }
    const idx = runScript('build-live-index.mjs', [], 60000);
    say(lastLine(idx.stdout));
    for (const [label, script] of [['总书目', 'build-catalog.mjs'], ['记忆大纲', 'build-memory-outline.mjs']]) {
      const r = runScript(script, [], 240000);
      const first = firstLine(r.stdout);
      if (first) say(`${label}：${first}`);
    }
    const debt = runScript('promise-check.mjs', [], 60000);
    const dl = firstLine(debt.stdout);
    if (dl && !dl.includes('干净')) say(dl);
    // 2026-11-04 老板：「别人不问，自己会搜」——把心念/承诺/议程当关键词去翻旧账，只报新命中的。
    // 跟归档放一起跑（都在这个离线脚本里），不占宿主、不调模型。
    const rc = runScript('recall-auto.mjs', ['--json'], 240000);
    try {
      const out = JSON.parse(String(rc.stdout || '{}'));
      if (out.fresh) say(`自主检索：翻到 ${out.fresh} 条新的（${out.seeds} 个关键词）`);
    } catch { /* 没输出就不报 */ }
    // 2026-11-04 老板：「回不回靠关系好感，不摇骰子」——桥要读的阈值放在 relations/reply-sense.json，
    // 这里每小时刷一次（保留她改过的数字），保证文件一直在、桥读得到。
    runScript('build-reply-sense.mjs', [], 30000);
    // 2026-11-04 老板：「能本地就本地，别动不动上模型……定时巡视一圈看哪里要改」。
    // 自愈只修机械项（标签过期 / dist 落后 / 阈值文件缺），不调模型；修完只报"需要判断的"。
    const heal = runScript('self-heal.mjs', ['--json'], 120000);
    try {
      const out = JSON.parse(String(heal.stdout || '{}'));
      if (out.fixed && out.fixed.length) say(`自愈：${out.fixed.length} 件（${out.fixed[0].slice(0, 40)}）`);
    } catch { /* 没输出就不报 */ }
    runScript('check-context.mjs', [], 15000);
    // 2026-11-04 老板：「能放到电脑里正常工作的就别放宿主里，卡卡的容易把宿主搞崩」。
    // 遗忘（6h）和记忆合并（20h）原来跑在宿主进程里，现在搬到这里；脚本自带日期护栏，重启也不重复跑。
    const mh = runScript('memory-housekeeping.mjs', [], 300000);
    try {
      const out = JSON.parse(String(mh.stdout || '{}'));
      if (out.forget && !String(out.forget).includes('没有该清')) say(`记忆清理：${out.forget}`);
      if ((out.consolidate || []).length) say(`记忆合并：${out.consolidate.join('；')}`);
    } catch { /* 没输出就不报 */ }
    // 2026-11-04：账本结算 / 阶位重算 / 通道记忆回写 也从宿主搬过来了（各自带 5 分钟~1 小时护栏）。
    const ot = runScript('offline-ticks.mjs', [], 180000);
    try {
      const out = JSON.parse(String(ot.stdout || '{}'));
      const bits = [out.settle, ...(out.rank || []), out.channel].filter((x) => x && !String(x).startsWith('结算完成') && !String(x).startsWith('回写完成'));
      if (bits.length) say(`离线小活：${bits.join('；')}`);
    } catch { /* 没输出就不报 */ }
    // 2026-11-04 老板：「仓库里有月盘、半年盘、一年盘，天盘也有但一般不这么干」。
    // 盘点按日期自动选档：日盘只盘当天新增，月盘 30 天，半年/全年全量；盘亏（账有架无）要报出来。
    const inv = runScript('inventory.mjs', ['--auto'], 300000);
    const invLine = firstLine(inv.stdout);
    if (invLine) say(String(invLine).slice(0, 140));
    // 2026-11-04：别名单靠"她说没搜到"反向扩（数据驱动），一天一次就够。
    const ahMark = path.join(RUNTIME, 'alias-harvest.json');
    if (String(readState(ahMark).date || '') !== localToday()) {
      // 2026-11-04：淡忘——超过 30 天、非 core、没被冻住的记忆标 cold（不删，只不再进注入）。一天一次。
    const mdMark = path.join(RUNTIME, 'memory-decay.json');
    if (String(readState(mdMark).date || '') !== localToday()) {
      const mdec = runScript('memory-decay.mjs', [], 60000);
      try {
        const out = JSON.parse(String(mdec.stdout || '{}'));
        const n = (out.roles || []).reduce((s, r) => s + (r.changed || 0), 0);
        writeState(mdMark, { date: localToday(), marked: n });
        if (n) say(`淡忘：${n} 条旧记忆标为冷档（仍可查，不进注入）`);
      } catch { /* 没输出就不报 */ }
    }
    const ah = runScript('alias-harvest.mjs', ['--json'], 120000);
      try {
        const out = JSON.parse(String(ah.stdout || '{}'));
        writeState(ahMark, { date: localToday(), needAlias: (out.needAlias || []).length });
        if ((out.needAlias || []).length) say(`待补别名：${out.needAlias.length} 个词（正文有、查不到）→ catalog/待补别名.md`);
      } catch { /* 没输出就不报 */ }
    }
    const aud = runScript('audit-daily.mjs', [], 120000);
    say(lastLine(aud.stdout));
    // 临时缓存：每天看一次，超过 7 天没处理的提醒一句。
    const mark = path.join(RUNTIME, 'temp-cache-check.json');
    const today = localToday();
    if (String(readState(mark).date || '') !== today) {
      const tc = checkTempCache();
      writeState(mark, { date: today, stale: tc.stale.length });
      if (tc.stale.length) say(`临时缓存：${tc.stale.length} 个放了超过 7 天，该归位或进待删`);
    }
    return 'done';
  },
  // 每周巡视（2026-11-04 老板：「每一样都有人用吗？谁来维护——做成自动化，不需要维护，最多每周巡视一圈」）。
  // 一周一次：数 "7 天用了没"、查 "该修的坏没坏"、单角色装自动跳过姐妹相关项；报告落在 dayu/health/。
  patrol() {
    const stateFile = path.join(DATA, 'patrol.json');
    if (Date.now() - lastAt(stateFile) <= 7 * 24 * 3600 * 1000) return 'not-due';
    const r = runScript('weekly-patrol.mjs', [], 240000);
    writeState(stateFile, { lastAt: new Date().toISOString(), code: r.status });
    const line = firstLine(r.stdout) || lastLine(r.stderr) || '';
    if (line) say(line);
    return r.status === 0 ? 'done' : 'failed';
  },
  // 每月一号：恢复演练（2026-11-04 老板：「4 这个消耗大吗」——实测快照 120MB、纯本地、零模型，几秒钟）。
  // 份数不等于能恢复；没演练过的备份只是心理安慰。
  // 外部插件的本地离线包（2026-11-08 老板：外面装的不见了/坏了要能重装）。
  // 每月一次，跟着恢复演练同一天；很便宜，只拷 npm 装的那几个。
  pluginCache() {
    const mark = path.join(RUNTIME, 'plugin-cache.json');
    const { due, today } = dueToday(mark);
    if (!due) return 'not-due';
    const r = runScript('backup-external-plugins.mjs', [], 300000);
    writeState(mark, { date: today, at: new Date().toISOString(), code: r.status, out: String(r.stdout || '').slice(0, 300) });
    if (r.status === 0) say('插件离线包已更新：' + String(r.stdout || '').split('\n').filter((l) => l.includes('✅')).length + ' 个');
    return r.status === 0 ? 'done' : 'failed';
  },  drill() {
    const stateFile = path.join(RUNTIME, 'drill.json');
    const now = new Date();
    if (now.getDate() !== 1) return 'not-due';
    const month = localToday().slice(0, 7);
    if (String(readState(stateFile).month || '') === month) return 'not-due';
    const r = runScript('restore-drill.mjs', [], 600000);
    writeState(stateFile, { month, at: new Date().toISOString(), code: r.status });
    say(r.status === 0 ? '恢复演练：最新快照能还原，三个角色都读得到' : '恢复演练：有缺口，去看报告（别当成绿灯）');
    return r.status === 0 ? 'done' : 'failed';
  },
  // 媒体索引 + 倒排索引（增量）。
  indexes() {
    const media = runScript('index-media.mjs', [], 120000);
    say(lastLine(media.stdout));
    const rx = runScript('reindex.mjs', [], 120000);
    if (rx.status === 0) say(lastLine(rx.stdout) ? `倒排索引：${lastLine(rx.stdout)}` : '');
    else say(`倒排索引没跑成：${lastLine(rx.stderr) || `退出码 ${rx.status}`}`);
    return 'done';
  },
  // B站 @我 / 回复我（只读，不回复）。
  bili() {
    let file = atFileOf(HOME);
    const before = readRows(file).length;
    for (const mode of ['at', 'replies']) {
      const r = runScript('bili-inbox.mjs', ['--mode', mode], 120000);
      let out = {};
      try { out = JSON.parse(lastLine(r.stdout)) } catch { out = {} }
      if (mode === 'at' && out.file) file = String(out.file);
      if (r.status !== 0 || out.ok === false) say(`B站收件（${mode}）没跑成：${out.reason || out.error || lastLine(r.stderr) || `退出码 ${r.status}`}`);
      else if (out.written) say(`B站收件（${mode}）：新写 ${out.written} 条`);
    }
    const mine = pickFreshOwnerMentions(readRows(file), before);
    if (mine.length) {
      say(ownerMentionLine(mine));
      const w = writeOwnerMentions(HOME, mine);
      ownerMentions.push(...mine);
      say(`B站：主人 @ 的记录已更新（最近 ${w.total} 条）→ ${w.file}`);
    }
    return 'done';
  },
  // 冷档接原文：一天一次，三个角色各跑一遍。
  cold() {
    const mark = path.join(RUNTIME, 'cold-link.json');
    const { due, today } = dueToday(mark);
    if (!due) return 'not-due';
    const report = {};
    for (const role of ['dayu', 'xiaoyu', 'dragon']) {
      const r = runScript('link-cold-archive.mjs', ['--role', role], 120000);
      const line = lastLine(r.stdout);
      if (r.status === 0 && line) { report[role] = line; say(line); }
      else report[role] = `跳过：${lastLine(r.stderr) || ('退出码 ' + r.status)}`;
    }
    writeState(mark, { date: today, at: new Date().toISOString(), roles: report });
    return 'done';
  },
  // 备份验证：五层一次查完，落一份报告。
  verify() {
    const mark = path.join(RUNTIME, 'backup-verify.json');
    const { due } = dueToday(mark);
    if (!due) return 'not-due';
    const rep = verifyBackup();
    const out = writeBackupReport(rep);
    writeState(mark, { date: rep.date, at: new Date().toISOString(), green: rep.green, yellow: rep.yellow, red: rep.red, file: out.file });
    say(`备份验证：${rep.summary}，报告 ${out.file}`);
    if (rep.red > 0) say(`备份验证：${rep.red} 项红 —— ${rep.reds.join('；')}`);
    return 'done';
  },
  // 内容谱系：这一版的字节以前来过就是倒退（只报不拦）。
  lineage() {
    const mark = path.join(RUNTIME, 'lineage.json');
    const { due, today } = dueToday(mark);
    if (!due) return 'not-due';
    const r = observeLineage({});
    writeState(mark, { date: today, at: new Date().toISOString(), checked: r.checked, changed: r.changed.length, regressions: r.regressions.length });
    if (r.regressions.length) say(`内容谱系：${r.regressions.length} 处倒退 —— ${r.regressions.map((g) => `${g.file}（回到 ${String(g.backTo).slice(0, 10)}）`).join('；')}`);
    else say(`内容谱系：${r.checked} 个关键文件，没有倒退（新记 ${r.changed.length} 版）`);
    return 'done';
  },
  // 2026-11-03（老板：以后还会卡死吗）：给 10 分钟那层配一条看门狗——它有自己的定时器，
  // 但没人盯着「该跑没跑」。过点 20 分钟以上就喊一声，别让它静悄悄停两小时。
  protect() {
    const dir = path.join(DATA, 'protection')
    const st = readState(path.join(dir, 'status.json'))
    const cfg = readState(path.join(dir, 'config.json'))
    if (cfg.enabled === false) return 'disabled'
    const interval = Number(cfg.intervalMs) || 1800000
    const label = Math.round(interval / 60000) + ' 分钟备份'
    if (st.error) say(`${label}上次失败：${st.error}`)
    const next = Date.parse(st.nextRun || '') || 0
    if (!next) return 'no-schedule'
    const lateMin = Math.round((Date.now() - next) / 60000)
    if (lateMin > Math.max(20, Math.round((interval * 2) / 60000))) {
      say(`${label}停了：下次该 ${new Date(next).toLocaleString()}，已经晚了 ${lateMin} 分钟`)
      // 2026-11-03（照微）：光 say() 等于只在日志里喊一声——11-03 上午这层静默停了 3 小时，
      // 一整天没人翻日志就没人发现（是我手动跑 verify-backup 才撞见）。红了要能叫醒人。
      // 文本用固定串、不带分钟数：同一面墙只留一张单，第 3 次自动升级成 high。
      try {
        noteIncident({
          sessionId: 'maintenance',
          title: '10 分钟备份层停摆',
          source: 'maintenance/protect',
          text: '10 分钟备份停摆：nextRun 已过期 20 分钟以上',
        })
      } catch { /* 开单失败别把日检搞挂 */ }
    }
    return 'done'
  },
  // 备份清理（按保留规则）。
  // 接线体检 + 等待项清理（2026-11-08 老板：「看着做」）。
  wiring() {
    const mark = path.join(RUNTIME, 'wiring.json');
    const { due, today } = dueToday(mark);
    if (!due) return 'not-due';
    runScript('clean-waiting.mjs', [], 30000);
    const w = runScript('wiring-audit.mjs', ['--json'], 60000);
    let parsed = null;
    try { parsed = JSON.parse(String(w.stdout || '').trim()) } catch { /* 解析不了就只记状态 */ }
    writeState(mark, { date: today, at: new Date().toISOString(), switches: parsed?.switches?.length ?? null, expired: parsed?.expired?.length ?? null });
    if (parsed && (parsed.switches?.length || parsed.expired?.length)) {
      say(`接线体检：未接线开关 ${parsed.switches?.length || 0}、过期状态 ${parsed.expired?.length || 0}（跑 node scripts/wiring-audit.mjs 看明细）`);
    }
    return 'done';
  },
  prune() {
    const pr = pruneBackups({ apply: true });
    if (pr.removed) say(`备份清理：删 ${pr.removed} 份，腾 ${(pr.freed / 1024 / 1024 / 1024).toFixed(2)} GB`);
    return 'done';
  },
  // 旧单归档 + 账本轮转：一天一次（内容不丢，只有压缩和改名）。
  housekeeping() {
    const mark = path.join(RUNTIME, 'housekeeping.json');
    const { due, today } = dueToday(mark);
    if (!due) return 'not-due';
    const a = archiveOld();
    const r = rotateLogs();
    writeState(mark, { date: today, at: new Date().toISOString(), archived: a, rotated: r });
    if (a.incidents || a.jobs) say(`旧单归档：事故 ${a.incidents} 张、派活 ${a.jobs} 条 → 旧条目转 JSONL，近期留着`);
    const moved = (r.archived || []).length + (r.rotated || []).length;
    if (moved) say(`账本轮转：压 ${(r.archived || []).length} 个事件文件、改名留档 ${(r.rotated || []).length} 个（内容不删）`);
    return 'done';
  },
  // 网关：SnowLuma 的 OneBot 端口挂了，QQ 整条离线；桥只会重连，不会拉它。
  // 判据看端口（不是进程名——它的进程名是 node，11-07 就是这样看错的）。
  gateway() {
    const r = runScript('gateway-watchdog.mjs', [], 30000)
    const out = String(r.stdout || '').trim().split('\n').pop() || ''
    if (r.status === 0 && out.includes('"listening"')) return 'ok'
    if (out.includes('started')) { say('网关没在听，已拉起 SnowLuma'); return 'restarted' }
    if (out.includes('throttled')) return 'not-due'
    if (out) say(`网关检查：${clipText(out, 100)}`)
    return r.status === 0 ? 'ok' : 'failed'
  },
  // 逐轮抄录：新链路（turn/end → raw + live + 思考/turns）已经接管；旧的 capture-thinking 只在切换关掉时兜底。
  // 2026-11-12：两套同时写会重复、口径打架，所以默认跳过旧路。
  think() {
    const on = (() => {
      try {
        let s = fs.readFileSync(path.join(DATA, 'switches.json'), 'utf8');
        if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
        return JSON.parse(s).turnTranscript !== false;
      } catch { return true }
    })();
    if (on) {
      writeState(path.join(RUNTIME, 'think-state.json'), { at: new Date().toISOString(), tail: 'skip: 逐轮抄录已接管（turnTranscript）' });
      return 'skipped';
    }
    const r = runScript('capture-thinking.mjs', [], 120000);
    const tail = lastLine(r.stdout) || lastLine(r.stderr) || '';
    if (r.status !== 0) { say(`抄录没跑成：${clipText(tail, 120)}`); return 'failed' }
    writeState(path.join(RUNTIME, 'think-state.json'), { at: new Date().toISOString(), tail: clipText(tail, 200) });
    say(`逐轮抄录：${clipText(tail, 120)}`);
    return 'done';
  },
  // 系统地图：每天增量刷一次（只比 mtime+大小，变的才重新解析），落后就报——改东西前先 sysmap find。
  // 2026-11-11 主人：「记不住家里有什么……存到一个本地文件夹，详细索引+关联索引，实时进度，不用每次遍历」。
  sysmap() {
    const r = runScript('sysmap.mjs', ['refresh'], 120000);
    const tail = lastLine(r.stdout) || lastLine(r.stderr) || '';
    if (r.status !== 0) { say(`系统地图没刷成：${clipText(tail, 120)}`); return 'failed' }
    writeState(path.join(RUNTIME, 'sysmap-refresh.json'), { at: new Date().toISOString(), tail: clipText(tail, 200) });
    say(`系统地图：${clipText(tail, 120)}`);
    return 'done';
  },  // 本地筛选收尸：一天一次，把永远炼不了的指针标 skipped（不花钱、不删原文、留底在 library/.trash/）。
  // 2026-11-11 老板：「也不用所有的都精炼吧，不是应该本地有筛选机制吗」——筛选本来就有，
  // 但筛掉的不收尸，6 千多条里 9 成被筛掉却仍挂 pending，看着像欠账。这一步让数字说真话。
  dispose() {
    const stateFile = path.join(RUNTIME, 'dispose-check.json');
    if (String(readState(stateFile).day || '') === localToday()) return 'not-due';
    const r = runScript('refine.mjs', ['--dispose', '--yes'], 180000);
    const tail = lastLine(r.stdout) || lastLine(r.stderr) || '';
    if (r.status !== 0) { say(`本地筛选没收尸成：${clipText(tail, 120)}`); return 'failed' }
    writeState(stateFile, { day: localToday(), at: new Date().toISOString(), tail: clipText(tail, 200) });
    if (/已收尸 [1-9]/.test(tail)) say(`本地筛选：${clipText(tail, 140)}`);
    return 'done';
  },
  // 中层旧行：一周一次，只搬明确 filtered/processed 且早于 14 天的行；queued/无 state/raw 永不搬。
  middle() {
    const stateFile = path.join(RUNTIME, 'middle-clean-check.json');
    if (Date.now() - lastAt(stateFile) < 7 * 24 * 3600e3) return 'not-due';
    const cutoff = new Date(Date.now() - 14 * 24 * 3600e3).toISOString().slice(0, 10);
    const r = runScript('middle-clean.mjs', ['--archive-before', cutoff, '--write'], 300000);
    const tail = lastLine(r.stdout) || lastLine(r.stderr) || '';
    if (r.status !== 0) { say(`中层清理没跑成：${clipText(tail, 120)}`); return 'failed' }
    writeState(stateFile, { lastAt: new Date().toISOString(), cutoff, tail: clipText(tail, 200) });
    say(`中层清理：${clipText(tail, 160)}`);
    return 'done';
  },
  // 精提炼：待提炼 → 在用（花钱的那一层）。2026-11-04 老板：「这个没有自动提炼吗」——
  // 脚本早就写好了，但从来没人定时跑它，所以待提炼积了三千多条。现在接进维护：
  //   · 只在谷时跑（贵一倍的事不做）；· 有积压才跑；· 6 小时冷却（refine.mjs 自己把关）；
  //   · 单轮预算 1 元（--budget，超了它自己停）；· 跑完写 refine-metrics.jsonl。
  //
  // 改｜2026-11-11 19:3x｜大鱼·本班｜授权：主人（2026-11-11：「以前不是有自动提炼吗……其他的做」）｜
  // scripts/maintenance.mjs:514-574｜配额改成按积压自动定：limit = clamp(pending/20, 40, 240)；
  // 积压 >3000 时冷却缩到 3 小时；加每天花费上限（默认 1.5 元，可在 switches.json 的 refineDailyBudget 改）｜
  // 为什么：固定 40 条/6 小时 ≈ 160 条/天，而粗提炼每天新增 300~700 条——「自动」一直在跑，但配额小到追不上，
  // 实测积压 6100+ 条；不加大就是每天看着它越欠越多｜
  // 验证：node scripts/test-maintenance-refine.mjs 全过（配额/冷却/日预算三档）；node --check 通过；
  // 指标仍只进 refine-metrics.jsonl，单轮预算仍在｜可改：可改；谷时、单轮预算、日预算三道闸不许去掉
  refine() {
    if (isPeak(new Date())) return 'skipped-peak';
    // 2026-11-16：新链路已改写到 library/中层，旧待提炼/手抄本在真机上已经不存在。
    // 仍然优先数中层；旧目录只做兼容读（有就数，没有不报错）。计数见 countRefinePending()。
    const pending = countRefinePending();
    if (!pending) return 'skipped-no-pending';

    // 今天已经花在精提炼上的钱（refine-metrics.jsonl 每轮一行）。日预算到线就停，不偷偷烧。
    const day = localToday();
    let spentToday = 0;
    try {
      for (const line of fs.readFileSync(path.join(RUNTIME, 'refine-metrics.jsonl'), 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          if (String(row.at || '').slice(0, 10) === day) spentToday += Number(row.costYuan) || 0;
        } catch { /* 坏行跳过 */ }
      }
    } catch { /* 还没有指标 */ }
    let dailyBudget = 1.5;
    try {
      const sw = JSON.parse(fs.readFileSync(path.join(DATA, 'switches.json'), 'utf8'));
      if (Number.isFinite(Number(sw.refineDailyBudget)) && Number(sw.refineDailyBudget) >= 0) dailyBudget = Number(sw.refineDailyBudget);
    } catch { /* 没设就用默认 */ }
    if (spentToday >= dailyBudget) { say(`精提炼：待提炼 ${pending} 条；今天已花 ¥${spentToday.toFixed(2)}（上限 ¥${dailyBudget}），下次再说`); return 'skipped-budget' }

    const stateFile = path.join(RUNTIME, 'refine-state.json');
    // 积压越深，跑得越勤、每次越多；没积压时仍按老口径（40 条 / 6 小时）。判断本身在 lib/refine-quota.js（可测）。
    const q = refineQuota({ pending, todayCost: spentToday, dailyBudget, lastRunMs: lastAt(stateFile), now: Date.now() });
    if (!q.run) return q.reason;
    const limit = q.limit;
    // 旧卡不救：只炼有 turnId 的新队列；旧队列留在手抄本当旧书，不再花模型钱。
    const r = runScript('refine.mjs', ['--linked', '--limit', String(limit), '--budget', '1'], 600000);
    const tail = lastLine(r.stdout) || lastLine(r.stderr) || '';
    if (r.status !== 0) { say(`精提炼没跑成（待提炼 ${pending} 条）：${clipText(tail, 120)}`); return 'failed' }
    writeState(stateFile, { lastAt: new Date().toISOString(), pendingBefore: pending, limit, tail: clipText(tail, 200) });
    say(`精提炼：待提炼 ${pending} 条 → 本轮 ${limit} 条 → ${clipText(tail, 160)}`);
    return 'done';
  },
  // 事件目录自动收尾：中层行 → library/meta/episodes-dayu.jsonl（只追加；重复跑按 id 去重，水位挡住旧段）。
  // 2026-11-16 老板：「事件目录要能自动补，重复跑不许重复写，旧段/原文一概不动」。
  //   · 只在谷时跑（重活不占白天，和精提炼同一条线）；
  //   · 10 分钟冷却（runtime/episodes-auto-state.json），宿主一小时一 tick，别每次都拉一遍；
  //   · 必须显式 --write——episodes-auto 自己默认 dry，定时任务不能悄悄退化成只报数；
  //   · 失败只记一行、记下冷却时间就过，不挡其它步骤（同一个错别每轮重撞）。
  episodes() {
    if (isPeak(new Date())) return 'skipped-peak';
    const stateFile = path.join(RUNTIME, 'episodes-auto-state.json');
    if (Date.now() - lastAt(stateFile) < 10 * 60 * 1000) return 'not-due';
    const r = runScript('episodes-auto.mjs', ['--role', 'dayu', '--write', '--limit', '300'], 300000);
    let out = null;
    try { out = JSON.parse(String(r.stdout || '')); } catch { /* 解析不了就只记最后一行 */ }
    const tail = lastLine(r.stdout) || lastLine(r.stderr) || '';
    // 跑过就记时间（失败也记）：否则一个坏状态会每小时重撞，日志刷屏。
    writeState(stateFile, {
      lastAt: new Date().toISOString(),
      code: r.status,
      wrote: out?.write?.wrote ?? null,
      fresh: out?.fresh ?? null,
      deferred: out?.deferred ?? null,
      // output 是多行 JSON，lastLine 只会是 "}"；这里记一行能看懂的摘要。
      tail: clipText(out ? `候选 ${out.candidates ?? '?'}，新增 ${out.fresh ?? '?'}，写 ${out.write?.wrote ?? '?'}，剩 ${out.deferred ?? '?'}` : tail, 200),
    });
    if (r.status !== 0 || out?.ok === false) {
      say(`事件目录没跑成：${clipText(out?.write?.error || tail, 120) || `退出码 ${r.status}`}`);
      return 'failed';
    }
    if (!out) { say(`事件目录：${clipText(tail, 120) || '已跑完（输出不是 JSON）'}`); return 'done' }
    const wrote = Number(out.write?.wrote) || 0;
    if (wrote > 0) say(`事件目录：新写 ${wrote} 段（候选 ${out.candidates ?? '?'}，本次上限 300，剩 ${out.deferred ?? 0} 段下次）`);
    else say('事件目录：没有新段');
    return 'done';
  },
  // 检索用没用上：一天核对一次（纯本地、不花钱）。
  // 2026-11-11：这个数以前一直是 0——判据拿 ref 的文件名去记忆里找，永远找不着；
  // 现在改成看检索时记下的片段（preview），见 lib/recall-usage.js。接进维护，它才会每天自己动。
  usage() {
    const stateFile = path.join(RUNTIME, 'usage-check.json');
    if (String(readState(stateFile).day || '') === localToday()) return 'not-due';
    const r = runScript('recall-usage.mjs', [], 120000);
    const tail = lastLine(r.stdout) || lastLine(r.stderr) || '';
    if (r.status !== 0) { say(`检索反馈没跑成：${clipText(tail, 120)}`); return 'failed' }
    writeState(stateFile, { day: localToday(), at: new Date().toISOString(), tail: clipText(tail, 200) });
    say(`检索反馈：${clipText(tail, 160)}`);
    return 'done';
  },
  // 用户消息里扫待办/错题：一天一次，纯本地、不调模型；错的宁可不写。
  memoryscan() {
    const stateFile = path.join(RUNTIME, 'memory-scan-state.json');
    if (String(readState(stateFile).day || '') === localToday()) return 'not-due';
    const r = runScript('memory-scan.mjs', ['--apply', '--limit', '100'], 120000);
    const tail = lastLine(r.stdout) || lastLine(r.stderr) || '';
    if (r.status !== 0) { say(`待办/错题扫描没跑成：${clipText(tail, 120)}`); return 'failed' }
    writeState(stateFile, { day: localToday(), at: new Date().toISOString(), tail: clipText(tail, 200) });
    say(`待办/错题扫描：${clipText(tail, 160)}`);
    return 'done';
  },
};

if (planOnly) {
  const out = [];
  for (const name of Object.keys(STEPS)) {
    if (!want(name)) continue;
    out.push({ step: name, noted: 'plan（只看不算）' });
  }
  console.log(JSON.stringify({ plan: out, home: HOME, at: new Date().toISOString() }, null, 2));
  process.exit(0);
}

// 2026-11-04 老板问：「宿主开关会被这些影响无法完全关闭吗」。
// 答：不会拖住关闭（维护是 detached + unref，宿主不等），但**宿主关了以后维护可能还在跑几分钟**——
// 这是移出去的真实代价。所以这里加一条：每跑一步前看一眼宿主心跳；心跳断了几分钟就收手退出，
// 不在宿主已经关掉之后继续翻记忆、删快照。
const HOST_ALIVE = path.join(DATA, 'runtime', 'host-alive.json')
// 2026-11-04（照微）：心跳只靠宿主里那个 60 秒 setInterval，而它会静默死。
// 19:09 之后 host-alive.json 不再更新，维护每小时都判 host-gone——备份/归档/索引全停，还不报错。
// 心跳不在时退一步看进程：boot.json 里那个 pid 还活着，就说明宿主没关（结果缓存 60 秒，别每步都查）。
let _hostPid = { at: 0, alive: false }
function hostPidAlive() {
  const now = Date.now()
  if (now - _hostPid.at < 60 * 1000) return _hostPid.alive
  let alive = false
  try {
    const boot = JSON.parse(fs.readFileSync(path.join(DATA, 'boot.json'), 'utf8'))
    const pid = Number(boot.pid) || 0
    if (pid) {
      const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8', windowsHide: true })
      alive = String(r.stdout || '').includes(String(pid))
    }
  } catch { /* 读不到就按不在算 */ }
  _hostPid = { at: now, alive }
  return alive
}
function hostAlive({ maxAgeMs = 5 * 60 * 1000 } = {}) {
  try {
    const st = fs.statSync(HOST_ALIVE)
    if (Date.now() - st.mtimeMs <= maxAgeMs) return true
  } catch { /* 没见过心跳 */ }
  return hostPidAlive()
}

for (const [name, run] of Object.entries(STEPS)) {
  if (!want(name)) continue;
  if (!hostAlive()) {
    // 2026-11-04 老板：「宿主关闭了就等于结束了，后台没什么非要做完的活」——对。
    // 所以不再给备份开例外：宿主不在，整轮收手（数据没变也不需要备一份一模一样的）。
    // 真正该备份的时刻是"数据变过之后"，那是宿主还开着的时候，下一轮维护自然会备。
    steps.push({ step: name, result: 'host-gone', ms: 0 });
    say(`宿主已关（心跳断了）：跳过「${name}」，这轮到此为止`);
    break;
  }
  const at = Date.now();
  let result = 'done';
  try { result = (await run()) || 'done'; }
  catch (error) { result = 'failed'; say(`维护步骤「${name}」失败：${error?.message || error}`); }
  steps.push({ step: name, result, ms: Date.now() - at });
}

const ok = steps.every((s) => s.result !== 'failed');
const summary = {
  at: new Date().toISOString(),
  ok,
  ms: Date.now() - started,
  steps,
  lines: lines.filter(Boolean),
  ownerMentions,
};
try {
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary) + '\n', 'utf8');
  fs.appendFileSync(LOG, `${summary.at} ok=${ok} ${steps.map((s) => `${s.step}:${s.result}(${s.ms}ms)`).join(' ')}\n${lines.map((l) => `  ${l}`).join('\n')}\n`, 'utf8');
} catch { /* 记不下不影响做过的事 */ }

console.log(JSON.stringify({ ok, ms: summary.ms, steps, lines }));
process.exit(0);
