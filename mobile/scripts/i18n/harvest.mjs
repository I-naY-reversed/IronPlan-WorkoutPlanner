import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../../store-listing/scripts/lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = 'http://localhost:8081';
const csv = path.resolve(process.argv[2] ?? path.join(ROOT, '../store-listing/build/demo-history.csv'));
const ru = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/ru.json'), 'utf8'));
const r = (en) => ru[en] ?? en;

const p = await launch({ port: 9336 });
const steps = [];
const seen = new Set();
const collect = async () => { for (const m of await p.ev('JSON.stringify([...(globalThis.__i18nMisses ?? [])])').then(JSON.parse)) seen.add(m); };
const go = async (url, wait) => { await collect(); await p.go(url, wait); };
const step = async (name, fn) => { try { await fn(); steps.push(name); } catch (e) { console.warn(`skipped ${name}: ${e.message}`); } };
try {
  await p.device({ width: 390, height: 844, scale: 1, dark: true });
  await p.send('Emulation.setLocaleOverride', { locale: 'ru-RU' });
  await p.go(URL, 3000);
  await p.click(r('Next'));
  await p.click(r('Muay Thai'));
  for (let i = 0; i < 4; i++) await p.click(r('Next'));
  await p.click(r('Build my plan'));
  await p.click(r('Got it'));
  if (fs.existsSync(csv)) {
    await go(`${URL}/import`, 2500);
    await p.upload(r('Choose CSV file'), csv);
    await p.click(r('Import'), 1);
    await p.sleep(3000);
  }

  await step('plan', () => go(URL, 3000));
  await step('replace picker', async () => { await p.click(r('Replace')); await p.sleep(800); await p.click(r('Cancel')); });
  await step('change today', async () => { await p.click(r('Change today: less time or lighter')); await p.sleep(800); await go(URL, 2500); });
  await step('workout list', () => go(`${URL}/log`, 2500));
  await step('session', async () => { await p.click(r("Go to today's workout")); await p.click('/^Начать/'); await p.sleep(2000); await p.clickLabel('Next exercise'); await p.sleep(1000); });
  await step('why', async () => { await p.click(r('Why this weight?')); await p.sleep(600); await p.click(r('Close')); });
  await step('how to', async () => { await p.click(r('How to')); await p.sleep(600); await p.click(r('Close')); });
  await step('log and rate', async () => { await p.clickLabel('Log set 1'); await p.sleep(600); await p.click(r('Skip rating')); await p.sleep(1200); });
  await step('set type', async () => { await p.click('/^Тип/'); await p.sleep(600); await p.click(r('Cancel')); });
  await step('progress', () => go(`${URL}/dose`, 4000));
  await step('model details', async () => { await p.click(r('Model details')); await p.sleep(1000); });
  await step('chart help', async () => { await p.click(r('How to read this chart')); await p.sleep(600); await p.click(r('Close')); });
  await step('settings', () => go(`${URL}/profile`, 2500));
  for (const tab of ['Training', 'You', 'Exercises', 'Equipment', 'App']) await step(`settings ${tab}`, async () => { await p.click(r(tab)); await p.sleep(800); });
  await step('sources', async () => { await p.click(r('Evidence and sources')); await p.sleep(1500); });
  await step('import screen', () => go(`${URL}/import`, 2500));

  await collect();
  const misses = [...seen];
  const norm = (s) => { let i = 0; return s.replace(/\d+(?:[.,]\d+)?/g, () => `{${i++}}`); };
  const file = path.join(ROOT, 'scripts/i18n/harvested.json');
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const all = [...new Set([...old, ...misses.map(norm)])].sort();
  fs.writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
  if (process.env.SHOW) console.log(misses.join(" || "));
  console.log(`visited: ${steps.join(', ')}\n${misses.length} untranslated strings seen, ${all.length - old.length} new templates`);
} finally {
  await p.close();
}
