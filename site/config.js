/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-l3d-live1";
window.RWC_CONFIG = {
  "telemetryUrl": "https://raw.githubusercontent.com/linweichen-ai/rwc-4090-monitor/telemetry/telemetry/latest.json",
  "contentsApiUrl": "https://api.github.com/repos/linweichen-ai/rwc-4090-monitor/contents/telemetry/latest.json",
  "paperUrl": "https://github.com/linweichen-ai/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/rwc_v4_preliminary.pdf",
  "refreshIntervalMs": 15000,
  "fetchTimeoutMs": 8000,
  "staleAfterMs": 180000,
  "futureToleranceMs": 60000,
  "apiFallbackAgeMs": 120000,
  "stage": {
    "achievement": "自动发布仍在运行；最近一次观察记录有 14 次成功和 11 次失败，间歇失败原因正在诊断。论文 v4 的 7 页 PDF 保持不变，可通过下方私有链接阅读。",
    "nextSteps": [
      "在真实浏览器核验备用通道能否改善新快照到达时间，继续检查过期与限流提示。",
      "继续诊断发布器间歇失败，验证断线和休眠后的恢复。",
      "完成研究程序新包验收，再安排正式 20 图实验。"
    ],
    "delivery": "网页取数修订已通过本地验收，本版加入匿名备用取数通道；真实浏览器的数据新鲜度仍待验收。研究程序新包仍未通过验收，继续修订。",
    "deploy": "本机在线时每 120 秒自动发布，未设置开机自启动；电脑离线时更新暂停。备用通道仅用于缓解缓存延迟，不保证消除旧快照；请以采样时刻和 180 秒过期标记为准。",
    "validity": "正式 20 图实验尚未运行，当前论文仍为私有 v4 初步稿，7 页 PDF 未新增实验结论，也不是投稿定稿。公开页面只展示脱敏运行状况和进度。"
  }
};
