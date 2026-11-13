#!/usr/bin/env node
/**
 * 从当前 git 提交生成 DSH 插件市场索引（format 1）。
 *
 * 用法：
 *   node scripts/make-index.mjs --repo https://github.com/yuyaxiong/dsh-usage-report
 *
 * 可选：
 *   --version 0.1.0     包版本（默认取 package.json 的 version）
 *   --commit <sha>      安装钉住的提交（默认取当前 HEAD）
 *   --out market/index.json
 *   --timestamp <秒>    publishTimestamp（默认取当前提交时间）
 *
 * 索引里每个版本都钉死 commit：git 来源不允许分支或 tag，必须是 40 位 SHA。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const repo = opt("--repo", "");
if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/u.test(repo)) {
  console.error("需要 --repo https://github.com/<owner>/<repo>（https、至少两段路径、不要 .git 后缀）");
  process.exit(1);
}

const git = (...argv) => execFileSync("git", argv, { encoding: "utf8" }).trim();
const commit = opt("--commit", git("rev-parse", "HEAD"));
if (!/^[0-9a-f]{40}$/u.test(commit)) {
  console.error(`commit 必须是完整 40 位小写 SHA，当前是 ${commit}`);
  process.exit(1);
}
const timestamp = Number(opt("--timestamp", git("show", "-s", "--format=%ct", commit) || Math.floor(Date.now() / 1000)));
const version = opt("--version", pkg.version);
const out = opt("--out", "market/index.json");

const doc = {
  format: 1,
  title: { en: pkg.name, zh: "DSH 用量账本" },
  description: {
    en: pkg.description,
    zh: "用量与费用看板，按模型和按用途拆分：把自动审查、标题、压缩的消耗从对话里分出来，配合按小时/按天图表与自定义区间。",
  },
  metadata: {
    categories: { observability: { title: { en: "Observability", zh: "可观测" } } },
    labels: {
      bundle: { title: { en: "Bundle", zh: "组合包" } },
      "local-only": { title: { en: "Local only", zh: "纯本地" } },
    },
    sortKeys: { downloads: { title: { en: "Downloads", zh: "下载量" }, order: "desc" } },
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: "Usage and cost", zh: "用量与费用" },
      description: {
        en: "A usage and cost dashboard with a per-purpose split: separate auto-review, title and compaction spend from conversation cost, next to hourly/daily charts, per-model panels and CSV export.",
        zh: "用量与费用看板，支持按用途拆分：把自动审查、会话标题、上下文压缩的消耗从对话成本里分出来，另有按小时/按天图表、按模型分栏与 CSV 导出。",
      },
      icon: "icon.svg",
      author: pkg.author,
      homepage: repo,
      repository: { url: repo },
      metadata: {
        category: "observability",
        keywords: ["usage", "tokens", "cost", "dashboard", "auto-review", "用量", "费用", "审查"],
        labels: ["bundle", "local-only"],
        sortKeys: { downloads: 0 },
      },
      versions: [
        {
          version,
          publishTimestamp: timestamp,
          source: { type: "git", url: repo, commit },
          engines: pkg.engines ?? {},
        },
      ],
    },
  ],
};

mkdirSync(dirname(out), { recursive: true });
// 图标和索引同目录：相对 icon 才能在 Pages / jsDelivr 下都解析得到
try { copyFileSync("icon.svg", `${dirname(out)}/icon.svg`); } catch {}
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`写入 ${out}`);
console.log(`  ${pkg.name}@${version} → git ${repo}@${commit.slice(0, 12)}… · engines=${JSON.stringify(doc.plugins[0].versions[0].engines)}`);
