import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SOURCE_DIR = fileURLToPath(new URL('../assets/repair-helper/', import.meta.url));
const EXE = 'YushenRepair.exe';
const LINK = '鱼神修复助手.lnk';
export const INSTALL_CONFIRMATION = 'INSTALL LOCAL UNSIGNED HELPER';
export const UNINSTALL_CONFIRMATION = 'UNINSTALL LOCAL UNSIGNED HELPER';

// Only these fixed scripts run. Paths are passed as environment data, never code.
async function powershell(script, extraEnv = {}) {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !path.isAbsolute(systemRoot)) throw new Error('Windows SystemRoot unavailable');
  const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await execFileAsync(executable, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
  ], { windowsHide: true, timeout: 15000, maxBuffer: 65536, env: { ...process.env, ...extraEnv } });
  return stdout.trim();
}
async function resolveWindowsDesktop() {
  return powershell("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)");
}
async function writeWindowsShortcut({ shortcutPath, targetPath, workingDirectory }) {
  await powershell("$ErrorActionPreference='Stop'; $shell=New-Object -ComObject WScript.Shell; $link=$shell.CreateShortcut($env:YUSHEN_SHORTCUT_PATH); $link.TargetPath=$env:YUSHEN_HELPER_TARGET; $link.Arguments=''; $link.WorkingDirectory=$env:YUSHEN_HELPER_WORKDIR; $link.Description='鱼神修复助手（本地未签名构建）'; $link.Save()", {
    YUSHEN_SHORTCUT_PATH: shortcutPath, YUSHEN_HELPER_TARGET: targetPath, YUSHEN_HELPER_WORKDIR: workingDirectory,
  });
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function localAbsolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /^[/\\]{2}/.test(value) || value.includes('\0')) {
    throw new Error('A local absolute path is required');
  }
  return path.resolve(value);
}

// Reject symbolic links/junctions at every existing component, including ancestors.
async function safePath(value, { directory = false, allowMissing = false } = {}) {
  const absolute = localAbsolute(value);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return absolute;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('Unsafe linked path');
    if (current !== absolute && !stat.isDirectory()) throw new Error('Unsafe path ancestor');
    if (current === absolute && (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error('Unexpected path type');
  }
  return absolute;
}
async function mkdirSafe(value) {
  const absolute = localAbsolute(value);
  await safePath(absolute, { directory: true, allowMissing: true });
  // Create one component at a time, checking existing components again.
  const parent = path.dirname(absolute);
  if (parent !== absolute) {
    try { await safePath(parent, { directory: true }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await mkdirSafe(parent); }
  }
  try { await fs.mkdir(absolute); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await safePath(absolute, { directory: true });
}

async function readShortcutTarget(shortcutPath) {
  try {
    const out = await powershell("$ErrorActionPreference='Stop'; $s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut($env:YUSHEN_SHORTCUT_PATH); [Console]::Write($l.TargetPath)", { YUSHEN_SHORTCUT_PATH: shortcutPath });
    return String(out || '').trim() || null;
  } catch { return null; }
}

/** Dependency injection is for isolated tests; production uses the module-relative package assets. */
export function createInstaller({
  platform = process.platform, env = process.env, sourceDir = SOURCE_DIR,
  resolveDesktop = resolveWindowsDesktop, createShortcut = writeWindowsShortcut,
  readShortcut = readShortcutTarget,
} = {}) {
  async function helperInfo() {
    const info = {
      available: false, platform, supported: platform === 'win32',
      signatureStatus: 'unsigned-local-build', source: 'bundled-local-build',
      fileName: EXE, sha256: null, size: null,
      confirmation: INSTALL_CONFIRMATION,
      uninstallSupported: false,
      warning: '本地未签名构建；哈希仅证明文件完整性，不代表官方证书或可信签名。不会下载、提权、自动运行或设置启动项。',
    };
    try {
      await safePath(sourceDir, { directory: true });
      const source = await safePath(path.join(sourceDir, EXE));
      const manifest = await safePath(path.join(sourceDir, 'SHA256SUMS.txt'));
      if ((await fs.stat(manifest)).size > 4096) throw new Error('Invalid SHA256SUMS');
      const text = (await fs.readFile(manifest, 'utf8')).trim();
      const matches = text.split(/\r?\n/).map(line => /^([a-fA-F0-9]{64}) [ *]YushenRepair\.exe$/.exec(line.trim())).filter(Boolean);
      if (matches.length !== 1) throw new Error('Invalid SHA256SUMS');
      const match = matches[0];
      const expected = match[1].toLowerCase();
      if (await sha256(source) !== expected) throw new Error('Bundled helper hash mismatch');
      info.sha256 = expected;
      info.size = (await fs.stat(source)).size;
      info.available = platform === 'win32';
      info.reason = platform === 'win32' ? null : 'windows-only';
    } catch (error) {
      info.reason = error.code === 'ENOENT' || /ENOENT|no such file/i.test(String(error)) ? 'not-built' : 'invalid-local-artifact';
    }
    return info;
  }

  // 只认「指向我们自己安装目录」的旧快捷方式，别人的 lnk 一律不动。
  function isOwnHelperTarget(target, localAppData) {
    if (!target) return false;
    const root = path.join(localAppData, 'Yushen', 'RepairHelper') + path.sep;
    try {
      const abs = path.resolve(target);
      return abs.toLowerCase().startsWith(root.toLowerCase()) && path.basename(abs).toLowerCase() === EXE.toLowerCase();
    } catch { return false; }
  }

  async function installRepairHelper(options = {}) {
    if (options.confirm !== INSTALL_CONFIRMATION) throw new Error('Explicit installation confirmation required');
    if (platform !== 'win32') throw new Error('Repair helper installation is Windows-only');
    if (options.desktop !== undefined && typeof options.desktop !== 'boolean') throw new Error('desktop must be boolean');
    const info = await helperInfo();
    if (!info.available) throw new Error(`Repair helper unavailable: ${info.reason}`);
    const localAppData = localAbsolute(env.LOCALAPPDATA);
    await safePath(localAppData, { directory: true });
    const rootDir = path.join(localAppData, 'Yushen', 'RepairHelper');
    const installDir = path.join(rootDir, info.sha256);
    await mkdirSafe(installDir);
    const targetPath = path.join(installDir, EXE);
    const source = await safePath(path.join(sourceDir, EXE));
    await safePath(targetPath, { allowMissing: true });
    // EXCL never replaces historical or unexpected content, even on repeated installs.
    try { await fs.copyFile(source, targetPath, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await safePath(installDir, { directory: true });
    await safePath(targetPath);
    if (await sha256(targetPath) !== info.sha256) throw new Error('Installed helper verification failed; existing file was not overwritten');
    let desktopShortcut = null;
    let shortcutUpdated = false;
    let shortcutBackup = null;
    if (options.desktop === true) {
      const desktop = await safePath(await resolveDesktop(), { directory: true });
      desktopShortcut = path.join(desktop, LINK);
      let exists = false;
      try { await fs.lstat(desktopShortcut); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (exists) {
        // 升级自己装的版本：先备份旧 lnk，再覆盖。别人的快捷方式仍然拒绝。
        const currentTarget = await readShortcut(desktopShortcut);
        if (!isOwnHelperTarget(currentTarget, localAppData)) {
          throw new Error('Desktop shortcut exists and does not point to the repair helper; refusing to overwrite');
        }
        shortcutBackup = `${desktopShortcut}.bak-${Date.now()}`;
        await fs.copyFile(desktopShortcut, shortcutBackup);
        shortcutUpdated = true;
      }
      const temporary = path.join(desktop, `.yushen-repair-${randomUUID()}.lnk`);
      try {
        await createShortcut({ shortcutPath: temporary, targetPath, workingDirectory: installDir, arguments: '' });
        await safePath(temporary);
        await safePath(desktop, { directory: true });
        // 已确认是自己的 lnk 才允许覆盖；不存在时依旧是独占创建。
        await fs.copyFile(temporary, desktopShortcut, exists ? 0 : constants.COPYFILE_EXCL);
        await safePath(desktopShortcut);
        if (await sha256(temporary) !== await sha256(desktopShortcut)) throw new Error('Shortcut copy verification failed');
      } finally {
        // Only remove our exact random temporary regular file; never recursive-delete.
        try {
          await safePath(desktop, { directory: true });
          await safePath(temporary);
          await fs.unlink(temporary);
        } catch { /* Preserve any unexpected object rather than deleting it. */ }
      }
    }
    // 旧版本目录归档：只动「64 位十六进制目录名 + 里面确实是我们的 exe」的那些，不删任何东西。
    let archivedOldVersions = [];
    try {
      const entries = await fs.readdir(rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
        if (entry.name === info.sha256) continue;
        const oldDir = path.join(rootDir, entry.name);
        const oldExe = path.join(oldDir, EXE);
        try { const s = await fs.lstat(oldExe); if (!s.isFile()) continue; } catch { continue; }
        const archiveRoot = path.join(rootDir, '.old', `${entry.name}-${Date.now()}`);
        await fs.mkdir(path.join(rootDir, '.old'), { recursive: true });
        await fs.rename(oldDir, archiveRoot);
        archivedOldVersions.push(entry.name);
      }
    } catch { /* 归档失败不影响安装本身 */ }

    return { installed: true, verified: true, targetPath, installDir, desktopShortcut, shortcutUpdated, shortcutBackup,
      archivedOldVersions, sha256: info.sha256, signatureStatus: info.signatureStatus };
  }

  /**
   * 已装过就自动升级：只在「安装根目录里已经存在我们自己的某个哈希版本」时动作，
   * 从没装过的不动（首装仍然要用户在面板上点确认）。
   */
  async function autoUpgradeIfInstalled() {
    if (platform !== 'win32') return { skipped: 'not-windows' };
    let localAppData;
    try { localAppData = localAbsolute(env.LOCALAPPDATA); } catch { return { skipped: 'no-localappdata' }; }
    const rootDir = path.join(localAppData, 'Yushen', 'RepairHelper');
    let installed = [];
    try {
      const entries = await fs.readdir(rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
        try { const s = await fs.lstat(path.join(rootDir, entry.name, EXE)); if (s.isFile()) installed.push(entry.name); } catch { /* 跳过 */ }
      }
    } catch { return { skipped: 'not-installed' }; }
    if (installed.length === 0) return { skipped: 'not-installed' };

    const info = await helperInfo();
    if (!info.available) return { skipped: 'unavailable', reason: info.reason ?? null };
    if (installed.includes(info.sha256)) {
      // 已是最新：只把快捷方式指向修回来（比如用户手动挪过）。
      const result = await installRepairHelper({ confirm: INSTALL_CONFIRMATION, desktop: true });
      return { skipped: 'up-to-date', shortcutUpdated: result.shortcutUpdated, sha256: info.sha256 };
    }
    const result = await installRepairHelper({ confirm: INSTALL_CONFIRMATION, desktop: true });
    return { upgraded: true, from: installed, to: info.sha256, shortcutUpdated: result.shortcutUpdated, archivedOldVersions: result.archivedOldVersions };
  }

  async function uninstallRepairHelper(options = {}) {
    if (options.confirm !== UNINSTALL_CONFIRMATION) throw new Error('Explicit uninstallation confirmation required');
    if (platform !== 'win32') throw new Error('Repair helper uninstallation is Windows-only');
    // Deliberately no deletion until ownership/shortcut-target verification has been exercised on Windows.
    return { uninstalled: false, supported: false, reason: 'safe-uninstall-not-yet-implemented',
      guidance: '请人工仅删除 LOCALAPPDATA/Yushen/RepairHelper 下对应哈希目录和已确认指向该目录的鱼神修复助手.lnk；保留 reports 与 DSH 数据。' };
  }
  return { helperInfo, installRepairHelper, uninstallRepairHelper, autoUpgradeIfInstalled };
}

const installer = createInstaller();
export const helperInfo = installer.helperInfo;
export const installRepairHelper = installer.installRepairHelper;
export const uninstallRepairHelper = installer.uninstallRepairHelper;
export const autoUpgradeIfInstalled = installer.autoUpgradeIfInstalled;
