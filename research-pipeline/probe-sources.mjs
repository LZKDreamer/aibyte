import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve("output/source-probe");
const targets = [
  { id: "openai-news", category: "official", url: "https://openai.com/news/company-announcements/" },
  { id: "anthropic-news", category: "official", url: "https://www.anthropic.com/news" },
  { id: "deepseek-news", category: "official", url: "https://deepseek.com/en/news/" },
  { id: "kimi-code-news", category: "official", url: "https://www.kimi.com/code/docs/en/kimi-code/whats-new.html" },
  { id: "huggingface-blog", category: "open-source", url: "https://huggingface.co/blog" },
  { id: "github-trending", category: "open-source", url: "https://github.com/trending" },
  { id: "product-hunt-ai", category: "product", url: "https://www.producthunt.com/topics/artificial-intelligence" },
  { id: "the-rundown-ai", category: "editorial", url: "https://www.therundown.ai/" },
  { id: "tldr-ai", category: "editorial", url: "https://tldr.tech/api/latest/ai" },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36",
  locale: "en-US",
});

const report = [];

for (const target of targets) {
  const page = await context.newPage();
  const startedAt = Date.now();

  try {
    const response = await page.goto(target.url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(2_500);

    const data = await page.evaluate(() => {
      const normalize = (value) => value.replace(/\s+/g, " ").trim();
      const links = [...document.querySelectorAll("a[href]")]
        .map((link) => ({
          text: normalize(link.textContent || ""),
          heading: normalize(link.querySelector("h1, h2, h3, h4, [role='heading']")?.textContent || ""),
          href: link.href,
        }))
        .filter((link) => link.text.length >= 12)
        .slice(0, 120);

      return {
        title: document.title,
        text: normalize(document.body.innerText || "").slice(0, 12_000),
        headings: [...document.querySelectorAll("h1, h2, h3")]
          .map((heading) => normalize(heading.textContent || ""))
          .filter(Boolean)
          .slice(0, 60),
        links,
      };
    });

    const capture = {
      capturedAt: new Date().toISOString(),
      ...target,
      status: response?.status() ?? null,
      finalUrl: page.url(),
      durationMs: Date.now() - startedAt,
      ...data,
    };

    await writeFile(path.join(outputDir, `${target.id}.json`), JSON.stringify(capture, null, 2));
    report.push({
      id: target.id,
      category: target.category,
      status: capture.status,
      finalUrl: capture.finalUrl,
      title: capture.title,
      headings: capture.headings.slice(0, 6),
      links: capture.links.length,
      durationMs: capture.durationMs,
    });
  } catch (error) {
    report.push({
      id: target.id,
      category: target.category,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
  } finally {
    await page.close();
  }
}

await browser.close();
await writeFile(
  path.join(outputDir, "report.json"),
  JSON.stringify({ capturedAt: new Date().toISOString(), sources: report }, null, 2),
);
