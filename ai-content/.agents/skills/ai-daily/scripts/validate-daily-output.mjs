import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const date = process.argv[2];
if (!/^20\d{2}-\d{2}-\d{2}$/.test(date || "")) throw new Error("用法：node validate-daily-output.mjs YYYY-MM-DD");

const outputDir = path.resolve("output", "daily", date);
const required = ["article.md", "wechat.html", "sources.json", "materials.json"];
const errors = [];
try {
  await stat(outputDir);
} catch {
  console.error(`找不到日报目录：${outputDir}。请从 ai-content 目录运行。`);
  process.exit(1);
}
for (const file of required) {
  try { await stat(path.join(outputDir, file)); } catch { errors.push(`缺少 ${file}`); }
}
if (errors.length) {
  console.error(errors.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

const allFiles = await readdir(outputDir, { recursive: true });
if (allFiles.some((file) => path.basename(file).toLowerCase() === "preview.png")) errors.push("不得生成 preview.png");

const html = await readFile(path.join(outputDir, "wechat.html"), "utf8");
const article = await readFile(path.join(outputDir, "article.md"), "utf8");
if (/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(html)) errors.push("wechat.html 不得出现 X 链接");

const materials = JSON.parse(await readFile(path.join(outputDir, "materials.json"), "utf8"));
const items = Array.isArray(materials.items) ? materials.items : [];
if (items.length) {
  try { await stat(path.join(outputDir, "assets", "materials.md")); } catch { errors.push("使用了图片但缺少 assets/materials.md"); }
}

const seen = new Set();
for (const item of items) {
  const materialPath = item.path || "";
  if (!/^assets\/\d{2}(?:-\d+)?\.(?:jpe?g|png|webp)$/i.test(materialPath)) {
    errors.push(`素材命名不符合规则：${materialPath || "(空)"}`);
    continue;
  }
  if (seen.has(materialPath)) errors.push(`素材重复登记：${materialPath}`);
  seen.add(materialPath);
  try { await stat(path.join(outputDir, materialPath)); } catch { errors.push(`素材文件不存在：${materialPath}`); }
  if (!item.reviewed?.relevant || !item.reviewed?.clear) errors.push(`素材未确认相关且清晰：${materialPath}`);
  if (!html.includes(materialPath)) errors.push(`素材没有放入对应 HTML：${materialPath}`);
}

const expectedImages = items.map((item) => item.path);
const articleImages = [...article.matchAll(/!\[[^\]]*\]\((assets\/\d{2}(?:-\d+)?\.(?:jpe?g|png|webp))\)/gi)].map((match) => match[1]);
const htmlImages = [...html.matchAll(/src="(assets\/\d{2}(?:-\d+)?\.(?:jpe?g|png|webp))"/gi)].map((match) => match[1]);
if (JSON.stringify(articleImages) !== JSON.stringify(expectedImages)) {
  errors.push("article.md 的图片必须与已登记素材完全一致，且按文章出现顺序引用");
}
if (JSON.stringify(htmlImages) !== JSON.stringify(expectedImages)) {
  errors.push("wechat.html 的图片必须与已登记素材完全一致，且按文章出现顺序引用");
}

if (errors.length) {
  console.error(errors.map((message) => `- ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`检查通过：${date}`);
}
