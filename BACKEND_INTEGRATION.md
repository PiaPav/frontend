# Backend Integration Guide

## Обзор архитектуры

### Frontend → Backend Communication Flow

```
Frontend (Browser)
    ↓ REST: GET /v1/project/{id}
    ↓ Headers: Authorization: Bearer <JWT>
    ↓
FastAPI REST (port 8000) ← возвращает метаданные проекта
    
Frontend (Browser)
    ↓ gRPC-Web: POST /core.api.FrontendStreamService/RunAlgorithm
    ↓ Headers: Content-Type: application/grpc-web+proto
    ↓ Body: binary Protobuf [0x08, user_id, 0x10, task_id]
    ↓
Envoy Proxy (port 8080)
    ↓ gRPC: HTTP/2
    ↓
Core gRPC Service (port 50051)
    ↓ Server Stream
    ↓ GraphPartResponse: START → REQUIREMENTS → ENDPOINTS → ARCHITECTURE → DONE
    ↓
Frontend обрабатывает stream
```

## REST API

### GET /v1/project/{project_id}

**Назначение:** Получение метаданных проекта и готовой архитектуры (если есть)

**Endpoint:** `http://78.153.139.47:8000/v1/project/{project_id}`

**Заголовки:**
```
Authorization: Bearer <JWT>
```

**Ответ 200 OK:**
```json
{
  "id": 16,
  "name": "My Project",
  "description": "Project description",
  "picture_url": "https://...",
  "architecture": {
    "requirements": ["fastapi", "sqlalchemy", ...],
    "endpoints": {
      "create_project": "POST /v1/project",
      "get_project": "GET /v1/project/{id}"
    },
    "data": {
      "POST /v1/project": ["validate_file", "save_to_s3"],
      "validate_file": ["check_size", "check_format"]
    }
  }
}
```

**Ошибки:**
- `401` - INVALID_TOKEN (токен невалиден или истёк)
- `404` - PROJECT_NO_RIGHT_OR_NOT_FOUND (проект не найден или нет прав доступа)
- `422` - Ошибка валидации параметров

**Пример curl:**
```bash
TOKEN="your_jwt_token_here"
curl -H "Authorization: Bearer $TOKEN" \
     http://78.153.139.47:8000/v1/project/16
```

**Frontend реализация:**
- `src/services/api.js` - `projectsAPI.getById(id)`
- Токен добавляется автоматически через axios interceptor
- Вызывается в `ProjectAnalysis.jsx` перед gRPC stream

## gRPC Stream API

### /core.api.FrontendStreamService/RunAlgorithm

**Назначение:** Запуск анализа проекта и получение архитектуры в реальном времени

**Endpoint:** `http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm`

**Протокол:** gRPC-Web (через Envoy proxy)

**Заголовки:**
```
Content-Type: application/grpc-web+proto
Accept: application/grpc-web+proto
X-Grpc-Web: 1
X-User-Agent: grpc-web-javascript/0.1
```

### Запрос (AlgorithmRequest)

**Protobuf схема:**
```protobuf
message AlgorithmRequest {
  int64 user_id = 1;  // ID пользователя
  int64 task_id = 2;  // ID проекта
}
```

**Binary encoding (varint):**
```
0x08 <user_id_varint> 0x10 <task_id_varint>
```

**Пример:** user_id=2, task_id=16
```
[0x08, 0x02, 0x10, 0x10]
```

**Frontend реализация:**
```javascript
// src/services/grpcClient.js
encodeAlgorithmRequest(userId, taskId) {
  const buffer = [];
  buffer.push(0x08); // tag для field 1
  this.writeVarint(buffer, userId);
  buffer.push(0x10); // tag для field 2
  this.writeVarint(buffer, taskId);
  return new Uint8Array(buffer);
}
```

### Ответ (GraphPartResponse - Server Stream)

**Protobuf схема:**
```protobuf
enum GraphStatus {
  START = 0;
  REQUIREMENTS = 1;
  ENDPOINTS = 2;
  ARCHITECTURE = 3;
  DONE = 4;
}

message GraphPartResponse {
  GraphStatus status = 1;
  int64 response_id = 2;
  repeated string requirements = 3;
  map<string, string> endpoints = 4;
  string parent = 5;
  repeated string children = 6;
}
```

**Порядок сообщений:**
```
1. START (status=0) - анализ начался
2. REQUIREMENTS (status=1) - отправка зависимостей
   - requirements: ["fastapi==0.104.1", "sqlalchemy==2.0.23", ...]
3. ENDPOINTS (status=2) - отправка эндпоинтов
   - endpoints: {"create_project": "POST /v1/project", ...}
4. ARCHITECTURE (status=3) - отправка графа (может быть много раз)
   - parent: "POST /v1/project"
   - children: ["validate_file", "save_to_s3", "create_db_record"]
5. DONE (status=4) - анализ завершён успешно
```

**КРИТИЧЕСКИ ВАЖНО:**
- Stream считается успешным **ТОЛЬКО** если получен статус `DONE`
- Если stream оборвался до `DONE` - это **ошибка**, нужно показать пользователю
- Frontend отслеживает флаг `receivedDone` и выбрасывает исключение если DONE не получен

**gRPC-Web формат:**
```
[compressed-flag: 1 byte][message-length: 4 bytes BE][protobuf-message: N bytes]
```

**Frontend реализация:**
```javascript
// src/services/grpcClient.js
async connectToStream(userId, taskId, callbacks) {
  // 1. Отправка binary Protobuf запроса
  // 2. Чтение stream с парсингом gRPC-Web frames
  // 3. Декодирование каждого GraphPartResponse
  // 4. Вызов соответствующих callbacks
  // 5. Проверка получения DONE статуса
}
```

**Пример curl (тестирование backend):**
```bash
# Создаём binary Protobuf: user_id=2, task_id=16
echo -ne '\x08\x02\x10\x10' > /tmp/grpc_request.bin

# Отправляем запрос
curl -X POST http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm \
  -H "Content-Type: application/grpc-web+proto" \
  --data-binary @/tmp/grpc_request.bin \
  -v
```

## Обработка ошибок

### HTTP статус коды

- **200 OK** - Stream успешно начался (но нужно проверить получение DONE!)
- **401** - Невалидный токен
- **404** - Эндпоинт не найден (проблема с Envoy routing)
- **422** - Ошибка валидации параметров
- **500** - Внутренняя ошибка Core gRPC сервиса
- **502** - Bad Gateway (Envoy не может подключиться к Core)
- **503** - Service Unavailable (Core недоступен)

### gRPC статусы

В случае gRPC ошибок backend должен отправить заголовки:
```
grpc-status: <код ошибки>
grpc-message: <описание ошибки>
```

**Коды:**
- `0` - OK
- `1` - CANCELLED
- `2` - UNKNOWN
- `3` - INVALID_ARGUMENT
- `4` - DEADLINE_EXCEEDED
- `5` - NOT_FOUND
- и т.д.

### Stream прерван до DONE

Frontend детектирует это как **критическую ошибку** и показывает:
```
Stream прерван преждевременно.

Получено сообщений: N
Статус DONE не получен.

Возможные причины:
• Ошибка в алгоритме анализа на сервере
• Таймаут обработки
• Проблема с файлом проекта
• Недостаточно памяти на сервере

Проверьте логи Core gRPC сервиса: docker logs -f core-service
```

## Что проверить на бэкенде при 500 ошибке

### 1. Логи Core gRPC сервиса
```bash
docker logs --tail=100 -f core-service
```

**Что искать:**
- `RunAlgorithm called with user_id=X task_id=Y` - метод вызван?
- `Traceback` - есть исключения?
- `FileNotFoundError` - файл проекта не найден?
- `ValueError` / `KeyError` - ошибка парсинга?

### 2. Проверка проекта в БД
```sql
SELECT id, author_id, name, files_url, status 
FROM projects 
WHERE id = 16;
```

**Проверить:**
- ✅ Проект существует
- ✅ `author_id` совпадает с `user_id` из запроса
- ✅ `files_url` не NULL и не пустой
- ✅ Путь в `files_url` валидный

### 3. Проверка файла в S3/хранилище
```bash
# Если используется S3
aws s3 ls s3://your-bucket/path/from/files_url/

# Если локальное хранилище
ls -lh /path/to/projects/16/
```

**Проверить:**
- ✅ Архив существует
- ✅ Архив не повреждён (можно распаковать)
- ✅ Внутри есть файлы для анализа

### 4. Логи Envoy
```bash
docker logs --tail=50 -f envoy
```

**Что искать:**
- `POST /core.api.FrontendStreamService/RunAlgorithm`
- `upstream connect error` - не может подключиться к Core
- `503` - upstream unavailable

### 5. Проверка алгоритм-сервиса
```bash
docker ps | grep algorithm
docker logs --tail=50 -f algorithm-service
```

**Проверить:**
- ✅ Сервис запущен
- ✅ `GRPC_HOST` в `.env` указывает на `core-service` (не на `0.0.0.0` или `localhost`)
- ✅ Видит задачу в очереди `tasks`

## Frontend логирование

При отправке запроса frontend выводит в консоль:

```
════════════════════════════════════════
📤 ОТПРАВКА gRPC ЗАПРОСА
════════════════════════════════════════
🌐 URL: http://localhost:5173/grpc/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: 2
📋 Task ID (Project ID): 16
📦 Request Headers: {Content-Type: "application/grpc-web+proto", ...}
📏 Payload Length: 4 bytes
🔍 Payload (hex): 08 02 10 10
🔍 Payload (bytes): 0x08, 0x02, 0x10, 0x10
🔍 Decoded: field 1 (user_id)=2, field 2 (task_id)=16
════════════════════════════════════════
```

При получении ответа:
```
════════════════════════════════════════
📥 ПОЛУЧЕН ОТВЕТ
════════════════════════════════════════
📊 HTTP Status: 200 OK
📦 Response Headers:
  • Content-Type: application/grpc-web+proto
  • grpc-status: null
  • grpc-message: null
  • transfer-encoding: chunked
════════════════════════════════════════
```

При получении каждого сообщения:
```
📬 Получено сообщение #1: {status: "REQUIREMENTS", response_id: 1, data: {...}}
📋 REQUIREMENTS - получено 15 зависимостей
```

При завершении:
```
✅ Stream завершён корректно, всего сообщений: 12
```

Или при ошибке:
```
❌ Stream оборвался до получения статуса DONE
📊 Статистика: {totalMessages: 8, receivedDone: false, lastStatus: "Stream прерван"}
```

## Vite Proxy Configuration

`vite.config.js`:
```javascript
export default defineConfig({
  server: {
    proxy: {
      '/grpc': {
        target: 'http://78.153.139.47:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/grpc/, ''),
      },
      '/v1': {
        target: 'http://78.153.139.47:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
```

**Development:**
- `/grpc/*` → `http://78.153.139.47:8080/*`
- `/v1/*` → `http://78.153.139.47:8000/v1/*`

**Production:**
- Нужно настроить Nginx/CDN для проксирования этих путей

## Тестирование

### 1. Тест REST API
```bash
# Получить токен
TOKEN=$(curl -X POST http://78.153.139.47:8000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user@example.com","password":"password"}' \
  | jq -r '.access_token')

# Получить проект
curl -H "Authorization: Bearer $TOKEN" \
     http://78.153.139.47:8000/v1/project/16 \
     | jq
```

### 2. Тест gRPC через curl
```bash
# Создать Protobuf запрос: user_id=2, task_id=16
echo -ne '\x08\x02\x10\x10' > /tmp/grpc_request.bin

# Отправить через Envoy
curl -X POST http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm \
  -H "Content-Type: application/grpc-web+proto" \
  --data-binary @/tmp/grpc_request.bin \
  -v
```

### 3. Тест через Frontend
1. Открыть `http://localhost:5173/projects/16/architecture`
2. Открыть DevTools Console
3. Смотреть логи запроса/ответа
4. Проверить, что получен статус DONE

## Известные проблемы и решения

### Проблема: 500 Internal Server Error

**Причины:**
1. Проект не найден в БД
2. `files_url` пустой или NULL
3. Файл отсутствует в хранилище
4. Архив повреждён
5. Exception в алгоритме анализа

**Решение:**
```bash
# 1. Проверить логи
docker logs -f core-service | grep -i error

# 2. Проверить БД
psql -U postgres -d piapav -c "SELECT * FROM projects WHERE id=16;"

# 3. Проверить файл
ls -lh /path/to/storage/projects/16/

# 4. Тест распаковки
unzip -t /path/to/storage/projects/16/archive.zip
```

### Проблема: Stream оборвался до DONE

**Причины:**
1. Таймаут обработки
2. Out of Memory
3. Exception в середине анализа
4. Сетевой разрыв

**Решение:**
```bash
# Увеличить таймауты
# В Core gRPC config:
GRPC_TIMEOUT=300  # 5 минут

# Увеличить memory limit
# В docker-compose.yml:
services:
  core-service:
    mem_limit: 4g
```

### Проблема: 404 Not Found

**Причина:** Envoy не может найти роут

**Решение:**
Проверить `envoy.yaml`:
```yaml
routes:
  - match:
      prefix: "/core.api.FrontendStreamService"
      grpc: {}
    route:
      cluster: core_grpc_service
      timeout: 300s
```

### Проблема: CORS ошибки

**Причина:** Missing CORS headers

**Решение:**
В Envoy config добавить CORS:
```yaml
cors:
  allow_origin_string_match:
    - prefix: "*"
  allow_methods: "GET, POST, OPTIONS"
  allow_headers: "content-type, x-grpc-web, authorization"
```

## Checklist перед деплоем

- [ ] REST API доступен и возвращает корректные данные
- [ ] gRPC stream работает и отправляет все сообщения до DONE
- [ ] Envoy корректно проксирует gRPC-Web → gRPC
- [ ] Все проекты имеют валидный `files_url`
- [ ] Файлы проектов существуют в хранилище
- [ ] Логирование настроено на Core и Envoy
- [ ] Таймауты достаточны для больших проектов
- [ ] Memory limits корректны
- [ ] CORS headers настроены
- [ ] Production proxy настроен в Nginx/CDN

## Контакты

При проблемах проверять в следующем порядке:
1. Frontend console logs
2. Core gRPC service logs
3. Envoy proxy logs
4. Database state
5. File storage
6. Network connectivity
