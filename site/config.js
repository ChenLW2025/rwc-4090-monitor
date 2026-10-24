/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-l3e-live1";
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
    "achievement": "发布器诊断版已通过验收并完成切换，首次失败后已自动恢复发布。现在已取得系统启动错误码，具体原因继续排查；论文仍为原有7页v4 PDF。",
    "nextSteps": [
      "核查发布器间歇失败与进程启动方式的关系。",
      "继续核验浏览器更新和故障恢复，保留准确的采样年龄与过期标记。",
      "完成研究程序的超时边界修订和独立验收，再安排正式20图实验。"
    ],
    "delivery": "备用通道已在实际浏览器读到更新快照；保留读数的文案已通过独立验收并澄清。持续实时性仍未通过，研究新包正在独立验收；这些工程进展不等于科研方法有效。",
    "deploy": "本机在线时每120秒自动发布，未设置开机自启动；电脑离线时更新暂停。备用通道用于缓解缓存延迟，请以采样时刻和180秒过期标记为准。",
    "validity": "正式20图实验尚未运行。当前7页v4 PDF是私有初稿，未新增实验结论，也不是投稿定稿。公开页面只展示脱敏运行状况和进度。"
  }
};
