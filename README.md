# React + Vite - Code Architecture Visualization

Фронтенд для визуализации архитектуры кодовых проектов с интеграцией gRPC streaming анализа.

## 🚀 Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск dev сервера
npm run dev

# Открыть http://localhost:5173
```

## 🔧 Важные файлы

### Документация:
- **`GRPC_FIX_README.md`** - ⭐ **НАЧНИТЕ ЗДЕСЬ** - инструкции по gRPC интеграции
- **`FLOW_DIAGRAM_FOR_BACKEND.md`** - полная документация для backend команды
- **`BACKEND_INTEGRATION.md`** - REST API интеграция
- **`DEBUGGING_500.md`** - отладка ошибок

### Тестирование:
- **`test-grpc-console.js`** - скрипт для тестирования gRPC в консоли браузера

### Ключевые модули:
- `src/services/grpcClient.js` - gRPC-Web клиент с ручным Protobuf парсингом
- `src/services/api.js` - REST API клиент (axios)
- `src/pages/Projects/ProjectAnalysis.jsx` - страница анализа проекта
- `src/pages/Projects/ProjectViewArchitecture.jsx` - визуализация архитектуры

## 📡 Backend Integration

### REST API (FastAPI на порту 8000)
```
POST /v1/project           - Создание проекта (multipart/form-data)
GET  /v1/project/{id}      - Получение метаданных проекта
GET  /v1/project           - Список проектов
PATCH /v1/project/{id}     - Обновление проекта
DELETE /v1/project/{id}    - Удаление проекта
```

### gRPC Stream (Core на порту 50051 через Envoy 8080)
```
/core.api.FrontendStreamService/RunAlgorithm
Запрос:  AlgorithmRequest {user_id: int64, task_id: int64}
Ответ:   Server Stream GraphPartResponse
Статусы: START → REQUIREMENTS → ENDPOINTS → ARHITECTURE → DONE
```

## 🧪 Тестирование gRPC

### Вариант 1: Через консоль браузера
```javascript
// 1. Откройте DevTools → Console
// 2. Вставьте содержимое test-grpc-console.js
// 3. Запустите:
testGrpcConnection(9, 242) // user_id=9, project_id=242
```

### Вариант 2: Через UI
1. Создайте новый проект (загрузите .zip)
2. Откройте DevTools → Console
3. Наблюдайте логи gRPC stream:
```
📤 ОТПРАВКА gRPC ЗАПРОСА
📬 Message #1: status=START
📬 Message #2: status=REQUIREMENTS
...
📬 Message #N: status=DONE
✅ Stream завершён успешно
```

## Project Demos

This project includes several architecture visualization demos:

### Architecture Demo (New!)
**URL:** `/projects/demo-1/architecture`

An improved architecture visualization that:
- ✅ Shows Requirements with proper contrast (dark text on light background)
- ✅ Displays API Endpoints grouped by service
- ✅ Shows Legend with clear service color coding
- ✅ Excludes Health checks from visualization
- ✅ Left-to-right layout inspired by Graphviz
- ✅ Clean, professional design with gradients

**Features:**
- Requirements sidebar with all project dependencies
- Interactive graph with service nodes and connections
- Color-coded services (Account, Project, Database, Core)
- API endpoints panel showing HTTP methods and paths
- Node details on click
- Smooth streaming animation

### Other Demos
- **Demo 1:** `/projects/demo-1` - E-Commerce Platform visualization
- **Demo 2:** `/projects/demo-1/v2` - With file tree structure
- **Demo 3:** `/projects/demo-1/detailed` - Detailed view
- **Stream Demo:** `/projects/demo-1/stream` - Original streaming visualization

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
