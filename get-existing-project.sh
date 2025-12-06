#!/bin/bash

# Скрипт для получения списка существующих проектов
# Использование: ./get-existing-project.sh <auth_token>

AUTH_TOKEN=${1}

if [ -z "$AUTH_TOKEN" ]; then
  echo "❌ Ошибка: необходим токен авторизации"
  echo ""
  echo "Использование: $0 <auth_token>"
  echo ""
  echo "Получить токен можно из localStorage в браузере:"
  echo "  localStorage.getItem('token')"
  exit 1
fi

echo "📋 Получаем список проектов..."
echo ""

curl -s -X GET "http://78.153.139.47:8000/v1/project" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  | python3 -m json.tool

echo ""
echo "✅ Готово!"
echo ""
echo "Найдите любой project_id из списка и используйте его:"
echo "  diagnoseGrpc(user_id, project_id)"
