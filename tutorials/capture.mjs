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

  'conteo-domingo': async (p, lang, shot) => {
    await home(p, lang)
    const quick = p.getByRole('link', { name: new RegExp(t(lang, 'Contar el culto de hoy', 'Count today’s service')) })
    await shot(quick)
    await quick.click()
    const attendance = p.getByLabel(t(lang, 'Asistencia', 'Attendance'))
    await attendance.waitFor()
    await attendance.fill('92')
    await p.waitForTimeout(300)
    await shot(attendance)
    const start = p.getByRole('button', { name: t(lang, 'Empezar a contar', 'Start counting') })
    await shot(start)
    await start.click()
    const who = p.locator('#quick-member')
    await who.waitFor()
    const members = await realMembers(p)
    const add = async (m, amount, show) => {
      if (m) {
        await who.click()
        await who.pressSequentially(`${m.first_name} ${m.last_name[0]}`.toLowerCase(), { delay: 25 })
        const option = p.locator('[role=listbox] [role=option]').first()
        await option.waitFor()
        if (show) await shot(option)
        await option.click()
      }
      const amountBox = p.getByLabel(t(lang, 'Monto', 'Amount'), { exact: true })
      await amountBox.fill(String(amount))
      if (show) { await p.waitForTimeout(200); await shot(amountBox) }
      await amountBox.press('Enter')
      await p.waitForTimeout(600)
    }
    await add(members[0], 50, true)
    await add(members[1], 20, false)
    await add(null, 35, false) // loose offering from the plate
    await p.getByLabel(t(lang, 'Cantidad de 20', 'Count of 20')).fill('5')
    const five = p.getByLabel(t(lang, 'Cantidad de 5', 'Count of 5'), { exact: true })
    await five.fill('1')
    await p.waitForTimeout(400)
    const cash = p.locator('section', { hasText: t(lang, 'Cuadre de efectivo', 'Cash check') })
    await cash.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await shot(five)
    const ok = p.getByText(t(lang, 'Todo cuadra', 'Everything balances'))
    await shot(ok)
    const close = p.getByRole('button', { name: t(lang, 'Cerrar conteo', 'Close count') })
    await close.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await shot(close)
    await close.click()
  },

  'nuevo-miembro': async (p, lang, shot) => {
    await home(p, lang)
    const menu = p.locator('aside').getByRole('link', { name: t(lang, 'Miembros', 'Members') })
    await shot(menu)
    await menu.click()
    const add = p.getByRole('button', { name: t(lang, 'Nuevo miembro', 'New member') })
    await add.waitFor()
    await p.waitForTimeout(500)
    await shot(add)
    await add.click()
    const dialog = p.getByRole('dialog')
    const first = dialog.getByLabel(t(lang, 'Nombre', 'First name'), { exact: true })
    await first.waitFor()
    await first.fill('Lucía')
    await dialog.getByLabel(t(lang, 'Apellidos', 'Last name')).fill('Benítez Ramos')
    await p.waitForTimeout(300)
    await shot(first)
    await dialog.getByLabel(t(lang, 'Teléfono', 'Phone')).fill('(210) 555-0188')
    const email = dialog.getByLabel(t(lang, 'Correo electrónico', 'E-mail'))
    await email.fill('lucia.benitez@example.com')
    await email.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await shot(email)
    const consent = dialog.getByRole('checkbox')
    await consent.check()
    await p.waitForTimeout(300)
    await shot(consent.locator('xpath=ancestor::label'))
    const save = dialog.getByRole('button', { name: t(lang, 'Guardar', 'Save'), exact: true })
    await shot(save)
    await save.click()
    await dialog.waitFor({ state: 'detached' }).catch(() => {})
    await p.getByPlaceholder(t(lang, 'Buscar por nombre, teléfono, correo o n.º de sobre', 'Search by name, phone, e-mail or envelope no.')).fill('lucía')
    const card = p.locator('main article').first()
    await card.waitFor()
    await p.waitForTimeout(500)
    await shot(card)
  },

  'corregir-ofrenda': async (p, lang, shot) => {
    await home(p, lang)
    const menu = p.locator('aside').getByRole('link', { name: t(lang, 'Ofrendas', 'Offerings') })
    await shot(menu)
    await menu.click()
    const search = p.getByPlaceholder(t(lang, 'Buscar por nombre o nota', 'Search by name or note'))
    await search.waitFor()
    const m = (await realMembers(p))[2]
    await search.fill(m.first_name.toLowerCase() + ' ' + m.last_name.split(' ')[0].toLowerCase())
    await p.waitForTimeout(1200)
    await shot(search)
    const row = p.locator('tbody tr', { has: p.getByRole('button', { name: t(lang, 'Editar', 'Edit') }) }).first()
    const edit = row.getByRole('button', { name: t(lang, 'Editar', 'Edit') })
    await shot(edit)
    await edit.click()
    const amount = p.locator('dialog input[inputmode=decimal]')
    await amount.waitFor()
    await amount.fill('60.00')
    await p.waitForTimeout(300)
    await shot(amount)
    const save = p.getByRole('dialog').getByRole('button', { name: t(lang, 'Guardar', 'Save'), exact: true })
    await shot(save)
    await save.click()
    await p.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
    await p.waitForTimeout(800)
    const del = p.locator('tbody tr', { has: p.getByRole('button', { name: t(lang, 'Eliminar', 'Delete') }) }).first().getByRole('button', { name: t(lang, 'Eliminar', 'Delete') })
    await shot(del)
    await del.click()
    const undo = p.getByRole('button', { name: t(lang, 'Deshacer', 'Undo') })
    await undo.waitFor()
    await shot(undo)
    await undo.click()
    const restored = p.locator('[aria-live=polite] > div', { hasText: t(lang, 'Ofrenda recuperada', 'Offering restored') })
    await restored.waitFor()
    await p.waitForTimeout(300)
    await shot(restored)
  },

  constancias: async (p, lang, shot) => {
    await home(p, lang)
    const menu = p.locator('aside').getByRole('link', { name: t(lang, 'Impuestos', 'Taxes') })
    await shot(menu)
    await menu.click()
    const checklist = p.locator('section', { hasText: t(lang, 'Antes de entregar las constancias', 'Before handing out statements') }).first()
    await checklist.waitFor()
    await p.waitForTimeout(600)
    await shot(checklist)
    const one = p.locator('tbody tr').first().getByRole('button', { name: 'PDF' })
    await one.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await shot(one)
    await one.click()
    await p.locator('[role=document] canvas').first().waitFor()
    await p.waitForTimeout(1500)
    const download = p.getByRole('dialog').getByRole('button', { name: t(lang, 'Descargar', 'Download'), exact: true })
    await shot(download)
    await download.click()
    await p.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
    const all = p.getByRole('button', { name: t(lang, 'Descargar todas (PDF)', 'Download all (PDF)') })
    await all.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await shot(all)
    await all.click()
    await p.locator('[role=document] canvas').first().waitFor()
    await p.waitForTimeout(1800)
    await shot(p.locator('[role=document]'))
    await p.keyboard.press('Escape')
  },
}

async function home(p, lang) {
  await p.goto(`${APP}/`)
  await p.waitForSelector('text=' + t(lang, 'Ofrendas por mes', 'Offerings by month'))
  await p.waitForTimeout(800)
}

/** Active members with a surname, so typed names always match someone real. */
async function realMembers(p) {
  const list = await p.evaluate(() => fetch('/api/members').then((r) => r.json()))
  return list.filter((m) => m.status === 'active' && m.last_name && !m.first_name.startsWith('Luc'))
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

  const only = process.argv.slice(2)
  for (const [name, run] of Object.entries(videos)) {
    if (only.length && !only.includes(name)) continue
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
