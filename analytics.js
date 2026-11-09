const DAY = 86400000;
const dateKey = timestamp => new Date(timestamp + 7 * 3600000).toISOString().slice(0, 10);
function summarize(events, start, end, group = 'day') {
  const filtered = events.filter(e => { const day = dateKey(e.timestamp); return day >= start && day <= end; });
  const buckets = new Map();
  for (let t = Date.parse(start); t <= Date.parse(end); t += DAY) { const key = new Date(t).toISOString().slice(0, group === 'month' ? 7 : 10); if (!buckets.has(key)) buckets.set(key, []); }
  for (const event of filtered) buckets.get(dateKey(event.timestamp).slice(0, group === 'month' ? 7 : 10))?.push(event);
  const distinct = (list, key) => new Set(list.map(e => e[key])).size;
  const rank = key => Object.entries(filtered.reduce((acc, e) => { acc[e[key]] = (acc[e[key]] || 0) + 1; return acc; }, Object.create(null))).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  return { totals: { visits: distinct(filtered, 'session'), users: distinct(filtered, 'visitor'), pageviews: filtered.length }, series: [...buckets].map(([date, list]) => ({ date, views: list.length, visits: distinct(list, 'session'), users: distinct(list, 'visitor') })), pages: rank('path'), sources: rank('referrer'), devices: rank('device'), browsers: rank('browser'), recent: [...filtered].sort((a,b) => b.timestamp-a.timestamp).slice(0,8).map(({ timestamp, path, device }) => ({ timestamp, path, device })) };
}
function mockEvents(now) {
  const events = [], today = Date.parse(dateKey(now)) - 7 * 3600000;
  for (let day = 0; day < 180; day++) {
    const count = 35 + ((day * 43 + 17) % 100) + Math.round(25 * Math.sin(day));
    for (let i = 0; i < count; i++) events.push({ timestamp: today - day * DAY + (Math.floor(i/3) % 20) * 3600000, visitor: `demo-user-${(day * 13 + Math.floor(i/3)) % 340}`, session: `demo-session-${day}-${Math.floor(i/3)}`, path: ['/', '/#material', '/#studio', '/#minigame', '/#process'][i % 5], referrer: ['Trực tiếp', 'google.com', 'facebook.com', 'chat.zalo.me'][Math.floor(i/3) % 4], device: ['Desktop','Mobile','Desktop','Mobile','Tablet'][Math.floor(i/3) % 5], browser: ['Chrome','Safari','Chrome','Edge','Firefox'][Math.floor(i/3) % 5] });
  }
  return events.filter(event => event.timestamp <= now);
}
module.exports = { summarize, mockEvents, dateKey };
