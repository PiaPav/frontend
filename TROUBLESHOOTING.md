# Шпаргалка по отладке gRPC 🔧

## 🚀 Быстрый старт

```bash
# 1. Запустить фронтенд
cd /Users/user/repos/frontend
npm run dev

# 2. Открыть браузер
open http://localhost:5173

# 3. Тест в консоли (DevTools → Console)
# Скопировать содержимое test-grpc-console.js
testGrpcConnection(9, 242)
```

## ✅ Контрольная точка #1: Frontend запущен

```bash
npm run dev

# Должно быть:
# ➜  Local:   http://localhost:5173/
# ➜  Network: use --host to expose
```

## ✅ Контрольная точка #2: Backend работает

```bash
# Envoy
curl http://78.153.139.47:8080/health
# Ожидаем: 200 OK

# Core service
docker ps | grep core-service
# Ожидаем: UP статус

# Логи Core
docker logs core-service --tail 20
# Ожидаем: "CoreServer: запуск на [::]:50051"
```

## ✅ Контрольная точка #3: gRPC запрос отправлен

**Смотрим Console (DevTools):**
```
📤 ОТПРАВКА gRPC ЗАПРОСА
🌐 URL: /grpc/core.api.FrontendStreamService/RunAlgorithm
👤 User ID: X
📋 Task ID: Y
```

**Проверяем Network tab:**
- Status: должен быть 200 (не 504, не ERR_EMPTY_RESPONSE)
- Type: должен быть `fetch`
- Size: должен расти (chunked transfer)

## ✅ Контрольная точка #4: Backend получил запрос

```bash
# Логи Core service
docker logs -f core-service | grep "RunAlgorithm"

# Ожидаем:
# [FRONT] RunAlgorithm: ожидание сообщений task_id=242
```

## ✅ Контрольная точка #5: Получены сообщения

**Console должен показать:**
```
📬 Message #1: status=START
📬 Message #2: status=REQUIREMENTS
📬 Message #3: status=ENDPOINTS
📬 Message #4-N: status=ARHITECTURE
📬 Message #N+1: status=DONE
✅ Stream завершён успешно
```

## ❌ Если ошибка ERR_EMPTY_RESPONSE

### Шаг 1: Проверить Envoy
```bash
docker ps | grep envoy
# Если не работает:
docker restart envoy

# Логи
docker logs envoy --tail 50
```

### Шаг 2: Проверить роутинг
```bash
# Смотреть envoy.yaml
docker exec envoy cat /etc/envoy/envoy.yaml | grep -A 10 "FrontendStreamService"

# Должно быть:
# prefix: "/core.api.FrontendStreamService"
# cluster: core_grpc_service
```

### Шаг 3: Проверить сеть
```bash
# Envoy может достучаться до Core?
docker exec envoy ping -c 3 core-service

# Если не работает:
docker network inspect backend_default | grep -E "envoy|core"
```

## ❌ Если 504 Gateway Timeout

### Шаг 1: Проверить что Core получил запрос
```bash
docker logs -f core-service | grep "RunAlgorithm"
# Должна быть строка: "[FRONT] RunAlgorithm: ожидание сообщений"
```

### Шаг 2: Проверить что Algorithm service работает
```bash
docker ps | grep algorithm
docker logs -f algorithm-service --tail 50
```

### Шаг 3: Проверить файл проекта
```sql
SELECT id, picture_url FROM projects WHERE id = 242;
# picture_url должен быть не NULL
```

```bash
# Проверить что файл существует в S3
aws s3 ls s3://bucket-name/projects/242.zip
```

## ❌ Если Stream прерван до DONE

### Шаг 1: Логи Core service
```bash
docker logs -f core-service | grep -A 50 "RunAlgorithm.*242"
```

### Шаг 2: Ищем exception
```bash
docker logs core-service | grep -i "traceback\|exception\|error" | tail -50
```

### Шаг 3: Проверить Algorithm service
```bash
docker logs -f algorithm-service | grep "task_id=242"
```

## 📊 Команды для быстрой диагностики

```bash
# Все контейнеры
docker ps

# Все логи одной командой
docker logs envoy --tail 20 && \
docker logs core-service --tail 20 && \
docker logs algorithm-service --tail 20

# Перезапуск всех сервисов
docker-compose restart

# Очистка и перезапуск
docker-compose down && docker-compose up -d

# Проверка БД
docker exec postgres psql -U user -d database -c \
  "SELECT id, name, picture_url FROM projects ORDER BY id DESC LIMIT 5;"
```

## 🔍 Что смотреть в логах

### ✅ Успешный сценарий:

**Core service:**
```
[FRONT] RunAlgorithm: ожидание сообщений task_id=242
Алгоритм msg task=242, status=START
Алгоритм msg task=242, status=REQUIREMENTS
Алгоритм msg task=242, status=ENDPOINTS
Алгоритм msg task=242, status=ARHITECTURE
...
Алгоритм получен DONE для task=242
[FRONT] Задача 242 завершена, закрываем поток
```

**Algorithm service:**
```
Получена задача task_id=242
Загрузка файла из S3: projects/242.zip
Распаковка архива...
Анализ requirements.txt
Найдено 11 зависимостей
Анализ endpoints...
Найдено 8 эндпоинтов
Построение графа...
Отправка данных в Core...
DONE отправлен
```

### ❌ Проблемный сценарий:

**Core service:**
```
[FRONT] RunAlgorithm: ожидание сообщений task_id=242
# ... тишина ... (нет сообщений от Algorithm)
```

**Algorithm service:**
```
Получена задача task_id=242
Загрузка файла из S3: projects/242.zip
ERROR: File not found in S3
# ИЛИ
Traceback (most recent call last):
  ...
Exception: Failed to parse project
```

## 📞 Куда смотреть дальше

- `LOGS_EXAMPLE.md` - примеры успешных логов
- `GRPC_FIX_README.md` - полная инструкция
- `FLOW_DIAGRAM_FOR_BACKEND.md` - документация протокола
- `DEBUGGING_500.md` - отладка 500 ошибок
