# 🚨 КРИТИЧЕСКАЯ ПРОБЛЕМА: Envoy не может подключиться к Core Service

## 🔍 Диагностика показала

```bash
curl -I http://78.153.139.47:8080/health
# Результат: HTTP/1.1 503 Service Unavailable
```

**Это означает:**
- ✅ Envoy Proxy запущен (отвечает на запросы)
- ❌ Envoy НЕ МОЖЕТ подключиться к Core gRPC service (порт 50051)
- ❌ Поэтому все gRPC запросы с frontend получают 503

## 🎯 Что нужно сделать на backend

### 1️⃣ Проверить что Core Service запущен

```bash
# Посмотреть запущенные контейнеры
docker ps | grep core

# Должен быть контейнер типа:
# core-service    Up 2 hours    0.0.0.0:50051->50051/tcp
```

**Если контейнер не запущен:**
```bash
# Проверить docker-compose.yml
cat docker-compose.yml | grep -A 10 "core-service"

# Запустить Core service
docker-compose up -d core-service

# Проверить логи
docker logs -f core-service
```

### 2️⃣ Проверить что Core слушает порт 50051

```bash
# Логи Core service должны показывать что он слушает 50051
docker logs core-service | grep "50051"

# Должно быть что-то вроде:
# gRPC server listening on 0.0.0.0:50051
```

**Если порт не слушается:**
- Проверить конфиг Core service
- Проверить переменные окружения (GRPC_PORT)

### 3️⃣ Проверить Docker Network

Envoy и Core должны быть в одной Docker сети:

```bash
# Посмотреть какие сети есть
docker network ls

# Проверить что оба контейнера в одной сети
docker network inspect <network_name> | grep -E "core|envoy"
```

**Если контейнеры в разных сетях:**
```bash
# Подключить Core к сети Envoy
docker network connect <network_name> core-service
```

### 4️⃣ Проверить Envoy конфигурацию

```bash
# Найти envoy.yaml
find . -name "envoy.yaml" -o -name "envoy.yml"

# Проверить upstream для gRPC
cat envoy.yaml | grep -A 20 "clusters"
```

**Envoy должен знать адрес Core service:**
```yaml
clusters:
  - name: grpc_backend
    connect_timeout: 5s
    type: LOGICAL_DNS
    http2_protocol_options: {}
    load_assignment:
      cluster_name: grpc_backend
      endpoints:
        - lb_endpoints:
            - endpoint:
                address:
                  socket_address:
                    address: core-service  # ← ИМЯ КОНТЕЙНЕРА или localhost
                    port_value: 50051      # ← ПОРТ Core service
```

**Частые ошибки:**
- ❌ `address: localhost` - должно быть имя контейнера или IP
- ❌ `port_value: 8080` - должен быть 50051 (порт Core gRPC)
- ❌ Отсутствует `http2_protocol_options: {}` для gRPC

### 5️⃣ Проверить Health Check Core Service

```bash
# Если Core имеет health endpoint
grpcurl -plaintext localhost:50051 grpc.health.v1.Health/Check

# Или через docker
docker exec -it core-service grpcurl -plaintext localhost:50051 list
```

### 6️⃣ Проверить Firewall/Ports

```bash
# Проверить что порт 50051 открыт внутри Docker сети
docker exec -it envoy-container nc -zv core-service 50051

# Должно быть: Connection to core-service 50051 port [tcp/*] succeeded!
```

## 🔧 Типичное решение

**Сценарий 1: Core service не запущен**
```bash
docker-compose up -d core-service
docker logs -f core-service
```

**Сценарий 2: Неправильный адрес в Envoy**
```yaml
# envoy.yaml - изменить:
address: localhost    # ← Неправильно
# на:
address: core-service # ← Правильно (имя Docker контейнера)
```

Затем:
```bash
docker-compose restart envoy
```

**Сценарий 3: Разные Docker сети**
```bash
# Узнать сеть Envoy
docker inspect envoy-container | grep NetworkMode

# Подключить Core к этой же сети
docker network connect <network_name> core-service

# Перезапустить Envoy
docker-compose restart envoy
```

## 📋 Чек-лист для проверки

```bash
# ✅ 1. Core service запущен?
docker ps | grep core-service

# ✅ 2. Core слушает 50051?
docker logs core-service | grep 50051

# ✅ 3. Envoy видит Core?
docker exec -it envoy-container ping core-service

# ✅ 4. Порт 50051 доступен?
docker exec -it envoy-container nc -zv core-service 50051

# ✅ 5. Envoy конфиг правильный?
cat envoy.yaml | grep -A 10 "socket_address"

# ✅ 6. Health check работает?
curl http://78.153.139.47:8080/health
# Должен быть 200 OK (не 503!)
```

## 🧪 После исправления - проверка

### На backend сервере:
```bash
# Health check должен вернуть 200 OK
curl -I http://localhost:8080/health
# Ожидаем: HTTP/1.1 200 OK

# Логи Envoy не должны показывать ошибки подключения
docker logs envoy-container | grep -i error | tail -20
```

### На frontend (через браузер):
```javascript
// 1. Открыть http://localhost:5173
// 2. DevTools → Console
// 3. Скопировать содержимое diagnose-grpc.js
// 4. Запустить:
diagnoseGrpc(userId, projectId)

// Ожидаемый результат:
// ✅ REST API (8000): OK
// ✅ Envoy Proxy (8080): OK  ← Должен быть OK, не 503!
// ✅ gRPC Endpoint: OK
// ✅ Stream Connection: OK (N msgs)
```

## 📞 Связь с командой

После исправления отправьте вывод:

```bash
# Показать что всё работает
echo "=== Docker PS ==="
docker ps | grep -E "core|envoy"

echo "=== Core Logs ==="
docker logs core-service | tail -10

echo "=== Envoy Health ==="
curl -I http://localhost:8080/health

echo "=== gRPC Test ==="
# Тестовый gRPC запрос (если есть grpcurl)
grpcurl -plaintext localhost:50051 list
```

---

## 🎯 ВЫВОД

**Проблема НЕ в frontend коде** - он правильный.

**Проблема в backend инфраструктуре:**
- Envoy Proxy работает (порт 8080)
- Core gRPC Service НЕ доступен для Envoy (порт 50051)

Frontend **не сможет** получить данные пока backend команда не исправит Envoy → Core соединение.

---

**Дата диагностики:** 6 декабря 2025  
**Статус frontend:** ✅ Готов к работе  
**Статус backend:** ❌ Требуется исправление Envoy/Core connection
