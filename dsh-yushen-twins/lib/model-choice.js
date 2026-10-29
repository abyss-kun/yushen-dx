// 鱼神的分工：大脑判断，手去干活。
//   大脑（管家本体：看局面、定优先级、决定派谁）→ GPT
//   手  （派出去的员工：改文件、写补丁草案这类执行）  → DeepSeek（便宜、够用）
// 两边都能用环境变量单独覆盖，改完重启 DSH 生效。
//
// 例：哪天 GPT 掉线，把大脑切回 DeepSeek：
//   YUSEN_BRAIN_PROVIDER=deepseek-account
//   YUSEN_BRAIN_MODEL=deepseek-flash

const BRAIN = {
  provider: process.env.YUSEN_BRAIN_PROVIDER || 'uuapi',
  model: process.env.YUSEN_BRAIN_MODEL || 'gpt-6.1-sol',
  reasoningEffort: process.env.YUSEN_BRAIN_EFFORT || 'high',
}

const WORKER = {
  provider: process.env.YUSEN_WORKER_PROVIDER || 'deepseek-account',
  model: process.env.YUSEN_WORKER_MODEL || 'deepseek-flash',
  reasoningEffort: process.env.YUSEN_WORKER_EFFORT || 'high',
}

/** 管家本体：做判断、派活、定路线。贵，但一天用不了几次。 */
export function dayuBrain() {
  return { ...BRAIN }
}

/** 派出去的员工：真正动手改文件。用便宜模型，跑量。 */
export function dayuWorker() {
  return { ...WORKER }
}
