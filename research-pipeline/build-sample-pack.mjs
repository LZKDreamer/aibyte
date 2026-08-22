import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const candidates = JSON.parse(await readFile(path.resolve("output/candidates.json"), "utf8")).candidates;
const candidate = candidates.find((item) => item.title === "OpenAI Sol降价20%");

if (!candidate) throw new Error("未找到用于素材下载验证的样本候选。");

const assetUrls = (candidate.assetUrls || []).filter((url) => /\/feed\/img\//.test(url));
if (!assetUrls.length) throw new Error("样本候选没有可下载的内容媒体。");

const packDir = path.resolve("output/sample-packs/openai-sol-price-cut");
const mediaDir = path.join(packDir, "media");
await mkdir(mediaDir, { recursive: true });

const assets = [];
for (const [index, sourceUrl] of assetUrls.entries()) {
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "aibyte-research-pipeline/0.1" },
  });
  if (!response.ok) throw new Error(`下载素材失败：${response.status} ${sourceUrl}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const filename = `${String(index + 1).padStart(2, "0")}.${extension}`;

  await writeFile(path.join(mediaDir, filename), bytes);
  assets.push({
    sourceUrl,
    localFile: `media/${filename}`,
    role: "decorative",
    contentType,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

await writeFile(
  path.join(packDir, "research.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      candidate,
      assets,
      notes: [
        "本包用于验证素材发现和下载流程。",
        "素材仅在选题入选后下载，不作为全站批量抓取。",
        "已人工查看：图片中的发光太阳与 Sol 名称相关，但不能单独证明降价事实，因此标记为 decorative。",
      ],
    },
    null,
    2,
  ),
);
