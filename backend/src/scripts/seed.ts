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
      `INSERT INTO organizations (name, legal_name, tax_id, address, city, state, postal_code, phone, email, pastor_name, treasurer_name, timezone, opening_balance, opening_balance_date, board_emails)
       VALUES ('Iglesia Santuario de Gracia', 'Iglesia Santuario de Gracia, Inc.', '12-3456789', '418 Calle Olivo', 'San Antonio', 'TX', '78207',
               '(210) 555-0142', 'tesoreria@santuariodegracia.org', 'Pr. Samuel Rivera', 'Marta Hernández', 'America/Chicago', 18450, $1, 'pastor@santuariodegracia.org, junta@santuariodegracia.org') RETURNING id`,
      [`${new Date().getFullYear() - 2}-01-01`], c))[0].id;
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
      let joined = new Date(today.getFullYear() - 1 - Math.floor(rnd() * 8), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27));
      // Birthdays spread over the year, with several in the coming weeks so the dashboard has something to celebrate.
      const soon = (k: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + k);
      const age = 22 + Math.floor(rnd() * 55);
      const bday = i % 6 === 0 ? soon(i % 25) : new Date(0, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28));
      const birth = rnd() < 0.85 ? new Date(today.getFullYear() - age, bday.getMonth(), bday.getDate()) : null;
      if (i % 9 === 4) { const a = soon(3 + (i % 20)); joined = new Date(today.getFullYear() - 2 - (i % 9), a.getMonth(), a.getDate()); }
      const hasEmail = rnd() > 0.2, hasAddr = rnd() > 0.15;
      const mail = `${first}.${last}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + '@example.com';
      const id = (await q(
        `INSERT INTO members (org_id, first_name, last_name, email, phone, address, city, state, postal_code, joined_date, status, church_role, envelope_number, birth_date, sms_opt_in)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'TX',$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [org, first, `${last} ${last2}`, hasEmail ? mail : null, `(210) 555-${String(1000 + Math.floor(rnd() * 8999))}`,
          hasAddr ? `${100 + Math.floor(rnd() * 900)} ${pick(STREETS)}` : null, hasAddr ? 'San Antonio' : null, hasAddr ? '782' + String(10 + Math.floor(rnd() * 80)) : null,
          iso(joined), status, role, role === 'visitor' ? null : String(101 + i), birth ? iso(birth) : null, rnd() < 0.7], c))[0].id;
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

    // Bank deposits: every closed count older than a few days is deposited; older ones are already reconciled.
    const closed = await q(`SELECT b.id, b.date, COALESCE(sum(o.amount) FILTER (WHERE o.method IN ('cash','check')), 0) AS total
      FROM batches b LEFT JOIN offerings o ON o.batch_id = b.id WHERE b.org_id = $1 AND b.status = 'closed' GROUP BY b.id ORDER BY b.date`, [org], c);
    for (const b of closed) {
      const age = (today.getTime() - new Date(b.date).getTime()) / 864e5;
      if (age < 6) continue;
      const depDate = iso(new Date(new Date(b.date).getTime() + 864e5));
      const status = age > 16 ? 'reconciled' : 'deposited';
      const dep = (await q(`INSERT INTO deposits (org_id, date, account, status, deposited_at, bank_amount, reconciled_at, created_by)
        VALUES ($1,$2,'Cheques …4821',$3,$2,$4,$5,$6) RETURNING id`, [org, depDate, status, status === 'reconciled' ? b.total : null, status === 'reconciled' ? new Date() : null, user], c))[0].id;
      await q('UPDATE batches SET deposit_id = $1 WHERE id = $2', [dep, b.id], c);
    }

    // Expenses: the usual monthly bills for the last two years, plus a few one-off repairs.
    const catNames = ['Salarios y honorarios', 'Alquiler o hipoteca', 'Servicios (luz, agua, gas, internet)', 'Mantenimiento y reparaciones', 'Misiones', 'Ministerios y eventos', 'Ayuda a necesitados', 'Oficina y materiales', 'Otros gastos'];
    const cats: string[] = [];
    for (let i = 0; i < catNames.length; i++) cats.push((await q('INSERT INTO expense_categories (org_id, name, color_slot, sort_order) VALUES ($1,$2,$3,$4) RETURNING id', [org, catNames[i], (i % 8) + 1, i + 1], c))[0].id);
    const bills: [number, string, number, number, string][] = [
      [0, 'Pr. Samuel Rivera', 3400, 1, 'transfer'], [0, 'Ministro de alabanza', 1300, 1, 'transfer'], [0, 'Conserje', 900, 15, 'check'], [1, 'Banco Frost · hipoteca', 1850, 1, 'transfer'], [2, 'CPS Energy', 310, 12, 'check'],
      [2, 'SAWS · agua', 95, 14, 'check'], [2, 'Spectrum · internet', 89.99, 18, 'card'], [4, 'Misión Oaxaca', 1500, 20, 'transfer'], [7, 'Office Depot', 75, 22, 'card'],
    ];
    const expRows: unknown[][] = [];
    for (let m = new Date(today.getFullYear() - 2, 0, 1); m <= today; m.setMonth(m.getMonth() + 1)) {
      for (const [cat, payee, amount, day, method] of bills) {
        const d = new Date(m.getFullYear(), m.getMonth(), day);
        if (d > today) continue;
        const seasonal = cat === 2 && payee === 'CPS Energy' ? [1.1, 1.05, 0.9, 0.85, 1.1, 1.4, 1.6, 1.6, 1.3, 1, 0.9, 1.05][d.getMonth()] : 1;
        expRows.push([org, iso(d), cats[cat], payee, Math.round(amount * seasonal * (0.97 + rnd() * 0.06) * 100) / 100, method, method === 'check' ? String(1200 + expRows.length) : null, user]);
      }
      if (rnd() < 0.35) expRows.push([org, iso(new Date(m.getFullYear(), m.getMonth(), 9)), cats[3], pick(['Plomería Hernández', 'Ferretería Ace', 'Aire acondicionado del Sur']), Math.round((120 + rnd() * 600) * 100) / 100, 'check', String(1500 + expRows.length), user]);
      if (rnd() < 0.5) expRows.push([org, iso(new Date(m.getFullYear(), m.getMonth(), 16)), cats[6], 'Despensa para familias', Math.round((60 + rnd() * 140) * 100) / 100, 'cash', null, user]);
      if (m.getMonth() === 11) expRows.push([org, iso(new Date(m.getFullYear(), 11, 15)), cats[5], 'Cena navideña', 950, 'card', null, user]);
    }
    for (const r of expRows) await q('INSERT INTO expenses (org_id, date, category_id, payee, amount, method, reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', r, c);
    const budget = [68000, 22200, 6000, 6000, 18000, 3000, 1500, 1000, 600];
    for (let i = 0; i < cats.length; i++) await q('INSERT INTO budgets (org_id, category_id, year, amount) VALUES ($1,$2,$3,$4)', [org, cats[i], today.getFullYear(), budget[i]], c);

    // A married couple who get one joint statement, a gala dinner ticket and a gift of property.
    const couple = await q(`SELECT id, first_name, last_name FROM members WHERE org_id = $1 AND email IS NOT NULL AND status = 'active' ORDER BY envelope_number LIMIT 2`, [org], c);
    if (couple.length === 2) {
      const h = (await q('INSERT INTO households (org_id, name) VALUES ($1,$2) RETURNING id', [org, `${couple[0].first_name} y ${couple[1].first_name} ${couple[0].last_name.split(' ')[0]}`], c))[0].id;
      await q('UPDATE members SET household_id = $1 WHERE id = ANY($2::uuid[])', [h, couple.map((x: any) => x.id)], c);
      await q('INSERT INTO offerings (org_id, member_id, fund_id, amount, goods_value, date, method, check_number, notes, created_by) VALUES ($1,$2,$3,150,40,$4,$5,$6,$7,$8)',
        [org, couple[0].id, funds[3], iso(new Date(today.getFullYear(), Math.max(0, today.getMonth() - 1), 12)), 'check', String(checkNo++), 'Cena de gala pro-techo (boleto)', user], c);
      await q('INSERT INTO noncash_gifts (org_id, member_id, date, description, created_by) VALUES ($1,$2,$3,$4,$5)',
        [org, couple[1].id, iso(new Date(today.getFullYear(), Math.max(0, today.getMonth() - 2), 3)), 'Refrigerador usado para la cocina del templo, en buen estado', user], c);
    }

    const y = today.getFullYear();
    await q('INSERT INTO goals (org_id, name, description, fund_id, target_amount, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7), ($1,$8,$9,$10,$11,$6,$7)', [
      org, 'Techo nuevo del templo', 'Reparación del techo antes de la temporada de lluvias.', funds[3], 18000, `${y}-01-01`, `${y}-12-31`,
      'Viaje misionero a Oaxaca', 'Apoyo para el equipo que viaja en verano.', funds[2], 6000,
    ], c);
    // Pledges toward the roof.
    const roof = (await q("SELECT id FROM goals WHERE org_id = $1 AND name = 'Techo nuevo del templo'", [org], c))[0].id;
    for (const m of members.filter((x) => x.tithe >= 150).slice(0, 8)) await q('INSERT INTO pledges (org_id, goal_id, member_id, amount) VALUES ($1,$2,$3,$4)', [org, roof, m.id, pick([300, 500, 750, 1000])], c);
    console.log(`✔ Iglesia de demostración creada con ${members.length} miembros y ${rows.length} ofrendas.`);
  });
  console.log(`\n  Entra con:  ${EMAIL}  /  ${PASSWORD}\n  Código de invitación de ejemplo: GRACIA24\n`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
