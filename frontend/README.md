# Frontend Thanh Âm

Giao diện Vietnamese Speech To Text, dùng React 19, TypeScript và Vite: xác thực, Dashboard, dự án, tệp nguồn, theo dõi xử lý, phụ đề, thư viện và kho tệp.

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
npm run typecheck
npm run build
```

## Phạm vi

- `src/features/auth/LoginPage.tsx`: form đăng nhập và đăng ký, kiểm tra mật khẩu xác nhận, gọi API, thông báo thành công và lỗi.
- `src/features/auth/AuthProvider.tsx`: khôi phục và quản lý phiên đăng nhập.
- `src/features/auth/LogoutPage.tsx`: kết thúc phiên để có thể đăng nhập tài khoản khác.
- `src/features/dashboard/DashboardPage.tsx`: lời chào, bốn thẻ thống kê, dự án và hoạt động gần đây từ API.
- `src/features/projects/components/ProjectCards.tsx`: thẻ dự án với trạng thái, tiến độ, ngày cập nhật và số thành viên.
- `src/features/projects/`: danh sách, tạo/sửa dự án, thùng rác và trang chi tiết.
- `src/features/projects/media/`: xem trước nguồn, upload chia phần, ghi âm và bắt đầu xử lý tệp đã chọn.
- `src/features/projects/jobs/`: tiến độ, thời gian, các giai đoạn, hủy/thử lại, lịch sử và kết quả riêng của từng tác vụ.
- `src/features/projects/exports/`: xuất tệp và phụ đề video.
- `src/features/library/`, `src/features/files/`: thư viện kết quả, kho tệp và xem nhanh.
- `src/shared/hooks/useResource.ts`: tải dữ liệu có hủy yêu cầu khi rời trang, báo lỗi và thử lại.
- `src/shared/`: API client, kiểu dữ liệu, hook tác vụ, thông báo và CSS dùng chung từ dự án gốc.
- `src/app/layouts/WorkspaceLayout.tsx`: sidebar, header, footer, menu di động và chặn truy cập khi chưa đăng nhập.
- `src/app/layouts/navigation.ts`: khai báo đường dẫn và nhãn điều hướng dùng chung cho sidebar, header và router.
- `src/app/layouts/workspace.css`: CSS khung ứng dụng và menu responsive, trích riêng từ giao diện gốc.
- `src/app/App.tsx`: router các trang xác thực, nội dung trong khung ứng dụng và trang không tìm thấy.

Mã giao diện được trích từ dự án cục bộ. CSS, component và kiểu dữ liệu gồm xác thực, khung ứng dụng và các phần Dashboard đã hoàn thành, giữ responsive và hỗ trợ giảm chuyển động.

Sau đăng nhập, Dashboard gọi `GET /api/dashboard` và hiển thị tổng dự án, số dự án hoàn thành, đang xử lý, thời lượng và dung lượng đã lưu. Trang có trạng thái tải, lỗi và nút thử lại; chỉ hiển thị số liệu do API trả về. Danh sách dự án gần đây hiển thị thẻ dự án và hướng dẫn theo vai trò khi chưa có dữ liệu. Hoạt động gần đây hiển thị tối đa bảy bản ghi theo thứ tự API trả về, tên người thực hiện (hoặc Hệ thống), hành động và ngày; có thông báo khi danh sách rỗng. Khung hiển thị tên và email tài khoản.

Các mục từ điển, tìm kiếm, thanh toán, hồ sơ, thông báo và cài đặt chưa được đưa vào bản này. Ô tìm kiếm trên header chuyển tới `/search?q=...`; chưa tải kết quả tìm kiếm.

Thẻ dự án dẫn tới `/projects/:projectId`. Chọn tệp nguồn để xem trước và bắt đầu xử lý; giao diện kiểm tra quyền sửa, khả năng máy chủ và tác vụ đang chạy trước khi cho gửi yêu cầu. Trạng thái tác vụ cập nhật mỗi 2 giây, đồng hồ xử lý cập nhật mỗi giây và dừng khi tác vụ kết thúc. API vẫn phải kiểm tra quyền và ngăn tác vụ trùng trên máy chủ.

Tab **Lịch sử xử lý** giữ bộ lọc tên tệp/mã tác vụ, trạng thái và trang trong URL. Tác vụ thành công có nút **Xem kết quả tác vụ**; bản ghi, OCR, biên bản và tệp tải xuống lấy từ lần xử lý đó, không thay bằng nguồn đang được chọn. Đây là màn hình đọc kết quả; các trình biên tập transcript, OCR và biên bản chưa nằm trong bản này.

Xử lý dùng `GET /api/system/capabilities`, `GET/POST /api/projects/{id}/jobs`, `GET /api/jobs/{id}`, `POST /api/jobs/{id}/cancel`, `POST /api/jobs/{id}/retry` và `GET /api/jobs/{id}/results`. Khi máy chủ yêu cầu thanh toán, giao diện hiển thị lỗi API; màn hình thanh toán được đưa lên riêng ở mục 17.

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
| `GET /api/dashboard` | Không có body; gửi access token qua header Bearer |

Đăng nhập và refresh trả `{ access_token, user }`, theo kiểu `Session` trong `src/shared/types.ts`. Access token giữ trong bộ nhớ; API client gửi cookie với `credentials: "include"`. API chịu trách nhiệm kiểm tra dữ liệu, quản lý tài khoản và cấp cookie phiên.

Dashboard dùng phản hồi `{ stats: { projects, ready, processing, duration_ms, storage_bytes }, projects: Project[], activities: Audit[] }`. Kiểu `Project` và `Audit` nằm trong `src/shared/types.ts`. Thời lượng là mili giây, dung lượng là byte; giao diện định dạng thành `HH:MM:SS` và đơn vị B/KB/MB/GB. Backend cần trả thống kê, dự án và hoạt động theo quyền truy cập của tài khoản, sắp xếp dự án và hoạt động mới nhất trước; frontend không tự suy diễn số liệu khi yêu cầu lỗi.

Sau đăng ký thành công, giao diện chuyển về đăng nhập. Mật khẩu đăng ký dài 10–128 ký tự, có ít nhất một chữ A–Z và một chữ số. Khi triển khai bản build, cấu hình máy chủ phục vụ `index.html` cho các đường dẫn giao diện và chuyển tiếp `/api` tới máy chủ xác thực.

Kiểm thử frontend dùng phản hồi API giả lập, không tạo tài khoản trên máy chủ thật. Không kèm backend, cơ sở dữ liệu, `.env`, tài khoản thật hoặc thư mục cài đặt thư viện.
