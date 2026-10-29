// 宿主身份必须是明确 PID，不能按可执行文件名（修复助手与宿主可能共享进程映像）。
export function probeHostPid(pid, isAlive) {
  const n = Number(pid)
  if (!Number.isSafeInteger(n) || n <= 0) return { ok: false, running: null, error: 'invalid-host-pid' }
  try { return { ok: true, running: Boolean(isAlive(n)), error: null } }
  catch (error) { return { ok: false, running: null, error: String(error?.message || error) } }
}
