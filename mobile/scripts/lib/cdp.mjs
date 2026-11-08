// Small Chrome DevTools Protocol driver for capturing real app screens.
// Launches its own headless Chrome with a throwaway profile so the user's browser data is never touched.
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9334, chrome = process.env.CHROME || 'google-chrome-stable' } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ironplan-capture-'));
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb',
    '--font-render-hinting=none', 'about:blank',
  ], { stdio: 'ignore', detached: true });
  const kill = () => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} };
  process.on('exit', kill);
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {}
    await sleep(200);
  }
  const t = targets.find((x) => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method) for (const fn of listeners) fn(d);
  };
  const listeners = new Set();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (d) => (d.error ? rej(new Error(method + ': ' + JSON.stringify(d.error))) : res(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');

  const page = {
    send, ev, sleep,
    async device({ width, height, scale, dark }) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: true });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    },
    async go(url, wait = 4000) { await send('Page.navigate', { url }); await sleep(wait); },
    // Click the innermost visible element whose trimmed text equals `text` (or matches a RegExp source "/.../").
    async click(text, nth = 0, timeout = 15000) {
      const t0 = Date.now();
      while (!(await page.find(text, nth))) {
        if (Date.now() - t0 > timeout) throw new Error('no element with text ' + text);
        await sleep(250);
      }
      const [x, y] = await ev('window.__pt');
      for (const type of ['mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      await sleep(700);
    },
    // Click by accessibility label (icon-only buttons).
    async clickLabel(label) {
      const pt = await ev(`(() => { const el = document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)});
        if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      if (!pt) throw new Error('no element labelled ' + label);
      for (const type of ['mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', { type, x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
      await sleep(700);
    },
    async tryClick(text, nth = 0) { try { await page.click(text, nth, 1500); return true; } catch { return false; } },
    async find(text, nth = 0) {
      return ev(`(() => {
        const want = ${JSON.stringify(text)};
        const re = want.startsWith('/') ? new RegExp(want.slice(1, -1)) : null;
        const els = [...document.querySelectorAll('body *')].filter(e => {
          const s = (e.innerText || '').trim(); if (!s) return false;
          if (re ? !re.test(s) : s !== want) return false;
          const r = e.getBoundingClientRect(); return r.width && r.height; });
        const inner = els.filter(e => !els.some(o => o !== e && e.contains(o)));
        const el = inner[${nth}]; if (!el) return false; el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect(); window.__pt = [r.x + r.width / 2, r.y + r.height / 2]; return true; })()`);
    },
    async has(text) { return ev(`document.body.innerText.split('\\n').some(l => l.trim() === ${JSON.stringify(text)})`); },
    async type(text) { await send('Input.insertText', { text }); await sleep(300); },
    async scrollTop() { await ev(`[...document.querySelectorAll('*')].forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); window.scrollTo(0, 0)`); await sleep(400); },
    // Scroll the main scroll container so the element with this text sits `offset` CSS px from the top.
    async scrollTo(text, offset = 120) {
      await ev(`(() => {
        const want = ${JSON.stringify(text)};
        const el = [...document.querySelectorAll('body *')].filter(e => (e.innerText || '').trim() === want).pop();
        if (!el) throw new Error('no element ' + want);
        let p = el.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
        const box = el.getBoundingClientRect();
        if (p) p.scrollTop += box.top - p.getBoundingClientRect().top - ${offset}; else window.scrollBy(0, box.top - ${offset});
      })()`);
      await sleep(600);
    },
    // Click a control that opens a file chooser and answer it with `file` (absolute path).
    async upload(text, file) {
      await send('Page.setInterceptFileChooserDialog', { enabled: true });
      const opened = new Promise((res) => {
        const fn = (d) => { if (d.method === 'Page.fileChooserOpened') { listeners.delete(fn); res(d.params); } };
        listeners.add(fn);
      });
      await page.click(text);
      const { backendNodeId } = await opened;
      await send('DOM.setFileInputFiles', { files: [file], backendNodeId });
      await send('Page.setInterceptFileChooserDialog', { enabled: false });
      await sleep(1500);
    },
    text: () => ev('document.body.innerText'),
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async close() { ws.close(); try { process.kill(-proc.pid, 'SIGTERM'); } catch {} await sleep(300); fs.rmSync(profile, { recursive: true, force: true }); },
  };
  return page;
}
