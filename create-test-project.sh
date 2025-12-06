#!/bin/bash

# Скрипт для создания тестового проекта через REST API
# Использование: ./create-test-project.sh <user_id> <auth_token>

USER_ID=${1:-9}
AUTH_TOKEN=${2}

if [ -z "$AUTH_TOKEN" ]; then
  echo "❌ Ошибка: необходим токен авторизации"
  echo ""
  echo "Использование: $0 <user_id> <auth_token>"
  echo ""
  echo "Получить токен можно из localStorage в браузере:"
  echo "  localStorage.getItem('token')"
  exit 1
fi

echo "📦 Создаём тестовый проект..."
echo "👤 User ID: $USER_ID"
echo ""

# Создаём временный ZIP файл с тестовым проектом
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Создаём простой Python файл
cat > main.py << 'EOF'
"""
Простой тестовый проект для анализа
"""
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello World"}

@app.get("/users/{user_id}")
def read_user(user_id: int):
    return {"user_id": user_id}
EOF

# Создаём requirements.txt
cat > requirements.txt << 'EOF'
fastapi==0.104.1
uvicorn==0.24.0
EOF

# Упаковываем в ZIP
zip -q test_project.zip main.py requirements.txt

echo "📤 Отправляем проект на backend..."

# Отправляем на backend
curl -X POST "http://78.153.139.47:8000/v1/project" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "name=Test gRPC Project" \
  -F "description=Тестовый проект для проверки gRPC stream" \
  -F "user_id=$USER_ID" \
  -F "file=@test_project.zip" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  | python3 -m json.tool

# Удаляем временные файлы
cd - > /dev/null
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Готово!"
echo ""
echo "Теперь найдите project_id в ответе выше и используйте его:"
echo "  diagnoseGrpc($USER_ID, <project_id>)"
