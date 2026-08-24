import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const articlePath = process.argv[2];
if (!articlePath || !process.argv.includes('--approved')) throw new Error('Rendering is gated. Usage: node render.mjs <article.md> --approved');
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(path.dirname(path.resolve(articlePath)), '..', 'video');
const scriptPath = path.join(outputDir, 'script.md');
const storyboardPath = path.join(outputDir, 'storyboard.json');
if (!fs.existsSync(scriptPath) || !fs.existsSync(storyboardPath)) throw new Error(`Review package missing. Run: node "${path.join(skillDir, 'scripts', 'prepare.mjs')}" "${articlePath}"`);
const run = (command, args, options = {}) => { const result = spawnSync(command, args, { stdio: 'inherit', ...options }); if (result.status !== 0) throw new Error(`${command} failed with code ${result.status}`); };
const pythonCommand = process.env.AI_DAILY_VIDEO_PYTHON || (process.platform === 'win32' ? (spawnSync('where.exe', ['py'], { stdio: 'ignore' }).status === 0 ? 'py' : 'python') : 'python3');
const bundleDir = path.resolve(outputDir, '..', '..', '..', '..');
const runtimeDir = path.join(bundleDir, 'dependency', 'ai-daily-video-runtime');
if (!fs.existsSync(path.join(runtimeDir, 'node_modules', 'hyperframes'))) { fs.mkdirSync(runtimeDir, { recursive: true }); run('npm.cmd', ['install', '--no-audit', '--no-fund', 'hyperframes@latest', 'gsap@3.14.2'], { cwd: runtimeDir }); }
const audioPath = path.join(outputDir, 'voiceover.mp3');
const timestampsPath = path.join(outputDir, 'word-timestamps.json');
const timing = JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));
const ffmpegCommand = process.env.AI_DAILY_VIDEO_FFMPEG || 'ffmpeg';
const canonicalText = (filePath) => fs.readFileSync(filePath, 'utf8')
  .split(/\r?\n/)
  .filter((line) => !line.startsWith('#') && !line.startsWith('预计时长'))
  .join('');
const normalize = (text) => [...text.toLowerCase()].filter((char) => /[\p{L}\p{N}]/u.test(char)).join('');
run('node', [path.join(skillDir, 'scripts', 'tts.mjs'), scriptPath, audioPath]);
run(pythonCommand, process.platform === 'win32' && pythonCommand === 'py' ? ['-3', path.join(skillDir, 'scripts', 'transcribe.py'), audioPath, timestampsPath] : [path.join(skillDir, 'scripts', 'transcribe.py'), audioPath, timestampsPath]);
run('node', [path.join(skillDir, 'scripts', 'build-subtitles.mjs'), timestampsPath, path.join(outputDir, 'captions.srt'), path.join(outputDir, 'captions.ass'), scriptPath]);
const comparison = JSON.parse(fs.readFileSync(path.join(outputDir, 'transcription-comparison.json'), 'utf8'));
const captions = JSON.parse(fs.readFileSync(path.join(outputDir, 'captions.json'), 'utf8')).groups.map((group) => group.text).join('');
if (!comparison.alignmentValid) throw new Error('faster-whisper timestamps could not be reliably aligned to script.md.');
if (normalize(canonicalText(scriptPath)) !== normalize(captions)) throw new Error('Generated captions do not match the confirmed script.md.');
run('node', [path.join(skillDir, 'scripts', 'build-composition.mjs'), storyboardPath, timestampsPath, outputDir]);
const compositionDir = path.join(outputDir, 'hyperframes');
const cli = path.join(runtimeDir, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes');
run(cli, ['check'], { cwd: compositionDir });
run(cli, ['snapshot', '--at', '5,30,50'], { cwd: compositionDir });
const renderedPath = path.join(outputDir, 'final.mp4');
run(cli, ['render', '--quality', 'high', '--output', renderedPath], { cwd: compositionDir });
const targetDuration = Number(timing.segments?.at(-1)?.end || timing.duration || 0);
if (!Number.isFinite(targetDuration) || targetDuration <= 0) throw new Error('Word timestamps do not contain a valid final duration.');
const trimmedPath = path.join(outputDir, 'final-timed.mp4');
run(ffmpegCommand, ['-hide_banner', '-loglevel', 'error', '-y', '-i', renderedPath, '-t', targetDuration.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', trimmedPath]);
fs.rmSync(renderedPath, { force: true });
fs.renameSync(trimmedPath, renderedPath);
run('node', [path.join(skillDir, 'scripts', 'verify.mjs'), renderedPath, outputDir]);
