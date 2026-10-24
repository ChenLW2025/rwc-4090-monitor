/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-status10";
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
    "achievement": "V5冻结正文R1复核通过，已交豆包排版；当前已验收PDF仍为7页v4。L1e固定30分钟完成15次发布、375条Git命令，均成功。",
    "nextSteps": [
      "最新V5正文可在私有工作区 paper/rwc_v5_manuscript.md 阅读；新PDF完成后逐页验收。",
      "等待豆包修订及完整原件，核验后再决定是否采用。",
      "处理研究验收中断，补齐检查后再决定是否启动新的20图实验。"
    ],
    "delivery": "论文正文已通过数学及修改范围复核。L4聊天差异静态审阅发现诊断可能影响原有共享冷却，已退回修订；候选未运行或部署，完整原件仍待接收。",
    "deploy": "L1e保持原实例运行；截至22:19，固定窗口结束后另有10次发布、250条Git命令成功，单独记录。本机在线时每120秒发布，未设置开机自启动。",
    "validity": "固定30分钟无故障不证明根因已修复、长期稳定或网页持续实时；请查看采样年龄与状态。没有新增科学实验，45秒研究检查和新的20图实验均未运行。"
  }
};
