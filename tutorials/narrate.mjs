// Adds a spoken voice to every tutorial video, in Spanish and English, using Gemini text-to-speech.
//   npm run narrate                 → all videos (run `npm run render` first)
//   npm run narrate -- constancias  → just one
// Uses GEMINI_API_KEY from the environment or from backend/.env. Each sentence is generated once and
// kept in tutorials/narration/, so running it again only pays for sentences that changed.
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { execFileSync } from 'child_process'

const here = path.dirname(new URL(import.meta.url).pathname)
const videos = process.env.TUTORIALS_DIR || path.join(here, '..', 'frontend', 'public', 'tutorials')
const cacheDir = path.join(here, 'narration')
fs.mkdirSync(cacheDir, { recursive: true })

// Same timing as src/Tutorial.tsx (30 fps): a title, one step per screenshot, then the closing card.
const FPS = 30
const INTRO = 105
const STEP = 165
const OUTRO = 120

function envFromFile(name) {
  try {
    const line = fs.readFileSync(path.join(here, '..', 'backend', '.env'), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`))
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : ''
  } catch { return '' }
}
const key = process.env.GEMINI_API_KEY || envFromFile('GEMINI_API_KEY')
const base = (process.env.GEMINI_BASE_URL || envFromFile('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'
const voice = process.env.GEMINI_TTS_VOICE || 'Sulafat'
if (!key || /^(tu|your)[-_]/i.test(key)) {
  console.error('✖ Falta GEMINI_API_KEY (en backend/.env o en el entorno). / GEMINI_API_KEY is missing.')
  process.exit(1)
}

const STYLE = {
  es: 'Lee en español latinoamericano, con voz cálida, clara y pausada, como quien enseña con paciencia a una persona mayor',
  en: 'Read in a warm, clear and unhurried voice, like someone patiently teaching an older person',
}

/** Text to speech for one sentence → raw 16-bit PCM and its sample rate (cached on disk). */
async function speak(text, lang) {
  const id = crypto.createHash('sha1').update([model, voice, lang, text].join('|')).digest('hex').slice(0, 16)
  const file = path.join(cacheDir, `${id}.pcm`)
  const meta = `${file}.rate`
  if (fs.existsSync(file) && fs.existsSync(meta)) return { file, rate: Number(fs.readFileSync(meta, 'utf8')) }
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${base}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${STYLE[lang]}: ${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    })
    const data = await res.json().catch(() => ({}))
    const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
    if (res.ok && part) {
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000)
      fs.writeFileSync(file, Buffer.from(part.inlineData.data, 'base64'))
      fs.writeFileSync(meta, String(rate))
      return { file, rate }
    }
    // The free tier allows only a few requests per minute: wait and try again.
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const wait = 15 * attempt
      process.stdout.write(`  (Gemini pide esperar ${wait} s…)\n`)
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    throw new Error(`Gemini TTS ${res.status}: ${data?.error?.message || 'no audio'}`)
  }
}

const ffmpeg = (args) => {
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' }) } catch (e) {
    if (e.code !== 'ENOENT') throw e
    execFileSync('npx', ['remotion', 'ffmpeg', '-v', 'error', '-y', ...args], { cwd: here, stdio: 'inherit' })
  }
}

const { scripts } = await import(path.join(here, 'src', 'script.ts'))
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))

for (const [id, s] of Object.entries(scripts)) {
  if (only.length && !only.includes(id)) continue
  for (const lang of ['es', 'en']) {
    const video = path.join(videos, `${id}.${lang}.mp4`)
    if (!fs.existsSync(video)) { console.log(`– ${id}.${lang}.mp4 no existe todavía (npm run render)`); continue }
    // What is said and when: the title, each step's caption, and the closing sentence.
    const lines = [
      { text: s.title[lang], at: 0.5, room: INTRO / FPS - 0.8 },
      ...s.steps.map((st, i) => ({ text: st.caption[lang], at: (INTRO + i * STEP + 8) / FPS, room: STEP / FPS - 0.5 })),
      { text: s.outro[lang], at: (INTRO + s.steps.length * STEP + 12) / FPS, room: OUTRO / FPS - 0.6 },
    ]
    const inputs = []
    const filters = []
    for (const [n, line] of lines.entries()) {
      const clean = line.text.replace(/[«»“”"]/g, '')
      const { file, rate } = await speak(clean, lang)
      const seconds = fs.statSync(file).size / 2 / rate
      // A sentence longer than its step is spoken a little faster (never more than 1.3×) so it ends in time.
      const tempo = Math.min(1.3, Math.max(1, seconds / line.room))
      inputs.push('-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', file)
      filters.push(`[${n + 1}:a]${tempo > 1 ? `atempo=${tempo.toFixed(3)},` : ''}adelay=${Math.round(line.at * 1000)}:all=1[a${n}]`)
    }
    const mix = `${filters.join(';')};${lines.map((_, n) => `[a${n}]`).join('')}amix=inputs=${lines.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11[voice]`
    const tmp = video.replace(/\.mp4$/, '.voice.mp4')
    // The picture is copied untouched; only the voice track is added (or replaced).
    ffmpeg(['-i', video, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[voice]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-movflags', '+faststart', '-shortest', tmp])
    fs.renameSync(tmp, video)
    console.log(`✔ ${id}.${lang}.mp4 con voz (${lines.length} frases)`)
  }
}
