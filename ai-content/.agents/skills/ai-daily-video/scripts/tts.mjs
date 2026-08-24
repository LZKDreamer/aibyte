import fs from 'node:fs';

const [scriptPath, outPath] = process.argv.slice(2);
if (!scriptPath || !outPath) throw new Error('Usage: node tts.mjs <script.md> <voiceover.mp3>');
const narration = fs.readFileSync(scriptPath, 'utf8').replace(/^#.*$/gm, '').replace(/^预计时长.*$/gm, '').replace(/^##.*$/gm, '').replace(/\n+/g, ' ').trim();
const base = (process.env.AI_DAILY_VIDEO_TTS_URL || 'https://tts.wangwangit.com/v1/audio/speech').replace(/\/$/, '');
const response = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: narration, voice: 'zh-CN-XiaomengNeural', speed: 1.15, pitch: '25', style: 'newscast' }) });
if (!response.ok) throw new Error(`TTS failed (${response.status}): ${await response.text()}`);
const data = Buffer.from(await response.arrayBuffer());
if (data.length < 512) throw new Error('TTS returned an unexpectedly small audio response.');
fs.writeFileSync(outPath, data);
