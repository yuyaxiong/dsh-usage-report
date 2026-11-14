window.__ModuleLoader__.load({
	id: "@yuyaxiong/dsh-usage-report",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;

		const SUMMARY_ROUTE = "/plugins/dsh-usage/summary";
		const PRICES_ROUTE = "/plugins/dsh-usage/prices";
		const NS = "settings.usage";

		const zh = {
			nav: "用量",
			title: "用量与费用",
			range: "时间维度",
			rangeToday: "今天",
			rangeWeek: "近 7 天",
			rangeAll: "全部",
			rangeCustom: "自定义",
			fromLabel: "起始",
			toLabel: "结束",
			modelFilter: "模型",
			all: "全部",
			clear: "清除筛选条件",
			exportCsv: "导出",
			cardCost: "消费金额",
			cardRequests: "API 请求次数",
			cardTokens: "Tokens",
			costTitle: "消费金额（CNY）",
			requestsTitle: "API 请求次数",
			tokensTitle: "Tokens",
			byHour: "按小时",
			byDayLabel: "按天",
			cacheHit: "缓存命中",
			hitRate: "缓存命中率",
			loading: "统计中…",
			failed: "读取失败",
			retry: "重试",
			empty: "这个区间没有用量记录。",
			unpriced: "未定价的模型",
			unpricedHint: "这些模型不在内置价目表里，费用未计入。填单价（每 1M tokens，美元）后按新价格重算。",
			priceHit: "缓存命中输入",
			priceMiss: "未命中输入",
			priceOut: "输出",
			save: "保存",
			saving: "保存中…",
			unpricedRequests: "次请求未计价",
			purposeTitle: "按用途拆分",
			purposeConversation: "对话",
			purposeReview: "自动审查",
			purposeSessionTitle: "会话标题",
			purposeCompaction: "上下文压缩",
			purposeOther: "其它",
			purposeRequests: "请求",
			reviewRatio: "审查 ÷ 对话",
			purposeModelNote: "模型筛选不作用于此栏",
			purposeNoData: "这段时间还没有旁路调用记录。",
			fx: "汇率",
			note: "会话日志只记录 provider 与 model，不记录 base_url 与凭据；不同 base_url 的同名路由需要在适配器层区分。",
		};
		const en = {
			nav: "Usage",
			title: "Usage and cost",
			range: "Range",
			rangeToday: "Today",
			rangeWeek: "Last 7 days",
			rangeAll: "All time",
			rangeCustom: "Custom",
			fromLabel: "From",
			toLabel: "To",
			modelFilter: "Model",
			all: "All",
			clear: "Clear filters",
			exportCsv: "Export",
			cardCost: "Cost",
			cardRequests: "API requests",
			cardTokens: "Tokens",
			costTitle: "Cost (CNY)",
			requestsTitle: "API requests",
			tokensTitle: "Tokens",
			byHour: "Hourly",
			byDayLabel: "Daily",
			cacheHit: "Cache hit",
			hitRate: "Cache hit rate",
			loading: "Computing…",
			failed: "Failed to load",
			retry: "Retry",
			empty: "No usage in this range.",
			unpriced: "Unpriced models",
			unpricedHint: "Absent from the built-in price list, so their cost is excluded. Enter prices per 1M tokens (USD).",
			priceHit: "Input (cache hit)",
			priceMiss: "Input (cache miss)",
			priceOut: "Output",
			save: "Save",
			saving: "Saving…",
			unpricedRequests: "unpriced requests",
			purposeTitle: "By purpose",
			purposeConversation: "Conversation",
			purposeReview: "Auto review",
			purposeSessionTitle: "Session title",
			purposeCompaction: "Compaction",
			purposeOther: "Other",
			purposeRequests: "req",
			reviewRatio: "Review ÷ conversation",
			purposeModelNote: "Model filter does not apply here",
			purposeNoData: "No side-channel calls in this range yet.",
			fx: "Rate",
			note: "Session logs record provider and model only — not base_url or credential.",
		};

		// ── 格式化 ──────────────────────────────────────────────────────────
		const nf = new Intl.NumberFormat("en-US");
		const fmtInt = (v) => nf.format(Math.round(v ?? 0));
		const fmtTokens = (v) => {
			const n = v ?? 0;
			if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
			if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
			if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
			return String(Math.round(n));
		};
		const fmtUsd = (v) => `$${(v ?? 0).toFixed(4)}`;
		const fmtCny = (v, rate) => `¥${((v ?? 0) * (rate ?? 7.1)).toFixed(2)}`;
		const pad2 = (n) => String(n).padStart(2, "0");

		const C = {
			text: "var(--dsw-alias-label-primary, #1f2329)",
			muted: "var(--dsw-alias-label-tertiary, #8a9099)",
			border: "var(--dsw-alias-border-l2, rgba(127,127,127,.2))",
			cardFill: "var(--dsw-alias-settings-card-fill, rgba(127,127,127,.06))",
			cardStroke: "var(--dsw-alias-settings-card-stroke, rgba(127,127,127,.24))",
			cost: "#f59e0b",
			requests: "#5b8def",
			tokens: "#9ec1f7",
			primary: "var(--dsw-alias-state-business-primary, #4d6bfe)",
		};

		/** 用途配色。顺序即默认图例顺序。 */
		const PURPOSE_COLOR = {
			conversation: "#5b8def",
			"auto-review": "#e0564a",
			"session-title": "#8b7bd8",
			compaction: "#4aa3a3",
			other: "#9aa0a6",
		};

		const S = {
			section: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px", fontSize: "13px", lineHeight: "20px", color: C.text },
			h1: { margin: 0, fontSize: "16px", lineHeight: "24px", fontWeight: 500 },
			muted: { color: C.muted, margin: 0, fontSize: "12px", lineHeight: "18px" },
			filters: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" },
			select: {
				appearance: "none",
				WebkitAppearance: "none",
				border: `.5px solid ${C.border}`,
				borderRadius: "8px",
				height: "28px",
				width: "160px",
				padding: "0 26px 0 9px",
				background: "transparent",
				color: "inherit",
				font: "inherit",
				cursor: "pointer",
				backgroundImage: `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#81858C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}")`,
				backgroundRepeat: "no-repeat",
				backgroundPosition: "right 8px center",
				backgroundSize: "12px 12px",
			},
			dateInput: {
				border: `.5px solid ${C.border}`,
				borderRadius: "8px",
				height: "28px",
				padding: "0 8px",
				background: "transparent",
				color: "inherit",
				font: "inherit",
				cursor: "pointer",
			},
			segment: { display: "inline-flex", border: `.5px solid ${C.border}`, borderRadius: "8px", overflow: "hidden" },
			segmentButton: {
				border: "none",
				background: "transparent",
				color: C.muted,
				font: "inherit",
				cursor: "pointer",
				padding: "4px 10px",
				height: "28px",
				lineHeight: "20px",
			},
			segmentActive: {
				background: "var(--dsw-alias-interactive-bg-hover-solid, rgba(127,127,127,.16))",
				color: C.text,
				fontWeight: 500,
			},
			linkButton: {
				border: "none",
				background: "transparent",
				color: C.muted,
				font: "inherit",
				cursor: "pointer",
				padding: "4px 6px",
				textDecoration: "underline",
				textUnderlineOffset: "3px",
			},
			primaryButton: {
				border: "none",
				borderRadius: "8px",
				background: "var(--dsw-alias-button-primary-fill, #0f1114)",
				color: "var(--dsw-alias-label-primary-foreground, #fff)",
				font: "inherit",
				cursor: "pointer",
				padding: "6px 16px",
				marginLeft: "auto",
			},
			cards: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" },
			card: {
				border: `.5px solid ${C.cardStroke}`,
				background: C.cardFill,
				borderRadius: "12px",
				padding: "14px 16px",
				display: "flex",
				flexDirection: "column",
				gap: "8px",
			},
			cardLabel: { color: C.muted, fontSize: "12px" },
			cardBig: { fontSize: "22px", lineHeight: "28px", fontWeight: 600, letterSpacing: "-.01em", whiteSpace: "nowrap" },
			cardUnit: { fontSize: "12px", color: C.muted, marginLeft: "4px" },
			panel: {
				border: `.5px solid ${C.cardStroke}`,
				background: C.cardFill,
				borderRadius: "12px",
				padding: "14px 16px",
				display: "flex",
				flexDirection: "column",
				gap: "10px",
				position: "relative",
			},
			panelHead: { display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" },
			panelTitle: { fontSize: "13px", fontWeight: 500 },
			panelValue: { fontSize: "13px", color: C.muted },
			modelHead: { fontSize: "13px", fontWeight: 600, margin: "4px 0 0" },
			modelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" },
			chartWrap: { position: "relative" },
			tooltip: {
				position: "absolute",
				transform: "translate(-50%, -100%)",
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				border: `.5px solid ${C.cardStroke}`,
				borderRadius: "8px",
				boxShadow: "0 4px 14px rgba(0,0,0,.12)",
				padding: "4px 8px",
				fontSize: "11px",
				lineHeight: "16px",
				pointerEvents: "none",
				whiteSpace: "nowrap",
				zIndex: 2,
			},
			input: {
				width: "92px",
				border: `.5px solid ${C.border}`,
				borderRadius: "8px",
				background: "transparent",
				color: "inherit",
				font: "inherit",
				padding: "4px 8px",
			},
			unpricedRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", borderTop: `.5px solid ${C.border}`, paddingTop: "10px" },
			field: { display: "flex", flexDirection: "column", gap: "2px" },
			code: { fontFamily: "var(--ds-font-family-code, monospace)", fontSize: "12px" },
			smallButton: {
				border: `.5px solid ${C.border}`,
				borderRadius: "8px",
				background: "transparent",
				color: "inherit",
				font: "inherit",
				cursor: "pointer",
				padding: "4px 12px",
			},
			purposeBar: { display: "flex", height: "10px", borderRadius: "6px", overflow: "hidden", background: "rgba(127,127,127,.16)" },
			purposeList: { display: "flex", flexDirection: "column", gap: "6px" },
			purposeRow: { display: "grid", gridTemplateColumns: "minmax(96px, 1fr) 84px 88px 88px 56px", alignItems: "center", gap: "8px", fontSize: "12px" },
			purposeName: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
			purposeDot: { width: "8px", height: "8px", borderRadius: "2px", flex: "0 0 auto" },
			purposeNum: { textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.text },
			purposeNumMuted: { textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted },
		};

		// ── SVG 图表 ────────────────────────────────────────────────────────
		const CHART_W = 600;
		const CHART_H = 160;
		const PAD = { top: 10, right: 8, bottom: 18, left: 44 };

		function niceMax(value) {
			if (value <= 0) return 1;
			const exp = Math.floor(Math.log10(value));
			const base = 10 ** exp;
			const scaled = value / base;
			const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
			return step * base;
		}

		function Chart({ series, kind, color, format, hovered, onHover, width }) {
			if (series.length === 0) return h("div", { style: { padding: "28px 0", textAlign: "center", color: C.muted, fontSize: 11 } }, "—");
			const values = series.map((point) => point.value);
			const max = niceMax(Math.max(...values, 0));
			const W = width === undefined ? CHART_W : width;
			const plotW = W - PAD.left - PAD.right;
			const plotH = CHART_H - PAD.top - PAD.bottom;
			const step = series.length === 0 ? plotW : plotW / series.length;
			const y = (value) => PAD.top + plotH - (value / max) * plotH;
			const x = (index) => PAD.left + index * step;

			const grid = [0, 0.5, 1].map((ratio) => {
				const value = max * ratio;
				return h(
					"g",
					{ key: `g${ratio}` },
					h("line", {
						x1: PAD.left,
						x2: W - PAD.right,
						y1: y(value),
						y2: y(value),
						stroke: C.border,
						strokeWidth: 1,
					}),
					h(
						"text",
						{ x: PAD.left - 6, y: y(value) + 3, textAnchor: "end", fontSize: 11, fill: C.muted },
						format(value),
					),
				);
			});

			const every = Math.max(1, Math.ceil(series.length / 6));
			const labels = series.map((point, index) =>
				index % every === 0 || index === series.length - 1
					? h(
							"text",
							{ key: `l${index}`, x: x(index) + step / 2, y: CHART_H - 4, textAnchor: "middle", fontSize: 11, fill: C.muted },
							point.label,
						)
					: null,
			);

			let shape = null;
			if (kind === "bar") {
				const barW = Math.max(2, step * 0.6);
				shape = series.map((point, index) =>
					h("rect", {
						key: `b${index}`,
						x: x(index) + (step - barW) / 2,
						y: y(point.value),
						width: barW,
						height: Math.max(0, PAD.top + plotH - y(point.value)),
						rx: 2,
						fill: color,
						opacity: hovered === undefined || hovered === index ? 1 : 0.45,
					}),
				);
			} else {
				const points = series.map((point, index) => `${x(index) + step / 2},${y(point.value)}`);
				const baseline = PAD.top + plotH;
				shape = [
					h("path", {
						key: "area",
						d: `M${x(0) + step / 2},${baseline} L${points.join(" L")} L${x(series.length - 1) + step / 2},${baseline} Z`,
						fill: color,
						opacity: 0.35,
					}),
					h("path", { key: "line", d: `M${points.join(" L")}`, fill: "none", stroke: color, strokeWidth: 1.6, strokeLinejoin: "round" }),
				];
			}

			const hits = onHover
				? series.map((point, index) =>
						h("rect", {
							key: `h${index}`,
							x: x(index),
							y: PAD.top,
							width: step,
							height: plotH,
							fill: "transparent",
							onMouseEnter: () => onHover(index, point),
							onMouseLeave: () => onHover(undefined),
						}),
					)
				: null;

			return h(
				"svg",
				{ viewBox: `0 0 ${W} ${CHART_H}`, style: { width: "100%", height: "auto", display: "block" }, role: "img" },
				grid,
				shape,
				labels,
				hits,
			);
		}

		// ── 数据切片 ────────────────────────────────────────────────────────
		const emptyBucket = { input: 0, hit: 0, out: 0, cost: 0, requests: 0, unpricedRequests: 0 };
		const pick = (bucket) => (bucket === undefined ? emptyBucket : bucket);

		function buildSlots(data, range, model, from, to) {
			const hoursMap = model ? data.hoursByModel?.[model] ?? {} : data.hours ?? {};
			const daysMap = model ? data.daysByModel?.[model] ?? {} : data.days ?? {};
			const allDays = Object.keys(daysMap).sort();
			const hourSlots = (day) =>
				Array.from({ length: 24 }, (_, hour) => ({
					label: `${pad2(hour)}:00`,
					bucket: pick(hoursMap[`${day}T${pad2(hour)}`]),
				}));
			if (range === "custom") {
				const days = allDays.filter((day) => (from === "" || day >= from) && (to === "" || day <= to));
				if (days.length === 1) return { granularity: "hour", slots: hourSlots(days[0]) };
				return { granularity: "day", slots: days.map((day) => ({ label: day.slice(5), bucket: pick(daysMap[day]) })) };
			}
			if (range === "today") {
				const day = allDays[allDays.length - 1] ?? new Date().toISOString().slice(0, 10);
				return { granularity: "hour", slots: hourSlots(day) };
			}
			let days = allDays;
			if (range === "week") {
				const cutoff = new Date();
				cutoff.setDate(cutoff.getDate() - 6);
				const from = cutoff.toISOString().slice(0, 10);
				days = days.filter((day) => day >= from);
				if (days.length === 0) days = allDays.slice(-7);
			}
			return { granularity: "day", slots: days.map((day) => ({ label: day.slice(5), bucket: pick(daysMap[day]) })) };
		}

		const sumSlots = (slots) =>
			slots.reduce(
				(acc, slot) => ({
					input: acc.input + slot.bucket.input,
					hit: acc.hit + slot.bucket.hit,
					out: acc.out + slot.bucket.out,
					cost: acc.cost + slot.bucket.cost,
					requests: acc.requests + slot.bucket.requests,
					unpricedRequests: acc.unpricedRequests + (slot.bucket.unpricedRequests ?? 0),
				}),
				{ input: 0, hit: 0, out: 0, cost: 0, requests: 0, unpricedRequests: 0 },
			);

		// ── 按用途拆分 ──────────────────────────────────────────────────────
		const PURPOSE_ORDER = ["conversation", "auto-review", "session-title", "compaction"];

		/** purpose → 本地化名称。未知 purpose 原样显示。 */
		function purposeLabel(t, key) {
			if (key === "conversation") return t("purposeConversation");
			if (key === "auto-review") return t("purposeReview");
			if (key === "session-title") return t("purposeSessionTitle");
			if (key === "compaction") return t("purposeCompaction");
			if (key === "other") return t("purposeOther");
			return key;
		}

		/** 当前时间区间覆盖的日期，规则与 buildSlots 一致。 */
		function dayWindow(data, range, from, to) {
			const allDays = Object.keys(data.days ?? {}).sort();
			if (range === "custom") return allDays.filter((day) => (from === "" || day >= from) && (to === "" || day <= to));
			if (range === "today") {
				const day = allDays[allDays.length - 1];
				return day === undefined ? [] : [day];
			}
			if (range === "week") {
				const cutoff = new Date();
				cutoff.setDate(cutoff.getDate() - 6);
				const since = cutoff.toISOString().slice(0, 10);
				const days = allDays.filter((day) => day >= since);
				return days.length === 0 ? allDays.slice(-7) : days;
			}
			return allDays;
		}

		/** 按用途汇总当前区间，按费用从高到低排序。 */
		function purposeTotals(data, range, from, to) {
			const days = dayWindow(data, range, from, to);
			const source = data.daysByPurpose ?? {};
			const keys = [...PURPOSE_ORDER, ...Object.keys(source).filter((key) => !PURPOSE_ORDER.includes(key))];
			const out = [];
			for (const purpose of keys) {
				const perDay = source[purpose];
				if (perDay === undefined) continue;
				let bucket = { input: 0, hit: 0, out: 0, cost: 0, requests: 0 };
				for (const day of days) {
					const value = perDay[day];
					if (value === undefined) continue;
					bucket = {
						input: bucket.input + value.input,
						hit: bucket.hit + value.hit,
						out: bucket.out + value.out,
						cost: bucket.cost + value.cost,
						requests: bucket.requests + value.requests,
					};
				}
				if (bucket.requests === 0) continue;
				out.push({ purpose, bucket });
			}
			return out.sort((a, b) => b.bucket.cost - a.bucket.cost);
		}

		function UsageSection(props) {
			const t = (props && props.t) || ((key) => zh[key] ?? key);
			const [state, setState] = react.useState({ status: "loading" });
			const [range, setRange] = react.useState("today");
			const [from, setFrom] = react.useState("");
			const [to, setTo] = react.useState("");
			const [model, setModel] = react.useState("");
			const [hover, setHover] = react.useState();
			const [drafts, setDrafts] = react.useState({});
			const [savingKey, setSavingKey] = react.useState("");
			const [saveError, setSaveError] = react.useState("");

			const load = react.useCallback(() => {
				setState({ status: "loading" });
				fetch(SUMMARY_ROUTE, { credentials: "same-origin" })
					.then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
					.then((data) => setState({ status: "ready", data }))
					.catch((error) => setState({ status: "error", message: String((error && error.message) || error) }));
			}, []);
			react.useEffect(load, [load]);

			const save = (item) => {
				const key = `${item.provider}\u0000${item.model}`;
				const draft = drafts[key] ?? {};
				setSavingKey(key);
				setSaveError("");
				fetch(PRICES_ROUTE, {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						provider: item.provider,
						model: item.model,
						hit: draft.hit === undefined || draft.hit === "" ? undefined : Number(draft.hit),
						miss: draft.miss === undefined || draft.miss === "" ? undefined : Number(draft.miss),
						out: draft.out === undefined || draft.out === "" ? undefined : Number(draft.out),
					}),
				})
					.then((response) => (response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error ?? `HTTP ${response.status}`)))))
					.then(() => {
						setSavingKey("");
						setDrafts((current) => {
							const next = { ...current };
							delete next[key];
							return next;
						});
						load();
					})
					.catch((error) => {
						setSavingKey("");
						setSaveError(String((error && error.message) || error));
					});
			};

			const setField = (key, field, value) =>
				setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? {}), [field]: value } }));

			if (state.status === "loading") return h("div", { style: S.section }, h("p", { style: S.muted }, t("loading")));
			if (state.status === "error")
				return h(
					"div",
					{ style: S.section },
					h("p", { style: S.muted }, `${t("failed")}: ${state.message}`),
					h("button", { type: "button", style: S.smallButton, onClick: load }, t("retry")),
				);

			const data = state.data;
			const rate = data.usdCny ?? 7.1;
			const models = Object.keys(data.models ?? {});
			const activeModel = models.includes(model) ? model : "";
			const { granularity, slots } = buildSlots(data, range, activeModel, from, to);
			const totals = sumSlots(slots);
			const tokensTotal = totals.input + totals.hit + totals.out;
			const hitRate = totals.input + totals.hit === 0 ? 0 : (totals.hit / (totals.input + totals.hit)) * 100;

			const costSeries = slots.map((slot) => ({ label: slot.label, value: slot.bucket.cost * rate }));
			const requestSeries = slots.map((slot) => ({ label: slot.label, value: slot.bucket.requests }));
			const tokenSeries = slots.map((slot) => ({ label: slot.label, value: slot.bucket.input + slot.bucket.hit + slot.bucket.out }));

			const exportCsv = () => {
				const inRange = (day) => {
					if (range === "custom") return (from === "" || day >= from) && (to === "" || day <= to);
					if (range === "today") return day === (allDays[allDays.length - 1] ?? day);
					if (range === "week") {
						const cutoff = new Date();
						cutoff.setDate(cutoff.getDate() - 6);
						return day >= cutoff.toISOString().slice(0, 10);
					}
					return true;
				};
				const lines = ["day,model,requests,input,cache_hit,output,cost_usd"];
				for (const [day, bucket] of Object.entries(data.days ?? {}).sort()) {
					if (!inRange(day)) continue;
					lines.push(`${day},all,${bucket.requests},${bucket.input},${bucket.hit},${bucket.out},${bucket.cost.toFixed(6)}`);
				}
				for (const [name, byDay] of Object.entries(data.daysByModel ?? {})) {
					for (const [day, bucket] of Object.entries(byDay).sort()) {
						if (!inRange(day)) continue;
						lines.push(`${day},${name},${bucket.requests},${bucket.input},${bucket.hit},${bucket.out},${bucket.cost.toFixed(6)}`);
					}
				}
				const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = `dsh-usage-${new Date().toISOString().slice(0, 10)}.csv`;
				anchor.click();
				URL.revokeObjectURL(url);
			};

			const selectStyle = S.select;
			const fieldGroup = (label, control) =>
				h("div", { style: { display: "inline-flex", alignItems: "center", gap: "8px" } }, h("span", { style: S.muted }, label), control);
			const allDays = Object.keys(data.days ?? {}).sort();
			const earliest = allDays[0] ?? "";
			const latest = allDays[allDays.length - 1] ?? "";
			const pickRange = (value) => {
				setRange(value);
				setHover(undefined);
				if (value === "custom" && from === "" && to === "") {
					setFrom(earliest);
					setTo(latest);
				}
			};
			const rangeOptions = [["today", t("rangeToday")], ["week", t("rangeWeek")], ["all", t("rangeAll")], ["custom", t("rangeCustom")]];
			const filters = h(
				"div",
				{ style: S.filters },
				fieldGroup(
					t("range"),
					h(
						"div",
						{ style: S.segment, role: "group", "aria-label": t("range") },
						...rangeOptions.map(([value, label]) =>
							h(
								"button",
								{
									key: value,
									type: "button",
									style: range === value ? { ...S.segmentButton, ...S.segmentActive } : S.segmentButton,
									onClick: () => pickRange(value),
								},
								label,
							),
						),
					),
				),
				fieldGroup(
					t("modelFilter"),
					h(
						"select",
						{ style: selectStyle, value: activeModel, onChange: (event) => { setModel(event.target.value); setHover(undefined); } },
						h("option", { value: "" }, t("all")),
						...models.map((name) => h("option", { key: name, value: name }, name)),
					),
				),
				range === "custom"
					? fieldGroup(
							t("fromLabel"),
							h("input", {
								type: "date",
								style: S.dateInput,
								value: from,
								max: to || undefined,
								onChange: (event) => { setFrom(event.target.value); setHover(undefined); },
							}),
						)
					: null,
				range === "custom"
					? fieldGroup(
							t("toLabel"),
							h("input", {
								type: "date",
								style: S.dateInput,
								value: to,
								min: from || undefined,
								onChange: (event) => { setTo(event.target.value); setHover(undefined); },
							}),
						)
					: null,
				h("button", { type: "button", style: S.linkButton, onClick: () => { setRange("today"); setModel(""); setFrom(""); setTo(""); } }, t("clear")),
				h("button", { type: "button", style: S.primaryButton, onClick: exportCsv }, t("exportCsv")),
			);

			const cards = h(
				"div",
				{ style: S.cards },
				h(
					"div",
					{ style: S.card },
					h("span", { style: S.cardLabel }, t("cardCost")),
					h("span", { style: S.cardBig }, fmtCny(totals.cost, rate), h("span", { style: S.cardUnit }, "CNY")),
					h("span", { style: S.cardLabel }, fmtUsd(totals.cost)),
				),
				h(
					"div",
					{ style: S.card },
					h("span", { style: S.cardLabel }, t("cardRequests")),
					h("span", { style: S.cardBig }, fmtInt(totals.requests)),
					h("span", { style: S.cardLabel }, `${t("hitRate")} ${hitRate.toFixed(1)}%`),
				),
				h(
					"div",
					{ style: S.card },
					h("span", { style: S.cardLabel }, t("cardTokens")),
					h("span", { style: S.cardBig }, fmtInt(tokensTotal)),
					h("span", { style: S.cardLabel }, `${t("cacheHit")} ${fmtTokens(totals.hit)}`),
				),
			);

			// 用途分栏：对话 / 审查 / 标题 / 压缩。数据来自 summary 的 daysByPurpose。
			const purposes = purposeTotals(data, range, from, to);
			const purposeCost = purposes.reduce((sum, item) => sum + item.bucket.cost, 0);
			const conversationEntry = purposes.find((item) => item.purpose === "conversation");
			const reviewEntry = purposes.find((item) => item.purpose === "auto-review");
			const ratioText =
				conversationEntry !== undefined && reviewEntry !== undefined && conversationEntry.bucket.cost > 0
					? `${t("reviewRatio")} ${(reviewEntry.bucket.cost / conversationEntry.bucket.cost).toFixed(2)}×`
					: "";
			const shareOf = (cost) => (purposeCost > 0 ? (cost / purposeCost) * 100 : 0);
			const purposePanel =
				purposes.length === 0
					? null
					: h(
							"div",
							{ style: S.panel },
							h(
								"div",
								{ style: S.panelHead },
								h("span", { style: S.panelTitle }, t("purposeTitle")),
								h("span", { style: S.panelValue }, fmtCny(purposeCost, rate)),
								h("span", { style: { ...S.panelValue, marginLeft: "auto" } }, activeModel === "" ? ratioText : t("purposeModelNote")),
							),
							h(
								"div",
								{ style: S.purposeBar },
								...purposes.map((item) =>
									h("span", {
										key: item.purpose,
										style: { display: "block", height: "100%", width: `${shareOf(item.bucket.cost)}%`, background: PURPOSE_COLOR[item.purpose] ?? PURPOSE_COLOR.other },
									}),
								),
							),
							h(
								"div",
								{ style: S.purposeList },
								...purposes.map((item) =>
									h(
										"div",
										{ key: item.purpose, style: S.purposeRow },
										h(
											"span",
											{ style: S.purposeName },
											h("span", { style: { ...S.purposeDot, background: PURPOSE_COLOR[item.purpose] ?? PURPOSE_COLOR.other } }),
											purposeLabel(t, item.purpose),
										),
										h("span", { style: S.purposeNumMuted }, `${fmtInt(item.bucket.requests)} ${t("purposeRequests")}`),
										h("span", { style: S.purposeNumMuted }, fmtTokens(item.bucket.input + item.bucket.hit + item.bucket.out)),
										h("span", { style: S.purposeNum }, fmtUsd(item.bucket.cost)),
										h("span", { style: S.purposeNum }, `${shareOf(item.bucket.cost).toFixed(1)}%`),
									),
								),
							),
						);

			const costPanel = h(
				"div",
				{ style: S.panel },
				h(
					"div",
					{ style: S.panelHead },
					h("span", { style: S.panelTitle }, t("costTitle")),
					h("span", { style: S.panelValue }, fmtCny(totals.cost, rate)),
					h(
						"span",
						{ style: { ...S.panelValue, marginLeft: "auto" } },
						`${range === "custom" ? `${from || "…"} ~ ${to || "…"} · ` : ""}${granularity === "hour" ? t("byHour") : t("byDayLabel")}`,
					),
				),
				h(
					"div",
					{ style: S.chartWrap },
					h(Chart, {
						series: costSeries,
						kind: "bar",
						color: C.cost,
						format: (value) => (value === 0 ? "0" : value >= 10 ? String(Math.round(value)) : value.toFixed(1)),
						hovered: hover && hover.chart === "cost" ? hover.index : undefined,
						onHover: (index, point) => setHover(index === undefined ? undefined : { chart: "cost", index, label: point.label, value: point.value }),
					}),
					hover && hover.chart === "cost"
						? h(
								"div",
								{ style: { ...S.tooltip, left: `${((hover.index + 0.5) / Math.max(1, costSeries.length)) * 100}%`, top: "0" } },
								`${hover.label}　¥${hover.value.toFixed(2)}`,
							)
						: null,
				),
				slots.length === 0 ? h("p", { style: S.muted }, t("empty")) : null,
			);

			const modelPanels = (activeModel === "" ? models : [activeModel]).map((name) => {
				const { slots: modelSlots } = buildSlots(data, range, name, from, to);
				const modelTotals = sumSlots(modelSlots);
				return h(
					"div",
					{ key: name, style: { display: "flex", flexDirection: "column", gap: "10px" } },
					h("h3", { style: S.modelHead }, name),
					h(
						"div",
						{ style: S.modelGrid },
						h(
							"div",
							{ style: S.panel },
							h(
								"div",
								{ style: S.panelHead },
								h("span", { style: S.panelTitle }, t("requestsTitle")),
								h("span", { style: S.panelValue }, fmtInt(modelTotals.requests)),
							),
							h(Chart, {
								series: modelSlots.map((slot) => ({ label: slot.label, value: slot.bucket.requests })),
								kind: "area",
								color: C.requests,
								width: 340,
								format: (value) => (value === 0 ? "0" : value >= 1000 ? fmtTokens(value) : String(Math.round(value))),
							}),
						),
						h(
							"div",
							{ style: S.panel },
							h(
								"div",
								{ style: S.panelHead },
								h("span", { style: S.panelTitle }, t("tokensTitle")),
								h("span", { style: S.panelValue }, fmtInt(modelTotals.input + modelTotals.hit + modelTotals.out)),
							),
							h(Chart, {
								series: modelSlots.map((slot) => ({ label: slot.label, value: slot.bucket.input + slot.bucket.hit + slot.bucket.out })),
								kind: "bar",
								color: C.tokens,
								width: 340,
								format: (value) => (value === 0 ? "0" : fmtTokens(value)),
							}),
						),
					),
				);
			});

			const unpricedRows = (data.unpriced ?? []).map((item) => {
				const key = `${item.provider}\u0000${item.model}`;
				const draft = drafts[key] ?? {};
				const field = (label, name) =>
					h(
						"div",
						{ style: S.field, key: name },
						h("span", { style: S.cardLabel }, label),
						h("input", {
							type: "number",
							min: "0",
							step: "0.001",
							style: S.input,
							value: draft[name] ?? "",
							onChange: (event) => setField(key, name, event.target.value),
						}),
					);
				return h(
					"div",
					{ style: S.unpricedRow, key },
					h(
						"div",
						{ style: { flex: "1 1 220px", minWidth: "180px" } },
						h("div", { style: S.code }, item.model),
						h("div", { style: S.cardLabel }, `${item.provider} · ${fmtInt(item.requests)} ${t("unpricedRequests")} · ${fmtTokens(item.input + item.hit + item.out)} tokens`),
					),
					field(t("priceHit"), "hit"),
					field(t("priceMiss"), "miss"),
					field(t("priceOut"), "out"),
					h(
						"button",
						{ type: "button", style: { ...S.smallButton, alignSelf: "flex-end" }, disabled: savingKey === key, onClick: () => save(item) },
						savingKey === key ? t("saving") : t("save"),
					),
				);
			});

			return h(
				"div",
				{ style: S.section },
				h("h1", { style: S.h1 }, t("title")),
				filters,
				cards,
				purposePanel,
				costPanel,
				...modelPanels,
				unpricedRows.length === 0
					? null
					: h(
							"div",
							{ style: S.panel },
							h("div", { style: S.panelTitle }, t("unpriced")),
							h("p", { style: S.muted }, t("unpricedHint")),
							saveError === "" ? null : h("p", { style: { ...S.muted, color: "var(--dsw-alias-state-error-primary, #d33)" } }, saveError),
							...unpricedRows,
						),
				h("p", { style: S.muted }, `${t("fx")} 1 USD = ${rate} CNY · ${t("note")}`),
			);
		}

		// ── 挂载 ────────────────────────────────────────────────────────────
		const inject = ["slots", "locale"];

		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-usage: dictionaries");
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "usage",
						order: 60,
						label: () => t("nav"),
						locale: NS,
						inject: () => ({ t }),
					},
					UsageSection,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
