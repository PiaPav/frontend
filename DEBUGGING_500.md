# Debugging 500 Error - gRPC Stream

## Текущая ситуация

**Backend работает отлично!** ✅

Логи показывают, что Core gRPC сервис:
1. Получает запрос для task=17 и task=18
2. Успешно отправляет все сообщения:
   - status=1 (REQUIREMENTS)
   - status=2 (ENDPOINTS)  
   - status=3 (ARCHITECTURE) - много раз
   - **status=4 (DONE)** ✅
3. Логирует: `"Алгоритм получен DONE для task=17"` ✅

**НО: Frontend получает 500 ошибку** ❌

## Проблема

Проблема **НЕ в бэкенде**, проблема в том, что **frontend не получает stream**.

### Возможные причины:

1. **Vite dev proxy обрывает stream**
   - Vite может буферизовать ответ вместо streaming
   - Или неправильно передавать бинарные данные

2. **Response приходит с status 500 ДО начала stream**
   - Envoy возвращает ошибку до того как Core начинает отправлять
   - Но логи показывают что Core УЖЕ отправляет данные

3. **Frontend не может прочитать stream**
   - Response.body === null
   - Проблема с ReadableStream API

## Диагностика

### Шаг 1: Проверить консоль браузера

Откройте DevTools (F12) → Console и найдите логи:

```javascript
// Должно быть:
📤 ОТПРАВКА gRPC ЗАПРОСА
🌐 URL: http://localhost:5173/grpc/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: 2
📋 Task ID: 18
🔍 Payload (hex): 08 02 10 12

📥 ПОЛУЧЕН ОТВЕТ
📊 HTTP Status: 200 OK  // ❗ Если здесь 500 - проблема в proxy/envoy
📦 Response Headers:
  • Content-Type: application/grpc-web+proto
  • grpc-status: null
  • grpc-message: null

📖 Response body: ReadableStream { ... }  // ❗ Если null - проблема!

📦 Chunk #1: {done: false, valueLength: 1234}
📦 Chunk #2: {done: false, valueLength: 5678}
...
```

**Ключевые вопросы:**
- Какой HTTP Status? (200 или 500?)
- Есть ли `Response body: ReadableStream`?
- Есть ли chunks?
- Получены ли сообщения (#1, #2, ...)?

### Шаг 2: Проверить Network tab

DevTools → Network → найти запрос `RunAlgorithm`

**Проверить:**
- Status Code: должен быть **200 OK**, не 500
- Response Headers:
  - `Content-Type: application/grpc-web+proto`
  - `Transfer-Encoding: chunked` (для streaming)
- Response Preview: должны быть бинарные данные

**Если Status = 500:**
- Кликнуть на запрос
- Перейти в Response tab
- Скопировать текст ошибки
- Это даст понять, **КТО** возвращает 500 (Envoy или Vite)

### Шаг 3: Тест напрямую к Envoy (минуя Vite)

Временно измените URL в `grpcClient.js`:

```javascript
constructor(envoyUrl = null) {
  // Прямой доступ к Envoy, БЕЗ Vite proxy
  this.envoyUrl = 'http://78.153.139.47:8080';
  console.log('🔧 gRPC Client инициализирован:', this.envoyUrl);
}
```

**Если это помогает** → проблема в Vite proxy
**Если всё равно 500** → проблема в Envoy или браузерных CORS

### Шаг 4: Проверить CORS

В DevTools Console, если видите:

```
Access to fetch at 'http://78.153.139.47:8080/...' from origin 'http://localhost:5173' 
has been blocked by CORS policy
```

**Решение:**
1. Добавить в Envoy config:
```yaml
cors:
  allow_origin_string_match:
    - prefix: "*"
  allow_methods: GET, POST, OPTIONS
  allow_headers: content-type, x-grpc-web, x-user-agent, accept
  expose_headers: grpc-status, grpc-message
```

2. Или использовать Vite proxy (но он работает плохо для streaming)

## Решения

### Вариант 1: Исправить Vite proxy (текущий)

Я уже добавил в `vite.config.js`:

```javascript
'/grpc': {
  target: 'http://78.153.139.47:8080',
  changeOrigin: true,
  secure: false,
  rewrite: (path) => path.replace(/^\/grpc/, ''),
  ws: false,
  configure: (proxy, options) => {
    proxy.on('proxyRes', (proxyRes, req, res) => {
      proxyRes.on('data', (chunk) => {
        console.log('[Vite Proxy] Получен chunk:', chunk.length, 'bytes');
      });
    });
  },
}
```

**После изменения vite.config.js:**
1. Остановить `npm run dev`
2. Запустить снова `npm run dev`
3. Обновить страницу (Ctrl+Shift+R)
4. Проверить консоль - должны появиться логи `[Vite Proxy] Получен chunk`

### Вариант 2: Напрямую к Envoy (быстрое решение)

Изменить в `grpcClient.js`:

```javascript
constructor(envoyUrl = null) {
  // ВРЕМЕННО: прямой доступ без proxy
  this.envoyUrl = 'http://78.153.139.47:8080';
  
  // Для production оставить как есть:
  // if (envoyUrl) {
  //   this.envoyUrl = envoyUrl;
  // } else if (import.meta.env.DEV) {
  //   this.envoyUrl = '/grpc'; // Vite proxy
  // } else {
  //   this.envoyUrl = 'http://78.153.139.47:8080';
  // }
}
```

**Минусы:**
- Нужен CORS в Envoy
- В production придётся менять обратно

### Вариант 3: Использовать generated gRPC-Web клиент

Вместо ручного Protobuf, использовать официальный `grpc-web`:

```bash
npm install grpc-web
npm install -D grpc-tools
```

Сгенерировать клиент из proto файлов:
```bash
protoc --js_out=import_style=commonjs:./src/grpc_control/generated \
       --grpc-web_out=import_style=commonjs,mode=grpcwebtext:./src/grpc_control/generated \
       proto/core/api/core.proto proto/shared/common.proto
```

**Плюсы:**
- Официальная библиотека, протестирована
- Автоматическая сериализация/десериализация
- Лучшая обработка streaming

**Минусы:**
- Нужны proto файлы
- Нужна настройка protoc

## Что сделать ПРЯМО СЕЙЧАС

1. **Откройте браузер** → F12 → Console
2. **Обновите страницу** с проектом (Ctrl+Shift+R)
3. **Скопируйте ВСЕ логи** из Console (особенно часть про gRPC запрос)
4. **Откройте Network tab** → найдите `RunAlgorithm`
5. **Посмотрите Status Code** - 200 или 500?
6. **Если 500** → скопируйте Response body

**Отправьте мне:**
- Логи из Console
- Status Code из Network
- Response body (если есть текст ошибки)

Тогда я точно скажу, в чём проблема! 🔍

## Ожидаемые логи (если всё работает)

```javascript
📤 ОТПРАВКА gRPC ЗАПРОСА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 URL: http://localhost:5173/grpc/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: 2
📋 Task ID (Project ID): 18
🔍 Payload (hex): 08 02 10 12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📥 ПОЛУЧЕН ОТВЕТ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 HTTP Status: 200 OK
📦 Response Headers:
  • Content-Type: application/grpc-web+proto
  • grpc-status: null
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ gRPC соединение установлено, читаем бинарный stream...
📖 Response body: ReadableStream { locked: false }

📦 Chunk #1: {done: false, valueLength: 156, valueType: "Uint8Array", bufferLength: 0}
🔄 Буфер после добавления chunk: 156 bytes
🔍 Frame header: {compressedFlag: 0, messageLength: 151, bufferAvailable: 156, needsTotal: 156}
✂️ Извлечено сообщение: 151 bytes, осталось в буфере: 0
📬 Получено сообщение #1: {status: "REQUIREMENTS", response_id: 1}
📋 REQUIREMENTS - получено 15 зависимостей

📦 Chunk #2: {done: false, valueLength: 234, valueType: "Uint8Array", bufferLength: 0}
🔄 Буфер после добавления chunk: 234 bytes
🔍 Frame header: {compressedFlag: 0, messageLength: 229, bufferAvailable: 234, needsTotal: 234}
✂️ Извлечено сообщение: 229 bytes, осталось в буфере: 0
📬 Получено сообщение #2: {status: "ENDPOINTS", response_id: 2}
🔗 ENDPOINTS - получено 8 эндпоинтов

... (много сообщений ARCHITECTURE) ...

📦 Chunk #87: {done: false, valueLength: 12, valueType: "Uint8Array", bufferLength: 0}
🔄 Буфер после добавления chunk: 12 bytes
🔍 Frame header: {compressedFlag: 0, messageLength: 7, bufferAvailable: 12, needsTotal: 12}
✂️ Извлечено сообщение: 7 bytes, осталось в буфере: 0
📬 Получено сообщение #87: {status: "DONE", response_id: 87}
✅ Получен статус DONE - stream завершён успешно
✅ DONE - анализ завершён (обработка в основном цикле)

📭 Stream завершён. Получено чанков: 87, сообщений: 87
✅ Stream завершён корректно, всего сообщений: 87
```
