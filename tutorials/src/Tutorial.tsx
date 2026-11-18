import { useEffect, useState } from 'react'
import { AbsoluteFill, Easing, Img, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { scripts, type Lang } from './script'
import { captures } from './data'

export type TutorialProps = { video: string; lang: Lang }
import type { Box } from './data'


// Timing (30 fps). Slow on purpose: the audience reads captions at their own pace.
const INTRO = 105
const STEP = 165 // per screenshot
const MOVE = 32 // cursor travel and camera move at the start of a step
const CLICK = STEP - 30 // when the click happens
const FADE = 18 // crossfade into the next screenshot after the click
const OUTRO = 120

export const durationFor = (video: string) => INTRO + scripts[video].steps.length * STEP + OUTRO

// Colours from the app (light theme).
const C = { bg: '#f7f2ea', ink: '#2b231b', soft: '#5d5246', accent: '#c2570c', accentSoft: '#fbe5cf', line: '#e4dacb' }

// The app screenshot is shown inside a browser-like window.
const WIN_W = 1560
const SCREEN_W = WIN_W
const BAR = 44

function useFonts() {
  const [handle] = useState(() => delayRender('fonts'))
  useEffect(() => {
    const faces = [new FontFace('Figtree', `url(${staticFile('fonts/figtree.woff2')})`, { weight: '300 900' }), new FontFace('Young Serif', `url(${staticFile('fonts/young-serif.woff2')})`)]
    Promise.all(faces.map((f) => f.load())).then((loaded) => { loaded.forEach((f) => document.fonts.add(f)); continueRender(handle) })
  }, [handle])
}

const ease = Easing.bezier(0.45, 0, 0.2, 1)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Where the "camera" looks for a given target: zoom in on it, never past the screenshot's edges. */
function cameraFor(target: Box | null, scale: number, screenH: number) {
  if (!target) return { z: 1, tx: 0, ty: 0 }
  const cx = (target.x + target.w / 2) * scale
  const cy = (target.y + target.h / 2) * scale
  const w = target.w * scale
  const h = target.h * scale
  const z = Math.max(1, Math.min(1.55, (SCREEN_W * 0.5) / Math.max(w, 1), (screenH * 0.5) / Math.max(h, 1)))
  const tx = Math.min(0, Math.max(SCREEN_W - SCREEN_W * z, SCREEN_W / 2 - cx * z))
  const ty = Math.min(0, Math.max(screenH - screenH * z, screenH * 0.45 - cy * z))
  return { z, tx, ty }
}

function Cursor({ pressed }: { pressed: number }) {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" style={{ transform: `scale(${1 - 0.15 * pressed})`, transformOrigin: '4px 3px', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.35))' }}>
      <path d="M4 3 L4 19 L8.5 14.8 L11.4 21 L14 19.8 L11.2 13.8 L17.5 13.6 Z" fill="#fff" stroke="#1b1611" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function TitleCard({ title, kicker, sub, opacity }: { title: string; kicker: string; sub: string; opacity: number }) {
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity }}>
      <div style={{ textAlign: 'center', maxWidth: 1640, background: 'rgba(255,253,248,.92)', border: `1px solid ${C.line}`, borderRadius: 36, padding: '64px 96px', boxShadow: '0 30px 80px -30px rgba(60,40,20,.45)' }}>
        <Img src={staticFile('brand/logo.svg')} style={{ width: 120, height: 120 }} />
        <div style={{ fontFamily: 'Figtree', fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: C.accent, fontSize: 26, marginTop: 20 }}>{kicker}</div>
        {/* Long titles get a smaller size so the card always fits inside the frame. */}
        <div style={{ fontFamily: 'Young Serif', fontSize: Math.min(84, Math.floor(1380 / (title.length * 0.56))), color: C.ink, marginTop: 14, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontFamily: 'Figtree', fontSize: 34, color: C.soft, margin: '22px auto 0', maxWidth: 1100, textAlign: 'center' }}>{sub}</div>
      </div>
    </AbsoluteFill>
  )
}

export function Tutorial({ video, lang }: TutorialProps) {
  useFonts()
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const script = scripts[video]
  const cap = captures[video][lang]
  const steps = cap.steps
  const scale = SCREEN_W / cap.viewport.width
  const screenH = cap.viewport.height * scale
  const winH = screenH + BAR
  const winTop = 30
  const winLeft = (1920 - WIN_W) / 2
  const es = lang === 'es'

  // Which screenshot we are on, and how far into it.
  const t = frame - INTRO
  const i = Math.max(0, Math.min(steps.length - 1, Math.floor(t / STEP)))
  const local = t - i * STEP
  const inSteps = t >= 0 && t < steps.length * STEP
  const step = script.steps[i]
  const clicks = step.click !== false

  // Camera and cursor glide from the previous step's target to this one.
  const move = ease(Math.min(1, Math.max(0, local / MOVE)))
  const prevTarget = i > 0 ? steps[i - 1].target : null
  const camFrom = i > 0 ? cameraFor(prevTarget, scale, screenH) : { z: 1, tx: 0, ty: 0 }
  const camTo = cameraFor(steps[i].target, scale, screenH)
  // After the last step, zoom back out for the ending.
  const outroT = Math.min(1, Math.max(0, (t - steps.length * STEP) / 30))
  const cam = t >= steps.length * STEP
    ? { z: lerp(camTo.z, 1, ease(outroT)), tx: lerp(camTo.tx, 0, ease(outroT)), ty: lerp(camTo.ty, 0, ease(outroT)) }
    : { z: lerp(camFrom.z, camTo.z, move), tx: lerp(camFrom.tx, camTo.tx, move), ty: lerp(camFrom.ty, camTo.ty, move) }

  const center = (b: Box | null) => (b ? { x: (b.x + b.w / 2) * scale, y: (b.y + b.h / 2) * scale } : { x: SCREEN_W * 0.62, y: screenH * 0.7 })
  const p0 = i > 0 ? center(prevTarget) : { x: SCREEN_W * 0.55, y: screenH * 0.75 }
  const p1 = center(steps[i].target)
  const pt = { x: lerp(p0.x, p1.x, move), y: lerp(p0.y, p1.y, move) }
  const cursor = { x: pt.x * cam.z + cam.tx, y: pt.y * cam.z + cam.ty }

  // Captions sit at the bottom unless the thing to press ends up there; then they move to the top.
  const targetOnScreenY = winTop + BAR + p1.y * camTo.z + camTo.ty
  const captionAtTop = targetOnScreenY > 1080 * 0.6
  const pressed = clicks ? interpolate(local, [CLICK - 4, CLICK, CLICK + 6], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0
  const ripple = clicks ? interpolate(local, [CLICK, CLICK + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0
  const nextOpacity = clicks && i < steps.length - 1 ? interpolate(local, [CLICK + 6, CLICK + 6 + FADE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0
  const highlight = interpolate(local, [MOVE - 6, MOVE + 6, CLICK, CLICK + 4], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const pulse = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 2 * 0.9)
  const target = steps[i].target

  // Intro and outro cards.
  const introOpacity = interpolate(frame, [0, 12, INTRO - 18, INTRO], [0, 1, 1, 0], { extrapolateRight: 'clamp' })
  const outroStart = INTRO + steps.length * STEP
  const outroOpacity = interpolate(frame, [outroStart + 10, outroStart + 30, durationInFrames - 8, durationInFrames], [0, 1, 1, 0.9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const winIn = spring({ frame: frame - 6, fps, config: { damping: 18 } })
  const captionIn = spring({ frame: local - 4, fps, config: { damping: 16 } })
  const blurAmount = interpolate(frame, [0, INTRO - 20, INTRO], [10, 10, 0], { extrapolateRight: 'clamp' }) + outroOpacity * 10

  const shot = (k: number, opacity = 1) => (
    <Img src={staticFile(steps[k].image)} style={{ position: 'absolute', inset: 0, width: SCREEN_W, height: screenH, opacity }} />
  )

  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 0%, #fffaf2 0%, ${C.bg} 60%, #efe4d3 100%)`, fontFamily: 'Figtree' }}>
      {/* Browser-like window with the app inside */}
      <div style={{ position: 'absolute', left: winLeft, top: winTop, width: WIN_W, height: winH, borderRadius: 20, overflow: 'hidden', background: '#fff',
        boxShadow: '0 40px 90px -30px rgba(60,40,20,.5), 0 0 0 1px rgba(60,40,20,.12)', transform: `translateY(${(1 - winIn) * 40}px)`, opacity: winIn }}>
        <div style={{ height: BAR, background: '#f1ebe1', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px' }}>
          {['#ec6a5e', '#f4bf4f', '#61c554'].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
          <div style={{ marginLeft: 22, flex: 1, maxWidth: 560, height: 26, borderRadius: 13, background: '#fff', border: `1px solid ${C.line}`, fontSize: 15, color: C.soft, display: 'flex', alignItems: 'center', paddingLeft: 14 }}>
            sanctuary · {es ? 'tesorería de la iglesia' : 'church treasury'}
          </div>
        </div>
        <div style={{ position: 'relative', width: SCREEN_W, height: screenH, overflow: 'hidden', filter: `blur(${blurAmount}px)` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: screenH, transformOrigin: '0 0', transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})` }}>
            {shot(i)}
            {nextOpacity > 0 && shot(i + 1, nextOpacity)}
            {inSteps && target && highlight > 0 && nextOpacity === 0 && (
              <div style={{ position: 'absolute', left: target.x * scale - 8, top: target.y * scale - 8, width: target.w * scale + 16, height: target.h * scale + 16,
                borderRadius: 14, border: `${3 / cam.z}px solid ${C.accent}`, boxShadow: `0 0 0 ${(6 + 6 * pulse) / cam.z}px rgba(194,87,12,${0.18 * highlight})`, opacity: highlight }} />
            )}
          </div>
          {inSteps && (
            <div style={{ position: 'absolute', left: cursor.x - 6, top: cursor.y - 4 }}>
              {ripple > 0 && ripple < 1 && (
                <span style={{ position: 'absolute', left: 6 - 40 * ripple, top: 4 - 40 * ripple, width: 80 * ripple, height: 80 * ripple, borderRadius: '50%', border: `4px solid ${C.accent}`, opacity: 1 - ripple }} />
              )}
              <Cursor pressed={pressed} />
            </div>
          )}
        </div>
      </div>

      {/* Caption: big, high-contrast, with the step number */}
      {inSteps && (
        <div style={{ position: 'absolute', left: 0, right: 0, ...(captionAtTop ? { top: winTop + BAR + 24 } : { bottom: 34 }), display: 'flex', justifyContent: 'center', opacity: captionIn, transform: `translateY(${(captionAtTop ? -1 : 1) * (1 - captionIn) * 24}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, maxWidth: 1500, background: 'rgba(32,25,19,.92)', color: '#fffaf2', borderRadius: 24, padding: '22px 34px 22px 22px', boxShadow: '0 20px 50px -20px rgba(0,0,0,.6)' }}>
            <span style={{ flexShrink: 0, width: 58, height: 58, borderRadius: 29, background: C.accent, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 30 }}>{i + 1}</span>
            <span style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.25 }}>{step.caption[lang]}</span>
          </div>
        </div>
      )}

      {frame < INTRO && (
        <TitleCard opacity={introOpacity} kicker={es ? 'Sanctuary · Tutorial' : 'Sanctuary · Tutorial'} title={script.title[lang]}
          sub={es ? `En ${script.steps.length} pasos sencillos` : `In ${script.steps.length} simple steps`} />
      )}
      {frame >= outroStart && (
        <TitleCard opacity={outroOpacity} kicker={es ? '¡Listo!' : 'Done!'} title={script.title[lang]} sub={script.outro[lang]} />
      )}
    </AbsoluteFill>
  )
}
