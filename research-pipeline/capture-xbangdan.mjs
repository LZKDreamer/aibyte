import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve("output");
const targets = [
  { id: "lanes", url: "https://xbangdan.com/lanes/" },
  { id: "articles", url: "https://xbangdan.com/articles/" },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36",
  locale: "zh-CN",
});

for (const target of targets) {
  const page = await context.newPage();
  const media = [];

  page.on("response", (response) => {
    const type = response.request().resourceType();
    if (type === "image" || type === "media") {
      media.push({ type, url: response.url(), status: response.status() });
    }
  });

  const response = await page.goto(target.url, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(3_000);

  if (target.id === "lanes") {
    for (const [selector, label] of [
      [".pill", "24小时"],
      [".pill", "综合热度"],
      [".lane-tab", "AI"],
    ]) {
      const item = page.locator(selector, { hasText: label }).first();
      if (await item.count()) await item.click();
    }
    await page.waitForTimeout(1_000);
  }

  const pageData = await page.evaluate(() => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim();
    const links = [...document.querySelectorAll("a[href]")]
      .map((link) => ({
        text: normalize(link.textContent || ""),
        href: link.href,
      }))
      .filter((link) => link.text || link.href.includes("x.com"));

    const statusLinkAncestors = [...document.querySelectorAll("a[href*='x.com/'][href*='/status/']")]
      .slice(0, 3)
      .map((anchor) => {
        const ancestors = [];
        let node = anchor;
        for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
          ancestors.push({
            tag: node.tagName.toLowerCase(),
            className: typeof node.className === "string" ? node.className : "",
            text: normalize(node.innerText || "").slice(0, 500),
          });
        }
        return { href: anchor.href, ancestors };
      });

    const statusPosts = [...document.querySelectorAll("a[href*='x.com/'][href*='/status/']")]
      .map((anchor, index) => {
        const text = normalize(anchor.innerText || "");
        const isLane = anchor.classList.contains("item");
        const title = isLane
          ? (text.match(/^(.+?)[（(]\s*\d+\s*信源/)?.[1] || text).trim()
          : text.slice(0, 220);

        return {
          isLane,
          title,
          text,
          url: anchor.href,
          className: anchor.className,
          laneRank: isLane ? index + 1 : null,
          images: [...anchor.querySelectorAll("img")].map((image) => image.currentSrc || image.src),
        };
      });

    return {
      title: document.title,
      headings: [...document.querySelectorAll("h1, h2, h3")]
        .map((heading) => normalize(heading.textContent || ""))
        .filter(Boolean),
      text: normalize(document.body.innerText || ""),
      links,
      statusLinkAncestors,
      statusPosts,
      activeFilters: [...document.querySelectorAll(".pill.on, .lane-tab.on")]
        .map((item) => normalize(item.textContent || "")),
    };
  });

  await page.screenshot({
    path: path.join(outputDir, `${target.id}.png`),
    fullPage: true,
  });

  await writeFile(
    path.join(outputDir, `${target.id}.json`),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        url: target.url,
        status: response?.status() ?? null,
        ...pageData,
        media: [...new Map(media.map((item) => [item.url, item])).values()],
      },
      null,
      2,
    ),
  );

  await page.close();
}

await browser.close();
