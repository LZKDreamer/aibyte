import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [date, rankText, sourceFile, metadataFile] = process.argv.slice(2);
if (!/^20\d{2}-\d{2}-\d{2}$/.test(date || "")) throw new Error("用法：node register-daily-material.mjs YYYY-MM-DD 排名 图片路径 素材元数据.json");
if (!/^\d+$/.test(rankText || "") || Number(rankText) < 1) throw new Error("排名必须是正整数。");
if (!sourceFile || !metadataFile) throw new Error("缺少图片路径或素材元数据文件。");

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const extension = path.extname(sourceFile).toLowerCase();
if (!imageExtensions.has(extension)) throw new Error("仅支持 jpg、jpeg、png、webp 图片。");

const metadata = JSON.parse(await readFile(metadataFile, "utf8"));
for (const field of ["role", "content", "videoUse"]) {
  if (!metadata[field] || typeof metadata[field] !== "string") throw new Error(`素材元数据缺少 ${field}。`);
}
if (!new Set(["evidence", "illustration"]).has(metadata.role)) throw new Error("role 只能是 evidence 或 illustration。");
if (metadata.relevant !== true || metadata.clear !== true) {
  throw new Error("登记前必须人工确认 relevant 和 clear 均为 true；没有合格图片时请不要登记。");
}

const outputDir = path.resolve("output", "daily", date);
const assetsDir = path.join(outputDir, "assets");
const materialsPath = path.join(outputDir, "materials.json");
await access(materialsPath);
await mkdir(assetsDir, { recursive: true });

const materials = JSON.parse(await readFile(materialsPath, "utf8"));
if (!Array.isArray(materials.items)) throw new Error("materials.json 必须包含 items 数组。");

const rank = String(Number(rankText)).padStart(2, "0");
const sameRank = materials.items.filter((item) => item.itemRank === Number(rankText));
const filename = sameRank.length === 0 ? `${rank}${extension}` : `${rank}-${sameRank.length}${extension}`;
const target = path.join(assetsDir, filename);
try {
  await access(target);
  throw new Error(`目标素材已存在：${target}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await copyFile(sourceFile, target);
materials.items.push({
  itemRank: Number(rankText),
  path: `assets/${filename}`,
  role: metadata.role,
  content: metadata.content,
  videoUse: metadata.videoUse,
  source: metadata.source || undefined,
  reviewed: { relevant: true, clear: true },
});
await writeFile(materialsPath, `${JSON.stringify(materials, null, 2)}\n`);

const lines = ["# 素材说明"];
for (const item of materials.items) {
  lines.push(
    "",
    `## ${path.basename(item.path)}`,
    `- 对应内容：${item.content}`,
    `- 文章位置：第 ${String(item.itemRank).padStart(2, "0")} 条。`,
    `- 视频使用：${item.videoUse}`,
    `- 类型：${item.role}`,
  );
}
await writeFile(path.join(assetsDir, "materials.md"), `${lines.join("\n")}\n`);
console.log(`已登记 assets/${filename}`);
