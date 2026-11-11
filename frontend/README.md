# Frontend đăng nhập và đăng ký — Thanh Âm

Phần giao diện xác thực của Vietnamese Speech To Text, dùng React 19, TypeScript và Vite.

## Chạy giao diện

Yêu cầu Node.js 22.12+ hoặc Node.js 24 và npm.

```sh
cd frontend
npm ci
npm run dev
```

Mở `http://localhost:5173/login`. Bấm **Đăng ký** để chuyển sang form tạo tài khoản.

```sh
npm test
npm run build
```

## Phạm vi

- `src/features/auth/LoginPage.tsx`: form đăng nhập và đăng ký, kiểm tra mật khẩu xác nhận, gọi API, thông báo thành công và lỗi.
- `src/features/auth/AuthProvider.tsx`: khôi phục và quản lý phiên đăng nhập.
- `src/features/auth/LogoutPage.tsx`: kết thúc phiên để có thể đăng nhập tài khoản khác.
- `src/shared/`: API client, kiểu dữ liệu, hook tác vụ, thông báo và CSS dùng chung từ dự án gốc.
- `src/app/App.tsx`: điểm chạy riêng cho phần xác thực; sau đăng nhập chỉ hiện tên, email và nút đăng xuất.

Mã tính năng xác thực và các file dùng chung được giữ nguyên từ dự án cục bộ. Router được giới hạn cho phần xác thực; các màn hình dự án, xử lý giọng nói, quản trị và thanh toán không thuộc bản này.

## Kết nối API

Đây là frontend. Đăng nhập và tạo tài khoản thật cần máy chủ xác thực tương thích đang chạy. Vite chuyển tiếp `/api` tới `http://localhost:8000` theo `vite.config.ts`.

| Yêu cầu | Nội dung gửi |
| --- | --- |
| `POST /api/auth/register` | `{ "full_name": "...", "email": "...", "password": "..." }` |
| `POST /api/auth/login` | `{ "email": "...", "password": "..." }` |
| `POST /api/auth/refresh` | Khôi phục phiên qua cookie |
| `POST /api/auth/logout` | Kết thúc phiên |

Đăng nhập và refresh trả `{ access_token, user }`, theo kiểu `Session` trong `src/shared/types.ts`. Access token giữ trong bộ nhớ; API client gửi cookie với `credentials: "include"`. API chịu trách nhiệm kiểm tra dữ liệu, quản lý tài khoản và cấp cookie phiên.

Sau đăng ký thành công, giao diện chuyển về đăng nhập. Mật khẩu đăng ký dài 10–128 ký tự, có ít nhất một chữ A–Z và một chữ số. Khi triển khai bản build, cấu hình máy chủ phục vụ `index.html` cho các đường dẫn giao diện và chuyển tiếp `/api` tới máy chủ xác thực.

Kiểm thử frontend dùng phản hồi API giả lập, không tạo tài khoản trên máy chủ thật. Không kèm backend, cơ sở dữ liệu, `.env`, tài khoản thật hoặc thư mục cài đặt thư viện.
