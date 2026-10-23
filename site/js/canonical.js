/*
 * canonical.js —— 与 monitor/canonical.py 严格同构的规范化 JSON 与 SHA-256。
 *
 * 规则（与 Python 端一致，跨语言复算由 tests/cross_lang_hash_check.js 校验）：
 * 1. UTF-8；对象键按码点升序；无空白；字符串 JSON 转义、非 ASCII 原样输出。
 * 2. 整数字段输出整数；power_watts 四舍五入到 1 位小数（toFixed(1)）。
 * 3. 拒绝 NaN/Infinity；无结尾换行。
 * 4. SHA-256 输出 "sha256:" + 64 位小写十六进制。
 */
(function (root) {
  "use strict";

  var ONE_DECIMAL_FIELDS = { power_watts: true };

  // 与 Python Decimal(repr(float)).quantize(ROUND_HALF_UP) 对齐：
  // 以运行时最短十进制字符串（Number.toString / Python repr）为基准，
  // 对第二位小数做四舍五入，避免二进制浮点的 tie 分歧。
  function roundHalfUpOne(v) {
    if (Number.isInteger(v)) return v.toFixed(1);
    var s = String(v);
    var neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    if (s.indexOf("e") !== -1 || s.indexOf("E") !== -1) {
      // 本 schema 数值范围（0-2000）不会出现科学计数，兜底防御
      s = (Math.round(v * 10) / 10).toFixed(1);
      return neg ? "-" + s : s;
    }
    var dot = s.indexOf(".");
    var intp, frac;
    if (dot === -1) { intp = s; frac = ""; }
    else { intp = s.slice(0, dot); frac = s.slice(dot + 1); }
    while (frac.length < 2) frac += "0";
    var first = parseInt(frac.charAt(0), 10);
    var second = parseInt(frac.charAt(1), 10);
    if (second >= 5) {
      first += 1;
      if (first === 10) {
        intp = String(parseInt(intp || "0", 10) + 1);
        first = 0;
      }
    }
    var out = intp + "." + String(first);
    return neg && out !== "0.0" ? "-" + out : out;
  }

  function canonicalize(value, keyHint) {
    if (value === null) return "null";
    var t = typeof value;
    if (t === "number") {
      if (!Number.isFinite(value)) throw new Error("拒绝非有限数值");
      // 统一零符号：-0.0 与 0 输出一致（与 Python 端约定相同）。
      if (value === 0) {
        return ONE_DECIMAL_FIELDS[keyHint] ? "0.0" : "0";
      }
      if (ONE_DECIMAL_FIELDS[keyHint]) {
        return roundHalfUpOne(value);
      }
      return String(value);
    }
    if (t === "string") return JSON.stringify(value);
    if (t === "boolean") return value ? "true" : "false";
    if (Array.isArray(value)) {
      var parts = value.map(function (v) { return canonicalize(v, keyHint); });
      return "[" + parts.join(",") + "]";
    }
    if (t === "object") {
      var keys = Object.keys(value).sort();
      var segs = keys.map(function (k) {
        return JSON.stringify(k) + ":" + canonicalize(value[k], k);
      });
      return "{" + segs.join(",") + "}";
    }
    throw new Error("canonical: 不支持的类型");
  }

  function canonicalJson(value, keyHint) {
    return canonicalize(value, keyHint || "");
  }

  async function sha256Hex(text) {
    if (typeof require === "function" && typeof module !== "undefined" &&
        module.exports && typeof window === "undefined") {
      // Node 22 自测路径
      var crypto = require("crypto");
      return crypto.createHash("sha256").update(text, "utf8").digest("hex");
    }
    var buf = new TextEncoder().encode(text);
    var digest = await root.crypto.subtle.digest("SHA-256", buf);
    var bytes = Array.from(new Uint8Array(digest));
    return bytes.map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  async function sampleHash(sample) {
    return "sha256:" + (await sha256Hex(canonicalJson(sample)));
  }

  var api = { canonicalJson: canonicalJson, sampleHash: sampleHash,
              sha256Hex: sha256Hex };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.RWCCanonical = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
