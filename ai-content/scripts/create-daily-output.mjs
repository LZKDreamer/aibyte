import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式应为 YYYY-MM-DD。");

const outputDir = path.resolve("output", "daily", date);
await mkdir(outputDir, { recursive: true });

async function writeIfMissing(filename, content) {
  const target = path.join(outputDir, filename);
  try {
    await access(target);
  } catch {
    await writeFile(target, content);
  }
}

await writeIfMissing("article.md", `---
title: "[待定] AI 日报：${date}"
date: "${date}"
type: "daily"
status: "draft"
cover: ""
tags: ["AI日报"]
---

# [待定] AI 日报：${date}

> 主榜单固定为 X 榜单赛道榜的 24小时、综合热度、AI；按榜单顺序写 8–12 条独立动态。
`);

await writeIfMissing("sources.json", JSON.stringify({
  date,
  items: [],
  note: "每条记录保留赛道榜链接、对应 X 原帖链接（如有）和补充页面（如有）。赛道榜是日报主来源，补充页面不改变榜单排序。",
}, null, 2));

await writeIfMissing("materials.json", JSON.stringify({
  date,
  items: [],
  note: "仅登记已经人工看过且与选题有关的素材。role 只能为 evidence、illustration 或 decorative。",
}, null, 2));

await writeIfMissing("wechat.html", `<!-- 将 article.md 完稿后，由 Agent 填入可复制到公众号后台的内联样式 HTML。 -->\n`);

console.log(outputDir);
