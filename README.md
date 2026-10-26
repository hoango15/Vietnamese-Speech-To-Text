<div align="center">

# 🎙️ Speech Processing System

**Hệ thống chuyển đổi giọng nói tiếng Việt thành văn bản, tạo phụ đề và biên bản cuộc họp tự động**

*Vietnamese Speech-to-Text, Automatic Subtitle and Meeting Minutes Generation System*

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)
![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C?logo=pytorch&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Status](https://img.shields.io/badge/Status-In%20Development-orange)

</div>

---

## 📑 Mục lục

1. [Giới thiệu](#-giới-thiệu)
2. [Bài toán và động lực](#-bài-toán-và-động-lực)
3. [Mục tiêu](#-mục-tiêu)
4. [Chức năng chính](#-chức-năng-chính)
5. [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
6. [Quy trình xử lý](#-quy-trình-xử-lý)
7. [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
8. [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
9. [Cài đặt và chạy hệ thống](#-cài-đặt-và-chạy-hệ-thống)
10. [Tài liệu API](#-tài-liệu-api)
11. [Thiết kế cơ sở dữ liệu](#-thiết-kế-cơ-sở-dữ-liệu)
12. [Đánh giá hệ thống](#-đánh-giá-hệ-thống)
13. [Kết quả thực nghiệm](#-kết-quả-thực-nghiệm)
14. [Giao diện](#-giao-diện)
15. [Lộ trình phát triển](#-lộ-trình-phát-triển)
16. [Hạn chế và hướng mở rộng](#-hạn-chế-và-hướng-mở-rộng)
17. [Thành viên thực hiện](#-thành-viên-thực-hiện)
18. [Tài liệu tham khảo](#-tài-liệu-tham-khảo)
19. [Giấy phép](#-giấy-phép)

---

## 📌 Giới thiệu

**Speech Processing System** là hệ thống ứng dụng trí tuệ nhân tạo nhằm tự động hóa việc chuyển đổi, phân tích và tổng hợp nội dung từ dữ liệu âm thanh và video, **tập trung vào tiếng Việt**.

Người dùng chỉ cần tải lên một tệp ghi âm hoặc video (cuộc họp, bài giảng, phỏng vấn, podcast...), hệ thống sẽ tự động trả về:

- 📝 **Transcript** có mốc thời gian.
- 👥 **Phân tách người nói** (Speaker Diarization).
- 🎬 **Phụ đề** (`.srt`, `.vtt`).
- 📋 **Bản tóm tắt** nội dung.
- 🗂️ **Biên bản cuộc họp** gồm quyết định, công việc, người phụ trách, thời hạn.

```text
Audio / Video
      ↓
Audio Processing
      ↓
Speech-to-Text
      ↓
Transcript
      ↓
Content Processing
      ↓
Subtitle / Summary / Meeting Minutes
```

Dự án kết hợp các lĩnh vực **Speech Processing**, **Natural Language Processing (NLP)**, **Backend API** và **Web Application**.

---

## 💡 Bài toán và động lực

| Vấn đề thực tế | Giải pháp của hệ thống |
|---|---|
| Gỡ băng thủ công một cuộc họp 1 giờ mất nhiều giờ làm việc | Tự động chuyển giọng nói thành văn bản trong thời gian ngắn |
| Biên bản họp dễ thiếu sót, thiếu nhất quán | Tự động trích xuất quyết định, công việc, người phụ trách, thời hạn |
| Làm phụ đề video tốn thời gian căn chỉnh | Tự động tạo phụ đề `.srt` / `.vtt` có timestamp |
| Nhiều công cụ nước ngoài hỗ trợ tiếng Việt chưa tốt (thanh điệu, giọng vùng miền) | Sử dụng và so sánh các mô hình tối ưu cho tiếng Việt như PhoWhisper |
| Dữ liệu cuộc họp nội bộ nhạy cảm | Hỗ trợ triển khai on-premise bằng Docker, không bắt buộc gửi dữ liệu ra ngoài |

---

## 🎯 Mục tiêu

- Chuyển đổi giọng nói thành văn bản với độ chính xác cao.
- Hỗ trợ xử lý nội dung **tiếng Việt** (thanh điệu, giọng vùng miền, từ vay mượn).
- Tạo transcript kèm thời gian bắt đầu/kết thúc cho từng đoạn nói.
- Tự động tạo phụ đề từ transcript.
- Nhận diện và phân tách người nói.
- Tóm tắt nội dung từ transcript.
- Tự động tạo biên bản cuộc họp có cấu trúc.
- Xuất kết quả dưới nhiều định dạng.
- Đánh giá định lượng độ chính xác bằng WER, CER và so sánh nhiều mô hình.
- Xây dựng giao diện web thân thiện, dễ sử dụng.

---

## 🚀 Chức năng chính

### 1. Speech-to-Text
Tải lên tệp âm thanh hoặc video, hệ thống chuyển đổi giọng nói thành văn bản.

**Định dạng đầu vào hỗ trợ:** `mp3`, `wav`, `m4a`, `flac`, `mp4`, `mkv`, `webm`.

### 2. Timestamp
Mỗi đoạn transcript được gắn thời gian bắt đầu và kết thúc:

```text
00:00:12 → 00:00:16
Hôm nay chúng ta sẽ báo cáo tiến độ dự án.

00:00:16 → 00:00:21
Phần backend hiện tại đã hoàn thành.
```

### 3. Speaker Diarization
Phân biệt các người nói khác nhau trong cùng một đoạn hội thoại:

```text
Speaker 1:
Hôm nay chúng ta sẽ bắt đầu cuộc họp.

Speaker 2:
Em xin báo cáo tiến độ của phần backend.

Speaker 1:
Còn phần database hiện tại như thế nào?
```

Người dùng có thể **đổi tên người nói** (ví dụ `Speaker 1` → `Anh Minh`) trên giao diện.

### 4. Automatic Subtitle
Tạo phụ đề tự động từ transcript và timestamp, hỗ trợ `.srt` và `.vtt`.

```srt
1
00:00:12,000 --> 00:00:16,000
Hôm nay chúng ta sẽ báo cáo tiến độ dự án.

2
00:00:16,000 --> 00:00:21,000
Phần backend hiện tại đã hoàn thành.
```

### 5. Text Summarization
Tóm tắt transcript thành các ý chính, hỗ trợ cả transcript dài (chia đoạn → tóm tắt từng đoạn → tổng hợp).

### 6. Meeting Minutes
Trích xuất tự động:

- Nội dung chính
- Các quyết định
- Công việc cần thực hiện (action items)
- Người phụ trách
- Thời hạn
- Vấn đề tồn đọng
- Kết luận cuộc họp

### 7. Chỉnh sửa và Export
Người dùng có thể **chỉnh sửa transcript trực tiếp** trên web trước khi xuất.

| Nội dung | Định dạng hỗ trợ |
|---|---|
| Transcript | `TXT`, `JSON`, `DOCX`, `PDF` |
| Subtitle | `SRT`, `VTT` |
| Summary | `TXT`, `DOCX`, `PDF` |
| Meeting Minutes | `DOCX`, `PDF`, `JSON` |

---

## 🏗️ Kiến trúc hệ thống

```text
                    ┌───────────────────┐
                    │    Web Client     │
                    │      ReactJS      │
                    └─────────┬─────────┘
                              │  REST API (HTTPS)
                              ▼
                    ┌───────────────────┐
                    │    Backend API    │
                    │      FastAPI      │
                    └─────────┬─────────┘
                              │  Task Queue
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
      Audio Processing    Speech-to-Text   Speaker
          FFmpeg           Whisper Model   Diarization
          + VAD            / PhoWhisper    (pyannote)
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                    ┌───────────────────┐
                    │    Transcript     │
                    └─────────┬─────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
            Subtitle       Summary       Minutes
                │             │             │
                └─────────────┼─────────────┘
                              ▼
                    ┌───────────────────┐
                    │     Database      │
                    │    PostgreSQL     │
                    └───────────────────┘
```

**Nguyên tắc thiết kế**

- **Tách biệt thành phần:** frontend, backend và module AI độc lập, giao tiếp qua API.
- **Xử lý bất đồng bộ:** tác vụ nặng (ASR, diarization) chạy nền qua hàng đợi, người dùng theo dõi tiến trình theo thời gian thực.
- **Dễ thay thế mô hình:** module ASR dùng interface chung, có thể đổi giữa Whisper, PhoWhisper, faster-whisper mà không sửa backend.
- **Dễ triển khai:** toàn bộ hệ thống đóng gói bằng Docker Compose.

---

## 🔄 Quy trình xử lý

```text
1. Upload Audio / Video
          ↓
2. Extract Audio (FFmpeg, 16 kHz, mono)
          ↓
3. Pre-processing (chuẩn hóa âm lượng, giảm nhiễu)
          ↓
4. Voice Activity Detection (loại bỏ khoảng lặng)
          ↓
5. Speech-to-Text
          ↓
6. Timestamp Alignment
          ↓
7. Speaker Diarization
          ↓
8. Merge → Transcript (ASR + Speaker)
          ↓
9. Content Processing (chuẩn hóa văn bản, chia đoạn)
          ↓
10. Subtitle / Summary / Minutes
          ↓
11. Export Result
```

---

## 🧠 Công nghệ sử dụng

| Lớp | Công nghệ | Vai trò |
|---|---|---|
| **AI / Speech** | Python, PyTorch, HuggingFace Transformers | Nền tảng huấn luyện và suy luận |
| | Whisper, faster-whisper, PhoWhisper | Nhận dạng tiếng nói |
| | pyannote.audio | Speaker Diarization |
| | Silero VAD / WebRTC VAD | Phát hiện hoạt động giọng nói |
| **NLP** | ViT5 / BARTpho / LLM | Tóm tắt, trích xuất biên bản |
| **Audio** | FFmpeg, librosa | Trích xuất và tiền xử lý âm thanh |
| **Backend** | FastAPI, REST API, Pydantic | Dịch vụ API |
| | Celery + Redis *(hoặc BackgroundTasks)* | Hàng đợi xử lý nền |
| **Frontend** | ReactJS, HTML, CSS, JavaScript | Giao diện người dùng |
| **Database** | PostgreSQL | Lưu người dùng, tác vụ, transcript |
| **Evaluation** | jiwer | Tính WER / CER |
| **Deployment** | Docker, Docker Compose, Linux, Cloud Server | Đóng gói và triển khai |

---

## 📁 Cấu trúc thư mục

```text
speech-processing-system/
│
├── frontend/                  # Giao diện ReactJS
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/          # Gọi API
│   └── package.json
│
├── backend/                   # FastAPI
│   ├── app/
│   │   ├── api/               # Các endpoint
│   │   ├── core/              # Cấu hình, bảo mật
│   │   ├── models/            # ORM models
│   │   ├── schemas/           # Pydantic schemas
│   │   ├── services/          # Nghiệp vụ
│   │   └── main.py
│   └── requirements.txt
│
├── ai/
│   ├── speech-to-text/        # Whisper / PhoWhisper
│   ├── speaker-diarization/   # pyannote
│   ├── subtitle/              # Sinh SRT / VTT
│   └── summarization/         # Tóm tắt, biên bản họp
│
├── evaluation/                # Script đánh giá WER / CER
│   ├── datasets/
│   ├── run_eval.py
│   └── results/
│
├── database/                  # Schema, migration
│
├── docs/                      # Báo cáo, sơ đồ, ảnh minh họa
│
├── tests/                     # Unit test, integration test
│
├── docker/                    # Dockerfile từng dịch vụ
│
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

## ⚙️ Cài đặt và chạy hệ thống

### Yêu cầu

- Python **3.10+**
- Node.js **18+**
- FFmpeg
- PostgreSQL 14+
- Docker và Docker Compose *(khuyến nghị)*
- GPU NVIDIA + CUDA *(không bắt buộc, giúp tăng tốc đáng kể)*

### Cách 1: Chạy bằng Docker (khuyến nghị)

```bash
# 1. Clone dự án
git clone https://github.com/<username>/speech-processing-system.git
cd speech-processing-system

# 2. Tạo file môi trường
cp .env.example .env

# 3. Khởi chạy toàn bộ hệ thống
docker compose up --build
```

Sau khi chạy:

| Dịch vụ | Địa chỉ |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |

### Cách 2: Chạy thủ công

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

### Biến môi trường (`.env`)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/speech_db

# Model
ASR_MODEL=vinai/PhoWhisper-medium      # hoặc openai/whisper-large-v3
ASR_DEVICE=cuda                         # cuda | cpu
HF_TOKEN=<your_huggingface_token>       # cần cho pyannote

# Upload
MAX_UPLOAD_SIZE_MB=500
```

> ⚠️ Mô hình `pyannote/speaker-diarization` yêu cầu chấp nhận điều khoản sử dụng trên HuggingFace và cung cấp token.

---

## 🔌 Tài liệu API

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/jobs` | Tải lên tệp và tạo tác vụ xử lý |
| `GET` | `/api/v1/jobs/{job_id}` | Xem trạng thái tác vụ |
| `GET` | `/api/v1/jobs/{job_id}/transcript` | Lấy transcript (kèm timestamp, speaker) |
| `PUT` | `/api/v1/jobs/{job_id}/transcript` | Cập nhật transcript sau khi chỉnh sửa |
| `GET` | `/api/v1/jobs/{job_id}/subtitle?format=srt` | Lấy phụ đề (`srt` / `vtt`) |
| `POST` | `/api/v1/jobs/{job_id}/summary` | Tạo bản tóm tắt |
| `POST` | `/api/v1/jobs/{job_id}/minutes` | Tạo biên bản cuộc họp |
| `GET` | `/api/v1/jobs/{job_id}/export?type=docx` | Xuất kết quả |

**Ví dụ phản hồi transcript**

```json
{
  "job_id": "a1b2c3",
  "language": "vi",
  "duration": 1824.5,
  "segments": [
    {
      "start": 12.0,
      "end": 16.0,
      "speaker": "Speaker 1",
      "text": "Hôm nay chúng ta sẽ báo cáo tiến độ dự án."
    }
  ]
}
```

Tài liệu tương tác đầy đủ có tại `/docs` (Swagger UI) khi chạy backend.

---

## 🗄️ Thiết kế cơ sở dữ liệu

```text
users               jobs                    segments
─────               ────                    ────────
id (PK)             id (PK)                 id (PK)
email               user_id (FK)            job_id (FK)
password_hash       filename                start_time
created_at          duration                end_time
                    status                  speaker
                    model_used              text
                    created_at              confidence

results
───────
id (PK)
job_id (FK)
type            -- summary | minutes | subtitle
content (JSON)
created_at
```

---

## 📊 Đánh giá hệ thống

### Tiêu chí

| Tiêu chí | Ý nghĩa |
|---|---|
| **WER** (Word Error Rate) | Tỷ lệ lỗi theo từ: `(S + D + I) / N` |
| **CER** (Character Error Rate) | Tỷ lệ lỗi theo ký tự, phù hợp để đánh giá lỗi dấu/thanh điệu |
| **RTF** (Real-Time Factor) | Thời gian xử lý / thời lượng âm thanh |
| **DER** (Diarization Error Rate) | Độ chính xác phân tách người nói |
| **Khả năng chịu nhiễu** | Kiểm thử trên dữ liệu có nhiễu nền |
| **Giọng vùng miền** | Kiểm thử giọng Bắc, Trung, Nam |
| **ROUGE / đánh giá thủ công** | Chất lượng tóm tắt và biên bản |

### Phương pháp

- So sánh nhiều mô hình: Whisper (base / small / medium / large-v3), faster-whisper, **PhoWhisper**.
- Đánh giá trên các bộ dữ liệu tiếng Việt công khai (VIVOS, Common Voice tiếng Việt, FPT Open Speech Dataset...) và **bộ dữ liệu tự thu thập** (cuộc họp, bài giảng).
- Chạy đánh giá bằng script:

```bash
python evaluation/run_eval.py --model vinai/PhoWhisper-medium --dataset evaluation/datasets/vivos
```

---

## 📈 Kết quả thực nghiệm

> 🚧 Bảng dưới đây sẽ được cập nhật sau khi hoàn thành thực nghiệm.

**So sánh mô hình Speech-to-Text**

| Mô hình | WER (%) | CER (%) | RTF | Ghi chú |
|---|---|---|---|---|
| Whisper base | – | – | – | |
| Whisper small | – | – | – | |
| Whisper large-v3 | – | – | – | |
| faster-whisper | – | – | – | |
| PhoWhisper-medium | – | – | – | |

**Ảnh hưởng của nhiễu và giọng vùng miền**

| Điều kiện | WER (%) |
|---|---|
| Môi trường yên tĩnh | – |
| Có nhiễu nền | – |
| Giọng miền Bắc | – |
| Giọng miền Trung | – |
| Giọng miền Nam | – |

**Speaker Diarization**

| Số người nói | DER (%) |
|---|---|
| 2 người | – |
| 3–4 người | – |
| 5+ người | – |

---

## 🖼️ Giao diện

> 🚧 Ảnh chụp màn hình sẽ được bổ sung.

| Trang tải lên | Trang kết quả | Chỉnh sửa transcript |
|---|---|---|
| `docs/images/upload.png` | `docs/images/result.png` | `docs/images/editor.png` |

**Video demo:** *(thêm liên kết)*

---

## 🗺️ Lộ trình phát triển

- [x] Xác định phạm vi, thiết kế kiến trúc
- [ ] **Giai đoạn 1 – Nền tảng:** FFmpeg, VAD, Speech-to-Text cơ bản, API upload
- [ ] **Giai đoạn 2 – Transcript:** timestamp, speaker diarization, lưu cơ sở dữ liệu
- [ ] **Giai đoạn 3 – Nội dung:** sinh phụ đề, tóm tắt, biên bản cuộc họp
- [ ] **Giai đoạn 4 – Giao diện:** web upload, xem/chỉnh sửa transcript, export
- [ ] **Giai đoạn 5 – Đánh giá:** WER/CER/DER, so sánh mô hình, tối ưu
- [ ] **Giai đoạn 6 – Triển khai:** Docker, kiểm thử, viết báo cáo, demo

---

## ⚠️ Hạn chế và hướng mở rộng

**Hạn chế hiện tại**

- Độ chính xác giảm khi âm thanh nhiễu, nhiều người nói chồng lấn.
- Mô hình lớn yêu cầu GPU để đạt tốc độ chấp nhận được.
- Chất lượng tóm tắt/biên bản phụ thuộc vào chất lượng transcript.

**Hướng mở rộng**

- Nhận dạng tiếng nói thời gian thực (streaming).
- Fine-tune mô hình trên dữ liệu tiếng Việt chuyên ngành (y tế, pháp lý, giáo dục).
- Hỗ trợ đa ngôn ngữ và dịch phụ đề.
- Tích hợp Zoom / Google Meet / Microsoft Teams.
- Tìm kiếm ngữ nghĩa trong kho transcript.
- Hỗ trợ ứng dụng di động.

---

## 👨‍💻 Thành viên thực hiện

| Họ và tên | MSSV | Vai trò |
|---|---|---|
| … | … | … |

**Giảng viên hướng dẫn:** …
**Học phần:** …
**Năm học:** …

---

## 📚 Tài liệu tham khảo

1. Radford et al., *Robust Speech Recognition via Large-Scale Weak Supervision* (Whisper), OpenAI, 2022.
2. Le et al., *PhoWhisper: Automatic Speech Recognition for Vietnamese*, VinAI.
3. Bredin et al., *pyannote.audio: neural building blocks for speaker diarization*, ICASSP 2020.
4. Luong & Vu, *A non-expert Kaldi recipe for Vietnamese Speech Recognition System* (VIVOS).
5. Tài liệu FastAPI, FFmpeg, HuggingFace Transformers.

---

## 📄 Giấy phép

Dự án được thực hiện với mục đích **nghiên cứu và học tập**. Phát hành theo giấy phép [MIT](LICENSE).

> **Lưu ý:** các mô hình và bộ dữ liệu bên thứ ba (Whisper, PhoWhisper, pyannote, VIVOS...) tuân theo giấy phép riêng của từng dự án.

---

<div align="center">

**Speech Processing System** — *Vietnamese Speech-to-Text, Automatic Subtitle and Content Processing System*

⭐ Nếu thấy dự án hữu ích, hãy để lại một star!

</div>
