import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [storyboardPath, timestampsPath, outputDir] = process.argv.slice(2);
if (!storyboardPath || !timestampsPath || !outputDir) throw new Error('Usage: node build-composition.mjs <storyboard.json> <word-timestamps.json> <output-dir>');
const storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
const timing = JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));
const videoOnly = storyboard.visualMode === 'video-only' || storyboard.videoOnly === true;
const mediaFirst = !['legacy-cards', 'cards'].includes(storyboard.visualMode);
const templateName = storyboard.visualTemplate || 'ai-product-reel';
const templateVersion = Number(storyboard.templateVersion || 1);
const format = storyboard.format || {};
if (templateName !== 'ai-product-reel' || templateVersion !== 1) throw new Error(`Unsupported video template: ${templateName} v${templateVersion}. Use ai-product-reel v1.`);
if (Number(format.width || 1080) !== 1080 || Number(format.height || 1920) !== 1920 || Number(format.fps || 30) !== 30) throw new Error('ai-product-reel v1 requires 1080x1920 at 30fps.');
if (videoOnly) {
  const invalid = storyboard.scenes.find((scene) => scene.visual?.type !== 'video');
  if (invalid) throw new Error(`video-only storyboard contains non-video scene: ${invalid.rank ?? invalid.title}`);
}
if (mediaFirst && !videoOnly) {
  const invalid = storyboard.scenes.find((scene) => {
    const type = scene.visual?.type;
    if (!['video', 'image'].includes(type)) return true;
    return type === 'image' && ['static', 'hold'].includes(scene.visual?.mode || 'static');
  });
  if (invalid) throw new Error(`media-first storyboard contains a non-moving visual: ${invalid.rank ?? invalid.title}`);
}
const compositionDir = path.join(outputDir, 'hyperframes');
const vendorDir = path.join(compositionDir, 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });
const bundleDir = path.resolve(outputDir, '..', '..', '..', '..');
const runtimeGsap = path.join(bundleDir, 'dependency', 'ai-daily-video-runtime', 'node_modules', 'gsap', 'dist', 'gsap.min.js');
if (!fs.existsSync(runtimeGsap)) throw new Error(`GSAP is missing from runtime: ${runtimeGsap}`);
fs.copyFileSync(runtimeGsap, path.join(vendorDir, 'gsap.min.js'));
const assetsDir = path.join(compositionDir, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.copyFileSync(path.join(outputDir, 'voiceover.mp3'), path.join(assetsDir, 'voiceover.mp3'));
storyboard.scenes.forEach((scene, index) => {
  if (scene.visual?.path && fs.existsSync(scene.visual.path)) {
    fs.copyFileSync(scene.visual.path, path.join(assetsDir, `media-${index}${path.extname(scene.visual.path)}`));
  }
  if (scene.visual?.posterPath && fs.existsSync(scene.visual.posterPath)) {
    fs.copyFileSync(scene.visual.posterPath, path.join(assetsDir, `poster-${index}${path.extname(scene.visual.posterPath)}`));
  }
});
const safe = (value = '') => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rel = (source) => source ? path.relative(compositionDir, source).split(path.sep).join('/') : '';
const mediaDuration = (source) => {
  try {
    const value = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', source], { encoding: 'utf8' }).trim();
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
};
const duration = Number(storyboard.estimatedDuration || timing.duration || 1).toFixed(3);
const activeScenes = storyboard.scenes.filter((scene) => scene.kind !== 'outro');
const fact = (scene) => scene.narration.split(/[。！？]/)[0].replace(/^今天这\s*\d+\s*条更新，/, '').trim() || scene.title;
const sceneLabel = (scene) => {
  if (scene.visual?.label) return scene.visual.label;
  const title = String(scene.title || '');
  if (/Sol/i.test(title)) return 'OpenAI Sol';
  if (/Grok/i.test(title)) return 'Grok Bot';
  if (/Gemini/i.test(title)) return 'Gemini 3.7 Flash';
  if (/Ox/i.test(title)) return 'Ox Alpha';
  if (/ChatGPT|Codex/i.test(title)) return 'ChatGPT / Codex';
  return title.split(/[：:，,]/)[0].slice(0, 22);
};
const explainerMarkup = (scene) => {
  switch (Number(scene.rank)) {
    case 0:
      return `<div class="explainer explainer-hook"><span class="explainer-label">TODAY / 05 UPDATES</span><div class="hook-pulse"><i data-motion-node></i><i data-motion-node></i><i data-motion-node></i></div><strong class="explainer-value">AI 更新正在加速</strong></div>`;
    case 1:
      return `<div class="explainer explainer-price"><div class="explainer-label">API / CREDIT</div><div class="price-line"><span>$5.00</span><i class="flow-line" data-motion-line></i><b>$4.00</b><em>-20%</em></div><div class="token-line"><span>token</span><i class="token-bars"><b></b><b></b><b></b><b></b></i><strong>同样额度，用得更久</strong></div></div>`;
    case 2:
      return `<div class="explainer explainer-access"><span class="explainer-label">ACCESS EXPANSION</span><div class="access-line"><span data-motion-node>HEAVY</span><i class="flow-line" data-motion-line></i><span data-motion-node>PLUS</span><i class="flow-line" data-motion-line></i><span data-motion-node>PRO+</span><i class="flow-line" data-motion-line></i><span data-motion-node>TEAMS</span></div><strong class="explainer-value">使用范围逐级开放</strong></div>`;
    case 3:
      return `<div class="explainer explainer-route"><span class="explainer-label">DEPLOYED TO</span><div class="route-line"><span data-motion-node>SEARCH</span><i class="flow-line" data-motion-line>→</i><strong data-motion-node>GEMINI 3.7 FLASH</strong><i class="flow-line" data-motion-line>→</i><span data-motion-node>APP</span></div><strong class="explainer-value">同一个模型，两个入口</strong></div>`;
    case 4:
      return `<div class="explainer explainer-ox"><div class="ox-metrics"><div><strong data-motion-node>1M</strong><span>context</span></div><div><strong data-motion-node>3</strong><span>modalities</span></div><div><strong data-motion-node>$0</strong><span>stated cost</span></div></div></div>`;
    case 5:
      return `<div class="explainer explainer-reset"><span class="explainer-label">BANKED RESET</span><div class="reset-line"><span>USED</span><i class="usage-track"><b data-motion-fill></b></i><span class="bank-node" data-motion-node>BANK</span><i class="flow-line" data-motion-line>→</i><strong data-motion-node>PT 20:00</strong></div><strong class="explainer-value">额度先存入，时间到再重置</strong></div>`;
    default:
      return `<div class="explainer explainer-default"><span class="explainer-label">AI TECH UPDATE</span><strong class="explainer-value">${safe(sceneLabel(scene))}</strong></div>`;
  }
};
let segmentOffset = 0;
const timedScenes = activeScenes.map((scene) => {
  const sentenceCount = (scene.narration.match(/[。！？]/g) || []).length || 1;
  const assigned = timing.segments.slice(segmentOffset, segmentOffset + sentenceCount);
  segmentOffset += sentenceCount;
  return { ...scene, start: assigned[0]?.start ?? scene.start, end: assigned.at(-1)?.end ?? scene.end };
}).map((scene, index, list) => ({ ...scene, duration: (list[index + 1]?.start ?? Number(duration)) - scene.start }));
const totalNews = timedScenes.filter((scene) => scene.kind === 'news').length;
const sceneHtml = timedScenes.map((scene, index) => {
  const isNews = scene.kind === 'news';
  const tail = scene.visual?.tail
    ? `<div class="media-tail"><span class="tail-kicker">${safe(scene.visual.tail.kicker || 'UPDATE')}</span><strong>${safe(scene.visual.tail.title || '')}</strong><small>${safe(scene.visual.tail.body || '')}</small></div>`
    : '';
  const media = scene.visual?.type === 'video'
    ? `<div class="media-shell"></div>${scene.visual?.tail ? tail.replace('<div class="media-tail"', `<div data-tail-start="${Number(scene.visual.tail.start || scene.visual.mediaDuration || 0)}" class="media-tail"`) : ''}`
    : scene.visual?.type === 'image'
      ? `<div class="media-shell ${scene.visual?.mode === 'vertical-pan' ? 'pan-shell' : ''}"><img id="media-${index}" class="evidence-media ${scene.visual?.mode === 'vertical-pan' ? 'pan-media' : ''}" data-pan-percent="${Number(scene.visual?.panPercent || 0)}" src="assets/media-${index}${path.extname(scene.visual.path)}" alt="" /></div>`
      : `<div class="signal-card"><span class="card-kicker">${isNews ? `UPDATE ${String(scene.rank).padStart(2, '0')}` : 'DAILY SIGNAL'}</span><strong>${safe(isNews ? fact(scene) : scene.title)}</strong><small>${safe(scene.visual?.note || 'AIBYTE 今日 AI 日报')}</small></div>`;
  return `<section id="scene-${index}" class="clip scene ${scene.visual?.type === 'video' ? 'video-scene' : ''}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="${10 + index}">
    <header class="masthead"><span>AIBYTE</span><b>AI TECH UPDATE</b><i>${isNews ? `${String(scene.rank).padStart(2, '0')}/${String(totalNews).padStart(2, '0')}` : 'OPEN'}</i></header>
    <div class="scene-tag"><small>${isNews ? 'PRODUCT UPDATE' : 'SIGNAL REEL'}</small><strong>${safe(sceneLabel(scene))}</strong></div>
    <div class="evidence"><div class="evidence-rail"><span class="macos-controls"><em></em><em></em><em></em></span><b>${safe(sceneLabel(scene))}</b><small>PUBLIC PRODUCT VIEW</small></div>${media}</div>
    <div class="fact"><span>${isNews ? `UPDATE ${String(scene.rank).padStart(2, '0')}` : 'OPENING SIGNAL'}</span>${explainerMarkup(scene)}</div>
  </section>`;
}).join('\n');
const directVideos = timedScenes.filter((scene) => scene.visual?.type === 'video').map((scene, index) => {
  const sourceIndex = timedScenes.indexOf(scene);
  const poster = scene.visual?.posterPath ? ` poster="assets/poster-${sourceIndex}${path.extname(scene.visual.posterPath)}"` : '';
  const clipDuration = mediaDuration(scene.visual.path);
  const durationAttr = clipDuration == null ? '' : ` data-media-duration="${clipDuration.toFixed(3)}"`;
  const renderDuration = clipDuration == null ? scene.duration : Math.min(clipDuration, scene.duration);
  return `<video id="video-${sourceIndex}" class="clip evidence-video" src="assets/media-${sourceIndex}${path.extname(scene.visual.path)}"${poster} data-start="${scene.start}" data-duration="${renderDuration}"${durationAttr} data-track-index="${100 + index}" muted playsinline></video>`;
}).join('\n');
const captionDataPath = path.join(outputDir, 'captions.json');
if (!fs.existsSync(captionDataPath)) throw new Error(`Caption data is missing: ${captionDataPath}`);
const groups = JSON.parse(fs.readFileSync(captionDataPath, 'utf8')).groups;
const captions = groups.map((group, index) => `<div id="caption-${index}" class="clip caption" data-start="${group.start}" data-duration="${Math.max(0.2, group.end - group.start)}" data-track-index="900"><span>${safe(group.text)}</span></div>`).join('\n');
const root = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" /><meta name="viewport" content="width=1080,height=1920" /><title>${safe(storyboard.title)}</title><script src="vendor/gsap.min.js"></script><style>
 @font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}@font-face{font-family:"Cascadia Mono";src:local("Cascadia Mono")}*{box-sizing:border-box}body{margin:0;background:#101315;color:#F4F0E7;font-family:"Microsoft YaHei",sans-serif}#root{position:relative;width:1080px;height:1920px;overflow:hidden}.base{position:absolute;inset:0}.grid{position:absolute;inset:0}.clip{position:absolute}.scene{inset:0}.masthead{display:flex;align-items:flex-start;gap:16px;font-family:"Cascadia Mono",monospace}.masthead span{font-weight:800}.masthead i{margin-left:auto;font-style:normal}.scene-tag{position:absolute}.evidence{position:absolute;overflow:hidden}.evidence-rail{display:flex;align-items:center}.macos-controls{display:flex;align-items:center}.macos-controls em{display:block;border-radius:50%}.evidence-media{position:absolute}.evidence-video{position:absolute}.media-shell{position:absolute}.pan-shell{position:absolute;overflow:hidden}.pan-shell .pan-media{position:absolute}.media-tail{position:absolute;opacity:0}.fact{position:absolute}.explainer{position:relative}.caption{position:absolute}.caption span{display:inline-block}.footer{position:absolute}</style></head><body><div id="root" data-composition-id="ai-daily-video" data-template="ai-product-reel" data-template-version="1" data-start="0" data-width="1080" data-height="1920" data-duration="${duration}" data-fps="30"><div class="base"></div><div class="grid" data-layout-ignore></div>${sceneHtml}${directVideos}${captions}<div class="footer">AIBYTE / SIGNAL DESK</div><audio id="voiceover" src="assets/voiceover.mp3" data-start="0" data-duration="${duration}" data-track-index="10000" data-volume="1"></audio></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});document.querySelectorAll('.scene').forEach((scene)=>{const t=Number(scene.dataset.start);const explainer=scene.querySelector('.explainer');if(explainer){tl.fromTo(explainer,{y:18},{y:0,duration:.28,ease:'power3.out'},t+.25);const nodes=explainer.querySelectorAll('[data-motion-node]');if(nodes.length)tl.fromTo(nodes,{scale:.72},{scale:1,duration:.24,stagger:.08,ease:'back.out(1.6)'},t+.38);const lines=explainer.querySelectorAll('[data-motion-line]');if(lines.length)tl.fromTo(lines,{scaleX:0},{scaleX:1,duration:.25,stagger:.08,ease:'power2.out'},t+.42);const fills=explainer.querySelectorAll('[data-motion-fill]');if(fills.length)tl.fromTo(fills,{scaleX:0},{scaleX:.42,duration:.42,ease:'power2.out'},t+.42);const bars=explainer.querySelectorAll('.token-bars b');if(bars.length)tl.fromTo(bars,{scaleY:.12},{scaleY:1,duration:.2,stagger:.08,ease:'back.out(1.4)'},t+.42);}const pan=scene.querySelector('.pan-media');if(pan){const pct=Number(pan.dataset.panPercent||0);tl.fromTo(pan,{yPercent:0},{yPercent:-pct,duration:Math.max(1,Number(scene.dataset.duration)-.4),ease:'none'},t+.4);}const tail=scene.querySelector('.media-tail');if(tail){const tailStart=Number(tail.dataset.tailStart||0);tl.fromTo(tail,{opacity:0},{opacity:1,duration:.28,ease:'power2.out'},t+tailStart);}});document.querySelectorAll('.evidence-video').forEach((video)=>{const start=Number(video.dataset.start);const clip=Number(video.dataset.mediaDuration);if(Number.isFinite(clip))tl.set(video,{visibility:'hidden'},start+clip);});tl.to('.grid',{backgroundPosition:'88px 88px',duration:${duration},ease:'none'},0);window.__timelines['ai-daily-video']=tl;</script></body></html>`;
const techStyle = `.base{background:radial-gradient(circle at 82% 14%,rgba(124,231,255,.16) 0,rgba(124,231,255,0) 28%),radial-gradient(circle at 8% 86%,rgba(255,184,107,.08) 0,rgba(255,184,107,0) 24%),#0A1017}.grid{opacity:.22;background-image:linear-gradient(rgba(40,64,82,.46) 1px,rgba(40,64,82,0) 1px),linear-gradient(90deg,rgba(40,64,82,.46) 1px,rgba(40,64,82,0) 1px);background-size:120px 120px}.scene{padding:72px 54px 140px;background:#0A1017}.masthead{position:absolute;left:54px;right:54px;top:52px;height:54px;z-index:80;align-items:center;padding:10px 16px;border-radius:4px;background:rgba(10,16,23,.9);font-size:19px;letter-spacing:1.8px}.masthead:after{content:"";position:absolute;left:0;right:0;bottom:-12px;height:1px;background:rgba(124,231,255,.38)}.masthead span{color:#7CE7FF}.masthead b{color:#F4F7FA;font-weight:500}.masthead i{color:#AAB8C4}.scene-tag{position:absolute;left:54px;top:148px;z-index:82;display:flex;align-items:baseline;gap:18px;padding:8px 14px;border-radius:4px;background:rgba(10,16,23,.9);color:#F4F7FA;text-shadow:none}.scene-tag small{color:#7CE7FF;font:700 17px "Cascadia Mono",monospace;letter-spacing:2px}.scene-tag strong{color:#F4F7FA;font-size:30px;line-height:1.1;font-weight:700}.evidence{position:absolute;inset:0;height:1920px;border:0;border-radius:0;background:#0A1017;box-shadow:none;z-index:10}.evidence-rail{position:absolute;left:54px;right:54px;top:122px;z-index:70;height:32px;padding:0;background:none;color:#AAB8C4}.evidence-rail b{font-size:15px;color:#AAB8C4}.macos-controls{display:none}.evidence-media{top:0;height:100%;object-fit:cover}.evidence-video{left:0;top:0;width:1080px;height:1920px;object-fit:cover;background:#0A1017}.fact{left:54px;right:54px;top:auto;bottom:270px;z-index:75;min-height:0}.fact span{color:#7CE7FF;font-size:17px}.fact h1{max-width:900px;margin-top:12px;font-size:54px;line-height:1.12;text-shadow:0 3px 24px rgba(0,0,0,.65)}.caption{left:54px;right:54px;bottom:70px;text-align:left;padding:0;z-index:100}.caption span{max-width:960px;padding:12px 22px;border-radius:5px;border-left:4px solid #7CE7FF;background:rgba(10,16,23,.88);color:#F4F7FA;font-size:38px;line-height:1.28;box-shadow:0 10px 28px rgba(0,0,0,.28);text-shadow:none}.footer{display:none}.video-scene .evidence{display:block}.video-scene .masthead,.video-scene .scene-tag{display:flex}.video-scene .evidence-rail,.video-scene .fact{display:none}.video-scene .caption span{background:rgba(10,16,23,.82)}`;
const frameStyle = `.base{background:radial-gradient(circle at 78% 8%,rgba(124,231,255,.16) 0,rgba(124,231,255,0) 27%),radial-gradient(circle at 12% 80%,rgba(255,184,107,.07) 0,rgba(255,184,107,0) 25%),#05070B}.grid{top:54%;right:0;bottom:0;left:0;inset:auto 0 0;height:46%;opacity:.56;transform:perspective(580px) rotateX(60deg) scale(1.55);transform-origin:center bottom;background-image:linear-gradient(rgba(124,231,255,.27) 2px,rgba(124,231,255,0) 2px),linear-gradient(90deg,rgba(124,231,255,.27) 2px,rgba(124,231,255,0) 2px);background-size:112px 112px}.scene{padding:0;background:transparent}.masthead{position:absolute;left:54px;right:54px;top:56px;height:40px;z-index:90;align-items:center;padding:0;background:transparent;font-size:18px;letter-spacing:1.8px}.masthead:after{bottom:-16px;background:rgba(124,231,255,.32)}.masthead span{color:#7CE7FF}.masthead b{color:#AAB8C4;font-weight:400}.masthead i{color:#AAB8C4}.scene-tag{display:none}.evidence{position:absolute;left:54px;right:54px;top:208px;height:1050px;border:5px solid #EDF2F4;border-radius:30px;background:#101B25;box-shadow:0 26px 80px rgba(0,0,0,.6);z-index:20;overflow:hidden}.evidence-rail{left:0;right:0;top:0;height:72px;padding:0 26px;background:#EDF2F4;color:#0A1017;display:flex;align-items:center;gap:15px;font:700 18px "Cascadia Mono",monospace;letter-spacing:1px}.evidence-rail b{font:700 18px "Cascadia Mono",monospace;color:#0A1017}.evidence-rail small{margin-left:auto;color:#34444E;font:700 13px "Cascadia Mono",monospace;letter-spacing:1px}.macos-controls{display:flex;gap:12px;align-items:center}.macos-controls em{width:16px;height:16px;border-radius:50%;background:#FF5F57}.macos-controls em:nth-child(2){background:#FEBC2E}.macos-controls em:nth-child(3){background:#28C840}.evidence-media{position:absolute;left:0;top:72px;width:100%;height:973px;object-fit:contain;object-position:center top;background:#101B25}.evidence-video{left:59px;top:285px;width:962px;height:968px;object-fit:contain;object-position:center top;background:#101B25;z-index:30;visibility:hidden}.media-shell{position:absolute;inset:72px 0 0;background:#101B25}.pan-shell{top:72px;bottom:0;overflow:hidden;background:#101B25}.pan-shell .pan-media{top:0;height:auto;min-height:100%;object-fit:contain;object-position:top center}.media-tail{display:none}.fact{position:absolute;left:54px;right:54px;top:1290px;height:365px;min-height:0;padding:28px 34px;background:#EDF2F4;color:#0A1017;border-radius:26px;z-index:60;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,.42)}.fact>span{display:block;color:#0C7185;font:700 15px "Cascadia Mono",monospace;letter-spacing:1.8px}.fact h1{display:none}.explainer{position:relative;margin-top:12px;height:280px;opacity:1}.explainer-label{display:block;color:#34444E;font:700 14px "Cascadia Mono",monospace;letter-spacing:2px}.fact .explainer-label{color:#34444E;font:700 14px "Cascadia Mono",monospace;letter-spacing:2px}.explainer-value{display:block;margin-top:20px;color:#0A1017;font-size:34px;line-height:1.15}.hook-pulse{display:flex;align-items:center;gap:18px;margin-top:28px;height:50px}.hook-pulse i{display:block;width:18px;height:18px;border-radius:50%;background:#0C7185;box-shadow:0 0 0 8px rgba(22,139,163,.12)}.hook-pulse i:nth-child(2){width:28px;height:28px;background:#168BA3;box-shadow:0 0 0 10px rgba(124,231,255,.18)}.price-line,.token-line,.access-line,.route-line,.reset-line{display:flex;align-items:center;gap:16px}.price-line{margin-top:32px;font:700 54px "Cascadia Mono",monospace}.price-line span{color:#34444E;font:700 34px "Cascadia Mono",monospace}.price-line b{color:#087B91}.price-line em{color:#8A3F20;font:700 28px "Cascadia Mono",monospace;font-style:normal}.flow-line{display:inline-block;flex:0 0 68px;width:68px;height:3px;background:#0C7185;transform-origin:left center}.token-line{margin-top:30px;font:700 22px "Cascadia Mono",monospace}.token-line>span{color:#34444E;font:700 20px "Cascadia Mono",monospace}.token-line strong{color:#0A1017;font-size:26px}.token-bars{display:flex;align-items:flex-end;gap:5px;height:34px}.token-bars b{display:block;width:12px;height:28px;background:#168BA3;transform-origin:center bottom}.token-bars b:nth-child(2){height:22px}.token-bars b:nth-child(3){height:30px}.token-bars b:nth-child(4){height:18px}.access-line{margin-top:42px;gap:12px;font:700 22px "Cascadia Mono",monospace}.access-line span,.route-line span,.route-line strong,.reset-line span,.reset-line strong{display:inline-flex;align-items:center;min-height:48px;padding:9px 12px;border:2px solid #0C7185;color:#0A1017;background:rgba(124,231,255,.13);white-space:nowrap}.access-line .flow-line{flex-basis:44px;width:44px;height:2px}.route-line{margin-top:36px;gap:10px;font:700 19px "Cascadia Mono",monospace}.route-line strong{color:#0C7185;background:rgba(124,231,255,.2)}.route-line .flow-line{flex:0 0 38px;width:38px;height:auto;border:0;background:transparent;color:#0C7185;font:700 28px "Cascadia Mono",monospace;text-align:center}.ox-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;align-items:end;margin-top:34px}.ox-metrics strong{display:block;color:#087B91;font:700 62px "Cascadia Mono",monospace;line-height:1}.ox-metrics span{display:block;margin-top:8px;color:#34444E;font:700 13px "Cascadia Mono",monospace;letter-spacing:1px}.uncertain-line{display:flex;align-items:center;gap:14px;margin-top:30px;color:#B7473A;font:700 19px "Cascadia Mono",monospace}.fact .uncertain-line span{color:inherit;font:inherit;display:inline-flex}.uncertain-line i{display:flex;width:30px;height:30px;align-items:center;justify-content:center;border:2px solid #B7473A;border-radius:50%;font-style:normal}.reset-line{margin-top:42px;gap:12px;font:700 20px "Cascadia Mono",monospace}.reset-line>span{border:0;background:transparent;padding:0;min-height:0;color:#34444E}.reset-line strong{color:#0C7185;background:rgba(124,231,255,.2)}.usage-track{display:block;width:230px;height:10px;overflow:hidden;background:#C8D3D9;border-radius:5px}.usage-track b{display:block;width:100%;height:100%;background:#C96B2F;transform-origin:left center}.reset-line .bank-node{border-color:#8A3F20;background:rgba(215,121,60,.15);color:#8A3F20}.explainer-default .explainer-value{margin-top:34px}.caption{left:54px;right:54px;bottom:64px;z-index:100;text-align:left;padding:0}.caption span{display:inline-block;max-width:972px;padding:10px 18px;border-left:4px solid #7CE7FF;border-radius:4px;background:rgba(5,7,11,.93);color:#F4F7FA;font-size:36px;font-weight:700;line-height:1.28;box-shadow:0 10px 26px rgba(0,0,0,.36);text-shadow:none}.footer{display:none}.video-scene .evidence{display:block}.video-scene .masthead{display:flex}.video-scene .scene-tag{display:none}.video-scene .evidence-rail{display:flex}.video-scene .fact{display:block}.video-scene .caption span{background:rgba(5,7,11,.93)}`;
const typeScaleOverrides = `.evidence-video{object-fit:cover;object-position:center top;border-radius:0 0 22px 22px;overflow:hidden}.masthead{font-size:24px}.fact>span{font-size:19px}.fact .explainer-label{font-size:18px}.explainer{height:260px}.explainer-value{font-size:40px}.price-line{font-size:58px}.price-line span{font-size:38px}.price-line em{font-size:31px}.token-line{font-size:25px}.token-line>span{font-size:23px}.token-line strong{font-size:30px}.access-line{font-size:25px}.route-line{font-size:23px}.ox-metrics>div{text-align:left}.ox-metrics span{font-size:16px}.uncertain-line{font-size:22px}.reset-line{font-size:24px}.caption{bottom:112px}`;
const finalizedRoot = root
  .replace('color:#596060;font:700 24px', 'color:#B7BBB6;font:700 24px')
  .replace('.evidence-video{left:67px;top:268px;width:946px;height:882px;', '.evidence-video{left:0;top:0;width:1080px;height:1920px;')
  .replace('</style>', '.video-scene .evidence,.video-scene .fact,.video-scene .masthead,.video-scene~.footer{display:none}</style>')
  .replace("tl.fromTo(tail,{opacity:0},{opacity:1,duration:.28,ease:'power2.out'},t+tailStart)", "tl.set(tail,{opacity:1},t+tailStart)")
  .replace("tl.set(tail,{opacity:1},t+tailStart)", "tl.set(tail,{opacity:1},t+tailStart);document.querySelectorAll('.evidence-video').forEach((video)=>{if(Number(video.dataset.start)===t)tl.set(video,{visibility:'hidden'},t+tailStart);})")
  .replace('</style>', '.signal-card .card-kicker{color:#596060}</style>')
  .replace('<div class="footer">AIBYTE / SIGNAL DESK</div>', `<div id="footer" class="clip footer" data-start="0" data-duration="${duration}" data-track-index="899">AIBYTE / AI TECH UPDATE</div>`)
  .replace('</style>', `${techStyle}${frameStyle}${typeScaleOverrides}</style>`)
  .replace('</style>', '.evidence-video{opacity:0}</style>')
  .replace('</body>', `<script>(()=>{const mediaTl=window.__timelines['ai-daily-video'];document.querySelectorAll('.evidence-video').forEach((video)=>{const start=Number(video.dataset.start);const clip=Number(video.dataset.mediaDuration);mediaTl.set(video,{visibility:'visible',opacity:1},start);if(Number.isFinite(clip))mediaTl.set(video,{visibility:'hidden',opacity:0},start+clip);});})();</script></body>`)
  .replace('</body>', '<script>document.querySelectorAll(".evidence-video").forEach((video)=>{const start=Number(video.dataset.start);const clip=Number(video.dataset.mediaDuration);const mediaTl=window.__timelines["ai-daily-video"];mediaTl.set(video,{opacity:1},start);if(Number.isFinite(clip))mediaTl.set(video,{opacity:0},start+clip);});</script></body>');
const forbiddenOnScreenNotes = /示意画面|官方声明\s*关联待确认|关联待确认/;
if (forbiddenOnScreenNotes.test(finalizedRoot)) throw new Error('Internal material-verification notes must not be rendered on screen.');
if (finalizedRoot.includes("scene.querySelector('.evidence')") || finalizedRoot.includes("scene.querySelector('.fact')")) throw new Error('Scene parent transitions are disabled in ai-product-reel v1.');
if (!finalizedRoot.includes('.evidence-video{object-fit:cover;object-position:center top') || !finalizedRoot.includes('.evidence{position:absolute;left:54px;right:54px;top:208px;height:1050px')) throw new Error('ai-product-reel v1 media-window contract is missing.');
fs.writeFileSync(path.join(compositionDir, 'index.html'), finalizedRoot, 'utf8');
console.log(path.join(compositionDir, 'index.html'));
