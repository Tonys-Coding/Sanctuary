// Takes the screenshots the tutorial videos are built from, by using the real app like a person would.
//
//   1. Start Sanctuary with the demo church (cd backend && npm run seed && npm run dev; cd frontend && npm run dev)
//   2. npm run capture          (APP_URL=http://localhost:5173 by default)
//
// For every step it saves a screenshot and where the thing being pressed is, so the video can
// move the cursor there. Output: public/screens/<video>/<lang>/<n>.png and src/data/<video>.<lang>.json
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const APP = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
const VIEW = { width: 1440, height: 900 }
const here = path.dirname(new URL(import.meta.url).pathname)

const t = (lang, es, en) => (lang === 'es' ? es : en)

const videos = {
  'registrar-ofrenda': async (p, lang, shot) => {
    await p.goto(`${APP}/`)
    await p.waitForSelector('text=' + t(lang, 'Ofrendas por mes', 'Offerings by month'))
    await p.waitForTimeout(800)
    const open = p.locator('header').getByRole('button', { name: t(lang, 'Registrar ofrenda', 'Record offering') })
    await shot(open)
    await open.click()
    const who = p.locator('#offering-member')
    await who.waitFor()
    await p.waitForTimeout(400)
    await shot(who)
    // Type the start of a real member's name (first name + first letter of the surname).
    const members = await p.evaluate(() => fetch('/api/members').then((r) => r.json()))
    const pick = members.find((m) => m.status === 'active' && m.last_name) || members[0]
    await who.pressSequentially(`${pick.first_name} ${pick.last_name[0]}`.toLowerCase(), { delay: 30 })
    const option = p.locator('[role=listbox] [role=option]').first()
    await option.waitFor()
    await shot(option)
    await option.click()
    const amount = p.locator('dialog input[inputmode=decimal]')
    await amount.fill('75.25')
    await p.waitForTimeout(500)
    await shot(amount)
    const fund = p.getByRole('dialog').getByRole('radio', { name: 'Diezmos' })
    await fund.click()
    await shot(fund)
    const save = p.getByRole('dialog').getByRole('button', { name: t(lang, 'Guardar', 'Save'), exact: true })
    await shot(save)
    await save.click()
    const confirmDup = p.getByRole('button', { name: t(lang, 'Sí, es otra ofrenda', 'Yes, it is another one') })
    if (await confirmDup.waitFor({ timeout: 1500 }).then(() => true, () => false)) await confirmDup.click()
    const toast = p.locator('[aria-live=polite] > div').first()
    await toast.waitFor()
    await p.waitForTimeout(300)
    await shot(toast)
  },

  'informe-mensual': async (p, lang, shot) => {
    await p.goto(`${APP}/`)
    await p.waitForSelector('text=' + t(lang, 'Ofrendas por mes', 'Offerings by month'))
    await p.waitForTimeout(800)
    const menu = p.locator('aside').getByRole('link', { name: t(lang, 'Informes', 'Reports') })
    await shot(menu)
    await menu.click()
    const preset = p.getByRole('button', { name: new RegExp(t(lang, 'Informe del mes pasado', 'Last month’s report')) })
    await preset.waitFor()
    await p.waitForTimeout(600)
    await shot(preset)
    await preset.click()
    const pdf = p.getByRole('button', { name: t(lang, 'Descargar PDF', 'Download PDF') })
    await pdf.waitFor()
    await p.waitForTimeout(800)
    await pdf.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(400)
    await shot(pdf)
    await pdf.click()
    const doc = p.locator('[role=document]')
    await p.locator('[role=document] canvas').first().waitFor()
    await p.waitForTimeout(1500)
    await shot(doc)
    const download = p.getByRole('dialog').getByRole('button', { name: t(lang, 'Descargar', 'Download'), exact: true })
    await shot(download)
  },
}

const browser = await chromium.launch()
for (const lang of ['es', 'en']) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.addInitScript(([l]) => { localStorage.setItem('sanctuary.theme', 'light'); localStorage.setItem('sanctuary.lang', l) }, [lang])
  await p.goto(`${APP}/entrar`)
  await p.fill('input[type=email]', 'demo@sanctuary.app')
  await p.fill('input[type=password]', 'sanctuary123')
  await p.click('button[type=submit]')
  await p.waitForSelector('main#contenido')
  await p.evaluate(async (l) => { await fetch('/api/auth/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: l, theme: 'light' }) }) }, lang)

  for (const [name, run] of Object.entries(videos)) {
    const dir = path.join(here, 'public', 'screens', name, lang)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const steps = []
    const shot = async (target) => {
      const box = await target.boundingBox()
      const n = steps.length
      await p.screenshot({ path: path.join(dir, `${n}.png`) })
      steps.push({ image: `screens/${name}/${lang}/${n}.png`, target: box && { x: box.x, y: box.y, w: box.width, h: box.height } })
    }
    await run(p, lang, shot)
    fs.mkdirSync(path.join(here, 'src', 'data'), { recursive: true })
    fs.writeFileSync(path.join(here, 'src', 'data', `${name}.${lang}.json`), JSON.stringify({ viewport: VIEW, steps }, null, 2))
    console.log(`✔ ${name} (${lang}): ${steps.length} screenshots`)
    await p.keyboard.press('Escape').catch(() => {})
  }
  // Leave the demo account in Spanish, its normal language, after the English pass.
  await p.evaluate(async () => { await fetch('/api/auth/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'es' }) }) })
  await ctx.close()
}
await browser.close()
