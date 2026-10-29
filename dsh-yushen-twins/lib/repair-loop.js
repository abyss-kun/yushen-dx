// 修复联动：DSH 起来之后，和修复助手对一次账。
//
// 背景（2026-10-25 故障档案）：
//   修复助手（YushenRepair.exe）修不了的项目会记进 ~/.dsh/dayu/repair/gaps.jsonl，
//   写明"为什么修不了"。等主人用别的办法把机器修好、DSH 能跑起来之后，
//   插件在启动时跑这一圈：
//     1) 让助手重新诊断（只读），拿回当前 findings；
//     2) 台账里还 open、但现在证据已消失的 → 追加一条 resolved（谁修好的、什么时候）；
//     3) 仍然 open 的 → 记一条「能力请求」，说明下次要让助手自己修需要补什么；
//     4) 返回摘要，交给插件日志/告知主人。
//
// 只读诊断 + 只追加台账，不修任何东西；失败一律静默（不能因为对账把启动搞挂）。

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_EXE = fileURLToPath(new URL('../assets/repair-helper/YushenRepair.exe', import.meta.url));

function homeDir(home) {
  return home || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function repairDir(home) {
  return path.join(homeDir(home), 'dayu', 'repair');
}

async function readJsonl(file, limit = 4000) {
  try {
    const text = await fs.readFile(file, 'utf8');
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* 坏行跳过 */ }
      if (rows.length >= limit) break;
    }
    return rows;
  } catch { return []; }
}

async function appendJsonl(file, rows) {
  if (!rows.length) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

/** 让助手做一次只读诊断；助手不存在或超时就返回 null，不报错。 */
export async function runRepairDiagnose({ exe, timeoutMs = 20000 } = {}) {
  const target = exe || DEFAULT_EXE;
  try {
    const { stdout } = await execFileAsync(target, ['--diagnose'], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    return JSON.parse(String(stdout).trim());
  } catch {
    return null;
  }
}

// 修不了的那一类，各自缺什么能力才能自己修。写进能力请求，下一版照着补。
const CAPABILITY = {
  'deps-missing': '在宿主可用的前提下，用发行包自带的依赖清单离线恢复 node_modules（不联网），或从最近一次合格快照里回滚依赖目录。',
  'oray-idd': '需要读取/切换设备状态：以管理员权限调用 pnputil 禁用 ROOT\\DISPLAY 下的虚拟显示器；默认只提示，不执行。',
  'virtual-display': '同上：先识别驱动类型，再在获得授权时禁用；否则只保留提示。',
  'crash-unknown': '尽量从壳的崩溃日志和 Windows 事件日志里提取更多错误签名，扩大"已知故障"匹配表。',
};

/** 一次对账。返回摘要，不改任何业务文件。 */
export async function runRepairLoop({ home, exe, now = () => new Date() } = {}) {
  const dir = repairDir(home);
  const gapsFile = path.join(dir, 'gaps.jsonl');
  const requestsFile = path.join(dir, 'capability-requests.jsonl');

  const diag = await runRepairDiagnose({ exe });
  const findings = Array.isArray(diag && diag.findings) ? diag.findings : null;
  const gaps = await readJsonl(gapsFile);

  const last = new Map();
  for (const row of gaps) {
    if (row && row.id && row.status) last.set(row.id, row.status);
  }
  const openIds = [...last.entries()].filter(([, s]) => s === 'open').map(([id]) => id);
  const stillUnfixable = new Set((findings || []).filter((f) => !f.fixable).map((f) => f.id));

  const stamp = now().toISOString();
  const resolved = [];
  const requests = [];

  // 只有拿到本次诊断结果才能判断"证据是否消失"，否则宁可不动。
  if (findings) {
    for (const id of openIds) {
      if (stillUnfixable.has(id)) {
        requests.push({
          at: stamp,
          id,
          status: 'open',
          capability: CAPABILITY[id] || '需要为这一类缺口补一条可验证的修复路径。',
        });
      } else {
        resolved.push({
          at: stamp,
          id,
          status: 'resolved',
          how: 're-checked by repair helper after DSH came back up',
          classification: diag && diag.classification,
        });
      }
    }
  }

  await appendJsonl(gapsFile, resolved);
  // 能力请求按 id 去重：同一个缺口一天只记一次，避免刷屏。
  const recent = await readJsonl(requestsFile);
  const today = stamp.slice(0, 10);
  const already = new Set(recent.filter((r) => String(r.at || '').slice(0, 10) === today).map((r) => r.id));
  await appendJsonl(requestsFile, requests.filter((r) => !already.has(r.id)));

  return {
    ok: true,
    diagnosed: Boolean(findings),
    classification: diag ? diag.classification : null,
    openBefore: openIds.length,
    resolvedNow: resolved.map((r) => r.id),
    stillOpen: [...stillUnfixable].filter((id) => openIds.includes(id)),
    capabilitiesRequested: requests.filter((r) => !already.has(r.id)).map((r) => r.id),
    gapsFile,
    requestsFile,
  };
}
