import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve("output");
const shortlist = JSON.parse(await readFile(path.join(outputDir, "daily-shortlist.json"), "utf8"));
const first = shortlist.selected[0];
const coverDir = path.join(outputDir, "daily-cover");
await mkdir(coverDir, { recursive: true });

const imageUrl = (first.assetUrls || []).find((url) => !/\/avatars\//.test(url));
let file;
let role;
let sourceUrl;

if (imageUrl) {
  const response = await fetch(imageUrl, { headers: { "User-Agent": "aibyte-research-pipeline/0.1" } });
  if (!response.ok) throw new Error(`封面素材下载失败：${response.status}`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  file = `cover.${extension}`;
  await writeFile(path.join(coverDir, file), Buffer.from(await response.arrayBuffer()));
  role = "illustration";
  sourceUrl = imageUrl;
} else {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto("https://xbangdan.com/lanes/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  const exactCard = page.locator(`a.item[href="${first.url}"]`).first();
  const card = (await exactCard.count()) ? exactCard : page.locator("a.item").first();
  file = "cover-card.png";
  await card.screenshot({ path: path.join(coverDir, file) });
  await browser.close();
  role = "illustration";
  sourceUrl = "https://xbangdan.com/lanes/";
}

await writeFile(path.join(coverDir, "cover.json"), JSON.stringify({
  title: first.title,
  laneRank: first.dailyRank,
  localFile: file,
  sourceUrl,
  role,
  note: "封面服务于第一条榜单动态，不单独作为事实证据。",
}, null, 2));

console.log(path.join(coverDir, file));
