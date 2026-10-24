/* 公开部署配置：仅含公开快照地址、私有论文入口及已核实阶段说明。 */
window.RWC_ASSET_VERSION = "20261024-status8";
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
    "achievement": "发布器启动方式候选已通过Windows定向验收并完成一次受控切换；首个新发布已核对本地状态与GitHub远端一致。论文保持7页v4 PDF。",
    "nextSteps": [
      "观察固定30分钟自然运行，记录失败、发布间隔和网页采样年龄。",
      "处理研究验收中断，坏缓存检查完成后再决定是否启动20图实验。",
      "同步私有GitHub原件与验收记录；论文只纳入已验证结果。"
    ],
    "delivery": "豆包交付的76份原件已归档；11项Windows定向测试和三个实际子进程场景通过。其他监控模块和网页取数代码保持已验收版本。",
    "deploy": "新版发布器已启动，首个发布确认完成；30分钟自然观察仍在进行。本机在线时每120秒发布，离线时更新暂停，未设置开机自启动。",
    "validity": "启动故障根因尚未证实，首次成功不代表持续实时性通过。研究45秒补充检查在准备后遇平台中断，尚未运行；新的20图实验未运行，私有v4初稿未新增实验结论。"
  }
};
