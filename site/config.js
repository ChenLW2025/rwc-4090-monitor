/*
 * config.js —— 页面可配置项（部署时按实际公开地址填写，本文件随 site 一起发布）。
 * 该文件不含任何凭据；页面所有请求都使用无凭据 fetch。
 */
window.RWC_CONFIG = {
  // 公开 telemetry JSON 的地址（Pages 站点上的 telemetry/latest.json）。
  // 留空时页面显示“尚未连接”，绝不使用样例数据冒充真实数据。
  telemetryUrl: "",

  // 已授权私有论文入口（需对应仓库访问权限；无权限时由仓库侧拦截）。
  paperUrl: "https://github.com/ChenLW2025/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/manuscript.md",

  // 轮询与超时参数（毫秒）
  refreshIntervalMs: 15000,   // 每 15 秒拉取一次
  fetchTimeoutMs: 8000,       // 单次请求 8 秒超时
  staleAfterMs: 180000,       // 采样年龄超过 180 秒即过期
  futureToleranceMs: 60000,   // 未来时间容忍 60 秒时钟偏差

  // 阶段成果与下一步（可按阶段更新；实现/部署/实验有效性分开陈述）
  stage: {
    achievement: "论文 v4 初稿已收录；网页已发布，10 次服务器采集验收通过；"
               + "图像方法首轮代码已收到，独立验收后修订中。",
    nextSteps: [
      "继续验收 Windows 持续发布与网页读取链路"
      + "（采集器不含任何修改/控制操作）。",
      "独立公开仓库已建立；接下来验收真实采集、发布和过期提示。",
      "图像方法首轮代码正在按独立验收意见修订；本页面不展示算法细节。"
    ],
    delivery: "服务器连续完成 10 次采集，间隔均为 20 秒；重复启动被拒绝，结束后锁释放。"
            + "本机发布入口预演通过；错误状态显示仍在修订。",
    deploy: "网页界面已发布；真实数据尚未接入，持续自动发布尚未启用。Pages 工作流仅"
          + "手动触发，且只响应 site 目录；telemetry 数据更新不会触发网站部署。",
    validity: "目前只有正常支持图与对应诊断，尚无真实异常性能结论；"
            + "页面上的指标仅用于公开、脱敏的运行状况展示。"
  }
};
