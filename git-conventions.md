# Quy ước Git – Nhóm C6 HKDN

> Trạng thái: Đề xuất để leader và các thành viên thống nhất trước khi áp dụng.
> Phạm vi: Branch, commit, quy trình đưa thay đổi vào nhánh chung và `.gitignore`.
> Giả định: Nhóm sử dụng GitHub, nhánh chung mang tên `main`. Nếu repository đang dùng tên khác, thay `main` bằng tên tương ứng.

## 1. Nguyên tắc chung

- `main` chứa phiên bản đã được kiểm tra và duyệt.
- Mỗi nhiệm vụ thực hiện trên một nhánh riêng, tạo từ `main` mới nhất.
- Không commit hoặc push trực tiếp vào `main`.
- Đưa thay đổi vào `main` bằng Pull Request (PR), có ít nhất một thành viên khác kiểm tra và đồng ý.
- Không force push lên `main` hoặc nhánh đang có người khác cùng làm.
- Không đưa mật khẩu, API key, dữ liệu nội bộ hoặc file lớn lên repository khi chưa được thống nhất.
- Quy ước áp dụng cho cả code, thiết kế giao diện và báo cáo.

## 2. Quy ước branch

### 2.1. Cách đặt tên

```text
<loai-cong-viec>/<mo-ta-ngan>
```

Viết chữ thường, không dấu, dùng dấu `-` giữa các từ. Mỗi nhánh phục vụ một nhiệm vụ; không dùng một nhánh cá nhân cho toàn bộ học kỳ.

| Nhánh | Mục đích | Ví dụ |
| --- | --- | --- |
| `main` | Phiên bản chung đã được duyệt | `main` |
| `feat/` | Phát triển chức năng mới | `feat/upload-file` |
| `fix/` | Sửa lỗi | `fix/subtitle-timing` |
| `docs/` | Cập nhật tài liệu và báo cáo | `docs/report-chapter-1` |
| `design/` | Thiết kế giao diện, wireframe | `design/result-wireframe` |
| `chore/` | Cấu hình và bảo trì dự án | `chore/setup-gitignore` |

### 2.2. Ví dụ cho nhiệm vụ chuẩn bị dự án

```text
chore/setup-repository
design/main-wireframes
docs/report-template
```

## 3. Quy ước commit

Mỗi commit thể hiện một thay đổi có mục đích rõ ràng. Không gộp các việc không liên quan vào cùng một commit.

### 3.1. Cấu trúc

```text
<type>: <mô tả ngắn>
```

| Type | Mục đích | Ví dụ |
| --- | --- | --- |
| `feat` | Thêm chức năng | `feat: thêm chức năng tải file âm thanh` |
| `fix` | Sửa lỗi | `fix: sửa thời gian hiển thị phụ đề` |
| `docs` | Sửa tài liệu, báo cáo | `docs: bổ sung giới thiệu doanh nghiệp` |
| `design` | Thêm hoặc sửa thiết kế | `design: thêm wireframe màn hình Result` |
| `refactor` | Sắp xếp lại code, giữ nguyên chức năng | `refactor: tách phần xử lý file âm thanh` |
| `test` | Thêm hoặc sửa kiểm thử | `test: bổ sung kiểm tra định dạng file` |
| `chore` | Sửa cấu hình, công cụ | `chore: thêm cấu hình gitignore` |

### 3.2. Yêu cầu

- Mô tả bằng tiếng Việt có dấu; tên type giữ nguyên như bảng.
- Nêu cụ thể đã thêm, sửa hoặc bỏ phần nào.
- Tránh mô tả chung chung như `update`, `done`, `sửa chút`, `final`.
- Kiểm tra danh sách file và nội dung thay đổi trước khi commit.
- Chỉ thêm các file thuộc nhiệm vụ đang làm.

Ví dụ:

```bash
git status
git diff
git add docs/git-conventions.md
git diff --staged
git commit -m "docs: bổ sung quy ước Git cho nhóm"
```

## 4. Quy trình đưa thay đổi vào nhánh chung

Pull Request (PR) là đề nghị đưa thay đổi từ nhánh làm việc vào nhánh chung để người khác xem và duyệt trước khi gộp.

### Bước 1. Cập nhật main và tạo nhánh

Trước khi chuyển nhánh, cần commit hoặc cất tạm công việc chưa lưu. Các lệnh dưới đây giả định máy đã clone repository và có remote tên `origin`.

```bash
git switch main
git pull --ff-only origin main
git switch -c design/main-wireframes
```

Nếu `git pull --ff-only` báo lỗi, kiểm tra lịch sử hoặc nhờ người phụ trách Git hỗ trợ; không tự dùng lệnh reset để ghi đè công việc.

### Bước 2. Thực hiện nhiệm vụ và commit

Ví dụ khi đã tạo wireframe trong `docs/wireframes/`:

```bash
git status
git diff
git add docs/wireframes/
git diff --staged
git commit -m "design: thêm wireframe các màn hình chính"
```

### Bước 3. Push nhánh lên GitHub

```bash
git push -u origin design/main-wireframes
```

Thay tên nhánh trong ví dụ bằng nhánh thực tế của mình.

### Bước 4. Tạo Pull Request

Trên GitHub, tạo PR với:

- Base: `main`.
- Compare: nhánh vừa push.
- Tiêu đề: mô tả ngắn nhiệm vụ đã hoàn thành.
- Người review: thành viên liên quan hoặc leader.

Mẫu mô tả PR:

```markdown
## Mục đích
- Thay đổi này giải quyết nhiệm vụ gì?

## Nội dung thay đổi
- Đã thêm hoặc sửa những gì?

## Cách kiểm tra
- Mở file nào hoặc thực hiện thao tác nào để kiểm tra?
- Đính kèm ảnh nếu thay đổi giao diện.

## Điểm chưa hoàn thành
- Ghi rõ nội dung chờ xác nhận; ghi “Không có” nếu đã hoàn tất.
```

### Bước 5. Review và merge

- Ít nhất một thành viên khác kiểm tra và đồng ý.
- Người tạo PR sửa các vấn đề được góp ý.
- Thay đổi đáp ứng tiêu chí nghiệm thu của nhiệm vụ.
- Không còn xung đột; các kiểm tra tự động liên quan phải đạt nếu đã được thiết lập.
- Leader hoặc người được phân công chọn **Squash and merge**, gộp PR thành một commit trên `main`.
- Khi squash, đặt tên commit theo quy ước tại mục 3.
- Sau khi merge, xóa nhánh làm việc trên GitHub.

Người quản trị nên cấu hình bảo vệ `main` để yêu cầu PR và review nếu repository hỗ trợ. Chỉ viết quy ước trong tài liệu không tự ngăn được việc push trực tiếp.

### Bước 6. Cập nhật máy cá nhân

Sau khi công việc đã được merge và máy không còn thay đổi chưa lưu:

```bash
git switch main
git pull --ff-only origin main
```

Tạo nhánh mới từ `main` đã cập nhật cho nhiệm vụ tiếp theo.

## 5. Xử lý xung đột

Xung đột có thể xuất hiện khi hai người sửa cùng một phần của file. Sau khi đã commit công việc hiện tại, thực hiện trên nhánh làm việc:

```bash
git fetch origin
git merge origin/main
```

Nếu Git báo conflict:

1. Dùng `git status` để xác định file bị xung đột.
2. Trao đổi với người sửa nội dung liên quan.
3. Kết hợp nội dung đúng, xóa các dấu `<<<<<<<`, `=======`, `>>>>>>>`.
4. Kiểm tra lại code hoặc tài liệu.
5. Thêm các file đã giải quyết và hoàn tất merge:

```bash
git add duong/dan/file-da-sua
git commit -m "chore: giải quyết xung đột với main"
git push
```

Thay đường dẫn ví dụ bằng file thực tế. Không chọn toàn bộ bản của mình hoặc của người khác khi chưa kiểm tra. Nếu chưa biết xử lý, giữ nguyên trạng thái và nhờ thành viên hỗ trợ.

## 6. Quy ước .gitignore

`.gitignore` đặt tại thư mục gốc repository và được commit như các file cấu hình khác. Nội dung bên dưới là mẫu ban đầu; nhóm điều chỉnh khi chốt công nghệ và cấu trúc thư mục.

**Lưu ý:** Khối cấu hình trong tài liệu chỉ để tham khảo. Cần tạo file riêng tên `.gitignore` tại thư mục gốc và chép nội dung vào đó thì Git mới áp dụng.

```gitignore
# Cau hinh rieng va thong tin bi mat
.env
.env.*
!.env.example
!.env.*.example

# He dieu hanh va file tam
.DS_Store
Thumbs.db
Desktop.ini
*.tmp
*.swp
*~

# Python - giu neu du an su dung Python
__pycache__/
*.py[cod]
.venv/
venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/
*.egg-info/

# Frontend - giu neu du an su dung Node.js
node_modules/
.next/
/frontend/dist/
/frontend/build/

# Du lieu va ket qua sinh ra
# Luu file lon va du lieu rieng tai cac thu muc nay
/data/raw/
/data/private/
/uploads/
/outputs/
/models/
/logs/
*.log

# LaTeX / Overleaf - file sinh khi bien dich
*.aux
*.bbl
*.bcf
*.blg
*.fdb_latexmk
*.fls
*.lof
*.lot
*.out
*.run.xml
*.synctex.gz
*.toc
*.xdv
```

### Các quy định đi kèm

- `.env.example` chỉ chứa tên biến và giá trị mẫu, không có khóa hoặc mật khẩu thật.
- Không mặc định đưa file ghi âm/video lớn, dữ liệu nội bộ hoặc mô hình tải về lên Git. Ghi cách lấy và chuẩn bị dữ liệu trong tài liệu.
- Nếu `/models/` dùng để chứa code hoặc thiết kế thay vì trọng số mô hình tải về, cần sửa quy tắc bỏ qua tương ứng.
- File mẫu nhỏ để kiểm thử chỉ đưa vào Git khi có quyền sử dụng và đã thống nhất vị trí lưu.
- Giữ mã nguồn, file cấu hình phụ thuộc và lockfile cần thiết trong Git.
- Với báo cáo, giữ `.tex`, `.bib`, hình minh họa và tài nguyên cần để biên dịch.
- Không bỏ qua toàn bộ `*.pdf` vì PDF có thể là tài liệu tham khảo hoặc sản phẩm bàn giao.
- Mẫu trên giả định `.bbl` là file sinh ra có thể tạo lại từ `.bib`; nếu quy trình nộp báo cáo yêu cầu `.bbl`, điều chỉnh quy tắc này.

### Nếu file đã được Git theo dõi

`.gitignore` không tự bỏ theo dõi file đã được commit. Ví dụ, để ngừng theo dõi `.env` nhưng giữ file trên máy:

```bash
git rm --cached .env
git commit -m "chore: ngừng theo dõi file môi trường riêng"
```

Thao tác này không xóa nội dung khỏi lịch sử. Nếu API key hoặc mật khẩu thật đã bị đẩy lên, cần thu hồi hoặc đổi khóa đó và báo người phụ trách để xử lý tiếp.

## 7. Phối hợp báo cáo Overleaf và Git

- Thống nhất Overleaf hay Git là nơi chỉnh sửa chính của báo cáo.
- Chỉ định người đồng bộ báo cáo để tránh ghi đè thay đổi.
- Nếu chọn Overleaf làm nơi chỉnh sửa chính: sau mỗi mốc thống nhất, xuất mã nguồn báo cáo, cập nhật thư mục `report/` trên nhánh `docs/...` và tạo PR.
- Không mặc định việc sửa trên Overleaf sẽ tự cập nhật GitHub.
- Mỗi người cập nhật phần được giao; trao đổi trước khi sửa phần người khác đang làm.

## 8. Checklist trước khi yêu cầu merge

- [ ] Đúng nhánh và đúng phạm vi nhiệm vụ.
- [ ] Tên nhánh, commit đúng quy ước.
- [ ] Đã kiểm tra danh sách file và nội dung thay đổi.
- [ ] Không có mật khẩu, API key hoặc dữ liệu nội bộ chưa được phép.
- [ ] Có hướng dẫn hoặc minh chứng kiểm tra phù hợp.
- [ ] PR nêu rõ phần hoàn thành và phần còn chờ xác nhận.
- [ ] Có ít nhất một thành viên khác đồng ý.
- [ ] Không còn xung đột với `main`.

## 9. Tài liệu tham khảo

- GitHub – Pull requests: https://docs.github.com/en/pull-requests
- GitHub – Merge and close pull requests: https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests
- GitHub – Merge conflicts: https://docs.github.com/en/pull-requests/reference/merge-conflicts
- Git – gitignore: https://git-scm.com/docs/gitignore
