# Vỏ Paper — Website Analytics

## Chạy dự án

Yêu cầu Node.js 22 trở lên, không cần cài thư viện ngoài.

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

## Cấu trúc và phạm vi thay đổi

Website gốc là HTML tĩnh: `index.html` khoảng 7 MB chứa CSS, JavaScript, ảnh nhúng, đa ngôn ngữ, đổi theme và minigame; `assets/game/` chứa sprite. GA4 và Vercel Analytics đã được tích hợp sẵn. Không có framework, package manager, backend hay xác thực trước thay đổi này.

Giữ nguyên logic gốc; chỉ thêm script `/tracker.js` cuối trang. Không truy xuất hoặc nhập dữ liệu từ GA4/Vercel. Dashboard mới dùng HTML/CSS/JavaScript thuần phù hợp kiến trúc hiện tại:

- `server.js`: phục vụ các file công khai được cho phép, đăng nhập phía server, session cookie và API/SSE có xác thực.
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

Pageview thật được server đóng dấu thời gian, ghi vào `data/visits.jsonl` rồi thông báo các Dashboard đã đăng nhập qua Server-Sent Events (`/api/stream`). Dashboard tự lấy lại thống kê, không reload trang. SSE tự kết nối lại khi mất mạng; giao diện hiển thị trạng thái và lỗi. Lịch sử được đọc lại khi khởi động server; online và phiên đăng nhập chỉ giữ trong RAM. File dữ liệu không nằm trong danh sách file công khai và được Git bỏ qua.

Chạy bằng server Node này để có đầy đủ Analytics. Mở trực tiếp `index.html`, dùng static hosting hoặc chỉ deploy HTML lên Vercel sẽ không chạy backend Analytics; nội dung cũ vẫn có thể xem nhưng tracker không có API để ghi dữ liệu. Khi deploy cần host hỗ trợ tiến trình Node, SSE và ổ đĩa bền vững; cấu hình reverse proxy không buffer SSE. Bản hiện tại dùng một tiến trình, giữ lịch sử trong RAM và JSONL trên đĩa; phù hợp demo lưu lượng nhỏ. Chưa có hàng đợi offline, lọc bot hoặc xác minh sự kiện từ máy khách.

## Xác thực demo

Tài khoản hardcode chỉ nằm trong server, không đưa vào JavaScript trình duyệt. Cookie ngẫu nhiên HttpOnly, SameSite=Strict; Secure khi dùng HTTPS, hết hạn sau 8 giờ. Truy cập Dashboard chưa đăng nhập bị chuyển tới login, API thống kê/SSE trả 401. Đăng xuất vô hiệu hóa session và đóng stream liên quan. API ghi nhận vẫn công khai để người ghé website có thể gửi sự kiện; có giới hạn tốc độ, kích thước payload, kiểm tra dữ liệu và nguồn yêu cầu. Không lưu địa chỉ IP trong lịch sử.

**Chỉ dùng demo, không phù hợp bảo vệ dữ liệu production.** Trước khi dùng thật cần thay tài khoản hardcode bằng hệ thống xác thực phù hợp, HTTPS, kho dữ liệu/session dùng chung, chính sách lưu trữ dữ liệu và xử lý lưu lượng lớn. Website có liên kết quản trị ở cuối trang; các trang admin có `noindex`, bảo vệ truy cập được thực hiện bằng session phía server.
