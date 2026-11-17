// Moves data from the first version of Sanctuary (tables "givers" and "offerings"
// in the public schema) into a church in Sanctuary 2.
//
//   npm run import-legacy -- tesoreria@iglesia.org
//
// The e-mail is that of an account in Sanctuary 2: the data goes into that person's church.
// Old tables are only read, never changed. Running it twice would duplicate offerings,
// so the script refuses if the church already has offerings unless you pass --force.
// LEGACY_DATABASE_URL may point to another database; by default it reads DATABASE_URL.
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { migrate, one, pool, q, tx } from '../db';
import { env } from '../env';
import { saveImage } from '../lib/files';

const METHODS = new Set(['cash', 'check', 'card', 'transfer', 'other']);
const ROLES: Record<string, string> = { pastor: 'pastor', member: 'member', visitor: 'visitor' };
const FUND_NAMES: Record<string, string> = { general: 'Ofrendas', tithe: 'Diezmos', tithes: 'Diezmos', diezmo: 'Diezmos', diezmos: 'Diezmos', offering: 'Ofrendas', ofrenda: 'Ofrendas', missions: 'Misiones', building: 'Construcción' };

async function main() {
  const email = process.argv.find((a) => a.includes('@'))?.toLowerCase();
  const force = process.argv.includes('--force');
  if (!email) {
    console.error('Uso: npm run import-legacy -- tu-correo@iglesia.org');
    process.exit(1);
  }
  await migrate();
  const user = await one('SELECT id, org_id FROM users WHERE email = $1', [email]);
  if (!user) throw new Error(`No existe una cuenta con el correo ${email}. Crea la cuenta primero desde la página de registro.`);
  if (!force && (await one('SELECT 1 FROM offerings WHERE org_id = $1 LIMIT 1', [user.org_id]))) {
    throw new Error('Esta iglesia ya tiene ofrendas. Para importar de todos modos, añade --force (puede duplicar registros).');
  }

  const legacy = new Pool({ connectionString: process.env.LEGACY_DATABASE_URL || env.databaseUrl });
  const has = (await legacy.query("SELECT to_regclass('public.givers') AS g, to_regclass('public.offerings') AS o")).rows[0];
  if (!has.g || !has.o) throw new Error('No se encontraron las tablas antiguas (public.givers y public.offerings).');
  const givers = (await legacy.query('SELECT * FROM public.givers ORDER BY id')).rows;
  const offerings = (await legacy.query('SELECT * FROM public.offerings ORDER BY date, id')).rows;
  await legacy.end();

  const photoDirs = [path.join(__dirname, '..', '..', 'public', 'uploads', 'profile-pictures'), path.join(__dirname, '..', '..', 'public', 'uploads')];
  const memberIds = new Map<number, string>();
  const fundIds = new Map<string, string>();
  for (const f of await q('SELECT id, name FROM funds WHERE org_id = $1', [user.org_id])) fundIds.set(f.name.toLowerCase(), f.id);

  await tx(async (c) => {
    for (const g of givers) {
      const [first, ...rest] = String(g.name || 'Sin nombre').trim().split(/\s+/);
      let avatar: string | null = null;
      const file = g.profile_picture && photoDirs.map((d) => path.join(d, path.basename(String(g.profile_picture)))).find((p) => fs.existsSync(p));
      if (file) {
        try {
          avatar = await saveImage(user.org_id, { buffer: fs.readFileSync(file), mimetype: file.endsWith('.png') ? 'image/png' : 'image/jpeg' } as Express.Multer.File, 'avatar');
        } catch { /* unreadable photo: skip it */ }
      }
      const m = await one(
        `INSERT INTO members (org_id, first_name, last_name, email, phone, address, notes, church_role, status, avatar_file, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, now())) RETURNING id`,
        [user.org_id, first.slice(0, 80), rest.join(' ').slice(0, 80), g.email?.toLowerCase() || null, g.phone_number || null, g.address || null, g.notes || null,
          ROLES[g.title] || 'member', g.title === 'visitor' ? 'visitor' : 'active', avatar, g.created_at || null],
        c,
      );
      memberIds.set(g.id, m.id);
    }
    let order = fundIds.size;
    for (const o of offerings) {
      const raw = String(o.category || 'general').trim();
      const name = FUND_NAMES[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1);
      let fundId = fundIds.get(name.toLowerCase());
      if (!fundId) {
        order++;
        fundId = (await one('INSERT INTO funds (org_id, name, color_slot, sort_order) VALUES ($1,$2,$3,$4) RETURNING id', [user.org_id, name.slice(0, 80), ((order - 1) % 8) + 1, order], c)).id as string;
        fundIds.set(name.toLowerCase(), fundId);
      }
      const date = o.date instanceof Date ? o.date.toISOString().slice(0, 10) : String(o.date).slice(0, 10);
      await q(
        'INSERT INTO offerings (org_id, member_id, fund_id, amount, date, method, check_number, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [user.org_id, memberIds.get(o.giver_id) ?? null, fundId, Number(o.amount), date, METHODS.has(o.method) ? o.method : 'other', o.check_number || null, o.notes || null, user.id],
        c,
      );
    }
    await q("INSERT INTO audit_log (org_id, user_id, action, entity, summary) VALUES ($1,$2,'import','offering',$3)", [user.org_id, user.id, String(offerings.length)], c);
  });
  console.log(`✔ Importados ${givers.length} miembros y ${offerings.length} ofrendas a la iglesia de ${email}.`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(`✖ ${e.message || e}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
