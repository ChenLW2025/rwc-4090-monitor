/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_CONFIG = {
  "telemetryUrl": "https://raw.githubusercontent.com/ChenLW2025/rwc-4090-monitor/telemetry/telemetry/latest.json",
  "paperUrl": "https://github.com/ChenLW2025/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/manuscript.md",
  "refreshIntervalMs": 15000,
  "fetchTimeoutMs": 8000,
  "staleAfterMs": 180000,
  "futureToleranceMs": 60000,
  "stage": {
    "achievement": "服务器已持续采集；第一份真实脱敏快照已公开；论文 v4 初稿可查看。监控链路正在联调验收。",
    "nextSteps": [
      "验证真实快照在网页连续更新，以及过期后正确显示旧读数。",
      "修复发布器断线恢复，验收后启用每 120 秒自动发布。",
      "继续验收图像方法代码，通过后开展固定正常图实验。"
    ],
    "delivery": "新版页面错误状态检查通过；Windows 118 项测试中 113 项通过、5 项因平台条件跳过，无失败。图像方法修订仍在验收，未新增性能结论。",
    "deploy": "服务器每 20 秒采集；目前由受监督的单次发布接入网页，持续自动发布尚未启用。页面每 15 秒请求，采样达到 180 秒显示过期；过期不等于服务器离线。",
    "validity": "论文仍为私有 v4 初稿，尚未形成最终投稿稿或新的真实异常检测成绩。公开网页仅展示脱敏运行状况和进度。"
  }
};
