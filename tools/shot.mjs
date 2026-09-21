// 検証用: ローカル静的サーバ + headless Chrome でスクリーンショット / 自動テスト
//   node tools/shot.mjs --seed 1 --keys "Enter,ArrowRight*5,KeyI" --out shots/a.png
//   node tools/shot.mjs --autoplay --turns 3000       # ランダム操作で例外が出ないか
//   node tools/shot.mjs --test                       # tests/test.html を実行
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.gif': 'image/gif' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const chromePaths = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = chromePaths.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome/Edge not found'); process.exit(2); }

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 480, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(`http ${r.status()} ${r.url()}`); });
page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) errors.push(`console.${m.type()}: ${m.text()}`); });

let exit = 0;
try {
  if (opt('test')) {
    await page.goto(`http://127.0.0.1:${port}/tests/test.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__done === true, { timeout: 60000 });
    const results = await page.evaluate(() => window.__results);
    for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.msg ? ' - ' + r.msg : ''}`);
    const fails = results.filter(r => !r.ok).length;
    console.log(`${results.length - fails}/${results.length} passed`);
    if (fails) exit = 1;
  } else {
    const seed = opt('seed', '1');
    const autoplay = opt('autoplay') ? '&autoplay=1' : '';
    await page.goto(`http://127.0.0.1:${port}/?seed=${seed}${autoplay}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__game, { timeout: 20000 });
    if (autoplay) {
      const turns = Number(opt('turns', '2000'));
      const t0 = Date.now();
      let last = -1;
      while (Date.now() - t0 < 180000) {
        const s = await page.evaluate(() => ({ turn: window.__auto.totalTurns + window.__game.turn, floor: window.__game.floor, lv: window.__game.player.lv, hp: window.__game.player.hp, runs: window.__auto.runs, deaths: window.__auto.deaths, clears: window.__auto.clears, maxFloor: Math.max(window.__auto.maxFloor, window.__game.floor) }));
        if (s.turn >= turns) { console.log('reached', s); break; }
        if (errors.length) break;
        if (Math.floor(s.turn / 500) !== Math.floor(last / 500)) { console.log(Math.round((Date.now() - t0) / 1000) + 's', s); last = s.turn; }
        await new Promise(r => setTimeout(r, 200));
      }
    } else {
      const pre = opt('eval', '');
      if (pre) { await page.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 200)); await page.evaluate(pre); }
      const keys = String(opt('keys', '')).split(',').filter(Boolean);
      for (const spec of keys) {
        const [key, n] = spec.split('*');
        for (let i = 0; i < Number(n || 1); i++) {
          if (key === 'wait') { await new Promise(r => setTimeout(r, 400)); continue; }
          if (key.startsWith('hold:')) { // hold:ArrowRight:800
            const [, k, ms] = key.split(':');
            await page.keyboard.down(k); await new Promise(r => setTimeout(r, Number(ms))); await page.keyboard.up(k); continue;
          }
          await page.keyboard.press(key);
          await new Promise(r => setTimeout(r, 160));
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }
    const out = opt('out', 'shots/shot.png');
    fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
    const el = await page.$('#game');
    await el.screenshot({ path: path.resolve(root, out) });
    const state = await page.evaluate(() => { const g = window.__game; return g.map ? { state: g.state, floor: g.floor, turn: g.turn, pos: [g.player.x, g.player.y], hp: g.player.hp, lv: g.player.lv, log: g.messages.slice(-6).map(m => m.text) } : { state: g.state }; });
    console.log(JSON.stringify(state, null, 1));
    console.log('screenshot:', out);
  }
} catch (e) {
  console.error('ERROR', e.message);
  exit = 1;
}
if (errors.length) { console.log('--- page errors ---'); for (const e of errors) console.log(e); exit = 1; }
await browser.close();
server.close();
process.exit(exit);
