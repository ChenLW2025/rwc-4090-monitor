/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-status7";
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
    "achievement": "监控文案修订已上线，线上文件与验收版本一致；实际页面已观察到过期读数自动更新为新样本。研究的两项缺失输入检查通过，论文保持7页v4 PDF。",
    "nextSteps": [
      "继续排查发布器间歇失败，按采样年龄判断当前数据是否有效。",
      "处理验收执行中断，完成坏缓存检查后，再决定是否启动已准备的20图实验。",
      "保留所有失败和未完成记录，同步私有GitHub；论文只纳入已经验证的结果。"
    ],
    "delivery": "页面已明确标示最近有效获取、失败原因和过期读数。研究超时边界窄修复通过，两项缺失输入检查通过；坏缓存验收仍未完成，不能把它写成通过。",
    "deploy": "本机在线时每120秒自动发布，未设置开机自启动；电脑离线时更新暂停。备用通道用于缓解缓存延迟，请以采样时刻和180秒过期标记为准。",
    "validity": "新的20图实验尚未运行。45秒补充验收仅完成输入准备，执行因平台检查中断。当前7页v4 PDF仍是私有初稿，未新增科研结论，持续实时性也尚未通过验收。"
  }
};
