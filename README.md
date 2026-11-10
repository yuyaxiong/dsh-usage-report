# dsh-usage-report

Global token usage and cost dashboard for [DeepSeek Harness](https://www.deepseek.com/en/harness/), as a DSH bundle.

Every assistant message in a DSH session log carries its provider-reported `usage`
(input / cache-hit / output tokens). This plugin reads **all** sessions in `$DSH_HOME/sessions`,
aggregates them, and adds a **Settings → Usage** page with:

- cost / request / token cards for a chosen range,
- an hourly bar chart for a single day and daily charts for longer ranges,
- per-model panels with request and token charts,
- a custom date range picker,
- CSV export of the filtered range,
- a manual price entry form for models that are not in the built-in price list.

## Install

```bash
dsh plugin --profile web add dsh-usage-report
```

Then add `dsh-usage-report` to `dsh.profile.bundles` in your profile's `package.json`
(or install it from a plugin-market index, which does both).

## Pricing

Costs are estimated, not billed. The built-in table follows
[DeepSeek's published prices](https://api-docs.deepseek.com/quick_start/pricing),
including peak/off-peak hours:

| per 1M tokens | deepseek-flash off/peak | deepseek-v4-pro off/peak |
| --- | --- | --- |
| input (cache hit) | $0.003 / $0.006 | $0.022 / $0.044 |
| input (cache miss) | $0.15 / $0.30 | $0.66 / $1.32 |
| output | $0.60 / $1.20 | $1.98 / $3.96 |

Everything is overridable in `$DSH_HOME/storages/usage/prices.json`:

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
are counted, its cost is excluded, and the Settings page asks you for a price.

Web search calls are billed separately by DeepSeek ($0.75 / 1000 successful requests)
and are counted on their own.

## Known limits

- Session logs record `provider` and `model` but **not** `base_url` and not which
  credential paid, so two routes of the same adapter cannot be told apart after the fact.
  Give each route its own provider (custom adapter) if you need them separate.
- Costs include only model usage and search requests; image tokens and any provider-side
  fees not represented in `usage` are not counted.

## License

MIT
