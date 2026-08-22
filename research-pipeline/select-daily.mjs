import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("output");
const { capturedAt, candidates } = JSON.parse(await readFile(path.join(outputDir, "candidates.json"), "utf8"));
const lanes = JSON.parse(await readFile(path.join(outputDir, "lanes.json"), "utf8"));

const selected = candidates
  .filter((candidate) => candidate.source === "xbangdan-lanes")
  .sort((a, b) => (a.laneRank ?? 999) - (b.laneRank ?? 999))
  .slice(0, 12)
  .map((candidate, index) => ({
    ...candidate,
    dailyRank: index + 1,
    detailPolicy: "以赛道榜摘要与对应 X 原帖为主；官网仅作为补充，不因没有官网公告而淘汰。",
    materialPolicy: index === 0
      ? "必须优先获取与第一条直接相关的图片、视频缩略图或榜单卡片截图作为封面。"
      : "只在确实能提高阅读体验时下载相关素材；不为每条强制配图。",
  }));

if (!selected.length) throw new Error("赛道榜没有可用的 AI 条目，无法生成日报短名单。");

const result = {
  generatedAt: new Date().toISOString(),
  source: {
    page: "https://xbangdan.com/lanes/",
    requiredFilters: ["24小时", "综合热度", "AI"],
    observedFilters: lanes.activeFilters || [],
  },
  rule: "日报主榜单固定为赛道榜的 24小时、综合热度、AI。按页面排名取前 12 条；不混入其他网站候选，不以官网核查结果改变榜单顺序。",
  selected,
};

await writeFile(path.join(outputDir, "daily-shortlist.json"), JSON.stringify(result, null, 2));
await writeFile(
  path.join(outputDir, "daily-shortlist.md"),
  [
    "# AI 日报主榜单（赛道榜）",
    "",
    `抓取时间：${capturedAt}`,
    `筛选条件：${result.source.requiredFilters.join(" / ")}`,
    `入选：综合热度前 ${selected.length} 条 AI 动态。`,
    "",
    "| 排名 | 热度 | 标题 | 时间 |",
    "| ---: | ---: | --- | --- |",
    ...selected.map((item) => `| ${item.dailyRank} | ${item.heat ?? "-"} | ${item.title} | ${item.publishedAt || "-"} |`),
    "",
    "Agent 按此排序写成 8–12 条独立动态；可读取对应 X 原帖补充，但不因没有官网页面而删除条目。",
  ].join("\n"),
);
