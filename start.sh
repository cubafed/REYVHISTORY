#!/bin/bash
cd "$(dirname "$0")/project"
echo "Сервер запущен: http://localhost:8000"
echo "Афиша:  http://localhost:8000/afisha/index.html"
echo "Архив:  http://localhost:8000/afisha/archive.html"
echo "Шар:    http://localhost:8000/shar/index.html"
echo "Эфир:   http://localhost:8000/vintage/index.html"
echo ""
echo "Остановить: Ctrl+C"
python3 -m http.server 8000
