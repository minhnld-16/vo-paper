/* First-party page views and presence; no random analytics counters. */
(() => {
  if (!/^https?:$/.test(location.protocol)) return;
  let visitor, session;
  const uuid = () => crypto.randomUUID();
  try { visitor = localStorage.getItem('vo-visitor') || uuid(); localStorage.setItem('vo-visitor', visitor); } catch { visitor = uuid(); }
  function currentSession() {
    try {
      const saved = JSON.parse(localStorage.getItem('vo-visit-session') || 'null');
      session = saved && Date.now() - saved.time < 1800000 ? saved.id : uuid();
      localStorage.setItem('vo-visit-session', JSON.stringify({ id: session, time: Date.now() }));
    } catch { session = session || uuid(); }
    return session;
  }
  const payload = type => JSON.stringify({ type, visitor, session: currentSession(), path: (location.pathname === '/index.html' ? '/' : location.pathname) + location.hash, referrer: document.referrer });
  function send(type) { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload(type), keepalive: true }).catch(() => {}); }
  send('pageview');
  addEventListener('hashchange', () => send('pageview'));
  setInterval(() => { if (!document.hidden) send('heartbeat'); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) send('heartbeat'); });
})();
