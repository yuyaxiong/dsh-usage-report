# @yuyaxiong/dsh-usage-report

Token usage and cost dashboard for [DeepSeek Harness](https://www.deepseek.com/en/harness/), as a DSH bundle.

Every model call costs tokens, but a session log only records the conversation. This plugin
adds a **Settings → Usage** page that shows where the money went:

- cost / request / token cards for a chosen range,
- an hourly bar chart for a single day, daily charts for longer ranges,
- per-model panels with request and token charts,
- **a per-purpose split** that separates conversation from auto review, session titles and compaction,
- a custom date range picker and CSV export,
- a manual price form for models outside the built-in table.

## The purpose split

Auto review, session titles and compaction call the model through the same route as the
conversation, but they never write an `assistant/message` into the session log. Their tokens
are therefore invisible to any log-based accounting — including this plugin's own charts,
before 0.2.0.

The plugin now installs an `llm/stream` listener (`lib/tracker.js`). It passes chunks through
untouched and, when a call finishes, records the reported `usage` together with the call's
`purpose`:

| purpose | source |
| --- | --- |
| `conversation` | the agent loop; already durable as `assistant/message.usage` |
| `auto-review` | `dsh-experimental-auto-review` |
| `session-title` | `dsh-session-title-llm` |
| `compaction` | `dsh-compaction-basic` |
| `other` | any side call without a `purpose` |

The conversation is **not** recorded twice: the tracker skips requests that
`isAgentLoopRequest()` marks as loop-built, so the existing `assistant/message` record stays
the single source for conversation cost.

### Where the records go

1. **Session log (preferred).** When `@deepseek-ai/dsh-session` resolves, each side call becomes
   a `plugin:dsh-usage/llm-call` record. It is an ignorable event: it never enters the
   model-visible surface, and fork and resume carry it along.
2. **Local ledger (fallback).** When that module does not resolve — a profile is free not to
   install it — records are appended to `$DSH_HOME/storages/usage/ledger.jsonl` instead.

A call is written to exactly one place, so nothing is counted twice. When a session already
has side-call records, its `compaction/summary` usage is ignored: the tracker already covered it.

## Install

```bash
npm install -g @yuyaxiong/dsh-usage-report   # or let `dsh plugin` do it
dsh plugin --profile web add @yuyaxiong/dsh-usage-report
```

Then list the package in `dsh.profile.bundles` of your profile's `package.json`
(a plugin-market index does both steps for you).

Restart the host after install. The usage page appears under **Settings → Usage**.

## Pricing

Costs are estimated, not billed. The built-in table follows
[DeepSeek's published prices](https://api-docs.deepseek.com/quick_start/pricing),
including peak/off-peak hours:

| per 1M tokens | deepseek-flash off/peak | deepseek-v4-pro off/peak |
| --- | --- | --- |
| input (cache hit) | $0.003 / $0.006 | $0.022 / $0.044 |
| input (cache miss) | $0.15 / $0.30 | $0.66 / $1.32 |
| output | $0.60 / $1.20 | $1.98 / $3.96 |

Override anything in `$DSH_HOME/storages/usage/prices.json`:

```json
{
  "usdCny": 7.1,
  "tiers": { "flash": { "hitPeak": 0.006, "hitOff": 0.003, "missPeak": 0.3, "missOff": 0.15, "outPeak": 1.2, "outOff": 0.6 } },
  "models": { "my-model": { "missPeak": 0.5, "outPeak": 2 } },
  "providers": { "my-gateway": { "models": { "gw-model": { "missPeak": 0.5, "outPeak": 2 } } } }
}
```

Resolution order: `providers[provider].models[model]` → `providers[provider].default`
→ `models[model]` → built-in tier. A model that resolves to none is **unpriced**: its tokens
are counted, its cost is excluded, and the page asks you for a price.

Web search calls are billed separately ($0.75 / 1000 successful requests) and counted on their own.

## Known limits

- Records start when the plugin first runs. Calls made before that are gone — the model did
  not write them anywhere.
- A stream that ends without a `usage` chunk (network abort, provider error) is not recorded.
  The purpose split therefore counts completed calls only.
- Session logs record `provider` and `model` but **not** `base_url` and not which credential
  paid, so two routes of the same adapter cannot be told apart after the fact. Give each route
  its own provider if you need them separate.
- The purpose split follows the date range. It ignores the model filter, because the tracker
  records one purpose per call, not a purpose × model grid.
- `nodeLinker: hoisted` profiles copy plugin files on install. After editing the source under
  `~/.dsh/profiles/<name>/node_modules/`, run the install again.

## License

MIT
