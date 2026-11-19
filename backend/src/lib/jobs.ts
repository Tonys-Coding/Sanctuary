import { features } from '../env';
import { queueBirthdays, sendDue } from './sms';
import { autoBackups } from './backup';
import { sendBoardReports } from './boardReport';

/**
 * Background work, checked every minute while the server runs:
 * texts that are due and birthday greetings (when SMS is on), the monthly board report,
 * and — once an hour — the nightly automatic backup of each church.
 */
export function startJobs() {
  let lastBackupCheck = 0;
  const tick = async () => {
    const run = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (e: any) { console.error(`Tarea "${name}":`, e?.message || e); }
    };
    if (features().sms) {
      await run('cumpleaños', () => queueBirthdays());
      await run('mensajes', () => sendDue());
    }
    if (features().email) await run('informe a la junta', () => sendBoardReports());
    if (Date.now() - lastBackupCheck > 3600e3) {
      lastBackupCheck = Date.now();
      await run('respaldo automático', () => autoBackups());
    }
  };
  tick();
  return setInterval(tick, 60_000);
}
