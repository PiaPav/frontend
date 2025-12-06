# 🚀 Миграция на grpc-web - Пошаговая инструкция

## ✅ Текущий статус

Подготовлено всё необходимое для миграции на официальный grpc-web с генерацией из proto файлов.

## 📋 Что нужно сделать

### Шаг 1: Установить google-protobuf

```bash
# В PowerShell с правами администратора или через Git Bash
npm install google-protobuf
```

**Результат:** В `package.json` появится `google-protobuf`

### Шаг 2: Установить инструменты (один раз на машине)

#### Windows:

1. **protoc** (Protocol Buffers Compiler):
   ```
   1. Скачать: https://github.com/protocolbuffers/protobuf/releases
   2. Найти: protoc-{version}-win64.zip (например protoc-25.1-win64.zip)
   3. Распаковать в C:\protoc
   4. Добавить C:\protoc\bin в PATH:
      - Win+R → sysdm.cpl → Дополнительно → Переменные среды
      - Path → Изменить → Создать → C:\protoc\bin
   ```

2. **protoc-gen-grpc-web** (gRPC-Web Plugin):
   ```
   1. Скачать: https://github.com/grpc/grpc-web/releases
   2. Найти: protoc-gen-grpc-web-{version}-windows-x86_64.exe
   3. Переименовать в: protoc-gen-grpc-web.exe
   4. Положить в: C:\protoc\bin
   ```

3. **Проверка** (перезапустите терминал):
   ```bash
   protoc --version
   # Должно вывести: libprotoc 25.x или выше
   
   protoc-gen-grpc-web --version
   # Должно вывести версию плагина
   ```

#### Mac/Linux:

```bash
brew install protobuf
brew install protoc-gen-grpc-web

# Проверка
protoc --version
protoc-gen-grpc-web --version
```

### Шаг 3: Скопировать proto файлы из backend

Нужны 2 файла из backend репозитория:
- `proto/api/core.proto`
- `proto/shared/common.proto`

#### Вариант A: Если backend рядом

```bash
# Создать структуру
mkdir backend-proto
mkdir backend-proto\proto
mkdir backend-proto\proto\api
mkdir backend-proto\proto\shared

# Скопировать файлы
copy ..\backend-main\proto\api\core.proto backend-proto\proto\api\
copy ..\backend-main\proto\shared\common.proto backend-proto\proto\shared\
```

#### Вариант B: Скопировать вручную

Создать папки и файлы:
```
frontend/
  backend-proto/
    proto/
      api/
        core.proto      <- скопировать из backend
      shared/
        common.proto    <- скопировать из backend
```

### Шаг 4: Сгенерировать JS клиент

#### Windows:

```bash
.\generate-proto.bat
```

#### Mac/Linux:

```bash
chmod +x generate-proto.sh
./generate-proto.sh
```

**Результат:** В `src/grpc/` появятся файлы:
- `api_core_pb.js` - классы сообщений (AlgorithmRequest, GraphPartResponse)
- `api_core_grpc_web_pb.js` - gRPC-Web клиент (FrontendStreamServiceClient)
- `shared_common_pb.js` - общие типы (ParseStatus enum)

### Шаг 5: Заменить grpcClient.js

```bash
# Бэкап старого файла
copy src\services\grpcClient.js src\services\grpcClient-old.js

# Заменить на новую версию
copy src\services\grpcClient-grpc-web.js src\services\grpcClient.js
```

Или просто переименовать файлы в VS Code.

### Шаг 6: Запустить и протестировать

```bash
npm run dev
```

Открыть http://localhost:5173 и:
1. Создать новый проект
2. Проверить консоль браузера - должны быть логи `[grpc-web]`
3. Убедиться что анализ работает

## 🔍 Проверка работы

### Правильные логи в консоли:

```
[grpc-web] init { envoyUrl: '/grpc', ... }
[grpc-web] 🔧 DEV MODE: используем proxy /grpc для избежания CORS
[grpc-web] ✅ Используется относительный URL (proxy)
📡 [grpc-web] Подключение к RunAlgorithm: user_id=9, task_id=273
[grpc-web] Старт стрима runAlgorithm
📬 [grpc-web] msg #1 { status: 'START', ... }
📋 REQUIREMENTS - получено X зависимостей
🔗 ENDPOINTS - получено Y эндпоинтов
🏗️ ARHITECTURE - узел ...
✅ DONE - анализ завершён
```

### Возможные ошибки:

#### "Cannot find module '../grpc/api_core_pb'"
**Причина:** Не сгенерированы proto файлы  
**Решение:** Выполнить Шаг 4 (generate-proto)

#### "protoc not found"
**Причина:** protoc не установлен или не в PATH  
**Решение:** Выполнить Шаг 2, перезапустить терминал

#### CORS ошибки
**Причина:** Не работает proxy  
**Решение:** Проверить `vite.config.js`, должно быть:
```javascript
server: {
  proxy: {
    '/grpc': {
      target: 'http://78.153.139.47:8080',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/grpc/, ''),
    }
  }
}
```

## 📊 Сравнение версий

### Старая версия (ручная):
- ✅ Работает
- ❌ 700+ строк кода
- ❌ Ручное кодирование varint
- ❌ Ручной парсинг gRPC-Web фреймов
- ❌ Сложно поддерживать при изменении proto

### Новая версия (grpc-web):
- ✅ Работает
- ✅ ~300 строк кода
- ✅ Автоматическое кодирование
- ✅ Автоматический парсинг
- ✅ Легко обновлять при изменении proto
- ✅ Best practices

## 🎯 После миграции

1. Удалить `src/services/grpcClient-old.js` (бэкап)
2. Удалить `src/services/grpcClient-grpc-web.js` (уже не нужен)
3. Добавить в `.gitignore`:
   ```
   # Generated proto files
   src/grpc/*.js
   backend-proto/
   ```
4. Добавить в README инструкцию по генерации proto для новых разработчиков

## 🔄 Обновление при изменении proto

Если backend изменил proto файлы:

```bash
# 1. Скопировать новые proto из backend
copy ..\backend-main\proto\api\core.proto backend-proto\proto\api\
copy ..\backend-main\proto\shared\common.proto backend-proto\proto\shared\

# 2. Перегенерировать
.\generate-proto.bat

# 3. Перезапустить dev сервер
npm run dev
```

## 📚 Дополнительные ресурсы

- [gRPC-Web Documentation](https://github.com/grpc/grpc-web)
- [Protocol Buffers Documentation](https://protobuf.dev/)
- [grpc-web npm package](https://www.npmjs.com/package/grpc-web)
