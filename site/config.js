/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_CONFIG = {
  "telemetryUrl": "https://raw.githubusercontent.com/linweichen-ai/rwc-4090-monitor/telemetry/telemetry/latest.json",
  "paperUrl": "https://github.com/linweichen-ai/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/manuscript.md",
  "refreshIntervalMs": 15000,
  "fetchTimeoutMs": 8000,
  "staleAfterMs": 180000,
  "futureToleranceMs": 60000,
  "stage": {
    "achievement": "10月24日17:43复核：原服务器采集器仍正常运行，样本持续递增；监控链路修复、研究程序修订和论文PDF排版均已交豆包执行。",
    "nextSteps": [
      "验收断线恢复与网页缓存修复，再验证连续更新后启用自动发布。",
      "独立验收研究程序的输入校验、资源限制及完整结果记录。",
      "逐页检查论文PDF，验收后同步到私有GitHub并保留网页入口。"
    ],
    "delivery": "新研究程序包已收到，正在独立验收；输入身份兼容修订已开始。局部边界计算复核通过，但运行可靠性仍有待修项，尚未开展新的真实图像实验。",
    "deploy": "服务器每20秒持续采集；网页仍使用此前三次受监督发布的快照。断线恢复和缓存时效修复正在进行，持续自动发布尚未启用。过期读数不代表服务器离线。",
    "validity": "当前可读版本仍为私有v4 Markdown初稿；PDF排版任务已开始，尚未交付。未形成投稿定稿或新的真实异常检测成绩。公开页面只展示脱敏运行状况和进度。"
  }
};
