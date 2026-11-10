/**
 * dsh-usage-report — 全局 token 用量与费用统计。
 *
 * 数据源：$DSH_HOME/sessions/<workspace>/session.*.jsonl(.zstd) 里的 assistant/message
 * 记录（每条模型请求一条，带 inputTokens / cacheReadTokens / outputTokens），
 * 以及 request/context 记录里的 provider 与 model。
 *
 * 定价：provider → model → 内置档位 三级查找，全部落空时该请求只统计 token、
 * 不计费，并在 unpriced 里列出，交给设置页手填单价。
 * 单价存储：$DSH_HOME/storages/usage/prices.json（设置页写入，可手工编辑）。
 *
 * 端点（都过 connection.admit 鉴权）：
 *   GET  /plugins/dsh-usage/summary
 *   POST /plugins/dsh-usage/prices   {provider?, model, miss, hit?, out, clear?}
 *
 * 说明：会话日志只记录 provider 与 model，不记录 base_url，也不记录用了哪把凭据。
 * 因此不同 base_url 的同名路由在当前日志格式下无法区分；需要区分时，
 * 让每条路由使用不同的 provider（自定义适配器）或在 prompt/命名上自行区分。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync, gunzipSync } from "node:zlib";

const SUMMARY_ROUTE = "/plugins/dsh-usage/summary";
const PRICES_ROUTE = "/plugins/dsh-usage/prices";
const MAX_BODY_BYTES = 64 * 1024;

// ── 内置价目表（USD / 1M tokens），来源：api-docs.deepseek.com/quick_start/pricing
const BUILTIN_TIERS = {
  flash: { hitPeak: 0.006, hitOff: 0.003, missPeak: 0.3, missOff: 0.15, outPeak: 1.2, outOff: 0.6 },
  pro: { hitPeak: 0.044, hitOff: 0.022, missPeak: 1.32, missOff: 0.66, outPeak: 3.96, outOff: 1.98 },
};

const MODEL_TIER = {
  "deepseek-flash": "flash",
  "deepseek-v4-flash": "flash",
  "deepseek-v4-flash-vision-exp": "flash",
  "deepseek-v4-pro": "pro",
  "deepseek-pro": "pro",
};

// 高峰时段（UTC，周一至周五）：01:00-04:00 与 06:00-10:00
const PEAK_UTC_HOURS = [[1, 4], [6, 10]];
const SEARCH_USD_PER_REQUEST = 0.75 / 1000;
const DAY_TZ = "Asia/Shanghai";

const dshHome = () => process.env.DSH_HOME ?? join(homedir(), ".dsh");
const storePath = () => join(dshHome(), "storages", "usage", "prices.json");

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: DAY_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayOf = (ms) => dayFmt.format(new Date(ms));
const hourFmt = new Intl.DateTimeFormat("en-CA", { timeZone: DAY_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
/** 本地时区的 "YYYY-MM-DDTHH" */
const hourOf = (ms) => hourFmt.format(new Date(ms)).replace(", ", "T");

function isPeak(ms) {
  const d = new Date(ms);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const h = d.getUTCHours();
  return PEAK_UTC_HOURS.some(([from, to]) => h >= from && h < to);
}

// ── 单价存储 ───────────────────────────────────────────────────────────────
/**
 * 存储结构：
 * {
 *   "usdCny": 7.1,
 *   "tiers":   { "flash": {...}, "pro": {...} },          // 覆盖内置档位
 *   "models":  { "<model>": { hitPeak, missPeak, outPeak, ... } },  // 全局按模型
 *   "providers": { "<provider>": { "default": {...} | "flash", "models": { "<model>": {...} } } }
 * }
 */
function loadStore() {
  try {
    const parsed = JSON.parse(readFileSync(storePath(), "utf8"));
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveStore(store) {
  const file = storePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
}

/** 归一化一份单价：允许只给一个价（峰谷共用），补全其余字段。 */
function normalizePrice(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const miss = num(raw.missPeak) ?? num(raw.missOff) ?? num(raw.miss);
  const out = num(raw.outPeak) ?? num(raw.outOff) ?? num(raw.out);
  if (miss === undefined || out === undefined) return null;
  const hit = num(raw.hitPeak) ?? num(raw.hitOff) ?? num(raw.hit) ?? miss;
  const peak = num(raw.missPeak) !== undefined || num(raw.outPeak) !== undefined || num(raw.hitPeak) !== undefined;
  const off = num(raw.missOff) !== undefined || num(raw.outOff) !== undefined || num(raw.hitOff) !== undefined;
  return {
    hitPeak: hit, hitOff: hit,
    missPeak: miss, missOff: miss,
    outPeak: out, outOff: out,
    // 标注是否真的区分了峰谷，供 UI 显示
    peakAware: peak && off,
  };
}

/** 解析一份按模型/档位写的价格对象或档位名。 */
function priceFrom(entry, tiers) {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === "string") {
    const tier = tiers[entry];
    return tier ? { ...tier, peakAware: true } : null;
  }
  return normalizePrice(entry);
}

/**
 * 三级查找：provider+model → provider 默认 → 全局 model → 内置档位名。
 * @returns 单价对象，或 null（未定价，只统计 token）
 */
function resolvePrice(model, provider, store) {
  const tiers = { ...BUILTIN_TIERS, ...(store.tiers ?? {}) };
  const providerEntry = store.providers?.[provider];
  const scoped = providerEntry?.models?.[model];
  const fromScoped = priceFrom(scoped, tiers);
  if (fromScoped) return fromScoped;
  const fromProvider = priceFrom(providerEntry?.default, tiers);
  if (fromProvider) return fromProvider;
  const fromModel = priceFrom(store.models?.[model], tiers);
  if (fromModel) return fromModel;
  const tierName = MODEL_TIER[model] ?? (String(model).includes("pro") ? "pro" : undefined);
  const tier = tierName ? tiers[tierName] : undefined;
  return tier ? { ...tier, peakAware: true } : null;
}

function costOf(row, price) {
  if (price === null) return null;
  const peak = isPeak(row.ms);
  return (
    row.hit * (peak ? price.hitPeak : price.hitOff) +
    row.input * (peak ? price.missPeak : price.missOff) +
    row.out * (peak ? price.outPeak : price.outOff)
  ) / 1e6;
}

// ── 会话扫描 ───────────────────────────────────────────────────────────────
const fileCache = new Map();

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

function readLogText(file) {
  const buf = readFileSync(file);
  if (file.endsWith(".zstd")) return zstdDecompressSync(buf).toString("utf8");
  if (file.endsWith(".gz")) return gunzipSync(buf).toString("utf8");
  return buf.toString("utf8");
}

function parseSessionFile(file) {
  const text = readLogText(file);
  const sessionId = basename(dirname(file));
  let provider = "unknown";
  let model = "unknown";
  const rows = [];
  let searchCount = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.type === "request/context") {
      if (rec.data?.provider) provider = rec.data.provider;
      if (rec.data?.model) model = rec.data.model;
    } else if (rec.type === "request/header") {
      const cfg = rec.data?.header?.config;
      if (cfg?.provider) provider = cfg.provider;
      if (cfg?.model) model = cfg.model;
    } else if (rec.type === "assistant/message") {
      const usage = rec.data?.usage;
      if (!usage) continue;
      rows.push({
        sessionId,
        provider,
        model,
        ms: rec.time ?? 0,
        input: usage.inputTokens ?? 0,
        hit: usage.cacheReadTokens ?? 0,
        out: usage.outputTokens ?? 0,
      });
    } else if (rec.type === "web/deepseek-search-llm-request") {
      searchCount += 1;
    }
  }
  return { rows, searchCount };
}

const emptyBucket = () => ({ input: 0, hit: 0, out: 0, cost: 0, requests: 0, unpricedRequests: 0 });
const bumpBucket = (bucket, row, cost) => {
  bucket.input += row.input;
  bucket.hit += row.hit;
  bucket.out += row.out;
  bucket.requests += 1;
  if (cost === null) bucket.unpricedRequests += 1;
  else bucket.cost += cost;
};

/** 汇总全部会话。 */
export async function collectUsage() {
  const store = loadStore();
  const usdCny = typeof store.usdCny === "number" && store.usdCny > 0 ? store.usdCny : 7.1;
  const sessionsDir = join(dshHome(), "sessions");
  const byDay = new Map();
  const byHour = new Map();
  const byModel = new Map();
  const byProvider = new Map();
  const hoursByModel = new Map();
  const daysByModel = new Map();
  const unpriced = new Map(); // `${provider}\u0000${model}` → 未定价的 token 汇总
  const total = emptyBucket();
  let sessions = 0;
  let searchRequests = 0;

  for await (const file of walk(sessionsDir)) {
    if (!/session\..*\.(jsonl|jsonl\.zstd|jsonl\.gz)$/.test(basename(file))) continue;
    let stat;
    try { stat = statSync(file); } catch { continue; }
    const key = `${stat.mtimeMs}:${stat.size}`;
    const cached = fileCache.get(file);
    if (!cached || cached.key !== key) {
      try {
        fileCache.set(file, { key, value: parseSessionFile(file) });
      } catch {
        continue;
      }
    }
    const { rows, searchCount } = fileCache.get(file).value;
    sessions += 1;
    searchRequests += searchCount;
    for (const row of rows) {
      const price = resolvePrice(row.model, row.provider, store);
      const cost = costOf(row, price);
      const day = dayOf(row.ms);
      const hour = hourOf(row.ms);
      for (const [map, mapKey] of [[byDay, day], [byHour, hour], [byModel, row.model], [byProvider, row.provider]]) {
        if (!map.has(mapKey)) map.set(mapKey, emptyBucket());
        bumpBucket(map.get(mapKey), row, cost);
      }
      for (const [outer, inner] of [[hoursByModel, hour], [daysByModel, day]]) {
        const perModel = outer.get(row.model) ?? new Map();
        const bucket = perModel.get(inner) ?? emptyBucket();
        bumpBucket(bucket, row, cost);
        perModel.set(inner, bucket);
        outer.set(row.model, perModel);
      }
      bumpBucket(total, row, cost);
      if (cost === null) {
        const id = `${row.provider}\u0000${row.model}`;
        if (!unpriced.has(id)) unpriced.set(id, { provider: row.provider, model: row.model, input: 0, hit: 0, out: 0, requests: 0 });
        const entry = unpriced.get(id);
        entry.input += row.input;
        entry.hit += row.hit;
        entry.out += row.out;
        entry.requests += 1;
      }
    }
  }

  const searchCost = searchRequests * SEARCH_USD_PER_REQUEST;
  const sorted = (map) => Object.fromEntries([...map].sort());
  return {
    generatedAt: new Date().toISOString(),
    timezone: DAY_TZ,
    sessions,
    requests: total.requests,
    searchRequests,
    searchCostUsd: searchCost,
    usdCny,
    unpriced: [...unpriced.values()].sort((a, b) => b.requests - a.requests),
    days: sorted(byDay),
    hours: sorted(byHour),
    models: sorted(byModel),
    hoursByModel: Object.fromEntries([...hoursByModel].map(([m, map]) => [m, sorted(map)])),
    daysByModel: Object.fromEntries([...daysByModel].map(([m, map]) => [m, sorted(map)])),
    providers: sorted(byProvider),
    total: { ...total, cost: total.cost + searchCost },
  };
}

// ── HTTP ───────────────────────────────────────────────────────────────────
export const name = "dsh-usage-report";
export const inject = ["webServer", "connection"];

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function apply(ctx) {
  const admit = (req, res) => {
    let admission;
    try {
      admission = ctx.connection.admit(req);
    } catch {
      admission = { rejection: 401 };
    }
    if ("rejection" in admission) {
      res.writeHead(admission.rejection);
      res.end(admission.rejection === 401 ? "unauthorized" : "forbidden");
      return false;
    }
    return true;
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: SUMMARY_ROUTE,
        handler: async (req, res) => {
          if (!admit(req, res)) return;
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405);
            res.end();
            return;
          }
          try {
            const body = JSON.stringify(await collectUsage());
            res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
            res.end(req.method === "HEAD" ? undefined : body);
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
          }
        },
      }),
    "dsh-usage: summary route",
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: PRICES_ROUTE,
        handler: async (req, res) => {
          if (!admit(req, res)) return;
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end();
            return;
          }
          try {
            const payload = JSON.parse(await readBody(req));
            const model = typeof payload.model === "string" ? payload.model.trim() : "";
            const provider = typeof payload.provider === "string" ? payload.provider.trim() : "";
            if (model === "") throw new Error("model is required");
            const store = loadStore();
            if (payload.clear === true) {
              if (provider !== "" && store.providers?.[provider]?.models) delete store.providers[provider].models[model];
              if (store.models) delete store.models[model];
              saveStore(store);
              sendJson(res, 200, { ok: true, store });
              return;
            }
            const price = normalizePrice(payload);
            if (price === null) throw new Error("miss (input, cache-miss) and out (output) prices are required");
            const scoped = {
              hitPeak: price.hitPeak, hitOff: price.hitOff,
              missPeak: price.missPeak, missOff: price.missOff,
              outPeak: price.outPeak, outOff: price.outOff,
            };
            if (provider !== "") {
              store.providers ??= {};
              store.providers[provider] ??= {};
              store.providers[provider].models ??= {};
              store.providers[provider].models[model] = scoped;
            } else {
              store.models ??= {};
              store.models[model] = scoped;
            }
            saveStore(store);
            sendJson(res, 200, { ok: true, store });
          } catch (error) {
            sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
          }
        },
      }),
    "dsh-usage: prices route",
  );
}
