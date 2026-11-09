const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { summarize, mockEvents, dateKey } = require('./analytics');

function createApp({ dataDir = path.join(__dirname, 'data'), now = () => Date.now() } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'visits.jsonl');
  const events = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }) : [];
  const sessions = new Map(), online = new Map(), streams = new Set(), limits = new Map();
  const cookieName = 'vo_admin';
  const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  function authenticated(req) {
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return sessions.get(token) > now() ? token : null;
  }
  function onlineCount() { for (const [id, time] of online) if (now() - time > 65000) online.delete(id); return online.size; }
  function broadcast() { const message = `data: ${JSON.stringify({ updatedAt: now(), online: onlineCount() })}\n\n`; for (const client of streams) client.res.write(message); }
  const timer = setInterval(() => {
    for (const client of streams) if (!authenticated(client.req)) { client.res.end(); streams.delete(client); }
    for (const [token, expiry] of sessions) if (expiry <= now()) sessions.delete(token);
    for (const [key, limit] of limits) if (now() - limit.start > 60000) limits.delete(key);
    broadcast();
  }, 15000);
  timer.unref();
  async function body(req) {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) throw new Error('Payload too large'); }
    return JSON.parse(raw || '{}');
  }
  function rate(key, max) { const item = limits.get(key); if (!item || now() - item.start > 60000) { limits.set(key, { start: now(), count: 1 }); return true; } return ++item.count <= max; }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'POST') {
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return send(res, 403, { error: 'Nguồn yêu cầu không hợp lệ.' });
        const ip = req.socket.remoteAddress;
        if (!rate(ip + url.pathname, url.pathname === '/api/login' ? 10 : 180)) return send(res, 429, { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau một phút.' });
        const input = await body(req);
        if (url.pathname === '/api/login') {
          if (input.username !== 'admin' || input.password !== 'VoPaper@2026') return send(res, 401, { error: 'Tài khoản hoặc mật khẩu không đúng.' });
          const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, now() + 8 * 3600000);
          res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
          return send(res, 200, { ok: true });
        }
        if (url.pathname === '/api/logout') {
          const token = authenticated(req); sessions.delete(token);
          for (const client of streams) if (!authenticated(client.req)) { client.res.end(); streams.delete(client); }
          res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); return send(res, 200, { ok: true });
        }
        if (url.pathname === '/api/track') {
          const idPattern = /^[a-zA-Z0-9-]{16,80}$/;
          if (!idPattern.test(input.visitor) || !idPattern.test(input.session) || typeof input.path !== 'string' || !/^\/(?:#|$)/.test(input.path) || input.path.length > 200 || !['pageview', 'heartbeat', 'leave'].includes(input.type)) return send(res, 400, { error: 'Invalid event' });
          if (input.type === 'leave') online.delete(input.visitor);
          else online.set(input.visitor, now());
          if (input.type === 'pageview') {
            let referrer = 'Trực tiếp';
            try { const ref = new URL(input.referrer); if (ref.host !== req.headers.host) referrer = ref.hostname; } catch {}
            const ua = req.headers['user-agent'] || '';
            const event = { timestamp: now(), visitor: input.visitor, session: input.session, path: input.path, referrer, device: /tablet|ipad/i.test(ua) ? 'Tablet' : /mobile|iphone|android/i.test(ua) ? 'Mobile' : 'Desktop', browser: /edg/i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Khác' };
            fs.appendFileSync(file, JSON.stringify(event) + '\n'); events.push(event);
          }
          broadcast(); return send(res, 200, { ok: true });
        }
      }
      if (url.pathname.startsWith('/api/')) {
        if (!authenticated(req)) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
        if (url.pathname === '/api/session') return send(res, 200, { username: 'admin' });
        if (url.pathname === '/api/stats') {
          const start = url.searchParams.get('start') || dateKey(now()), end = url.searchParams.get('end') || start;
          const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
          if (!validDate(start) || !validDate(end) || start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 366) return send(res, 400, { error: 'Khoảng ngày không hợp lệ (tối đa 367 ngày).' });
          const mock = url.searchParams.get('source') === 'demo';
          return send(res, 200, { ...summarize(mock ? mockEvents(now()) : events, start, end, url.searchParams.get('group') === 'month' ? 'month' : 'day'), online: onlineCount(), source: mock ? 'demo' : 'real', updatedAt: now() });
        }
        if (url.pathname === '/api/stream') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          const client = { req, res }; streams.add(client); res.write('retry: 3000\n\n'); broadcast(); req.on('close', () => streams.delete(client)); return;
        }
        return send(res, 404, { error: 'Not found' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed' });
      const dashboard = ['/admin', '/admin/', '/dashboard'].includes(url.pathname);
      if (dashboard && !authenticated(req)) { res.writeHead(302, { Location: '/admin/login' }); return res.end(); }
      const routes = { '/': 'index.html', '/index.html': 'index.html', '/admin/login': 'admin/login.html', '/admin/login/': 'admin/login.html', '/tracker.js': 'tracker.js', '/admin/dashboard.js': 'admin/dashboard.js', '/admin/styles.css': 'admin/styles.css' };
      let target = dashboard ? 'admin/dashboard.html' : routes[url.pathname];
      if (url.pathname.startsWith('/assets/')) { const decoded = decodeURIComponent(url.pathname).slice(1); const absolute = path.resolve(__dirname, decoded); if (absolute.startsWith(path.join(__dirname, 'assets') + path.sep)) target = decoded; }
      if (!target || !fs.existsSync(path.join(__dirname, target))) { res.writeHead(404); return res.end('Not found'); }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end(); fs.createReadStream(path.join(__dirname, target)).pipe(res);
    } catch (error) { if (!res.headersSent) send(res, error instanceof SyntaxError || error.message === 'Payload too large' ? 400 : 500, { error: 'Không thể xử lý yêu cầu.' }); else res.end(); }
  });
  server.on('close', () => { clearInterval(timer); for (const client of streams) client.res.end(); });
  return server;
}
if (require.main === module) createApp().listen(process.env.PORT || 3000, () => console.log(`Vỏ Paper: http://localhost:${process.env.PORT || 3000} | Admin: /admin`));
module.exports = { createApp };
