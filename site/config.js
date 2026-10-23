/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_CONFIG = {
  "telemetryUrl": "https://raw.githubusercontent.com/ChenLW2025/rwc-4090-monitor/telemetry/telemetry/latest.json",
  "paperUrl": "https://github.com/ChenLW2025/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/manuscript.md",
  "refreshIntervalMs": 15000,
  "fetchTimeoutMs": 8000,
  "staleAfterMs": 180000,
  "futureToleranceMs": 60000,
  "stage": {
    "achievement": "20:03阶段更新：网页已显示双卡真实脱敏读数和匿名任务；三次受监督发布完成，论文 v4 初稿可直接查看。",
    "nextSteps": [
      "修复断线恢复和缓存延迟，再验收持续自动发布。",
      "豆包已收到图像方法的下一轮修订要求并开始实现；收到新包后独立复测。",
      "固定正常图实验须等实现验收通过，再根据真实结果续写论文。"
    ],
    "delivery": "研究修订包140份文件已完整接收和独立审查。匹配计算复核通过，输入校验、超时处理和证据记录仍需修订；尚未开展新的真实图像实验。",
    "deploy": "服务器每20秒持续采集；网页目前使用三次受监督发布的快照，持续自动发布尚未启用。实际浏览器曾在180秒新鲜窗口内未收到新快照，缓存时效验收未通过。过期读数不代表服务器离线。",
    "validity": "论文仍为私有 v4 Markdown 初稿，可在GitHub在线阅读，尚无PDF。未形成投稿定稿或新的真实异常检测成绩。公开页面只展示脱敏运行状况和进度。"
  }
};
