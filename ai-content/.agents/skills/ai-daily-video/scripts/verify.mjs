import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const [videoPath, outputDir] = process.argv.slice(2);
if (!videoPath || !outputDir) throw new Error('Usage: node verify.mjs <final.mp4> <output-dir>');
const compositionPath = path.join(outputDir, 'hyperframes', 'index.html');
if (fs.existsSync(compositionPath)) {
  const composition = fs.readFileSync(compositionPath, 'utf8');
  if (!composition.includes('data-template="ai-product-reel"') || !composition.includes('data-template-version="1"')) throw new Error('Composition is not locked to ai-product-reel v1.');
  if (/示意画面|官方声明\s*关联待确认|关联待确认/.test(composition)) throw new Error('Composition contains an internal material-verification note.');
  if (composition.includes("scene.querySelector('.evidence')") || composition.includes("scene.querySelector('.fact')")) throw new Error('Composition contains an unsynchronised scene parent transition.');
  if (!composition.includes('.evidence-video{object-fit:cover;object-position:center top') || !composition.includes('caption{bottom:112px}')) throw new Error('Composition is missing the locked media or caption layout.');
}
const ffprobeCommand = process.env.AI_DAILY_VIDEO_FFPROBE || 'ffprobe';
const ffmpegCommand = process.env.AI_DAILY_VIDEO_FFMPEG || 'ffmpeg';
const probe = spawnSync(ffprobeCommand, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,duration', '-of', 'json', videoPath], { encoding: 'utf8' });
if (probe.status !== 0) throw new Error(probe.stderr || 'ffprobe failed');
const metadata = JSON.parse(probe.stdout);
const stream = metadata.streams.find((item) => item.codec_type === 'video');
const audio = metadata.streams.find((item) => item.codec_type === 'audio');
if (!stream || stream.width !== 1080 || stream.height !== 1920) throw new Error(`Unexpected frame size: ${stream?.width}x${stream?.height}`);
if (!audio) throw new Error('Rendered video has no audio stream.');
const duration = Number(metadata.format.duration);
if (!Number.isFinite(duration) || duration <= 1 || fs.statSync(videoPath).size < 10_000) throw new Error('Rendered video is empty or too short.');
const timingPath = path.join(outputDir, 'word-timestamps.json');
if (fs.existsSync(timingPath)) {
  const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
  const targetDuration = Number(timing.segments?.at(-1)?.end || timing.duration || 0);
  const audioDuration = Number(audio.duration || 0);
  if (targetDuration > 0 && (!audioDuration || Math.abs(audioDuration - targetDuration) > 0.1 || duration < targetDuration - 0.05 || duration > targetDuration + 0.2)) {
    throw new Error(`Final duration is not aligned to captions: video=${duration.toFixed(3)}s audio=${audioDuration.toFixed(3)}s target=${targetDuration.toFixed(3)}s`);
  }
}
const samples = [duration * .15, duration * .5, duration * .85].map((at, index) => path.join(outputDir, `verification-frame-${index + 1}.jpg`));
for (const [index, frame] of samples.entries()) {
  const at = duration * [.15, .5, .85][index];
  const result = spawnSync(ffmpegCommand, ['-hide_banner', '-loglevel', 'error', '-ss', String(at), '-i', videoPath, '-frames:v', '1', '-q:v', '3', frame, '-y'], { encoding: 'utf8' });
  if (result.status !== 0 || !fs.existsSync(frame) || fs.statSync(frame).size < 4_000) throw new Error(`Frame validation failed at ${index + 1}: ${result.stderr}`);
  const raw = spawnSync(ffmpegCommand, ['-hide_banner', '-loglevel', 'error', '-ss', String(at), '-i', videoPath, '-vf', 'scale=32:57,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], { encoding: null });
  const pixels = raw.stdout ? Buffer.from(raw.stdout) : Buffer.alloc(0);
  if (raw.status !== 0 || pixels.length < 100) throw new Error(`Frame pixel validation failed at ${index + 1}: ${raw.stderr?.toString() || ''}`);
  let sum = 0;
  for (const pixel of pixels) sum += pixel;
  const mean = sum / pixels.length;
  let variance = 0;
  for (const pixel of pixels) variance += (pixel - mean) ** 2;
  variance /= pixels.length;
  if (variance < 0.5) throw new Error(`Frame ${index + 1} is visually blank or uniform (mean=${mean.toFixed(1)}, variance=${variance.toFixed(2)}).`);
}
fs.writeFileSync(path.join(outputDir, 'verification.json'), JSON.stringify({ passed: true, videoPath, duration, width: stream.width, height: stream.height, sampledFrames: samples }, null, 2));
