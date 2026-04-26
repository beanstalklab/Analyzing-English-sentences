#!/bin/bash

echo "====================================="
echo "Khởi động English Sentence Analyzer"
echo "====================================="

echo "Cài đặt dependencies..."
(cd backend && uv sync --quiet)
(cd frontend && npm install --silent)

echo "1. Đang khởi chạy Backend (FastAPI)..."
(cd backend && uv run python -m main) &
BACKEND_PID=$!

echo "2. Đang khởi chạy Frontend (React/Vite)..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

# Bắt tín hiệu Ctrl+C để tắt luôn cả 2 tiến trình
trap "echo -e '\nĐang tắt hệ thống...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM EXIT

echo "====================================="
echo "Hệ thống đang chạy!"
echo "Backend API: http://127.0.0.1:8000/docs"
echo "Frontend UI: http://localhost:5173"
echo "(Bấm Ctrl+C để thoát)"
echo "====================================="

# Chờ các tiến trình chạy
wait
