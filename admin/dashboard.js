(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('vi-VN').format(n);
  async function request(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401 && !$('login')) { location.replace('/admin/login'); throw new Error('Phiên đăng nhập đã hết hạn.'); }
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Không thể tải dữ liệu.'); return data;
  }
  if ($('login')) {
    $('toggle-password').onclick = () => { const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'; $('toggle-password').textContent = show ? 'Ẩn' : 'Hiện'; $('toggle-password').setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); };
    $('login').onsubmit = async e => { e.preventDefault(); const button = e.target.querySelector('[type=submit]'); button.disabled = true; $('error').textContent = ''; try { await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('username').value, password: $('password').value }) }); location.replace('/admin'); } catch (err) { $('error').textContent = err.message; } finally { button.disabled = false; } }; return;
  }
  let source = 'real', generation = 0, pending = false, queued = false;
  const dayKey = time => new Date(time + 7 * 3600000).toISOString().slice(0, 10);
  function range() {
    const today = dayKey(Date.now());
    if ($('period').value === 'custom') return [$('start').value, $('end').value];
    return [dayKey(Date.now() - (Number($('period').value) || 1) * 86400000 + 86400000), today];
  }
  $('end').value = dayKey(Date.now()); $('start').value = dayKey(Date.now() - 29 * 86400000);
  function rank(id, rows, total) {
    const container = $(id); container.replaceChildren();
    if (!rows.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Chưa có dữ liệu trong khoảng thời gian này.'; container.append(p); return; }
    for (const row of rows) {
      const item = document.createElement('div'); item.className = 'rank-row';
      const label = document.createElement('div'); label.className = 'rank-label';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = row.name; name.title = row.name;
      const count = document.createElement('span'); count.className = 'count'; count.textContent = fmt(row.count);
      const percent = document.createElement('small'); percent.textContent = `${Math.round(row.count / (total || 1) * 100)}%`; count.append(percent); label.append(name, count);
      const progress = document.createElement('div'); progress.className = 'progress'; const bar = document.createElement('div'); bar.style.width = `${row.count / rows[0].count * 100}%`; progress.append(bar); item.append(label, progress); container.append(item);
    }
  }
  function chart(data) {
    const series = data.series, width = 1000, height = 270, left = 48, right = 18, top = 18, bottom = 38, plotHeight = height - top - bottom;
    const max = Math.max(4, ...series.map(d => d.views)), ceiling = Math.ceil(max / 4) * 4;
    const step = (width - left - right) / series.length, barWidth = Math.min(22, step * .6);
    const y = n => top + plotHeight - n / ceiling * plotHeight;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Lượt xem và phiên truy cập theo thời gian"><title>Thống kê ${source === 'demo' ? 'minh họa' : 'thực tế'}</title>`;
    for (let i = 0; i <= 4; i++) { const value = i * ceiling / 4; svg += `<line x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}" stroke="#e7e9df" stroke-dasharray="3 5"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end" fill="#87917f" font-size="10">${fmt(value)}</text>`; }
    series.forEach((item, i) => {
      const x = left + step * (i + .5), label = item.date.length === 7 ? item.date.slice(5) + '/' + item.date.slice(0,4) : item.date.slice(8) + '/' + item.date.slice(5,7);
      svg += `<g><title>${item.date}: ${fmt(item.views)} lượt xem, ${fmt(item.visits)} phiên, ${fmt(item.users)} người dùng</title><rect x="${x-barWidth/2}" y="${y(item.views)}" width="${barWidth}" height="${item.views/ceiling*plotHeight}" rx="2" fill="#8b9d6f"/><circle cx="${x}" cy="${y(item.visits)}" r="3" fill="#bc9953"/></g>`;
      if (i % Math.max(1,Math.ceil(series.length/12)) === 0 || i === series.length-1) svg += `<text x="${x}" y="${height-10}" text-anchor="middle" fill="#87917f" font-size="10">${label}</text>`;
    });
    $('chart').innerHTML = svg + '</svg>';
    $('chart-caption').textContent = data.totals.pageviews ? 'Di chuột lên cột để xem số liệu. Thời gian thống kê: UTC+7.' : 'Chưa ghi nhận lượt xem. Mở website ở tab hoặc trình duyệt khác để bắt đầu theo dõi.';
    $('series-table').replaceChildren();
    for (const row of series) { const tr = document.createElement('tr'); for (const value of [row.date, fmt(row.views), fmt(row.visits), fmt(row.users)]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } $('series-table').append(tr); }
  }
  async function load() {
    if (pending) { queued = true; return; }
    const [start, end] = range();
    if (!start || !end || start > end || Date.parse(end)-Date.parse(start) > 366*86400000) { $('error').textContent = 'Chọn khoảng ngày hợp lệ, tối đa 367 ngày.'; return; }
    pending = true; const current = ++generation; $('refresh').disabled = true;
    try {
      const data = await request('/api/stats?' + new URLSearchParams({ start, end, source, group: $('group').value }));
      if (current !== generation) return;
      $('error').textContent = '';
      for (const key of ['visits','users','pageviews']) $(key).textContent = fmt(data.totals[key]);
      $('online').textContent = $('online-card').textContent = fmt(data.online);
      $('data-notice').classList.toggle('demo', data.source === 'demo');
      $('data-notice').textContent = data.source === 'demo' ? 'DỮ LIỆU MINH HỌA · Lịch sử giả lập để khám phá Dashboard, không cộng vào số liệu thực tế. Chỉ số online vẫn là người truy cập thật.' : 'DỮ LIỆU THỰC TẾ · Ghi nhận từ lượt xem website và các mục qua liên kết. Tự động cập nhật, không cần tải lại trang.';
      chart(data); for (const key of ['pages','sources','devices','browsers']) rank(key, data[key], data.totals.pageviews);
      $('recent').replaceChildren();
      if (!data.recent.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Chưa có lượt xem.'; $('recent').append(p); }
      for (const row of data.recent) { const item = document.createElement('div'); item.className = 'recent-row'; const name = document.createElement('span'); name.textContent = row.path; name.title = row.path; const time = document.createElement('small'); time.textContent = new Date(row.timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' }); item.append(name, time); $('recent').append(item); }
    } catch (err) { $('error').textContent = err.message; } finally { pending = false; $('refresh').disabled = false; if (queued) { queued = false; load(); } }
  }
  document.querySelectorAll('[data-source]').forEach(button => button.onclick = () => { source = button.dataset.source; generation++; document.querySelectorAll('[data-source]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); }); load(); });
  $('period').onchange = () => { $('custom-range').hidden = $('period').value !== 'custom'; if ($('period').value !== 'custom') { generation++; load(); } };
  $('custom-range').onsubmit = e => { e.preventDefault(); generation++; load(); };
  $('group').onchange = () => { generation++; load(); };
  $('refresh').onclick = load;
  $('logout').onclick = async () => { try { await request('/api/logout', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }); location.replace('/admin/login'); } catch (err) { $('error').textContent = err.message; } };
  const stream = new EventSource('/api/stream');
  stream.onopen = () => { $('connection').textContent = '● Đã kết nối cập nhật trực tiếp'; };
  let refreshTimer;
  stream.onmessage = event => { const update = JSON.parse(event.data); $('online').textContent = $('online-card').textContent = fmt(update.online); clearTimeout(refreshTimer); refreshTimer = setTimeout(load, 300); };
  stream.onerror = () => { $('connection').textContent = 'Đang kết nối lại…'; request('/api/session').catch(() => {}); };
  addEventListener('pagehide', () => stream.close()); load();
})();
