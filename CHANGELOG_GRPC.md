# Сводка изменений - gRPC интеграция

## 🎯 Проблема
Frontend не мог подключиться к backend gRPC сервису:
- Ошибка: `ERR_EMPTY_RESPONSE`
- Причина: Неправильная структура декодирования Protobuf

## ✅ Решение

### 1. Обновлена структура Protobuf (согласно backend)

**Было (неверно):**
```protobuf
message GraphPartResponse {
  GraphStatus status = 1;
  int64 response_id = 2;
  repeated string requirements = 3;
  map<string, string> endpoints = 4;
  string parent = 5;
  repeated string children = 6;
}
```

**Стало (правильно):**
```protobuf
message GraphPartResponse {
  int64 task_id = 1;
  int32 response_id = 2;
  ParseStatus status = 3;
  oneof graph_part_type {
    GraphPartRequirements graph_requirements = 4;
    GraphPartEndpoints graph_endpoints = 5;
    GraphPartArchitecture graph_architecture = 6;
  }
}
```

### 2. Добавлено декодирование вложенных сообщений

Файл: `src/services/grpcClient.js`

Новые методы:
- `decodeGraphPartRequirements()` - декодирует requirements
- `decodeGraphPartEndpoints()` - декодирует endpoints
- `decodeGraphPartArchitecture()` - декодирует parent/children
- `readLengthDelimited()` - читает вложенные сообщения

### 3. Исправлены названия

- `GraphStatus` → `ParseStatus`
- `ARCHITECTURE` → `ARHITECTURE` (опечатка в proto backend)

### 4. Обновлена документация

- `FLOW_DIAGRAM_FOR_BACKEND.md` - описание протокола
- `GRPC_FIX_README.md` - инструкции по тестированию
- `README.md` - быстрый старт

## 📁 Измененные файлы

### Основные:
1. **src/services/grpcClient.js** (310 строк изменений)
   - Переписан `decodeGraphPartResponse()`
   - Добавлены 3 новых метода декодирования
   - Исправлены все `GraphStatus` → `ParseStatus`

2. **FLOW_DIAGRAM_FOR_BACKEND.md** (50 строк изменений)
   - Обновлен раздел "Формат ответа"
   - Обновлен "Порядок сообщений"

### Новые:
3. **test-grpc-console.js** (новый файл)
   - Скрипт для тестирования в консоли браузера

4. **GRPC_FIX_README.md** (новый файл)
   - Полная инструкция по тестированию

## 🧪 Как проверить

### Быстрый тест (консоль браузера):
```bash
# 1. Запустить фронтенд
npm run dev

# 2. Открыть http://localhost:5173
# 3. DevTools → Console
# 4. Вставить содержимое test-grpc-console.js
# 5. Запустить:
testGrpcConnection(9, 242)
```

### Полный тест (через UI):
```bash
# 1. Запустить фронтенд
npm run dev

# 2. Авторизоваться
# 3. Создать новый проект
# 4. Смотреть логи в Console:
#    - Должны появиться сообщения START → REQUIREMENTS → ... → DONE
```

## 🔍 Что проверить на backend

### 1. Envoy работает:
```bash
docker ps | grep envoy
curl http://78.153.139.47:8080/health
```

### 2. Core service отвечает:
```bash
docker logs -f core-service | grep "RunAlgorithm"
```

### 3. Proto файлы совпадают:
```bash
cat backend-main/proto/shared/common.proto
# Проверить структуру GraphPartResponse
```

## 📊 Ожидаемый результат

### В консоли браузера:
```
📤 ОТПРАВКА gRPC ЗАПРОСА
🌐 URL: /grpc/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: 9
📋 Task ID: 242

📥 ПОЛУЧЕН ОТВЕТ
📊 HTTP Status: 200 OK

📬 Message #1: {status: 'START', task_id: 242}
📬 Message #2: {status: 'REQUIREMENTS', requirements: ['fastapi', ...]}
📬 Message #3: {status: 'ENDPOINTS', endpoints: {'/api/users': 'GET', ...}}
📬 Message #4: {status: 'ARHITECTURE', parent: 'main.py', children: [...]}
...
📬 Message #N: {status: 'DONE'}
✅ Получен статус DONE - stream завершён успешно
```

## 🐛 Если не работает

### ERR_EMPTY_RESPONSE:
1. Проверить Envoy: `docker ps | grep envoy`
2. Логи Envoy: `docker logs envoy | grep "RunAlgorithm"`
3. Проверить роутинг в `envoy.yaml`

### 504 Gateway Timeout:
1. Проверить Core service: `docker ps | grep core`
2. Логи Core: `docker logs -f core-service`
3. Увеличить timeout в `vite.config.js` (уже 5 минут)

### Неверные данные:
1. Проверить proto файлы backend
2. Сверить с `src/services/grpcClient.js`
3. Смотреть hex dump в Console (включен debug режим)

## 📞 Контакты

- Frontend repo: https://github.com/PiaPav/frontend
- Backend repo: https://github.com/PiaPav/backend-main

Вопросы по интеграции → смотрите `FLOW_DIAGRAM_FOR_BACKEND.md`
