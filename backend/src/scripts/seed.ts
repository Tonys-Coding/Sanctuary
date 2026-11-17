// Creates a demo church full of realistic sample data so you can explore Sanctuary.
//   npm run seed            → demo@sanctuary.app / sanctuary123
// Running it again replaces the demo church; it never touches real churches.
import bcrypt from 'bcryptjs';
import { migrate, one, pool, q, tx } from '../db';

const EMAIL = 'demo@sanctuary.app';
const PASSWORD = 'sanctuary123';

// Small deterministic random generator so the demo looks the same on every run.
let seed = 20260117;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const FIRST = ['María', 'José', 'Ana', 'Luis', 'Carmen', 'Juan', 'Rosa', 'Carlos', 'Elena', 'Miguel', 'Patricia', 'Jorge', 'Gloria', 'Pedro', 'Silvia', 'Rafael', 'Marta', 'Héctor', 'Lucía', 'Andrés', 'Teresa', 'Francisco', 'Isabel', 'Daniel', 'Verónica', 'Roberto', 'Claudia', 'Manuel', 'Adriana', 'Samuel', 'Noemí', 'David', 'Raquel', 'Josué', 'Ester', 'Abraham', 'Débora', 'Elías', 'Sara', 'Tomás', 'Rut', 'Benjamín'];
const LAST = ['García', 'Rodríguez', 'Martínez', 'Hernández', 'López', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Gutiérrez', 'Chávez', 'Mendoza', 'Castillo'];
const STREETS = ['Calle Olivo', 'Av. Esperanza', 'Calle Betania', 'Camino Real', 'Calle Jordán', 'Av. Central'];

async function main() {
  await migrate();
  const old = await one('SELECT org_id FROM users WHERE email = $1', [EMAIL]);
  if (old) await q('DELETE FROM organizations WHERE id = $1', [old.org_id]);

  await tx(async (c) => {
    const org = (await q(
      `INSERT INTO organizations (name, legal_name, tax_id, address, city, state, postal_code, phone, email, pastor_name, treasurer_name)
       VALUES ('Iglesia Santuario de Gracia', 'Iglesia Santuario de Gracia, Inc.', '12-3456789', '418 Calle Olivo', 'San Antonio', 'TX', '78207',
               '(210) 555-0142', 'tesoreria@santuariodegracia.org', 'Pr. Samuel Rivera', 'Marta Hernández') RETURNING id`, [], c))[0].id;
    const user = (await q('INSERT INTO users (org_id, email, password_hash, full_name) VALUES ($1,$2,$3,$4) RETURNING id', [org, EMAIL, await bcrypt.hash(PASSWORD, 11), 'Marta Hernández'], c))[0].id;
    await q("INSERT INTO invitations (org_id, code, note, created_by) VALUES ($1, 'GRACIA24', 'Equipo de tesorería', $2) ON CONFLICT DO NOTHING", [org, user], c);

    const fundNames: [string, boolean][] = [['Diezmos', true], ['Ofrendas', true], ['Misiones', true], ['Construcción', true], ['Primicias', true], ['Venta de comida', false]];
    const funds: string[] = [];
    for (let i = 0; i < fundNames.length; i++) {
      funds.push((await q('INSERT INTO funds (org_id, name, color_slot, tax_deductible, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id', [org, fundNames[i][0], i + 1, fundNames[i][1], i], c))[0].id);
    }

    // Members: each gets a giving "profile" — how often they give and roughly how much.
    const today = new Date();
    const members: { id: string; tithe: number; freq: number; from: Date; until: Date | null }[] = [];
    const used = new Set<string>();
    for (let i = 0; i < 46; i++) {
      let first = pick(FIRST), last = pick(LAST), last2 = pick(LAST);
      while (used.has(first + last)) { first = pick(FIRST); last = pick(LAST); }
      used.add(first + last);
      const role = i === 0 ? 'pastor' : i < 5 ? 'leader' : i > 41 ? 'visitor' : 'member';
      const status = i > 41 ? 'visitor' : i > 38 ? 'inactive' : 'active';
      const joined = new Date(today.getFullYear() - 1 - Math.floor(rnd() * 8), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27));
      const hasEmail = rnd() > 0.2, hasAddr = rnd() > 0.15;
      const mail = `${first}.${last}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + '@example.com';
      const id = (await q(
        `INSERT INTO members (org_id, first_name, last_name, email, phone, address, city, state, postal_code, joined_date, status, church_role, envelope_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'TX',$8,$9,$10,$11,$12) RETURNING id`,
        [org, first, `${last} ${last2}`, hasEmail ? mail : null, `(210) 555-${String(1000 + Math.floor(rnd() * 8999))}`,
          hasAddr ? `${100 + Math.floor(rnd() * 900)} ${pick(STREETS)}` : null, hasAddr ? 'San Antonio' : null, hasAddr ? '782' + String(10 + Math.floor(rnd() * 80)) : null,
          iso(joined), status, role, role === 'visitor' ? null : String(101 + i)], c))[0].id;
      // A few recently-joined givers and a few who stopped giving, so the insights have something to say.
      const from = i >= 34 && i <= 36 ? new Date(today.getTime() - 40 * 864e5) : new Date(today.getFullYear() - 3, 0, 1);
      const until = i >= 30 && i <= 33 ? new Date(today.getTime() - (75 + i) * 864e5) : status === 'inactive' ? new Date(today.getTime() - 300 * 864e5) : null;
      members.push({ id, tithe: role === 'visitor' ? 0 : pick([40, 60, 80, 100, 120, 150, 200, 260, 320]), freq: role === 'visitor' ? 0.08 : pick([0.35, 0.5, 0.7, 0.85, 0.95]), from, until });
    }

    // Every Sunday (and Wednesday for a smaller service) for a bit over two years.
    const start = new Date(today.getFullYear() - 2, 0, 1);
    const rows: unknown[][] = [];
    const add = (member: string | null, fund: number, amount: number, d: Date, method: string, batch: string | null, check: string | null = null) =>
      rows.push([org, member, funds[fund], batch, Math.round(amount * 100) / 100, iso(d), method, check, user]);
    let checkNo = 2040;
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 3) continue;
      const sunday = dow === 0;
      const growth = 1 + ((d.getTime() - start.getTime()) / (365 * 864e5)) * 0.09; // gentle year-over-year growth
      const season = [0.92, 0.95, 1, 1.08, 1, 0.94, 0.88, 0.93, 1, 1.03, 1.06, 1.25][d.getMonth()];
      const recent = (today.getTime() - d.getTime()) / 864e5 < 45;
      let batch: string | null = null;
      if (recent) {
        batch = (await q('INSERT INTO batches (org_id, date, name, attendance, counted_by, status, closed_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [org, iso(d), sunday ? 'Culto dominical' : 'Culto de oración', Math.round((sunday ? 85 : 38) + rnd() * 20), 'Marta Hernández y Luis Ortiz',
            (today.getTime() - d.getTime()) / 864e5 < 3 ? 'open' : 'closed', (today.getTime() - d.getTime()) / 864e5 < 3 ? null : new Date(d.getTime() + 3 * 3600e3), user], c))[0].id;
      }
      for (const m of members) {
        if (d < m.from || (m.until && d > m.until)) continue;
        if (rnd() > m.freq * (sunday ? 1 : 0.25)) continue;
        const r = rnd();
        const method = r < 0.62 ? 'cash' : r < 0.82 ? 'check' : r < 0.93 ? 'transfer' : 'card';
        if (sunday && m.tithe && rnd() < 0.55) add(m.id, 0, m.tithe * growth * season * (0.85 + rnd() * 0.3), d, method, batch, method === 'check' ? String(checkNo++) : null);
        if (rnd() < 0.8) add(m.id, 1, pick([5, 10, 10, 20, 20, 25, 40, 50]) * (rnd() < 0.1 ? 2 : 1), d, rnd() < 0.85 ? 'cash' : method, batch);
        if (sunday && rnd() < 0.09) add(m.id, 2, pick([20, 25, 50, 100]), d, method, batch);
        if (sunday && rnd() < 0.05) add(m.id, 3, pick([50, 100, 150, 250, 500]), d, method === 'cash' ? 'check' : method, batch, String(checkNo++));
        if (sunday && d.getMonth() === 0 && d.getDate() <= 14 && rnd() < 0.3) add(m.id, 4, pick([50, 100, 200]), d, method, batch);
      }
      // Loose plate offering (no name) at every service.
      add(null, 1, (sunday ? 160 : 55) * growth * season * (0.7 + rnd() * 0.6), d, 'cash', batch);
      if (sunday && d.getDate() <= 7) add(null, 5, 180 + rnd() * 220, d, 'cash', batch);
    }
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values = chunk.map((_, j) => `(${Array.from({ length: 9 }, (_, k) => `$${j * 9 + k + 1}`).join(',')})`).join(',');
      await q(`INSERT INTO offerings (org_id, member_id, fund_id, batch_id, amount, date, method, check_number, created_by) VALUES ${values}`, chunk.flat(), c);
    }

    const y = today.getFullYear();
    await q('INSERT INTO goals (org_id, name, description, fund_id, target_amount, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7), ($1,$8,$9,$10,$11,$6,$7)', [
      org, 'Techo nuevo del templo', 'Reparación del techo antes de la temporada de lluvias.', funds[3], 18000, `${y}-01-01`, `${y}-12-31`,
      'Viaje misionero a Oaxaca', 'Apoyo para el equipo que viaja en verano.', funds[2], 6000,
    ], c);
    console.log(`✔ Iglesia de demostración creada con ${members.length} miembros y ${rows.length} ofrendas.`);
  });
  console.log(`\n  Entra con:  ${EMAIL}  /  ${PASSWORD}\n  Código de invitación de ejemplo: GRACIA24\n`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
