import fs from 'node:fs';

const [input, srtPath, assPath, scriptPath] = process.argv.slice(2);
if (!input || !srtPath || !assPath || !scriptPath) throw new Error('Usage: node build-subtitles.mjs <timestamps.json> <captions.srt> <captions.ass> <script.md>');
const timing = JSON.parse(fs.readFileSync(input, 'utf8'));
const narration = fs.readFileSync(scriptPath, 'utf8')
  .replace(/^#.*$/gm, '').replace(/^预计时长.*$/gm, '').replace(/^##.*$/gm, '').replace(/\n+/g, ' ').trim();
const sentences = narration.match(/[^。！？]+[。！？]/g) || [];
const normalize = (text) => text
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]/gu, '')
  .replace(/，|。|！|？/g, '');
const distance = (left, right) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = row[rightIndex];
      row[rightIndex] = Math.min(row[rightIndex] + 1, row[rightIndex - 1] + 1, diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length];
};
const plans = new Map();
const align = (sentenceIndex, segmentIndex) => {
  const key = `${sentenceIndex}:${segmentIndex}`;
  if (plans.has(key)) return plans.get(key);
  if (sentenceIndex === sentences.length) return segmentIndex === timing.segments.length ? { score: 0, groups: [] } : null;
  const remainingSentences = sentences.length - sentenceIndex - 1;
  const remainingSegments = timing.segments.length - segmentIndex;
  let best = null;
  for (let take = 1; take <= Math.min(3, remainingSegments - remainingSentences); take++) {
    const assigned = timing.segments.slice(segmentIndex, segmentIndex + take);
    const scriptText = normalize(sentences[sentenceIndex]);
    const transcriptText = normalize(assigned.map((segment) => segment.text).join(''));
    const similarity = 1 - distance(scriptText, transcriptText) / Math.max(scriptText.length, transcriptText.length, 1);
    const next = align(sentenceIndex + 1, segmentIndex + take);
    if (!next) continue;
    const candidate = { score: next.score + (1 - similarity) + (take - 1) * .015, groups: [{ assigned, similarity }, ...next.groups] };
    if (!best || candidate.score < best.score) best = candidate;
  }
  plans.set(key, best);
  return best;
};
const alignment = align(0, 0);
if (!alignment) throw new Error('Unable to align faster-whisper segments to the confirmed script.');
const comparison = sentences.map((scriptText, index) => {
  const { assigned, similarity } = alignment.groups[index];
  const transcriptionText = assigned.map((segment) => segment.text).join(' ');
  return {
    index: index + 1,
    start: assigned[0].start,
    end: assigned.at(-1).end,
    transcriptionSegments: assigned.map((segment) => timing.segments.indexOf(segment) + 1),
    scriptText,
    transcriptionText,
    matches: normalize(scriptText) === normalize(transcriptionText),
    similarity: Number(similarity.toFixed(3)),
    subtitleText: scriptText,
  };
});
fs.writeFileSync(srtPath.replace(/captions\.srt$/i, 'transcription-comparison.json'), JSON.stringify({
  canonicalSource: scriptPath,
  policy: 'script.md is canonical text; faster-whisper supplies timing only.',
  comparedAt: new Date().toISOString(),
  alignmentValid: comparison.every((item) => item.similarity >= .5),
  segments: comparison,
}, null, 2), 'utf8');
if (comparison.some((item) => item.similarity < .5)) throw new Error('faster-whisper segments cannot be reliably aligned to the confirmed script; see transcription-comparison.json.');
const formatSrt = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23).replace('.', ',');
const formatAss = (seconds) => { const h = Math.floor(seconds / 3600); const m = Math.floor(seconds / 60) % 60; const s = seconds % 60; return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
const splitCaption = (text) => {
  const clean = text.trim();
  const clauses = clean.match(/[^，；、。！？]+[，；、。！？]?/g) || [clean];
  const chunks = [];
  let current = '';
  const visualLength = (value) => [...value].reduce((length, char) => length + (/[A-Za-z0-9.+#-]/.test(char) ? .58 : 1), 0);
  for (const clause of clauses) {
    if (current && visualLength(current) + visualLength(clause) > 42) {
      chunks.push(current);
      current = clause;
    } else {
      current += clause;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};
const textWeight = (text) => Math.max(1, normalize(text).length);
const timeChunks = (segment, chunks) => {
  const words = segment.transcriptionSegments.flatMap((index) => timing.segments[index - 1].words || []);
  if (!words.length) {
    const span = Math.max(.2, segment.end - segment.start);
    return chunks.map((text, index) => ({ start: segment.start + span * index / chunks.length, end: segment.start + span * (index + 1) / chunks.length, text }));
  }
  const totalCaptionWeight = chunks.reduce((sum, text) => sum + textWeight(text), 0);
  const totalWordWeight = words.reduce((sum, word) => sum + textWeight(word.word), 0);
  let captionWeight = 0;
  let wordWeight = 0;
  let wordIndex = 0;
  return chunks.map((text, chunkIndex) => {
    captionWeight += textWeight(text);
    const targetWeight = totalWordWeight * captionWeight / totalCaptionWeight;
    const firstWord = wordIndex;
    if (chunkIndex === chunks.length - 1) {
      wordIndex = words.length;
    } else {
      while (wordIndex < words.length - 1 && wordWeight < targetWeight) {
        wordWeight += textWeight(words[wordIndex].word);
        wordIndex += 1;
      }
    }
    const assigned = words.slice(firstWord, wordIndex);
    const first = assigned[0] || words[Math.min(firstWord, words.length - 1)];
    const last = assigned.at(-1) || first;
    return { start: first.start, end: Math.max(first.end, last.end), text };
  });
};
const groups = comparison.flatMap((segment) => {
  const chunks = splitCaption(segment.subtitleText);
  return timeChunks(segment, chunks);
});
fs.writeFileSync(srtPath, groups.map((group, index) => `${index + 1}\n${formatSrt(group.start)} --> ${formatSrt(group.end)}\n${group.text}\n`).join('\n'), 'utf8');
const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Microsoft YaHei,64,&H00FFFFFF,&H0000FFFF,&H0010151C,&H9A10151C,1,0,0,0,100,100,0,0,1,3,0,2,90,90,280,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n` + groups.map((group) => `Dialogue: 0,${formatAss(group.start)},${formatAss(group.end)},Default,,0,0,0,,${group.text.replace(/\n/g, '')}`).join('\n');
fs.writeFileSync(assPath, ass, 'utf8');
fs.writeFileSync(srtPath.replace(/\.srt$/i, '.json'), JSON.stringify({ groups }, null, 2), 'utf8');
