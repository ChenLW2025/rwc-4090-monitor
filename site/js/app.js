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
 * - L3：GitHub Contents API 仅作为“默认关闭、显式配置”的备用源；
 *   只有尚无有效样本或采样年龄≥120s 且冷却到期时才用 API 替代本轮
 *   raw，每轮仍至多一个请求；匿名额度有限，冷却/限流规则见 fetchOnce。
 *   该备用源只尽力缓解缓存延迟，不承诺消除所有过期窗口。
 */
(function () {
  "use strict";

  var cfg = window.RWC_CONFIG;
  var V = window.RWCValidate;
  var C = window.RWCCanonical;
  var E = V.ERROR;

  var state = {
    mode: "disconnected",
    lastGood: null,   // {env, fetchedMs, sampledMs, publishedMs, hash, source}
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

  // L3：GitHub Contents API 备用源的冷却/限流状态（无 token 匿名访问）。
  var API_COOLDOWN_MIN_MS = 120000;   // 每次尝试（含失败）至少冷却 120s
  var API_BACKOFF_MAX_MS = 600000;    // 无有效限流头时的有限退避上限
  var LS_KEY_PREFIX = "rwc-api-cooldown:";
  var api = {
    attempts: 0,
    memoryNextAllowedMs: 0,
    backoffMs: 0,
    storageOk: null,       // null=未探测，true/false
    storageNote: "",
    locksOk: null          // Web Locks 是否可用（跨标签原子预约）
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

  async function processEnvelope(env, source) {
    var now = Date.now();
    source = source === "api" ? "api" : "raw";
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
      hash: hash,
      source: source
    };
    state.errors = [];
    state.mode = "ok";
    // 只有“已接受过旧实例且新实例不同”才提示实例变化；首次观察不提示
    // 重启（页面可能在采集器运行很久后才打开，首个序号未必是 1），
    // 也不声称序号从 1 开始——当前序号以样本实际字段为准。
    state.notice = guardResult.restarted
      ? "检测到采集器实例变化（新实例 " +
        env.sample.collector_instance_id + "，当前采样序号 " +
        env.sample.sample_seq + "）"
      : null;
  }

  // ------------------------------------------------------ 拉取

  // L2：每轮缓存区分。cache:no-store 只表达浏览器意图，不能保证 GitHub
  // Pages/CDN 或中间层的端到端新鲜度（实测 raw max-age=300 会让页面长期
  // 读到旧 publication）。因此每次轮询都在 URL 上附加“轮询时间片”参数：
  // 片长等于轮询周期（默认 15s），使同一轮询周期的 URL 与相邻周期不同，
  // 以尽力避免命中中间缓存；这只是尽力而为，不能保证穿透所有缓存层（API
  // 响应同样有 max-age）。参数值不参与任何数据判定，绝不用于给旧样本续命。
  // 正确处理已有 query（用 & 追加）与 fragment（保持在末尾）；key/value
  // 经 URLSearchParams 编码（URL 安全）。
  function buildPollUrl(rawUrl, nowMs) {
    var base = window.location && window.location.href
      ? window.location.href : "http://localhost/";
    var u = new URL(rawUrl, base);
    var slice = Math.floor(nowMs / cfg.refreshIntervalMs);
    u.searchParams.set("_rwc_poll", String(slice));
    return u.toString();
  }

  // L3：GitHub Contents API 备用 URL。强制 ref=telemetry，追加时间片
  // 尽力避免缓存；返回的是“要请求的完整 URL”，不携带任何 token，也不会
  // 去再请求响应中的 download_url。
  function buildApiUrl(apiUrl, nowMs) {
    var base = window.location && window.location.href
      ? window.location.href : "http://localhost/";
    var u = new URL(apiUrl, base);
    u.searchParams.set("ref", "telemetry");
    u.searchParams.set("_rwc_poll",
      String(Math.floor(nowMs / cfg.refreshIntervalMs)));
    return u.toString();
  }

  // 暴露给测试/调试：记录每轮实际请求 URL（测试可连续捕获）
  window.RWCBuildPollUrl = buildPollUrl;
  window.RWCBuildApiUrl = buildApiUrl;
  window.__RWC_REQUEST_URLS__ = [];
  window.__RWC_REQUESTS__ = [];
  window.__RWC_API_STATE__ = api;

  // -------------------------------------------- L3 冷却/限流（跨标签）
  function apiStorageKey() {
    var host = "unknown";
    try {
      host = new URL(cfg.contentsApiUrl,
        window.location.href || "http://localhost/").host;
    } catch (e) { host = "unknown"; }
    return LS_KEY_PREFIX + host;
  }

  function detectStorage() {
    if (api.storageOk !== null) return api.storageOk;
    try {
      var ls = window.localStorage;
      var probe = "__rwc_ls_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      api.storageOk = true;
    } catch (e) {
      api.storageOk = false;
    }
    return api.storageOk;
  }

  // Web Locks（navigator.locks）可用性：跨标签的“检查冷却 + 预约”必须靠
  // 同源独占锁才能原子；没有它就只能尽力而为。
  function detectLocks() {
    if (api.locksOk !== null) return api.locksOk;
    try {
      api.locksOk = !!(window.navigator && window.navigator.locks &&
        typeof window.navigator.locks.request === "function");
    } catch (e) {
      api.locksOk = false;
    }
    return api.locksOk;
  }

  // 汇总跨标签保障的真实能力，不可用时诚实说明退化，不默默声称安全。
  function apiFeatureNote() {
    var storageOk = detectStorage();
    var locksOk = detectLocks();
    if (storageOk && locksOk) {
      api.storageNote = "";
    } else if (storageOk && !locksOk) {
      api.storageNote = "GitHub Contents API 备用源的冷却可经 localStorage "
        + "共享，但当前环境没有 Web Locks，无法保证多标签并发启动时“检查+"
        + "预约”原子：多个标签同时发起可能各打一次 API，冷却共享为尽力而"
        + "为；单标签冷却仍严格生效。";
    } else {
      api.storageNote = "GitHub Contents API 备用源的限流冷却无法经 "
        + "localStorage 跨标签共享（当前环境"
        + (locksOk ? "无存储" : "无存储且无 Web Locks")
        + "），仅在本标签生效；多标签/多设备共享 IP 时不保证零限流。";
    }
    return api.storageNote;
  }

  function apiLockKey() {
    return apiStorageKey() + ":lock";
  }

  // 锁在运行期被证明不可用（request 抛错或拒绝）：立即标记降级并刷新
  // 能力提示，后续全部走本标签内存冷却，不产生未处理拒绝。
  function invalidateLocks() {
    api.locksOk = false;
    apiFeatureNote();
  }

  // 存储在探测通过后又读写异常（配额/隐私模式变化）：同样诚实降级。
  function invalidateStorage() {
    api.storageOk = false;
    apiFeatureNote();
  }

  // 在同源独占 Web Lock 内执行临界区（跨标签互斥）。锁请求本身拒绝或
  // 抛错时，标记降级并无锁直接执行临界区，保证已收到的限流头/冷却不被
  // 锁错误吞掉，也不产生未处理 Promise 拒绝。
  function withApiLock(fn) {
    if (!detectLocks()) {
      return Promise.resolve(fn());
    }
    var p;
    try {
      p = window.navigator.locks.request(apiLockKey(), function () {
        return fn();
      });
    } catch (e) {
      invalidateLocks();
      return Promise.resolve(fn());
    }
    if (!p || typeof p.then !== "function") {
      invalidateLocks();
      return Promise.resolve(fn());
    }
    return Promise.resolve(p).catch(function () {
      invalidateLocks();
      return fn();
    });
  }

  function apiCooldownRead(now) {
    var next = api.memoryNextAllowedMs;
    if (detectStorage()) {
      try {
        var raw = window.localStorage.getItem(apiStorageKey());
        if (raw) {
          var v = JSON.parse(raw);
          if (v && typeof v.nextAllowedMs === "number"
              && isFinite(v.nextAllowedMs)) {
            next = Math.max(next, v.nextAllowedMs);
            api.memoryNextAllowedMs = Math.max(api.memoryNextAllowedMs,
              v.nextAllowedMs);
          }
        }
      } catch (e) {
        // 探测后读异常：存储不再可靠，诚实降级，只按本标签内存冷却
        invalidateStorage();
      }
    }
    return next;
  }

  // 仅在锁内调用：取“当前值与新值的更晚者”，绝不覆盖其它标签已写入的
  // 更晚期限；任何成功/错误都不能缩短已预约的冷却。
  function apiCooldownCommit(now, nextMs) {
    var current = apiCooldownRead(now);
    nextMs = Math.max(nextMs, current);
    if (nextMs < now + API_COOLDOWN_MIN_MS) {
      nextMs = now + API_COOLDOWN_MIN_MS;   // 任何尝试至少冷却 120s
    }
    api.memoryNextAllowedMs = Math.max(api.memoryNextAllowedMs, nextMs);
    if (detectStorage()) {
      try {
        window.localStorage.setItem(apiStorageKey(), JSON.stringify({
          nextAllowedMs: api.memoryNextAllowedMs,
          updatedAt: now
        }));
      } catch (e) {
        // 探测后写异常（配额/隐私模式）：标记降级，内存冷却仍严格有效
        invalidateStorage();
      }
    }
    return api.memoryNextAllowedMs;
  }

  function finiteNonNegMs(v) {
    return typeof v === "number" && isFinite(v) && v >= 0;
  }

  // 解析 x-ratelimit-reset / x-ratelimit-remaining / retry-after，
  // 返回“建议的下一次可请求时刻（ms）”；没有可用头返回 0。receiptMs 为
  // 响应实际收到时刻（相对 Retry-After 从此时起算），status 为 HTTP 状态。
  function apiRateLimitNext(headers, receiptMs, status) {
    var next = 0;
    function h(name) {
      try {
        return headers && headers.get ? headers.get(name) : null;
      } catch (e) { return null; }
    }
    // Retry-After（秒数或 HTTP-date）：相对秒数从响应收到时刻计算
    var retry = h("retry-after");
    if (retry !== null && retry !== undefined && String(retry).trim() !== "") {
      var r = String(retry).trim();
      if (/^\d+$/.test(r)) {
        var relMs = receiptMs + Number(r) * 1000;
        if (finiteNonNegMs(relMs)) next = Math.max(next, relMs);
      } else {
        var t = Date.parse(r);
        if (!isNaN(t) && isFinite(t)) next = Math.max(next, t);
      }
    }
    var reset = h("x-ratelimit-reset");
    var remaining = h("x-ratelimit-remaining");
    var resetMs = 0;
    if (reset && /^\s*\d+\s*$/.test(String(reset))) {
      var parsed = Number(reset) * 1000 + 1000;
      if (finiteNonNegMs(parsed)) resetMs = parsed;
    }
    // 403/429：使用所有有效 Reset（即使 remaining 是正数）；
    // 200：只有 remaining=0 才等到 Reset，避免每次成功都等到整小时。
    if (resetMs) {
      if (status === 403 || status === 429) {
        next = Math.max(next, resetMs);
      } else if (status === 200) {
        if (remaining !== null && remaining !== undefined
            && /^\s*\d+\s*$/.test(String(remaining))
            && Number(remaining) === 0) {
          next = Math.max(next, resetMs);
        }
      }
    }
    return next;
  }

  // 无有效限流头的有限指数退避（120s→240s→480s…上限 600s）。
  // 从响应收到时刻起算（请求在途耗时不白送）。
  function apiBackoffTarget(receiptMs) {
    api.backoffMs = api.backoffMs === 0
      ? API_COOLDOWN_MIN_MS
      : Math.min(api.backoffMs * 2, API_BACKOFF_MAX_MS);
    return receiptMs + api.backoffMs;
  }

  // 锁内计算一次尝试（成功/失败）后的最终冷却时刻并原子提交。
  // startedAt 为请求开始时刻（120s 基础预约从那时起算）；receiptMs 为
  // 响应收到时刻（相对 Retry-After 与无头退避从此时起算）；最终取更晚
  // 期限，成功/错误都不缩短。
  function noteApiAttemptLocked(startedAt, receiptMs, kind, resp) {
    api.attempts += 1;
    var baseReservation = startedAt + API_COOLDOWN_MIN_MS;
    var headers = resp && resp.headers;
    var status = resp && resp.status;
    var limitNext = headers ? apiRateLimitNext(headers, receiptMs, status) : 0;
    var target;
    if (kind === "rate-limited" || kind === "5xx"
        || kind === "network" || kind === "timeout") {
      if (limitNext > receiptMs) {
        api.backoffMs = 0;
        target = Math.max(baseReservation, limitNext);
      } else {
        // 没有有效头：有限退避，且不短于基础预约
        target = Math.max(baseReservation, apiBackoffTarget(receiptMs));
      }
    } else {
      // ok / bad-data / 404：不短于基础预约。限流是响应约束，不能随
      // JSON/schema/hash/序号验证失败丢失：200 且 remaining=0（含坏 JSON、
      // 校验失败等 body 失败路径）同样等到 reset；普通 200 正余额时
      // limitNext 已为 0，不会因此等到整小时。
      api.backoffMs = 0;
      target = Math.max(baseReservation,
        (limitNext > receiptMs && (kind === "ok" || kind === "bad-data"))
          ? limitNext : 0,
        receiptMs + API_COOLDOWN_MIN_MS);
    }
    return apiCooldownCommit(receiptMs, target);
  }

  function noteApiAttempt(startedAt, receiptMs, kind, resp) {
    return withApiLock(function () {
      return noteApiAttemptLocked(startedAt, receiptMs, kind, resp);
    });
  }

  // 请求开始前在同源锁内原子预约：检查冷却 + 写入至少 120s 的基础冷却。
  // 返回 true 表示本轮可以发 API；false 表示冷却未到（含并发中被其它
  // 标签抢先预约），本轮应回退为 raw。
  function reserveApiAttempt(now) {
    function check() {
      if (now < apiCooldownRead(now)) return false;
      apiCooldownCommit(now, now + API_COOLDOWN_MIN_MS);
      return true;
    }
    // withApiLock 自身会在锁拒绝/抛错时标记降级并无锁执行 check
    if (detectLocks()) return withApiLock(check);
    apiFeatureNote();
    return Promise.resolve(check());
  }

  function currentSampleAgeMs(now) {
    if (!state.lastGood) return null;
    return state.ageTracker.ageMs(now, performance.now());
  }

  // L3：本轮是否用 API 替代 raw。条件：显式配置 + （尚无有效样本 或
  // 采样年龄≥120s）+ 冷却到期；否则继续 raw。每轮仍只发一个请求。
  function chooseSource(now) {
    if (!cfg.contentsApiUrl) return "raw";
    var age = currentSampleAgeMs(now);
    var eligible = state.lastGood === null ||
      (age !== null && age >= cfg.apiFallbackAgeMs);
    if (!eligible) return "raw";
    if (now < apiCooldownRead(now)) return "raw";
    return "api";
  }
  window.RWCChooseSource = chooseSource;

  async function fetchOnce() {
    if (state.inflight) return;            // 单请求在途
    state.inflight = true;
    var mySeq = ++state.requestSeq;
    var startedAt = Date.now();
    var source = chooseSource(startedAt);
    // L3c：发 API 请求前，先在同源 Web Lock 内原子“检查冷却 + 预约至少
    // 120s 基础冷却”。若并发中被其它标签抢先预约，本轮回退为 raw。
    if (source === "api") {
      var reserved = await reserveApiAttempt(startedAt);
      if (mySeq !== state.requestSeq) { state.inflight = false; return; }
      if (!reserved) source = "raw";
    }
    var requestUrl, acceptType;
    if (source === "api") {
      requestUrl = buildApiUrl(cfg.contentsApiUrl, startedAt);
      acceptType = "application/vnd.github.raw+json"; // 直接要文件内容
    } else {
      requestUrl = buildPollUrl(cfg.telemetryUrl, startedAt);
      acceptType = "application/json";
    }
    window.__RWC_REQUEST_URLS__.push(requestUrl);
    window.__RWC_REQUESTS__.push({ source: source, url: requestUrl });
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); },
                           cfg.fetchTimeoutMs);
    function failFetch(code, detail) {
      state.errors = [{ code: code, detail: detail || "" }];
      state.mode = "error";   // 保留旧读数（不修改 lastGood），撤销有效结论
    }
    try {
      var resp = await fetch(requestUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: { "Accept": acceptType },
        signal: controller.signal
      });
      if (mySeq !== state.requestSeq) return;  // 旧响应，丢弃
      var receiptMs = Date.now();
      if (source === "api") {
        // 403/429：遵从限流头/退避；5xx/304 等也计入尝试，绝不假设 304
        // 不占额度。
        if (resp.status === 403 || resp.status === 429) {
          await noteApiAttempt(startedAt, receiptMs, "rate-limited", resp);
          failFetch(E.HTTP_ERROR, "HTTP " + resp.status +
            "（Contents API 限流，已按 Reset/Retry-After 冷却）");
          return;
        }
        if (resp.status === 404) {
          await noteApiAttempt(startedAt, receiptMs, "404", resp);
          failFetch(E.HTTP_404);
          return;
        }
        if (!resp.ok || resp.status === 304) {
          await noteApiAttempt(startedAt, receiptMs,
            resp.status >= 500 ? "5xx" : "network", resp);
          failFetch(E.HTTP_ERROR, "HTTP " + resp.status +
            (resp.status === 304 ? "（304 不视为免费成功）" : ""));
          return;
        }
      } else if (resp.status === 404) {
        failFetch(E.HTTP_404);
        return;
      } else if (!resp.ok) {
        failFetch(E.HTTP_ERROR, "HTTP " + resp.status);
        return;
      }
      var text = await resp.text();
      receiptMs = Date.now();
      var env;
      try {
        env = JSON.parse(text);
      } catch (e) {
        if (source === "api") {
          await noteApiAttempt(startedAt, receiptMs, "bad-data", resp);
        }
        failFetch(E.BAD_JSON);
        return;
      }
      if (mySeq !== state.requestSeq) return;
      await processEnvelope(env, source);
      if (mySeq !== state.requestSeq) return;
      if (source === "api") {
        // 坏数据（processEnvelope 已把 mode 置 error）同样计入冷却；
        // 成功/remaining=0 也按 120s~reset 安排。
        if (state.mode === "error") {
          await noteApiAttempt(startedAt, receiptMs, "bad-data", resp);
        } else {
          await noteApiAttempt(startedAt, receiptMs, "ok", resp);
        }
      }
    } catch (e) {
      if (mySeq !== state.requestSeq) return;
      var errReceiptMs = Date.now();
      if (e && e.name === "AbortError") {
        if (source === "api") {
          await noteApiAttempt(startedAt, errReceiptMs, "timeout", null);
        }
        failFetch(E.FETCH_TIMEOUT);
      } else {
        if (source === "api") {
          await noteApiAttempt(startedAt, errReceiptMs, "network", null);
        }
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

  function renderGpu(gpu, dataValid, expired) {
    var card = el("div", null, "gpu-card");
    var head = el("h2", "GPU " + gpu.index);
    var nullCount = gpuNullMetricCount(gpu);
    var allKnown = nullCount === 0 && gpu.error === null;
    var stateText, cls;
    if (!dataValid) {
      // L3e：保留读数分两种——真实满 180 秒才称“已过期”；新鲜窗口内的
      // 保留读数只称“当前状态未确认”。
      stateText = expired
        ? "保留读数·已过期"
        : "保留读数·当前状态未确认";
      cls = "unknown";
    } else if (allKnown) {
      stateText = "正常";
      cls = "ok";
    } else if (nullCount === 5) {
      // 五个公开指标全部为 null（即使 gpu.error 恰为 null，这也是合法
      // schema 形状）：该卡没有任何有效读数；有效指标为零个。
      stateText = "无有效读数";
      cls = "unknown";
    } else if (gpu.error !== null || nullCount > 0) {
      // 只有部分指标缺失（例如仅 power_watts=null）：显存/温度等有效读数
      // 保留展示，卡片状态准确表述为“部分指标未知”。
      stateText = "部分指标未知";
      cls = "unknown";
    } else {
      stateText = "无有效读数";
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

  // 样本级错误中与“任务信息未知”直接相关的枚举（其余错误同样不全绿，
  // 但语义不同，由通用分支处理）。
  var TASK_UNKNOWN_ERRORS = {
    COMPUTE_APPS_UNAVAILABLE: true,
    TASK_INFO_PARTIAL_UNKNOWN: true
  };

  function gpuMetricKeys() {
    return ["utilization_percent", "memory_used_mib", "memory_total_mib",
      "temperature_c", "power_watts"];
  }

  // K1：统计该卡缺失的指标数；5 项全缺 = 无有效读数，缺一部分 = 部分指标
  // 未知（其余有效指标必须保留展示，不能统称为“无有效读数”）。
  function gpuNullMetricCount(gpu) {
    return gpuMetricKeys().filter(function (k) {
      return gpu[k] === null;
    }).length;
  }

  // 单卡“有任何未知”= 该卡带 error，或任一公开指标为 null。
  function gpuUnknown(gpu) {
    return gpu.error !== null || gpuNullMetricCount(gpu) > 0;
  }

  // K1：汇总样本级错误 + 每卡 error/null 指标。
  // 任何非 null 的 sample.error 都不允许总体绿色；返回具体问题描述数组，
  // 无未知返回空数组（才可显示“数据正常”）。
  function samplePartialUnknown(sample) {
    if (!sample) return [];
    var problems = [];
    if (sample.error) {
      problems.push(V.COLLECTOR_ERROR_TEXT_ZH[sample.error] ||
        ("采集器报告异常：" + sample.error));
    }
    (sample.gpus || []).forEach(function (gpu) {
      var nullCount = gpuNullMetricCount(gpu);
      if (gpu.error) {
        problems.push("GPU " + gpu.index + "：" +
          (V.COLLECTOR_ERROR_TEXT_ZH[gpu.error] || gpu.error));
      }
      if (!gpu.error && nullCount > 0 && nullCount < 5) {
        problems.push("GPU " + gpu.index + "：部分指标未知"
          + "（其余有效指标仍显示）");
      } else if (!gpu.error && nullCount === 5) {
        problems.push("GPU " + gpu.index + "：无有效读数");
      }
    });
    return problems;
  }

  function tasksHeaderNote(sample, gpu) {
    // R11/K1：区分“读不到任务”与“确实无任务”。
    // 只要样本带任何非 null 错误，任务列表就不能被当作“当前无任务”。
    if (gpu.error === "GPU_NOT_FOUND" || gpu.error === "NVIDIA_SMI_UNAVAILABLE") {
      return "该卡缺失或不可用，任务未知";
    }
    if (sample.error === "COMPUTE_APPS_UNAVAILABLE") {
      return "任务信息暂不可用，无法判断当前是否有计算任务";
    }
    if (sample.error === "TASK_INFO_PARTIAL_UNKNOWN") {
      return "任务信息可能不完整（部分进程无法读取）";
    }
    if (sample.error) {
      // COLLECTOR_INTERNAL_ERROR / NVIDIA_SMI_UNAVAILABLE 等任何其他
      // 合法枚举：任务情况未知，tasks=[] 不能解读为“无任务”。
      return "采集器报告异常（" + sample.error +
        "），任务情况未知，不能据此判断无任务";
    }
    return null;
  }

  function renderTasks(sample, dataValid, expired) {
    var box = document.getElementById("tasks-container");
    box.textContent = "";
    if (!sample) {
      box.appendChild(el("p", "尚未连接，无法显示任务列表。", "tasks-empty"));
      return;
    }
    if (!dataValid) {
      // L3e：新鲜窗口内“本次更新未采用、保留读数但状态未确认”；真实满
      // 180 秒才称“过期”。
      var noteText = expired
        ? "监控数据已过期（采样年龄满 180 秒），以下为保留读数，" +
          "不代表当前任务情况。"
        : "本次更新未采用，保留上次通过校验的读数；以下为保留读数" +
          "（当前状态未确认），不代表当前任务情况。";
      var note = el("p", noteText, "tasks-empty");
      box.appendChild(note);
    }
    if (sample.error === "TASK_INFO_PARTIAL_UNKNOWN") {
      box.appendChild(el("p", "注意：任务信息可能不完整，部分任务进程无法读取。",
        "metric-error"));
    }
    if (sample.error === "COMPUTE_APPS_UNAVAILABLE") {
      box.appendChild(el("p", "任务列表整体暂不可用（采集器未能读取计算应用），" +
        "不能据此判断“无任务”。", "metric-error"));
    } else if (sample.error && !TASK_UNKNOWN_ERRORS[sample.error]) {
      // K1：任何其他非 null sample.error 下，tasks=[] 也不能当“无任务”
      box.appendChild(el("p",
        "采集器报告异常（" + sample.error + "），任务情况未知，" +
        "不得据此判断“无任务”。", "metric-error"));
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
    // L3e：只有采样年龄真实达到 180 秒才称“过期”；本次更新失败但保留
    // 读数仍在新鲜窗口内时，只能说“当前状态未确认”，不能称过期。
    var expired = g !== null && ageMs !== null &&
      ageMs >= cfg.staleAfterMs;

    var errorReasons = state.errors.map(function (e) {
      return V.ERROR_TEXT_ZH[e.code] || e.code;
    }).join("；");

    // 状态条
    if (state.mode === "error" && !g) {
      panel.classList.add("status-error");
      icon.textContent = "✕";
      text.textContent = "无法显示监控数据";
      detail.textContent = errorReasons;
    } else if (state.mode === "error" && g) {
      if (expired) {
        // L3e：本次更新未采用且保留读数已真实满 180 秒：称“过期”，
        // 同时保留具体原因；错误状态样式不变。
        panel.classList.add("status-error");
        icon.textContent = "⏱";
        text.textContent = "监控数据已过期（本次更新未采用）";
        detail.textContent = "最后采样于 " + fmtAge(ageMs) +
          "；过期不代表服务器离线，可能是采集/发布链路暂停。" +
          "最近一次更新未采用：" + errorReasons + "；保留上次通过" +
          "校验的读数。";
      } else {
        // L3e：本次更新失败/未采用，但保留的读数仍在 180 秒新鲜窗口内：
        // 保留读数、明确当前状态未确认，不冒充“数据正常”，也不提前称过期。
        panel.classList.add("status-error");
        icon.textContent = "△";
        text.textContent = "本次更新未采用，保留上次通过校验的读数";
        detail.textContent = errorReasons + "；采样于 " + fmtAge(ageMs) +
          "；保留读数在 180 秒新鲜窗口内，但当前状态未确认。";
      }
    } else if (!g) {
      panel.classList.add("status-disconnected");
      icon.textContent = "○";
      text.textContent = "尚未连接";
      detail.textContent = state.urlConfigured
        ? "尚未收到公开数据；无真实数据时不会用样例冒充。"
        : "未配置公开数据地址（telemetryUrl），且无真实数据，不显示样例。";
    } else if (!dataValid) {
      // mode=ok 但采样年龄真实满 180 秒（无新样本、重复发布不续命）
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
      // K1：只有每张卡的五项指标全部缺失（无任何可读指标）才称“无有效读数”；
      // 仅部分指标缺失（如只有 power_watts=null）时，显存/温度等读数保留，
      // 状态条只说“部分数据未知”。
      var allGpuNoReading = g.env.sample.gpus.length > 0 &&
        g.env.sample.gpus.every(function (gpu) {
          return gpuNullMetricCount(gpu) === 5;
        });
      text.textContent = allGpuNoReading
        ? "两张 GPU 无有效读数（指标暂不可用）"
        : "部分数据未知（其余有效读数仍显示）";
      detail.textContent = probList.join("；") + "；采样于 " + fmtAge(ageMs) +
        (state.notice ? "；" + state.notice : "") +
        "；仅公开脱敏指标，不得据此判断“无任务”。";
    } else if (state.notice) {
      panel.classList.add("status-restart");
      icon.textContent = "↻";
      text.textContent = "数据正常（检测到采集器实例变化）";
      detail.textContent = state.notice;
    } else {
      panel.classList.add("status-ok");
      icon.textContent = "●";
      text.textContent = "数据正常";
      detail.textContent = "采样于 " + fmtAge(ageMs) +
        "（仅公开脱敏指标）";
    }
    // L3：localStorage 不可用时，诚实说明跨标签冷却只在本标签生效
    if (cfg.contentsApiUrl && api.storageNote) {
      detail.textContent += "；" + api.storageNote;
    }

    // GPU 卡片（R10：无效时统一旧读数样式）
    var grid = document.getElementById("gpu-grid");
    grid.textContent = "";
    if (g) {
      g.env.sample.gpus.forEach(function (gpu) {
        grid.appendChild(renderGpu(gpu, dataValid, expired));
      });
    } else {
      for (var i = 0; i < 2; i++) {
        var card = el("div", null, "gpu-card");
        card.appendChild(el("h2", "GPU " + i));
        card.appendChild(el("p", "尚未连接", "tasks-empty"));
        grid.appendChild(card);
      }
    }

    renderTasks(g ? g.env.sample : null, dataValid, expired);

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
      var srcText = g.source === "api"
        ? "GitHub Contents API 备用源"
        : "raw 轮询";
      fetchedSub.textContent = "最近一次通过校验的数据获取时间／来源：" +
        srcText +
        "（cache:no-store 不代表 CDN 秒级鲜度，以采样年龄为准）";
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
    if (cfg.contentsApiUrl) {
      // 提前探测 localStorage 与 Web Locks 可用性，诚实显示保障退化
      apiFeatureNote();
    }
    if (!cfg.telemetryUrl) {
      // 主 raw 地址未配置时保持“尚未连接”；备用 API 不单独开启轮询
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
