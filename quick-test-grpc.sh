#!/bin/bash

# 🚀 БЫСТРЫЙ ТЕСТ gRPC - всё автоматически
# Регистрирует пользователя, создаёт проект, тестирует gRPC

set -e

API_URL="http://78.153.139.47:8000"
TIMESTAMP=$(date +%s)
EMAIL="grpc${TIMESTAMP}@test.com"
LOGIN="grpc_test_${TIMESTAMP}"
PASSWORD="test12345678"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 БЫСТРЫЙ ТЕСТ gRPC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Регистрация
echo "1️⃣  Регистрация пользователя..."
echo "   Email: $EMAIL"
echo "   Login: $LOGIN"

REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/v1/auth/registration" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"gRPC\",\"surname\":\"Tester\",\"login\":\"$LOGIN\"}")

USER_ID=$(echo "$REGISTER_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null || echo "")

if [ -z "$USER_ID" ]; then
  echo "❌ Ошибка регистрации:"
  echo "$REGISTER_RESPONSE" | python3 -m json.tool
  exit 1
fi

echo "   ✅ User ID: $USER_ID"
echo ""

# 2. Логин
echo "2️⃣  Получение токена..."

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"login\":\"$LOGIN\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('access_token', data.get('token', '')))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "❌ Ошибка получения токена:"
  echo "$LOGIN_RESPONSE" | python3 -m json.tool
  exit 1
fi

echo "   ✅ Token: ${TOKEN:0:50}..."
echo ""

# 3. Создание тестового проекта
echo "3️⃣  Создание тестового проекта..."

# Создаём временный ZIP
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

cat > main.py << 'PYEOF'
from fastapi import FastAPI
app = FastAPI()

@app.get("/")
def root():
    return {"message": "Hello"}

@app.get("/users/{user_id}")
def get_user(user_id: int):
    return {"user_id": user_id}
PYEOF

cat > requirements.txt << 'REQEOF'
fastapi==0.104.1
uvicorn==0.24.0
REQEOF

zip -q test_project.zip main.py requirements.txt

echo "   Отправка проекта на backend..."

PROJECT_RESPONSE=$(curl -s -X POST "$API_URL/v1/project" \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=gRPC Test Project ${TIMESTAMP}" \
  -F "description=Автоматический тест gRPC" \
  -F "user_id=$USER_ID" \
  -F "file=@test_project.zip")

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('project_id', json.load(sys.stdin).get('id', '')))" 2>/dev/null || echo "")

cd - > /dev/null
rm -rf "$TEMP_DIR"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Ошибка создания проекта:"
  echo "$PROJECT_RESPONSE" | python3 -m json.tool
  exit 1
fi

echo "   ✅ Project ID: $PROJECT_ID"
echo ""

# 4. Тест gRPC
echo "4️⃣  Тестирование gRPC endpoint..."
echo "   User ID: $USER_ID"
echo "   Project ID: $PROJECT_ID"
echo ""

# Кодируем Protobuf запрос (user_id=11, project_id=полученный)
# Формат: 0x08 <user_id_varint> 0x10 <project_id_varint>

function encode_varint() {
  local num=$1
  local result=""
  
  while [ $num -gt 127 ]; do
    local byte=$(( (num & 0x7f) | 0x80 ))
    result="$result\\x$(printf '%02x' $byte)"
    num=$(( num >> 7 ))
  done
  
  result="$result\\x$(printf '%02x' $num)"
  echo -ne "$result"
}

REQUEST_DATA=$(echo -ne "\x08"; encode_varint $USER_ID; echo -ne "\x10"; encode_varint $PROJECT_ID)

echo "   Отправка gRPC запроса..."
echo "   Payload (hex): $(echo -n "$REQUEST_DATA" | xxd -p | tr -d '\n')"
echo ""

GRPC_RESPONSE=$(curl -s -X POST "http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm" \
  -H "Content-Type: application/grpc-web+proto" \
  -H "Accept: application/grpc-web+proto" \
  -H "X-Grpc-Web: 1" \
  --data-binary "$REQUEST_DATA" \
  --max-time 30 \
  -w "\nHTTP_CODE:%{http_code}" 2>&1)

HTTP_CODE=$(echo "$GRPC_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ gRPC endpoint ответил: 200 OK"
  echo "   📊 Получены данные (первые 100 байт):"
  echo "$GRPC_RESPONSE" | head -c 100 | xxd | head -5
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ ТЕСТ УСПЕШЕН!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "   ❌ gRPC endpoint ошибка: HTTP $HTTP_CODE"
  echo "$GRPC_RESPONSE"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ ТЕСТ ЗАВЕРШЁН С ОШИБКОЙ"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

echo ""
echo "📋 ДАННЫЕ ДЛЯ РУЧНОГО ТЕСТА:"
echo "   User ID: $USER_ID"
echo "   Project ID: $PROJECT_ID"
echo "   Token: $TOKEN"
echo ""
echo "💡 Используйте в браузере (Console):"
echo "   localStorage.setItem('token', '$TOKEN');"
echo "   localStorage.setItem('user', JSON.stringify({id: $USER_ID}));"
echo "   diagnoseGrpc($USER_ID, $PROJECT_ID)"
