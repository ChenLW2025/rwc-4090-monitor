# 双 RTX 4090 公开监控与进度

**[打开监控网页](https://linweichen-ai.github.io/rwc-4090-monitor/)** · [阅读私有论文 v4 PDF 初稿](https://github.com/linweichen-ai/mca-paper/blob/codex/mca-rwc-innovation/workstreams/rwc_4090/paper/rwc_v4_preliminary.pdf)

2026-10-24 20:28阶段更新。诊断版发布器已完成受控切换，首次失败后已自动恢复，发布状态与远端一致。现在已取得系统启动错误码，尚未找到具体原因，不能称稳定性已通过。网页备用通道已读到更新快照；请继续查看采样时间和180秒过期标记。

- **论文保持7页v4初稿。** 上方私有PDF需登录有仓库权限的GitHub账号；预览失败可点Download raw file。没有新增实验结论。
- **监控持续更新与诊断并行。** 原采集器保持运行，发布器诊断版仅一次切换；故障后自动恢复已有证据，持续实时性仍待验收。
- **研究继续窄修订。** 新包独立验收发现超时边界问题，正在修订；正式20图实验尚未运行。未发表方法和完整证据只在私有仓库。

服务器每20秒采集、本机在线时每120秒发布、网页每15秒请求；未设置开机自启动。请求频率不等于端到端时效保证，过期也不能直接解释为服务器离线。

本公开仓库不包含服务器地址、凭据、进程ID、原图、权重或私有研究历史。[详细记录（私有）](https://github.com/linweichen-ai/mca-paper/tree/codex/mca-rwc-innovation/workstreams/rwc_4090)。
