/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-live2";
window.RWC_CONFIG = {
  "telemetryUrl": "https://raw.githubusercontent.com/linweichen-ai/rwc-4090-monitor/telemetry/telemetry/latest.json",
  "paperUrl": "https://github.com/linweichen-ai/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/rwc_v4_preliminary.pdf",
  "refreshIntervalMs": 15000,
  "fetchTimeoutMs": 8000,
  "staleAfterMs": 180000,
  "futureToleranceMs": 60000,
  "stage": {
    "achievement": "本机在线时的自动发布已启动，曾遇发布错误后自动重试恢复；稳定运行仍在观察。论文 v4 的 7 页 PDF 已可通过下方私有链接阅读。",
    "nextSteps": [
      "继续修复并核验网页获取新快照的时效，保留旧样本的过期提示。",
      "验证持续发布的断线与休眠恢复，以及浏览器中的连续更新。",
      "继续推进研究程序验收；后续实验结论以私有研究记录为准。"
    ],
    "delivery": "论文 PDF 已交付并验收；发布器修订已通过本地验收，自动发布已启动。网页取数时效仍在修复，新修订尚未部署。",
    "deploy": "本机在线时每 120 秒自动发布，未设置开机自启动；电脑离线时更新暂停。网页仍有缓存延迟，可能显示旧快照；请以采样时刻和 180 秒过期标记为准，旧读数不能当作实时状态。",
    "validity": "当前论文为私有 v4 初步稿，PDF 是同一正文的排版版本，不是投稿定稿，也不代表新增实验成绩。公开页面只展示脱敏运行状况和进度。"
  }
};
