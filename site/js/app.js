/*
 * app.js —— 页面主逻辑：无凭据轮询、严格校验、单调计时过期判定、textContent 渲染。
 *
 * 关键不变量：
 * - 每个时刻最多一个请求在途；请求有 8 秒超时；过期响应不会被采用。
 * - 采样年龄由 SampleAgeTracker 按 sample_hash 维护“高水位”：同一份样本
 *   重复到达（含重复发布）不重置基线；年龄=max(墙钟,单调,高水位)，
 *   时钟回拨、休眠恢复都不会让旧样本变新；重复发布不延长有效期（R07）。
 * - 结构与 hash 全部校验通过后，才以两阶段 examine/apply 提交序列守卫，
 *   任何坏样本都不会污染守卫基线（R08）。
 * - 网络错误/坏数据时保留旧读数，但状态条、卡片、任务区一致撤销
 *   “数据正常/当前有效”结论，旧读数明确标记（R10）。
 * - 任务信息读不到与“确实无任务”严格区分（R11）。
 * - 动态内容一律 createElement/textContent，任务名绝不作为 HTML。
 */
(function () {
  "use strict";

  var cfg = window.RWC_CONFIG;
  var V = window.RWCValidate;
  var C = window.RWCCanonical;
  var E = V.ERROR;

  var state = {
    mode: "disconnected",
    lastGood: null,   // {env, fetchedMs, sampledMs, publishedMs, hash}
    ageTracker: new V.SampleAgeTracker(),
    inflight: false,
    requestSeq: 0,
    guard: new V.SequenceGuard(),
    notice: null,
    errors: [],
    demo: false,
    demoSource: null,
    demoState: "normal",
    urlConfigured: false
  };

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function fmtNum(v) {
    if (v === null || v === undefined) return null;
    return Number(v).toLocaleString("zh-CN");
  }
  function fmtLocal(ms) {
    return new Date(ms).toLocaleString("zh-CN", { hour12: false });
  }
  function fmtAge(ms) {
    if (ms === null || ms === undefined) return "—";
    if (ms < 0) return "刚刚（可能存在时钟偏差）";
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + " 秒前";
    var m = Math.floor(s / 60);
    if (m < 60) return m + " 分 " + (s % 60) + " 秒前";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " 小时 " + (m % 60) + " 分前";
    return Math.floor(h / 24) + " 天前";
  }

  // ------------------------------------------------------ 数据接收（R08）

  async function processEnvelope(env) {
    var now = Date.now();
    // 1) 全部结构/数值/时间校验
    var errors = V.validateEnvelope(env, now);
    var hash = null;
    if (errors.length === 0) {
      // 2) hash 复核（全部通过后才允许动守卫）
      hash = await C.sampleHash(env.sample);
      if (hash !== env.sample_hash) {
        errors.push({ code: E.SAMPLE_HASH_MISMATCH, detail: "" });
      }
    }
    var guardResult = null;
    if (errors.length === 0) {
      // 3) examine 只检查不提交
      guardResult = state.guard.examine(env.sample, hash, now);
      if (guardResult.errors.length) {
        errors = errors.concat(guardResult.errors);
      }
    }
    if (errors.length) {
      // 坏数据：不 apply 守卫、不接受数据、不重置年龄；撤销“数据正常”
      state.errors = errors;
      state.mode = "error";
      state.notice = null;
      return;
    }
    // 4) 全部通过，才提交序列状态
    state.guard.apply(guardResult);
    var nowWall = Date.now();
    var nowMono = performance.now();
    var sampledMs = V.parseIsoZ(env.sample.sampled_at);
    // R07：年龄按 hash 取高水位；重复发布同一样本不续期
    state.ageTracker.accept(hash, sampledMs, nowWall, nowMono);
    state.lastGood = {
      env: env,
      fetchedMs: nowWall,
      sampledMs: sampledMs,
      publishedMs: V.parseIsoZ(env.published_at),
      hash: hash
    };
    state.errors = [];
    state.mode = "ok";
    state.notice = guardResult.restarted
      ? "采集器已重启（新实例 " + env.sample.collector_instance_id +
        "），采样序号已重新从 1 开始"
      : null;
  }

  // ------------------------------------------------------ 拉取

  async function fetchOnce() {
    if (state.inflight) return;            // 单请求在途
    state.inflight = true;
    var mySeq = ++state.requestSeq;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); },
                           cfg.fetchTimeoutMs);
    function failFetch(code, detail) {
      state.errors = [{ code: code, detail: detail || "" }];
      state.mode = "error";   // 保留旧读数（不修改 lastGood），撤销有效结论
    }
    try {
      var resp = await fetch(cfg.telemetryUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      if (mySeq !== state.requestSeq) return;  // 旧响应，丢弃
      if (resp.status === 404) { failFetch(E.HTTP_404); return; }
      if (!resp.ok) { failFetch(E.HTTP_ERROR, "HTTP " + resp.status); return; }
      var text = await resp.text();
      var env;
      try {
        env = JSON.parse(text);
      } catch (e) {
        failFetch(E.BAD_JSON);
        return;
      }
      if (mySeq !== state.requestSeq) return;
      await processEnvelope(env);
    } catch (e) {
      if (mySeq !== state.requestSeq) return;
      if (e && e.name === "AbortError") {
        failFetch(E.FETCH_TIMEOUT);
      } else {
        failFetch(E.FETCH_NETWORK_ERROR);
      }
    } finally {
      clearTimeout(timer);
      state.inflight = false;
    }
  }

  // ------------------------------------------------------ 渲染

  function metricRow(name, value, naText) {
    var row = el("div", null, "metric-row");
    row.appendChild(el("span", name, "metric-name"));
    if (value === null) {
      row.appendChild(el("span", naText || "暂无数据", "metric-value na"));
    } else {
      row.appendChild(el("span", value, "metric-value"));
    }
    return row;
  }

  function renderGpu(gpu, dataValid) {
    var card = el("div", null, "gpu-card");
    var head = el("h2", "GPU " + gpu.index);
    var allKnown = gpu.utilization_percent !== null &&
      gpu.memory_used_mib !== null && gpu.memory_total_mib !== null &&
      gpu.temperature_c !== null && gpu.power_watts !== null &&
      gpu.error === null;
    var stateText, cls;
    if (!dataValid) {
      stateText = "旧读数·非当前有效";
      cls = "unknown";
    } else if (allKnown) {
      stateText = "正常";
      cls = "ok";
    } else {
      stateText = gpu.error ? "指标暂不可用" : "暂无数据";
      cls = "unknown";
    }
    head.appendChild(el("span", stateText, "gpu-state " + cls));
    card.appendChild(head);

    card.appendChild(metricRow("利用率",
      gpu.utilization_percent !== null ? gpu.utilization_percent + "%" : null));
    card.appendChild(metricRow("显存已用",
      gpu.memory_used_mib !== null ? fmtNum(gpu.memory_used_mib) + " MiB" : null));
    card.appendChild(metricRow("显存总量",
      gpu.memory_total_mib !== null ? fmtNum(gpu.memory_total_mib) + " MiB" : null));
    card.appendChild(metricRow("温度",
      gpu.temperature_c !== null ? gpu.temperature_c + " °C" : null));
    card.appendChild(metricRow("功耗",
      gpu.power_watts !== null ? gpu.power_watts + " W" : null));
    if (gpu.error) {
      card.appendChild(el("div",
        V.COLLECTOR_ERROR_TEXT_ZH[gpu.error] ||
          ("指标暂不可用（" + gpu.error + "）"), "metric-error"));
    }
    if (!dataValid) card.classList.add("stale-reading");
    return card;
  }

  function tasksHeaderNote(sample, gpu) {
    // R11：区分“读不到任务”与“确实无任务”
    if (gpu.error === "GPU_NOT_FOUND" || gpu.error === "NVIDIA_SMI_UNAVAILABLE") {
      return "该卡缺失或不可用，任务未知";
    }
    if (sample.error === "COMPUTE_APPS_UNAVAILABLE") {
      return "任务信息暂不可用，无法判断当前是否有计算任务";
    }
    if (sample.error === "TASK_INFO_PARTIAL_UNKNOWN") {
      return "任务信息可能不完整（部分进程无法读取）";
    }
    return null;
  }

  // 这些样本级错误表示“部分信息未知”，但 GPU 指标读数仍有效：
  // 总体状态条据此显示“部分数据未知”，而不是全绿的“数据正常”。
  var PARTIAL_UNKNOWN_ERRORS = {
    COMPUTE_APPS_UNAVAILABLE: true,
    TASK_INFO_PARTIAL_UNKNOWN: true,
    GPU_NOT_FOUND: true
  };

  // H4：单卡“未知”= 该卡带 error，或任一公开指标为 null。
  function gpuUnknown(gpu) {
    return !!(gpu.error ||
      gpu.utilization_percent === null ||
      gpu.memory_used_mib === null ||
      gpu.memory_total_mib === null ||
      gpu.temperature_c === null ||
      gpu.power_watts === null);
  }

  // H4：汇总样本级错误 + 每卡 error/null 指标，返回具体问题描述数组；
  // 无未知返回空数组（才可显示“数据正常”）。
  function samplePartialUnknown(sample) {
    if (!sample) return [];
    var problems = [];
    if (sample.error && PARTIAL_UNKNOWN_ERRORS[sample.error]) {
      problems.push(V.COLLECTOR_ERROR_TEXT_ZH[sample.error] || sample.error);
    }
    (sample.gpus || []).forEach(function (gpu) {
      if (gpu.error) {
        problems.push("GPU " + gpu.index + "：" +
          (V.COLLECTOR_ERROR_TEXT_ZH[gpu.error] || gpu.error));
      } else if (gpu.utilization_percent === null ||
        gpu.memory_used_mib === null ||
        gpu.memory_total_mib === null ||
        gpu.temperature_c === null ||
        gpu.power_watts === null) {
        problems.push("GPU " + gpu.index + "：部分指标缺失");
      }
    });
    return problems;
  }

  function renderTasks(sample, dataValid) {
    var box = document.getElementById("tasks-container");
    box.textContent = "";
    if (!sample) {
      box.appendChild(el("p", "尚未连接，无法显示任务列表。", "tasks-empty"));
      return;
    }
    if (!dataValid) {
      var note = el("p", "数据当前无效（过期/网络错误），以下为旧读数，" +
        "不代表当前任务情况。", "tasks-empty");
      box.appendChild(note);
    }
    if (sample.error === "TASK_INFO_PARTIAL_UNKNOWN") {
      box.appendChild(el("p", "注意：任务信息可能不完整，部分任务进程无法读取。",
        "metric-error"));
    }
    if (sample.error === "COMPUTE_APPS_UNAVAILABLE") {
      box.appendChild(el("p", "任务列表整体暂不可用（采集器未能读取计算应用），" +
        "不能据此判断“无任务”。", "metric-error"));
    }
    for (var gi = 0; gi < 2; gi++) {
      var gpu = sample.gpus[gi];
      var group = el("div", null, "task-gpu-group");
      if (!dataValid) group.classList.add("stale-reading");
      group.appendChild(el("div", "GPU " + gi + " 任务显存",
        "task-gpu-title"));
      var headerNote = tasksHeaderNote(sample, gpu);
      var tasks = sample.tasks.filter(function (t) {
        return t.gpu_index === gi;
      });
      if (headerNote) {
        group.appendChild(el("p", headerNote, "tasks-empty"));
      } else if (tasks.length === 0 && !dataValid) {
        // 旧读数：网络失败/过期时不能把旧空列表说成“当前”无任务
        group.appendChild(el("p", "上次采样无任务记录（旧读数，不代表当前）",
          "tasks-empty"));
      } else if (tasks.length === 0) {
        // 只有在任务信息明确可用、数据当前有效且确实为空时，才说“无任务”
        group.appendChild(el("p", "当前无计算任务", "tasks-empty"));
      }
      tasks.forEach(function (t) {
        var row = el("div", null, "task-bar-row");
        row.appendChild(el("span", t.alias, "task-alias"));
        var track = el("div", null, "task-bar-track");
        var fill = el("div", null, "task-bar-fill");
        var pct = gpu.memory_total_mib
          ? Math.min(100, Math.round(t.used_memory_mib /
              gpu.memory_total_mib * 100))
          : 0;
        fill.style.width = pct + "%";
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el("span",
          fmtNum(t.used_memory_mib) + " MiB · " + pct + "%",
          "task-bar-mem"));
        group.appendChild(row);
      });
      box.appendChild(group);
    }
  }

  function render() {
    var nowWall = Date.now();
    var nowMono = performance.now();
    var panel = document.getElementById("status-panel");
    var icon = document.getElementById("status-icon");
    var text = document.getElementById("status-text");
    var detail = document.getElementById("status-detail");
    panel.className = "status-panel";
    var g = state.lastGood;
    var ageMs = g
      ? state.ageTracker.ageMs(nowWall, nowMono)
      : null;
    // R10：只有 mode 为 ok 且年龄未过期才是“当前有效”
    var dataValid = state.mode === "ok" && g !== null &&
      ageMs !== null && ageMs < cfg.staleAfterMs;

    // 状态条
    if (state.mode === "error" && !g) {
      panel.classList.add("status-error");
      icon.textContent = "✕";
      text.textContent = "无法显示监控数据";
      detail.textContent = state.errors.map(function (e) {
        return V.ERROR_TEXT_ZH[e.code] || e.code;
      }).join("；");
    } else if (state.mode === "error" && g) {
      panel.classList.add("status-error");
      icon.textContent = "△";
      text.textContent = "本次数据有误，显示的是旧读数（非当前有效）";
      detail.textContent = state.errors.map(function (e) {
        return V.ERROR_TEXT_ZH[e.code] || e.code;
      }).join("；");
    } else if (!g) {
      panel.classList.add("status-disconnected");
      icon.textContent = "○";
      text.textContent = "尚未连接";
      detail.textContent = state.urlConfigured
        ? "尚未收到公开数据；无真实数据时不会用样例冒充。"
        : "未配置公开数据地址（telemetryUrl），且无真实数据，不显示样例。";
    } else if (!dataValid) {
      panel.classList.add("status-stale");
      icon.textContent = "⏱";
      text.textContent = "监控数据已过期";
      detail.textContent = "最后采样于 " + fmtAge(ageMs) +
        "；过期不代表服务器离线，可能是采集/发布链路暂停。";
    } else if (samplePartialUnknown(g.env.sample).length > 0) {
      // H4：fresh 但样本级或任意一张卡存在 error/缺失指标，不允许全绿；
      // 逐卡汇总后准确描述，仍有效的单卡读数继续正常展示。
      panel.classList.add("status-partial");
      icon.textContent = "◐";
      var probList = samplePartialUnknown(g.env.sample);
      var allGpuUnknown = g.env.sample.gpus.length > 0 &&
        g.env.sample.gpus.every(gpuUnknown);
      text.textContent = allGpuUnknown
        ? "两张 GPU 指标暂不可用（无有效读数）"
        : "部分数据未知（其余有效读数仍显示）";
      detail.textContent = probList.join("；") + "；采样于 " + fmtAge(ageMs) +
        (state.notice ? "；" + state.notice : "") +
        "；仅公开脱敏指标，不得据此判断“无任务”。";
    } else if (state.notice) {
      panel.classList.add("status-restart");
      icon.textContent = "↻";
      text.textContent = "数据正常（采集器刚重启）";
      detail.textContent = state.notice;
    } else {
      panel.classList.add("status-ok");
      icon.textContent = "●";
      text.textContent = "数据正常";
      detail.textContent = "采样于 " + fmtAge(ageMs) +
        "（仅公开脱敏指标）";
    }

    // GPU 卡片（R10：无效时统一旧读数样式）
    var grid = document.getElementById("gpu-grid");
    grid.textContent = "";
    if (g) {
      g.env.sample.gpus.forEach(function (gpu) {
        grid.appendChild(renderGpu(gpu, dataValid));
      });
    } else {
      for (var i = 0; i < 2; i++) {
        var card = el("div", null, "gpu-card");
        card.appendChild(el("h2", "GPU " + i));
        card.appendChild(el("p", "尚未连接", "tasks-empty"));
        grid.appendChild(card);
      }
    }

    renderTasks(g ? g.env.sample : null, dataValid);

    // 时刻
    var sampled = document.getElementById("meta-sampled");
    var sampledAge = document.getElementById("meta-sampled-age");
    var published = document.getElementById("meta-published");
    var publishedAge = document.getElementById("meta-published-age");
    var fetched = document.getElementById("meta-fetched");
    var fetchedSub = document.getElementById("meta-fetched-sub");
    if (g) {
      sampled.textContent = fmtLocal(g.sampledMs);
      sampledAge.textContent = "采样年龄：" + fmtAge(ageMs);
      published.textContent = fmtLocal(g.publishedMs);
      publishedAge.textContent = "发布于 " + fmtAge(nowWall - g.publishedMs);
      fetched.textContent = fmtLocal(g.fetchedMs);
      fetchedSub.textContent = "本次请求获取时间（cache:no-store 不代表" +
        "CDN 秒级鲜度，以采样年龄为准）";
    } else {
      sampled.textContent = "—";
      sampledAge.textContent = "—";
      published.textContent = "—";
      publishedAge.textContent = "—";
      fetched.textContent = "—";
      fetchedSub.textContent = "—";
    }

    // 页脚实例
    var footerInst = document.getElementById("footer-instance");
    footerInst.textContent = g
      ? "采集实例：" + g.env.sample.collector_instance_id +
        " ｜ 采样序号：" + g.env.sample.sample_seq +
        " ｜ 发布序号：" + g.env.publication_seq
      : "";
  }

  // ------------------------------------------------------ 阶段面板/论文

  function renderStatic() {
    document.getElementById("stage-achievement").textContent =
      cfg.stage.achievement;
    var ul = document.getElementById("stage-next");
    ul.textContent = "";
    cfg.stage.nextSteps.forEach(function (s) {
      ul.appendChild(el("li", s));
    });
    document.getElementById("stage-delivery").textContent =
      cfg.stage.delivery;
    document.getElementById("stage-deploy").textContent =
      cfg.stage.deploy;
    document.getElementById("stage-validity").textContent =
      cfg.stage.validity;

    var btn = document.getElementById("paper-button");
    if (cfg.paperUrl && /^https?:\/\//.test(cfg.paperUrl)) {
      btn.href = cfg.paperUrl;
      btn.classList.remove("disabled");
      btn.textContent = "查看私有论文（需权限）";
    } else {
      btn.removeAttribute("href");
      btn.classList.add("disabled");
      btn.textContent = "稿件待交付";
    }
  }

  // ------------------------------------------------------ 演示模式

  function startDemo() {
    state.demo = true;
    document.getElementById("demo-banner").hidden = false;
    state.demoSource = new window.RWCDemo.DemoSource();
    document.querySelectorAll("#demo-controls button").forEach(function (b) {
      b.addEventListener("click", function () {
        var newState = b.getAttribute("data-demo-state");
        // 从非正常状态恢复时模拟采集器重启（新实例、新 seq）
        if (state.demoState !== "normal" && newState === "normal") {
          state.demoSource.restart();
        }
        state.demoState = newState;
      });
    });
    setInterval(async function () {
      if (state.demoState === "error") {
        // 模拟网络错误：撤销“数据正常”，保留旧读数
        state.errors = [{ code: E.FETCH_NETWORK_ERROR, detail: "demo" }];
        state.mode = "error";
        render();
        return;
      }
      if (state.demoState === "stale") {
        // 模拟采集/发布链路暂停：不发新样本，上一次数据随年龄自然过期。
        // 状态条仍按每秒年龄计算变为“监控数据已过期”，不伪造离线。
        return;
      }
      var sample = state.demoSource.next();
      var nowIso = window.RWCDemo.isoZ(new Date());
      var envelope = {
        schema_version: "1.0",
        publication_seq: sample.sample_seq,
        published_at: nowIso,
        sample_hash: "",
        sample: sample
      };
      envelope.sample_hash = await C.sampleHash(sample);
      await processEnvelope(envelope);
      render();
    }, 2000);
  }

  // ------------------------------------------------------ 启动

  function boot() {
    renderStatic();
    var demoOn = new URLSearchParams(location.search).get("demo") === "1";
    if (demoOn) {
      startDemo();
      setInterval(render, 1000);
      render();
      return;
    }
    document.getElementById("demo-banner").hidden = true;
    state.urlConfigured = !!cfg.telemetryUrl;
    if (!cfg.telemetryUrl) {
      setInterval(render, 1000);
      render();
      return;
    }
    fetchOnce();
    setInterval(fetchOnce, cfg.refreshIntervalMs);
    setInterval(render, 1000);   // 每秒检查采样年龄
    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
