/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-status5";
window.RWC_CONFIG = {
  "telemetryUrl": "https://raw.githubusercontent.com/linweichen-ai/rwc-4090-monitor/telemetry/telemetry/latest.json",
  "paperUrl": "https://github.com/linweichen-ai/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/rwc_v4_preliminary.pdf",
  "refreshIntervalMs": 15000,
  "fetchTimeoutMs": 8000,
  "staleAfterMs": 180000,
  "futureToleranceMs": 60000,
  "stage": {
    "achievement": "自动发布保持运行，恢复后已继续发布新快照；稳定性仍在观察。论文 v4 的 7 页 PDF 保持不变，可通过下方私有链接阅读。",
    "nextSteps": [
      "验收网页候选修订，确认多标签页和请求受限时能正确更新。",
      "继续观察自动发布与网页数据时效，核验断线和休眠后的恢复。",
      "完成研究程序新包验收，再安排真实 20 图实验。"
    ],
    "delivery": "网页候选已修复首批限流问题，独立验收又发现两处错误处理缺口，已交回修订，尚未部署。研究程序新包已收到，独立验收仍有问题，继续修订。",
    "deploy": "本机在线时每 120 秒自动发布，未设置开机自启动；电脑离线时更新暂停。网页仍使用此前已部署版本，可能因缓存显示旧快照；请以采样时刻和 180 秒过期标记为准。",
    "validity": "正式 20 图实验尚未运行，当前论文仍为私有 v4 初步稿，7 页 PDF 未新增实验结论，也不是投稿定稿。公开页面只展示脱敏运行状况和进度。"
  }
};
