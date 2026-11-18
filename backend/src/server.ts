import { createApp } from './app';
import { migrate } from './db';
import { env, features } from './env';
import { startSmsScheduler } from './lib/sms';

async function main() {
  try {
    await migrate();
  } catch (e: any) {
    console.error('\n✖ No se pudo conectar a la base de datos. Revisa DATABASE_URL en backend/.env');
    console.error(`  (Could not reach the database: ${e?.message || e})\n`);
    process.exit(1);
  }
  createApp().listen(env.port, () => {
    const f = features();
    console.log(`\n  Sanctuary  →  http://localhost:${env.port}`);
    console.log(`  IA (Gemini): ${f.ai ? `activada · ${env.geminiModel}` : 'desactivada — añade GEMINI_API_KEY en backend/.env'}`);
    console.log(`  Correo:      ${f.email ? 'configurado' : 'sin configurar — los enlaces de restablecimiento se mostrarán aquí'}`);
    console.log(`  SMS:         ${f.sms ? 'activado (Twilio)' : 'desactivado — añade los datos de Twilio en backend/.env'}\n`);
    if (f.sms) startSmsScheduler();
  });
}

main();
