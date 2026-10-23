/*
 * validate.js —— 前端数据校验与序列守卫（与 monitor/sample.py 同构）。
 *
 * 显式处理：404、坏 JSON、缺字段、非有限/越界数值、明显未来时间、
 * 同实例 seq 倒退、同 seq 采样内容变更、采样时间倒退、已退休实例回流、
 * 跨实例时间倒退。
 *
 * 序列守卫为两阶段（与 app.js 配合）：
 * - examine() 只检查、不改状态；
 * - apply() 仅在结构校验与 hash 复核全部通过后调用。
 * 因此任何坏样本（含 hash 错误）都不会推进或污染守卫基线。
 *
 * 能力边界：实例历史只存在于页面内存中，页面刷新后历史丢失，
 * 刷新后的旧响应防护退化为单请求在途（requestSeq）与全局时间顺序。
 */
(function (root) {
  "use strict";

  var SCHEMA_VERSION = "1.0";
  var EXPECTED_GPUS = 2;
  var FUTURE_TOLERANCE_MS = 60 * 1000;
  var STALE_AFTER_MS = 180 * 1000;

  var ERROR = {
    HTTP_404: "HTTP_404",
    HTTP_ERROR: "HTTP_ERROR",
    FETCH_TIMEOUT: "FETCH_TIMEOUT",
    FETCH_NETWORK_ERROR: "FETCH_NETWORK_ERROR",
    BAD_JSON: "BAD_JSON",
    SCHEMA_MISSING_FIELD: "SCHEMA_MISSING_FIELD",
    INVALID_VALUE: "INVALID_VALUE",
    FUTURE_SAMPLE: "FUTURE_SAMPLE",
    SEQ_REGRESSION: "SEQ_REGRESSION",
    SAMPLE_CONTENT_MISMATCH: "SAMPLE_CONTENT_MISMATCH",
    SAMPLE_HASH_MISMATCH: "SAMPLE_HASH_MISMATCH",
    SAMPLING_TIME_REGRESSION: "SAMPLING_TIME_REGRESSION",
    RETIRED_INSTANCE_RESURRECTION: "RETIRED_INSTANCE_RESURRECTION",
    CROSS_INSTANCE_TIME_REGRESSION: "CROSS_INSTANCE_TIME_REGRESSION",
    STALE_SAMPLE: "STALE_SAMPLE"
  };

  var ERROR_TEXT_ZH = {
    HTTP_404: "公开数据地址返回 404（数据源尚未发布或地址配置有误）",
    HTTP_ERROR: "公开数据地址返回异常 HTTP 状态",
    FETCH_TIMEOUT: "获取公开数据超过 8 秒，已放弃本次请求",
    FETCH_NETWORK_ERROR: "网络错误，无法获取公开数据（已保留上次读数，但不再保证数据有效）",
    BAD_JSON: "公开数据不是合法 JSON",
    SCHEMA_MISSING_FIELD: "公开数据缺少必需字段或结构不符",
    INVALID_VALUE: "公开数据包含非法或越界数值，已拒绝本次数据",
    FUTURE_SAMPLE: "采样时间明显指向未来，疑似时钟异常，已拒绝本次数据",
    SEQ_REGRESSION: "同一采集实例的采样序号倒退，已拒绝本次数据",
    SAMPLE_CONTENT_MISMATCH: "同一采样序号的内容发生变化，已拒绝本次数据",
    SAMPLE_HASH_MISMATCH: "采样内容与 sample_hash 不一致，已拒绝本次数据",
    SAMPLING_TIME_REGRESSION: "采样时间倒退，已拒绝本次数据",
    RETIRED_INSTANCE_RESURRECTION: "已退休采集实例的旧响应回流，已拒绝本次数据",
    CROSS_INSTANCE_TIME_REGRESSION: "新实例首样本的采样时间早于已接受数据，疑似旧响应，已拒绝",
    STALE_SAMPLE: "监控数据已过期"
  };

  var COLLECTOR_ERROR_TEXT_ZH = {
    NVIDIA_SMI_UNAVAILABLE: "采集器不可用，指标暂不可用",
    GPU_NOT_FOUND: "未检测到该卡",
    GPU_METRICS_PARSE_ERROR: "部分指标暂不可用",
    GPU_METRICS_OUT_OF_RANGE: "指标异常，已忽略",
    COMPUTE_APPS_UNAVAILABLE: "任务信息暂不可用，无法判断当前是否有任务",
    TASK_INFO_PARTIAL_UNKNOWN: "任务信息可能不完整（部分进程无法读取）",
    COLLECTOR_INTERNAL_ERROR: "采集器内部异常"
  };

  var ISO_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  var INSTANCE_RE = /^i-[0-9a-f]{16}$/;
  var ALIAS_RE = /^[a-z0-9]{7}$/;

  function isInt(v) { return typeof v === "number" && Number.isInteger(v); }
  function finiteNum(v) {
    return typeof v === "number" && Number.isFinite(v);
  }

  function parseIsoZ(s) {
    if (typeof s !== "string" || !ISO_Z_RE.test(s)) return null;
    var ms = Date.parse(s); // 带 Z 由运行时按 UTC 解析
    return Number.isNaN(ms) ? null : ms;
  }

  function fail(errors, code, detail) {
    errors.push({ code: code, detail: detail || "" });
  }

  function checkNullableInt(errors, obj, key, lo, hi) {
    if (!(key in obj)) { fail(errors, ERROR.SCHEMA_MISSING_FIELD, key); return; }
    var v = obj[key];
    if (v === null) return;
    if (!isInt(v)) { fail(errors, ERROR.INVALID_VALUE, key + "=" + v); return; }
    if (lo !== null && v < lo) { fail(errors, ERROR.INVALID_VALUE, key + "=" + v); }
    if (hi !== null && v > hi) { fail(errors, ERROR.INVALID_VALUE, key + "=" + v); }
  }

  var GPU_KEYS = ["index", "utilization_percent", "memory_used_mib",
    "memory_total_mib", "temperature_c", "power_watts", "error"].sort();
  var TASK_KEYS = ["alias", "gpu_index", "used_memory_mib"].sort();
  var SAMPLE_KEYS = ["schema_version", "collector_instance_id",
    "sample_seq", "sampled_at", "gpus", "tasks", "error"].sort();
  var ENVELOPE_KEYS = ["schema_version", "publication_seq",
    "published_at", "sample_hash", "sample"].sort();

  function keysSorted(obj) {
    return Object.keys(obj).sort();
  }

  var COLLECTOR_ERRORS = [
    "NVIDIA_SMI_UNAVAILABLE", "GPU_NOT_FOUND", "GPU_METRICS_PARSE_ERROR",
    "GPU_METRICS_OUT_OF_RANGE", "COMPUTE_APPS_UNAVAILABLE",
    "TASK_INFO_PARTIAL_UNKNOWN", "COLLECTOR_INTERNAL_ERROR"
  ];

  function validateSample(sample, nowMs) {
    var errors = [];
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      fail(errors, ERROR.SCHEMA_MISSING_FIELD, "sample");
      return errors;
    }
    if (JSON.stringify(keysSorted(sample)) !== JSON.stringify(SAMPLE_KEYS)) {
      fail(errors, ERROR.SCHEMA_MISSING_FIELD, "sample 字段白名单");
    }
    if (sample.schema_version !== SCHEMA_VERSION) {
      fail(errors, ERROR.INVALID_VALUE, "schema_version");
    }
    if (!isInt(sample.sample_seq) || sample.sample_seq < 1) {
      fail(errors, ERROR.INVALID_VALUE, "sample_seq");
    }
    if (!INSTANCE_RE.test(sample.collector_instance_id || "")) {
      fail(errors, ERROR.INVALID_VALUE, "collector_instance_id");
    }
    var sampledMs = parseIsoZ(sample.sampled_at);
    if (sampledMs === null) {
      fail(errors, ERROR.SCHEMA_MISSING_FIELD, "sampled_at");
    } else if (sampledMs > nowMs + FUTURE_TOLERANCE_MS) {
      fail(errors, ERROR.FUTURE_SAMPLE, sample.sampled_at);
    }
    if (sample.error !== null &&
        COLLECTOR_ERRORS.indexOf(sample.error) < 0) {
      fail(errors, ERROR.INVALID_VALUE, "sample.error");
    }
    if (!Array.isArray(sample.gpus) || sample.gpus.length !== EXPECTED_GPUS) {
      fail(errors, ERROR.SCHEMA_MISSING_FIELD, "gpus");
    } else {
      var seen = {};
      sample.gpus.forEach(function (g, i) {
        if (!g || typeof g !== "object" ||
            JSON.stringify(keysSorted(g)) !== JSON.stringify(GPU_KEYS)) {
          fail(errors, ERROR.SCHEMA_MISSING_FIELD, "gpus[" + i + "]");
          return;
        }
        if (!isInt(g.index) || g.index < 0 || g.index >= EXPECTED_GPUS) {
          fail(errors, ERROR.INVALID_VALUE, "gpus.index");
        }
        seen[g.index] = true;
        checkNullableInt(errors, g, "utilization_percent", 0, 100);
        checkNullableInt(errors, g, "memory_used_mib", 0, null);
        checkNullableInt(errors, g, "memory_total_mib", 0, null);
        checkNullableInt(errors, g, "temperature_c", -20, 120);
        var p = g.power_watts;
        if (p !== null) {
          if (!finiteNum(p) || p < 0 || p > 2000) {
            fail(errors, ERROR.INVALID_VALUE, "power_watts=" + p);
          }
        }
        if (g.error !== null && COLLECTOR_ERRORS.indexOf(g.error) < 0) {
          fail(errors, ERROR.INVALID_VALUE, "gpus.error");
        }
        if (g.memory_used_mib !== null && g.memory_total_mib !== null &&
            g.memory_used_mib > g.memory_total_mib) {
          fail(errors, ERROR.INVALID_VALUE, "显存已用超过总量");
        }
      });
      if (Object.keys(seen).sort().join(",") !==
          Array.from({ length: EXPECTED_GPUS }, function (_, i) { return i; })
          .sort().join(",")) {
        fail(errors, ERROR.SCHEMA_MISSING_FIELD, "gpus 索引不完整");
      }
    }
    if (!Array.isArray(sample.tasks)) {
      fail(errors, ERROR.SCHEMA_MISSING_FIELD, "tasks");
    } else {
      // 同一任务可跨卡：唯一性按 (alias, gpu_index)
      var seenPairs = {};
      sample.tasks.forEach(function (t, i) {
        if (!t || typeof t !== "object" ||
            JSON.stringify(keysSorted(t)) !== JSON.stringify(TASK_KEYS)) {
          fail(errors, ERROR.SCHEMA_MISSING_FIELD, "tasks[" + i + "]");
          return;
        }
        if (!ALIAS_RE.test(t.alias)) {
          fail(errors, ERROR.INVALID_VALUE, "alias");
        }
        var pair = t.alias + "#" + t.gpu_index;
        if (seenPairs[pair]) {
          fail(errors, ERROR.INVALID_VALUE, "task 重复 (alias,gpu_index)");
        }
        seenPairs[pair] = true;
        if (!isInt(t.gpu_index) || t.gpu_index < 0 ||
            t.gpu_index >= EXPECTED_GPUS) {
          fail(errors, ERROR.INVALID_VALUE, "task.gpu_index");
        }
        if (!isInt(t.used_memory_mib) || t.used_memory_mib < 0) {
          fail(errors, ERROR.INVALID_VALUE, "task.used_memory_mib");
        }
      });
    }
    return errors;
  }

  function validateEnvelope(envelope, nowMs) {
    var errors = [];
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      fail(errors, ERROR.BAD_JSON, "envelope");
      return errors;
    }
    if (JSON.stringify(keysSorted(envelope)) !== JSON.stringify(ENVELOPE_KEYS)) {
      fail(errors, ERROR.SCHEMA_MISSING_FIELD, "envelope 字段白名单");
    }
    if (envelope.schema_version !== SCHEMA_VERSION) {
      fail(errors, ERROR.INVALID_VALUE, "schema_version");
    }
    if (!isInt(envelope.publication_seq) || envelope.publication_seq < 1) {
      fail(errors, ERROR.INVALID_VALUE, "publication_seq");
    }
    if (parseIsoZ(envelope.published_at) === null) {
      fail(errors, ERROR.SCHEMA_MISSING_FIELD, "published_at");
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(envelope.sample_hash || "")) {
      fail(errors, ERROR.SCHEMA_MISSING_FIELD, "sample_hash");
    }
    var sampleErrors = validateSample(envelope.sample, nowMs);
    return errors.concat(sampleErrors);
  }

  /*
   * 同实例序列守卫（两阶段）。
   * examine() 只读检查并返回 pending；apply() 只在无错误时提交。
   * 已见实例集合 + 跨实例全局最新采样时间，用于识别退休实例回流与
   * 跨实例旧响应。
   */
  function SequenceGuard() {
    this.instance = null;
    this.seq = null;
    this.sampledMs = null;
    this.hash = null;
    this.seenInstances = {};
    this.latestSampledMs = null;
  }

  SequenceGuard.prototype.examine = function (sample, hash, nowMs) {
    var errors = [];
    var sampledMs = parseIsoZ(sample.sampled_at);
    if (sampledMs !== null && sampledMs > nowMs + FUTURE_TOLERANCE_MS) {
      fail(errors, ERROR.FUTURE_SAMPLE);
    }
    var inst = sample.collector_instance_id;
    var seq = sample.sample_seq;
    var restarted = inst !== this.instance;
    if (restarted) {
      if (this.seenInstances[inst]) {
        // 已退休实例回流：旧响应，拒绝
        fail(errors, ERROR.RETIRED_INSTANCE_RESURRECTION);
        if (this.latestSampledMs !== null &&
            sampledMs !== null && sampledMs < this.latestSampledMs) {
          fail(errors, ERROR.CROSS_INSTANCE_TIME_REGRESSION);
        }
      } else if (this.latestSampledMs !== null &&
                 sampledMs !== null && sampledMs < this.latestSampledMs) {
        // 全新实例但采样时间早于全局已接受：跨实例旧响应
        fail(errors, ERROR.CROSS_INSTANCE_TIME_REGRESSION);
      }
    } else {
      if (seq < this.seq) {
        fail(errors, ERROR.SEQ_REGRESSION);
      } else if (seq === this.seq && hash &&
                 this.hash && hash !== this.hash) {
        fail(errors, ERROR.SAMPLE_CONTENT_MISMATCH);
      }
      if (sampledMs !== null && this.sampledMs !== null &&
          sampledMs < this.sampledMs) {
        fail(errors, ERROR.SAMPLING_TIME_REGRESSION);
      }
    }
    return {
      errors: errors,
      restarted: restarted,
      pending: {
        instance: inst,
        seq: seq,
        sampledMs: sampledMs,
        hash: hash
      }
    };
  };

  SequenceGuard.prototype.apply = function (result) {
    var p = result.pending;
    if (p.instance !== this.instance) {
      this.instance = p.instance;
      this.seq = p.seq;
      this.sampledMs = p.sampledMs;
      this.hash = p.hash;
    } else if (p.seq > this.seq) {
      this.seq = p.seq;
      this.sampledMs = p.sampledMs;
      this.hash = p.hash;
    }
    this.seenInstances[p.instance] = true;
    if (this.latestSampledMs === null ||
        (p.sampledMs !== null && p.sampledMs > this.latestSampledMs)) {
      this.latestSampledMs = p.sampledMs;
    }
  };

  /*
   * 采样年龄跟踪（R07）：
   * - 以 sample_hash 标识“同一份样本”；同一份样本重复到达（重复发布）
   *   不重置首次观测基线；
   * - 年龄 = max(墙钟年龄, 单调时钟年龄, 历史高水位)，
   *   时钟回拨、休眠恢复都不会让旧样本变新；
   * - 只有真正的新样本才重置基线。
   */
  function SampleAgeTracker() {
    this.hash = null;
    this.sampledMs = null;
    this.firstWallMs = null;
    this.firstMonoMs = null;
    this.ageAtFirstMs = null;
    this.highWaterMs = 0;
  }

  SampleAgeTracker.prototype.accept = function (hash, sampledMs,
                                               nowWallMs, nowMonoMs) {
    if (hash !== this.hash) {
      this.hash = hash;
      this.sampledMs = sampledMs;
      this.firstWallMs = nowWallMs;
      this.firstMonoMs = nowMonoMs;
      this.ageAtFirstMs = nowWallMs - sampledMs;
      this.highWaterMs = 0;
    }
    return this.ageMs(nowWallMs, nowMonoMs);
  };

  SampleAgeTracker.prototype.ageMs = function (nowWallMs, nowMonoMs) {
    if (this.hash === null) return null;
    var wallAge = nowWallMs - this.sampledMs;
    var monoAge = this.ageAtFirstMs + (nowMonoMs - this.firstMonoMs);
    var age = Math.max(wallAge, monoAge, this.highWaterMs);
    this.highWaterMs = age;
    return age;
  };

  var api = {
    ERROR: ERROR,
    ERROR_TEXT_ZH: ERROR_TEXT_ZH,
    COLLECTOR_ERROR_TEXT_ZH: COLLECTOR_ERROR_TEXT_ZH,
    COLLECTOR_ERRORS: COLLECTOR_ERRORS,
    STALE_AFTER_MS: STALE_AFTER_MS,
    FUTURE_TOLERANCE_MS: FUTURE_TOLERANCE_MS,
    parseIsoZ: parseIsoZ,
    validateEnvelope: validateEnvelope,
    validateSample: validateSample,
    SequenceGuard: SequenceGuard,
    SampleAgeTracker: SampleAgeTracker
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.RWCValidate = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
