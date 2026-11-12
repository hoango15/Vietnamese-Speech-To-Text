# Frontend Thanh Âm — xác thực, khung ứng dụng và Dashboard

Giao diện xác thực, khung ứng dụng và Dashboard của Vietnamese Speech To Text, dùng React 19, TypeScript và Vite.

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
- `src/features/dashboard/DashboardPage.tsx`: trang tổng quan, lời chào theo tài khoản và liên kết dự án theo vai trò.
- `src/shared/`: API client, kiểu dữ liệu, hook tác vụ, thông báo và CSS dùng chung từ dự án gốc.
- `src/app/layouts/WorkspaceLayout.tsx`: sidebar, header, footer, menu di động và chặn truy cập khi chưa đăng nhập.
- `src/app/layouts/navigation.ts`: khai báo đường dẫn và nhãn điều hướng dùng chung cho sidebar, header và router.
- `src/app/layouts/workspace.css`: CSS khung ứng dụng và menu responsive, trích riêng từ giao diện gốc.
- `src/app/App.tsx`: router các trang xác thực, nội dung trong khung ứng dụng và trang không tìm thấy.

Mã giao diện được trích từ dự án cục bộ. CSS, component và kiểu dữ liệu gồm xác thực, khung ứng dụng và các phần Dashboard đã hoàn thành, giữ responsive và hỗ trợ giảm chuyển động.

Sau đăng nhập, trang tổng quan hiển thị lời chào và nút đến dự án theo vai trò; khung hiển thị tên và email tài khoản. Các mục dự án, thư viện, kho tệp, từ điển, thanh toán, hồ sơ, thông báo và cài đặt đã có đường dẫn, nhưng hiện chỉ hiển thị thông báo màn hình sẽ được bổ sung. Ô tìm kiếm trên header chuyển tới `/search?q=...`; chưa tải kết quả tìm kiếm. Dashboard chưa tải thống kê, dự án hoặc hoạt động. Chưa kèm tác vụ xử lý hay nghiệp vụ của các mục này; khung không gọi API tính năng và không hiển thị thống kê hoặc thông báo giả.

Nếu mở đường dẫn được bảo vệ khi chưa đăng nhập, ứng dụng chuyển tới `/login` và trở lại đúng đường dẫn, tham số và phần neo sau khi xác thực. Liên kết quản trị chỉ hiện theo vai trò; đường dẫn quản trị không phù hợp hiển thị từ chối truy cập. Đây là kiểm soát giao diện; API vẫn phải kiểm tra quyền ở máy chủ.

Trên màn hình rộng tối đa 760px, sidebar chuyển thành menu đóng/mở. Menu hỗ trợ Escape, giới hạn focus, khóa cuộn nền và khôi phục focus khi đóng; có liên kết bỏ qua điều hướng để đến nội dung chính.

Trong lúc gửi đăng nhập hoặc đăng ký, các trường và nút chuyển form bị khóa để dữ liệu hiển thị khớp với yêu cầu đang xử lý. Kiểm thử gửi form qua `requestSubmit()` để kiểm tra cả các ràng buộc `required`, email và mật khẩu, cùng trường hợp đăng ký đang chờ phản hồi.

GitHub Actions chạy `npm ci`, `npm test` và `npm run build` khi mã frontend thay đổi trên nhánh `front-end` hoặc trong pull request.

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
