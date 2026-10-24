/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-status9";
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
    "achievement": "固定30分钟内15次发布成功，375条Git命令全部成功，未记录相关故障；相邻发布间隔约119–121秒。论文仍为7页v4 PDF。",
    "nextSteps": [
      "审核豆包新增的更新诊断面板，定位网页取数滞后与被拒响应。",
      "审核论文条件保证的补充论证；实验数字只沿用已核实证据。",
      "处理研究验收中断，补齐检查后再决定是否启动新的20图实验。"
    ],
    "delivery": "L1e的Windows定向验收、受控切换和30分钟观察均有独立记录。监控诊断与论文补充候选正在豆包执行，尚未采用。",
    "deploy": "发布器保持原实例运行，本机在线时每120秒发布。公开网页使用已验收版本；离线时更新暂停，未设置开机自启动。",
    "validity": "这30分钟无故障不证明启动错误根因已修复或长期稳定；网页仍可能保留旧读数，需查看采样年龄与状态。45秒研究检查和新的20图实验未运行，论文未新增科学成绩。"
  }
};
