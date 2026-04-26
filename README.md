# 🗣️ English Sentence Analyzer - Công cụ phân tích câu AI
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Gemini AI](https://img.shields.io/badge/AI-AI--Gemini-4285F4.svg?style=flat&logo=google-gemini&logoColor=white)](https://deepmind.google/technologies/gemini/)

## 📖 Mục lục (Table of Contents)
- [✨ Tính năng nổi bật](#-tính-năng-nổi-bật)
- [🚀 Hướng dẫn nhanh](#-hướng-dẫn-nhanh)
- [🛠️ Công nghệ sử dụng](#-công-nghệ-sử-dụng)
- [📄 Giấy phép](#-giấy-phép)
- [🌏 English Version: AI-Powered English Analysis](#-english-version-ai-powered-english-analysis)

**English Sentence Analyzer** là một ứng dụng hỗ trợ học tiếng Anh hiện đại, sử dụng sức mạnh của AI (AI-Gemini) để phân tích ngữ pháp và phát âm thực tế. Dự án được thiết kế tối ưu cho người Việt Nam muốn cải thiện kỹ năng nói và hiểu cấu trúc câu một cách tự nhiên như người bản xứ.

---

## ✨ Tính năng nổi bật

- **🔍 Phân tích ngữ pháp chuyên sâu (POS):** Nhận diện từ loại theo cụm (Phrases) thay vì từng từ đơn lẻ, giúp hiểu rõ cấu trúc câu.
- **🗣️ Phân tích phát âm thực tế (Connected Speech):** Chỉ ra các hiện tượng nối âm, nuốt âm, lướt âm và biến âm (Flap T) thường gặp trong giao tiếp bản xứ.
- **🇻🇳 Phiên âm mô phỏng tiếng Việt:** Cung cấp cách đọc "mô phỏng" bằng tiếng Việt giúp người học dễ bắt chước âm thanh chính xác hơn.
- **💡 Tooltip thông minh:** Di chuột vào các từ loại để xem giải thích khái niệm và vai trò ngữ pháp của cụm từ đó trong ngữ cảnh.
- **⚡ Phản hồi siêu tốc:** Tích hợp AI-Gemini với cấu hình "Thinking" giúp phân tích sâu và trả về kết quả ngay lập tức.

---

## 🚀 Hướng dẫn nhanh

Dự án đã được tối ưu hóa với script khởi chạy tự động cài đặt mọi phụ thuộc.

### 1. Chuẩn bị môi trường
Yêu cầu: [Python 3.13+](https://www.python.org/) và [Node.js](https://nodejs.org/).

### 2. Thiết lập API Key
1. Copy file mẫu: `cp backend/.env.example backend/.env`
2. Mở file `backend/.env` và dán mã **Gemini API Key** của bạn vào.

### 3. Khởi chạy
```bash
chmod +x run.sh
./run.sh
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🛠️ Công nghệ sử dụng

- **Backend:** FastAPI, Pydantic v2, Google GenAI SDK.
- **Frontend:** React, TypeScript, Vite, TailwindCSS v4, Lucide React.
- **AI Model:** `gemini`.

---

## 📄 Giấy phép

Dự án này được phát hành dưới giấy phép **MIT License**. Xem chi tiết tại file [LICENSE](LICENSE).

<br/>

---

# 🌏 English Version: AI-Powered English Analysis

**English Sentence Analyzer** is a modern language learning application that leverages the power of AI (AI-Gemini) to provide deep insights into English grammar and real-world pronunciation. It is specifically optimized for Vietnamese learners who want to master natural, native-like speech.

---

## ✨ Key Features

- **🔍 Advanced POS Analysis:** Identifies Parts of Speech by phrases rather than single words, helping you understand complex sentence structures (Noun Phrase, Phrasal Verb, Infinitive Phrase, etc.).
- **🗣️ Connected Speech Mastery:** Highlights phonetic phenomena such as linking, elision, and reduction (Flap T) used by native speakers.
- **🇻🇳 Vietnamese Phonetic Simulation:** Provides intuitive pronunciation guides using Vietnamese phonetics, making it easier to mimic sounds accurately.
- **💡 Interactive Tooltips:** Hover over any POS tag to see a detailed explanation of the concept and its grammatical role in the current sentence.
- **⚡ Ultra-fast Feedback:** Powered by the latest AI-Gemini model with "Thinking" configuration for deep, near-instant analysis.

---

## 🚀 Getting Started

The project includes an automated startup script that handles all dependencies for you.

### 1. Prerequisites
- **Python 3.13+**
- **Node.js**

### 2. Environment Configuration
1. Copy the example environment file: `cp backend/.env.example backend/.env`
2. Open `backend/.env` and insert your **Gemini API Key**.

### 3. Run the Application
Execute the following command to install dependencies and start both Backend and Frontend servers:
```bash
chmod +x run.sh
./run.sh
```

- **Frontend UI:** [http://localhost:5173](http://localhost:5173)
- **Backend API Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🛠️ Tech Stack

- **Backend:** [FastAPI](https://fastapi.tiangolo.com/), [Pydantic v2](https://docs.pydantic.dev/), [Google GenAI SDK](https://github.com/google-gemini/generative-ai-python).
- **Frontend:** [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [TailwindCSS v4](https://tailwindcss.com/).
- **AI Model:** `gemini`.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.