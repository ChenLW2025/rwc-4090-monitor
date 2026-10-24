/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-l2-pdf1";
window.RWC_CONFIG = {
  "telemetryUrl": "https://raw.githubusercontent.com/linweichen-ai/rwc-4090-monitor/telemetry/telemetry/latest.json",
  "paperUrl": "https://github.com/linweichen-ai/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/rwc_v4_preliminary.pdf",
  "refreshIntervalMs": 15000,
  "fetchTimeoutMs": 8000,
  "staleAfterMs": 180000,
  "futureToleranceMs": 60000,
  "stage": {
    "achievement": "论文 v4 的 7 页 PDF 已完成逐页和内容验收，可通过下方私有链接阅读；网页缓存修订已通过本地验收，并已更新到本页。",
    "nextSteps": [
      "核验网页能否及时显示新快照，并继续检查旧样本的过期提示。",
      "完成持续发布器的断线恢复边界修复，再验证连续更新并启用自动发布。",
      "继续推进研究程序验收；后续实验结论以私有研究记录为准。"
    ],
    "delivery": "论文 PDF 已交付并验收；网页缓存修订已通过本地测试。持续发布器仍在修复断线恢复边界。",
    "deploy": "本页已使用缓存修订版本；持续自动发布尚未启用，网页仍可能显示此前发布的旧快照。请以采样时刻和过期标记为准，旧读数不能当作实时状态。",
    "validity": "当前论文为私有 v4 初步稿，PDF 是同一正文的排版版本，不是投稿定稿，也不代表新增实验成绩。公开页面只展示脱敏运行状况和进度。"
  }
};
