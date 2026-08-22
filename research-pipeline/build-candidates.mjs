import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("output");
const probeDir = path.join(outputDir, "source-probe");
const capturedAt = new Date().toISOString();

const sourceRules = {
  "anthropic-news": (url) => /anthropic\.com\/(news|features)\//.test(url),
  "deepseek-news": (url) => /deepseek\.com\/en\/news\//.test(url),
  "huggingface-blog": (url) => /huggingface\.co\/blog\//.test(url),
  "github-trending": (url) => /^https:\/\/github\.com\/[^/]+\/[^/?#]+\/?$/.test(url),
  "product-hunt-ai": (url) => /producthunt\.com\/posts\//.test(url),
  "the-rundown-ai": (url) => /therundown\.ai\/articles\//.test(url),
  "tldr-ai": (url) => /^https?:\/\//.test(url) && !/tldr\.tech/.test(url),
};

const sourceScores = {
  official: 100,
  "open-source": 75,
  product: 60,
  editorial: 55,
  community: 65,
};

const ignoredTitles = [
  "skip to", "view all", "learn more", "sign in", "sign up", "privacy", "terms",
  "download press kit", "help & feedback", "all articles", "see more", "previous", "next",
];

const normalize = (value) => value.replace(/\s+/g, " ").trim();
const keyFor = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function heatFromText(text) {
  const match = text.match(/热度\s*([\d.]+)/);
  return match ? Number(match[1]) : null;
}

function dateFromText(text, fallbackYear = new Date().getUTCFullYear()) {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const chinese = text.match(/\b(\d{2})-(\d{2})\s+\d{2}:\d{2}\b/);
  if (chinese) return `${fallbackYear}-${chinese[1]}-${chinese[2]}`;

  const english = text.match(/\b([A-Z][a-z]{2})\s+(\d{1,2}),\s+(20\d{2})\b/);
  if (english) {
    const month = new Date(`${english[1]} 1, 2000`).getMonth() + 1;
    return `${english[3]}-${String(month).padStart(2, "0")}-${english[2].padStart(2, "0")}`;
  }
  return undefined;
}

function titleFromText(text) {
  const value = normalize(text);
  const newsroomTitle = value.match(
    /^(.+?)(?:Product|Announcements|Features|Research|Economic Research)(?:[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/,
  );
  if (newsroomTitle) return newsroomTitle[1].trim().slice(0, 180);

  const deepSeekTitle = value.match(/^News(?:[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})(.+)$/);
  if (deepSeekTitle) return deepSeekTitle[1].trim().slice(0, 180);

  return value
    .replace(/^(AI|Tech|Robotics|Product|Announcements|Features|Research|News)\s+/i, "")
    .split(/(?:\s+PLUS:|\s+•\s*\d+\s*(?:minute|min read)|\s+(?:Product|Announcements|Features|Research)\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/)[0]
    .slice(0, 180)
    .trim();
}

function tagsFor(text) {
  const value = text.toLowerCase();
  const tags = [];
  if (/agent|智能体|skill|mcp|harness/.test(value)) tags.push("Agent/Skill");
  if (/model|模型|llm|gpt|claude|deepseek|kimi|gemini/.test(value)) tags.push("模型");
  if (/open.source|开源|github|weights|hugging face/.test(value)) tags.push("开源");
  if (/tutorial|guide|how to|实操|教程|workflow/.test(value)) tags.push("实操");
  if (/research|paper|benchmark|论文|基准/.test(value)) tags.push("研究");
  if (/product|launch|release|发布|推出|introducing/.test(value)) tags.push("产品");
  return tags.length ? tags : ["AI动态"];
}

const candidatesByKey = new Map();

function addCandidate(candidate) {
  const key = keyFor(candidate.title);
  if (key.length < 8 || ignoredTitles.some((item) => candidate.title.toLowerCase().includes(item))) return;

  const current = candidatesByKey.get(key);
  if (!current || current.score < candidate.score) candidatesByKey.set(key, candidate);
}

for (const [sourceId, accepts] of Object.entries(sourceRules)) {
  const source = JSON.parse(await readFile(path.join(probeDir, `${sourceId}.json`), "utf8"));
  const baseScore = sourceScores[source.category] ?? 40;
  const sourcePublishedAt = dateFromText(source.finalUrl || "") || dateFromText(source.title || "");

  for (const link of source.links) {
    if (!accepts(link.href)) continue;
    const title = titleFromText(link.heading || link.text);
    if (!title) continue;
    const tags = tagsFor(`${title} ${link.text}`);

    addCandidate({
      id: `${sourceId}:${keyFor(title).slice(0, 56)}`,
      title,
      summary: normalize(link.text).slice(0, 360),
      url: link.href,
      source: sourceId,
      sourceType: source.category,
      tags,
      score: baseScore + (tags.includes("Agent/Skill") ? 10 : 0) + (tags.includes("实操") ? 5 : 0),
      capturedAt: source.capturedAt,
      publishedAt: dateFromText(`${link.text} ${link.heading || ""}`) || sourcePublishedAt,
    });
  }
}

const lanes = JSON.parse(await readFile(path.join(outputDir, "lanes.json"), "utf8"));
for (const post of lanes.statusPosts.filter((item) => item.isLane && /\d+\s*信源/.test(item.text))) {
  const title = post.title;
  if (!title) continue;
  const tags = tagsFor(`${title} ${post.text}`);

  addCandidate({
    id: `xbangdan-lanes:${keyFor(title).slice(0, 56)}`,
    title,
    summary: post.text.slice(0, 360),
    url: post.url,
    source: "xbangdan-lanes",
    sourceType: "community",
    tags,
    score: sourceScores.community + (tags.includes("Agent/Skill") ? 10 : 0),
    capturedAt: lanes.capturedAt,
    publishedAt: dateFromText(post.text, new Date(lanes.capturedAt).getUTCFullYear()),
    laneRank: post.laneRank,
    heat: heatFromText(post.text),
    assetUrls: post.images,
  });
}

const candidates = [...candidatesByKey.values()]
  .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-CN"));

const markdown = [
  "# AI 候选池（研究输出）",
  "",
  `生成时间：${capturedAt}`,
  `候选数：${candidates.length}`,
  "",
  "| 分数 | 类型 | 标签 | 标题 | 来源 |",
  "| ---: | --- | --- | --- | --- |",
  ...candidates.slice(0, 40).map((item) =>
    `| ${item.score} | ${item.sourceType} | ${item.tags.join("、")} | [${item.title}](${item.url}) | ${item.source} |`,
  ),
  "",
  "注：这是可供 Agent 进一步去重、研究和选题的候选池，不等同于可直接发布的事实清单。",
].join("\n");

await writeFile(path.join(outputDir, "candidates.json"), JSON.stringify({ capturedAt, candidates }, null, 2));
await writeFile(path.join(outputDir, "candidate-report.md"), markdown);
