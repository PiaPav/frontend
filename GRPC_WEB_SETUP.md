# 🚀 Миграция на grpc-web с генерацией из .proto

## Шаг 1: Установка зависимостей

```bash
npm install google-protobuf
```

Или если у вас yarn:
```bash
yarn add google-protobuf
```

**Проверка:** `grpc-web` уже установлен в package.json ✅

## Шаг 2: Установка protoc и protoc-gen-grpc-web

### Windows:

1. **Скачать protoc:**
   - Перейти на https://github.com/protocolbuffers/protobuf/releases
   - Скачать `protoc-{version}-win64.zip`
   - Распаковать в `C:\protoc`
   - Добавить `C:\protoc\bin` в PATH

2. **Скачать protoc-gen-grpc-web:**
   - Перейти на https://github.com/grpc/grpc-web/releases
   - Скачать `protoc-gen-grpc-web-{version}-windows-x86_64.exe`
   - Переименовать в `protoc-gen-grpc-web.exe`
   - Положить в `C:\protoc\bin`

3. **Проверка:**
```bash
protoc --version
protoc-gen-grpc-web --version
```

### Mac/Linux (Homebrew):

```bash
brew install protobuf
brew install protoc-gen-grpc-web
```

## Шаг 3: Подготовка proto файлов

Скопировать proto файлы из backend:

```bash
# Создать папку для proto
mkdir backend-proto
mkdir backend-proto\proto
mkdir backend-proto\proto\api
mkdir backend-proto\proto\shared

# Скопировать файлы из backend
# Нужно скопировать:
# - backend-main/proto/api/core.proto → backend-proto/proto/api/core.proto
# - backend-main/proto/shared/common.proto → backend-proto/proto/shared/common.proto
```

## Шаг 4: Генерация JS клиента

Из корня frontend выполнить:

```bash
protoc -I=backend-proto/proto \
  --js_out=import_style=commonjs:src/grpc \
  --grpc-web_out=import_style=commonjs,mode=grpcwebtext:src/grpc \
  backend-proto/proto/api/core.proto \
  backend-proto/proto/shared/common.proto
```

**Результат:** В `src/grpc/` появятся файлы:
- `api_core_pb.js` - классы сообщений
- `api_core_grpc_web_pb.js` - gRPC-Web клиент
- `shared_common_pb.js` - общие типы (ParseStatus и т.д.)

## Шаг 5: Заменить grpcClient.js

Файл уже подготовлен! Просто раскомментируйте новый код.

## Шаг 6: Тестирование

После генерации proto файлов:

1. Запустите dev сервер: `npm run dev`
2. Создайте новый проект
3. Проверьте в консоли логи `[grpc-web]`

## ✅ Что изменится

### Было (ручная работа):
```javascript
encodeAlgorithmRequest(userId, taskId) {
  const buffer = [];
  buffer.push(0x08); // вручную собираем байты
  this.writeVarint(buffer, userId);
  // ...
}
```

### Стало (grpc-web):
```javascript
const request = new AlgorithmRequest();
request.setUserId(userId);
request.setTaskId(taskId);
const stream = this.client.runAlgorithm(request, metadata);
```

## 📦 Структура после миграции

```
frontend/
├── backend-proto/
│   └── proto/
│       ├── api/
│       │   └── core.proto
│       └── shared/
│           └── common.proto
├── src/
│   ├── grpc/
│   │   ├── api_core_pb.js          (сгенерировано)
│   │   ├── api_core_grpc_web_pb.js (сгенерировано)
│   │   └── shared_common_pb.js     (сгенерировано)
│   └── services/
│       └── grpcClient.js           (обновлено)
└── package.json
```

## 🔧 Troubleshooting

### Ошибка "protoc not found"
- Убедитесь что protoc добавлен в PATH
- Перезапустите терминал после установки

### Ошибка "cannot find module '../grpc/api_core_pb'"
- Проверьте что proto файлы сгенерированы в `src/grpc/`
- Проверьте пути в импортах

### CORS ошибки
- Убедитесь что в dev режиме используется proxy `/grpc`
- Проверьте `vite.config.js` настройки proxy
