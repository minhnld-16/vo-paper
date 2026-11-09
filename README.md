# Vỏ Paper — Website Analytics

## Chạy dự án

Yêu cầu Node.js 22.x, không cần cài thư viện ngoài.

```sh
npm start
```

- Website: http://localhost:3000
- Đăng nhập: http://localhost:3000/admin/login
- Dashboard: http://localhost:3000/admin (hoặc `/dashboard`)
- Trên website: cuộn xuống cuối trang → cột **Kết nối** → **Quản trị · Dashboard**. Người chưa đăng nhập được chuyển đến trang đăng nhập.
- Tài khoản demo: **admin** / **VoPaper@2026**
- Kiểm tra: `npm test`
- Đổi cổng bằng biến môi trường `PORT`.

## Deploy trên Vercel

Repo đã có `vercel.json`, API serverless `api/index.js` và lệnh build. Các bước trên tài khoản Vercel:

1. Mở project của repo `minhnld-16/vo-paper`. Trong **Settings → Build and Deployment**, dùng **Framework Preset: Other**, **Build Command: npm run build**, **Output Directory: public**, **Node.js: 22.x**. Nếu project đang có override khác, bỏ override hoặc sửa cho khớp `vercel.json`.
2. Kết nối **Upstash Redis** từ phần Storage/Marketplace với project, hoặc dùng Redis Upstash có sẵn. Xem [hướng dẫn kết nối chính thức](https://upstash.com/docs/redis/howto/vercelintegration).
3. Trong **Settings → Environment Variables**, kiểm tra hai biến `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN` (token có quyền ghi). Code cũng hỗ trợ cặp tên `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Nếu integration sinh biến có prefix khác, thêm hai tên chuẩn từ thông tin REST trong Upstash. Bật cho **Production** và **Preview** nếu cần kiểm thử preview. Không dùng `REDIS_URL` dạng TCP hoặc token readonly; không gửi token qua chat hay commit vào Git.
4. **Redeploy** để áp dụng biến môi trường. Mở website → cuối trang → **Kết nối → Quản trị · Dashboard**, đăng nhập tài khoản demo ở trên.
5. Chọn **Dữ liệu thực tế**, mở trang chủ ở tab khác rồi chờ tối đa khoảng 5 giây. Số lượt xem và online sẽ cập nhật, không tải lại trang. Đóng tab và chờ 65 giây để online hết hạn.

Trên Vercel, lịch sử, session và online lưu dùng chung trong Redis; không ghi vào filesystem và không phụ thuộc bộ nhớ của từng instance. Dashboard polling API mỗi 5 giây khi đang hiển thị, dừng polling khi tab nền. Local không có biến Redis vẫn dùng JSONL và SSE như cũ. Muốn thử Redis ở local, đặt biến môi trường trước `npm start` hoặc dùng `node --env-file=.env.local server.js` với các tên trong `.env.example`.

Không có Redis thì trang chủ và trang login vẫn hiển thị, nhưng API ghi nhận/đăng nhập trả **503 kèm hướng dẫn cấu hình**; không tạo dữ liệu thực tế giả hoặc fallback vào bộ nhớ tạm. Đây là một dịch vụ lưu trữ bên ngoài cần được chủ tài khoản kết nối; push code không tự tạo Redis hay thiết lập biến môi trường.

Prefix mặc định là `vo-paper:production`, `vo-paper:preview` hoặc `vo-paper:development` theo `VERCEL_ENV`. Mọi preview trong cùng project dùng chung prefix preview; đặt `ANALYTICS_KEY_PREFIX` nếu muốn tách thêm. Không dùng chung Redis/prefix giữa các project độc lập. Lịch sử không tự xóa; số liệu phù hợp demo lưu lượng nhỏ, cần chính sách retention/aggregation trước khi mở rộng.

`npm run build` chỉ đưa trang chủ, tracker, CSS/JS quản trị và assets vào `public/`. Không đưa HTML Dashboard/login, server, README, biến môi trường hay dữ liệu vào static output. Các route `/admin`, `/admin/login`, `/dashboard` và `/api/*` được xử lý bằng function; HTML Dashboard chỉ trả về sau khi xác thực. GA4 và Vercel Web Analytics vẫn giữ nguyên.

## Cấu trúc và phạm vi thay đổi

Website gốc là HTML tĩnh: `index.html` khoảng 7 MB chứa CSS, JavaScript, ảnh nhúng, đa ngôn ngữ, đổi theme và minigame; `assets/game/` chứa sprite. GA4 và Vercel Analytics đã được tích hợp sẵn. Không có framework, package manager, backend hay xác thực trước thay đổi này.

Giữ nguyên logic gốc; thêm script `/tracker.js` và liên kết quản trị cuối trang. Không truy xuất hoặc nhập dữ liệu từ GA4/Vercel. Dashboard mới dùng HTML/CSS/JavaScript thuần phù hợp kiến trúc hiện tại:

- `server.js`: phục vụ các file công khai được cho phép, đăng nhập phía server, session cookie và API/SSE có xác thực.
- `redis-store.js`: lưu trữ Redis qua REST, session hết hạn 8 giờ, online có thời hạn và rate limit dùng chung giữa các instance.
- `api/index.js`, `vercel.json`, `scripts/build-vercel.js`: serverless entrypoint, routing và build static assets cho Vercel.
- `analytics.js`: tổng hợp số liệu và tạo lịch sử minh họa 180 ngày.
- `tracker.js`: gửi pageview khi tải trang và đổi hash; gửi heartbeat mỗi 20 giây khi tab đang hiển thị.
- `admin/`: login, Dashboard responsive, biểu đồ SVG có tooltip và bảng số liệu truy cập được bằng bàn phím.
- `test/`: kiểm thử xác thực, ghi nhận thật, SSE, thống kê, phân biệt dữ liệu và lưu trữ.

## Ý nghĩa số liệu

- **Lượt truy cập**: số session duy nhất có pageview trong khoảng chọn. Session được dùng chung giữa các tab, hết hạn sau 30 phút không có hoạt động.
- **Người dùng**: số mã trình duyệt duy nhất lưu trong localStorage; không phải số người thật được xác minh. Xóa storage hoặc đổi trình duyệt sẽ tạo người dùng mới. Khi storage không khả dụng, mã chỉ tồn tại trong lần mở trang.
- **Lượt xem**: tải website hoặc chuyển sang một mục qua hash (`/#studio`, `/#minigame`...). Cuộn trang đơn thuần không tạo lượt xem.
- **Online**: số mã trình duyệt có pageview/heartbeat trong 65 giây gần nhất, gộp các tab. Đóng tab hoặc chuyển nền sẽ hết online sau thời hạn này. Chỉ số này luôn là thực tế và không phụ thuộc bộ lọc ngày hay nguồn minh họa.
- **Ngày/tháng**: tổng hợp theo UTC+7, bao gồm cả ngày bắt đầu và kết thúc; hỗ trợ hôm nay, 7 ngày, 30 ngày hoặc tùy chỉnh tối đa 367 ngày.
- **Nguồn truy cập**: hostname từ `document.referrer`, truy cập nội bộ/không có referrer hiển thị “Trực tiếp”. Thiết bị và trình duyệt được suy ra từ User-Agent. Không suy đoán quốc gia/thành phố khi không có dữ liệu vị trí.

Trang quản trị và trang login không được tracker ghi nhận. Heartbeat không làm tăng pageview. Dữ liệu minh họa được tạo riêng, gắn nhãn rõ ràng, không ghi vào lịch sử thật. Các bảng phân bố dùng số lượt xem; các mã visitor/session không gửi về Dashboard.

## Realtime và lưu trữ

Pageview thật được server đóng dấu thời gian. Ở local không có Redis, ghi vào `data/visits.jsonl` rồi thông báo các Dashboard đã đăng nhập qua Server-Sent Events (`/api/stream`). Dashboard tự lấy lại thống kê, không reload trang. SSE tự kết nối lại khi mất mạng; giao diện hiển thị trạng thái và lỗi. Lịch sử được đọc lại khi khởi động server; online và phiên đăng nhập local chỉ giữ trong RAM. File dữ liệu không nằm trong danh sách file công khai và được Git bỏ qua. Khi có Redis, mọi ghi nhận và xác thực đều hoàn tất trên Redis trước khi phản hồi; trên Vercel Dashboard dùng polling thay cho stream dài hạn.

Mở trực tiếp `index.html` hoặc chỉ dùng static hosting sẽ không chạy backend Analytics. Trên Vercel cần deploy đầy đủ repo với cấu hình và Redis ở trên. Nếu deploy lên VPS không có Redis thì cần ổ đĩa bền vững, một tiến trình Node và reverse proxy không buffer SSE. Chưa có hàng đợi offline, lọc bot hoặc xác minh sự kiện từ máy khách. Test Redis dùng HTTP fixture, không thay thế việc xác nhận kết nối Redis thật và kiểm thử trên deployment sau khi cấu hình tài khoản.

## Xác thực demo

Tài khoản hardcode chỉ nằm trong server, không đưa vào JavaScript trình duyệt. Cookie ngẫu nhiên HttpOnly, SameSite=Strict; Secure khi dùng HTTPS, hết hạn sau 8 giờ. Truy cập Dashboard chưa đăng nhập bị chuyển tới login, API thống kê/SSE trả 401. Đăng xuất vô hiệu hóa session và đóng stream liên quan. API ghi nhận vẫn công khai để người ghé website có thể gửi sự kiện; có giới hạn tốc độ, kích thước payload, kiểm tra dữ liệu và nguồn yêu cầu. Không lưu địa chỉ IP trong lịch sử.

**Chỉ dùng demo, không phù hợp bảo vệ dữ liệu production.** Trước khi dùng thật cần thay tài khoản hardcode bằng hệ thống xác thực phù hợp, HTTPS, kho dữ liệu/session dùng chung, chính sách lưu trữ dữ liệu và xử lý lưu lượng lớn. Website có liên kết quản trị ở cuối trang; các trang admin có `noindex`, bảo vệ truy cập được thực hiện bằng session phía server.
