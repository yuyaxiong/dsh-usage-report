/**
 * tracker.js — 采集旁路模型调用的 usage，让「审查 / 对话」能分开统计。
 *
 * 旁路 = 自动审查（purpose "auto-review"）、会话标题（"session-title"）、
 * 上下文压缩（"compaction"）。它们都走 ctx.llm.stream()，但不写
 * assistant/message，所以日志里原本一条 token 记录都没有。
 *
 * 主对话不在这里记：它已有 assistant/message.usage 这条耐久记录，
 * 再记一次会让统计翻倍。
 *
 * 双通道落盘（自动选，不用配置）：
 *   A. 能解析到 @deepseek-ai/dsh-session → appendPluginRecord 写进会话日志本身。
 *   B. 解析不到 → 追加到 $DSH_HOME/storages/usage/ledger.jsonl。
 * 一次调用只写一处，不会重复计数。usage-by-purpose.mjs 两个都读。
 *
 * 为什么不能直接 import：插件装在 ~/.dsh/profiles/web 下，那里的
 * node_modules 不一定有 @deepseek-ai/dsh-session。静态 import 会在加载
 * 阶段就抛 ERR_MODULE_NOT_FOUND，把整个插件带崩。所以用动态 import + 兜底。
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

/** 会话日志里的记录类型（通道 A）。 */
export const USAGE_RECORD_TYPE = "plugin:dsh-usage/llm-call";
/** 没带 purpose 的旁路调用归到这里。 */
export const FALLBACK_PURPOSE = "other";

const dshHome = () => process.env.DSH_HOME ?? join(homedir(), ".dsh");
/** 通道 B 的账本路径。 */
export const ledgerPath = () => join(dshHome(), "storages", "usage", "ledger.jsonl");

/** 探测哪个通道可用。失败的模块保持 undefined，由兜底逻辑接手。 */
const sink = { appendPluginRecord: undefined, isAgentLoopRequest: undefined, mode: "file" };

async function detectSink() {
  try {
    const session = await import("@deepseek-ai/dsh-session");
    if (typeof session.appendPluginRecord === "function") {
      sink.appendPluginRecord = session.appendPluginRecord;
      sink.mode = "journal";
    }
  } catch {
    // 保持 file 模式
  }
  try {
    const llm = await import("@deepseek-ai/dsh-llm");
    if (typeof llm.isAgentLoopRequest === "function") sink.isAgentLoopRequest = llm.isAgentLoopRequest;
  } catch {
    // 回落到 purpose === undefined 判据
  }
}

/**
 * 原样透传 chunk 流，结束后把最后一块 usage 交给回调。
 * 不缓存 chunk、不 await IO，避免拖慢首 token。
 */
async function* tapUsage(stream, onUsage) {
  let usage;
  let reported = false;
  try {
    for await (const chunk of stream) {
      if (chunk !== null && typeof chunk === "object" && chunk.type === "usage") usage = chunk.usage;
      yield chunk;
    }
  } finally {
    if (!reported && usage !== undefined && usage !== null) {
      reported = true;
      onUsage(usage);
    }
  }
}

/** 取本次调用的 purpose，缺省归到 other。 */
function purposeOf(options) {
  const purpose = options?.purpose;
  return typeof purpose === "string" && purpose.length > 0 ? purpose : FALLBACK_PURPOSE;
}

/** 是不是主对话请求。dsh-llm 可用时用官方判据，否则退回"没设 purpose 即主对话"。 */
function isMainRequest(options) {
  if (sink.isAgentLoopRequest !== undefined) return sink.isAgentLoopRequest(options);
  return options?.purpose === undefined;
}

/** 收窄 usage，避免把适配器额外字段写进日志。 */
function usageFields(usage) {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

/** 通道 B：一行一条 JSON，崩溃只丢最后一行。 */
function appendLedger(row) {
  const path = ledgerPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(row)}\n`);
  } catch {
    // 记账失败不影响主流程
  }
}

/**
 * 安装旁路用量采集。
 * @param ctx - 插件上下文，需要 `sessions` 服务。
 */
export function installUsageTracker(ctx) {
  void detectSink();

  const handler = (options, next) => {
    const stream = next();
    if (isMainRequest(options)) return stream;

    const session = options?.sessionId === void 0 ? undefined : ctx.sessions.get(options.sessionId);
    const purpose = purposeOf(options);
    const provider = typeof options?.provider === "string" ? options.provider : "unknown";
    const model = typeof options?.model === "string" ? options.model : "unknown";
    const sessionId = typeof options?.sessionId === "string" ? options.sessionId : undefined;

    return tapUsage(stream, (usage) => {
      const fields = usageFields(usage);
      if (sink.mode === "journal" && session !== undefined && sink.appendPluginRecord !== undefined) {
        try {
          sink.appendPluginRecord(session, USAGE_RECORD_TYPE, { purpose, provider, model, usage: fields });
          return;
        } catch {
          // 落到通道 B
        }
      }
      appendLedger({ at: Date.now(), purpose, provider, model, sessionId, usage: fields });
    });
  };

  ctx.effect(() => ctx.on("llm/stream", handler, { global: true }), "dsh-usage: bypass usage tracker");
}
