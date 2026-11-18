// Renders every tutorial in Spanish and English into the app's public folder.
//   npm run render
// Uses the Chrome that Remotion downloads, or REMOTION_BROWSER if set (a Chrome Headless Shell binary).
import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'

const here = path.dirname(new URL(import.meta.url).pathname)
const out = path.join(here, '..', 'frontend', 'public', 'tutorials')
fs.mkdirSync(out, { recursive: true })
const browserExecutable = process.env.REMOTION_BROWSER || null
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))

/**
 * Re-encodes to standard-range yuv420p with the index at the front ("faststart"), so the video
 * plays with correct colours on every device and starts before it has fully downloaded.
 */
function finish(file) {
  const tmp = file.replace(/\.mp4$/, '.tmp.mp4')
  execFileSync('npx', ['remotion', 'ffmpeg', '-v', 'error', '-y', '-i', file, '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-an', tmp], { cwd: here, stdio: 'inherit' })
  fs.renameSync(tmp, file)
}

if (process.argv.includes('--finish-only')) {
  for (const f of fs.readdirSync(out).filter((f) => f.endsWith('.mp4'))) { finish(path.join(out, f)); console.log(`✔ ${f}`) }
  process.exit(0)
}

const serveUrl = await bundle({ entryPoint: path.join(here, 'src', 'index.ts'), publicDir: path.join(here, 'public') })
for (const id of ['registrar-ofrenda', 'informe-mensual', 'conteo-domingo', 'nuevo-miembro', 'corregir-ofrenda', 'constancias']) {
  if (only.length && !only.includes(id)) continue
  for (const lang of ['es', 'en']) {
    const inputProps = { video: id, lang }
    const composition = await selectComposition({ serveUrl, id, inputProps, browserExecutable })
    const file = path.join(out, `${id}.${lang}.mp4`)
    let last = -1
    await renderMedia({
      composition, serveUrl, inputProps, browserExecutable, codec: 'h264', crf: 26, pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 88,
      outputLocation: file,
      onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`\r${id}.${lang}: ${p * 10}%`) } },
    })
    finish(file)
    // Poster: a frame from the first step, shown before the video plays.
    await renderStill({ composition, serveUrl, inputProps, browserExecutable, frame: 60, output: path.join(out, `${id}.${lang}.jpg`), imageFormat: 'jpeg', jpegQuality: 80 })
    console.log(`\r✔ ${path.relative(path.join(here, '..'), file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`)
  }
}
