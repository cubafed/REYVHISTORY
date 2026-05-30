#!/bin/bash
cd "$(dirname "$0")/project"
echo "Сервер запущен: http://localhost:8000"
echo ""
echo "Главная (эфир):  http://localhost:8000/vintage/index.html"
echo "Залипай:         http://localhost:8000/zalipay/index.html"
echo "Афиша:           http://localhost:8000/afisha/index.html"
echo "Админка:         http://localhost:8000/afisha/admin.html"
echo "Архив:           http://localhost:8000/afisha/archive.html"
echo "Design canvas:   http://localhost:8000/canvas.html"
echo ""
echo "Остановить: Ctrl+C"
python3 -m http.server 8000
