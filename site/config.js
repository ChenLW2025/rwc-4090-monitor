/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_CONFIG = {
  "telemetryUrl": "https://raw.githubusercontent.com/ChenLW2025/rwc-4090-monitor/telemetry/telemetry/latest.json",
  "paperUrl": "https://github.com/ChenLW2025/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/manuscript.md",
  "refreshIntervalMs": 15000,
  "fetchTimeoutMs": 8000,
  "staleAfterMs": 180000,
  "futureToleranceMs": 60000,
  "stage": {
    "achievement": "20:18阶段更新：网页已完成桌面与手机宽度检查，论文按钮实际可打开私有v4稿件；服务器采集仍正常，持续发布仍待验收。",
    "nextSteps": [
      "完成发布器断线恢复与网页缓存修订，验收连续更新后启用自动发布。",
      "验收豆包的新研究程序，重点核对资源限制、输入对接和完整结果记录。",
      "通过后开展固定正常图实验，按真实结果更新论文。"
    ],
    "delivery": "研究新包已完成独立审查，豆包正在修订并运行合成测试。接入预检又发现一项图像身份格式不兼容，修订要求已排队；原数据和特征缓存保持不变，尚未开展新真实实验。",
    "deploy": "服务器每20秒持续采集；网页目前使用三次受监督发布的快照，持续自动发布尚未启用。实际浏览器曾在180秒新鲜窗口内未收到新快照，缓存时效验收未通过。过期读数不代表服务器离线。",
    "validity": "论文仍为私有 v4 Markdown 初稿，可在GitHub在线阅读，尚无PDF。未形成投稿定稿或新的真实异常检测成绩。公开页面只展示脱敏运行状况和进度。"
  }
};
