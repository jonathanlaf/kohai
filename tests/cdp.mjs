// Headless Chrome over the DevTools protocol, no packages (Node 22+).
// Usage: node tests/cdp.mjs <url> [js-expression …]   (SHOT=out.png screenshot, WIDTH=390 phone, LANGS=en-CA,en browser languages; default fr-CA,fr; UA=… user agent)
// Prints the JSON value of each expression (promises are awaited) and every non-localhost request.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const [url, ...steps] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A Chrome left over from a crashed run would answer instead, with its old storage: refuse to run
if (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)) {
  console.error(`port ${PORT} is busy (stale headless Chrome?): pkill -f remote-debugging-port=${PORT}`);
  process.exit(1);
}
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'kohai-cdp-')), 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); } }
if (!targets) { console.error('Chrome did not start (CHROME=' + CHROME + ')'); proc.kill(); process.exit(1); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = {}; const requests = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Network.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.WIDTH || 1200), height: 900, deviceScaleFactor: 1, mobile: false });
// Browser languages (navigator.languages): French by default so the first-visit redirect does not fire unless asked
const ua = process.env.UA || (await send('Browser.getVersion')).result.userAgent;
await send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: process.env.LANGS || 'fr-CA,fr' });
await send('Page.navigate', { url });
await sleep(2500);
for (const s of steps) {
  const r = await Promise.race([send('Runtime.evaluate', { expression: s, awaitPromise: true, returnByValue: true }),
    sleep(15000).then(() => ({ result: { result: { value: 'TIMEOUT (step never resolved)' } } }))]);
  console.log(JSON.stringify(r.result ? (r.result.result?.value ?? r.result.exceptionDetails?.exception?.description ?? null) : 'CDP error: ' + r.error?.message));
  await sleep(1500);
}
console.log('third-party:', JSON.stringify(requests.filter((u) => !/^(http:\/\/localhost|blob:|data:)/.test(u))));
if (process.env.SHOT) writeFileSync(process.env.SHOT, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
ws.close(); proc.kill(); process.exit(0);
