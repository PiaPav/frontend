# Примеры успешных логов gRPC

## ✅ Успешное подключение и получение данных

### 1. Отправка запроса
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 ОТПРАВКА gRPC ЗАПРОСА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 URL: http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: 9
📋 Task ID (Project ID): 242
📦 Request Headers: {
  'Content-Type': 'application/grpc-web+proto',
  'Accept': 'application/grpc-web+proto',
  'X-Grpc-Web': '1',
  'X-User-Agent': 'grpc-web-javascript/0.1'
}
📏 Payload Length: 5 bytes
🔍 Payload (hex): 0x08, 0x09, 0x10, 0xf2, 0x01
🔍 Payload (bytes): [8, 9, 16, 242, 1]
🔍 Decoded: field 1 (user_id)=9, field 2 (task_id)=242
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. Получение ответа
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 ПОЛУЧЕН ОТВЕТ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 HTTP Status: 200 OK
📊 response.ok: true
📦 Response Headers:
  • Content-Type: application/grpc-web+proto
  • transfer-encoding: chunked
📖 Response body exists: true
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ gRPC соединение установлено, читаем бинарный stream...
```

### 3. Получение сообщений
```
📦 Chunk #1: {done: false, valueLength: 128}
🔍 Frame header: {compressedFlag: 0, messageLength: 8}
✂️ Извлечено сообщение: 8 bytes

📬 Получено сообщение #1: {
  task_id: 242,
  response_id: 1,
  status: 0 (START)
}
📨 Обработка сообщения: status=START, response_id=1
🎬 START - анализ начался
```

```
📦 Chunk #2: {done: false, valueLength: 256}
🔍 Frame header: {compressedFlag: 0, messageLength: 187}
✂️ Извлечено сообщение: 187 bytes

📬 Получено сообщение #2: {
  task_id: 242,
  response_id: 2,
  status: 1 (REQUIREMENTS),
  requirements: [
    'fastapi==0.104.1',
    'pydantic==2.5.0',
    'sqlalchemy==2.0.23',
    'alembic==1.12.1',
    'psycopg2-binary==2.9.9',
    'redis==5.0.1',
    'celery==5.3.4',
    'boto3==1.29.7',
    'grpcio==1.59.3',
    'grpcio-tools==1.59.3',
    'protobuf==4.25.1'
  ],
  total_requirements: 11
}
📨 Обработка сообщения: status=REQUIREMENTS, response_id=2
📋 REQUIREMENTS - получено 11 зависимостей
```

```
📦 Chunk #3: {done: false, valueLength: 512}
🔍 Frame header: {compressedFlag: 0, messageLength: 345}
✂️ Извлечено сообщение: 345 bytes

📬 Получено сообщение #3: {
  task_id: 242,
  response_id: 3,
  status: 2 (ENDPOINTS),
  endpoints: {
    'POST /v1/project': 'Создание нового проекта',
    'GET /v1/project': 'Получение списка проектов',
    'GET /v1/project/{id}': 'Получение проекта по ID',
    'PATCH /v1/project/{id}': 'Обновление проекта',
    'DELETE /v1/project/{id}': 'Удаление проекта',
    'POST /auth/register': 'Регистрация пользователя',
    'POST /auth/login': 'Авторизация',
    'POST /auth/refresh': 'Обновление токена'
  },
  total_endpoints: 8
}
📨 Обработка сообщения: status=ENDPOINTS, response_id=3
🔗 ENDPOINTS - получено 8 эндпоинтов
```

```
📦 Chunk #4: {done: false, valueLength: 256}
🔍 Frame header: {compressedFlag: 0, messageLength: 89}
✂️ Извлечено сообщение: 89 bytes

📬 Получено сообщение #4: {
  task_id: 242,
  response_id: 4,
  status: 3 (ARHITECTURE),
  parent: 'main.py',
  children: [
    'src/',
    'config/',
    'proto/',
    'requirements.txt',
    'docker-compose.yml'
  ]
}
📨 Обработка сообщения: status=ARHITECTURE, response_id=4
🏗️ ARHITECTURE - узел main.py с 5 детьми
```

```
📦 Chunk #5: {done: false, valueLength: 128}
🔍 Frame header: {compressedFlag: 0, messageLength: 67}
✂️ Извлечено сообщение: 67 bytes

📬 Получено сообщение #5: {
  task_id: 242,
  response_id: 5,
  status: 3 (ARHITECTURE),
  parent: 'src/',
  children: [
    'endpoints/',
    'services/',
    'models/',
    'grpc_/',
    'database/'
  ]
}
📨 Обработка сообщения: status=ARHITECTURE, response_id=5
🏗️ ARHITECTURE - узел src/ с 5 детьми
```

... (еще ARHITECTURE сообщения)

```
📦 Chunk #15: {done: false, valueLength: 64}
🔍 Frame header: {compressedFlag: 0, messageLength: 8}
✂️ Извлечено сообщение: 8 bytes

📬 Получено сообщение #47: {
  task_id: 242,
  response_id: 47,
  status: 4 (DONE)
}
📨 Обработка сообщения: status=DONE, response_id=47
✅ DONE - анализ завершён (обработка в основном цикле)
✅ Получен статус DONE - stream завершён успешно
```

### 4. Завершение stream
```
📭 Stream завершён. Получено чанков: 15, сообщений: 47
✅ Stream завершён корректно, всего сообщений: 47

💾 Сохранение данных в state...
🎉 Анализ завершён успешно!
🚀 Переход на страницу визуализации: /projects/view/242
```

## 📊 Итоговая статистика

```
✅ Всего сообщений: 47
  • START: 1
  • REQUIREMENTS: 1 (11 зависимостей)
  • ENDPOINTS: 1 (8 эндпоинтов)
  • ARHITECTURE: 44 (структура проекта)
  • DONE: 1

⏱️ Время анализа: 3.2 секунды
📦 Размер данных: ~15 KB
🔄 HTTP chunks: 15
```

## 🔍 Проверка Network tab (DevTools)

### General:
```
Request URL: http://localhost:5173/grpc/core.api.FrontendStreamService/RunAlgorithm
Request Method: POST
Status Code: 200 OK
Remote Address: 127.0.0.1:5173
```

### Response Headers:
```
content-type: application/grpc-web+proto
transfer-encoding: chunked
x-envoy-upstream-service-time: 3245
```

### Request Headers:
```
content-type: application/grpc-web+proto
accept: application/grpc-web+proto
x-grpc-web: 1
x-user-agent: grpc-web-javascript/0.1
content-length: 5
```

### Request Payload (hex):
```
08 09 10 f2 01
```

### Response (partial hex):
```
00 00 00 00 08  │  08 f2 01 10 01 18 00      │ START message
00 00 00 00 bb  │  08 f2 01 10 02 18 01 22   │ REQUIREMENTS message
                │  b4 01 08 0b 12 10 66 61   │ (с данными)
00 00 00 01 59  │  08 f2 01 10 03 18 02 2a   │ ENDPOINTS message
                │  ...                       │
```

## ⚠️ Примеры ОШИБОК (для сравнения)

### Ошибка 1: ERR_EMPTY_RESPONSE
```
❌ gRPC response error: 
{
  status: 0,
  statusText: '',
  body: '',
  error: 'net::ERR_EMPTY_RESPONSE'
}
```
**Причина:** Backend не отвечает (Envoy/Core не работает)

### Ошибка 2: 504 Gateway Timeout
```
❌ gRPC response error: 
{
  status: 504,
  statusText: 'Gateway Timeout',
  body: 'Пустой ответ от сервера',
  url: '/grpc/core.api.FrontendStreamService/RunAlgorithm'
}
```
**Причина:** Backend не отправляет сообщения (зависание алгоритма)

### Ошибка 3: Stream прерван до DONE
```
❌ Stream оборвался до получения статуса DONE

Stream прерван преждевременно.
Получено сообщений: 23
Статус DONE не получен.

Возможные причины:
• Ошибка в алгоритме анализа на сервере
• Таймаут обработки
• Проблема с файлом проекта
```
**Причина:** Backend не отправил DONE (exception в алгоритме)
