# 📘 Правильное использование gRPC-клиента

## Дата: 2025-12-07

---

## ❌ Частые ошибки при тестировании

### Ошибка 1: Открытие REST эндпоинта в браузере

**❌ НЕПРАВИЛЬНО:**
```
http://localhost:5173/v1/project/322
```

**Что происходит:**
- Vite proxy перехватывает `/v1/*`
- Запрос идёт напрямую на бэкенд `http://78.153.139.47:8000/v1/project/322`
- Браузер получает JSON от FastAPI
- **React-код вообще не монтируется!**
- gRPC stream НЕ запускается

**✅ ПРАВИЛЬНО:**
```
http://localhost:5173/projects/322
                     ^^^^^^^^^ React Router маршрут!
```

---

### Ошибка 2: Открытие gRPC эндпоинта в браузере

**❌ НЕПРАВИЛЬНО:**
```
http://localhost:5173/grpc/core.api.FrontendStreamService/RunAlgorithm
```

**Что происходит:**
- Браузер делает GET запрос
- gRPC ожидает POST с binary Protobuf
- Connection висит → "вечная загрузка"

**Это нормально!** gRPC-эндпоинты не для прямого открытия в браузере.

**✅ ПРАВИЛЬНО:**
gRPC вызывается из JavaScript кода:
```javascript
const request = new AlgorithmRequest();
request.setUserId(userId);
request.setTaskId(taskId);

const stream = client.runAlgorithm(request, {});
```

---

## ✅ Правильный поток работы

### 1. Пользователь открывает страницу проекта

```
http://localhost:5173/projects/322
```

### 2. React Router монтирует компонент

**Например:** `ProjectAnalysis.jsx` или `ProjectView.jsx`

### 3. Компонент делает REST запрос

```javascript
useEffect(() => {
  // Загружаем метаданные проекта
  const fetchProject = async () => {
    const response = await fetch(`/v1/project/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    setProject(data);
  };
  
  fetchProject();
}, [id]);
```

**Запрос:**
```
GET http://localhost:5173/v1/project/322
→ Vite proxy →
GET http://78.153.139.47:8000/v1/project/322
```

**Ответ:**
```json
{
  "id": 322,
  "name": "My Project",
  "architecture": {
    "requirements": [...],
    "endpoints": {...},
    "data": {...}
  }
}
```

### 4. Если архитектуры нет → запускаем gRPC stream

```javascript
useEffect(() => {
  if (!project) return;
  
  // Проверяем, нужен ли анализ
  if (!project.architecture?.data || Object.keys(project.architecture.data).length === 0) {
    console.log('Архитектуры нет, запускаем анализ...');
    
    const ctrlPromise = grpcClient.connectToStream(
      user.id, 
      project.id, 
      {
        onRequirements: (data) => {
          console.log('Получены requirements:', data.requirements);
          setRequirements(data.requirements);
        },
        onEndpoints: (data) => {
          console.log('Получены endpoints:', data.endpoints);
          setEndpoints(data.endpoints);
        },
        onArchitecture: (data) => {
          console.log('Получен узел графа:', data.parent, '→', data.children);
          // Добавляем в граф
          addNode(data.parent, data.children);
        },
        onDone: () => {
          console.log('Анализ завершён!');
          setAnalysisComplete(true);
          // Сохраняем через REST
          saveArchitecture();
        },
        onError: (error) => {
          console.error('Ошибка анализа:', error);
          setError(error.message);
        }
      }
    );
    
    // Сохраняем controller для отмены
    let ctrl = null;
    ctrlPromise.then(c => { ctrl = c; });
    
    return () => {
      console.log('Компонент размонтируется, отменяем stream');
      ctrl?.abort(); // ✅ Теперь работает!
    };
  }
}, [project?.id, project?.architecture]);
```

**Запрос:**
```
POST http://localhost:5173/grpc/core.api.FrontendStreamService/RunAlgorithm
→ Vite proxy (rewrite: убирает /grpc) →
POST http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm
→ Envoy (транслирует gRPC-Web → gRPC) →
gRPC core-service:50051
```

**Ответ (stream):**
```
GraphPartResponse { status: REQUIREMENTS, graph_requirements: {...} }
GraphPartResponse { status: ENDPOINTS, graph_endpoints: {...} }
GraphPartResponse { status: ARHITECTURE, graph_architecture: {...} }
GraphPartResponse { status: ARHITECTURE, graph_architecture: {...} }
...
GraphPartResponse { status: DONE, graph_architecture: {parent: "", children: ""} }
```

---

## 🧪 Как правильно тестировать

### 1. Запустите dev сервер

```powershell
npm run dev
```

### 2. Откройте правильный URL

```
http://localhost:5173/projects/322
                     ^^^^^^^^^ НЕ /v1/project/322!
```

### 3. Откройте DevTools (F12)

#### В Network вкладке должны быть:

**REST запрос:**
```
GET /v1/project/322
Status: 200 OK
Response: {"id": 322, "name": "...", ...}
```

**gRPC запрос (если архитектуры нет):**
```
POST /grpc/core.api.FrontendStreamService/RunAlgorithm
Status: 200 OK
Type: grpc-web+proto
```

#### В Console должны быть:

```
[grpc] init (NEW IMPLEMENTATION) {envoyUrl: '/grpc', ...}
[grpc] 🔧 DEV MODE: используем proxy /grpc для избежания CORS
📡 Подключение к gRPC стриму: user_id=1, task_id=322
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 ОТПРАВКА gRPC ЗАПРОСА (NEW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 URL: /grpc/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: 1
📋 Task ID: 322
📦 Using generated proto classes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 Получено сообщение #1: {status: 'REQUIREMENTS', response_id: 1}
📋 REQUIREMENTS - получено 5 зависимостей
📬 Получено сообщение #2: {status: 'ENDPOINTS', response_id: 2}
🔗 ENDPOINTS - получено 12 эндпоинтов
📬 Получено сообщение #3: {status: 'ARHITECTURE', response_id: 3}
🏗️ ARHITECTURE - узел main с 3 детьми
...
📬 Получено сообщение #N: {status: 'DONE', response_id: N}
✅ Получен статус DONE - stream завершён успешно
📭 Stream завершён. Получено сообщений: N
✅ Stream завершён корректно
```

---

## 🔍 Диагностика проблем

### Проблема: gRPC stream не запускается

**Симптомы:**
- В Network нет POST запроса на `/grpc/core.api.FrontendStreamService/RunAlgorithm`
- В консоли нет логов `[grpc]`

**Причины:**

1. **Компонент не вызывает `connectToStream`**
   - Проверьте условие в `useEffect`
   - Убедитесь что `project.architecture.data` пустой

2. **Неправильный маршрут**
   - Вы открыли `/v1/project/322` вместо `/projects/322`
   - React вообще не запустился

3. **Зависимости useEffect**
   - Не добавлены `project?.id` или `user?.id`
   - useEffect не перезапускается

**Решение:**
```javascript
useEffect(() => {
  console.log('🔍 Проверка условий:', {
    hasProject: !!project,
    hasUser: !!user,
    needsAnalysis: !project?.architecture?.data || 
                   Object.keys(project?.architecture?.data || {}).length === 0
  });
  
  if (!project || !user) return;
  
  if (!project.architecture?.data || Object.keys(project.architecture.data).length === 0) {
    console.log('✅ Запускаем gRPC анализ');
    // connectToStream(...)
  } else {
    console.log('ℹ️ Архитектура уже есть, анализ не нужен');
  }
}, [project?.id, user?.id, project?.architecture]);
```

---

### Проблема: "UNIMPLEMENTED" ошибка

**Симптомы:**
```
❌ gRPC stream error: {code: 12, message: "UNIMPLEMENTED"}
```

**Причина:** Клиент бьёт не в тот сервис/метод

**Проверьте:**

1. **URL в запросе:** Должен быть точно
   ```
   /core.api.FrontendStreamService/RunAlgorithm
   ```

2. **Класс клиента:** Должен совпадать с proto
   ```javascript
   // В api_core_grpc_web_pb.js:
   export class SimpleFrontendStreamServiceClient {
     runAlgorithm(request, metadata) {
       const url = `${this.hostname}/core.api.FrontendStreamService/RunAlgorithm`;
       //                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       //                           Должно совпадать с proto!
     }
   }
   ```

3. **В core.proto:**
   ```protobuf
   package core.api;
   
   service FrontendStreamService {
     rpc RunAlgorithm(...) returns (stream ...);
   }
   ```

---

### Проблема: CORS ошибка

**Симптомы:**
```
Access to fetch at 'http://78.153.139.47:8080/...' from origin 'http://localhost:5173' 
has been blocked by CORS policy
```

**Причина:** В dev режиме не используется proxy

**Решение:**

Проверьте в `grpcClient.js`:
```javascript
const isDev = import.meta.env?.DEV;
const shouldUseProxy = isDev && (!envGrpcUrl || envGrpcUrl.includes('78.153.139.47'));

if (shouldUseProxy) {
  this.envoyUrl = '/grpc';  // ✅ Должно быть в dev
}
```

И в консоли:
```
[grpc] init (NEW IMPLEMENTATION) {envoyUrl: '/grpc', ...}
[grpc] 🔧 DEV MODE: используем proxy /grpc для избежания CORS
```

Если видите:
```
{envoyUrl: 'http://78.153.139.47:8080', ...}
```

Значит proxy не активировался → будут CORS ошибки.

---

## 📝 Итоговый чек-лист

### Перед тестированием:

- ✅ `npm run dev` запущен
- ✅ Backend запущен (`docker-compose up`)
- ✅ Envoy доступен на порту 8080

### При тестировании:

- ✅ Открываю `/projects/322` (НЕ `/v1/project/322`)
- ✅ DevTools → Network открыт
- ✅ Console открыта для логов

### Что должно быть:

- ✅ GET `/v1/project/322` → 200 OK
- ✅ POST `/grpc/core.api.FrontendStreamService/RunAlgorithm` → 200 OK
- ✅ В консоли логи `[grpc]` и статусы REQUIREMENTS/ENDPOINTS/ARHITECTURE/DONE
- ✅ Нет CORS ошибок
- ✅ Нет UNIMPLEMENTED ошибок

### Если что-то не работает:

1. **Проверьте маршрут** - вы на `/projects/322`?
2. **Проверьте условие** - `useEffect` вызывает `connectToStream`?
3. **Проверьте Network** - есть POST на `/grpc/...`?
4. **Проверьте Console** - какая ошибка?
5. **Проверьте backend логи** - `docker logs -f core-service`

---

## 🎯 Главное правило

**❌ НЕ открывайте gRPC/REST эндпоинты напрямую в браузере!**

**✅ Открывайте React маршруты, которые внутри вызывают API.**

```
http://localhost:5173/projects/322  ← Это правильно!
                     ^^^^^^^^
                     React Router
```

---

**Документация обновлена:** 2025-12-07 ✅
