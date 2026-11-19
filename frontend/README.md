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
- `src/features/projects/bookmarks/`: dấu mốc và ghi chú cá nhân theo từng tệp âm thanh/video; tạo, sửa, xóa và tua đến thời điểm đã lưu.
- `src/features/projects/ocr/`: xem, chỉnh sửa và lịch sử OCR theo từng tệp ảnh; lưu theo revision và bảo vệ bản nháp.
- `src/features/notifications/`: danh sách thông báo, lọc chưa đọc, đánh dấu đã đọc từng mục hoặc tất cả.
- `src/features/library/`, `src/features/files/`: thư viện kết quả, kho tệp và xem nhanh.
- `src/shared/hooks/useResource.ts`: tải dữ liệu có hủy yêu cầu khi rời trang, báo lỗi và thử lại.
- `src/shared/`: API client, kiểu dữ liệu, hook tác vụ, thông báo và CSS dùng chung từ dự án gốc.
- `src/app/layouts/WorkspaceLayout.tsx`: sidebar, header, footer, menu di động và chặn truy cập khi chưa đăng nhập.
- `src/app/layouts/navigation.ts`: khai báo đường dẫn và nhãn điều hướng dùng chung cho sidebar, header và router.
- `src/app/layouts/workspace.css`: CSS khung ứng dụng và menu responsive, trích riêng từ giao diện gốc.
- `src/app/App.tsx`: router các trang xác thực, nội dung trong khung ứng dụng và trang không tìm thấy.

Mã giao diện được trích từ dự án cục bộ. CSS, component và kiểu dữ liệu gồm xác thực, khung ứng dụng và các phần Dashboard đã hoàn thành, giữ responsive và hỗ trợ giảm chuyển động.

Sau đăng nhập, Dashboard gọi `GET /api/dashboard` và hiển thị tổng dự án, số dự án hoàn thành, đang xử lý, thời lượng và dung lượng đã lưu. Trang có trạng thái tải, lỗi và nút thử lại; chỉ hiển thị số liệu do API trả về. Danh sách dự án gần đây hiển thị thẻ dự án và hướng dẫn theo vai trò khi chưa có dữ liệu. Hoạt động gần đây tải riêng từ `GET /api/audit-logs?page=N&page_size=7`, hiển thị bảy bản ghi mỗi trang, tên người thực hiện (hoặc Hệ thống), hành động và ngày. Lỗi tải hoạt động có nút thử lại và không làm mất thống kê. Khung hiển thị tên và email tài khoản.

Dashboard có xóa từng nhật ký và **Xóa tất cả** nhật ký được phép xóa trên mọi trang. Cả hai thao tác đều yêu cầu xác nhận, không thể hoàn tác qua giao diện. Nút xóa từng dòng chỉ xuất hiện khi API trả `can_delete`; xóa tất cả bị khóa khi không có quyền, đang tải/xóa hoặc tải lỗi. Xóa thành công sẽ tải lại trang hiện tại và lùi về trang còn dữ liệu nếu trang cuối đã hết. Hủy xác nhận hoặc yêu cầu lỗi không tự xóa bản ghi trên giao diện.

Từ điển thuật ngữ gọi `GET /api/glossaries?q=...&page=...&page_size=20`, `POST /api/glossaries`, `PATCH /api/glossaries/{term_id}` và `DELETE /api/glossaries/{term_id}`. Mỗi thuật ngữ có `term_id`, `term`, `definition`, `language_code`, `category` và `updated_at`; danh sách theo kiểu `{ items, total }`.

Tìm kiếm bản chép lời gọi `GET /api/search/transcripts?q=...&page=...&page_size=20`; kết quả theo kiểu `{ items, total }`, mỗi dòng có `project_id`, `project_title`, `media_file_id`, `segment_no`, `start_ms`, `end_ms`, `segment_text` và tùy chọn `segment_id`, `speaker_name`. Backend phải giới hạn kết quả theo quyền truy cập dự án của tài khoản.

Hồ sơ gọi `GET /api/users/me` và `PATCH /api/users/me` với `{ full_name }`; phản hồi dùng kiểu `User`. Cài đặt mật khẩu gọi `PATCH /api/auth/password` với `{ current_password, new_password }`. Các endpoint này cần được hỗ trợ bởi backend để lưu dữ liệu thật; frontend hiển thị lỗi API nếu máy chủ chưa triển khai.

Thanh toán hiện vẫn có màn hình chờ bổ sung. Ô tìm kiếm trên header chuyển tới trang tìm kiếm bản chép lời; từ điển và tìm kiếm gọi API riêng, còn hồ sơ và cài đặt tài khoản có trang riêng.

Thông báo gọi `GET /api/notifications?unread_only=...&page=...&page_size=20`, `PATCH /api/notifications/{notification_id}/read` và `POST /api/notifications/read-all`. Danh sách theo kiểu `{ items, total, unread_count }`; mỗi mục có `notification_id`, `notification_type_code`, `title`, `message`, `created_at`, `read_at` và tùy chọn `project_id`, `project_title`, `media_file_id`, `start_ms`. Liên kết thông báo mở đúng dự án, tệp và mốc thời gian nếu API cung cấp chúng. Backend cần giới hạn dữ liệu theo tài khoản hiện tại.

Thẻ dự án dẫn tới `/projects/:projectId`. Chọn tệp nguồn để xem trước và bắt đầu xử lý; giao diện kiểm tra quyền sửa, khả năng máy chủ và tác vụ đang chạy trước khi cho gửi yêu cầu. Trạng thái tác vụ cập nhật mỗi 2 giây, đồng hồ xử lý cập nhật mỗi giây và dừng khi tác vụ kết thúc. API vẫn phải kiểm tra quyền và ngăn tác vụ trùng trên máy chủ.

**Dấu mốc cá nhân** nằm dưới trình phát trong tab Tệp nguồn và Bản ghi. Sau khi tệp tải metadata, bấm **Đánh dấu thời điểm hiện tại**, nhập ghi chú rồi lưu. Bấm thời điểm của dấu mốc để tua đúng tệp; đổi nguồn sẽ tải danh sách riêng và bỏ form dấu mốc đang nhập. Người chỉ có quyền xem dự án vẫn tạo, sửa và xóa dấu mốc của mình. Tệp ảnh không có dấu mốc thời gian.

Dấu mốc dùng `GET /api/projects/{id}/bookmarks?media_file_id={media_id}`, `POST /api/projects/{id}/bookmarks`, `PATCH /api/projects/{id}/bookmarks/{bookmark_id}` và `DELETE /api/projects/{id}/bookmarks/{bookmark_id}`. POST gửi `{ media_file_id, timestamp_ms, note }`; PATCH gửi `{ timestamp_ms, note }`. Thời điểm tính bằng mili giây, nằm trong thời lượng tệp khi đã biết; ghi chú tối đa 2.000 ký tự. Backend phải kiểm tra quyền truy cập dự án và chỉ trả/sửa dấu mốc của tài khoản hiện tại. Lỗi lưu giữ nguyên form, lỗi xóa giữ nguyên dấu mốc và có xác nhận trước khi xóa.

Tab **Lịch sử xử lý** giữ bộ lọc tên tệp/mã tác vụ, trạng thái và trang trong URL. Tác vụ thành công có nút **Xem kết quả tác vụ**; bản ghi, OCR, biên bản và tệp tải xuống lấy từ lần xử lý đó, không thay bằng nguồn đang được chọn. Đây là màn hình đọc kết quả. Chỉnh sửa transcript và OCR nằm trong các tab **Bản ghi** và **OCR**; trình biên tập biên bản chưa được công bố.

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

Phân trang và xóa hoạt động cần backend có API tương thích và migration `012_activity_logs.sql`:

| Yêu cầu | Phản hồi |
| --- | --- |
| `GET /api/audit-logs?page=N&page_size=7` | `{ items: Audit[], total, deletable_total }`; mỗi dòng có `can_delete` |
| `DELETE /api/audit-logs/{audit_log_id}` | `{ ok: true }` |
| `DELETE /api/audit-logs` | `{ ok: true, deleted }`; áp dụng trên mọi trang trong phạm vi được phép |

Backend phải giới hạn dữ liệu theo tổ chức và kiểm tra lại quyền xóa hiện tại: log của bản thân, công ty thực sự đang sở hữu hoặc tổ chức do admin quản lý. Quyền xem dự án được chia sẻ không cho phép xóa log của cộng tác viên. Các cờ giao diện không thay thế kiểm tra quyền ở máy chủ. Đợt này chỉ công bố giao diện Dashboard; không kèm backend/migration hoặc thay đổi màn hình quản trị.

Lỗi import quản trị có trong commit nền `844b58d` đã được sửa ở `c2490ae`, bổ sung `AdminConsole` và `CompaniesPage` cùng các module liên quan. Nhánh hiện chạy toàn bộ test, typecheck và build với cấu hình TypeScript/CI chuẩn.

Sau đăng ký thành công, giao diện chuyển về đăng nhập. Mật khẩu đăng ký dài 10–128 ký tự, có ít nhất một chữ A–Z và một chữ số. Khi triển khai bản build, cấu hình máy chủ phục vụ `index.html` cho các đường dẫn giao diện và chuyển tiếp `/api` tới máy chủ xác thực.

Kiểm thử frontend dùng phản hồi API giả lập, không tạo tài khoản trên máy chủ thật. Không kèm backend, cơ sở dữ liệu, `.env`, tài khoản thật hoặc thư mục cài đặt thư viện.

## Transcript editor: section 8, first delivery

Open a project and choose **Bản ghi** to read and edit the transcript for the selected audio/video source. The editor supports timestamp seeking, segment validation, add/split/merge/delete, speaker controls, saving with revision checks, and version history. Read-only projects keep editing controls disabled. Unsaved transcript or recording drafts are protected when leaving the page; active uploads remain mounted.

Search links using `?tab=content&media=<id>&t=<milliseconds>` open the matching transcript and seek the selected media after metadata loads. The dedicated transcript tab uses `?tab=transcript`.

This delivery requires the matching transcript, speaker and media APIs. Personal bookmarks are included in section 8. Notifications are available in section 15; payment is tracked separately in section 17.

## OCR: mục 9

Mở dự án, chọn tab **OCR** và tệp ảnh nguồn để đọc hoặc chỉnh sửa văn bản nhận dạng. URL `?tab=ocr&media=<id>` giữ đúng ảnh đã chọn; âm thanh/video không gọi API OCR. Người chỉ có quyền xem đọc được văn bản và lịch sử, không sửa được.

OCR dùng `GET /api/projects/{id}/ocr?media_file_id={id}` và `GET /api/projects/{id}/ocr/versions?media_file_id={id}`. Lịch sử hiển thị từng bản chụp với revision, thời điểm và nội dung; không hỗ trợ khôi phục bản cũ. Chưa có OCR hiển thị trạng thái trống; lỗi tải có nút thử lại.

Lưu dùng `PATCH /api/ocr/{ocr_document_id}` với `{ revision, text }`; cho phép văn bản trống, tối đa 2.000.000 ký tự. Lỗi lưu, gồm xung đột `409`, giữ bản nháp. Tải lại khi đang sửa cần xác nhận bỏ nháp. Trong lúc lưu hoặc tải lại, nút lưu bị khóa. Khi bản nháp chưa lưu, đổi/xóa nguồn và cài đặt bị khóa; rời tab/trang hoặc đóng trang được bảo vệ như trình biên tập transcript. Upload và bản thu âm đang làm vẫn được bảo vệ khi chuyển tab.

Tác vụ xử lý hoàn tất tự tải OCR mới khi trình biên tập sạch. Nếu đang sửa, bản nháp được giữ; người dùng chủ động tải lại sau khi giữ nội dung cần thiết. Các kiểm thử dùng API giả lập; cần backend OCR tương thích để nhận dạng và lưu dữ liệu thật.
