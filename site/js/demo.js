/*
 * demo.js —— 仅当 URL 带 ?demo=1 时使用的“明确标注为模拟数据”的演示。
 *
 * 不请求任何外部地址；所有数据来自本地随机生成，并在页面显著位置标注
 * “演示模式（模拟数据）”。默认不启用。
 *
 * R12：模拟时间必须使用真实 UTC 转换（toISOString），禁止手动加减
 * getTimezoneOffset()（那会在非 UTC 时区造出“未来样本”）。
 */
(function (root) {
  "use strict";

  var V = root.RWCValidate;
  var ALIAS_ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";

  function randAlias() {
    var s = "";
    for (var i = 0; i < 7; i++) {
      s += ALIAS_ALPHA[Math.floor(Math.random() * ALIAS_ALPHA.length)];
    }
    return s;
  }

  // 把 Date 转成契约要求的 Z 秒级 UTC 字符串：直接用 toISOString，
  // 由运行时按 UTC 处理，时区无关。
  function isoZ(d) {
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function makeSample(seq, instanceId) {
    var tasks = [
      { alias: randAlias(), gpu_index: 0, used_memory_mib: 12000 },
      { alias: randAlias(), gpu_index: 1, used_memory_mib: 6000 }
    ];
    return {
      schema_version: "1.0",
      collector_instance_id: instanceId,
      sample_seq: seq,
      sampled_at: isoZ(new Date()),
      gpus: [
        {
          index: 0,
          utilization_percent: 40 + Math.floor(Math.random() * 55),
          memory_used_mib: 14000 + Math.floor(Math.random() * 8000),
          memory_total_mib: 24576,
          temperature_c: 55 + Math.floor(Math.random() * 20),
          power_watts: Math.round(200 + Math.random() * 250),
          error: null
        },
        {
          index: 1,
          utilization_percent: 30 + Math.floor(Math.random() * 60),
          memory_used_mib: 8000 + Math.floor(Math.random() * 6000),
          memory_total_mib: 24576,
          temperature_c: 50 + Math.floor(Math.random() * 22),
          power_watts: Math.round(150 + Math.random() * 230),
          error: null
        }
      ],
      tasks: tasks,
      error: null
    };
  }

  // 演示用的 envelope 组装（hash 与正式端完全一致的算法）；
  // 浏览器端由调用方 await 补 sample_hash，这里只做同步部分。
  function DemoSource() {
    var seq = 0;
    var instance = "i-0000000000000000";
    this.next = function () {
      return makeSample(++seq, instance);
    };
    this.restart = function () {
      seq = 0;
      var hex = "0123456789abcdef";
      var s = "";
      for (var i = 0; i < 16; i++) s += hex[Math.floor(Math.random() * 16)];
      instance = "i-" + s;
    };
  }

  root.RWCDemo = { DemoSource: DemoSource, isoZ: isoZ, makeSample: makeSample };
})(typeof window !== "undefined" ? window : globalThis);
