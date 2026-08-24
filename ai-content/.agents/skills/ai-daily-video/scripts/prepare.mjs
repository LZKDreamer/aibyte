import fs from 'node:fs';
import path from 'node:path';

const articlePath = process.argv[2];
if (!articlePath) throw new Error('Usage: node prepare.mjs <article.md> [--out <directory>]');
const resolvedArticle = path.resolve(articlePath);
if (!fs.existsSync(resolvedArticle)) throw new Error(`Article not found: ${resolvedArticle}`);
const outFlag = process.argv.indexOf('--out');
const outputDir = outFlag >= 0 ? path.resolve(process.argv[outFlag + 1]) : path.resolve(path.dirname(resolvedArticle), '..', 'video');
fs.mkdirSync(outputDir, { recursive: true });

const raw = fs.readFileSync(resolvedArticle, 'utf8').replace(/\r/g, '');
const articleDir = path.dirname(resolvedArticle);
const frontMatter = raw.match(/^---\n([\s\S]*?)\n---\n?/);
const front = frontMatter?.[1] ?? '';
const title = (front.match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1] || raw.match(/^#\s+(.+)$/m)?.[1] || path.basename(resolvedArticle, '.md')).trim();
const body = raw.slice(frontMatter?.[0].length ?? 0);
const headings = [...body.matchAll(/^##\s+(?:(\d{1,2})\s*[｜|]\s*)?(.+)$/gm)];
const sections = headings.map((heading, index) => ({
  rank: Number(heading[1] || index + 1),
  title: heading[2].trim(),
  body: body.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? body.length).trim(),
}));
if (!sections.length) throw new Error('No level-2 news sections found in the Markdown article.');

const materialsPath = path.join(articleDir, 'materials.json');
let materialItems = [];
if (fs.existsSync(materialsPath)) {
  try { materialItems = JSON.parse(fs.readFileSync(materialsPath, 'utf8')).items ?? []; }
  catch { throw new Error(`Invalid JSON: ${materialsPath}`); }
}
const imageByRank = new Map();
for (const section of sections) {
  const image = section.body.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
  if (image) imageByRank.set(section.rank, image);
}
const existing = (value) => value && fs.existsSync(path.resolve(articleDir, value)) ? path.resolve(articleDir, value) : null;
const clean = (text) => text.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\[[^\]]+\]\([^)]+\)/g, '').replace(/[>#*_`]/g, '').replace(/\s+/g, ' ').trim();
const sentence = (text) => /[。！？]$/.test(text) ? text : `${text}。`;
const firstSentences = (text, limit = 2) => {
  const matches = clean(text).match(/[^。！？]+[。！？]?/g) ?? [];
  return matches.slice(0, limit).join('').trim();
};
const estimate = (text) => Math.max(5, Math.round((text.replace(/\s/g, '').length / 4.9) * 10) / 10);
const hook = `今天有 ${sections.length} 条 AI 更新，先从第一条开始。`;
const lines = [{ kind: 'hook', rank: 0, title, narration: hook }];
for (const section of sections) {
  const item = materialItems.find((value) => Number(value.itemRank) === section.rank) ?? {};
  const video = existing(item.videoAsset);
  const image = existing(imageByRank.get(section.rank)) || existing(item.path);
  const detail = sentence(firstSentences(section.body)).replace(/[。！？]+$/, '');
  const narration = `${detail}。`;
  lines.push({
    kind: 'news', rank: section.rank, title: section.title, narration,
    visual: video ? { type: 'video', path: video, note: item.videoUse ?? item.content ?? '' } : image ? { type: 'image', path: image, note: item.videoUse ?? item.content ?? '' } : { type: 'card', path: null, note: '未找到对应本地素材，使用原创信息视觉。' },
  });
}
let cursor = 0;
for (const line of lines) {
  line.start = cursor;
  line.duration = estimate(line.narration);
  cursor = Math.round((cursor + line.duration) * 10) / 10;
  line.end = cursor;
}
const report = lines.filter((line) => line.kind === 'news').map((line) => ({ rank: line.rank, title: line.title, visual: line.visual }));
const script = [
  `# ${title}｜视频口播稿（待审核）`,
  `预计时长：${Math.round(cursor)} 秒（${Math.round(cursor / 60 * 10) / 10} 分钟）`,
  ...lines.map((line) => line.narration),
].join('\n\n');
fs.writeFileSync(path.join(outputDir, 'script.md'), script, 'utf8');
fs.writeFileSync(path.join(outputDir, 'storyboard.json'), JSON.stringify({
  version: 1,
  status: 'awaiting-approval',
  title,
  article: resolvedArticle,
  format: { width: 1080, height: 1920, fps: 30 },
  visualTemplate: 'ai-product-reel',
  templateVersion: 1,
  hyperframesTemplates: ['play-mode', 'product-promo', 'swiss-grid', 'decision-tree', 'nyt-graph'],
  visualMode: 'media-first',
  estimatedDuration: cursor,
  scenes: lines,
}, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'materials-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ outputDir, title, scenes: lines.length, estimatedDuration: cursor, next: `Review script.md and storyboard.json, then run: node render.mjs "${resolvedArticle}" --approved` }, null, 2));
