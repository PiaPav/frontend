# Интеграция с gRPC - Визуализатор архитектуры

## Обзор

Визуализатор получает данные от Core сервера через **gRPC stream** в режиме реального времени. Данные приходят поэтапно:

1. **REQUIREMENTS** - список зависимостей Python проекта
2. **ENDPOINTS** - список API эндпоинтов с их обработчиками
3. **ARCHITECTURE** - граф зависимостей (parent-children связи)
4. **DONE** - сигнал завершения

## Архитектура взаимодействия

```
┌──────────────┐      gRPC Stream      ┌──────────────┐
│   Frontend   │ ◄──────────────────── │     Core     │
│  (React App) │                        │   (Server)   │
└──────────────┘                        └──────────────┘
       │                                        │
       │                                        │
   gRPC-Web                                  gRPC
   (Browser)                              (Python)
       │                                        │
       │         ┌────────────────┐            │
       └────────►│  Envoy Proxy   │◄───────────┘
                 │ (HTTP/2 Bridge)│
                 └────────────────┘
```

## Proto файлы

### common.proto

Определяет общие структуры данных:

```protobuf
message GraphPartResponse {
  int64 task_id = 1;
  int32 response_id = 2;
  ParseStatus status = 3;  // START, REQUIREMENTS, ENDPOINTS, ARHITECTURE, DONE

  oneof graph_part_type {
    GraphPartRequirements graph_requirements = 4;
    GraphPartEndpoints graph_endpoints = 5;
    GraphPartArchitecture graph_architecture = 6;
  }
}

message GraphPartRequirements {
  uint32 total = 1;
  repeated string requirements = 2;  // ["fastapi", "sqlalchemy", ...]
}

message GraphPartEndpoints {
  uint32 total = 1;
  map<string, string> endpoints = 2;  // {"POST /v1/auth/login": "Account.login"}
}

message GraphPartArchitecture {
  string parent = 1;                  // "Account.create_account"
  repeated string children = 2;       // ["DatabaseManager.session", "Account"]
}

enum ParseStatus {
  START = 0;
  REQUIREMENTS = 1;
  ENDPOINTS = 2;
  ARHITECTURE = 3;
  DONE = 4;
}
```

### core.proto

Определяет сервис для фронтенда:

```protobuf
service FrontendStreamService {
  rpc RunAlgorithm(AlgorithmRequest) returns (stream common.GraphPartResponse);
}

message AlgorithmRequest {
  int64 user_id = 1;
  int64 task_id = 2;  // ID проекта
}
```

## Установка и настройка

### 1. Установите необходимые пакеты

```powershell
cd c:\Users\user\repos\piapav\frontend
npm install grpc-web google-protobuf
```

### 2. Установите Protocol Buffers compiler

Скачайте и установите protoc:

- https://github.com/protocolbuffers/protobuf/releases
- Добавьте в PATH

### 3. Установите protoc-gen-grpc-web

```powershell
# Скачайте с https://github.com/grpc/grpc-web/releases
# Например: protoc-gen-grpc-web-1.4.2-windows-x86_64.exe
# Переименуйте в protoc-gen-grpc-web.exe
# Добавьте в PATH
```

### 4. Сгенерируйте клиентский код

Создайте папку для proto файлов:

```powershell
mkdir src\proto
mkdir src\proto\generated
```

Скопируйте .proto файлы в `src\proto\`:

- common.proto
- core.proto
- algorithm.proto

Сгенерируйте JavaScript код:

```powershell
cd src\proto

# Генерация JavaScript из proto
protoc -I=. common.proto core.proto `
  --js_out=import_style=commonjs:./generated `
  --grpc-web_out=import_style=commonjs,mode=grpcwebtext:./generated
```

Это создаст файлы:

- `generated/common_pb.js`
- `generated/core_pb.js`
- `generated/core_grpc_web_pb.js`

### 5. Обновите grpcClient.js

Раскомментируйте импорты в `src/services/grpcClient.js`:

```javascript
import { FrontendStreamServiceClient } from "../proto/generated/core_grpc_web_pb";
import { AlgorithmRequest } from "../proto/generated/core_pb";
```

### 6. Настройте Envoy Proxy

gRPC-Web не может напрямую общаться с gRPC сервером. Нужен Envoy proxy.

Создайте `envoy.yaml`:

```yaml
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8080
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                codec_type: auto
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          route:
                            cluster: grpc_service
                            timeout: 0s
                            max_stream_duration:
                              grpc_timeout_header_max: 0s
                      cors:
                        allow_origin_string_match:
                          - prefix: "*"
                        allow_methods: GET, PUT, DELETE, POST, OPTIONS
                        allow_headers: keep-alive,user-agent,cache-control,content-type,content-transfer-encoding,custom-header-1,x-accept-content-transfer-encoding,x-accept-response-streaming,x-user-agent,x-grpc-web,grpc-timeout
                        max_age: "1728000"
                        expose_headers: custom-header-1,grpc-status,grpc-message
                http_filters:
                  - name: envoy.filters.http.grpc_web
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_web.v3.GrpcWeb
                  - name: envoy.filters.http.cors
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.Cors
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    - name: grpc_service
      connect_timeout: 0.25s
      type: logical_dns
      http2_protocol_options: {}
      lb_policy: round_robin
      load_assignment:
        cluster_name: grpc_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 78.153.139.47 # Адрес Core gRPC сервера
                      port_value: 50051 # Порт Core gRPC сервера
```

Запустите Envoy:

```powershell
docker run -d -p 8080:8080 -v ${PWD}/envoy.yaml:/etc/envoy/envoy.yaml envoyproxy/envoy:v1.24-latest
```

## Использование в коде

### Компонент ProjectViewStream

```javascript
import { getGRPCClient } from "../../services/grpcClient";

const grpcClient = getGRPCClient();

await grpcClient.connectToStream(userId, projectId, {
  onRequirements: (data) => {
    // data.requirements: ["fastapi", "sqlalchemy", ...]
    setRequirements(data.requirements);
  },

  onEndpoints: (data) => {
    // data.endpoints: {"POST /v1/auth/login": "Account.login", ...}
    setEndpoints(data.endpoints);
  },

  onArchitecture: (data) => {
    // data.parent: "Account.create_account"
    // data.children: ["DatabaseManager.session", "Account"]
    setArchitecture((prev) => [...prev, data]);
  },

  onDone: () => {
    setStreamStatus("done");
  },

  onError: (error) => {
    console.error("Stream error:", error);
  },
});
```

## Пример потока данных

На основе `Граф.txt`:

```
📡 Connecting to Core RunAlgorithm(task_id=42)...

✅ Response #1: REQUIREMENTS
   - total: 15
   - requirements: [aio-pika, asyncpg, bcrypt, ...]

✅ Response #2: ENDPOINTS
   - total: 11
   - endpoints: {
       "POST /v1/auth/registration": "Account.create_account",
       "POST /v1/auth/login": "Account.login",
       ...
     }

✅ Response #3-87: ARHITECTURE (85 частей)
   Each response contains:
   - parent: "Account.create_account"
   - children: ["DatabaseManager.session", "Account", ...]

✅ Response #88: DONE
   - Stream completed
```

## Визуализация процесса

### 1. Requirements Tab

Отображает список пакетов по мере получения:

```
📦 Requirements (15)
  ├─ aio-pika
  ├─ asyncpg
  ├─ bcrypt
  └─ ...
```

### 2. Endpoints Tab (Grouped by Class)

Группирует эндпоинты по классам с раскрытием:

```
🌐 Endpoints (11)
  ▼ Account (3)
    ├─ POST /v1/auth/registration → create_account
    ├─ POST /v1/auth/login → login
    └─ POST /v1/auth/refresh → refresh_token

  ▶ Project (7)
  ▶ Health (1)
```

### 3. Architecture Tab

Показывает граф зависимостей:

```
🏗️ Architecture (85)
  🔵 Account.create_account
     └─ datamanager/DatabaseManager.session
     └─ accounts/Account
     └─ accounts/session.add

  🔵 Account.login
     └─ datamanager/DatabaseManager.session
     └─ accounts/session.query
     └─ accounts/verify_password
```

### 4. React Flow Graph

Строит интерактивный граф в реальном времени:

- Узлы создаются для каждого parent и child
- Стрелки показывают зависимости
- Цвета узлов зависят от типа (Account, Project, Database, etc.)
- Узлы можно перетаскивать
- Стрелки можно растягивать (используя handle points)

## Отладка

### Проверка подключения

```javascript
// В DevTools Console
console.log("gRPC Client:", getGRPCClient());
```

### Логи в консоли

Клиент выводит логи на каждом этапе:

```
📡 Connecting to gRPC stream for task 42...
✅ Stream started
📦 Requirements received: {total: 15, requirements: [...]}
🌐 Endpoints received: {total: 11, endpoints: {...}}
🏗️ Architecture part received: {parent: "...", children: [...]}
✅ Stream completed
```

### Проверка Envoy

```powershell
# Проверьте, что Envoy работает
curl http://localhost:8080

# Проверьте логи
docker logs <envoy-container-id>
```

## Текущий статус

✅ **Готово**:

- Структура компонента ProjectViewStream
- UI с тремя вкладками (Requirements, Endpoints, Architecture)
- React Flow визуализация с перетаскиванием
- Группировка endpoints по классам
- Поэтапное появление элементов
- Прогресс-бар загрузки
- Детальная панель для узлов
- Симуляция gRPC стрима (для тестирования)

⏳ **Требует настройки**:

- Установка grpc-web пакетов
- Генерация proto клиентов
- Настройка Envoy proxy
- Замена симуляции на реальный gRPC клиент

## Следующие шаги

1. Установите пакеты: `npm install grpc-web google-protobuf`
2. Сгенерируйте proto клиенты
3. Настройте Envoy proxy
4. Раскомментируйте код в `grpcClient.js`
5. Протестируйте подключение к Core

## Полезные ссылки

- gRPC-Web: https://github.com/grpc/grpc-web
- Protocol Buffers: https://developers.google.com/protocol-buffers
- Envoy Proxy: https://www.envoyproxy.io/docs/envoy/latest/start/start
- React Flow: https://reactflow.dev/
