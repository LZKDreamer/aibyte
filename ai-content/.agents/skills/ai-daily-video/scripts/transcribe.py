import json
import os
import sys

if len(sys.argv) != 3:
    raise SystemExit('Usage: transcribe.py <voiceover.mp3> <word-timestamps.json>')
audio_path, output_path = sys.argv[1:]
model_path = os.environ.get('AI_DAILY_VIDEO_WHISPER_MODEL')
if not model_path:
    raise SystemExit('请设置 AI_DAILY_VIDEO_WHISPER_MODEL 指向 faster-whisper 模型目录')
if not os.path.exists(model_path):
    raise SystemExit(f'faster-whisper model not found: {model_path}')
from faster_whisper import WhisperModel

model = WhisperModel(model_path, device='cpu', compute_type='int8')
segments, info = model.transcribe(audio_path, language='zh', word_timestamps=True, vad_filter=True)
items = []
for segment in segments:
    words = []
    for word in segment.words or []:
        words.append({'word': word.word.strip(), 'start': round(word.start, 3), 'end': round(word.end, 3)})
    items.append({'text': segment.text.strip(), 'start': round(segment.start, 3), 'end': round(segment.end, 3), 'words': words})
payload = {'language': info.language, 'duration': round(info.duration, 3), 'segments': items}
with open(output_path, 'w', encoding='utf-8') as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
