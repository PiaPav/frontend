# 🔄 Полный поток загрузки проекта (Frontend → Backend)

**Дата:** 6 декабря 2025  
**Цель:** Документация для backend-разработчиков

---

## 📋 Общая схема взаимодействия

```
1. Пользователь загружает файл проекта (zip/archive)
   ↓
2. Frontend отправляет POST /v1/project с файлом
   ↓
3. Backend создаёт проект в БД, загружает файл в S3, возвращает project_id
   ↓
4. Frontend сразу запускает gRPC Stream для анализа
   ↓
5. Backend анализирует проект и стримит результаты
   ↓
6. После получения DONE → Frontend переходит на страницу визуализации
```

---

## 🌐 ШАГ 1: REST API - Создание проекта

### **Что происходит на фронте:**

Пользователь загружает файл проекта (обычно .zip архив) через форму. Frontend отправляет `multipart/form-data` запрос.

#### **Файл:** `src/pages/Projects/NewProject.jsx` (пример)

```javascript
const handleUpload = async (file, name, description) => {
  console.log('📤 Создание нового проекта через REST API');
  
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await projectsAPI.create(name, description, formData);
  console.log('✅ Проект создан:', response);
  
  // Сразу запускаем gRPC анализ
  await startAnalysis(response.id);
};
```

#### **Файл:** `src/services/api.js`

```javascript
export const projectsAPI = {
  create: async (name, description, formData) => {
    const response = await api.post(`/project?name=${encodeURIComponent(name)}&description=${encodeURIComponent(description)}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
}
```

### **Что отправляется:**

```http
POST /v1/project?name=My%20Project&description=Project%20description HTTP/1.1
Host: 78.153.139.47:8000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...

------WebKitFormBoundary...
Content-Disposition: form-data; name="file"; filename="project.zip"
Content-Type: application/zip

[binary file data]
------WebKitFormBoundary...--
```

**Query Parameters:**
- `name` (string, required) - Название проекта
- `description` (string, required) - Описание проекта

**Request Body:**
- `file` (binary, required) - Архив проекта (.zip)

**Важно:**
- Токен добавляется автоматически через **axios interceptor**
- Токен берётся из `localStorage.getItem('access_token')`
- Если токен невалиден (401) → автоматический refresh через `/auth/refresh`

### **Что ожидаем получить (200 OK):**

```json
{
  "id": 16,
  "name": "My Project",
  "description": "Project description",
  "picture_url": "https://storage.yandexcloud.net/bucket/projects/16.zip",
  "architecture": {
    "requirements": [],
    "endpoints": {},
    "data": {}
  }
}
```

**Поля ответа:**
- `id` - ID созданного проекта (используется для gRPC запроса)
- `name` - Название проекта
- `description` - Описание
- `picture_url` - URL файла в S3 (или другом хранилище)
- `architecture` - **ВСЕГДА пустой** при создании (будет заполнен после gRPC анализа)

### **Возможные ошибки:**

**401 - Неверный токен:**
```json
{
  "type": "INVALID_TOKEN",
  "message": "Неверный токен"
}
```

**422 - Validation Error:**
```json
{
  "detail": [
    {
      "loc": ["query", "name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

### **Что происходит на backend:**

1. **Валидация параметров:** Проверка `name`, `description`, `file`
2. **Создание записи в БД:**
   ```sql
   INSERT INTO projects (author_id, name, description, picture_url, architecture)
   VALUES (17, 'My Project', 'description', NULL, '{}');
   ```
3. **Загрузка файла в S3:**
   ```python
   s3_key = f"projects/{project_id}.zip"
   s3.upload_fileobj(file, bucket_name, s3_key)
   picture_url = f"https://storage.yandexcloud.net/{bucket_name}/{s3_key}"
   ```
4. **Обновление `picture_url` в БД:**
   ```sql
   UPDATE projects SET picture_url = 'https://...' WHERE id = 16;
   ```
5. **Возврат данных проекта** с пустой `architecture`

### **Что нужно проверить на backend:**

1. **Endpoint доступен?**
   ```bash
   curl -v -X POST "http://78.153.139.47:8000/v1/project?name=Test&description=Test" \
        -H "Authorization: Bearer <TOKEN>" \
        -F "file=@/path/to/project.zip"
   ```

2. **Логи FastAPI:**
   ```bash
   docker logs -f fastapi-service | grep "POST /v1/project"
   ```

3. **SQL проверка:**
   ```sql
   SELECT id, author_id, name, files_url, picture_url, architecture 
   FROM projects 
   ORDER BY id DESC LIMIT 1;
   ```

4. **S3 проверка:**
   ```bash
   aws s3 ls s3://bucket-name/projects/
   ```

---

## 🚀 ШАГ 2: gRPC Stream - Анализ проекта

### **Когда запускается:**

**СРАЗУ** после успешного создания проекта (ШАГ 1). Frontend получает `project_id` и автоматически запускает gRPC анализ.

### **Файл:** `src/pages/Projects/NewProject.jsx` или `ProjectAnalysis.jsx`

```javascript
const startAnalysis = async (projectId) => {
  console.log('📡 Запуск gRPC stream для анализа проекта');
  
  const controller = await grpcClient.connectToStream(user.id, projectId, {
    onStart: () => {
      console.log('🎬 Анализ начался');
      setStatus('analyzing');
    },
    
    onRequirements: (data) => {
      console.log('📋 Requirements получены:', data.requirements.length);
      setRequirements(data.requirements);
    },
    
    onEndpoints: (data) => {
      console.log('🔗 Endpoints получены:', Object.keys(data.endpoints).length);
      setEndpoints(data.endpoints);
    },
    
    onArchitecture: (data) => {
      console.log('🏗️ Architecture часть получена:', data.parent);
      setArchitectureData(prev => [...prev, {
        parent: data.parent,
        children: data.children
      }]);
    },
    
    onDone: () => {
      console.log('✅ gRPC Stream завершён успешно');
      setStatus('completed');
      // Переход на страницу визуализации
      navigate(`/projects/view/${projectId}`);
    },
    
    onError: (error) => {
      console.error('❌ gRPC ошибка:', error);
      setError(error.message);
      setStatus('error');
    }
  });
};

// Вызывается сразу после создания проекта:
const handleCreateProject = async (name, description, file) => {
  try {
    // Шаг 1: Создание проекта
    const project = await projectsAPI.create(name, description, file);
    console.log('✅ Проект создан:', project.id);
    
    // Шаг 2: Запуск анализа
    await startAnalysis(project.id);
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
};
```

### **Что отправляется:**

#### **Файл:** `src/services/grpcClient.js` (строки 285-326)

```javascript
// URL для gRPC-Web запроса через Envoy
const url = `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`;
// Пример: http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm

// Создаём бинарный Protobuf запрос
const requestBody = this.encodeAlgorithmRequest(parseInt(userId), parseInt(taskId));

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/grpc-web+proto',
    'Accept': 'application/grpc-web+proto',
    'X-Grpc-Web': '1',
    'X-User-Agent': 'grpc-web-javascript/0.1',
  },
  body: requestBody,
  signal: abortController.signal
});
```

### **Формат запроса (Binary Protobuf):**

```
AlgorithmRequest {
  user_id: int64  // field number 1
  task_id: int64  // field number 2 (это project_id)
}
```

**Бинарное представление:**

Для `user_id=17, task_id=16`:
```
0x08 0x11 0x10 0x10
│    │    │    │
│    │    │    └─ task_id = 16 (varint)
│    │    └────── field tag 2 (0x10 = field=2, wire=0)
│    └─────────── user_id = 17 (varint)
└──────────────── field tag 1 (0x08 = field=1, wire=0)
```

**Кодирование (файл `grpcClient.js`, строки 100-115):**

```javascript
encodeAlgorithmRequest(userId, taskId) {
  const bytes = [];
  
  // field 1: user_id (int64) - wire type 0
  bytes.push(0x08); // field tag: (1 << 3) | 0
  bytes.push(...this.encodeVarint(userId));
  
  // field 2: task_id (int64) - wire type 0
  bytes.push(0x10); // field tag: (2 << 3) | 0
  bytes.push(...this.encodeVarint(taskId));
  
  return new Uint8Array(bytes);
}
```

### **Логи при отправке (Console):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 ОТПРАВКА gRPC ЗАПРОСА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 URL: http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: 17
📋 Task ID (Project ID): 16
📦 Request Headers: {
  'Content-Type': 'application/grpc-web+proto',
  'Accept': 'application/grpc-web+proto',
  'X-Grpc-Web': '1',
  'X-User-Agent': 'grpc-web-javascript/0.1'
}
📏 Payload Length: 4 bytes
🔍 Payload (hex): 08 11 10 10
🔍 Payload (bytes): 0x08, 0x11, 0x10, 0x10
🔍 Decoded: field 1 (user_id)=17, field 2 (task_id)=16
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### **Маршрутизация через Envoy:**

```
Frontend → http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm
                    ↓ (Envoy translates)
Core gRPC → grpc://core-service:50051/core.api.FrontendStreamService/RunAlgorithm
```

**Envoy конфигурация должна содержать:**

```yaml
routes:
  - match:
      prefix: "/core.api.FrontendStreamService"
    route:
      cluster: core_grpc_service
      timeout: 300s  # 5 минут для долгих анализов

clusters:
  - name: core_grpc_service
    type: STRICT_DNS
    http2_protocol_options: {}
    load_assignment:
      endpoints:
        - lb_endpoints:
            - endpoint:
                address:
                  socket_address:
                    address: core-service
                    port_value: 50051
```

---

## 📥 ШАГ 3: Получение gRPC Stream Response

### **Формат ответа (Binary Protobuf Stream):**

```
GraphPartResponse {
  int64 task_id = 1
  int32 response_id = 2
  ParseStatus status = 3
  oneof graph_part_type {
    GraphPartRequirements graph_requirements = 4
    GraphPartEndpoints graph_endpoints = 5
    GraphPartArchitecture graph_architecture = 6
  }
}

GraphPartRequirements {
  uint32 total = 1
  repeated string requirements = 2
}

GraphPartEndpoints {
  uint32 total = 1
  map<string, string> endpoints = 2
}

GraphPartArchitecture {
  string parent = 1
  repeated string children = 2
}

enum ParseStatus {
  START = 0
  REQUIREMENTS = 1
  ENDPOINTS = 2
  ARHITECTURE = 3  // Обратите внимание: опечатка в proto (ARHITECTURE)
  DONE = 4
}
```

### **Порядок сообщений:**

```
START (status=0) → первое сообщение, task_id присутствует
   ↓
REQUIREMENTS (status=1) → {graph_requirements: {total: N, requirements: ["fastapi", ...]}}
   ↓
ENDPOINTS (status=2) → {graph_endpoints: {total: M, endpoints: {"/api/users": "GET users", ...}}}
   ↓
ARHITECTURE (status=3) → {graph_architecture: {parent: "main.py", children: ["api/", ...]}}
ARHITECTURE (status=3) → {graph_architecture: {parent: "api/", children: ["users.py", ...]}}
...множество ARHITECTURE сообщений...
   ↓
DONE (status=4) ← КРИТИЧЕСКИ ВАЖНО! Означает успешное завершение
```

### **Формат каждого сообщения (gRPC-Web):**

```
[compressed_flag: 1 byte][length: 4 bytes big-endian][protobuf_message: length bytes]
```

**Пример:**
```
0x00 0x00 0x00 0x00 0x2A [42 bytes protobuf data]
│    └────────────────┘    └─────────────────────┘
│         length=42           GraphPartResponse
└── compressed=0
```

### **Чтение на фронте (файл `grpcClient.js`, строки 420-510):**

```javascript
const reader = response.body.getReader();
let buffer = new Uint8Array(0);

while (true) {
  const { done, value } = await reader.read();
  
  if (done) break;
  
  // Добавляем chunk к буферу
  buffer = concatenate(buffer, value);
  
  // Парсим все доступные сообщения
  while (buffer.length >= 5) {
    const compressedFlag = buffer[0];
    const messageLength = (buffer[1] << 24) | (buffer[2] << 16) | 
                          (buffer[3] << 8) | buffer[4];
    
    if (buffer.length < 5 + messageLength) break; // Ждём больше данных
    
    const messageBytes = buffer.slice(5, 5 + messageLength);
    buffer = buffer.slice(5 + messageLength);
    
    const message = this.decodeGraphPartResponse(messageBytes);
    this._handleStreamMessage(message, callbacks);
  }
}
```

### **Обработка сообщений:**

```javascript
_handleStreamMessage(message, callbacks) {
  switch (message.status) {
    case GraphStatus.START:
      console.log('🎬 Анализ начался');
      callbacks.onStart?.();
      break;
      
    case GraphStatus.REQUIREMENTS:
      console.log('📋 Requirements получены:', message.requirements.length);
      callbacks.onRequirements?.(message);
      break;
      
    case GraphStatus.ENDPOINTS:
      console.log('🔗 Endpoints получены:', Object.keys(message.endpoints).length);
      callbacks.onEndpoints?.(message);
      break;
      
    case GraphStatus.ARCHITECTURE:
      console.log('🏗️ Architecture часть:', message.parent);
      callbacks.onArchitecture?.(message);
      break;
      
    case GraphStatus.DONE:
      console.log('✅ Анализ завершён');
      // НЕ вызываем callback здесь - он вызывается после проверки
      break;
  }
}
```

### **Логи при получении (Console):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 ПОЛУЧЕН ОТВЕТ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 HTTP Status: 200 OK
📊 response.ok: true
📦 Response Headers:
  • Content-Type: application/grpc-web+proto
  • grpc-status: null (будет в trailers)
  • transfer-encoding: chunked
📖 Response body exists: true
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ gRPC соединение установлено, читаем бинарный stream...

📦 Chunk #1: {done: false, valueLength: 256, bufferLength: 256}
🔍 Frame header: {compressedFlag: 0, messageLength: 42, bufferAvailable: 256}
✂️ Извлечено сообщение: 42 bytes, осталось в буфере: 209

📬 Получено сообщение #1: {
  status: 'START',
  response_id: 1
}

📦 Chunk #2: {done: false, valueLength: 512, bufferLength: 721}
📬 Получено сообщение #2: {
  status: 'REQUIREMENTS',
  requirements: ['fastapi', 'sqlalchemy', ...]
}

... (еще сообщения)

📬 Получено сообщение #15: {
  status: 'DONE',
  response_id: 15
}
✅ Получен статус DONE - stream завершён успешно

📭 Stream завершён. Получено чанков: 8, сообщений: 15
✅ Stream завершён корректно, всего сообщений: 15
```

---

## ⚠️ КРИТИЧЕСКАЯ ПРОВЕРКА: Статус DONE

### **Почему это важно:**

Stream считается успешным **ТОЛЬКО** если получен `status=DONE`.

### **Файл:** `grpcClient.js` (строки 514-530)

```javascript
// Проверяем, был ли получен статус DONE
if (!receivedDone) {
  console.error('❌ Stream оборвался до получения статуса DONE');
  const error = new Error(
    `Stream прерван преждевременно.\n\n` +
    `Получено сообщений: ${messageCount}\n` +
    `Статус DONE не получен.\n\n` +
    `Возможные причины:\n` +
    `• Ошибка в алгоритме анализа на сервере\n` +
    `• Таймаут обработки\n` +
    `• Проблема с файлом проекта\n` +
    `• Недостаточно памяти на сервере`
  );
  callbacks.onError?.(error);
  return;
}

// Только если получен DONE - вызываем onDone
callbacks.onDone?.();
```

### **Что проверить на backend:**

1. **Отправляется ли DONE?**
   ```python
   # В конце алгоритма RunAlgorithm должно быть:
   yield GraphPartResponse(
       status=GraphStatus.DONE,
       response_id=final_id
   )
   ```

2. **Логи Core сервиса:**
   ```bash
   docker logs -f core-service | grep -A 20 "RunAlgorithm"
   ```

3. **Есть ли исключения?**
   ```bash
   docker logs -f core-service | grep -i "traceback\|exception\|error"
   ```

---

## 💾 ШАГ 4: Завершение и переход к визуализации

### **Когда происходит:**

После получения `DONE` статуса от gRPC stream.

### **Что происходит:**

1. **Backend уже сохранил архитектуру** во время gRPC stream (внутри алгоритма `RunAlgorithm`)
2. **Frontend получает DONE** → все данные уже в state
3. **Frontend переходит на страницу визуализации:** `/projects/view/{id}`

### **Файл:** `ProjectAnalysis.jsx`

```javascript
onDone: () => {
  console.log('✅ gRPC Stream завершён успешно');
  setStreamComplete(true);
  setStatus('completed');
  
  // НЕ нужно PATCH - backend уже сохранил всё!
  // Просто переходим на страницу визуализации
  navigate(`/projects/view/${projectId}`);
}
```

### **Важно:**

**Backend должен сохранять архитектуру в БД во время gRPC stream**, а не ждать PATCH запроса от фронтенда.

**В конце `RunAlgorithm` на backend:**

```python
async def RunAlgorithm(self, request, context):
    try:
        # ... анализ проекта ...
        
        # Отправляем все данные через stream
        yield GraphPartResponse(status=GraphStatus.REQUIREMENTS, requirements=req_list)
        yield GraphPartResponse(status=GraphStatus.ENDPOINTS, endpoints=endpoints_dict)
        for parent, children in architecture_tree.items():
            yield GraphPartResponse(status=GraphStatus.ARCHITECTURE, parent=parent, children=children)
        
        # ВАЖНО: Сохраняем в БД ПЕРЕД отправкой DONE
        await db.execute(
            "UPDATE projects SET architecture = $1 WHERE id = $2",
            json.dumps({
                "requirements": req_list,
                "endpoints": endpoints_dict,
                "data": architecture_tree
            }),
            request.task_id
        )
        
        # Только после сохранения отправляем DONE
        yield GraphPartResponse(status=GraphStatus.DONE, response_id=final_count)
        logger.info(f"[RunAlgorithm] Architecture saved and DONE sent for task_id={request.task_id}")
        
    except Exception as e:
        logger.error(f"[RunAlgorithm] ERROR: {e}", exc_info=True)
        context.set_code(grpc.StatusCode.INTERNAL)
        context.set_details(str(e))
```

**Таким образом:**
- ✅ Backend сам сохраняет результаты
- ✅ Frontend просто отображает полученные данные
- ✅ Нет необходимости в PATCH запросе
- ✅ Нет race conditions (данные сохранены до DONE)

---

## 🔥 ТЕКУЩАЯ ПРОБЛЕМА: ERR_EMPTY_RESPONSE

### **Что показывает консоль:**

```
POST http://localhost:5173/grpc/core.api.FrontendStreamService/RunAlgorithm 
net::ERR_EMPTY_RESPONSE

❌ Ошибка: TypeError: Failed to fetch
```

**Тестовый запрос через консоль:**
```javascript
👤 User ID: 9
📋 Project ID: 242
📦 Request payload (hex): 0x08, 0x09, 0x10, 0xf2, 0x01
Promise {<pending>}
```

### **На каком этапе падает:**

**ШАГ 2: gRPC Stream запрос**

1. ✅ **ШАГ 1 работает** - проект создаётся через `POST /v1/project`
2. ✅ **Backend возвращает `project_id`** - frontend получает ID
3. ❌ **ШАГ 2 падает** - gRPC запрос на `RunAlgorithm` возвращает ERR_EMPTY_RESPONSE
4. ❌ **Backend вообще НЕ отвечает** (даже не 504, а полное отсутствие ответа)

### **Что это означает:**

1. **Запрос отправляется** с фронтенда корректно (бинарный Protobuf формат правильный)
2. **Проходит через Vite dev proxy** (`localhost:5173/grpc` → `http://78.153.139.47:8080`)
3. ❌ **Vite proxy НЕ получает НИЧЕГО от Envoy** (даже не HTTP заголовки)
4. ❌ **Соединение обрывается мгновенно** → ERR_EMPTY_RESPONSE

**Возможные причины:**
- 🔴 Envoy proxy не работает / не отвечает на порту 8080
- 🔴 Envoy не знает роут `/core.api.FrontendStreamService/RunAlgorithm`
- 🔴 Core gRPC service недоступен для Envoy (сеть/DNS)
- 🔴 Core gRPC service не запущен / не слушает порт 50051
- 🔴 Core gRPC service не зарегистрировал `FrontendStreamService`

### **Что исправлено на фронте:**

```javascript
// vite.config.js
'/grpc': {
  target: 'http://78.153.139.47:8080',
  timeout: 300000,      // 5 минут
  proxyTimeout: 300000, // 5 минут
  // ...
}

// .env
VITE_GRPC_TIMEOUT_MS=300000  // 5 минут
```

### **Что нужно проверить на backend:**

1. **Доходит ли запрос до Envoy?**
   ```bash
   docker logs -f envoy | grep "RunAlgorithm"
   ```

2. **Доходит ли запрос до Core service?**
   ```bash
   docker logs -f core-service | grep "RunAlgorithm\|user_id=17\|task_id=16"
   ```

3. **Начинает ли backend обработку?**
   ```python
   # Добавьте логи в начале RunAlgorithm:
   logger.info(f"[RunAlgorithm] START user_id={request.user_id} task_id={request.task_id}")
   
   # И в конце:
   logger.info(f"[RunAlgorithm] DONE user_id={request.user_id} task_id={request.task_id}")
   ```

4. **Отправляется ли первое сообщение START?**
   ```python
   # В начале алгоритма:
   yield GraphPartResponse(status=GraphStatus.START, response_id=1)
   logger.info("[RunAlgorithm] Sent START message")
   ```

5. **Завершается ли алгоритм или зависает?**
   ```bash
   # Проверить, есть ли долгие операции:
   docker stats core-service
   # CPU usage высокий = вычисления идут
   # CPU 0% = зависло/ждёт чего-то
   ```

---

## 🐛 Чек-лист для backend-разработчиков

### ✅ Проверка 1: Endpoint доступен

```bash
# Проверить что Envoy отвечает на health check
curl http://78.153.139.47:8080/health

# Проверить что Core service работает
docker ps | grep core-service
```

### ✅ Проверка 2: Запрос доходит до Core

```bash
# Включить debug логи в Core service
docker logs -f core-service --since 1m | grep -i "algorithm\|grpc\|request"
```

### ✅ Проверка 3: Проект создан и файл загружен

```sql
SELECT id, author_id, name, files_url, picture_url, architecture 
FROM projects 
WHERE id = 16;
```

**Ожидаем:**
- `id = 16` существует (создан через POST)
- `author_id = 17` (совпадает с user_id)
- `files_url` или `picture_url` не NULL (файл загружен в S3)
- `architecture` пустой `{}` или NULL (заполняется после анализа)

### ✅ Проверка 4: Файл проекта доступен в S3

```bash
# Получить путь файла из БД
psql -c "SELECT picture_url FROM projects WHERE id = 16;"

# Проверить что файл в S3 существует
aws s3 ls s3://bucket-name/projects/16.zip

# Или через Python:
import boto3
s3 = boto3.client('s3')
s3.head_object(Bucket='bucket-name', Key='projects/16.zip')

# Попробовать скачать файл
aws s3 cp s3://bucket-name/projects/16.zip /tmp/test.zip
file /tmp/test.zip  # Должен быть: Zip archive data
```

### ✅ Проверка 5: Алгоритм не падает с exception

```python
# В RunAlgorithm добавить try/except:
async def RunAlgorithm(self, request, context):
    try:
        logger.info(f"[RunAlgorithm] START user={request.user_id} task={request.task_id}")
        
        # Отправляем START сразу
        yield GraphPartResponse(status=GraphStatus.START, response_id=1)
        
        # ... весь алгоритм ...
        
        # Отправляем DONE в конце
        yield GraphPartResponse(status=GraphStatus.DONE, response_id=final_count)
        logger.info(f"[RunAlgorithm] DONE sent")
        
    except Exception as e:
        logger.error(f"[RunAlgorithm] ERROR: {e}", exc_info=True)
        context.set_code(grpc.StatusCode.INTERNAL)
        context.set_details(str(e))
```

### ✅ Проверка 6: Stream отправляет DONE

```bash
# После завершения алгоритма должна быть строка в логах:
docker logs -f core-service | grep "DONE sent"
```

---

## 📊 Ожидаемые логи (успешный сценарий)

### **Backend (FastAPI Service):**

```
[INFO] POST /v1/project?name=My Project&description=Test project
[INFO] User ID from JWT: 17
[INFO] Uploading file to S3: projects/16.zip (size: 1.2MB)
[INFO] S3 upload completed: https://storage.yandexcloud.net/bucket/projects/16.zip
[INFO] Project created: id=16, author_id=17
[INFO] Response 200: {"id": 16, "name": "My Project", ...}
```

### **Backend (Core Service):**

```
[INFO] [RunAlgorithm] START user_id=17 task_id=16
[INFO] Loading project from DB: project_id=16
[INFO] File URL from DB: https://storage.yandexcloud.net/bucket/projects/16.zip
[INFO] Downloading file from S3: projects/16.zip
[INFO] File downloaded: 1.2MB
[INFO] Extracting archive: /tmp/project-16/
[INFO] Extracted files: 42 files
[INFO] [RunAlgorithm] Sent START message
[INFO] Analyzing requirements...
[INFO] Found requirements: 15 packages
[INFO] [RunAlgorithm] Sent REQUIREMENTS message (15 requirements)
[INFO] Analyzing endpoints...
[INFO] Found endpoints: 8 routes
[INFO] [RunAlgorithm] Sent ENDPOINTS message (8 endpoints)
[INFO] Building architecture tree...
[INFO] [RunAlgorithm] Sent ARCHITECTURE message: parent=main.py
[INFO] [RunAlgorithm] Sent ARCHITECTURE message: parent=api/
... (еще ARCHITECTURE сообщения)
[INFO] Saving architecture to DB: project_id=16
[INFO] Architecture saved successfully
[INFO] [RunAlgorithm] Sent DONE message
[INFO] [RunAlgorithm] Stream completed successfully
```

### **Frontend (Browser Console):**

```
📤 Создание нового проекта через REST API
✅ Проект создан: {"id": 16, "name": "My Project", ...}

📡 Запуск gRPC stream для анализа проекта
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 ОТПРАВКА gRPC ЗАПРОСА
🌐 URL: http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: 17
📋 Task ID: 16
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 ПОЛУЧЕН ОТВЕТ
📊 HTTP Status: 200 OK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📬 Получено сообщение #1: {status: 'START'}
🎬 Анализ начался

📬 Получено сообщение #2: {status: 'REQUIREMENTS'}
📋 Requirements получены: 42

📬 Получено сообщение #3: {status: 'ENDPOINTS'}
🔗 Endpoints получены: 15

📬 Получено сообщение #4: {status: 'ARCHITECTURE', parent: 'main.py'}
🏗️ Architecture часть получена: main.py
... (еще ARCHITECTURE сообщения)

📬 Получено сообщение #15: {status: 'DONE'}
✅ Получен статус DONE - stream завершён успешно
✅ gRPC Stream завершён
💾 Архитектура сохранена в БД
```

---

## 🆘 Если проблема сохраняется

### **Шаги диагностики:**

1. **Запустите фронт с увеличенным timeout** (уже сделано)
   ```bash
   npm run dev
   ```

2. **Откройте браузер с Network логами:**
   - DevTools → Network → Фильтр: `RunAlgorithm`
   - Смотрите: Status, Time, Response

3. **Параллельно смотрите логи backend:**
   ```bash
   docker logs -f core-service
   docker logs -f envoy
   ```

4. **Если запрос НЕ доходит до Core:**
   - Проблема в Envoy routing
   - Проверьте `envoy.yaml` конфигурацию

5. **Если запрос доходит, но timeout:**
   - Алгоритм работает слишком долго (>5 минут)
   - Добавьте промежуточные yield для прогресс-индикации
   - Оптимизируйте алгоритм анализа

6. **Если exception в алгоритме:**
   - Смотрите traceback в логах
   - Проверьте `files_url` и доступность файла
   - Проверьте формат архива (должен быть .zip)

---

## 📞 Контакты для вопросов

- **Frontend репо:** https://github.com/PiaPav/frontend
- **Ветка:** main
- **Frontend dev:** PiaPav

**Вопросы по интеграции:**
- Файлы для проверки: `src/services/grpcClient.js`, `src/pages/Projects/ProjectAnalysis.jsx`
- Console logs: Открыть DevTools → Console (все логи с префиксами 🌐📡📬)
