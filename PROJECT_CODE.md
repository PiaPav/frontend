.env
VITE_API_URL=
VITE_GRPC_URL=/grpc
# ⏱️ gRPC stream timeout - 5 минут для долгих анализов
VITE_GRPC_TIMEOUT_MS=300000

.env.example
VITE_API_URL=http://78.153.139.47:8000

.env.production
VITE_API_URL=

.gitignore
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

backend-proto/proto/api/core.proto
// core - frontend
syntax = "proto3";

package core.api;

import "shared/common.proto";

service FrontendStreamService {
  // Отправка пакета данных на фронт
  rpc RunAlgorithm(AlgorithmRequest) returns (stream common.GraphPartResponse) {};
}

message AlgorithmRequest {
  int64 user_id = 1;
  int64 task_id = 2;
}



backend-proto/proto/shared/common.proto
// общие структуры

syntax = "proto3";

package common;

message Empty {}

message GraphPartResponse {
  int64 task_id = 1;
  int32 response_id = 2;
  ParseStatus status = 3;
  // Тип ответа. Первый ответ всегда = 3, второй ответ всегда = 4, третий и последующие всегда = 5
  oneof graph_part_type {
    GraphPartRequirements graph_requirements = 4;
    GraphPartEndpoints graph_endpoints = 5;
    GraphPartArchitecture graph_architecture = 6;
  }
}

message GraphPartRequirements {
  uint32 total = 1;
  repeated string requirements = 2;
}

message GraphPartEndpoints {
  uint32 total = 1;
  map<string, string> endpoints = 2; // Эндпоинты в формате: "название: адрес"
}

message GraphPartArchitecture {
  string parent = 1;
  repeated string children = 2;
}

enum ParseStatus {
  // Этапы парсинга
  START = 0;
  REQUIREMENTS = 1;
  ENDPOINTS = 2;
  ARHITECTURE = 3;
  DONE = 4;
}

create-test-project.sh
#!/bin/bash

# Скрипт для создания тестового проекта через REST API
# Использование: ./create-test-project.sh <user_id> <auth_token>

USER_ID=${1:-9}
AUTH_TOKEN=${2}

if [ -z "$AUTH_TOKEN" ]; then
  echo "❌ Ошибка: необходим токен авторизации"
  echo ""
  echo "Использование: $0 <user_id> <auth_token>"
  echo ""
  echo "Получить токен можно из localStorage в браузере:"
  echo "  localStorage.getItem('token')"
  exit 1
fi

echo "📦 Создаём тестовый проект..."
echo "👤 User ID: $USER_ID"
echo ""

# Создаём временный ZIP файл с тестовым проектом
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Создаём простой Python файл
cat > main.py << 'EOF'
"""
Простой тестовый проект для анализа
"""
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello World"}

@app.get("/users/{user_id}")
def read_user(user_id: int):
    return {"user_id": user_id}
EOF

# Создаём requirements.txt
cat > requirements.txt << 'EOF'
fastapi==0.104.1
uvicorn==0.24.0
EOF

# Упаковываем в ZIP
zip -q test_project.zip main.py requirements.txt

echo "📤 Отправляем проект на backend..."

# Отправляем на backend
curl -X POST "http://78.153.139.47:8000/v1/project" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "name=Test gRPC Project" \
  -F "description=Тестовый проект для проверки gRPC stream" \
  -F "user_id=$USER_ID" \
  -F "file=@test_project.zip" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  | python3 -m json.tool

# Удаляем временные файлы
cd - > /dev/null
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Готово!"
echo ""
echo "Теперь найдите project_id в ответе выше и используйте его:"
echo "  diagnoseGrpc($USER_ID, <project_id>)"

diagnose-grpc.js
/**
 * 🔍 ПОЛНАЯ ДИАГНОСТИКА gRPC ПОДКЛЮЧЕНИЯ
 * 
 * Этот скрипт проверяет ВСЕ уровни подключения:
 * 1. REST API доступность (8000)
 * 2. Envoy proxy доступность (8080)
 * 3. gRPC-Web endpoint
 * 4. Формат запроса
 * 5. Формат ответа
 * 
 * ИСПОЛЬЗОВАНИЕ:
 * 1. npm run dev
 * 2. Открыть http://localhost:5173
 * 3. F12 → Console
 * 4. Скопировать весь этот файл и вставить в Console
 * 5. diagnoseGrpc(userId, projectId)
 * 
 * ПРИМЕР:
 * diagnoseGrpc(9, 242)
 */

async function diagnoseGrpc(userId, projectId) {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 ДИАГНОСТИКА gRPC ПОДКЛЮЧЕНИЯ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`👤 User ID: ${userId}`);
  console.log(`📋 Project ID: ${projectId}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const results = {
    restApi: null,
    envoyProxy: null,
    grpcEndpoint: null,
    streamConnection: null
  };
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ТЕСТ 1: REST API (FastAPI на порту 8000)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ ТЕСТ 1: REST API (FastAPI)                             │');
  console.log('└─────────────────────────────────────────────────────────┘');
  
  try {
    // Пробуем оба варианта: /v1/health и /health
    let restResponse = await fetch('/v1/health', {
      method: 'GET'
    });
    
    // Если 404, пробуем без /v1 prefix
    if (restResponse.status === 404) {
      restResponse = await fetch('/health', {
        method: 'GET'
      });
    }
    
    results.restApi = {
      status: restResponse.status,
      ok: restResponse.ok,
      headers: Object.fromEntries(restResponse.headers.entries())
    };
    
    if (restResponse.ok) {
      console.log('✅ REST API работает');
      console.log('   Status:', restResponse.status);
      console.log('   URL:', '/health → http://78.153.139.47:8000/health');
    } else {
      console.log('⚠️  REST API вернул ошибку');
      console.log('   Status:', restResponse.status);
    }
  } catch (error) {
    console.error('❌ REST API недоступен:', error.message);
    results.restApi = { error: error.message };
  }
  
  console.log('');
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ТЕСТ 2: Envoy Proxy Health (порт 8080)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ ТЕСТ 2: Envoy Proxy Health Check                       │');
  console.log('└─────────────────────────────────────────────────────────┘');
  
  try {
    const envoyResponse = await fetch('/grpc/health', {
      method: 'GET'
    });
    
    results.envoyProxy = {
      status: envoyResponse.status,
      ok: envoyResponse.ok,
      headers: Object.fromEntries(envoyResponse.headers.entries())
    };
    
    if (envoyResponse.status === 503) {
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Envoy возвращает 503');
      console.error('   Это значит что Envoy НЕ МОЖЕТ подключиться к Core gRPC service');
      console.error('   ');
      console.error('   🔧 РЕШЕНИЕ (для backend команды):');
      console.error('   1. Проверить что Core service запущен:');
      console.error('      docker ps | grep core-service');
      console.error('   ');
      console.error('   2. Проверить что Core слушает порт 50051:');
      console.error('      docker logs core-service | grep "50051"');
      console.error('   ');
      console.error('   3. Проверить Envoy конфиг:');
      console.error('      cat envoy.yaml | grep "core-service"');
      console.error('   ');
      console.error('   4. Проверить Docker network:');
      console.error('      docker network inspect <network_name>');
    } else if (envoyResponse.ok) {
      console.log('✅ Envoy Proxy доступен');
      console.log('   Status:', envoyResponse.status);
    } else {
      console.log('⚠️  Envoy Proxy вернул неожиданный статус');
      console.log('   Status:', envoyResponse.status);
    }
  } catch (error) {
    console.error('❌ Envoy Proxy недоступен:', error.message);
    results.envoyProxy = { error: error.message };
  }
  
  console.log('');
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ТЕСТ 3: gRPC Endpoint (если Envoy работает)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ ТЕСТ 3: gRPC RunAlgorithm Endpoint                      │');
  console.log('└─────────────────────────────────────────────────────────┘');
  
  if (results.envoyProxy?.status === 503) {
    console.log('⏭️  Пропускаем - Envoy недоступен (503)');
    console.log('   Сначала нужно починить Envoy/Core connection');
  } else {
    // Кодирование varint для Protobuf
    function encodeVarint(value) {
      const bytes = [];
      while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
      }
      bytes.push(value & 0x7f);
      return bytes;
    }
    
    // Создаём Protobuf запрос: AlgorithmRequest
    const requestBytes = [
      0x08, ...encodeVarint(userId),    // field 1: user_id (int64)
      0x10, ...encodeVarint(projectId)  // field 2: task_id (int64)
    ];
    
    console.log('📦 Отправляем AlgorithmRequest:');
    console.log('   user_id:', userId);
    console.log('   task_id (project_id):', projectId);
    console.log('   Payload (hex):', requestBytes.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('');
    
    const requestBody = new Uint8Array(requestBytes);
    
    try {
      const grpcResponse = await fetch('/grpc/core.api.FrontendStreamService/RunAlgorithm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/grpc-web+proto',
          'Accept': 'application/grpc-web+proto',
          'X-Grpc-Web': '1',
          'X-User-Agent': 'grpc-web-javascript/0.1',
        },
        body: requestBody
      });
      
      console.log('📥 Ответ от gRPC endpoint:');
      console.log('   Status:', grpcResponse.status, grpcResponse.statusText);
      console.log('   Headers:', Object.fromEntries(grpcResponse.headers.entries()));
      console.log('');
      
      results.grpcEndpoint = {
        status: grpcResponse.status,
        ok: grpcResponse.ok,
        headers: Object.fromEntries(grpcResponse.headers.entries())
      };
      
      if (!grpcResponse.ok) {
        console.error('❌ gRPC endpoint вернул ошибку:', grpcResponse.status);
        
        if (grpcResponse.status === 404) {
          console.error('   ');
          console.error('   🔧 РЕШЕНИЕ: Проверить Envoy routing config');
          console.error('   Путь должен быть: /core.api.FrontendStreamService/RunAlgorithm');
        } else if (grpcResponse.status === 503) {
          console.error('   ');
          console.error('   🔧 РЕШЕНИЕ: Core service не отвечает');
        }
        
        const errorText = await grpcResponse.text();
        if (errorText) {
          console.error('   Error body:', errorText);
        }
        
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('❌ ДИАГНОСТИКА ЗАВЕРШЕНА С ОШИБКАМИ');
        console.log('═══════════════════════════════════════════════════════════');
        return results;
      }
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ТЕСТ 4: Чтение Stream
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log('┌─────────────────────────────────────────────────────────┐');
      console.log('│ ТЕСТ 4: Чтение gRPC Stream                              │');
      console.log('└─────────────────────────────────────────────────────────┘');
      console.log('');
      
      const reader = grpcResponse.body.getReader();
      let buffer = new Uint8Array(0);
      let messageCount = 0;
      let lastStatus = null;
      const statusNames = ['START', 'REQUIREMENTS', 'ENDPOINTS', 'ARHITECTURE', 'DONE'];
      
      let readTimeout;
      const startTime = Date.now();
      
      try {
        while (true) {
          // Таймаут для чтения (30 секунд)
          const readPromise = reader.read();
          const timeoutPromise = new Promise((_, reject) => {
            readTimeout = setTimeout(() => reject(new Error('Read timeout')), 30000);
          });
          
          const { done, value } = await Promise.race([readPromise, timeoutPromise]);
          clearTimeout(readTimeout);
          
          if (done) {
            console.log('');
            console.log('✅ Stream завершён');
            console.log(`   Время выполнения: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
            break;
          }
          
          // Добавляем chunk к буферу
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
          
          // Парсим сообщения из буфера
          while (buffer.length >= 5) {
            const compressedFlag = buffer[0];
            const messageLength = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];
            
            if (buffer.length < 5 + messageLength) {
              break; // Ждём больше данных
            }
            
            const messageBytes = buffer.slice(5, 5 + messageLength);
            buffer = buffer.slice(5 + messageLength);
            
            messageCount++;
            
            // Парсим status из Protobuf
            let status = null;
            let pos = 0;
            
            while (pos < messageBytes.length && pos < 20) {
              const tag = messageBytes[pos++];
              const fieldNum = tag >>> 3;
              const wireType = tag & 0x07;
              
              if (fieldNum === 3 && wireType === 0) { // field 3: status
                let statusValue = 0;
                let shift = 0;
                while (pos < messageBytes.length) {
                  const byte = messageBytes[pos++];
                  statusValue |= (byte & 0x7f) << shift;
                  if ((byte & 0x80) === 0) break;
                  shift += 7;
                }
                status = statusValue;
                lastStatus = status;
                break;
              } else {
                // Пропускаем поле
                if (wireType === 0) { // varint
                  while (pos < messageBytes.length && (messageBytes[pos++] & 0x80));
                } else if (wireType === 2) { // length-delimited
                  let len = 0, shift = 0;
                  while (pos < messageBytes.length) {
                    const byte = messageBytes[pos++];
                    len |= (byte & 0x7f) << shift;
                    if ((byte & 0x80) === 0) break;
                    shift += 7;
                  }
                  pos += len;
                }
              }
            }
            
            const statusName = statusNames[status] || `Unknown(${status})`;
            const icon = status === 0 ? '🟢' : status === 4 ? '🏁' : '📦';
            
            console.log(`${icon} Message #${messageCount}: ${statusName}`);
            console.log(`   Length: ${messageLength} bytes`);
            console.log(`   Hex: ${Array.from(messageBytes.slice(0, Math.min(30, messageBytes.length)))
              .map(b => b.toString(16).padStart(2, '0')).join(' ')}${messageBytes.length > 30 ? '...' : ''}`);
            console.log('');
          }
        }
        
        results.streamConnection = {
          success: true,
          messageCount,
          lastStatus,
          duration: Date.now() - startTime
        };
        
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ ДИАГНОСТИКА УСПЕШНО ЗАВЕРШЕНА');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`📊 Получено сообщений: ${messageCount}`);
        console.log(`🏁 Последний статус: ${statusNames[lastStatus] || lastStatus}`);
        console.log(`⏱️  Время выполнения: ${(results.streamConnection.duration / 1000).toFixed(2)}s`);
        console.log('═══════════════════════════════════════════════════════════');
        
        if (lastStatus !== 4) {
          console.warn('');
          console.warn('⚠️  ВНИМАНИЕ: Stream не завершился статусом DONE (4)');
          console.warn('   Последний статус:', statusNames[lastStatus]);
          console.warn('   Это может означать что анализ не завершился полностью');
        }
        
      } catch (streamError) {
        console.error('');
        console.error('❌ Ошибка при чтении stream:', streamError.message);
        results.streamConnection = { error: streamError.message };
        
        if (streamError.message === 'Read timeout') {
          console.error('');
          console.error('   🔧 РЕШЕНИЕ: Stream не отправляет данные > 30 секунд');
          console.error('   1. Проверить что Core service обрабатывает запрос:');
          console.error('      docker logs -f core-service | grep RunAlgorithm');
          console.error('   2. Проверить что Algorithm service запущен');
          console.error('   3. Проверить логи Algorithm service');
        }
      }
      
    } catch (error) {
      console.error('❌ Ошибка при подключении к gRPC endpoint:', error);
      results.grpcEndpoint = { error: error.message };
    }
  }
  
  console.log('');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 SUMMARY OF RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('1. REST API (8000):', results.restApi?.ok ? '✅ OK' : '❌ FAIL');
  console.log('2. Envoy Proxy (8080):', results.envoyProxy?.status === 503 ? '❌ 503 (Core unreachable)' : results.envoyProxy?.ok ? '✅ OK' : '❌ FAIL');
  console.log('3. gRPC Endpoint:', results.grpcEndpoint?.ok ? '✅ OK' : '❌ FAIL');
  console.log('4. Stream Connection:', results.streamConnection?.success ? `✅ OK (${results.streamConnection.messageCount} msgs)` : '❌ FAIL');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return results;
}

// Автозагрузка
console.log('✅ Диагностический скрипт загружен!');
console.log('');
console.log('📋 ИСПОЛЬЗОВАНИЕ:');
console.log('   diagnoseGrpc(userId, projectId)');
console.log('');
console.log('📝 ПРИМЕР:');
console.log('   diagnoseGrpc(9, 242)');
console.log('');
console.log('💡 TIP: Чтобы получить user_id:');
console.log('   const user = JSON.parse(localStorage.getItem("user"));');
console.log('   console.log(user.id);');
console.log('');

eslint.config.js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])

generate-proto.bat
@echo off
REM Скрипт для генерации gRPC-Web клиента из proto файлов
REM 
REM Требования:
REM 1. protoc установлен и доступен в PATH
REM 2. protoc-gen-grpc-web установлен и доступен в PATH
REM 3. Proto файлы скопированы в backend-proto/proto/

echo ============================================
echo Генерация gRPC-Web клиента из proto файлов
echo ============================================
echo.

REM Проверка наличия protoc
where protoc >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] protoc не найден!
    echo Установите protoc: https://github.com/protocolbuffers/protobuf/releases
    exit /b 1
)

REM Проверка наличия protoc-gen-grpc-web
where protoc-gen-grpc-web >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] protoc-gen-grpc-web не найден!
    echo Установите protoc-gen-grpc-web: https://github.com/grpc/grpc-web/releases
    exit /b 1
)

echo [OK] protoc найден
echo [OK] protoc-gen-grpc-web найден
echo.

REM Проверка наличия proto файлов
if not exist "backend-proto\proto\api\core.proto" (
    echo [ERROR] Не найден файл backend-proto\proto\api\core.proto
    echo Скопируйте proto файлы из backend!
    exit /b 1
)

if not exist "backend-proto\proto\shared\common.proto" (
    echo [ERROR] Не найден файл backend-proto\proto\shared\common.proto
    echo Скопируйте proto файлы из backend!
    exit /b 1
)

echo [OK] Proto файлы найдены
echo.

REM Создание папки для сгенерированных файлов
if not exist "src\grpc" mkdir src\grpc

echo Генерация JS файлов...
echo.

protoc -I=backend-proto\proto ^
  --js_out=import_style=commonjs:src\grpc ^
  --grpc-web_out=import_style=commonjs,mode=grpcwebtext:src\grpc ^
  backend-proto\proto\api\core.proto ^
  backend-proto\proto\shared\common.proto

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Ошибка при генерации!
    exit /b 1
)

echo.
echo ============================================
echo ✅ Генерация завершена успешно!
echo ============================================
echo.
echo Сгенерированные файлы в src\grpc\:
dir /b src\grpc\*.js 2>nul
echo.
echo Следующие шаги:
echo 1. Замените src\services\grpcClient.js на src\services\grpcClient-grpc-web.js
echo 2. Запустите npm run dev
echo 3. Проверьте работу в браузере
echo.

generate-proto.sh
#!/bin/bash

# Скрипт для генерации gRPC-Web клиента из proto файлов
# 
# Требования:
# 1. protoc установлен и доступен в PATH
# 2. protoc-gen-grpc-web установлен и доступен в PATH
# 3. Proto файлы скопированы в backend-proto/proto/

echo "============================================"
echo "Генерация gRPC-Web клиента из proto файлов"
echo "============================================"
echo ""

# Проверка наличия protoc
if ! command -v protoc &> /dev/null; then
    echo "[ERROR] protoc не найден!"
    echo "Установите protoc: brew install protobuf"
    exit 1
fi

# Проверка наличия protoc-gen-grpc-web
if ! command -v protoc-gen-grpc-web &> /dev/null; then
    echo "[ERROR] protoc-gen-grpc-web не найден!"
    echo "Установите: brew install protoc-gen-grpc-web"
    exit 1
fi

echo "[OK] protoc найден"
echo "[OK] protoc-gen-grpc-web найден"
echo ""

# Проверка наличия proto файлов
if [ ! -f "backend-proto/proto/api/core.proto" ]; then
    echo "[ERROR] Не найден файл backend-proto/proto/api/core.proto"
    echo "Скопируйте proto файлы из backend!"
    exit 1
fi

if [ ! -f "backend-proto/proto/shared/common.proto" ]; then
    echo "[ERROR] Не найден файл backend-proto/proto/shared/common.proto"
    echo "Скопируйте proto файлы из backend!"
    exit 1
fi

echo "[OK] Proto файлы найдены"
echo ""

# Создание папки для сгенерированных файлов
mkdir -p src/grpc

echo "Генерация JS файлов..."
echo ""

protoc -I=backend-proto/proto \
  --js_out=import_style=commonjs:src/grpc \
  --grpc-web_out=import_style=commonjs,mode=grpcwebtext:src/grpc \
  backend-proto/proto/api/core.proto \
  backend-proto/proto/shared/common.proto

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Ошибка при генерации!"
    exit 1
fi

echo ""
echo "============================================"
echo "✅ Генерация завершена успешно!"
echo "============================================"
echo ""
echo "Сгенерированные файлы в src/grpc/:"
ls -1 src/grpc/*.js 2>/dev/null || echo "Файлы не найдены"
echo ""
echo "Следующие шаги:"
echo "1. Замените src/services/grpcClient.js на src/services/grpcClient-grpc-web.js"
echo "2. Запустите npm run dev"
echo "3. Проверьте работу в браузере"
echo ""

get-existing-project.sh
#!/bin/bash

# Скрипт для получения списка существующих проектов
# Использование: ./get-existing-project.sh <auth_token>

AUTH_TOKEN=${1}

if [ -z "$AUTH_TOKEN" ]; then
  echo "❌ Ошибка: необходим токен авторизации"
  echo ""
  echo "Использование: $0 <auth_token>"
  echo ""
  echo "Получить токен можно из localStorage в браузере:"
  echo "  localStorage.getItem('token')"
  exit 1
fi

echo "📋 Получаем список проектов..."
echo ""

curl -s -X GET "http://78.153.139.47:8000/v1/project" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  | python3 -m json.tool

echo ""
echo "✅ Готово!"
echo ""
echo "Найдите любой project_id из списка и используйте его:"
echo "  diagnoseGrpc(user_id, project_id)"

get-project-id.html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Get Auth Token & Project ID</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #007bff;
            padding-bottom: 10px;
        }
        .section {
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 5px;
            border-left: 4px solid #007bff;
        }
        button {
            background: #007bff;
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            border-radius: 5px;
            cursor: pointer;
            margin: 10px 5px;
        }
        button:hover {
            background: #0056b3;
        }
        .success {
            background: #d4edda;
            border-left-color: #28a745;
            color: #155724;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
            font-family: monospace;
            word-break: break-all;
        }
        .error {
            background: #f8d7da;
            border-left-color: #dc3545;
            color: #721c24;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
        }
        .info {
            background: #d1ecf1;
            border-left-color: #17a2b8;
            color: #0c5460;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
        }
        code {
            background: #e9ecef;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        pre {
            background: #263238;
            color: #aed581;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔑 Получить данные для тестирования gRPC</h1>
        
        <div class="section">
            <h2>1️⃣ Токен авторизации</h2>
            <button onclick="getToken()">Получить Token</button>
            <div id="tokenResult"></div>
        </div>
        
        <div class="section">
            <h2>2️⃣ User ID</h2>
            <button onclick="getUserId()">Получить User ID</button>
            <div id="userIdResult"></div>
        </div>
        
        <div class="section">
            <h2>3️⃣ Существующие проекты</h2>
            <button onclick="getProjects()">Получить список проектов</button>
            <div id="projectsResult"></div>
        </div>
        
        <div class="section">
            <h2>4️⃣ Тест gRPC с правильным project_id</h2>
            <button onclick="testGrpc()">Запустить тест gRPC</button>
            <div id="grpcResult"></div>
            <div class="info">
                <strong>Примечание:</strong> Убедитесь что у вас есть хотя бы один проект (шаг 3)
            </div>
        </div>
    </div>

    <script>
        function getToken() {
            const token = localStorage.getItem('token');
            const resultDiv = document.getElementById('tokenResult');
            
            if (token) {
                resultDiv.innerHTML = `
                    <div class="success">
                        <strong>✅ Token найден:</strong><br>
                        <code>${token}</code>
                    </div>
                    <div class="info">
                        Скопируйте этот токен и используйте в скриптах:<br>
                        <code>./get-existing-project.sh "${token}"</code>
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div class="error">
                        <strong>❌ Token не найден</strong><br>
                        Пожалуйста, войдите в систему
                    </div>
                `;
            }
        }
        
        function getUserId() {
            const userStr = localStorage.getItem('user');
            const resultDiv = document.getElementById('userIdResult');
            
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    resultDiv.innerHTML = `
                        <div class="success">
                            <strong>✅ User найден:</strong><br>
                            ID: <code>${user.id}</code><br>
                            Email: <code>${user.email || 'N/A'}</code>
                        </div>
                    `;
                } catch (e) {
                    resultDiv.innerHTML = `
                        <div class="error">
                            <strong>❌ Ошибка парсинга user данных</strong>
                        </div>
                    `;
                }
            } else {
                resultDiv.innerHTML = `
                    <div class="error">
                        <strong>❌ User не найден</strong><br>
                        Пожалуйста, войдите в систему
                    </div>
                `;
            }
        }
        
        async function getProjects() {
            const token = localStorage.getItem('token');
            const resultDiv = document.getElementById('projectsResult');
            
            if (!token) {
                resultDiv.innerHTML = '<div class="error">Сначала получите токен (шаг 1)</div>';
                return;
            }
            
            resultDiv.innerHTML = '<div class="info">⏳ Загрузка проектов...</div>';
            
            try {
                const response = await fetch('/v1/project', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                const data = await response.json();
                
                if (response.ok && data.projects && data.projects.length > 0) {
                    const projectsList = data.projects.map(p => 
                        `<li>ID: <code>${p.id}</code> - ${p.name}</li>`
                    ).join('');
                    
                    resultDiv.innerHTML = `
                        <div class="success">
                            <strong>✅ Найдено проектов: ${data.projects.length}</strong><br>
                            <ul>${projectsList}</ul>
                        </div>
                        <div class="info">
                            Используйте любой ID для теста:<br>
                            <code>diagnoseGrpc(user_id, ${data.projects[0].id})</code>
                        </div>
                    `;
                } else {
                    resultDiv.innerHTML = `
                        <div class="error">
                            <strong>❌ Проекты не найдены</strong><br>
                            Создайте проект через UI или используйте скрипт:<br>
                            <pre>./create-test-project.sh USER_ID TOKEN</pre>
                        </div>
                    `;
                }
            } catch (error) {
                resultDiv.innerHTML = `
                    <div class="error">
                        <strong>❌ Ошибка загрузки:</strong> ${error.message}
                    </div>
                `;
            }
        }
        
        async function testGrpc() {
            const userStr = localStorage.getItem('user');
            const token = localStorage.getItem('token');
            const resultDiv = document.getElementById('grpcResult');
            
            if (!token || !userStr) {
                resultDiv.innerHTML = '<div class="error">Сначала выполните шаги 1-2</div>';
                return;
            }
            
            resultDiv.innerHTML = '<div class="info">⏳ Получаем проекты...</div>';
            
            try {
                const user = JSON.parse(userStr);
                
                // Получаем проекты
                const projectsResponse = await fetch('/v1/project', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const projectsData = await projectsResponse.json();
                
                if (!projectsData.projects || projectsData.projects.length === 0) {
                    resultDiv.innerHTML = `
                        <div class="error">
                            <strong>❌ Нет проектов для тестирования</strong><br>
                            Создайте проект сначала (через UI или скрипт)
                        </div>
                    `;
                    return;
                }
                
                const projectId = projectsData.projects[0].id;
                
                resultDiv.innerHTML = `
                    <div class="info">
                        ⏳ Тестируем gRPC...<br>
                        User ID: ${user.id}<br>
                        Project ID: ${projectId}
                    </div>
                `;
                
                // Запускаем диагностику
                if (typeof diagnoseGrpc === 'function') {
                    const result = await diagnoseGrpc(user.id, projectId);
                    console.log('Результат теста:', result);
                    
                    resultDiv.innerHTML += `
                        <div class="success">
                            <strong>✅ Тест завершён!</strong><br>
                            Смотрите результаты в Console (F12)
                        </div>
                    `;
                } else {
                    resultDiv.innerHTML = `
                        <div class="error">
                            <strong>❌ Функция diagnoseGrpc не найдена</strong><br>
                            Сначала загрузите diagnose-grpc.js в Console
                        </div>
                    `;
                }
            } catch (error) {
                resultDiv.innerHTML = `
                    <div class="error">
                        <strong>❌ Ошибка:</strong> ${error.message}
                    </div>
                `;
            }
        }
    </script>
</body>
</html>

index.html
<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/png" href="/src/assets/img/logo/deep-learning.png" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PIAPAV</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link
    href="https://fonts.googleapis.com/css2?family=Forum&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Oswald:wght@200..700&display=swap"
    rel="stylesheet">
</head>

<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>

</html>

package-lock.json
{
  "name": "frontend",
  "version": "0.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "frontend",
      "version": "0.0.0",
      "dependencies": {
        "@tisoap/react-flow-smart-edge": "^3.0.0",
        "axios": "^1.13.1",
        "elkjs": "^0.11.0",
        "google-protobuf": "^4.0.1",
        "grpc-web": "^2.0.2",
        "react": "^19.1.1",
        "react-dom": "^19.1.1",
        "react-router-dom": "^7.9.4",
        "reactflow": "^11.11.4"
      },
      "devDependencies": {
        "@eslint/js": "^9.36.0",
        "@types/react": "^19.1.16",
        "@types/react-dom": "^19.1.9",
        "@vitejs/plugin-react": "^5.0.4",
        "eslint": "^9.36.0",
        "eslint-plugin-react-hooks": "^5.2.0",
        "eslint-plugin-react-refresh": "^0.4.22",
        "globals": "^16.4.0",
        "terser": "^5.36.0",
        "vite": "^7.1.7"
      }
    },
    "node_modules/@babel/code-frame": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.27.1.tgz",
      "integrity": "sha512-cjQ7ZlQ0Mv3b47hABuTevyTuYN4i+loJKGeV9flcCgIK37cCXRh+L1bd3iBHlynerhQ7BhCkn2BPbQUL+rGqFg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-validator-identifier": "^7.27.1",
        "js-tokens": "^4.0.0",
        "picocolors": "^1.1.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/compat-data": {
      "version": "7.28.4",
      "resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.28.4.tgz",
      "integrity": "sha512-YsmSKC29MJwf0gF8Rjjrg5LQCmyh+j/nD8/eP7f+BeoQTKYqs9RoWbjGOdy0+1Ekr68RJZMUOPVQaQisnIo4Rw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/core": {
      "version": "7.28.4",
      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.28.4.tgz",
      "integrity": "sha512-2BCOP7TN8M+gVDj7/ht3hsaO/B/n5oDbiAyyvnRlNOs+u1o+JWNYTQrmpuNp1/Wq2gcFrI01JAW+paEKDMx/CA==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@babel/code-frame": "^7.27.1",
        "@babel/generator": "^7.28.3",
        "@babel/helper-compilation-targets": "^7.27.2",
        "@babel/helper-module-transforms": "^7.28.3",
        "@babel/helpers": "^7.28.4",
        "@babel/parser": "^7.28.4",
        "@babel/template": "^7.27.2",
        "@babel/traverse": "^7.28.4",
        "@babel/types": "^7.28.4",
        "@jridgewell/remapping": "^2.3.5",
        "convert-source-map": "^2.0.0",
        "debug": "^4.1.0",
        "gensync": "^1.0.0-beta.2",
        "json5": "^2.2.3",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/babel"
      }
    },
    "node_modules/@babel/generator": {
      "version": "7.28.3",
      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.28.3.tgz",
      "integrity": "sha512-3lSpxGgvnmZznmBkCRnVREPUFJv2wrv9iAoFDvADJc0ypmdOxdUtcLeBgBJ6zE0PMeTKnxeQzyk0xTBq4Ep7zw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.28.3",
        "@babel/types": "^7.28.2",
        "@jridgewell/gen-mapping": "^0.3.12",
        "@jridgewell/trace-mapping": "^0.3.28",
        "jsesc": "^3.0.2"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-compilation-targets": {
      "version": "7.27.2",
      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.27.2.tgz",
      "integrity": "sha512-2+1thGUUWWjLTYTHZWK1n8Yga0ijBz1XAhUXcKy81rd5g6yh7hGqMp45v7cadSbEHc9G3OTv45SyneRN3ps4DQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/compat-data": "^7.27.2",
        "@babel/helper-validator-option": "^7.27.1",
        "browserslist": "^4.24.0",
        "lru-cache": "^5.1.1",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-globals": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.28.0.tgz",
      "integrity": "sha512-+W6cISkXFa1jXsDEdYA8HeevQT/FULhxzR99pxphltZcVaugps53THCeiWA8SguxxpSp3gKPiuYfSWopkLQ4hw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-imports": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.27.1.tgz",
      "integrity": "sha512-0gSFWUPNXNopqtIPQvlD5WgXYI5GY2kP2cCvoT8kczjbfcfuIljTbcWrulD1CIPIX2gt1wghbDy08yE1p+/r3w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/traverse": "^7.27.1",
        "@babel/types": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-transforms": {
      "version": "7.28.3",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.28.3.tgz",
      "integrity": "sha512-gytXUbs8k2sXS9PnQptz5o0QnpLL51SwASIORY6XaBKF88nsOT0Zw9szLqlSGQDP/4TljBAD5y98p2U1fqkdsw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-module-imports": "^7.27.1",
        "@babel/helper-validator-identifier": "^7.27.1",
        "@babel/traverse": "^7.28.3"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0"
      }
    },
    "node_modules/@babel/helper-plugin-utils": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-plugin-utils/-/helper-plugin-utils-7.27.1.tgz",
      "integrity": "sha512-1gn1Up5YXka3YYAHGKpbideQ5Yjf1tDa9qYcgysz+cNCXukyLl6DjPXhD3VRwSb8c0J9tA4b2+rHEZtc6R0tlw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-string-parser": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.27.1.tgz",
      "integrity": "sha512-qMlSxKbpRlAridDExk92nSobyDdpPijUq2DW6oDnUqd0iOGxmQjyqhMIihI9+zv4LPyZdRje2cavWPbCbWm3eA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-identifier": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.27.1.tgz",
      "integrity": "sha512-D2hP9eA+Sqx1kBZgzxZh0y1trbuU+JoDkiEwqhQ36nodYqJwyEIhPSdMNd7lOm/4io72luTPWH20Yda0xOuUow==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-option": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.27.1.tgz",
      "integrity": "sha512-YvjJow9FxbhFFKDSuFnVCe2WxXk1zWc22fFePVNEaWJEu8IrZVlda6N0uHwzZrUM1il7NC9Mlp4MaJYbYd9JSg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helpers": {
      "version": "7.28.4",
      "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.28.4.tgz",
      "integrity": "sha512-HFN59MmQXGHVyYadKLVumYsA9dBFun/ldYxipEjzA4196jpLZd8UjEEBLkbEkvfYreDqJhZxYAWFPtrfhNpj4w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/template": "^7.27.2",
        "@babel/types": "^7.28.4"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/parser": {
      "version": "7.28.4",
      "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.28.4.tgz",
      "integrity": "sha512-yZbBqeM6TkpP9du/I2pUZnJsRMGGvOuIrhjzC1AwHwW+6he4mni6Bp/m8ijn0iOuZuPI2BfkCoSRunpyjnrQKg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.28.4"
      },
      "bin": {
        "parser": "bin/babel-parser.js"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@babel/plugin-transform-react-jsx-self": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/plugin-transform-react-jsx-self/-/plugin-transform-react-jsx-self-7.27.1.tgz",
      "integrity": "sha512-6UzkCs+ejGdZ5mFFC/OCUrv028ab2fp1znZmCZjAOBKiBK2jXD1O+BPSfX8X2qjJ75fZBMSnQn3Rq2mrBJK2mw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-transform-react-jsx-source": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/plugin-transform-react-jsx-source/-/plugin-transform-react-jsx-source-7.27.1.tgz",
      "integrity": "sha512-zbwoTsBruTeKB9hSq73ha66iFeJHuaFkUbwvqElnygoNbj/jHRsSeokowZFN3CZ64IvEqcmmkVe89OPXc7ldAw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/template": {
      "version": "7.27.2",
      "resolved": "https://registry.npmjs.org/@babel/template/-/template-7.27.2.tgz",
      "integrity": "sha512-LPDZ85aEJyYSd18/DkjNh4/y1ntkE5KwUHWTiqgRxruuZL2F1yuHligVHLvcHY2vMHXttKFpJn6LwfI7cw7ODw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.27.1",
        "@babel/parser": "^7.27.2",
        "@babel/types": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/traverse": {
      "version": "7.28.4",
      "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.28.4.tgz",
      "integrity": "sha512-YEzuboP2qvQavAcjgQNVgsvHIDv6ZpwXvcvjmyySP2DIMuByS/6ioU5G9pYrWHM6T2YDfc7xga9iNzYOs12CFQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.27.1",
        "@babel/generator": "^7.28.3",
        "@babel/helper-globals": "^7.28.0",
        "@babel/parser": "^7.28.4",
        "@babel/template": "^7.27.2",
        "@babel/types": "^7.28.4",
        "debug": "^4.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/types": {
      "version": "7.28.4",
      "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.28.4.tgz",
      "integrity": "sha512-bkFqkLhh3pMBUQQkpVgWDWq/lqzc2678eUyDlTBhRqhCHFguYYGM0Efga7tYk4TogG/3x0EEl66/OQ+WGbWB/Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-string-parser": "^7.27.1",
        "@babel/helper-validator-identifier": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@esbuild/aix-ppc64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.25.10.tgz",
      "integrity": "sha512-0NFWnA+7l41irNuaSVlLfgNT12caWJVLzp5eAVhZ0z1qpxbockccEt3s+149rE64VUI3Ml2zt8Nv5JVc4QXTsw==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "aix"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-arm": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.25.10.tgz",
      "integrity": "sha512-dQAxF1dW1C3zpeCDc5KqIYuZ1tgAdRXNoZP7vkBIRtKZPYe2xVr/d3SkirklCHudW1B45tGiUlz2pUWDfbDD4w==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-arm64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.25.10.tgz",
      "integrity": "sha512-LSQa7eDahypv/VO6WKohZGPSJDq5OVOo3UoFR1E4t4Gj1W7zEQMUhI+lo81H+DtB+kP+tDgBp+M4oNCwp6kffg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-x64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.25.10.tgz",
      "integrity": "sha512-MiC9CWdPrfhibcXwr39p9ha1x0lZJ9KaVfvzA0Wxwz9ETX4v5CHfF09bx935nHlhi+MxhA63dKRRQLiVgSUtEg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/darwin-arm64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.25.10.tgz",
      "integrity": "sha512-JC74bdXcQEpW9KkV326WpZZjLguSZ3DfS8wrrvPMHgQOIEIG/sPXEN/V8IssoJhbefLRcRqw6RQH2NnpdprtMA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/darwin-x64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.25.10.tgz",
      "integrity": "sha512-tguWg1olF6DGqzws97pKZ8G2L7Ig1vjDmGTwcTuYHbuU6TTjJe5FXbgs5C1BBzHbJ2bo1m3WkQDbWO2PvamRcg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/freebsd-arm64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.25.10.tgz",
      "integrity": "sha512-3ZioSQSg1HT2N05YxeJWYR+Libe3bREVSdWhEEgExWaDtyFbbXWb49QgPvFH8u03vUPX10JhJPcz7s9t9+boWg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/freebsd-x64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.25.10.tgz",
      "integrity": "sha512-LLgJfHJk014Aa4anGDbh8bmI5Lk+QidDmGzuC2D+vP7mv/GeSN+H39zOf7pN5N8p059FcOfs2bVlrRr4SK9WxA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-arm": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.25.10.tgz",
      "integrity": "sha512-oR31GtBTFYCqEBALI9r6WxoU/ZofZl962pouZRTEYECvNF/dtXKku8YXcJkhgK/beU+zedXfIzHijSRapJY3vg==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-arm64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.25.10.tgz",
      "integrity": "sha512-5luJWN6YKBsawd5f9i4+c+geYiVEw20FVW5x0v1kEMWNq8UctFjDiMATBxLvmmHA4bf7F6hTRaJgtghFr9iziQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-ia32": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.25.10.tgz",
      "integrity": "sha512-NrSCx2Kim3EnnWgS4Txn0QGt0Xipoumb6z6sUtl5bOEZIVKhzfyp/Lyw4C1DIYvzeW/5mWYPBFJU3a/8Yr75DQ==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-loong64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.25.10.tgz",
      "integrity": "sha512-xoSphrd4AZda8+rUDDfD9J6FUMjrkTz8itpTITM4/xgerAZZcFW7Dv+sun7333IfKxGG8gAq+3NbfEMJfiY+Eg==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-mips64el": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.25.10.tgz",
      "integrity": "sha512-ab6eiuCwoMmYDyTnyptoKkVS3k8fy/1Uvq7Dj5czXI6DF2GqD2ToInBI0SHOp5/X1BdZ26RKc5+qjQNGRBelRA==",
      "cpu": [
        "mips64el"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-ppc64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.25.10.tgz",
      "integrity": "sha512-NLinzzOgZQsGpsTkEbdJTCanwA5/wozN9dSgEl12haXJBzMTpssebuXR42bthOF3z7zXFWH1AmvWunUCkBE4EA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-riscv64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.25.10.tgz",
      "integrity": "sha512-FE557XdZDrtX8NMIeA8LBJX3dC2M8VGXwfrQWU7LB5SLOajfJIxmSdyL/gU1m64Zs9CBKvm4UAuBp5aJ8OgnrA==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-s390x": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.25.10.tgz",
      "integrity": "sha512-3BBSbgzuB9ajLoVZk0mGu+EHlBwkusRmeNYdqmznmMc9zGASFjSsxgkNsqmXugpPk00gJ0JNKh/97nxmjctdew==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-x64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.10.tgz",
      "integrity": "sha512-QSX81KhFoZGwenVyPoberggdW1nrQZSvfVDAIUXr3WqLRZGZqWk/P4T8p2SP+de2Sr5HPcvjhcJzEiulKgnxtA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/netbsd-arm64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-arm64/-/netbsd-arm64-0.25.10.tgz",
      "integrity": "sha512-AKQM3gfYfSW8XRk8DdMCzaLUFB15dTrZfnX8WXQoOUpUBQ+NaAFCP1kPS/ykbbGYz7rxn0WS48/81l9hFl3u4A==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/netbsd-x64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.25.10.tgz",
      "integrity": "sha512-7RTytDPGU6fek/hWuN9qQpeGPBZFfB4zZgcz2VK2Z5VpdUxEI8JKYsg3JfO0n/Z1E/6l05n0unDCNc4HnhQGig==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openbsd-arm64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-arm64/-/openbsd-arm64-0.25.10.tgz",
      "integrity": "sha512-5Se0VM9Wtq797YFn+dLimf2Zx6McttsH2olUBsDml+lm0GOCRVebRWUvDtkY4BWYv/3NgzS8b/UM3jQNh5hYyw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openbsd-x64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.25.10.tgz",
      "integrity": "sha512-XkA4frq1TLj4bEMB+2HnI0+4RnjbuGZfet2gs/LNs5Hc7D89ZQBHQ0gL2ND6Lzu1+QVkjp3x1gIcPKzRNP8bXw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openharmony-arm64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/openharmony-arm64/-/openharmony-arm64-0.25.10.tgz",
      "integrity": "sha512-AVTSBhTX8Y/Fz6OmIVBip9tJzZEUcY8WLh7I59+upa5/GPhh2/aM6bvOMQySspnCCHvFi79kMtdJS1w0DXAeag==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/sunos-x64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.25.10.tgz",
      "integrity": "sha512-fswk3XT0Uf2pGJmOpDB7yknqhVkJQkAQOcW/ccVOtfx05LkbWOaRAtn5SaqXypeKQra1QaEa841PgrSL9ubSPQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "sunos"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-arm64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.25.10.tgz",
      "integrity": "sha512-ah+9b59KDTSfpaCg6VdJoOQvKjI33nTaQr4UluQwW7aEwZQsbMCfTmfEO4VyewOxx4RaDT/xCy9ra2GPWmO7Kw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-ia32": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.25.10.tgz",
      "integrity": "sha512-QHPDbKkrGO8/cz9LKVnJU22HOi4pxZnZhhA2HYHez5Pz4JeffhDjf85E57Oyco163GnzNCVkZK0b/n4Y0UHcSw==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-x64": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.25.10.tgz",
      "integrity": "sha512-9KpxSVFCu0iK1owoez6aC/s/EdUQLDN3adTxGCqxMVhrPDj6bt5dbrHDXUuq+Bs2vATFBBrQS5vdQ/Ed2P+nbw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@eslint-community/eslint-utils": {
      "version": "4.9.0",
      "resolved": "https://registry.npmjs.org/@eslint-community/eslint-utils/-/eslint-utils-4.9.0.tgz",
      "integrity": "sha512-ayVFHdtZ+hsq1t2Dy24wCmGXGe4q9Gu3smhLYALJrr473ZH27MsnSL+LKUlimp4BWJqMDMLmPpx/Q9R3OAlL4g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "eslint-visitor-keys": "^3.4.3"
      },
      "engines": {
        "node": "^12.22.0 || ^14.17.0 || >=16.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      },
      "peerDependencies": {
        "eslint": "^6.0.0 || ^7.0.0 || >=8.0.0"
      }
    },
    "node_modules/@eslint-community/eslint-utils/node_modules/eslint-visitor-keys": {
      "version": "3.4.3",
      "resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-3.4.3.tgz",
      "integrity": "sha512-wpc+LXeiyiisxPlEkUzU6svyS1frIO3Mgxj1fdy7Pm8Ygzguax2N3Fa/D/ag1WqbOprdI+uY6wMUl8/a2G+iag==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^12.22.0 || ^14.17.0 || >=16.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/@eslint-community/regexpp": {
      "version": "4.12.1",
      "resolved": "https://registry.npmjs.org/@eslint-community/regexpp/-/regexpp-4.12.1.tgz",
      "integrity": "sha512-CCZCDJuduB9OUkFkY2IgppNZMi2lBQgD2qzwXkEia16cge2pijY/aXi96CJMquDMn3nJdlPV1A5KrJEXwfLNzQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^12.0.0 || ^14.0.0 || >=16.0.0"
      }
    },
    "node_modules/@eslint/config-array": {
      "version": "0.21.0",
      "resolved": "https://registry.npmjs.org/@eslint/config-array/-/config-array-0.21.0.tgz",
      "integrity": "sha512-ENIdc4iLu0d93HeYirvKmrzshzofPw6VkZRKQGe9Nv46ZnWUzcF1xV01dcvEg/1wXUR61OmmlSfyeyO7EvjLxQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/object-schema": "^2.1.6",
        "debug": "^4.3.1",
        "minimatch": "^3.1.2"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@eslint/config-helpers": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/@eslint/config-helpers/-/config-helpers-0.4.0.tgz",
      "integrity": "sha512-WUFvV4WoIwW8Bv0KeKCIIEgdSiFOsulyN0xrMu+7z43q/hkOLXjvb5u7UC9jDxvRzcrbEmuZBX5yJZz1741jog==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/core": "^0.16.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@eslint/core": {
      "version": "0.16.0",
      "resolved": "https://registry.npmjs.org/@eslint/core/-/core-0.16.0.tgz",
      "integrity": "sha512-nmC8/totwobIiFcGkDza3GIKfAw1+hLiYVrh3I1nIomQ8PEr5cxg34jnkmGawul/ep52wGRAcyeDCNtWKSOj4Q==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@types/json-schema": "^7.0.15"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@eslint/eslintrc": {
      "version": "3.3.1",
      "resolved": "https://registry.npmjs.org/@eslint/eslintrc/-/eslintrc-3.3.1.tgz",
      "integrity": "sha512-gtF186CXhIl1p4pJNGZw8Yc6RlshoePRvE0X91oPGb3vZ8pM3qOS9W9NGPat9LziaBV7XrJWGylNQXkGcnM3IQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ajv": "^6.12.4",
        "debug": "^4.3.2",
        "espree": "^10.0.1",
        "globals": "^14.0.0",
        "ignore": "^5.2.0",
        "import-fresh": "^3.2.1",
        "js-yaml": "^4.1.0",
        "minimatch": "^3.1.2",
        "strip-json-comments": "^3.1.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/@eslint/eslintrc/node_modules/globals": {
      "version": "14.0.0",
      "resolved": "https://registry.npmjs.org/globals/-/globals-14.0.0.tgz",
      "integrity": "sha512-oahGvuMGQlPw/ivIYBjVSrWAfWLBeku5tpPE2fOPLi+WHffIWbuh2tCjhyQhTBPMf5E9jDEH4FOmTYgYwbKwtQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/@eslint/js": {
      "version": "9.37.0",
      "resolved": "https://registry.npmjs.org/@eslint/js/-/js-9.37.0.tgz",
      "integrity": "sha512-jaS+NJ+hximswBG6pjNX0uEJZkrT0zwpVi3BA3vX22aFGjJjmgSTSmPpZCRKmoBL5VY/M6p0xsSJx7rk7sy5gg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://eslint.org/donate"
      }
    },
    "node_modules/@eslint/object-schema": {
      "version": "2.1.6",
      "resolved": "https://registry.npmjs.org/@eslint/object-schema/-/object-schema-2.1.6.tgz",
      "integrity": "sha512-RBMg5FRL0I0gs51M/guSAj5/e14VQ4tpZnQNWwuDT66P14I43ItmPfIZRhO9fUVIPOAQXU47atlywZ/czoqFPA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@eslint/plugin-kit": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/@eslint/plugin-kit/-/plugin-kit-0.4.0.tgz",
      "integrity": "sha512-sB5uyeq+dwCWyPi31B2gQlVlo+j5brPlWx4yZBrEaRo/nhdDE8Xke1gsGgtiBdaBTxuTkceLVuVt/pclrasb0A==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/core": "^0.16.0",
        "levn": "^0.4.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@humanfs/core": {
      "version": "0.19.1",
      "resolved": "https://registry.npmjs.org/@humanfs/core/-/core-0.19.1.tgz",
      "integrity": "sha512-5DyQ4+1JEUzejeK1JGICcideyfUbGixgS9jNgex5nqkW+cY7WZhxBigmieN5Qnw9ZosSNVC9KQKyb+GUaGyKUA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=18.18.0"
      }
    },
    "node_modules/@humanfs/node": {
      "version": "0.16.7",
      "resolved": "https://registry.npmjs.org/@humanfs/node/-/node-0.16.7.tgz",
      "integrity": "sha512-/zUx+yOsIrG4Y43Eh2peDeKCxlRt/gET6aHfaKpuq267qXdYDFViVHfMaLyygZOnl0kGWxFIgsBy8QFuTLUXEQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@humanfs/core": "^0.19.1",
        "@humanwhocodes/retry": "^0.4.0"
      },
      "engines": {
        "node": ">=18.18.0"
      }
    },
    "node_modules/@humanwhocodes/module-importer": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@humanwhocodes/module-importer/-/module-importer-1.0.1.tgz",
      "integrity": "sha512-bxveV4V8v5Yb4ncFTT3rPSgZBOpCkjfK0y4oVVVJwIuDVBRMDXrPyXRL988i5ap9m9bnyEEjWfm5WkBmtffLfA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=12.22"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/nzakas"
      }
    },
    "node_modules/@humanwhocodes/retry": {
      "version": "0.4.3",
      "resolved": "https://registry.npmjs.org/@humanwhocodes/retry/-/retry-0.4.3.tgz",
      "integrity": "sha512-bV0Tgo9K4hfPCek+aMAn81RppFKv2ySDQeMoSZuvTASywNTnVJCArCZE2FWqpvIatKu7VMRLWlR1EazvVhDyhQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=18.18"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/nzakas"
      }
    },
    "node_modules/@jridgewell/gen-mapping": {
      "version": "0.3.13",
      "resolved": "https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz",
      "integrity": "sha512-2kkt/7niJ6MgEPxF0bYdQ6etZaA+fQvDcLKckhy1yIQOzaoKjBBjSj63/aLVjYE3qhRt5dvM+uUyfCg6UKCBbA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/sourcemap-codec": "^1.5.0",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/remapping": {
      "version": "2.3.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/remapping/-/remapping-2.3.5.tgz",
      "integrity": "sha512-LI9u/+laYG4Ds1TDKSJW2YPrIlcVYOwi2fUC6xB43lueCjgxV4lffOCZCtYFiH6TNOX+tQKXx97T4IKHbhyHEQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/gen-mapping": "^0.3.5",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/resolve-uri": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz",
      "integrity": "sha512-bRISgCIjP20/tbWSPWMEi54QVPRZExkuD9lJL+UIxUKtwVJA8wW1Trb1jMs1RFXo1CBTNZ/5hpC9QvmKWdopKw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@jridgewell/source-map": {
      "version": "0.3.11",
      "resolved": "https://registry.npmjs.org/@jridgewell/source-map/-/source-map-0.3.11.tgz",
      "integrity": "sha512-ZMp1V8ZFcPG5dIWnQLr3NSI1MiCU7UETdS/A0G8V/XWHvJv3ZsFqutJn1Y5RPmAPX6F3BiE397OqveU/9NCuIA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/gen-mapping": "^0.3.5",
        "@jridgewell/trace-mapping": "^0.3.25"
      }
    },
    "node_modules/@jridgewell/sourcemap-codec": {
      "version": "1.5.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz",
      "integrity": "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@jridgewell/trace-mapping": {
      "version": "0.3.31",
      "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz",
      "integrity": "sha512-zzNR+SdQSDJzc8joaeP8QQoCQr8NuYx2dIIytl1QeBEZHJ9uW6hebsrYgbz8hJwUQao3TWCMtmfV8Nu1twOLAw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/resolve-uri": "^3.1.0",
        "@jridgewell/sourcemap-codec": "^1.4.14"
      }
    },
    "node_modules/@reactflow/background": {
      "version": "11.3.14",
      "resolved": "https://registry.npmjs.org/@reactflow/background/-/background-11.3.14.tgz",
      "integrity": "sha512-Gewd7blEVT5Lh6jqrvOgd4G6Qk17eGKQfsDXgyRSqM+CTwDqRldG2LsWN4sNeno6sbqVIC2fZ+rAUBFA9ZEUDA==",
      "license": "MIT",
      "dependencies": {
        "@reactflow/core": "11.11.4",
        "classcat": "^5.0.3",
        "zustand": "^4.4.1"
      },
      "peerDependencies": {
        "react": ">=17",
        "react-dom": ">=17"
      }
    },
    "node_modules/@reactflow/controls": {
      "version": "11.2.14",
      "resolved": "https://registry.npmjs.org/@reactflow/controls/-/controls-11.2.14.tgz",
      "integrity": "sha512-MiJp5VldFD7FrqaBNIrQ85dxChrG6ivuZ+dcFhPQUwOK3HfYgX2RHdBua+gx+40p5Vw5It3dVNp/my4Z3jF0dw==",
      "license": "MIT",
      "dependencies": {
        "@reactflow/core": "11.11.4",
        "classcat": "^5.0.3",
        "zustand": "^4.4.1"
      },
      "peerDependencies": {
        "react": ">=17",
        "react-dom": ">=17"
      }
    },
    "node_modules/@reactflow/core": {
      "version": "11.11.4",
      "resolved": "https://registry.npmjs.org/@reactflow/core/-/core-11.11.4.tgz",
      "integrity": "sha512-H4vODklsjAq3AMq6Np4LE12i1I4Ta9PrDHuBR9GmL8uzTt2l2jh4CiQbEMpvMDcp7xi4be0hgXj+Ysodde/i7Q==",
      "license": "MIT",
      "dependencies": {
        "@types/d3": "^7.4.0",
        "@types/d3-drag": "^3.0.1",
        "@types/d3-selection": "^3.0.3",
        "@types/d3-zoom": "^3.0.1",
        "classcat": "^5.0.3",
        "d3-drag": "^3.0.0",
        "d3-selection": "^3.0.0",
        "d3-zoom": "^3.0.0",
        "zustand": "^4.4.1"
      },
      "peerDependencies": {
        "react": ">=17",
        "react-dom": ">=17"
      }
    },
    "node_modules/@reactflow/minimap": {
      "version": "11.7.14",
      "resolved": "https://registry.npmjs.org/@reactflow/minimap/-/minimap-11.7.14.tgz",
      "integrity": "sha512-mpwLKKrEAofgFJdkhwR5UQ1JYWlcAAL/ZU/bctBkuNTT1yqV+y0buoNVImsRehVYhJwffSWeSHaBR5/GJjlCSQ==",
      "license": "MIT",
      "dependencies": {
        "@reactflow/core": "11.11.4",
        "@types/d3-selection": "^3.0.3",
        "@types/d3-zoom": "^3.0.1",
        "classcat": "^5.0.3",
        "d3-selection": "^3.0.0",
        "d3-zoom": "^3.0.0",
        "zustand": "^4.4.1"
      },
      "peerDependencies": {
        "react": ">=17",
        "react-dom": ">=17"
      }
    },
    "node_modules/@reactflow/node-resizer": {
      "version": "2.2.14",
      "resolved": "https://registry.npmjs.org/@reactflow/node-resizer/-/node-resizer-2.2.14.tgz",
      "integrity": "sha512-fwqnks83jUlYr6OHcdFEedumWKChTHRGw/kbCxj0oqBd+ekfs+SIp4ddyNU0pdx96JIm5iNFS0oNrmEiJbbSaA==",
      "license": "MIT",
      "dependencies": {
        "@reactflow/core": "11.11.4",
        "classcat": "^5.0.4",
        "d3-drag": "^3.0.0",
        "d3-selection": "^3.0.0",
        "zustand": "^4.4.1"
      },
      "peerDependencies": {
        "react": ">=17",
        "react-dom": ">=17"
      }
    },
    "node_modules/@reactflow/node-toolbar": {
      "version": "1.3.14",
      "resolved": "https://registry.npmjs.org/@reactflow/node-toolbar/-/node-toolbar-1.3.14.tgz",
      "integrity": "sha512-rbynXQnH/xFNu4P9H+hVqlEUafDCkEoCy0Dg9mG22Sg+rY/0ck6KkrAQrYrTgXusd+cEJOMK0uOOFCK2/5rSGQ==",
      "license": "MIT",
      "dependencies": {
        "@reactflow/core": "11.11.4",
        "classcat": "^5.0.3",
        "zustand": "^4.4.1"
      },
      "peerDependencies": {
        "react": ">=17",
        "react-dom": ">=17"
      }
    },
    "node_modules/@rolldown/pluginutils": {
      "version": "1.0.0-beta.38",
      "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.0-beta.38.tgz",
      "integrity": "sha512-N/ICGKleNhA5nc9XXQG/kkKHJ7S55u0x0XUJbbkmdCnFuoRkM1Il12q9q0eX19+M7KKUEPw/daUPIRnxhcxAIw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@rollup/rollup-android-arm-eabi": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm-eabi/-/rollup-android-arm-eabi-4.52.4.tgz",
      "integrity": "sha512-BTm2qKNnWIQ5auf4deoetINJm2JzvihvGb9R6K/ETwKLql/Bb3Eg2H1FBp1gUb4YGbydMA3jcmQTR73q7J+GAA==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ]
    },
    "node_modules/@rollup/rollup-android-arm64": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm64/-/rollup-android-arm64-4.52.4.tgz",
      "integrity": "sha512-P9LDQiC5vpgGFgz7GSM6dKPCiqR3XYN1WwJKA4/BUVDjHpYsf3iBEmVz62uyq20NGYbiGPR5cNHI7T1HqxNs2w==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ]
    },
    "node_modules/@rollup/rollup-darwin-arm64": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-arm64/-/rollup-darwin-arm64-4.52.4.tgz",
      "integrity": "sha512-QRWSW+bVccAvZF6cbNZBJwAehmvG9NwfWHwMy4GbWi/BQIA/laTIktebT2ipVjNncqE6GLPxOok5hsECgAxGZg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ]
    },
    "node_modules/@rollup/rollup-darwin-x64": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-x64/-/rollup-darwin-x64-4.52.4.tgz",
      "integrity": "sha512-hZgP05pResAkRJxL1b+7yxCnXPGsXU0fG9Yfd6dUaoGk+FhdPKCJ5L1Sumyxn8kvw8Qi5PvQ8ulenUbRjzeCTw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ]
    },
    "node_modules/@rollup/rollup-freebsd-arm64": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-arm64/-/rollup-freebsd-arm64-4.52.4.tgz",
      "integrity": "sha512-xmc30VshuBNUd58Xk4TKAEcRZHaXlV+tCxIXELiE9sQuK3kG8ZFgSPi57UBJt8/ogfhAF5Oz4ZSUBN77weM+mQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ]
    },
    "node_modules/@rollup/rollup-freebsd-x64": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-x64/-/rollup-freebsd-x64-4.52.4.tgz",
      "integrity": "sha512-WdSLpZFjOEqNZGmHflxyifolwAiZmDQzuOzIq9L27ButpCVpD7KzTRtEG1I0wMPFyiyUdOO+4t8GvrnBLQSwpw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm-gnueabihf": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-gnueabihf/-/rollup-linux-arm-gnueabihf-4.52.4.tgz",
      "integrity": "sha512-xRiOu9Of1FZ4SxVbB0iEDXc4ddIcjCv2aj03dmW8UrZIW7aIQ9jVJdLBIhxBI+MaTnGAKyvMwPwQnoOEvP7FgQ==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm-musleabihf": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-musleabihf/-/rollup-linux-arm-musleabihf-4.52.4.tgz",
      "integrity": "sha512-FbhM2p9TJAmEIEhIgzR4soUcsW49e9veAQCziwbR+XWB2zqJ12b4i/+hel9yLiD8pLncDH4fKIPIbt5238341Q==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm64-gnu": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-gnu/-/rollup-linux-arm64-gnu-4.52.4.tgz",
      "integrity": "sha512-4n4gVwhPHR9q/g8lKCyz0yuaD0MvDf7dV4f9tHt0C73Mp8h38UCtSCSE6R9iBlTbXlmA8CjpsZoujhszefqueg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm64-musl": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-musl/-/rollup-linux-arm64-musl-4.52.4.tgz",
      "integrity": "sha512-u0n17nGA0nvi/11gcZKsjkLj1QIpAuPFQbR48Subo7SmZJnGxDpspyw2kbpuoQnyK+9pwf3pAoEXerJs/8Mi9g==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-loong64-gnu": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-gnu/-/rollup-linux-loong64-gnu-4.52.4.tgz",
      "integrity": "sha512-0G2c2lpYtbTuXo8KEJkDkClE/+/2AFPdPAbmaHoE870foRFs4pBrDehilMcrSScrN/fB/1HTaWO4bqw+ewBzMQ==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-ppc64-gnu": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-gnu/-/rollup-linux-ppc64-gnu-4.52.4.tgz",
      "integrity": "sha512-teSACug1GyZHmPDv14VNbvZFX779UqWTsd7KtTM9JIZRDI5NUwYSIS30kzI8m06gOPB//jtpqlhmraQ68b5X2g==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-riscv64-gnu": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-gnu/-/rollup-linux-riscv64-gnu-4.52.4.tgz",
      "integrity": "sha512-/MOEW3aHjjs1p4Pw1Xk4+3egRevx8Ji9N6HUIA1Ifh8Q+cg9dremvFCUbOX2Zebz80BwJIgCBUemjqhU5XI5Eg==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-riscv64-musl": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-musl/-/rollup-linux-riscv64-musl-4.52.4.tgz",
      "integrity": "sha512-1HHmsRyh845QDpEWzOFtMCph5Ts+9+yllCrREuBR/vg2RogAQGGBRC8lDPrPOMnrdOJ+mt1WLMOC2Kao/UwcvA==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-s390x-gnu": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-s390x-gnu/-/rollup-linux-s390x-gnu-4.52.4.tgz",
      "integrity": "sha512-seoeZp4L/6D1MUyjWkOMRU6/iLmCU2EjbMTyAG4oIOs1/I82Y5lTeaxW0KBfkUdHAWN7j25bpkt0rjnOgAcQcA==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-x64-gnu": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu/-/rollup-linux-x64-gnu-4.52.4.tgz",
      "integrity": "sha512-Wi6AXf0k0L7E2gteNsNHUs7UMwCIhsCTs6+tqQ5GPwVRWMaflqGec4Sd8n6+FNFDw9vGcReqk2KzBDhCa1DLYg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-x64-musl": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-musl/-/rollup-linux-x64-musl-4.52.4.tgz",
      "integrity": "sha512-dtBZYjDmCQ9hW+WgEkaffvRRCKm767wWhxsFW3Lw86VXz/uJRuD438/XvbZT//B96Vs8oTA8Q4A0AfHbrxP9zw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-openharmony-arm64": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-openharmony-arm64/-/rollup-openharmony-arm64-4.52.4.tgz",
      "integrity": "sha512-1ox+GqgRWqaB1RnyZXL8PD6E5f7YyRUJYnCqKpNzxzP0TkaUh112NDrR9Tt+C8rJ4x5G9Mk8PQR3o7Ku2RKqKA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ]
    },
    "node_modules/@rollup/rollup-win32-arm64-msvc": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc/-/rollup-win32-arm64-msvc-4.52.4.tgz",
      "integrity": "sha512-8GKr640PdFNXwzIE0IrkMWUNUomILLkfeHjXBi/nUvFlpZP+FA8BKGKpacjW6OUUHaNI6sUURxR2U2g78FOHWQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-ia32-msvc": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc/-/rollup-win32-ia32-msvc-4.52.4.tgz",
      "integrity": "sha512-AIy/jdJ7WtJ/F6EcfOb2GjR9UweO0n43jNObQMb6oGxkYTfLcnN7vYYpG+CN3lLxrQkzWnMOoNSHTW54pgbVxw==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-x64-gnu": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.52.4.tgz",
      "integrity": "sha512-UF9KfsH9yEam0UjTwAgdK0anlQ7c8/pWPU2yVjyWcF1I1thABt6WXE47cI71pGiZ8wGvxohBoLnxM04L/wj8mQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-x64-msvc": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.52.4.tgz",
      "integrity": "sha512-bf9PtUa0u8IXDVxzRToFQKsNCRz9qLYfR/MpECxl4mRoWYjAeFjgxj1XdZr2M/GNVpT05p+LgQOHopYDlUu6/w==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@tisoap/react-flow-smart-edge": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/@tisoap/react-flow-smart-edge/-/react-flow-smart-edge-3.0.0.tgz",
      "integrity": "sha512-XtEQT0IrOqPwJvCzgEoj3Y16/EK4SOcjZO7FmOPU+qJWmgYjeTyv7J35CGm6dFeJYdZ2gHDrvQ1zwaXuo23/8g==",
      "license": "MIT",
      "dependencies": {
        "pathfinding": "0.4.18"
      },
      "engines": {
        "node": ">=16",
        "npm": "^8.0.0"
      },
      "peerDependencies": {
        "react": ">=17",
        "react-dom": ">=17",
        "reactflow": ">=11",
        "typescript": ">=4.6"
      }
    },
    "node_modules/@types/babel__core": {
      "version": "7.20.5",
      "resolved": "https://registry.npmjs.org/@types/babel__core/-/babel__core-7.20.5.tgz",
      "integrity": "sha512-qoQprZvz5wQFJwMDqeseRXWv3rqMvhgpbXFfVyWhbx9X47POIA6i/+dXefEmZKoAgOaTdaIgNSMqMIU61yRyzA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.20.7",
        "@babel/types": "^7.20.7",
        "@types/babel__generator": "*",
        "@types/babel__template": "*",
        "@types/babel__traverse": "*"
      }
    },
    "node_modules/@types/babel__generator": {
      "version": "7.27.0",
      "resolved": "https://registry.npmjs.org/@types/babel__generator/-/babel__generator-7.27.0.tgz",
      "integrity": "sha512-ufFd2Xi92OAVPYsy+P4n7/U7e68fex0+Ee8gSG9KX7eo084CWiQ4sdxktvdl0bOPupXtVJPY19zk6EwWqUQ8lg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.0.0"
      }
    },
    "node_modules/@types/babel__template": {
      "version": "7.4.4",
      "resolved": "https://registry.npmjs.org/@types/babel__template/-/babel__template-7.4.4.tgz",
      "integrity": "sha512-h/NUaSyG5EyxBIp8YRxo4RMe2/qQgvyowRwVMzhYhBCONbW8PUsg4lkFMrhgZhUe5z3L3MiLDuvyJ/CaPa2A8A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.1.0",
        "@babel/types": "^7.0.0"
      }
    },
    "node_modules/@types/babel__traverse": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@types/babel__traverse/-/babel__traverse-7.28.0.tgz",
      "integrity": "sha512-8PvcXf70gTDZBgt9ptxJ8elBeBjcLOAcOtoO/mPJjtji1+CdGbHgm77om1GrsPxsiE+uXIpNSK64UYaIwQXd4Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.28.2"
      }
    },
    "node_modules/@types/d3": {
      "version": "7.4.3",
      "resolved": "https://registry.npmjs.org/@types/d3/-/d3-7.4.3.tgz",
      "integrity": "sha512-lZXZ9ckh5R8uiFVt8ogUNf+pIrK4EsWrx2Np75WvF/eTpJ0FMHNhjXk8CKEx/+gpHbNQyJWehbFaTvqmHWB3ww==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-array": "*",
        "@types/d3-axis": "*",
        "@types/d3-brush": "*",
        "@types/d3-chord": "*",
        "@types/d3-color": "*",
        "@types/d3-contour": "*",
        "@types/d3-delaunay": "*",
        "@types/d3-dispatch": "*",
        "@types/d3-drag": "*",
        "@types/d3-dsv": "*",
        "@types/d3-ease": "*",
        "@types/d3-fetch": "*",
        "@types/d3-force": "*",
        "@types/d3-format": "*",
        "@types/d3-geo": "*",
        "@types/d3-hierarchy": "*",
        "@types/d3-interpolate": "*",
        "@types/d3-path": "*",
        "@types/d3-polygon": "*",
        "@types/d3-quadtree": "*",
        "@types/d3-random": "*",
        "@types/d3-scale": "*",
        "@types/d3-scale-chromatic": "*",
        "@types/d3-selection": "*",
        "@types/d3-shape": "*",
        "@types/d3-time": "*",
        "@types/d3-time-format": "*",
        "@types/d3-timer": "*",
        "@types/d3-transition": "*",
        "@types/d3-zoom": "*"
      }
    },
    "node_modules/@types/d3-array": {
      "version": "3.2.2",
      "resolved": "https://registry.npmjs.org/@types/d3-array/-/d3-array-3.2.2.tgz",
      "integrity": "sha512-hOLWVbm7uRza0BYXpIIW5pxfrKe0W+D5lrFiAEYR+pb6w3N2SwSMaJbXdUfSEv+dT4MfHBLtn5js0LAWaO6otw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-axis": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-axis/-/d3-axis-3.0.6.tgz",
      "integrity": "sha512-pYeijfZuBd87T0hGn0FO1vQ/cgLk6E1ALJjfkC0oJ8cbwkZl3TpgS8bVBLZN+2jjGgg38epgxb2zmoGtSfvgMw==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/d3-brush": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-brush/-/d3-brush-3.0.6.tgz",
      "integrity": "sha512-nH60IZNNxEcrh6L1ZSMNA28rj27ut/2ZmI3r96Zd+1jrZD++zD3LsMIjWlvg4AYrHn/Pqz4CF3veCxGjtbqt7A==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/d3-chord": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-chord/-/d3-chord-3.0.6.tgz",
      "integrity": "sha512-LFYWWd8nwfwEmTZG9PfQxd17HbNPksHBiJHaKuY1XeqscXacsS2tyoo6OdRsjf+NQYeB6XrNL3a25E3gH69lcg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-color": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/@types/d3-color/-/d3-color-3.1.3.tgz",
      "integrity": "sha512-iO90scth9WAbmgv7ogoq57O9YpKmFBbmoEoCHDB2xMBY0+/KVrqAaCDyCE16dUspeOvIxFFRI+0sEtqDqy2b4A==",
      "license": "MIT"
    },
    "node_modules/@types/d3-contour": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-contour/-/d3-contour-3.0.6.tgz",
      "integrity": "sha512-BjzLgXGnCWjUSYGfH1cpdo41/hgdWETu4YxpezoztawmqsvCeep+8QGfiY6YbDvfgHz/DkjeIkkZVJavB4a3rg==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-array": "*",
        "@types/geojson": "*"
      }
    },
    "node_modules/@types/d3-delaunay": {
      "version": "6.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-delaunay/-/d3-delaunay-6.0.4.tgz",
      "integrity": "sha512-ZMaSKu4THYCU6sV64Lhg6qjf1orxBthaC161plr5KuPHo3CNm8DTHiLw/5Eq2b6TsNP0W0iJrUOFscY6Q450Hw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-dispatch": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/@types/d3-dispatch/-/d3-dispatch-3.0.7.tgz",
      "integrity": "sha512-5o9OIAdKkhN1QItV2oqaE5KMIiXAvDWBDPrD85e58Qlz1c1kI/J0NcqbEG88CoTwJrYe7ntUCVfeUl2UJKbWgA==",
      "license": "MIT"
    },
    "node_modules/@types/d3-drag": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/@types/d3-drag/-/d3-drag-3.0.7.tgz",
      "integrity": "sha512-HE3jVKlzU9AaMazNufooRJ5ZpWmLIoc90A37WU2JMmeq28w1FQqCZswHZ3xR+SuxYftzHq6WU6KJHvqxKzTxxQ==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/d3-dsv": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/@types/d3-dsv/-/d3-dsv-3.0.7.tgz",
      "integrity": "sha512-n6QBF9/+XASqcKK6waudgL0pf/S5XHPPI8APyMLLUHd8NqouBGLsU8MgtO7NINGtPBtk9Kko/W4ea0oAspwh9g==",
      "license": "MIT"
    },
    "node_modules/@types/d3-ease": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/@types/d3-ease/-/d3-ease-3.0.2.tgz",
      "integrity": "sha512-NcV1JjO5oDzoK26oMzbILE6HW7uVXOHLQvHshBUW4UMdZGfiY6v5BeQwh9a9tCzv+CeefZQHJt5SRgK154RtiA==",
      "license": "MIT"
    },
    "node_modules/@types/d3-fetch": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/@types/d3-fetch/-/d3-fetch-3.0.7.tgz",
      "integrity": "sha512-fTAfNmxSb9SOWNB9IoG5c8Hg6R+AzUHDRlsXsDZsNp6sxAEOP0tkP3gKkNSO/qmHPoBFTxNrjDprVHDQDvo5aA==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-dsv": "*"
      }
    },
    "node_modules/@types/d3-force": {
      "version": "3.0.10",
      "resolved": "https://registry.npmjs.org/@types/d3-force/-/d3-force-3.0.10.tgz",
      "integrity": "sha512-ZYeSaCF3p73RdOKcjj+swRlZfnYpK1EbaDiYICEEp5Q6sUiqFaFQ9qgoshp5CzIyyb/yD09kD9o2zEltCexlgw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-format": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-format/-/d3-format-3.0.4.tgz",
      "integrity": "sha512-fALi2aI6shfg7vM5KiR1wNJnZ7r6UuggVqtDA+xiEdPZQwy/trcQaHnwShLuLdta2rTymCNpxYTiMZX/e09F4g==",
      "license": "MIT"
    },
    "node_modules/@types/d3-geo": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/@types/d3-geo/-/d3-geo-3.1.0.tgz",
      "integrity": "sha512-856sckF0oP/diXtS4jNsiQw/UuK5fQG8l/a9VVLeSouf1/PPbBE1i1W852zVwKwYCBkFJJB7nCFTbk6UMEXBOQ==",
      "license": "MIT",
      "dependencies": {
        "@types/geojson": "*"
      }
    },
    "node_modules/@types/d3-hierarchy": {
      "version": "3.1.7",
      "resolved": "https://registry.npmjs.org/@types/d3-hierarchy/-/d3-hierarchy-3.1.7.tgz",
      "integrity": "sha512-tJFtNoYBtRtkNysX1Xq4sxtjK8YgoWUNpIiUee0/jHGRwqvzYxkq0hGVbbOGSz+JgFxxRu4K8nb3YpG3CMARtg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-interpolate": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-interpolate/-/d3-interpolate-3.0.4.tgz",
      "integrity": "sha512-mgLPETlrpVV1YRJIglr4Ez47g7Yxjl1lj7YKsiMCb27VJH9W8NVM6Bb9d8kkpG/uAQS5AmbA48q2IAolKKo1MA==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-color": "*"
      }
    },
    "node_modules/@types/d3-path": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/@types/d3-path/-/d3-path-3.1.1.tgz",
      "integrity": "sha512-VMZBYyQvbGmWyWVea0EHs/BwLgxc+MKi1zLDCONksozI4YJMcTt8ZEuIR4Sb1MMTE8MMW49v0IwI5+b7RmfWlg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-polygon": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/@types/d3-polygon/-/d3-polygon-3.0.2.tgz",
      "integrity": "sha512-ZuWOtMaHCkN9xoeEMr1ubW2nGWsp4nIql+OPQRstu4ypeZ+zk3YKqQT0CXVe/PYqrKpZAi+J9mTs05TKwjXSRA==",
      "license": "MIT"
    },
    "node_modules/@types/d3-quadtree": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-quadtree/-/d3-quadtree-3.0.6.tgz",
      "integrity": "sha512-oUzyO1/Zm6rsxKRHA1vH0NEDG58HrT5icx/azi9MF1TWdtttWl0UIUsjEQBBh+SIkrpd21ZjEv7ptxWys1ncsg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-random": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/@types/d3-random/-/d3-random-3.0.3.tgz",
      "integrity": "sha512-Imagg1vJ3y76Y2ea0871wpabqp613+8/r0mCLEBfdtqC7xMSfj9idOnmBYyMoULfHePJyxMAw3nWhJxzc+LFwQ==",
      "license": "MIT"
    },
    "node_modules/@types/d3-scale": {
      "version": "4.0.9",
      "resolved": "https://registry.npmjs.org/@types/d3-scale/-/d3-scale-4.0.9.tgz",
      "integrity": "sha512-dLmtwB8zkAeO/juAMfnV+sItKjlsw2lKdZVVy6LRr0cBmegxSABiLEpGVmSJJ8O08i4+sGR6qQtb6WtuwJdvVw==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-time": "*"
      }
    },
    "node_modules/@types/d3-scale-chromatic": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/@types/d3-scale-chromatic/-/d3-scale-chromatic-3.1.0.tgz",
      "integrity": "sha512-iWMJgwkK7yTRmWqRB5plb1kadXyQ5Sj8V/zYlFGMUBbIPKQScw+Dku9cAAMgJG+z5GYDoMjWGLVOvjghDEFnKQ==",
      "license": "MIT"
    },
    "node_modules/@types/d3-selection": {
      "version": "3.0.11",
      "resolved": "https://registry.npmjs.org/@types/d3-selection/-/d3-selection-3.0.11.tgz",
      "integrity": "sha512-bhAXu23DJWsrI45xafYpkQ4NtcKMwWnAC/vKrd2l+nxMFuvOT3XMYTIj2opv8vq8AO5Yh7Qac/nSeP/3zjTK0w==",
      "license": "MIT"
    },
    "node_modules/@types/d3-shape": {
      "version": "3.1.7",
      "resolved": "https://registry.npmjs.org/@types/d3-shape/-/d3-shape-3.1.7.tgz",
      "integrity": "sha512-VLvUQ33C+3J+8p+Daf+nYSOsjB4GXp19/S/aGo60m9h1v6XaxjiT82lKVWJCfzhtuZ3yD7i/TPeC/fuKLLOSmg==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-path": "*"
      }
    },
    "node_modules/@types/d3-time": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-time/-/d3-time-3.0.4.tgz",
      "integrity": "sha512-yuzZug1nkAAaBlBBikKZTgzCeA+k1uy4ZFwWANOfKw5z5LRhV0gNA7gNkKm7HoK+HRN0wX3EkxGk0fpbWhmB7g==",
      "license": "MIT"
    },
    "node_modules/@types/d3-time-format": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/@types/d3-time-format/-/d3-time-format-4.0.3.tgz",
      "integrity": "sha512-5xg9rC+wWL8kdDj153qZcsJ0FWiFt0J5RB6LYUNZjwSnesfblqrI/bJ1wBdJ8OQfncgbJG5+2F+qfqnqyzYxyg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-timer": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/@types/d3-timer/-/d3-timer-3.0.2.tgz",
      "integrity": "sha512-Ps3T8E8dZDam6fUyNiMkekK3XUsaUEik+idO9/YjPtfj2qruF8tFBXS7XhtE4iIXBLxhmLjP3SXpLhVf21I9Lw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-transition": {
      "version": "3.0.9",
      "resolved": "https://registry.npmjs.org/@types/d3-transition/-/d3-transition-3.0.9.tgz",
      "integrity": "sha512-uZS5shfxzO3rGlu0cC3bjmMFKsXv+SmZZcgp0KD22ts4uGXp5EVYGzu/0YdwZeKmddhcAccYtREJKkPfXkZuCg==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/d3-zoom": {
      "version": "3.0.8",
      "resolved": "https://registry.npmjs.org/@types/d3-zoom/-/d3-zoom-3.0.8.tgz",
      "integrity": "sha512-iqMC4/YlFCSlO8+2Ii1GGGliCAY4XdeG748w5vQUbevlbDu0zSjH/+jojorQVBK/se0j6DUFNPBGSqD3YWYnDw==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-interpolate": "*",
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/estree": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.8.tgz",
      "integrity": "sha512-dWHzHa2WqEXI/O1E9OjrocMTKJl2mSrEolh1Iomrv6U+JuNwaHXsXx9bLu5gG7BUWFIN0skIQJQ/L1rIex4X6w==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/geojson": {
      "version": "7946.0.16",
      "resolved": "https://registry.npmjs.org/@types/geojson/-/geojson-7946.0.16.tgz",
      "integrity": "sha512-6C8nqWur3j98U6+lXDfTUWIfgvZU+EumvpHKcYjujKH7woYyLj2sUmff0tRhrqM7BohUw7Pz3ZB1jj2gW9Fvmg==",
      "license": "MIT"
    },
    "node_modules/@types/json-schema": {
      "version": "7.0.15",
      "resolved": "https://registry.npmjs.org/@types/json-schema/-/json-schema-7.0.15.tgz",
      "integrity": "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/react": {
      "version": "19.2.2",
      "resolved": "https://registry.npmjs.org/@types/react/-/react-19.2.2.tgz",
      "integrity": "sha512-6mDvHUFSjyT2B2yeNx2nUgMxh9LtOWvkhIU3uePn2I2oyNymUAX1NIsdgviM4CH+JSrp2D2hsMvJOkxY+0wNRA==",
      "devOptional": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "csstype": "^3.0.2"
      }
    },
    "node_modules/@types/react-dom": {
      "version": "19.2.1",
      "resolved": "https://registry.npmjs.org/@types/react-dom/-/react-dom-19.2.1.tgz",
      "integrity": "sha512-/EEvYBdT3BflCWvTMO7YkYBHVE9Ci6XdqZciZANQgKpaiDRGOLIlRo91jbTNRQjgPFWVaRxcYc0luVNFitz57A==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "@types/react": "^19.2.0"
      }
    },
    "node_modules/@vitejs/plugin-react": {
      "version": "5.0.4",
      "resolved": "https://registry.npmjs.org/@vitejs/plugin-react/-/plugin-react-5.0.4.tgz",
      "integrity": "sha512-La0KD0vGkVkSk6K+piWDKRUyg8Rl5iAIKRMH0vMJI0Eg47bq1eOxmoObAaQG37WMW9MSyk7Cs8EIWwJC1PtzKA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/core": "^7.28.4",
        "@babel/plugin-transform-react-jsx-self": "^7.27.1",
        "@babel/plugin-transform-react-jsx-source": "^7.27.1",
        "@rolldown/pluginutils": "1.0.0-beta.38",
        "@types/babel__core": "^7.20.5",
        "react-refresh": "^0.17.0"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "peerDependencies": {
        "vite": "^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0"
      }
    },
    "node_modules/acorn": {
      "version": "8.15.0",
      "resolved": "https://registry.npmjs.org/acorn/-/acorn-8.15.0.tgz",
      "integrity": "sha512-NZyJarBfL7nWwIq+FDL6Zp/yHEhePMNnnJ0y3qfieCrmNvYct8uvtiV41UvlSe6apAfk0fY1FbWx+NwfmpvtTg==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "bin": {
        "acorn": "bin/acorn"
      },
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/acorn-jsx": {
      "version": "5.3.2",
      "resolved": "https://registry.npmjs.org/acorn-jsx/-/acorn-jsx-5.3.2.tgz",
      "integrity": "sha512-rq9s+JNhf0IChjtDXxllJ7g41oZk5SlXtp0LHwyA5cejwn7vKmKp4pPri6YEePv2PU65sAsegbXtIinmDFDXgQ==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "acorn": "^6.0.0 || ^7.0.0 || ^8.0.0"
      }
    },
    "node_modules/ajv": {
      "version": "6.12.6",
      "resolved": "https://registry.npmjs.org/ajv/-/ajv-6.12.6.tgz",
      "integrity": "sha512-j3fVLgvTo527anyYyJOGTYJbG+vnnQYvE0m5mmkc1TK+nxAppkCLMIL0aZ4dblVCNoGShhm+kzE4ZUykBoMg4g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fast-deep-equal": "^3.1.1",
        "fast-json-stable-stringify": "^2.0.0",
        "json-schema-traverse": "^0.4.1",
        "uri-js": "^4.2.2"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/epoberezkin"
      }
    },
    "node_modules/ansi-styles": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
      "integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "color-convert": "^2.0.1"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/argparse": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/argparse/-/argparse-2.0.1.tgz",
      "integrity": "sha512-8+9WqebbFzpX9OR+Wa6O29asIogeRMzcGtAINdpMHHyAg10f05aSFVBbcEqGf/PXw1EjAZ+q2/bEBg3DvurK3Q==",
      "dev": true,
      "license": "Python-2.0"
    },
    "node_modules/asynckit": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/asynckit/-/asynckit-0.4.0.tgz",
      "integrity": "sha512-Oei9OH4tRh0YqU3GxhX79dM/mwVgvbZJaSNaRk+bshkj0S5cfHcgYakreBjrHwatXKbz+IoIdYLxrKim2MjW0Q==",
      "license": "MIT"
    },
    "node_modules/axios": {
      "version": "1.13.1",
      "resolved": "https://registry.npmjs.org/axios/-/axios-1.13.1.tgz",
      "integrity": "sha512-hU4EGxxt+j7TQijx1oYdAjw4xuIp1wRQSsbMFwSthCWeBQur1eF+qJ5iQ5sN3Tw8YRzQNKb8jszgBdMDVqwJcw==",
      "license": "MIT",
      "dependencies": {
        "follow-redirects": "^1.15.6",
        "form-data": "^4.0.4",
        "proxy-from-env": "^1.1.0"
      }
    },
    "node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/baseline-browser-mapping": {
      "version": "2.8.16",
      "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.8.16.tgz",
      "integrity": "sha512-OMu3BGQ4E7P1ErFsIPpbJh0qvDudM/UuJeHgkAvfWe+0HFJCXh+t/l8L6fVLR55RI/UbKrVLnAXZSVwd9ysWYw==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "baseline-browser-mapping": "dist/cli.js"
      }
    },
    "node_modules/brace-expansion": {
      "version": "1.1.12",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.12.tgz",
      "integrity": "sha512-9T9UjW3r0UW5c1Q7GTwllptXwhvYmEzFhzMfZ9H7FQWt+uZePjZPjBP/W1ZEyZ1twGWom5/56TF4lPcqjnDHcg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    },
    "node_modules/browserslist": {
      "version": "4.26.3",
      "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.26.3.tgz",
      "integrity": "sha512-lAUU+02RFBuCKQPj/P6NgjlbCnLBMp4UtgTx7vNHd3XSIJF87s9a5rA3aH2yw3GS9DqZAUbOtZdCCiZeVRqt0w==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "baseline-browser-mapping": "^2.8.9",
        "caniuse-lite": "^1.0.30001746",
        "electron-to-chromium": "^1.5.227",
        "node-releases": "^2.0.21",
        "update-browserslist-db": "^1.1.3"
      },
      "bin": {
        "browserslist": "cli.js"
      },
      "engines": {
        "node": "^6 || ^7 || ^8 || ^9 || ^10 || ^11 || ^12 || >=13.7"
      }
    },
    "node_modules/buffer-from": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/buffer-from/-/buffer-from-1.1.2.tgz",
      "integrity": "sha512-E+XQCRwSbaaiChtv6k6Dwgc+bx+Bs6vuKJHHl5kox/BaKbhiXzqQOwK4cO22yElGp2OCmjwVhT3HmxgyPGnJfQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/call-bind-apply-helpers": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/callsites": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/callsites/-/callsites-3.1.0.tgz",
      "integrity": "sha512-P8BjAsXvZS+VIDUI11hHCQEv74YT67YUi5JJFNWIqL235sBmjX4+qx9Muvls5ivyNENctx46xQLQ3aTuE7ssaQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/caniuse-lite": {
      "version": "1.0.30001750",
      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001750.tgz",
      "integrity": "sha512-cuom0g5sdX6rw00qOoLNSFCJ9/mYIsuSOA+yzpDw8eopiFqcVwQvZHqov0vmEighRxX++cfC0Vg1G+1Iy/mSpQ==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/caniuse-lite"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "CC-BY-4.0"
    },
    "node_modules/chalk": {
      "version": "4.1.2",
      "resolved": "https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz",
      "integrity": "sha512-oKnbhFyRIXpUuez8iBMmyEa4nbj4IOQyuhc/wy9kY7/WVPcwIO9VA668Pu8RkO7+0G76SLROeyw9CpQ061i4mA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.1.0",
        "supports-color": "^7.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/chalk?sponsor=1"
      }
    },
    "node_modules/classcat": {
      "version": "5.0.5",
      "resolved": "https://registry.npmjs.org/classcat/-/classcat-5.0.5.tgz",
      "integrity": "sha512-JhZUT7JFcQy/EzW605k/ktHtncoo9vnyW/2GspNYwFlN1C/WmjuV/xtS04e9SOkL2sTdw0VAZ2UGCcQ9lR6p6w==",
      "license": "MIT"
    },
    "node_modules/color-convert": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz",
      "integrity": "sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "color-name": "~1.1.4"
      },
      "engines": {
        "node": ">=7.0.0"
      }
    },
    "node_modules/color-name": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz",
      "integrity": "sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/combined-stream": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/combined-stream/-/combined-stream-1.0.8.tgz",
      "integrity": "sha512-FQN4MRfuJeHf7cBbBMJFXhKSDq+2kAArBlmRBvcvFE5BB1HZKXtSFASDhdlz9zOYwxh8lDdnvmMOe/+5cdoEdg==",
      "license": "MIT",
      "dependencies": {
        "delayed-stream": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/commander": {
      "version": "2.20.3",
      "resolved": "https://registry.npmjs.org/commander/-/commander-2.20.3.tgz",
      "integrity": "sha512-GpVkmM8vF2vQUkj2LvZmD35JxeJOLCwJ9cUkugyk2nuhbv3+mJvpLYYt+0+USMxE+oj+ey/lJEnhZw75x/OMcQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/concat-map": {
      "version": "0.0.1",
      "resolved": "https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz",
      "integrity": "sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/convert-source-map": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
      "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/cookie": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/cookie/-/cookie-1.0.2.tgz",
      "integrity": "sha512-9Kr/j4O16ISv8zBBhJoi4bXOYNTkFLOqSL3UDB0njXxCXNezjeyVrJyGOWtgfs/q2km1gwBcfH8q1yEGoMYunA==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/cross-spawn": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
      "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "path-key": "^3.1.0",
        "shebang-command": "^2.0.0",
        "which": "^2.0.1"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/csstype": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.1.3.tgz",
      "integrity": "sha512-M1uQkMl8rQK/szD0LNhtqxIPLpimGm8sOBwU7lLnCpSbTyY3yeU1Vc7l4KT5zT4s/yOxHH5O7tIuuLOCnLADRw==",
      "devOptional": true,
      "license": "MIT"
    },
    "node_modules/d3-color": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/d3-color/-/d3-color-3.1.0.tgz",
      "integrity": "sha512-zg/chbXyeBtMQ1LbD/WSoW2DpC3I0mpmPdW+ynRTj/x2DAWYrIY7qeZIHidozwV24m4iavr15lNwIwLxRmOxhA==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-dispatch": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-dispatch/-/d3-dispatch-3.0.1.tgz",
      "integrity": "sha512-rzUyPU/S7rwUflMyLc1ETDeBj0NRuHKKAcvukozwhshr6g6c5d8zh4c2gQjY2bZ0dXeGLWc1PF174P2tVvKhfg==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-drag": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-drag/-/d3-drag-3.0.0.tgz",
      "integrity": "sha512-pWbUJLdETVA8lQNJecMxoXfH6x+mO2UQo8rSmZ+QqxcbyA3hfeprFgIT//HW2nlHChWeIIMwS2Fq+gEARkhTkg==",
      "license": "ISC",
      "dependencies": {
        "d3-dispatch": "1 - 3",
        "d3-selection": "3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-ease": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-ease/-/d3-ease-3.0.1.tgz",
      "integrity": "sha512-wR/XK3D3XcLIZwpbvQwQ5fK+8Ykds1ip7A2Txe0yxncXSdq1L9skcG7blcedkOX+ZcgxGAmLX1FrRGbADwzi0w==",
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-interpolate": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-interpolate/-/d3-interpolate-3.0.1.tgz",
      "integrity": "sha512-3bYs1rOD33uo8aqJfKP3JWPAibgw8Zm2+L9vBKEHJ2Rg+viTR7o5Mmv5mZcieN+FRYaAOWX5SJATX6k1PWz72g==",
      "license": "ISC",
      "dependencies": {
        "d3-color": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-selection": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-selection/-/d3-selection-3.0.0.tgz",
      "integrity": "sha512-fmTRWbNMmsmWq6xJV8D19U/gw/bwrHfNXxrIN+HfZgnzqTHp9jOmKMhsTUjXOJnZOdZY9Q28y4yebKzqDKlxlQ==",
      "license": "ISC",
      "peer": true,
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-timer": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-timer/-/d3-timer-3.0.1.tgz",
      "integrity": "sha512-ndfJ/JxxMd3nw31uyKoY2naivF+r29V+Lc0svZxe1JvvIRmi8hUsrMvdOwgS1o6uBHmiz91geQ0ylPP0aj1VUA==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-transition": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-transition/-/d3-transition-3.0.1.tgz",
      "integrity": "sha512-ApKvfjsSR6tg06xrL434C0WydLr7JewBB3V+/39RMHsaXTOG0zmt/OAXeng5M5LBm0ojmxJrpomQVZ1aPvBL4w==",
      "license": "ISC",
      "dependencies": {
        "d3-color": "1 - 3",
        "d3-dispatch": "1 - 3",
        "d3-ease": "1 - 3",
        "d3-interpolate": "1 - 3",
        "d3-timer": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      },
      "peerDependencies": {
        "d3-selection": "2 - 3"
      }
    },
    "node_modules/d3-zoom": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-zoom/-/d3-zoom-3.0.0.tgz",
      "integrity": "sha512-b8AmV3kfQaqWAuacbPuNbL6vahnOJflOhexLzMMNLga62+/nh0JzvJ0aO/5a5MVgUFGS7Hu1P9P03o3fJkDCyw==",
      "license": "ISC",
      "dependencies": {
        "d3-dispatch": "1 - 3",
        "d3-drag": "2 - 3",
        "d3-interpolate": "1 - 3",
        "d3-selection": "2 - 3",
        "d3-transition": "2 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/deep-is": {
      "version": "0.1.4",
      "resolved": "https://registry.npmjs.org/deep-is/-/deep-is-0.1.4.tgz",
      "integrity": "sha512-oIPzksmTg4/MriiaYGO+okXDT7ztn/w3Eptv/+gSIdMdKsJo0u4CfYNFJPy+4SKMuCqGw2wxnA+URMg3t8a/bQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/delayed-stream": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/delayed-stream/-/delayed-stream-1.0.0.tgz",
      "integrity": "sha512-ZySD7Nf91aLB0RxL4KGrKHBXl7Eds1DAmEdcoVawXnLD7SDhpNgtuII2aAkg7a7QS41jxPSZ17p4VdGnMHk3MQ==",
      "license": "MIT",
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/dunder-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.1",
        "es-errors": "^1.3.0",
        "gopd": "^1.2.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/electron-to-chromium": {
      "version": "1.5.234",
      "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.234.tgz",
      "integrity": "sha512-RXfEp2x+VRYn8jbKfQlRImzoJU01kyDvVPBmG39eU2iuRVhuS6vQNocB8J0/8GrIMLnPzgz4eW6WiRnJkTuNWg==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/elkjs": {
      "version": "0.11.0",
      "resolved": "https://registry.npmjs.org/elkjs/-/elkjs-0.11.0.tgz",
      "integrity": "sha512-u4J8h9mwEDaYMqo0RYJpqNMFDoMK7f+pu4GjcV+N8jIC7TRdORgzkfSjTJemhqONFfH6fBI3wpysgWbhgVWIXw==",
      "license": "EPL-2.0"
    },
    "node_modules/es-define-property": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-errors": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-object-atoms": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.1.tgz",
      "integrity": "sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-set-tostringtag": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/es-set-tostringtag/-/es-set-tostringtag-2.1.0.tgz",
      "integrity": "sha512-j6vWzfrGVfyXxge+O0x5sh6cvxAog0a/4Rdd2K36zCMV5eJ+/+tOAngRO8cODMNWbVRdVlmGZQL2YS3yR8bIUA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.6",
        "has-tostringtag": "^1.0.2",
        "hasown": "^2.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/esbuild": {
      "version": "0.25.10",
      "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.25.10.tgz",
      "integrity": "sha512-9RiGKvCwaqxO2owP61uQ4BgNborAQskMR6QusfWzQqv7AZOg5oGehdY2pRJMTKuwxd1IDBP4rSbI5lHzU7SMsQ==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "bin": {
        "esbuild": "bin/esbuild"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "@esbuild/aix-ppc64": "0.25.10",
        "@esbuild/android-arm": "0.25.10",
        "@esbuild/android-arm64": "0.25.10",
        "@esbuild/android-x64": "0.25.10",
        "@esbuild/darwin-arm64": "0.25.10",
        "@esbuild/darwin-x64": "0.25.10",
        "@esbuild/freebsd-arm64": "0.25.10",
        "@esbuild/freebsd-x64": "0.25.10",
        "@esbuild/linux-arm": "0.25.10",
        "@esbuild/linux-arm64": "0.25.10",
        "@esbuild/linux-ia32": "0.25.10",
        "@esbuild/linux-loong64": "0.25.10",
        "@esbuild/linux-mips64el": "0.25.10",
        "@esbuild/linux-ppc64": "0.25.10",
        "@esbuild/linux-riscv64": "0.25.10",
        "@esbuild/linux-s390x": "0.25.10",
        "@esbuild/linux-x64": "0.25.10",
        "@esbuild/netbsd-arm64": "0.25.10",
        "@esbuild/netbsd-x64": "0.25.10",
        "@esbuild/openbsd-arm64": "0.25.10",
        "@esbuild/openbsd-x64": "0.25.10",
        "@esbuild/openharmony-arm64": "0.25.10",
        "@esbuild/sunos-x64": "0.25.10",
        "@esbuild/win32-arm64": "0.25.10",
        "@esbuild/win32-ia32": "0.25.10",
        "@esbuild/win32-x64": "0.25.10"
      }
    },
    "node_modules/escalade": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz",
      "integrity": "sha512-WUj2qlxaQtO4g6Pq5c29GTcWGDyd8itL8zTlipgECz3JesAiiOKotd8JU6otB3PACgG6xkJUyVhboMS+bje/jA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/escape-string-regexp": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz",
      "integrity": "sha512-TtpcNJ3XAzx3Gq8sWRzJaVajRs0uVxA2YAkdb1jm2YkPz4G6egUFAyA3n5vtEIZefPk5Wa4UXbKuS5fKkJWdgA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/eslint": {
      "version": "9.37.0",
      "resolved": "https://registry.npmjs.org/eslint/-/eslint-9.37.0.tgz",
      "integrity": "sha512-XyLmROnACWqSxiGYArdef1fItQd47weqB7iwtfr9JHwRrqIXZdcFMvvEcL9xHCmL0SNsOvF0c42lWyM1U5dgig==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.8.0",
        "@eslint-community/regexpp": "^4.12.1",
        "@eslint/config-array": "^0.21.0",
        "@eslint/config-helpers": "^0.4.0",
        "@eslint/core": "^0.16.0",
        "@eslint/eslintrc": "^3.3.1",
        "@eslint/js": "9.37.0",
        "@eslint/plugin-kit": "^0.4.0",
        "@humanfs/node": "^0.16.6",
        "@humanwhocodes/module-importer": "^1.0.1",
        "@humanwhocodes/retry": "^0.4.2",
        "@types/estree": "^1.0.6",
        "@types/json-schema": "^7.0.15",
        "ajv": "^6.12.4",
        "chalk": "^4.0.0",
        "cross-spawn": "^7.0.6",
        "debug": "^4.3.2",
        "escape-string-regexp": "^4.0.0",
        "eslint-scope": "^8.4.0",
        "eslint-visitor-keys": "^4.2.1",
        "espree": "^10.4.0",
        "esquery": "^1.5.0",
        "esutils": "^2.0.2",
        "fast-deep-equal": "^3.1.3",
        "file-entry-cache": "^8.0.0",
        "find-up": "^5.0.0",
        "glob-parent": "^6.0.2",
        "ignore": "^5.2.0",
        "imurmurhash": "^0.1.4",
        "is-glob": "^4.0.0",
        "json-stable-stringify-without-jsonify": "^1.0.1",
        "lodash.merge": "^4.6.2",
        "minimatch": "^3.1.2",
        "natural-compare": "^1.4.0",
        "optionator": "^0.9.3"
      },
      "bin": {
        "eslint": "bin/eslint.js"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://eslint.org/donate"
      },
      "peerDependencies": {
        "jiti": "*"
      },
      "peerDependenciesMeta": {
        "jiti": {
          "optional": true
        }
      }
    },
    "node_modules/eslint-plugin-react-hooks": {
      "version": "5.2.0",
      "resolved": "https://registry.npmjs.org/eslint-plugin-react-hooks/-/eslint-plugin-react-hooks-5.2.0.tgz",
      "integrity": "sha512-+f15FfK64YQwZdJNELETdn5ibXEUQmW1DZL6KXhNnc2heoy/sg9VJJeT7n8TlMWouzWqSWavFkIhHyIbIAEapg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "peerDependencies": {
        "eslint": "^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0 || ^9.0.0"
      }
    },
    "node_modules/eslint-plugin-react-refresh": {
      "version": "0.4.23",
      "resolved": "https://registry.npmjs.org/eslint-plugin-react-refresh/-/eslint-plugin-react-refresh-0.4.23.tgz",
      "integrity": "sha512-G4j+rv0NmbIR45kni5xJOrYvCtyD3/7LjpVH8MPPcudXDcNu8gv+4ATTDXTtbRR8rTCM5HxECvCSsRmxKnWDsA==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "eslint": ">=8.40"
      }
    },
    "node_modules/eslint-scope": {
      "version": "8.4.0",
      "resolved": "https://registry.npmjs.org/eslint-scope/-/eslint-scope-8.4.0.tgz",
      "integrity": "sha512-sNXOfKCn74rt8RICKMvJS7XKV/Xk9kA7DyJr8mJik3S7Cwgy3qlkkmyS2uQB3jiJg6VNdZd/pDBJu0nvG2NlTg==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "esrecurse": "^4.3.0",
        "estraverse": "^5.2.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/eslint-visitor-keys": {
      "version": "4.2.1",
      "resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-4.2.1.tgz",
      "integrity": "sha512-Uhdk5sfqcee/9H/rCOJikYz67o0a2Tw2hGRPOG2Y1R2dg7brRe1uG0yaNQDHu+TO/uQPF/5eCapvYSmHUjt7JQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/espree": {
      "version": "10.4.0",
      "resolved": "https://registry.npmjs.org/espree/-/espree-10.4.0.tgz",
      "integrity": "sha512-j6PAQ2uUr79PZhBjP5C5fhl8e39FmRnOjsD5lGnWrFU8i2G776tBK7+nP8KuQUTTyAZUwfQqXAgrVH5MbH9CYQ==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "acorn": "^8.15.0",
        "acorn-jsx": "^5.3.2",
        "eslint-visitor-keys": "^4.2.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/esquery": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/esquery/-/esquery-1.6.0.tgz",
      "integrity": "sha512-ca9pw9fomFcKPvFLXhBKUK90ZvGibiGOvRJNbjljY7s7uq/5YO4BOzcYtJqExdx99rF6aAcnRxHmcUHcz6sQsg==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "estraverse": "^5.1.0"
      },
      "engines": {
        "node": ">=0.10"
      }
    },
    "node_modules/esrecurse": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/esrecurse/-/esrecurse-4.3.0.tgz",
      "integrity": "sha512-KmfKL3b6G+RXvP8N1vr3Tq1kL/oCFgn2NYXEtqP8/L3pKapUA4G8cFVaoF3SU323CD4XypR/ffioHmkti6/Tag==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "estraverse": "^5.2.0"
      },
      "engines": {
        "node": ">=4.0"
      }
    },
    "node_modules/estraverse": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/estraverse/-/estraverse-5.3.0.tgz",
      "integrity": "sha512-MMdARuVEQziNTeJD8DgMqmhwR11BRQ/cBP+pLtYdSTnf3MIO8fFeiINEbX36ZdNlfU/7A9f3gUw49B3oQsvwBA==",
      "dev": true,
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=4.0"
      }
    },
    "node_modules/esutils": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/esutils/-/esutils-2.0.3.tgz",
      "integrity": "sha512-kVscqXk4OCp68SZ0dkgEKVi6/8ij300KBWTJq32P/dYeWTSwK41WyTxalN1eRmA5Z9UU/LX9D7FWSmV9SAYx6g==",
      "dev": true,
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/fast-deep-equal": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz",
      "integrity": "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fast-json-stable-stringify": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz",
      "integrity": "sha512-lhd/wF+Lk98HZoTCtlVraHtfh5XYijIjalXck7saUtuanSDyLMxnHhSXEDJqHxD7msR8D0uCmqlkwjCV8xvwHw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fast-levenshtein": {
      "version": "2.0.6",
      "resolved": "https://registry.npmjs.org/fast-levenshtein/-/fast-levenshtein-2.0.6.tgz",
      "integrity": "sha512-DCXu6Ifhqcks7TZKY3Hxp3y6qphY5SJZmrWMDrKcERSOXWQdMhU9Ig/PYrzyw/ul9jOIyh0N4M0tbC5hodg8dw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fdir": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
      "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12.0.0"
      },
      "peerDependencies": {
        "picomatch": "^3 || ^4"
      },
      "peerDependenciesMeta": {
        "picomatch": {
          "optional": true
        }
      }
    },
    "node_modules/file-entry-cache": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/file-entry-cache/-/file-entry-cache-8.0.0.tgz",
      "integrity": "sha512-XXTUwCvisa5oacNGRP9SfNtYBNAMi+RPwBFmblZEF7N7swHYQS6/Zfk7SRwx4D5j3CH211YNRco1DEMNVfZCnQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "flat-cache": "^4.0.0"
      },
      "engines": {
        "node": ">=16.0.0"
      }
    },
    "node_modules/find-up": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz",
      "integrity": "sha512-78/PXT1wlLLDgTzDs7sjq9hzz0vXD+zn+7wypEe4fXQxCmdmqfGsEPQxmiCSQI3ajFV91bVSsvNtrJRiW6nGng==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "locate-path": "^6.0.0",
        "path-exists": "^4.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/flat-cache": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/flat-cache/-/flat-cache-4.0.1.tgz",
      "integrity": "sha512-f7ccFPK3SXFHpx15UIGyRJ/FJQctuKZ0zVuN3frBo4HnK3cay9VEW0R6yPYFHC0AgqhukPzKjq22t5DmAyqGyw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "flatted": "^3.2.9",
        "keyv": "^4.5.4"
      },
      "engines": {
        "node": ">=16"
      }
    },
    "node_modules/flatted": {
      "version": "3.3.3",
      "resolved": "https://registry.npmjs.org/flatted/-/flatted-3.3.3.tgz",
      "integrity": "sha512-GX+ysw4PBCz0PzosHDepZGANEuFCMLrnRTiEy9McGjmkCQYwRq4A/X786G/fjM/+OjsWSU1ZrY5qyARZmO/uwg==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/follow-redirects": {
      "version": "1.15.11",
      "resolved": "https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.15.11.tgz",
      "integrity": "sha512-deG2P0JfjrTxl50XGCDyfI97ZGVCxIpfKYmfyrQ54n5FO/0gfIES8C/Psl6kWVDolizcaaxZJnTS0QSMxvnsBQ==",
      "funding": [
        {
          "type": "individual",
          "url": "https://github.com/sponsors/RubenVerborgh"
        }
      ],
      "license": "MIT",
      "engines": {
        "node": ">=4.0"
      },
      "peerDependenciesMeta": {
        "debug": {
          "optional": true
        }
      }
    },
    "node_modules/form-data": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/form-data/-/form-data-4.0.4.tgz",
      "integrity": "sha512-KrGhL9Q4zjj0kiUt5OO4Mr/A/jlI2jDYs5eHBpYHPcBEVSiipAvn2Ko2HnPe20rmcuuvMHNdZFp+4IlGTMF0Ow==",
      "license": "MIT",
      "dependencies": {
        "asynckit": "^0.4.0",
        "combined-stream": "^1.0.8",
        "es-set-tostringtag": "^2.1.0",
        "hasown": "^2.0.2",
        "mime-types": "^2.1.12"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/gensync": {
      "version": "1.0.0-beta.2",
      "resolved": "https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz",
      "integrity": "sha512-3hN7NaskYvMDLQY55gnW3NQ+mesEAepTqlg+VEbj7zzqEMBVNhzcGYYeqFo/TlYz6eQiFcp1HcsCZO+nGgS8zg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/get-intrinsic": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "es-define-property": "^1.0.1",
        "es-errors": "^1.3.0",
        "es-object-atoms": "^1.1.1",
        "function-bind": "^1.1.2",
        "get-proto": "^1.0.1",
        "gopd": "^1.2.0",
        "has-symbols": "^1.1.0",
        "hasown": "^2.0.2",
        "math-intrinsics": "^1.1.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
      "license": "MIT",
      "dependencies": {
        "dunder-proto": "^1.0.1",
        "es-object-atoms": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/glob-parent": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/glob-parent/-/glob-parent-6.0.2.tgz",
      "integrity": "sha512-XxwI8EOhVQgWp6iDL+3b0r86f4d6AX6zSU55HfB4ydCEuXLXc5FcYeOu+nnGftS4TEju/11rt4KJPTMgbfmv4A==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "is-glob": "^4.0.3"
      },
      "engines": {
        "node": ">=10.13.0"
      }
    },
    "node_modules/globals": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/globals/-/globals-16.4.0.tgz",
      "integrity": "sha512-ob/2LcVVaVGCYN+r14cnwnoDPUufjiYgSqRhiFD0Q1iI4Odora5RE8Iv1D24hAz5oMophRGkGz+yuvQmmUMnMw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/google-protobuf": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/google-protobuf/-/google-protobuf-4.0.1.tgz",
      "integrity": "sha512-0I4mx3UtAwpcc8l9Ds5gHcwV2FyPdwvxxBcor8LusE4b6PjoFxEngZRBepjvuQ4B0eZ2iu/Vezh8oRsnpJ9UGA==",
      "license": "(BSD-3-Clause AND Apache-2.0)"
    },
    "node_modules/gopd": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/grpc-web": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/grpc-web/-/grpc-web-2.0.2.tgz",
      "integrity": "sha512-bvBP0/d5jyVM3eGxxffJhRLAPpH6eXhJeUzBT+bSIEgUKkG4a/BotEimVeW3phP0WLnsJnkRl8uQdRf2yDLaVA==",
      "license": "Apache-2.0"
    },
    "node_modules/has-flag": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz",
      "integrity": "sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/has-symbols": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-tostringtag": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/has-tostringtag/-/has-tostringtag-1.0.2.tgz",
      "integrity": "sha512-NqADB8VjPFLM2V0VvHUewwwsw0ZWBaIdgo+ieHtK3hasLz4qeCRjYcqfB6AQrBggRKppKF8L52/VqdVsO47Dlw==",
      "license": "MIT",
      "dependencies": {
        "has-symbols": "^1.0.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.2.tgz",
      "integrity": "sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==",
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/heap": {
      "version": "0.2.5",
      "resolved": "https://registry.npmjs.org/heap/-/heap-0.2.5.tgz",
      "integrity": "sha512-G7HLD+WKcrOyJP5VQwYZNC3Z6FcQ7YYjEFiFoIj8PfEr73mu421o8B1N5DKUcc8K37EsJ2XXWA8DtrDz/2dReg=="
    },
    "node_modules/ignore": {
      "version": "5.3.2",
      "resolved": "https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz",
      "integrity": "sha512-hsBTNUqQTDwkWtcdYI2i06Y/nUBEsNEDJKjWdigLvegy8kDuJAS8uRlpkkcQpyEXL0Z/pjDy5HBmMjRCJ2gq+g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 4"
      }
    },
    "node_modules/import-fresh": {
      "version": "3.3.1",
      "resolved": "https://registry.npmjs.org/import-fresh/-/import-fresh-3.3.1.tgz",
      "integrity": "sha512-TR3KfrTZTYLPB6jUjfx6MF9WcWrHL9su5TObK4ZkYgBdWKPOFoSoQIdEuTuR82pmtxH2spWG9h6etwfr1pLBqQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "parent-module": "^1.0.0",
        "resolve-from": "^4.0.0"
      },
      "engines": {
        "node": ">=6"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/imurmurhash": {
      "version": "0.1.4",
      "resolved": "https://registry.npmjs.org/imurmurhash/-/imurmurhash-0.1.4.tgz",
      "integrity": "sha512-JmXMZ6wuvDmLiHEml9ykzqO6lwFbof0GG4IkcGaENdCRDDmMVnny7s5HsIgHCbaq0w2MyPhDqkhTUgS2LU2PHA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.8.19"
      }
    },
    "node_modules/is-extglob": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz",
      "integrity": "sha512-SbKbANkN603Vi4jEZv49LeVJMn4yGwsbzZworEoyEiutsN3nJYdbO36zfhGJ6QEDpOZIFkDtnq5JRxmvl3jsoQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/is-glob": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/is-glob/-/is-glob-4.0.3.tgz",
      "integrity": "sha512-xelSayHH36ZgE7ZWhli7pW34hNbNl8Ojv5KVmkJD4hBdD3th8Tfk9vYasLM+mXWOZhFkgZfxhLSnrwRr4elSSg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-extglob": "^2.1.1"
      },
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/isexe": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
      "integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/js-tokens": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz",
      "integrity": "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/js-yaml": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-4.1.0.tgz",
      "integrity": "sha512-wpxZs9NoxZaJESJGIZTyDEaYpl0FKSA+FB9aJiyemKhMwkxQg63h4T1KJgUGHpTqPDNRcmmYLugrRjJlBtWvRA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "argparse": "^2.0.1"
      },
      "bin": {
        "js-yaml": "bin/js-yaml.js"
      }
    },
    "node_modules/jsesc": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz",
      "integrity": "sha512-/sM3dO2FOzXjKQhJuo0Q173wf2KOo8t4I8vHy6lF9poUp7bKT0/NHE8fPX23PwfhnykfqnC2xRxOnVw5XuGIaA==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "jsesc": "bin/jsesc"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/json-buffer": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/json-buffer/-/json-buffer-3.0.1.tgz",
      "integrity": "sha512-4bV5BfR2mqfQTJm+V5tPPdf+ZpuhiIvTuAB5g8kcrXOZpTT/QwwVRWBywX1ozr6lEuPdbHxwaJlm9G6mI2sfSQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json-schema-traverse": {
      "version": "0.4.1",
      "resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-0.4.1.tgz",
      "integrity": "sha512-xbbCH5dCYU5T8LcEhhuh7HJ88HXuW3qsI3Y0zOZFKfZEHcpWiHU/Jxzk629Brsab/mMiHQti9wMP+845RPe3Vg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json-stable-stringify-without-jsonify": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/json-stable-stringify-without-jsonify/-/json-stable-stringify-without-jsonify-1.0.1.tgz",
      "integrity": "sha512-Bdboy+l7tA3OGW6FjyFHWkP5LuByj1Tk33Ljyq0axyzdk9//JSi2u3fP1QSmd1KNwq6VOKYGlAu87CisVir6Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json5": {
      "version": "2.2.3",
      "resolved": "https://registry.npmjs.org/json5/-/json5-2.2.3.tgz",
      "integrity": "sha512-XmOWe7eyHYH14cLdVPoyg+GOH3rYX++KpzrylJwSW98t3Nk+U8XOl8FWKOgwtzdb8lXGf6zYwDUzeHMWfxasyg==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "json5": "lib/cli.js"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/keyv": {
      "version": "4.5.4",
      "resolved": "https://registry.npmjs.org/keyv/-/keyv-4.5.4.tgz",
      "integrity": "sha512-oxVHkHR/EJf2CNXnWxRLW6mg7JyCCUcG0DtEGmL2ctUo1PNTin1PUil+r/+4r5MpVgC/fn1kjsx7mjSujKqIpw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "json-buffer": "3.0.1"
      }
    },
    "node_modules/levn": {
      "version": "0.4.1",
      "resolved": "https://registry.npmjs.org/levn/-/levn-0.4.1.tgz",
      "integrity": "sha512-+bT2uH4E5LGE7h/n3evcS/sQlJXCpIp6ym8OWJ5eV6+67Dsql/LaaT7qJBAt2rzfoa/5QBGBhxDix1dMt2kQKQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "prelude-ls": "^1.2.1",
        "type-check": "~0.4.0"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/locate-path": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/locate-path/-/locate-path-6.0.0.tgz",
      "integrity": "sha512-iPZK6eYjbxRu3uB4/WZ3EsEIMJFMqAoopl3R+zuq0UjcAm/MO6KCweDgPfP3elTztoKP3KtnVHxTn2NHBSDVUw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-locate": "^5.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/lodash.merge": {
      "version": "4.6.2",
      "resolved": "https://registry.npmjs.org/lodash.merge/-/lodash.merge-4.6.2.tgz",
      "integrity": "sha512-0KpjqXRVvrYyCsX1swR/XTK0va6VQkQM6MNo7PqW77ByjAhoARA8EfrP1N4+KlKj8YS0ZUCtRT/YUuhyYDujIQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/lru-cache": {
      "version": "5.1.1",
      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz",
      "integrity": "sha512-KpNARQA3Iwv+jTA0utUVVbrh+Jlrr1Fv0e56GGzAFOXN7dk/FviaDW8LHmK52DlcH4WP2n6gI8vN1aesBFgo9w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "yallist": "^3.0.2"
      }
    },
    "node_modules/math-intrinsics": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/mime-db": {
      "version": "1.52.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz",
      "integrity": "sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime-types": {
      "version": "2.1.35",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz",
      "integrity": "sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "1.52.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/minimatch": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.2.tgz",
      "integrity": "sha512-J7p63hRiAjw1NDEww1W7i37+ByIrOWO5XQQAzZ3VOcL0PNybwpfmV/N05zFAzwQ9USyEcX6t3UO+K5aqBQOIHw==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/nanoid": {
      "version": "3.3.11",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.11.tgz",
      "integrity": "sha512-N8SpfPUnUp1bK+PMYW8qSWdl9U+wwNWI4QKxOYDy9JAro3WMX7p2OeVRF9v+347pnakNevPmiHhNmZ2HbFA76w==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "bin": {
        "nanoid": "bin/nanoid.cjs"
      },
      "engines": {
        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
      }
    },
    "node_modules/natural-compare": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/natural-compare/-/natural-compare-1.4.0.tgz",
      "integrity": "sha512-OWND8ei3VtNC9h7V60qff3SVobHr996CTwgxubgyQYEpg290h9J0buyECNNJexkFm5sOajh5G116RYA1c8ZMSw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/node-releases": {
      "version": "2.0.23",
      "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.23.tgz",
      "integrity": "sha512-cCmFDMSm26S6tQSDpBCg/NR8NENrVPhAJSf+XbxBG4rPFaaonlEoE9wHQmun+cls499TQGSb7ZyPBRlzgKfpeg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/optionator": {
      "version": "0.9.4",
      "resolved": "https://registry.npmjs.org/optionator/-/optionator-0.9.4.tgz",
      "integrity": "sha512-6IpQ7mKUxRcZNLIObR0hz7lxsapSSIYNZJwXPGeF0mTVqGKFIXj1DQcMoT22S3ROcLyY/rz0PWaWZ9ayWmad9g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "deep-is": "^0.1.3",
        "fast-levenshtein": "^2.0.6",
        "levn": "^0.4.1",
        "prelude-ls": "^1.2.1",
        "type-check": "^0.4.0",
        "word-wrap": "^1.2.5"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/p-limit": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz",
      "integrity": "sha512-TYOanM3wGwNGsZN2cVTYPArw454xnXj5qmWF1bEoAc4+cU/ol7GVh7odevjp1FNHduHc3KZMcFduxU5Xc6uJRQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "yocto-queue": "^0.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/p-locate": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/p-locate/-/p-locate-5.0.0.tgz",
      "integrity": "sha512-LaNjtRWUBY++zB5nE/NwcaoMylSPk+S+ZHNB1TzdbMJMny6dynpAGt7X/tl/QYq3TIeE6nxHppbo2LGymrG5Pw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-limit": "^3.0.2"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/parent-module": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/parent-module/-/parent-module-1.0.1.tgz",
      "integrity": "sha512-GQ2EWRpQV8/o+Aw8YqtfZZPfNRWZYkbidE9k5rpl/hC3vtHHBfGm2Ifi6qWV+coDGkrUKZAxE3Lot5kcsRlh+g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "callsites": "^3.0.0"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/path-exists": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
      "integrity": "sha512-ak9Qy5Q7jYb2Wwcey5Fpvg2KoAc/ZIhLSLOSBmRmygPsGwkVVt0fZa0qrtMz+m6tJTAHfZQ8FnmB4MG4LWy7/w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/path-key": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
      "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/pathfinding": {
      "version": "0.4.18",
      "resolved": "https://registry.npmjs.org/pathfinding/-/pathfinding-0.4.18.tgz",
      "integrity": "sha512-R0TGEQ9GRcFCDvAWlJAWC+KGJ9SLbW4c0nuZRcioVlXVTlw+F5RvXQ8SQgSqI9KXWC1ew95vgmIiyaWTlCe9Ag==",
      "dependencies": {
        "heap": "0.2.5"
      }
    },
    "node_modules/picocolors": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/picomatch": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.3.tgz",
      "integrity": "sha512-5gTmgEY/sqK6gFXLIsQNH19lWb4ebPDLA4SdLP7dsWkIXHWlG66oPuVvXSGFPppYZz8ZDZq0dYYrbHfBCVUb1Q==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/postcss": {
      "version": "8.5.6",
      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.6.tgz",
      "integrity": "sha512-3Ybi1tAuwAP9s0r1UQ2J4n5Y0G05bJkpUIO0/bI9MhwmD70S5aTWbXGBwxHrelT+XM1k6dM0pk+SwNkpTRN7Pg==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/postcss/"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/postcss"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "nanoid": "^3.3.11",
        "picocolors": "^1.1.1",
        "source-map-js": "^1.2.1"
      },
      "engines": {
        "node": "^10 || ^12 || >=14"
      }
    },
    "node_modules/prelude-ls": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/prelude-ls/-/prelude-ls-1.2.1.tgz",
      "integrity": "sha512-vkcDPrRZo1QZLbn5RLGPpg/WmIQ65qoWWhcGKf/b5eplkkarX0m9z8ppCat4mlOqUsWpyNuYgO3VRyrYHSzX5g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/proxy-from-env": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/proxy-from-env/-/proxy-from-env-1.1.0.tgz",
      "integrity": "sha512-D+zkORCbA9f1tdWRK0RaCR3GPv50cMxcrz4X8k5LTSUD1Dkw47mKJEZQNunItRTkWwgtaUSo1RVFRIG9ZXiFYg==",
      "license": "MIT"
    },
    "node_modules/punycode": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz",
      "integrity": "sha512-vYt7UD1U9Wg6138shLtLOvdAu+8DsC/ilFtEVHcH+wydcSpNE20AfSOduf6MkRFahL5FY7X1oU7nKVZFtfq8Fg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/react": {
      "version": "19.2.0",
      "resolved": "https://registry.npmjs.org/react/-/react-19.2.0.tgz",
      "integrity": "sha512-tmbWg6W31tQLeB5cdIBOicJDJRR2KzXsV7uSK9iNfLWQ5bIZfxuPEHp7M8wiHyHnn0DD1i7w3Zmin0FtkrwoCQ==",
      "license": "MIT",
      "peer": true,
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/react-dom": {
      "version": "19.2.0",
      "resolved": "https://registry.npmjs.org/react-dom/-/react-dom-19.2.0.tgz",
      "integrity": "sha512-UlbRu4cAiGaIewkPyiRGJk0imDN2T3JjieT6spoL2UeSf5od4n5LB/mQ4ejmxhCFT1tYe8IvaFulzynWovsEFQ==",
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "scheduler": "^0.27.0"
      },
      "peerDependencies": {
        "react": "^19.2.0"
      }
    },
    "node_modules/react-refresh": {
      "version": "0.17.0",
      "resolved": "https://registry.npmjs.org/react-refresh/-/react-refresh-0.17.0.tgz",
      "integrity": "sha512-z6F7K9bV85EfseRCp2bzrpyQ0Gkw1uLoCel9XBVWPg/TjRj94SkJzUTGfOa4bs7iJvBWtQG0Wq7wnI0syw3EBQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/react-router": {
      "version": "7.9.4",
      "resolved": "https://registry.npmjs.org/react-router/-/react-router-7.9.4.tgz",
      "integrity": "sha512-SD3G8HKviFHg9xj7dNODUKDFgpG4xqD5nhyd0mYoB5iISepuZAvzSr8ywxgxKJ52yRzf/HWtVHc9AWwoTbljvA==",
      "license": "MIT",
      "dependencies": {
        "cookie": "^1.0.1",
        "set-cookie-parser": "^2.6.0"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "peerDependencies": {
        "react": ">=18",
        "react-dom": ">=18"
      },
      "peerDependenciesMeta": {
        "react-dom": {
          "optional": true
        }
      }
    },
    "node_modules/react-router-dom": {
      "version": "7.9.4",
      "resolved": "https://registry.npmjs.org/react-router-dom/-/react-router-dom-7.9.4.tgz",
      "integrity": "sha512-f30P6bIkmYvnHHa5Gcu65deIXoA2+r3Eb6PJIAddvsT9aGlchMatJ51GgpU470aSqRRbFX22T70yQNUGuW3DfA==",
      "license": "MIT",
      "dependencies": {
        "react-router": "7.9.4"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "peerDependencies": {
        "react": ">=18",
        "react-dom": ">=18"
      }
    },
    "node_modules/reactflow": {
      "version": "11.11.4",
      "resolved": "https://registry.npmjs.org/reactflow/-/reactflow-11.11.4.tgz",
      "integrity": "sha512-70FOtJkUWH3BAOsN+LU9lCrKoKbtOPnz2uq0CV2PLdNSwxTXOhCbsZr50GmZ+Rtw3jx8Uv7/vBFtCGixLfd4Og==",
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@reactflow/background": "11.3.14",
        "@reactflow/controls": "11.2.14",
        "@reactflow/core": "11.11.4",
        "@reactflow/minimap": "11.7.14",
        "@reactflow/node-resizer": "2.2.14",
        "@reactflow/node-toolbar": "1.3.14"
      },
      "peerDependencies": {
        "react": ">=17",
        "react-dom": ">=17"
      }
    },
    "node_modules/resolve-from": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/resolve-from/-/resolve-from-4.0.0.tgz",
      "integrity": "sha512-pb/MYmXstAkysRFx8piNI1tGFNQIFA3vkE3Gq4EuA1dF6gHp/+vgZqsCGJapvy8N3Q+4o7FwvquPJcnZ7RYy4g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=4"
      }
    },
    "node_modules/rollup": {
      "version": "4.52.4",
      "resolved": "https://registry.npmjs.org/rollup/-/rollup-4.52.4.tgz",
      "integrity": "sha512-CLEVl+MnPAiKh5pl4dEWSyMTpuflgNQiLGhMv8ezD5W/qP8AKvmYpCOKRRNOh7oRKnauBZ4SyeYkMS+1VSyKwQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/estree": "1.0.8"
      },
      "bin": {
        "rollup": "dist/bin/rollup"
      },
      "engines": {
        "node": ">=18.0.0",
        "npm": ">=8.0.0"
      },
      "optionalDependencies": {
        "@rollup/rollup-android-arm-eabi": "4.52.4",
        "@rollup/rollup-android-arm64": "4.52.4",
        "@rollup/rollup-darwin-arm64": "4.52.4",
        "@rollup/rollup-darwin-x64": "4.52.4",
        "@rollup/rollup-freebsd-arm64": "4.52.4",
        "@rollup/rollup-freebsd-x64": "4.52.4",
        "@rollup/rollup-linux-arm-gnueabihf": "4.52.4",
        "@rollup/rollup-linux-arm-musleabihf": "4.52.4",
        "@rollup/rollup-linux-arm64-gnu": "4.52.4",
        "@rollup/rollup-linux-arm64-musl": "4.52.4",
        "@rollup/rollup-linux-loong64-gnu": "4.52.4",
        "@rollup/rollup-linux-ppc64-gnu": "4.52.4",
        "@rollup/rollup-linux-riscv64-gnu": "4.52.4",
        "@rollup/rollup-linux-riscv64-musl": "4.52.4",
        "@rollup/rollup-linux-s390x-gnu": "4.52.4",
        "@rollup/rollup-linux-x64-gnu": "4.52.4",
        "@rollup/rollup-linux-x64-musl": "4.52.4",
        "@rollup/rollup-openharmony-arm64": "4.52.4",
        "@rollup/rollup-win32-arm64-msvc": "4.52.4",
        "@rollup/rollup-win32-ia32-msvc": "4.52.4",
        "@rollup/rollup-win32-x64-gnu": "4.52.4",
        "@rollup/rollup-win32-x64-msvc": "4.52.4",
        "fsevents": "~2.3.2"
      }
    },
    "node_modules/scheduler": {
      "version": "0.27.0",
      "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz",
      "integrity": "sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==",
      "license": "MIT"
    },
    "node_modules/semver": {
      "version": "6.3.1",
      "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
      "integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      }
    },
    "node_modules/set-cookie-parser": {
      "version": "2.7.1",
      "resolved": "https://registry.npmjs.org/set-cookie-parser/-/set-cookie-parser-2.7.1.tgz",
      "integrity": "sha512-IOc8uWeOZgnb3ptbCURJWNjWUPcO3ZnTTdzsurqERrP6nPyv+paC55vJM0LpOlT2ne+Ix+9+CRG1MNLlyZ4GjQ==",
      "license": "MIT"
    },
    "node_modules/shebang-command": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
      "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "shebang-regex": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/shebang-regex": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
      "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/source-map": {
      "version": "0.6.1",
      "resolved": "https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz",
      "integrity": "sha512-UjgapumWlbMhkBgzT7Ykc5YXUT46F0iKu8SGXq0bcwP5dz/h0Plj6enJqjz1Zbq2l5WaqYnrVbwWOWMyF3F47g==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/source-map-js": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
      "integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/source-map-support": {
      "version": "0.5.21",
      "resolved": "https://registry.npmjs.org/source-map-support/-/source-map-support-0.5.21.tgz",
      "integrity": "sha512-uBHU3L3czsIyYXKX88fdrGovxdSCoTGDRZ6SYXtSRxLZUzHg5P/66Ht6uoUlHu9EZod+inXhKo3qQgwXUT/y1w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "buffer-from": "^1.0.0",
        "source-map": "^0.6.0"
      }
    },
    "node_modules/strip-json-comments": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/strip-json-comments/-/strip-json-comments-3.1.1.tgz",
      "integrity": "sha512-6fPc+R4ihwqP6N/aIv2f1gMH8lOVtWQHoqC4yK6oSDVVocumAsfCqjkXnqiYMhmMwS/mEHLp7Vehlt3ql6lEig==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/supports-color": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz",
      "integrity": "sha512-qpCAvRl9stuOHveKsn7HncJRvv501qIacKzQlO/+Lwxc9+0q2wLyv4Dfvt80/DPn2pqOBsJdDiogXGR9+OvwRw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "has-flag": "^4.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/terser": {
      "version": "5.44.1",
      "resolved": "https://registry.npmjs.org/terser/-/terser-5.44.1.tgz",
      "integrity": "sha512-t/R3R/n0MSwnnazuPpPNVO60LX0SKL45pyl9YlvxIdkH0Of7D5qM2EVe+yASRIlY5pZ73nclYJfNANGWPwFDZw==",
      "dev": true,
      "license": "BSD-2-Clause",
      "peer": true,
      "dependencies": {
        "@jridgewell/source-map": "^0.3.3",
        "acorn": "^8.15.0",
        "commander": "^2.20.0",
        "source-map-support": "~0.5.20"
      },
      "bin": {
        "terser": "bin/terser"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/tinyglobby": {
      "version": "0.2.15",
      "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.15.tgz",
      "integrity": "sha512-j2Zq4NyQYG5XMST4cbs02Ak8iJUdxRM0XI5QyxXuZOzKOINmWurp3smXu3y5wDcJrptwpSjgXHzIQxR0omXljQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fdir": "^6.5.0",
        "picomatch": "^4.0.3"
      },
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/SuperchupuDev"
      }
    },
    "node_modules/type-check": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/type-check/-/type-check-0.4.0.tgz",
      "integrity": "sha512-XleUoc9uwGXqjWwXaUTZAmzMcFZ5858QA2vvx1Ur5xIcixXIP+8LnFDgRplU30us6teqdlskFfu+ae4K79Ooew==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "prelude-ls": "^1.2.1"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/typescript": {
      "version": "5.9.3",
      "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz",
      "integrity": "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
      "license": "Apache-2.0",
      "peer": true,
      "bin": {
        "tsc": "bin/tsc",
        "tsserver": "bin/tsserver"
      },
      "engines": {
        "node": ">=14.17"
      }
    },
    "node_modules/update-browserslist-db": {
      "version": "1.1.3",
      "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.1.3.tgz",
      "integrity": "sha512-UxhIZQ+QInVdunkDAaiazvvT/+fXL5Osr0JZlJulepYu6Jd7qJtDZjlur0emRlT71EN3ScPoE7gvsuIKKNavKw==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "escalade": "^3.2.0",
        "picocolors": "^1.1.1"
      },
      "bin": {
        "update-browserslist-db": "cli.js"
      },
      "peerDependencies": {
        "browserslist": ">= 4.21.0"
      }
    },
    "node_modules/uri-js": {
      "version": "4.4.1",
      "resolved": "https://registry.npmjs.org/uri-js/-/uri-js-4.4.1.tgz",
      "integrity": "sha512-7rKUyy33Q1yc98pQ1DAmLtwX109F7TIfWlW1Ydo8Wl1ii1SeHieeh0HHfPeL2fMXK6z0s8ecKs9frCuLJvndBg==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "punycode": "^2.1.0"
      }
    },
    "node_modules/use-sync-external-store": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/use-sync-external-store/-/use-sync-external-store-1.6.0.tgz",
      "integrity": "sha512-Pp6GSwGP/NrPIrxVFAIkOQeyw8lFenOHijQWkUTrDvrF4ALqylP2C/KCkeS9dpUM3KvYRQhna5vt7IL95+ZQ9w==",
      "license": "MIT",
      "peerDependencies": {
        "react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
      }
    },
    "node_modules/vite": {
      "version": "7.1.9",
      "resolved": "https://registry.npmjs.org/vite/-/vite-7.1.9.tgz",
      "integrity": "sha512-4nVGliEpxmhCL8DslSAUdxlB6+SMrhB0a1v5ijlh1xB1nEPuy1mxaHxysVucLHuWryAxLWg6a5ei+U4TLn/rFg==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "esbuild": "^0.25.0",
        "fdir": "^6.5.0",
        "picomatch": "^4.0.3",
        "postcss": "^8.5.6",
        "rollup": "^4.43.0",
        "tinyglobby": "^0.2.15"
      },
      "bin": {
        "vite": "bin/vite.js"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "funding": {
        "url": "https://github.com/vitejs/vite?sponsor=1"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.3"
      },
      "peerDependencies": {
        "@types/node": "^20.19.0 || >=22.12.0",
        "jiti": ">=1.21.0",
        "less": "^4.0.0",
        "lightningcss": "^1.21.0",
        "sass": "^1.70.0",
        "sass-embedded": "^1.70.0",
        "stylus": ">=0.54.8",
        "sugarss": "^5.0.0",
        "terser": "^5.16.0",
        "tsx": "^4.8.1",
        "yaml": "^2.4.2"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        },
        "jiti": {
          "optional": true
        },
        "less": {
          "optional": true
        },
        "lightningcss": {
          "optional": true
        },
        "sass": {
          "optional": true
        },
        "sass-embedded": {
          "optional": true
        },
        "stylus": {
          "optional": true
        },
        "sugarss": {
          "optional": true
        },
        "terser": {
          "optional": true
        },
        "tsx": {
          "optional": true
        },
        "yaml": {
          "optional": true
        }
      }
    },
    "node_modules/which": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
      "integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "isexe": "^2.0.0"
      },
      "bin": {
        "node-which": "bin/node-which"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/word-wrap": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz",
      "integrity": "sha512-BN22B5eaMMI9UMtjrGd5g5eCYPpCPDUy0FJXbYsaT5zYxjFOckS53SQDE3pWkVoWpHXVb3BrYcEN4Twa55B5cA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/yallist": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz",
      "integrity": "sha512-a4UGQaWPH59mOXUYnAG2ewncQS4i4F43Tv3JoAM+s2VDAmS9NsK8GpDMLrCHPksFT7h3K6TOoUNn2pb7RoXx4g==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/yocto-queue": {
      "version": "0.1.0",
      "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz",
      "integrity": "sha512-rVksvsnNCdJ/ohGc6xgPwyN8eheCxsiLM8mxuE/t/mOVqJewPuO1miLpTHQiRgTKCLexL4MeAFVagts7HmNZ2Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/zustand": {
      "version": "4.5.7",
      "resolved": "https://registry.npmjs.org/zustand/-/zustand-4.5.7.tgz",
      "integrity": "sha512-CHOUy7mu3lbD6o6LJLfllpjkzhHXSBlX8B9+qPddUsIfeF5S/UZ5q0kmCsnRqT1UHFQZchNFDDzMbQsuesHWlw==",
      "license": "MIT",
      "dependencies": {
        "use-sync-external-store": "^1.2.2"
      },
      "engines": {
        "node": ">=12.7.0"
      },
      "peerDependencies": {
        "@types/react": ">=16.8",
        "immer": ">=9.0.6",
        "react": ">=16.8"
      },
      "peerDependenciesMeta": {
        "@types/react": {
          "optional": true
        },
        "immer": {
          "optional": true
        },
        "react": {
          "optional": true
        }
      }
    }
  }
}

package.json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tisoap/react-flow-smart-edge": "^3.0.0",
    "axios": "^1.13.1",
    "elkjs": "^0.11.0",
    "google-protobuf": "^4.0.1",
    "grpc-web": "^2.0.2",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "react-router-dom": "^7.9.4",
    "reactflow": "^11.11.4"
  },
  "devDependencies": {
    "@eslint/js": "^9.36.0",
    "@types/react": "^19.1.16",
    "@types/react-dom": "^19.1.9",
    "@vitejs/plugin-react": "^5.0.4",
    "eslint": "^9.36.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.22",
    "globals": "^16.4.0",
    "terser": "^5.36.0",
    "vite": "^7.1.7"
  }
}

quick-test-grpc.sh
#!/bin/bash

# 🚀 БЫСТРЫЙ ТЕСТ gRPC - всё автоматически
# Регистрирует пользователя, создаёт проект, тестирует gRPC

set -e

API_URL="http://78.153.139.47:8000"
TIMESTAMP=$(date +%s)
EMAIL="grpc${TIMESTAMP}@test.com"
LOGIN="grpc_test_${TIMESTAMP}"
PASSWORD="test12345678"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 БЫСТРЫЙ ТЕСТ gRPC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Регистрация
echo "1️⃣  Регистрация пользователя..."
echo "   Email: $EMAIL"
echo "   Login: $LOGIN"

REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/v1/auth/registration" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"gRPC\",\"surname\":\"Tester\",\"login\":\"$LOGIN\"}")

USER_ID=$(echo "$REGISTER_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null || echo "")

if [ -z "$USER_ID" ]; then
  echo "❌ Ошибка регистрации:"
  echo "$REGISTER_RESPONSE" | python3 -m json.tool
  exit 1
fi

echo "   ✅ User ID: $USER_ID"
echo ""

# 2. Логин
echo "2️⃣  Получение токена..."

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"login\":\"$LOGIN\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('access_token', data.get('token', '')))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "❌ Ошибка получения токена:"
  echo "$LOGIN_RESPONSE" | python3 -m json.tool
  exit 1
fi

echo "   ✅ Token: ${TOKEN:0:50}..."
echo ""

# 3. Создание тестового проекта
echo "3️⃣  Создание тестового проекта..."

# Создаём временный ZIP
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

cat > main.py << 'PYEOF'
from fastapi import FastAPI
app = FastAPI()

@app.get("/")
def root():
    return {"message": "Hello"}

@app.get("/users/{user_id}")
def get_user(user_id: int):
    return {"user_id": user_id}
PYEOF

cat > requirements.txt << 'REQEOF'
fastapi==0.104.1
uvicorn==0.24.0
REQEOF

zip -q test_project.zip main.py requirements.txt

echo "   Отправка проекта на backend..."

PROJECT_RESPONSE=$(curl -s -X POST "$API_URL/v1/project" \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=gRPC Test Project ${TIMESTAMP}" \
  -F "description=Автоматический тест gRPC" \
  -F "user_id=$USER_ID" \
  -F "file=@test_project.zip")

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('project_id', json.load(sys.stdin).get('id', '')))" 2>/dev/null || echo "")

cd - > /dev/null
rm -rf "$TEMP_DIR"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Ошибка создания проекта:"
  echo "$PROJECT_RESPONSE" | python3 -m json.tool
  exit 1
fi

echo "   ✅ Project ID: $PROJECT_ID"
echo ""

# 4. Тест gRPC
echo "4️⃣  Тестирование gRPC endpoint..."
echo "   User ID: $USER_ID"
echo "   Project ID: $PROJECT_ID"
echo ""

# Кодируем Protobuf запрос (user_id=11, project_id=полученный)
# Формат: 0x08 <user_id_varint> 0x10 <project_id_varint>

function encode_varint() {
  local num=$1
  local result=""
  
  while [ $num -gt 127 ]; do
    local byte=$(( (num & 0x7f) | 0x80 ))
    result="$result\\x$(printf '%02x' $byte)"
    num=$(( num >> 7 ))
  done
  
  result="$result\\x$(printf '%02x' $num)"
  echo -ne "$result"
}

REQUEST_DATA=$(echo -ne "\x08"; encode_varint $USER_ID; echo -ne "\x10"; encode_varint $PROJECT_ID)

echo "   Отправка gRPC запроса..."
echo "   Payload (hex): $(echo -n "$REQUEST_DATA" | xxd -p | tr -d '\n')"
echo ""

GRPC_RESPONSE=$(curl -s -X POST "http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm" \
  -H "Content-Type: application/grpc-web+proto" \
  -H "Accept: application/grpc-web+proto" \
  -H "X-Grpc-Web: 1" \
  --data-binary "$REQUEST_DATA" \
  --max-time 30 \
  -w "\nHTTP_CODE:%{http_code}" 2>&1)

HTTP_CODE=$(echo "$GRPC_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ gRPC endpoint ответил: 200 OK"
  echo "   📊 Получены данные (первые 100 байт):"
  echo "$GRPC_RESPONSE" | head -c 100 | xxd | head -5
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ ТЕСТ УСПЕШЕН!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "   ❌ gRPC endpoint ошибка: HTTP $HTTP_CODE"
  echo "$GRPC_RESPONSE"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ ТЕСТ ЗАВЕРШЁН С ОШИБКОЙ"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

echo ""
echo "📋 ДАННЫЕ ДЛЯ РУЧНОГО ТЕСТА:"
echo "   User ID: $USER_ID"
echo "   Project ID: $PROJECT_ID"
echo "   Token: $TOKEN"
echo ""
echo "💡 Используйте в браузере (Console):"
echo "   localStorage.setItem('token', '$TOKEN');"
echo "   localStorage.setItem('user', JSON.stringify({id: $USER_ID}));"
echo "   diagnoseGrpc($USER_ID, $PROJECT_ID)"

src/App.css
#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.react:hover {
  filter: drop-shadow(0 0 2em #61dafbaa);
}

@keyframes logo-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: no-preference) {
  a:nth-of-type(2) .logo {
    animation: logo-spin infinite 20s linear;
  }
}

.card {
  padding: 2em;
}

.read-the-docs {
  color: #888;
}

src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Landing from './pages/Landing/Landing';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ProjectsList from './pages/Projects/ProjectsList';
import NewProject from './pages/Projects/NewProject';
import ProjectAnalysis from './pages/Projects/ProjectAnalysis';
import TestFlow from './pages/Projects/TestFlow';
import Settings from './pages/Settings/Settings';
import ProtectedRoute from './routes/ProtectedRoute';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/test-flow" element={<TestFlow />} />
          
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <ProjectsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/new"
            element={
              <ProtectedRoute>
                <NewProject />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <ProjectAnalysis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id/architecture"
            element={
              <ProtectedRoute>
                <ProjectAnalysis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id/analysis"
            element={
              <ProtectedRoute>
                <ProjectAnalysis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

src/assets/components/AuthLayout.jsx


src/assets/components/MainLayout.jsx


src/assets/styles.css/globals.css


src/assets/styles.css/tokens.css


src/context/AuthContext.jsx
import { createContext, useState, useContext, useEffect } from 'react';
import { authAPI, homeAPI } from '../services/api';
import { useI18n } from './I18nContext';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  const updateUser = (updatedUser) => {
    if (updatedUser) {
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } else {
      localStorage.removeItem('user');
    }
    setUser(updatedUser);
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    try {
      const data = await authAPI.login(credentials);
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      // Получаем полные данные пользователя с домашнего эндпоинта (приходит сразу)
      try {
        const homeData = await homeAPI.getHomepage();
        const accountData = homeData?.user || {};
        const userData = {
          id: accountData.id,
          login: accountData.login,
          name: accountData.name,
          surname: accountData.surname,
          email: accountData.email
        };
        updateUser(userData);
      } catch (homeError) {
        console.error('Error fetching user from home endpoint:', homeError);
        // Fallback: сохраняем хотя бы логин
        const userData = { login: credentials.login };
        updateUser(userData);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      const status = error.response?.status;
      const backendMessage = error.response?.data?.message;
      const backendType = error.response?.data?.type;
      const detail = error.response?.data?.detail;
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        return {
          success: false,
          error: t('auth.error.network', 'Ошибка подключения к серверу. Проверьте настройки CORS на бэкенде.'),
        };
      }
      
      let errorMessage = backendMessage;
      
      if (!errorMessage) {
        if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (Array.isArray(detail)) {
          errorMessage = detail.map(err => err.msg).join(', ');
        }
      }

      if (!errorMessage && backendType) {
        errorMessage = backendType === 'INVALID_LOGIN'
          ? t('auth.error.invalidLogin', 'Неверный логин')
          : backendType === 'INVALID_PASSWORD'
            ? t('auth.error.invalidPassword', 'Неверный пароль')
            : backendType;
      }

      if (status === 401 && backendMessage) {
        errorMessage = backendMessage;
      }

      if (!errorMessage) {
        errorMessage = t('auth.error.loginFailed', 'Не удалось авторизоваться.');
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const register = async (userData) => {
    try {
      const data = await authAPI.register(userData);
      
      const loginResult = await login({
        login: userData.login,
        password: userData.password,
      });
      
      if (loginResult.success) {
        return { success: true, data };
      }
      
      return { success: true, data, needLogin: true };
    } catch (error) {
      console.error('Registration error:', error);
      const status = error.response?.status;
      const backendMessage = error.response?.data?.message;
      const backendType = error.response?.data?.type;
      
      if (error.code === 'ERR_NETWORK') {
        return {
          success: false,
          error: t('auth.error.registerNetwork', 'Ошибка сети. Проверьте подключение к серверу.'),
        };
      }
      
      if (error.message === 'Network Error') {
        return {
          success: false,
          error: t('auth.error.cors', 'CORS ошибка. Настройте CORS на бэкенде.'),
        };
      }
      
      // Обработка ответа от сервера
      const detail = error.response?.data?.detail;
      let errorMessage = backendMessage || t('auth.error.registerFailed', 'Не удалось зарегистрироваться.');
      
      if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail.map(err => err.msg).join(', ');
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    updateUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

src/context/I18nContext.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const translations = {
  en: {
    'common.loading': 'Loading...',
    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.saveChanges': 'Save changes',
    'common.reset': 'Reset',
    'common.delete': 'Delete',
    'common.deleteProject': 'Delete project',
    'common.deleteAccount': 'Delete account',
    'common.view': 'View',
    'common.create': 'Create',
    'common.settings': 'Settings',
    'common.logout': 'Log out',
    'common.language': 'Language',
    'common.lang.ru': 'Russian',
    'common.lang.en': 'English',

    'auth.login.title': 'Log in',
    'auth.login.loginLabel': 'Login',
    'auth.login.passwordLabel': 'Password',
    'auth.login.loginPlaceholder': 'Enter login',
    'auth.login.passwordPlaceholder': 'Enter password',
    'auth.login.showPassword': 'Show',
    'auth.login.hidePassword': 'Hide',
    'auth.login.submit': 'Log in',
    'auth.login.submitting': 'Signing in...',
    'auth.login.error.missing': 'Fill in all fields',
    'auth.login.error.failed': 'Could not sign in. Please try again.',
    'auth.login.noAccount': 'No account?',
    'auth.login.create': 'Create',
    'auth.error.network': 'Server connection error. Check backend CORS settings.',
    'auth.error.invalidLogin': 'Invalid login',
    'auth.error.invalidPassword': 'Invalid password',
    'auth.error.loginFailed': 'Could not sign in.',
    'auth.error.registerNetwork': 'Network error. Check your connection.',
    'auth.error.cors': 'CORS error. Configure CORS on the backend.',
    'auth.error.registerFailed': 'Could not sign up.',

    'auth.register.title': 'Sign up',
    'auth.register.nameLabel': 'Name',
    'auth.register.surnameLabel': 'Surname',
    'auth.register.loginLabel': 'Login',
    'auth.register.passwordLabel': 'Password',
    'auth.register.confirmLabel': 'Confirm password',
    'auth.register.namePlaceholder': 'Enter name',
    'auth.register.surnamePlaceholder': 'Enter surname',
    'auth.register.loginPlaceholder': 'Enter login',
    'auth.register.passwordPlaceholder': 'At least 8 characters',
    'auth.register.confirmPlaceholder': 'Repeat password',
    'auth.register.showPassword': 'Show',
    'auth.register.hidePassword': 'Hide',
    'auth.register.showConfirm': 'Show',
    'auth.register.hideConfirm': 'Hide',
    'auth.register.submit': 'Sign up',
    'auth.register.submitting': 'Signing up...',
    'auth.register.error.missing': 'Fill in all fields',
    'auth.register.error.shortPassword': 'Password must be at least 8 characters',
    'auth.register.error.mismatch': 'Passwords do not match',
    'auth.register.haveAccount': 'Already have an account?',
    'auth.register.login': 'Log in',

    'projects.list.loading': 'Loading projects...',
    'projects.list.create': 'Create',
    'projects.list.title': 'Projects',
    'projects.list.settings': 'Settings',
    'projects.list.logout': 'Log out',
    'projects.list.error.load': 'Failed to load projects',
    'projects.list.emptyTitle': 'No projects found',
    'projects.list.emptySubtitle': 'Create a new project to get started.',
    'projects.list.view': 'View',
    'projects.list.delete': 'Delete',
    'projects.list.deleting': 'Deleting...',
    'projects.list.confirmDelete': 'Delete project? This action cannot be undone.',
    'projects.list.error.notFound': 'Project not found or no access.',
    'projects.list.error.invalidToken': 'Invalid token.',
    'projects.list.error.deleteFailed': 'Could not delete the project. Please try again.',
    'projects.list.userPlaceholder': 'User',
    'projects.list.userPlaceholderLetter': 'U',
    'projects.list.userPlaceholderName': 'User',

    'projects.new.title': 'Create a new project',
    'projects.new.nameLabel': 'Project name',
    'projects.new.namePlaceholder': 'Enter a name',
    'projects.new.descriptionLabel': 'Description',
    'projects.new.descriptionPlaceholder': 'Describe your project',
    'projects.new.fileLabel': 'Architecture / file *',
    'projects.new.fileTitleSelected': 'File selected',
    'projects.new.fileTitle': 'Upload project (ZIP)',
    'projects.new.fileHintSelected': '{{name}} • {{size}}',
    'projects.new.fileHint': 'Drag archive here or click to choose',
    'projects.new.fileBadge': 'ZIP',
    'projects.new.fileNote': 'Upload a ZIP archive (required)',
    'projects.new.error.nameRequired': 'Enter a project name',
    'projects.new.error.fileRequired': 'You must choose a ZIP file',
    'projects.new.error.analysis': 'Project analysis error',
    'projects.new.error.create': 'Failed to create project',
    'projects.new.error.fileProcessing': 'File processing error on server. Contact administrator.',
    'projects.new.analysis.creating': 'Creating project...',
    'projects.new.analysis.analyzing': 'Analyzing project in real time...',
    'projects.new.analysis.completed': 'Analysis completed!',
    'projects.new.actions.cancel': 'Cancel',
    'projects.new.actions.submit': 'Create',
    'projects.new.actions.submitting': 'Creating...',
    'projects.new.building': 'Building graph...',
    'projects.new.built': 'Build complete',
    'projects.new.premium.title': 'Premium required',
    'projects.new.premium.description': 'File exceeds 50 MB. Purchase Premium to upload larger projects.',
    'projects.new.premium.buy': 'Buy Premium',
    'projects.new.premium.continueWithout': 'Continue without file',

    'graph.nodes': 'Nodes',
    'graph.edges': 'Edges',
    'graph.requirements': 'Dependencies',
    'graph.endpoints': 'Endpoints',
    'graph.rendering': 'Rendering...',
    'graph.rendered': 'Rendering finished',
    'graph.meta': 'Nodes: {{nodes}} | Edges: {{edges}} | Requirements: {{requirements}} | Endpoints: {{endpoints}}',
    'graph.title': 'Project Architecture',
    'graph.actions.more': 'Open menu',
    'graph.actions.title': 'Actions',
    'graph.actions.delete': 'Delete',

    'analysis.renderDone': 'Rendering finished',
    'analysis.renderInProgress': 'Rendering, please wait',
    'analysis.loadingData': 'Please wait. Loading data...',
    'analysis.reload': 'Reload page',
    'analysis.preparingTitle': 'Preparing architecture visualization...',
    'analysis.preparingSubtitle': 'Connecting and preparing data. Usually takes a few seconds.',
    'analysis.buildingGraph': 'Please wait. Building graph...',
    'analysis.dependencies': 'Dependencies',
    'analysis.dependenciesEmpty': 'Dependencies will appear once received.',
    'analysis.waitingStream': 'Waiting for stream...',
    'analysis.noDependencies': 'No dependencies found',
    'analysis.expandDependencies': 'Expand dependencies',
    'analysis.collapseDependencies': 'Collapse dependencies',

    'analysis.error.unknown': 'Unknown connection error',
    'analysis.error.notFound': 'Project not found (404).',
    'analysis.error.backend': 'Server infrastructure error (502/503).',
    'analysis.error.connect': 'Could not connect to the server.',
    'analysis.error.generic': 'Failed to load project data',
    'analysis.error.label': 'Error',
    'analysis.delete.confirm': 'Delete project? You will not be able to restore it.',
    'analysis.delete.notFound': 'Project not found or already deleted.',
    'analysis.delete.unauthorized': 'Session expired. Please sign in again.',
    'analysis.delete.failed': 'Could not delete project. Try again later.',
    'analysis.delete.deleting': 'Deleting...',
    'analysis.delete.delete': 'Delete project',

    'settings.title': 'Account settings',
    'settings.back': '← Back',
    'settings.profile': 'Profile',
    'settings.loginLabel': 'Login',
    'settings.loginPlaceholder': 'Your login',
    'settings.loginHint': 'Login cannot be changed',
    'settings.nameLabel': 'Name',
    'settings.surnameLabel': 'Surname',
    'settings.namePlaceholder': 'Your name',
    'settings.surnamePlaceholder': 'Your surname',
    'settings.saveProfile': 'Save changes',
    'settings.saveProfileLoading': 'Saving...',
    'settings.resetProfile': 'Reset',
    'settings.profileError': 'Fill in first and last name',
    'settings.profileSuccess': 'Profile updated',
    'settings.profileUpdateError': 'Could not update profile',
    'settings.profileDeleteError': 'Could not delete account',

    'settings.email': 'Email',
    'settings.currentEmail': 'Current email:',
    'settings.emailVerified': 'Email verified',
    'settings.unlinkEmail': 'Unlink email',
    'settings.unlinkingEmail': 'Unlinking...',
    'settings.enterEmail': 'Enter email',
    'settings.linkEmail': 'Link email',
    'settings.linkingEmail': 'Sending code...',
    'settings.verificationPrompt': 'Enter the verification code from the email:',
    'settings.verificationPlaceholder': 'Verification code',
    'settings.verify': 'Verify',
    'settings.cancel': 'Cancel',
    'settings.unlinkConfirm': 'Unlink email?',
    'settings.unlinkError': 'Could not unlink email',
    'settings.linkError': 'Could not link email',
    'settings.codeSent': 'Code sent to {{email}}',
    'settings.codeSentCurrent': 'Code sent to current email',
    'settings.invalidCode': 'Invalid verification code',
    'settings.emailAlreadyLinked': 'Email already linked',
    'settings.emailExists': 'Email already in use',
    'settings.emailNotLinked': 'Email is not linked',
    'settings.emailSendFailed': 'Could not send email. Try again later.',
    'settings.emailRequired': 'Enter email',
    'settings.codeRequired': 'Enter verification code',
    'settings.emailLinked': 'Email verified!',
    'settings.emailUnlinked': 'Email unlink confirmed!',
    'settings.profileLoadError': 'Could not load profile',

    'settings.delete.title': 'Delete account',
    'settings.delete.warning': 'This action is irreversible. All data will be removed.',
    'settings.delete.open': 'Delete account',
    'settings.delete.confirmTitle': 'Confirm deletion',
    'settings.delete.promptText': 'To delete the account, type',
    'settings.delete.phrase': 'delete my account {{login}}',
    'settings.delete.placeholder': 'delete my account {login}',
    'settings.delete.exact': 'Enter the exact confirmation phrase',
    'settings.delete.deleting': 'Deleting...',

    'settings.language.title': 'Language',
    'settings.language.subtitle': 'Choose interface language (default Russian)',
  },
};

const I18nContext = createContext({
  language: 'ru',
  setLanguage: () => {},
  t: (key, fallback) => fallback ?? key,
  availableLanguages: ['ru', 'en'],
});

function interpolate(template, values) {
  if (!values) return template;
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    const trimmed = key.trim();
    return Object.prototype.hasOwnProperty.call(values, trimmed) ? values[trimmed] : '';
  });
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    const stored = localStorage.getItem('app_language');
    return stored || 'ru';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key, fallback, values) => {
      const fromLang = translations[language]?.[key];
      const fromRu = translations.ru?.[key];
      const template = fromLang ?? fromRu ?? fallback ?? key;
      return interpolate(template, values);
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      availableLanguages: ['ru', 'en'],
    }),
    [language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

src/context/ThemeContext.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const storageKey = 'piapav-theme';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('light');
  const hasUserPreference = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    if (stored === 'light' || stored === 'dark') {
      setThemeState(stored);
      hasUserPreference.current = true;
    } else {
      setThemeState(mediaQuery.matches ? 'dark' : 'light');
    }

    const handleSystemChange = (event) => {
      if (hasUserPreference.current) return;
      setThemeState(event.matches ? 'dark' : 'light');
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }

    mediaQuery.addListener(handleSystemChange);
    return () => mediaQuery.removeListener(handleSystemChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
  }, [theme]);

  const applyTheme = useCallback((nextTheme) => {
    hasUserPreference.current = true;
    setThemeState(nextTheme);
    localStorage.setItem(storageKey, nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      hasUserPreference.current = true;
      localStorage.setItem(storageKey, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme: applyTheme,
      toggleTheme,
    }),
    [applyTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

src/data/demoProject.js
// Демо-проект с моковыми данными для демонстрации возможностей системы
export const DEMO_PROJECT = {
  id: 'demo',
  name: 'PIAPAV Demo Project',
  description: 'Демонстрация возможностей анализа архитектуры',
  picture_url: null,
  architecture: {
    requirements: [
      'aio-pika', 'asyncpg', 'bcrypt', 'boto3', 'fastapi',
      'grpcio', 'grpcio-tools', 'pika', 'protobuf', 'pyjwt',
      'python-dotenv', 'python-multipart', 'pyyaml', 'sqlalchemy', 'uvicorn'
    ],
    endpoints: {
      'registration': 'POST /v1/auth/registration',
      'refresh': 'POST /v1/auth/refresh',
      'patch_project': 'PATCH /v1/project/{project_id}',
      'patch_account': 'PATCH /v1/account',
      'login': 'POST /v1/auth/login',
      'homepage': 'GET /v1/home',
      'get_project': 'GET /v1/project/{project_id}',
      'get_projects_list': 'GET /v1/project',
      'get_account': 'GET /v1/account',
      'delete_project': 'DELETE /v1/project/{project_id}',
      'create_project': 'POST /v1/project',
    },
    data: {
      'Account.create_account': ['datamanager/DatabaseManager.session', 'accounts/Account', 'accounts/session.add'],
      'Account.get_account_by_id': ['datamanager/DatabaseManager.session', 'accounts/session.get', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'],
      'Project.create_project': ['datamanager/DatabaseManager.session', 'projects/Project', 'projects/session.add'],
      'Project.get_project_by_id': ['datamanager/DatabaseManager.session', 'projects/session.get', 'projects/DataBaseEntityNotExists'],
      'Project.get_projects_list': ['datamanager/DatabaseManager.session', 'projects/session.execute', 'projects/select', 'projects/Project'],
      'AuthController.login': ['accounts/Account.get_account_by_login', 'accounts/bcrypt.checkpw', 'accounts/pyjwt.encode', 'accounts/datetime'],
      'AuthController.registration': ['accounts/Account.get_account_by_login', 'accounts/bcrypt.hashpw', 'accounts/Account.create_account'],
      'AuthController.refresh': ['accounts/pyjwt.decode', 'accounts/Account.get_account_by_id', 'accounts/datetime'],
      'ProjectController.create_project': ['projects/Project.create_project', 'projects/boto3.client', 'projects/upload_fileobj'],
      'ProjectController.get_project': ['projects/Project.get_project_by_id', 'projects/boto3.client', 'projects/generate_presigned_url'],
      'ProjectController.get_projects': ['projects/Project.get_projects_list'],
      'ProjectController.update_project': ['projects/Project.get_project_by_id', 'projects/session.commit'],
      'ProjectController.delete_project': ['projects/Project.get_project_by_id', 'projects/session.delete', 'projects/boto3.client'],
      'AccountController.get_account': ['accounts/Account.get_account_by_id'],
      'AccountController.update_account': ['accounts/Account.get_account_by_id', 'accounts/session.commit'],
      'router.registration': ['AuthController.registration', 'fastapi/APIRouter.post'],
      'router.login': ['AuthController.login', 'fastapi/APIRouter.post'],
      'router.refresh': ['AuthController.refresh', 'fastapi/APIRouter.post'],
      'router.create_project': ['ProjectController.create_project', 'fastapi/APIRouter.post'],
      'router.get_project': ['ProjectController.get_project', 'fastapi/APIRouter.get'],
      'router.get_projects': ['ProjectController.get_projects', 'fastapi/APIRouter.get'],
      'router.update_project': ['ProjectController.update_project', 'fastapi/APIRouter.patch'],
      'router.delete_project': ['ProjectController.delete_project', 'fastapi/APIRouter.delete'],
      'router.get_account': ['AccountController.get_account', 'fastapi/APIRouter.get'],
      'router.update_account': ['AccountController.update_account', 'fastapi/APIRouter.patch'],
    }
  }
};

src/data/graph42.json
{
  "task_id": 42,
  "requirements": [
    "aio-pika",
    "asyncpg",
    "bcrypt",
    "boto3",
    "fastapi",
    "grpcio",
    "grpcio-tools",
    "pika",
    "protobuf",
    "pyjwt",
    "python-dotenv",
    "python-multipart",
    "pyyaml",
    "sqlalchemy",
    "uvicorn"
  ],
  "endpoints": {
    "POST /v1/auth/registration": "Account.create_account",
    "POST /v1/auth/login": "Account.login",
    "POST /v1/auth/refresh": "Account.refresh_token",
    "GET /v1/project": "Project.get_all_projects",
    "POST /v1/project": "Project.create_project",
    "GET /v1/project/{id}": "Project.get_project_by_id",
    "PUT /v1/project/{id}": "Project.update_project",
    "DELETE /v1/project/{id}": "Project.delete_project",
    "POST /v1/project/{id}/upload": "Project.upload_file",
    "GET /v1/project/{id}/status": "Project.get_status",
    "GET /v1/health": "Health.check"
  },
  "architecture": [
    {
      "parent": "Account.create_account",
      "children": ["datamanager/DatabaseManager.session", "accounts/Account", "accounts/session.add"]
    },
    {
      "parent": "Account.get_account_by_id",
      "children": ["datamanager/DatabaseManager.session", "accounts/session.get", "accounts/log.error", "accounts/DataBaseEntityNotExists"]
    },
    {
      "parent": "Account.login",
      "children": ["datamanager/DatabaseManager.session", "accounts/session.query", "accounts/verify_password", "accounts/create_tokens"]
    },
    {
      "parent": "Account.refresh_token",
      "children": ["accounts/verify_token", "accounts/create_tokens"]
    },
    {
      "parent": "Project.create_project",
      "children": ["datamanager/DatabaseManager.session", "projects/Project", "projects/session.add", "projects/commit"]
    },
    {
      "parent": "Project.get_all_projects",
      "children": ["datamanager/DatabaseManager.session", "projects/session.query", "projects/all"]
    },
    {
      "parent": "Project.get_project_by_id",
      "children": ["datamanager/DatabaseManager.session", "projects/session.get", "projects/DataBaseEntityNotExists"]
    },
    {
      "parent": "Project.update_project",
      "children": ["datamanager/DatabaseManager.session", "projects/session.query", "projects/commit"]
    },
    {
      "parent": "Project.delete_project",
      "children": ["datamanager/DatabaseManager.session", "projects/session.delete", "projects/commit"]
    },
    {
      "parent": "Project.upload_file",
      "children": ["boto3/S3Client", "projects/upload_to_s3", "projects/update_project"]
    },
    {
      "parent": "DatabaseManager.session",
      "children": ["sqlalchemy/Session", "sqlalchemy/create_engine", "sqlalchemy/sessionmaker"]
    },
    {
      "parent": "DatabaseManager.create_tables",
      "children": ["sqlalchemy/Base.metadata.create_all"]
    },
    {
      "parent": "Health.check",
      "children": ["fastapi/Response", "health/status"]
    }
  ]
}

src/grpc/api_core_grpc_web_pb.js
/**
 * @fileoverview gRPC-Web client for FrontendStreamService
 * Сгенерировано вручную на основе proto/api/core.proto
 */

/* eslint-disable */
// @ts-nocheck

import * as grpcWeb from 'grpc-web';
import * as api_core_pb from './api_core_pb';
import * as shared_common_pb from './shared_common_pb';

/**
 * FrontendStreamServiceClient - клиент для gRPC-Web стрима
 */
export class FrontendStreamServiceClient {
  constructor(hostname, credentials, options) {
    if (!options) options = {};
    if (!credentials) credentials = {};
    options['format'] = 'binary';

    this.hostname_ = hostname;
    this.credentials_ = credentials;
    this.options_ = options;
  }

  /**
   * RunAlgorithm - запуск алгоритма анализа с серверным стримом
   * @param {!AlgorithmRequest} request
   * @param {!Object<string, string>} metadata
   * @return {!grpc.web.ClientReadableStream<!GraphPartResponse>}
   */
  runAlgorithm(request, metadata) {
    return this.client_.serverStreaming(
      this.hostname_ + '/core.api.FrontendStreamService/RunAlgorithm',
      request,
      metadata || {},
      new MethodDescriptor(
        '/core.api.FrontendStreamService/RunAlgorithm',
        MethodType.SERVER_STREAMING,
        api_core_pb.AlgorithmRequest,
        shared_common_pb.GraphPartResponse,
        (request) => request.serializeBinary(),
        shared_common_pb.GraphPartResponse.deserializeBinary
      )
    );
  }
}

/**
 * MethodType enum
 */
const MethodType = {
  UNARY: 'unary',
  SERVER_STREAMING: 'server_streaming',
  CLIENT_STREAMING: 'client_streaming',
  BIDI_STREAMING: 'bidi_streaming'
};

/**
 * MethodDescriptor - описание метода gRPC
 */
class MethodDescriptor {
  constructor(name, methodType, requestType, responseType, requestSerialize, responseDeserialize) {
    this.name = name;
    this.methodType = methodType;
    this.requestType = requestType;
    this.responseType = responseType;
    this.requestSerialize = requestSerialize;
    this.responseDeserialize = responseDeserialize;
  }
}

/**
 * Альтернативная реализация с использованием fetch API
 * Это более простая версия без полной grpc-web библиотеки
 */
export class SimpleFrontendStreamServiceClient {
  constructor(hostname) {
    this.hostname = hostname;
  }

  /**
   * RunAlgorithm - запуск алгоритма с серверным стримом
   * @param {!AlgorithmRequest} request
   * @param {!Object<string, string>} metadata
   * @return {!Object} объект с методами on() для обработки событий
   */
  runAlgorithm(request, metadata) {
    const url = `${this.hostname}/core.api.FrontendStreamService/RunAlgorithm`;
    const requestBytes = request.serializeBinary();
    
    // gRPC-Web формат требует 5-байтовый prefix:
    // [compressed_flag: 1 byte][length: 4 bytes big-endian][message]
    const frame = new Uint8Array(5 + requestBytes.length);
    frame[0] = 0; // не сжато
    frame[1] = (requestBytes.length >> 24) & 0xFF;
    frame[2] = (requestBytes.length >> 16) & 0xFF;
    frame[3] = (requestBytes.length >> 8) & 0xFF;
    frame[4] = requestBytes.length & 0xFF;
    frame.set(requestBytes, 5);

    const abortController = new AbortController();
    let handlers = {
      data: [],
      error: [],
      end: [],
      status: []
    };

    // Логируем полный запрос
    console.log('[grpc-web] 📤 Отправка:', {
      url,
      frameLength: frame.length,
      messageLength: requestBytes.length,
      frameHex: Array.from(frame).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });

    // Запускаем fetch асинхронно
    this._startStream(url, frame, metadata, abortController, handlers);

    // Возвращаем объект со stream API
    return {
      on(event, callback) {
        if (handlers[event]) {
          handlers[event].push(callback);
        }
        return this;
      },
      cancel() {
        abortController.abort();
      }
    };
  }

  async _startStream(url, requestBytes, metadata, abortController, handlers) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/grpc-web+proto',
          'X-Grpc-Web': '1',
          ...metadata
        },
        body: requestBytes,
        signal: abortController.signal
      });

      if (!response.ok) {
        const error = new Error(`gRPC request failed: ${response.status} ${response.statusText}`);
        error.code = response.status;
        handlers.error.forEach(cb => cb(error));
        return;
      }

      // Проверяем gRPC статус в заголовках (может быть установлен до конца stream)
      const grpcStatus = response.headers.get('grpc-status');
      if (grpcStatus && grpcStatus !== '0') {
        const grpcMessage = response.headers.get('grpc-message') || 'Unknown gRPC error';
        const error = new Error(`gRPC error: ${grpcMessage}`);
        error.code = parseInt(grpcStatus);
        handlers.error.forEach(cb => cb(error));
        return;
      }

      const reader = response.body.getReader();
      let buffer = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Добавляем новые данные к буферу
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // Парсим все доступные сообщения из буфера
        while (buffer.length >= 5) {
          const compressedFlag = buffer[0];
          const messageLength = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];

          if (buffer.length < 5 + messageLength) {
            break; // Ждём больше данных
          }

          const messageBytes = buffer.slice(5, 5 + messageLength);
          buffer = buffer.slice(5 + messageLength);

          try {
            // Проверяем, что это не trailer frame
            if (compressedFlag === 0x80) {
              console.log('[grpc-web] Skipping trailer frame');
              continue;
            }
            
            const message = shared_common_pb.GraphPartResponse.deserializeBinary(messageBytes);
            handlers.data.forEach(cb => cb(message));
          } catch (parseError) {
            console.warn('[grpc-web] Failed to parse message (possibly trailer):', parseError.message);
            // Продолжаем, не падаем на кривых данных
          }
        }
      }

      // Stream завершён - проверяем финальные трейлеры
      // В gRPC-Web трейлеры могут быть в последнем фрейме
      // Если buffer содержит trailer фрейм (flag = 0x80), обрабатываем его
      if (buffer.length > 0 && buffer[0] === 0x80) {
        // Trailer frame - пропускаем, т.к. статус уже проверили в заголовках
        console.log('[grpc-web] Received trailer frame, ignoring');
      }
      
      handlers.status.forEach(cb => cb({ code: 0, message: 'OK' }));
      handlers.end.forEach(cb => cb());

    } catch (error) {
      if (error.name !== 'AbortError') {
        handlers.error.forEach(cb => cb(error));
      }
    }
  }
}

export { api_core_pb, shared_common_pb };

src/grpc/api_core_pb.js
/**
 * @fileoverview Generated Protocol Buffer code for core.proto
 * Сгенерировано вручную на основе proto/api/core.proto
 */

/* eslint-disable */
// @ts-nocheck

import * as jspb from 'google-protobuf';

/**
 * Message: AlgorithmRequest
 */
export class AlgorithmRequest extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, null, null);
  }

  getUserId() {
    return jspb.Message.getFieldWithDefault(this, 1, 0);
  }

  setUserId(value) {
    return jspb.Message.setProto3IntField(this, 1, value);
  }

  getTaskId() {
    return jspb.Message.getFieldWithDefault(this, 2, 0);
  }

  setTaskId(value) {
    return jspb.Message.setProto3IntField(this, 2, value);
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    AlgorithmRequest.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new AlgorithmRequest();
    return AlgorithmRequest.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const userId = message.getUserId();
    if (userId !== 0) {
      writer.writeInt64(1, userId);
    }
    const taskId = message.getTaskId();
    if (taskId !== 0) {
      writer.writeInt64(2, taskId);
    }
  }

  static deserializeBinaryFromReader(msg, reader) {
    while (reader.nextField()) {
      if (reader.isEndGroup()) {
        break;
      }
      const field = reader.getFieldNumber();
      switch (field) {
        case 1:
          msg.setUserId(reader.readInt64());
          break;
        case 2:
          msg.setTaskId(reader.readInt64());
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}

src/grpc/shared_common_pb.js
/**
 * @fileoverview Generated Protocol Buffer code for common.proto
 * Сгенерировано вручную на основе proto/shared/common.proto
 */

/* eslint-disable */
// @ts-nocheck

import * as jspb from 'google-protobuf';

/**
 * enum ParseStatus
 * ВАЖНО: START (0) определён в proto, но бэкенд его НЕ отправляет
 * Реальная последовательность: REQUIREMENTS → ENDPOINTS → ARHITECTURE → DONE
 */
export const ParseStatus = {
  START: 0,           // Не используется бэкендом
  REQUIREMENTS: 1,    // Первый статус - список зависимостей
  ENDPOINTS: 2,       // Второй статус - словарь эндпоинтов
  ARHITECTURE: 3,     // Множество статусов - узлы графа (опечатка в proto)
  DONE: 4             // Финальный статус - завершение (parent="", children="" - заглушка)
};

/**
 * Message: GraphPartRequirements
 */
export class GraphPartRequirements extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, [2], null);
  }

  getTotal() {
    return jspb.Message.getFieldWithDefault(this, 1, 0);
  }

  setTotal(value) {
    return jspb.Message.setProto3IntField(this, 1, value);
  }

  getRequirementsList() {
    return jspb.Message.getRepeatedField(this, 2);
  }

  setRequirementsList(value) {
    return jspb.Message.setField(this, 2, value || []);
  }

  addRequirements(value, opt_index) {
    return jspb.Message.addToRepeatedField(this, 2, value, opt_index);
  }

  clearRequirementsList() {
    return this.setRequirementsList([]);
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    GraphPartRequirements.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new GraphPartRequirements();
    return GraphPartRequirements.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const total = message.getTotal();
    if (total !== 0) {
      writer.writeUint32(1, total);
    }
    const requirements = message.getRequirementsList();
    if (requirements.length > 0) {
      writer.writeRepeatedString(2, requirements);
    }
  }

  static deserializeBinaryFromReader(msg, reader) {
    while (reader.nextField()) {
      if (reader.isEndGroup()) {
        break;
      }
      const field = reader.getFieldNumber();
      switch (field) {
        case 1:
          msg.setTotal(reader.readUint32());
          break;
        case 2:
          msg.addRequirements(reader.readString());
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}

/**
 * Message: GraphPartEndpoints
 */
export class GraphPartEndpoints extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, null, null);
  }

  getTotal() {
    return jspb.Message.getFieldWithDefault(this, 1, 0);
  }

  setTotal(value) {
    return jspb.Message.setProto3IntField(this, 1, value);
  }

  getEndpointsMap() {
    return jspb.Message.getMapField(this, 2, false, null);
  }

  clearEndpointsMap() {
    this.getEndpointsMap().clear();
    return this;
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    GraphPartEndpoints.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new GraphPartEndpoints();
    return GraphPartEndpoints.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const total = message.getTotal();
    if (total !== 0) {
      writer.writeUint32(1, total);
    }
    const endpoints = message.getEndpointsMap();
    if (endpoints && endpoints.getLength() > 0) {
      endpoints.serializeBinary(2, writer, jspb.BinaryWriter.prototype.writeString, jspb.BinaryWriter.prototype.writeString);
    }
  }

  static deserializeBinaryFromReader(msg, reader) {
    while (reader.nextField()) {
      if (reader.isEndGroup()) {
        break;
      }
      const field = reader.getFieldNumber();
      switch (field) {
        case 1:
          msg.setTotal(reader.readUint32());
          break;
        case 2:
          const value = msg.getEndpointsMap();
          reader.readMessage(value, function(message, reader) {
            jspb.Map.deserializeBinary(message, reader, jspb.BinaryReader.prototype.readString, jspb.BinaryReader.prototype.readString, null, "", "");
          });
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}

/**
 * Message: GraphPartArchitecture
 */
export class GraphPartArchitecture extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, [2], null);
  }

  getParent() {
    return jspb.Message.getFieldWithDefault(this, 1, "");
  }

  setParent(value) {
    return jspb.Message.setProto3StringField(this, 1, value);
  }

  getChildrenList() {
    return jspb.Message.getRepeatedField(this, 2);
  }

  setChildrenList(value) {
    return jspb.Message.setField(this, 2, value || []);
  }

  addChildren(value, opt_index) {
    return jspb.Message.addToRepeatedField(this, 2, value, opt_index);
  }

  clearChildrenList() {
    return this.setChildrenList([]);
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    GraphPartArchitecture.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new GraphPartArchitecture();
    return GraphPartArchitecture.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const parent = message.getParent();
    if (parent.length > 0) {
      writer.writeString(1, parent);
    }
    const children = message.getChildrenList();
    if (children.length > 0) {
      writer.writeRepeatedString(2, children);
    }
  }

  static deserializeBinaryFromReader(msg, reader) {
    while (reader.nextField()) {
      if (reader.isEndGroup()) {
        break;
      }
      const field = reader.getFieldNumber();
      switch (field) {
        case 1:
          msg.setParent(reader.readString());
          break;
        case 2:
          msg.addChildren(reader.readString());
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}

/**
 * Message: GraphPartResponse
 */
export class GraphPartResponse extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, null, GraphPartResponse.oneofGroups_);
  }

  static oneofGroups_ = [[4, 5, 6]];

  getTaskId() {
    return jspb.Message.getFieldWithDefault(this, 1, 0);
  }

  setTaskId(value) {
    return jspb.Message.setProto3IntField(this, 1, value);
  }

  getResponseId() {
    return jspb.Message.getFieldWithDefault(this, 2, 0);
  }

  setResponseId(value) {
    return jspb.Message.setProto3IntField(this, 2, value);
  }

  getStatus() {
    return jspb.Message.getFieldWithDefault(this, 3, 0);
  }

  setStatus(value) {
    return jspb.Message.setProto3EnumField(this, 3, value);
  }

  getGraphRequirements() {
    return jspb.Message.getWrapperField(this, GraphPartRequirements, 4);
  }

  setGraphRequirements(value) {
    return jspb.Message.setOneofWrapperField(this, 4, GraphPartResponse.oneofGroups_[0], value);
  }

  clearGraphRequirements() {
    return this.setGraphRequirements(undefined);
  }

  hasGraphRequirements() {
    return jspb.Message.getField(this, 4) != null;
  }

  getGraphEndpoints() {
    return jspb.Message.getWrapperField(this, GraphPartEndpoints, 5);
  }

  setGraphEndpoints(value) {
    return jspb.Message.setOneofWrapperField(this, 5, GraphPartResponse.oneofGroups_[0], value);
  }

  clearGraphEndpoints() {
    return this.setGraphEndpoints(undefined);
  }

  hasGraphEndpoints() {
    return jspb.Message.getField(this, 5) != null;
  }

  getGraphArchitecture() {
    return jspb.Message.getWrapperField(this, GraphPartArchitecture, 6);
  }

  setGraphArchitecture(value) {
    return jspb.Message.setOneofWrapperField(this, 6, GraphPartResponse.oneofGroups_[0], value);
  }

  clearGraphArchitecture() {
    return this.setGraphArchitecture(undefined);
  }

  hasGraphArchitecture() {
    return jspb.Message.getField(this, 6) != null;
  }

  getGraphPartTypeCase() {
    return jspb.Message.computeOneofCase(this, GraphPartResponse.oneofGroups_[0]);
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    GraphPartResponse.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new GraphPartResponse();
    return GraphPartResponse.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const taskId = message.getTaskId();
    if (taskId !== 0) {
      writer.writeInt64(1, taskId);
    }
    const responseId = message.getResponseId();
    if (responseId !== 0) {
      writer.writeInt32(2, responseId);
    }
    const status = message.getStatus();
    if (status !== 0) {
      writer.writeEnum(3, status);
    }
    const graphRequirements = message.getGraphRequirements();
    if (graphRequirements != null) {
      writer.writeMessage(4, graphRequirements, GraphPartRequirements.serializeBinaryToWriter);
    }
    const graphEndpoints = message.getGraphEndpoints();
    if (graphEndpoints != null) {
      writer.writeMessage(5, graphEndpoints, GraphPartEndpoints.serializeBinaryToWriter);
    }
    const graphArchitecture = message.getGraphArchitecture();
    if (graphArchitecture != null) {
      writer.writeMessage(6, graphArchitecture, GraphPartArchitecture.serializeBinaryToWriter);
    }
  }

  static deserializeBinaryFromReader(msg, reader) {
    while (reader.nextField()) {
      if (reader.isEndGroup()) {
        break;
      }
      const field = reader.getFieldNumber();
      switch (field) {
        case 1:
          msg.setTaskId(reader.readInt64());
          break;
        case 2:
          msg.setResponseId(reader.readInt32());
          break;
        case 3:
          msg.setStatus(reader.readEnum());
          break;
        case 4:
          const req = new GraphPartRequirements();
          reader.readMessage(req, GraphPartRequirements.deserializeBinaryFromReader);
          msg.setGraphRequirements(req);
          break;
        case 5:
          const endp = new GraphPartEndpoints();
          reader.readMessage(endp, GraphPartEndpoints.deserializeBinaryFromReader);
          msg.setGraphEndpoints(endp);
          break;
        case 6:
          const arch = new GraphPartArchitecture();
          reader.readMessage(arch, GraphPartArchitecture.deserializeBinaryFromReader);
          msg.setGraphArchitecture(arch);
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}

src/index.css
:root {
  color-scheme: light;
  --page-gradient: linear-gradient(135deg, #e8ecff 0%, #f4efff 40%, #e9f6ff 100%);
  --page-solid: #f5f7fb;
  --surface: #ffffff;
  --surface-raised: #f8fafc;
  --graph-surface: #edf2f7;
  --graph-node-bg: #f6f8ff;
  --graph-node-border: #d8e2f5;
  --graph-chip-bg: #eef2ff;
  --glass: rgba(255, 255, 255, 0.15);
  --glass-strong: rgba(255, 255, 255, 0.9);
  --glass-border: rgba(255, 255, 255, 0.2);
  --frost: rgba(255, 255, 255, 0.18);
  --frost-strong: rgba(255, 255, 255, 0.28);
  --text-primary: #0f172a;
  --text-secondary: #1f2937;
  --text-muted: #4b5563;
  --text-subtle: #6b7280;
  --text-inverse: #ffffff;
  --primary: #667eea;
  --primary-2: #764ba2;
  --primary-strong: #4c63d9;
  --primary-soft: #e0e7ff;
  --primary-gradient: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --shadow-soft: rgba(15, 23, 42, 0.12);
  --shadow-strong: rgba(15, 23, 42, 0.22);
  --danger: #ef4444;
  --danger-strong: #b91c1c;
  --danger-soft: #fee2e2;
  --warning: #f59e0b;
  --warning-strong: #d97706;
  --warning-soft: #fef3c7;
  --success: #22c55e;
  --success-soft: #ecfdf3;
  --input-bg: #f8fafc;
  --input-disabled: #f3f4f6;
  --badge: #f3f4f6;
  --link: #667eea;
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --page-gradient: radial-gradient(120% 120% at 20% 20%, #0b1221 0%, #0a0f1e 45%, #050a13 100%);
  --page-solid: #050a13;
  --surface: #0f172a;
  --surface-raised: #0b1221;
  --graph-surface: #0f1a2c;
  --graph-node-bg: #14243a;
  --graph-node-border: rgba(255, 255, 255, 0.1);
  --graph-chip-bg: rgba(255, 255, 255, 0.08);
  --glass: rgba(255, 255, 255, 0.08);
  --glass-strong: rgba(255, 255, 255, 0.06);
  --glass-border: rgba(148, 163, 184, 0.25);
  --frost: rgba(255, 255, 255, 0.08);
  --frost-strong: rgba(255, 255, 255, 0.14);
  --text-primary: #e2e8f0;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --text-subtle: #94a3b8;
  --text-inverse: #0b1221;
  --primary: #22d3ee;
  --primary-2: #a855f7;
  --primary-strong: #22d3ee;
  --primary-soft: rgba(34, 211, 238, 0.16);
  --primary-gradient: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
  --border: #1f2937;
  --border-strong: #243044;
  --shadow-soft: rgba(0, 0, 0, 0.35);
  --shadow-strong: rgba(0, 0, 0, 0.55);
  --danger: #f87171;
  --danger-strong: #ef4444;
  --danger-soft: rgba(248, 113, 113, 0.14);
  --warning: #fbbf24;
  --warning-strong: #f59e0b;
  --warning-soft: rgba(251, 191, 36, 0.14);
  --success: #34d399;
  --success-soft: rgba(52, 211, 153, 0.14);
  --input-bg: #0b1221;
  --input-disabled: #111827;
  --badge: rgba(255, 255, 255, 0.08);
  --link: #22d3ee;
}

* {
  box-sizing: border-box;
  font-family: Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  margin: 0;
}

body {
  background: var(--page-gradient);
  color: var(--text-primary);
  min-height: 100vh;
  transition: background 0.3s ease, color 0.3s ease;
}

a {
  color: var(--link);
}

/* Курорсы остаются кастомными */
body,
body *,
#root,
#root * {
  cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="black" stroke="white" stroke-width="1" d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>') 0 0, auto !important;
}

.react-flow,
.react-flow *,
.react-flow__renderer,
.react-flow__viewport,
.react-flow__pane,
.react-flow__selectionpane,
.react-flow__background {
  cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="black" stroke="white" stroke-width="1" d="M9 10v8h2v-8h4l-5-5-5 5h4zm5 4v4h4v-4h-4z"/></svg>') 12 12, grab !important;
}

.react-flow__pane:active,
.react-flow__viewport:active {
  cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="black" stroke="white" stroke-width="1" d="M9 10v8h2v-8h4l-5-5-5 5h4zm5 4v4h4v-4h-4z"/></svg>') 12 12, grabbing !important;
}

.react-flow__node,
.react-flow__node *,
.react-flow__edge,
.react-flow__edge * {
  cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="black" stroke="white" stroke-width="1" d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>') 12 12, pointer !important;
}

.react-flow__controls button {
  cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="black" stroke="white" stroke-width="1" d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>') 12 12, pointer !important;
}

src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import deepLearningFavicon from './assets/img/logo/deep-learning.png'
import { I18nProvider } from './context/I18nContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

const faviconElement =
  document.querySelector("link[rel~='icon']") || document.createElement('link')
faviconElement.rel = 'icon'
faviconElement.type = 'image/png'
faviconElement.href = deepLearningFavicon
if (!faviconElement.parentNode) {
  document.head.appendChild(faviconElement)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)

src/pages/Auth/Auth.module.css
.container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--page-gradient);
    padding: 20px;
}

.formWrapper {
    background: var(--glass-strong);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    box-shadow: 0 20px 60px var(--shadow-strong);
    border: 1px solid var(--glass-border);
    padding: 40px;
    width: 100%;
    max-width: 450px;
    animation: slideUp 0.4s ease-out;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.form {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.title {
    text-align: center;
    font-size: 32px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 10px 0;
    background: var(--primary-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.inputGroup {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.inputGroup label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-left: 4px;
}

.input {
    padding: 14px 16px;
    border: 2px solid var(--border);
    border-radius: 12px;
    font-size: 15px;
    transition: all 0.3s ease;
    background: var(--surface);
    color: var(--text-primary);
}

.input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
}

.input:disabled {
    background: var(--input-disabled);
    cursor: not-allowed;
}

.input::placeholder {
    color: var(--text-subtle);
}

.passwordWrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.passwordInput {
    width: 100%;
    padding-right: 110px;
}

.togglePassword {
    position: absolute;
    right: 10px;
    padding: 8px 12px;
    background: var(--primary-soft);
    border: 1px solid var(--border);
    color: var(--primary);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
}

.togglePassword:hover:not(:disabled) {
    background: var(--surface-raised);
    box-shadow: 0 10px 20px var(--shadow-soft);
}

.togglePassword:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.togglePassword:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}

.error {
    background: var(--danger-soft);
    color: var(--danger-strong);
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 14px;
    border-left: 4px solid var(--danger-strong);
    margin: 0;
    animation: shake 0.3s ease;
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
}

.submitBtn {
    padding: 16px;
    background: var(--primary-gradient);
    color: var(--text-inverse);
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-top: 10px;
}

.submitBtn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px var(--shadow-strong);
}

.submitBtn:active:not(:disabled) {
    transform: translateY(0);
}

.submitBtn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.switch {
    text-align: center;
    font-size: 14px;
    color: var(--text-muted);
    margin: 10px 0 0 0;
}

.switch a {
    color: var(--primary);
    text-decoration: none;
    font-weight: 600;
    transition: color 0.2s ease;
}

.switch a:hover {
    color: var(--primary-2);
    text-decoration: underline;
}

/* Адаптивность */
@media (max-width: 500px) {
    .formWrapper {
        padding: 30px 20px;
    }

    .title {
        font-size: 28px;
    }

    .passwordInput {
        padding-right: 96px;
    }
}

src/pages/Auth/Login.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import styles from './Auth.module.css';

export default function Login() {
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    //валидация
    if (!form.login || !form.password) {
      setError(t('auth.login.error.missing', 'Заполните все поля'));
      setLoading(false);
      return;
    }

    try {
      const result = await login(form);

      if (result?.success) {
        navigate('/projects');
      } else {
        setError(result?.error || t('auth.login.error.failed', 'Не удалось авторизоваться.'));
      }
    } catch (submitError) {
      console.error('Submit login error:', submitError);
      setError(t('auth.login.error.failed', 'Не удалось авторизоваться. Попробуйте ещё раз.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.container}>
      <div className={styles.formWrapper}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h1 className={styles.title}>{t('auth.login.title', 'Вход')}</h1>
          
          <div className={styles.inputGroup}>
            <label htmlFor="login">{t('auth.login.loginLabel', 'Логин')}</label>
            <input
              id="login"
              name="login"
              type="text"
              value={form.login}
              onChange={handleChange}
              className={styles.input}
              placeholder={t('auth.login.loginPlaceholder', 'Введите логин')}
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">{t('auth.login.passwordLabel', 'Пароль')}</label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder={t('auth.login.passwordPlaceholder', 'Введите пароль')}
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
                aria-label={showPassword ? t('auth.login.hidePassword', 'Скрыть пароль') : t('auth.login.showPassword', 'Показать пароль')}
              >
                {showPassword ? t('auth.login.hidePassword', 'Скрыть') : t('auth.login.showPassword', 'Показать')}
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? t('auth.login.submitting', 'Вход...') : t('auth.login.submit', 'Войти')}
          </button>

          <p className={styles.switch}>
            {t('auth.login.noAccount', 'Нет аккаунта?')}{' '}
            <Link to="/register">{t('auth.login.create', 'Создать')}</Link>
          </p>
        </form>
      </div>
    </section>
  );
}

src/pages/Auth/Register.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import styles from './Auth.module.css';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    surname: '',
    login: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Валидация
    if (!form.name || !form.surname || !form.login || !form.password || !form.confirmPassword) {
      setError(t('auth.register.error.missing', 'Заполните все поля'));
      setLoading(false);
      return;
    }

    if (form.password.length < 8) {
      setError(t('auth.register.error.shortPassword', 'Пароль должен содержать минимум 8 символов'));
      setLoading(false);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(t('auth.register.error.mismatch', 'Пароли не совпадают'));
      setLoading(false);
      return;
    }

    const result = await register({
      name: form.name,
      surname: form.surname,
      login: form.login,
      password: form.password,
    });

    if (result.success) {
      navigate('/projects');
    } else {
      setError(result.error);
    }

    setLoading(false);
  }

  return (
    <section className={styles.container}>
      <div className={styles.formWrapper}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h1 className={styles.title}>{t('auth.register.title', 'Регистрация')}</h1>

          <div className={styles.inputGroup}>
            <label htmlFor="name">{t('auth.register.nameLabel', 'Имя')}</label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              className={styles.input}
              placeholder={t('auth.register.namePlaceholder', 'Введите имя')}
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="surname">{t('auth.register.surnameLabel', 'Фамилия')}</label>
            <input
              id="surname"
              name="surname"
              type="text"
              value={form.surname}
              onChange={handleChange}
              className={styles.input}
              placeholder={t('auth.register.surnamePlaceholder', 'Введите фамилию')}
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="login">{t('auth.register.loginLabel', 'Логин')}</label>
            <input
              id="login"
              name="login"
              type="text"
              value={form.login}
              onChange={handleChange}
              className={styles.input}
              placeholder={t('auth.register.loginPlaceholder', 'Введите логин')}
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">{t('auth.register.passwordLabel', 'Пароль')}</label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder={t('auth.register.passwordPlaceholder', 'Минимум 8 символов')}
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
                aria-label={showPassword ? t('auth.register.hidePassword', 'Скрыть пароль') : t('auth.register.showPassword', 'Показать пароль')}
              >
                {showPassword ? t('auth.register.hidePassword', 'Скрыть') : t('auth.register.showPassword', 'Показать')}
              </button>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="confirmPassword">{t('auth.register.confirmLabel', 'Подтвердите пароль')}</label>
            <div className={styles.passwordWrapper}>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder={t('auth.register.confirmPlaceholder', 'Повторите пароль')}
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                disabled={loading}
                aria-label={
                  showConfirmPassword
                    ? t('auth.register.hideConfirm', 'Скрыть подтверждение пароля')
                    : t('auth.register.showConfirm', 'Показать подтверждение пароля')
                }
              >
                {showConfirmPassword ? t('auth.register.hideConfirm', 'Скрыть') : t('auth.register.showConfirm', 'Показать')}
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? t('auth.register.submitting', 'Регистрация...') : t('auth.register.submit', 'Зарегистрироваться')}
          </button>

          <p className={styles.switch}>
            {t('auth.register.haveAccount', 'Уже есть аккаунт?')}{' '}
            <Link to="/login">{t('auth.register.login', 'Войти')}</Link>
          </p>
        </form>
      </div>
    </section>
  );
}

src/pages/Landing/Landing.jsx
import { useState } from 'react';
import styles from './Landing.module.css';
import { Link, useNavigate } from 'react-router-dom';
import logoImage from '../../assets/img/logo/deep-learning.png';
import { useI18n } from '../../context/I18nContext';
import { useTheme } from '../../context/ThemeContext';

const translations = {
    ru: {
        nav: {
            howItWorks: 'Как это работает',
            faq: 'FAQ',
            login: 'Вход',
            register: 'Регистрация',
        },
        heroTitleMain: 'Визуализируйте архитектуру',
        heroTitleAccent: 'в один',
        heroTitleClick: 'клик',
        heroDescription: 'Интерактивные диаграммы из вашего кода. PIAPAV анализирует модули, выявляет зависимости между слоями и помогает выявить риски мгновенно.',
        ctaPrimary: 'Попробовать бесплатно',
        scrollDown: 'Прокрутить вниз',
        howItWorksTitle: 'Как это работает',
        howItWorksSubtitle: 'Четыре простых шага до полного понимания вашей архитектуры',
        howItWorksSteps: [
            {
                icon: '📤',
                title: 'Загрузите проект',
                description: 'Просто загрузите архив с вашим кодом',
            },
            {
                icon: '🔍',
                title: 'Анализ кода в реальном времени',
                description: 'Система парсит зависимости, эндпоинты и строит граф вызовов в реальном времени',
            },
            {
                icon: '⚡',
                title: 'Анализируйте',
                description: 'Находите узкие места, понимайте связи и принимайте решения на основе данных',
            },
        ],
        techLabel: 'Технологии:',
        faqTitle: 'Часто задаваемые вопросы',
        faqSubtitle: 'Всё, что вам нужно знать о PIAPAV',
        faqs: [
            {
                question: 'Какие языки программирования поддерживаются?',
                answer: 'В текущей версии мы поддерживаем Python проекты (FastAPI, Django, Flask). В ближайших обновлениях добавим JavaScript/TypeScript, Go и другие популярные языки.',
            },
            {
                question: 'Как PIAPAV анализирует мой код?',
                answer: 'Мы используем статический анализ AST (Abstract Syntax Tree) для построения графа зависимостей. Ваш код не выполняется, анализируется только структура.',
            },
            {
                question: 'Безопасно ли загружать код?',
                answer: 'Абсолютно! Весь код хранится в зашифрованном виде в S3-совместимом хранилище. Анализ происходит в изолированной среде. Мы не имеем доступа к вашему коду.',
            },
            {
                question: 'Можно ли экспортировать результаты?',
                answer: 'Да! Вы можете сохранить архитектуру проекта в базе данных и вернуться к ней в любое время. Функции экспорта в PNG/SVG будут добавлены в следующем обновлении.',
            },
            {
                question: 'Есть ли ограничения по размеру проекта?',
                answer: 'Для бесплатного аккаунта ограничение составляет 50 МБ на проект. Premium пользователи могут загружать проекты до 500 МБ.',
            },
            {
                question: 'Как работает real-time анализ?',
                answer: 'Мы используем gRPC streaming для передачи данных по мере их обработки. Вы видите прогресс анализа в реальном времени: зависимости → эндпоинты → граф вызовов.',
            },
        ],
        ctaTitle: 'Готовы увидеть свою архитектуру?',
        ctaSubtitle: 'Начните анализировать проекты бесплатно уже сегодня',
        ctaButton: 'Начать сейчас',
        footerText: 'Визуализация архитектуры проектов.',
        modalTitle: 'Пробная версия',
        modalWarning: 'Без регистрации можно создать только один проект',
        modalCreateProject: 'Создать проект',
        modalRegister: 'Зарегистрироваться',
        langLabel: 'Язык',
        switchLabel: 'Выберите язык',
        theme: {
            dark: 'Тёмная тема',
            light: 'Светлая тема',
            toDark: 'Включить тёмную тему',
            toLight: 'Включить светлую тему',
            label: 'Тема',
        },
    },
    en: {
        nav: {
            howItWorks: 'How it works',
            faq: 'FAQ',
            login: 'Log in',
            register: 'Sign up',
        },
        heroTitleMain: 'Visualize your architecture',
        heroTitleAccent: 'in one',
        heroTitleClick: 'click',
        heroDescription: 'Interactive diagrams straight from your code. PIAPAV analyzes modules, uncovers cross-layer dependencies, and helps you spot risks instantly.',
        ctaPrimary: 'Try for free',
        scrollDown: 'Scroll down',
        howItWorksTitle: 'How it works',
        howItWorksSubtitle: 'Four simple steps to fully understand your architecture',
        howItWorksSteps: [
            {
                icon: '📤',
                title: 'Upload a project',
                description: 'Just upload an archive with your code',
            },
            {
                icon: '🔍',
                title: 'Live code analysis',
                description: 'The system parses dependencies, endpoints, and builds a call graph in real time',
            },
            {
                icon: '⚡',
                title: 'Analyze',
                description: 'Find bottlenecks, understand relationships, and make data-driven decisions',
            },
        ],
        techLabel: 'Tech stack:',
        faqTitle: 'Frequently asked questions',
        faqSubtitle: 'Everything you need to know about PIAPAV',
        faqs: [
            {
                question: 'Which programming languages are supported?',
                answer: 'We currently support Python projects (FastAPI, Django, Flask). JavaScript/TypeScript, Go, and other languages are coming soon.',
            },
            {
                question: 'How does PIAPAV analyze my code?',
                answer: 'We use static AST analysis to build the dependency graph. Your code is never executed—only the structure is inspected.',
            },
            {
                question: 'Is it safe to upload my code?',
                answer: 'Absolutely. Your code is stored encrypted in S3-compatible storage. Analysis runs in an isolated environment. We do not access your code.',
            },
            {
                question: 'Can I export the results?',
                answer: 'Yes. You can save the project architecture in the database and return to it anytime. Export to PNG/SVG will be added in the next release.',
            },
            {
                question: 'Are there project size limits?',
                answer: 'Free accounts are limited to 50 MB per project. Premium users can upload projects up to 500 MB.',
            },
            {
                question: 'How does the real-time analysis work?',
                answer: 'We use gRPC streaming to send data as it is processed. You see live progress: dependencies → endpoints → call graph.',
            },
        ],
        ctaTitle: 'Ready to see your architecture?',
        ctaSubtitle: 'Start analyzing projects for free today',
        ctaButton: 'Start now',
        footerText: 'Project architecture visualization.',
        modalTitle: 'Trial version',
        modalWarning: 'Without sign up you can create only one project',
        modalCreateProject: 'Create project',
        modalRegister: 'Sign up',
        langLabel: 'Language',
        switchLabel: 'Select language',
        theme: {
            dark: 'Dark theme',
            light: 'Light theme',
            toDark: 'Switch to dark theme',
            toLight: 'Switch to light theme',
            label: 'Theme',
        },
    },
};

const SunIcon = () => (
    <svg className={styles.themeGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);

const MoonIcon = () => (
    <svg className={styles.themeGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
);

export default function Landing() {
    const [activeFaq, setActiveFaq] = useState(null);
    const [showTrialModal, setShowTrialModal] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const { language: lang, setLanguage } = useI18n();
    const { theme, toggleTheme } = useTheme();

    const t = translations[lang];
    const howItWorksSteps = t.howItWorksSteps;
    const faqs = t.faqs;
    const isDark = theme === 'dark';

    const scrollToSection = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    const renderLanguageSwitcher = (className = '') => (
        <div className={`${styles.langSwitch} ${className}`} role="group" aria-label={t.switchLabel}>
            {['ru', 'en'].map((code) => (
                <button
                    key={code}
                    className={`${styles.langBtn} ${lang === code ? styles.langBtnActive : ''}`}
                    onClick={() => setLanguage(code)}
                    disabled={lang === code}
                    aria-pressed={lang === code}
                >
                    {code.toUpperCase()}
                </button>
            ))}
        </div>
    );

    const renderThemeToggle = (className = '') => (
        <button
            type="button"
            className={`${styles.themeToggle} ${isDark ? styles.themeToggleActive : ''} ${className}`}
            onClick={toggleTheme}
            aria-pressed={isDark}
            aria-label={isDark ? t.theme.toLight : t.theme.toDark}
            title={isDark ? t.theme.toLight : t.theme.toDark}
        >
            <span className={styles.themeIcon}>{isDark ? <MoonIcon /> : <SunIcon />}</span>
            <span className={styles.themeText}>{isDark ? t.theme.dark : t.theme.light}</span>
        </button>
    );

    return (
        <div className={`${styles.container} ${isDark ? styles.dark : ''}`}>
            {/* Hero Section */}
            <div className={styles.heroSection}>
                <div className={styles.header}>
                    <div className={styles.logo}>
                        <img src={logoImage} alt="PIAPAV logo" />
                        <span>PIAPAV</span>
                    </div>
                    
                    <button 
                        className={styles.burgerBtn}
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        aria-label="Menu"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>

                    <div className={styles.centerNav}>
                        <button onClick={() => scrollToSection('how-it-works')}>{t.nav.howItWorks}</button>
                        <button onClick={() => scrollToSection('faq')}>{t.nav.faq}</button>
                    </div>
                    <nav className={styles.nav}>
                        {renderLanguageSwitcher(styles.navLangSwitch)}
                        {renderThemeToggle()}
                        <Link to="/login" className={styles.loginBtn}>{t.nav.login}</Link>
                        <Link to="/register" className={styles.registerBtn}>{t.nav.register}</Link>
                    </nav>
                    
                    {/* Mobile Menu */}
                    <div className={`${styles.mobileMenu} ${mobileMenuOpen ? styles.mobileMenuOpen : ''}`}>
                        {renderLanguageSwitcher(styles.mobileLangSwitch)}
                        {renderThemeToggle(styles.mobileThemeToggle)}
                        <button onClick={() => { scrollToSection('how-it-works'); setMobileMenuOpen(false); }}>{t.nav.howItWorks}</button>
                        <button onClick={() => { scrollToSection('faq'); setMobileMenuOpen(false); }}>{t.nav.faq}</button>
                        <Link to="/login" onClick={() => setMobileMenuOpen(false)}>{t.nav.login}</Link>
                        <Link to="/register" onClick={() => setMobileMenuOpen(false)}>{t.nav.register}</Link>
                    </div>
                </div>

                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>
                        {t.heroTitleMain}
                        <span className={styles.gradient}> {t.heroTitleAccent} <span className={styles.clickWord}>{t.heroTitleClick}</span></span>
                    </h1>
                    <p className={styles.heroDescription}>
                        {t.heroDescription}
                    </p>
                    
                    <div className={styles.ctaButtons}>
                        <button 
                            className={styles.primaryBtn}
                            onClick={() => setShowTrialModal(true)}
                        >
                            <span>{t.ctaPrimary}</span>
                            <span className={styles.arrow}>→</span>
                        </button>
                    </div>
                </div>

                <button 
                    className={styles.scrollBtn}
                    onClick={() => scrollToSection('how-it-works')}
                >
                    <span>{t.scrollDown}</span>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5V19M12 19L19 12M12 19L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>

            {/* How It Works Section */}
            <section id="how-it-works" className={styles.section}>
                <div className={styles.sectionContent}>
                    <h2 className={styles.sectionTitle}>{t.howItWorksTitle}</h2>
                    <p className={styles.sectionSubtitle}>{t.howItWorksSubtitle}</p>

                    <div className={styles.steps}>
                        {howItWorksSteps.map((step, index) => (
                            <div 
                                key={index} 
                                className={styles.step}
                                style={{ animationDelay: `${index * 0.1}s` }}
                            >
                                <div className={styles.stepNumber}>{index + 1}</div>
                                <div className={styles.stepIcon}>{step.icon}</div>
                                <h3 className={styles.stepTitle}>{step.title}</h3>
                                <p className={styles.stepDescription}>{step.description}</p>
                            </div>
                        ))}
                    </div>

                    <div className={styles.techStack}>
                        <p className={styles.techLabel}>{t.techLabel}</p>
                        <div className={styles.techBadges}>
                            <span className={styles.badge}>React Flow</span>
                            <span className={styles.badge}>gRPC Streaming</span>
                            <span className={styles.badge}>AST Parser</span>
                            <span className={styles.badge}>FastAPI</span>
                            <span className={styles.badge}>PostgreSQL</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className={styles.section}>
                <div className={styles.sectionContent}>
                    <h2 className={styles.sectionTitle}>{t.faqTitle}</h2>
                    <p className={styles.sectionSubtitle}>{t.faqSubtitle}</p>

                    <div className={styles.faqList}>
                        {faqs.map((faq, index) => (
                            <div 
                                key={index} 
                                className={`${styles.faqItem} ${activeFaq === index ? styles.active : ''}`}
                                onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                            >
                                <div className={styles.faqQuestion}>
                                    <h3>{faq.question}</h3>
                                    <svg 
                                        className={styles.faqIcon}
                                        width="24" 
                                        height="24" 
                                        viewBox="0 0 24 24" 
                                        fill="none"
                                    >
                                        <path 
                                            d="M19 9L12 16L5 9" 
                                            stroke="currentColor" 
                                            strokeWidth="2" 
                                            strokeLinecap="round" 
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
                                <div className={styles.faqAnswer}>
                                    <p>{faq.answer}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className={styles.ctaSection}>
                <div className={styles.ctaContent}>
                    <h2>{t.ctaTitle}</h2>
                    <p>{t.ctaSubtitle}</p>
                    <Link to="/register" className={styles.ctaButton}>
                        {t.ctaButton}
                        <span className={styles.arrow}>→</span>
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <div className={styles.footerLogo}>
                        <img src={logoImage} alt="PIAPAV" />
                        <span>PIAPAV</span>
                    </div>
                    <p className={styles.copyright}>
                        © 2025 PIAPAV. {t.footerText}
                    </p>
                </div>
            </footer>

            {/* Trial Modal */}
            {showTrialModal && (
                <div className={styles.modalOverlay} onClick={() => setShowTrialModal(false)}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <button 
                            className={styles.modalClose}
                            onClick={() => setShowTrialModal(false)}
                        >
                            ×
                        </button>
                        
                        <div className={styles.modalHeader}>
                            <h2>{t.modalTitle}</h2>
                            <div className={styles.warningBanner}>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>{t.modalWarning}</span>
                            </div>
                        </div>

                        <div className={styles.modalActions}>
                            <button 
                                className={styles.modalPrimaryBtn}
                                onClick={() => {
                                    setShowTrialModal(false);
                                    navigate('/projects/new');
                                }}
                            >
                                {t.modalCreateProject}
                            </button>
                            <button 
                                className={styles.modalSecondaryBtn}
                                onClick={() => {
                                    setShowTrialModal(false);
                                    navigate('/register');
                                }}
                            >
                                {t.modalRegister}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

src/pages/Landing/Landing.module.css
.container {
    --bg-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --text-main: #ffffff;
    --text-soft: rgba(255, 255, 255, 0.92);
    --text-muted: rgba(255, 255, 255, 0.7);
    --pill-bg: rgba(255, 255, 255, 0.15);
    --pill-hover: rgba(255, 255, 255, 0.25);
    --pill-border: rgba(255, 255, 255, 0.25);
    --pill-active-bg: #ffffff;
    --pill-active-text: #667eea;
    --surface: rgba(255, 255, 255, 0.1);
    --surface-strong: rgba(255, 255, 255, 0.15);
    --surface-border: rgba(255, 255, 255, 0.2);
    --surface-border-strong: rgba(255, 255, 255, 0.3);
    --shadow-color: rgba(0, 0, 0, 0.2);
    --accent: #667eea;
    --accent-soft: #e0c3fc;
    --contrast-surface: #ffffff;
    --badge-bg: rgba(255, 255, 255, 0.2);
    --badge-hover: rgba(255, 255, 255, 0.3);
    --badge-border: rgba(255, 255, 255, 0.3);
    --cta-bg: #ffffff;
    --cta-text: #667eea;
    --cta-shadow: rgba(0, 0, 0, 0.2);
    --cta-shadow-strong: rgba(0, 0, 0, 0.3);
    --footer-bg: rgba(0, 0, 0, 0.2);
    --hero-gradient: linear-gradient(90deg, #fff, #e0c3fc);
    --scroll-color: #ffffff;
    --mobile-bg: rgba(102, 126, 234, 0.98);
    --modal-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --warning-bg: rgba(245, 158, 11, 0.15);
    --warning-border: rgba(245, 158, 11, 0.4);
    min-height: 100vh;
    background: var(--bg-gradient);
    color: var(--text-main);
    position: relative;
    overflow-x: hidden;
}

.dark {
    --bg-gradient: radial-gradient(120% 120% at 20% 20%, #0b1221 0%, #0a0f1e 45%, #050a13 100%);
    --text-main: #e2e8f0;
    --text-soft: #cbd5e1;
    --text-muted: #94a3b8;
    --pill-bg: rgba(255, 255, 255, 0.06);
    --pill-hover: rgba(255, 255, 255, 0.12);
    --pill-border: rgba(148, 163, 184, 0.25);
    --pill-active-bg: linear-gradient(120deg, #22d3ee 0%, #a855f7 100%);
    --pill-active-text: #0b1221;
    --surface: rgba(255, 255, 255, 0.05);
    --surface-strong: rgba(255, 255, 255, 0.1);
    --surface-border: rgba(148, 163, 184, 0.2);
    --surface-border-strong: rgba(148, 163, 184, 0.35);
    --shadow-color: rgba(4, 12, 28, 0.5);
    --accent: #22d3ee;
    --accent-soft: #a855f7;
    --contrast-surface: #0b1221;
    --badge-bg: rgba(34, 211, 238, 0.14);
    --badge-hover: rgba(168, 85, 247, 0.23);
    --badge-border: rgba(34, 211, 238, 0.3);
    --cta-bg: linear-gradient(120deg, #22d3ee 0%, #a855f7 100%);
    --cta-text: #0b1221;
    --cta-shadow: rgba(34, 211, 238, 0.24);
    --cta-shadow-strong: rgba(168, 85, 247, 0.4);
    --footer-bg: rgba(7, 12, 22, 0.7);
    --hero-gradient: linear-gradient(90deg, #22d3ee, #a855f7);
    --scroll-color: #e2e8f0;
    --mobile-bg: rgba(6, 10, 20, 0.96);
    --modal-bg: linear-gradient(135deg, #0b162a 0%, #10172d 100%);
    --warning-bg: rgba(251, 191, 36, 0.18);
    --warning-border: rgba(251, 191, 36, 0.5);
}

/* Hero Section */
.heroSection {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 0 5%;
    position: relative;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.5rem;
    padding: 1rem 0;
    z-index: 10;
}

.logo {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.5rem;
    font-weight: 600;
}

.logo img {
    width: 40px;
    height: 40px;
}

.burgerBtn {
    display: none;
    flex-direction: column;
    gap: 5px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px;
    z-index: 1001;
}

.burgerBtn span {
    width: 25px;
    height: 3px;
    background: var(--text-main);
    border-radius: 2px;
    transition: all 0.3s ease;
}

.mobileMenu {
    display: none;
}

.centerNav {
    display: flex;
    gap: 1.25rem;
    align-items: center;
    flex: 1;
    justify-content: center;
}

.centerNav button {
    background: none;
    border: none;
    color: var(--text-main);
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s ease;
    padding: 0.5rem 1rem;
}

.centerNav button:hover {
    transform: translateY(-2px);
    opacity: 0.8;
}

.nav {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-shrink: 0;
}

.navLangSwitch {
    margin-right: 0.5rem;
}

.langSwitch {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--pill-bg);
    border: 1px solid var(--pill-border);
    border-radius: 999px;
    padding: 0.25rem 0.35rem;
}

.langBtn {
    background: transparent;
    border: none;
    color: var(--text-main);
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: all 0.2s ease;
}

.langBtn:hover {
    background: var(--pill-hover);
    transform: translateY(-1px);
}

.langBtnActive {
    background: var(--pill-active-bg);
    color: var(--pill-active-text);
    box-shadow: 0 10px 25px var(--shadow-color);
}

.langBtn:disabled {
    opacity: 0.9;
    cursor: default;
}

.themeToggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--pill-bg);
    border: 1px solid var(--pill-border);
    color: var(--text-main);
    padding: 0.55rem 0.95rem;
    border-radius: 999px;
    font-weight: 700;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
    min-height: 38px;
}

.themeToggle:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px var(--shadow-color);
    background: var(--pill-hover);
}

.themeToggleActive {
    background: var(--pill-active-bg);
    color: var(--pill-active-text);
    box-shadow: 0 10px 25px var(--shadow-color);
}

.themeIcon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.themeText {
    font-weight: 700;
    white-space: nowrap;
}

.themeGlyph {
    width: 1.05rem;
    height: 1.05rem;
}

.nav button {
    background: none;
    border: none;
    color: var(--text-main);
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s ease;
    padding: 0.5rem 1rem;
    display: flex;
    justify-content: center;
}

.nav button:hover {
    transform: translateY(-2px);
    opacity: 0.8;
}

.loginBtn {
    background: var(--pill-bg);
    backdrop-filter: blur(10px);
    padding: 0.75rem 2rem;
    border-radius: 25px;
    text-decoration: none;
    color: var(--text-main);
    transition: all 0.3s ease;
}

.loginBtn:hover {
    background: var(--pill-hover);
    transform: translateY(-2px);
}

.registerBtn {
    background: var(--pill-bg);
    backdrop-filter: blur(10px);
    padding: 0.75rem 2rem;
    border-radius: 25px;
    text-decoration: none;
    color: var(--text-main);
    transition: all 0.3s ease;
}

.registerBtn:hover {
    background: var(--pill-hover);
    transform: translateY(-2px);
}

/* Hero Content */
.heroContent {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 4rem 0;
}

.heroTitle {
    font-size: 5rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
    line-height: 1.1;
    animation: fadeInUp 0.8s ease-out;
}

.gradient {
    background: var(--hero-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.clickWord {
    display: inline-block;
    transition: transform 0.3s ease;
    cursor: pointer;
    background: var(--hero-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.clickWord:hover {
    animation: bounceWord 0.6s ease;
}

@keyframes bounceWord {
    0%, 100% {
        transform: translateY(0);
    }
    25% {
        transform: translateY(-10px);
    }
    50% {
        transform: translateY(0);
    }
    75% {
        transform: translateY(-5px);
    }
}

.heroDescription {
    font-size: 1.3rem;
    max-width: 700px;
    margin-bottom: 3rem;
    line-height: 1.6;
    color: var(--text-soft);
    opacity: 0.95;
    animation: fadeInUp 0.8s ease-out 0.2s both;
}

/* CTA Buttons */
.ctaButtons {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 4rem;
    animation: fadeInUp 0.8s ease-out 0.4s both;
}

.primaryBtn {
    background: var(--surface-strong);
    backdrop-filter: blur(10px);
    border: 2px solid var(--surface-border-strong);
    color: var(--text-main);
    padding: 1.2rem 3rem;
    border-radius: 50px;
    font-size: 1.1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.3s ease;
    cursor: pointer;
}

.primaryBtn:hover {
    background: var(--pill-hover);
    border-color: var(--surface-border-strong);
    transform: translateY(-3px);
}

.primaryBtn .arrow {
    transition: transform 0.3s ease;
}

.primaryBtn:hover .arrow {
    transform: translateX(5px);
}

.secondaryBtn {
    background: var(--surface);
    backdrop-filter: blur(10px);
    border: 2px solid var(--surface-border);
    color: var(--text-main);
    padding: 1.2rem 3rem;
    border-radius: 50px;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.secondaryBtn:hover {
    background: var(--surface-strong);
    transform: translateY(-3px);
}

/* Stats */
.stats {
    display: flex;
    gap: 4rem;
    animation: fadeInUp 0.8s ease-out 0.6s both;
}

.stat {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.statNumber {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
}

.statLabel {
    font-size: 0.9rem;
    color: var(--text-muted);
    opacity: 0.9;
}

/* Scroll Button */
.scrollBtn {
    position: absolute;
    bottom: 4rem;
    left: 50%;
    transform: translateX(-50%);
    background: none;
    border: none;
    color: var(--scroll-color);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    animation: bounce 2s infinite;
}

.scrollBtn:hover {
    opacity: 0.8;
}

/* Section Styles */
.section {
    padding: 4rem 5%;
    background: transparent;
}

.sectionContent {
    max-width: 1200px;
    margin: 0 auto;
}

.sectionTitle {
    font-size: 3.5rem;
    font-weight: 700;
    text-align: center;
    margin-bottom: 1rem;
}

.sectionSubtitle {
    font-size: 1.2rem;
    text-align: center;
    color: var(--text-soft);
    opacity: 0.9;
    margin-bottom: 4rem;
}

/* How It Works Steps */
.steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin-bottom: 4rem;
}

.step {
    background: var(--surface);
    backdrop-filter: blur(10px);
    padding: 2.5rem;
    border-radius: 20px;
    text-align: center;
    transition: all 0.3s ease;
    position: relative;
    border: 1px solid var(--surface-border);
    animation: fadeInUp 0.6s ease-out both;
}

.step:hover {
    transform: translateY(-10px);
    background: var(--surface-strong);
    box-shadow: 0 20px 40px var(--shadow-color);
}

.stepNumber {
    position: absolute;
    top: -15px;
    right: -15px;
    background: var(--contrast-surface);
    color: var(--accent);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1.2rem;
    box-shadow: 0 5px 15px var(--shadow-color);
}

.stepIcon {
    font-size: 3.5rem;
    margin-bottom: 1.5rem;
}

.stepTitle {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1rem;
}

.stepDescription {
    font-size: 1rem;
    line-height: 1.6;
    color: var(--text-soft);
    opacity: 0.9;
}

/* Tech Stack */
.techStack {
    text-align: center;
    margin-top: 3rem;
}

.techLabel {
    font-size: 1rem;
    color: var(--text-muted);
    opacity: 0.9;
    margin-bottom: 1rem;
}

.techBadges {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
}

.badge {
    background: var(--badge-bg);
    backdrop-filter: blur(10px);
    padding: 0.75rem 1.5rem;
    border-radius: 25px;
    font-size: 0.95rem;
    border: 1px solid var(--badge-border);
    transition: all 0.3s ease;
}

.badge:hover {
    background: var(--badge-hover);
    transform: scale(1.05);
}

/* FAQ Section */
.faqList {
    max-width: 800px;
    margin: 0 auto;
}

.faqItem {
    background: var(--surface);
    backdrop-filter: blur(10px);
    border: 1px solid var(--surface-border);
    border-radius: 15px;
    margin-bottom: 1rem;
    overflow: hidden;
    transition: all 0.3s ease;
    cursor: pointer;
}

.faqItem:hover {
    background: var(--surface-strong);
}

.faqQuestion {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 2rem;
}

.faqQuestion h3 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0;
}

.faqIcon {
    transition: transform 0.3s ease;
    flex-shrink: 0;
}

.faqItem.active .faqIcon {
    transform: rotate(180deg);
}

.faqAnswer {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease, padding 0.3s ease;
}

.faqItem.active .faqAnswer {
    max-height: 500px;
    padding: 0 2rem 1.5rem 2rem;
}

.faqAnswer p {
    margin: 0;
    line-height: 1.6;
    color: var(--text-soft);
    opacity: 0.9;
}

/* CTA Section */
.ctaSection {
    padding: 4rem 5%;
    text-align: center;
    background: transparent;
}

.ctaContent h2 {
    font-size: 3rem;
    font-weight: 700;
    margin-bottom: 1rem;
}

.ctaContent p {
    font-size: 1.3rem;
    margin-bottom: 2.5rem;
    color: var(--text-soft);
    opacity: 0.9;
}

.ctaButton {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--cta-bg);
    color: var(--cta-text);
    padding: 1.2rem 3rem;
    border-radius: 50px;
    font-size: 1.1rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.3s ease;
    box-shadow: 0 10px 30px var(--cta-shadow);
}

.ctaButton:hover {
    transform: translateY(-3px);
    box-shadow: 0 15px 40px var(--cta-shadow-strong);
}

.ctaButton .arrow {
    transition: transform 0.3s ease;
}

.ctaButton:hover .arrow {
    transform: translateX(5px);
}

/* Footer */
.footer {
    padding: 3rem 5%;
    background: var(--footer-bg);
    border-top: 1px solid var(--surface-border);
}

.footerContent {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.footerLogo {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.3rem;
    font-weight: 600;
}

.footerLogo img {
    width: 30px;
    height: 30px;
}

.copyright {
    color: var(--text-muted);
    opacity: 0.85;
    font-size: 0.9rem;
}

/* Modal Styles */
.modalOverlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
}

.modalContent {
    background: var(--modal-bg);
    border-radius: 24px;
    padding: 3rem;
    max-width: 500px;
    width: 90%;
    position: relative;
    box-shadow: 0 20px 60px var(--shadow-color);
    animation: slideUp 0.4s ease;
}

.modalClose {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: var(--pill-bg);
    border: none;
    color: var(--text-main);
    font-size: 2rem;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}

.modalClose:hover {
    background: var(--pill-hover);
    transform: rotate(90deg);
}

.modalHeader {
    margin-bottom: 2rem;
}

.modalHeader h2 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
    color: var(--text-main);
}

.warningBanner {
    background: var(--warning-bg);
    border: 2px solid var(--warning-border);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--text-soft);
}

.warningBanner svg {
    flex-shrink: 0;
}

.warningBanner span {
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.5;
}

.modalActions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.modalPrimaryBtn {
    background: var(--cta-bg);
    color: var(--cta-text);
    border: none;
    padding: 1.2rem 2rem;
    border-radius: 12px;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px var(--cta-shadow);
}

.modalPrimaryBtn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px var(--cta-shadow-strong);
}

.modalSecondaryBtn {
    background: var(--surface);
    color: var(--text-main);
    border: 2px solid var(--surface-border-strong);
    padding: 1.2rem 2rem;
    border-radius: 12px;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.modalSecondaryBtn:hover {
    background: var(--surface-strong);
    transform: translateY(-2px);
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Animations */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes bounce {
    0%, 100% {
        transform: translate(-50%, 0);
    }
    50% {
        transform: translate(-50%, -10px);
    }
}

/* Responsive Design */
@media (max-width: 1024px) {
    .heroTitle {
        font-size: 4rem;
    }

    .steps {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 768px) {
    .heroTitle {
        font-size: 2.2rem;
    }

    .heroDescription {
        font-size: 1rem;
    }

    .ctaButtons {
        flex-direction: column;
        width: 100%;
    }

    .primaryBtn,
    .secondaryBtn {
        width: 100%;
        justify-content: center;
    }

    .stats {
        gap: 2rem;
    }

    .statNumber {
        font-size: 2rem;
    }

    .steps {
        grid-template-columns: 1fr;
    }

    .sectionTitle {
        font-size: 2rem;
    }

    .section {
        padding: 3rem 5%;
    }

    .ctaSection {
        padding: 3rem 5%;
    }

    /* Hide desktop nav, show burger menu */
    .centerNav,
    .nav {
        display: none;
    }

    .burgerBtn {
        display: flex;
        position: absolute;
        right: 0;
    }

    .mobileMenu {
        display: flex;
        flex-direction: column;
        position: fixed;
        top: 0;
        right: -100%;
        width: 70%;
        height: 100vh;
        background: var(--mobile-bg);
        backdrop-filter: blur(10px);
        padding: 5rem 2rem 2rem;
        gap: 1.5rem;
        transition: right 0.3s ease;
        z-index: 1000;
        box-shadow: -5px 0 15px var(--shadow-color);
    }

    .mobileMenuOpen {
        right: 0;
    }

    .mobileMenu button,
    .mobileMenu a {
        background: var(--pill-bg);
        border: none;
        color: var(--text-main);
        padding: 1rem;
        border-radius: 10px;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        text-decoration: none;
        text-align: center;
    }

    .mobileLangSwitch {
        align-self: flex-start;
    }
    
    .mobileThemeToggle {
        align-self: flex-start;
    }

    .mobileMenu button:hover,
    .mobileMenu a:hover {
        background: var(--pill-hover);
    }

    .scrollBtn {
        bottom: 2rem;
    }

    .footerContent {
        flex-direction: column;
        gap: 1rem;
        text-align: center;
    }
}

src/pages/Projects/GraphHeader.jsx
import { useEffect, useRef, useState } from 'react';
import styles from './ProjectAnalysis.module.css';
import { useI18n } from '../../context/I18nContext';

export default function GraphHeader({
  title = 'Project Architecture',
  nodesCount = 0,
  edgesCount = 0,
  requirementsCount = 0,
  endpointsCount = 0,
  onClose,
  closeLabel = 'Close',
  onDelete,
  deleteLabel = 'Delete',
  deleteIcon,
  deleting = false,
  renderComplete = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const { t } = useI18n();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDeleteClick = () => {
    setMenuOpen(false);
    onDelete?.();
  };

  return (
    <div className={styles.graphHeader}>
      <div className={styles.graphHeaderLeft}>
        <h2 className={styles.graphTitle}>{title}</h2>
        <div className={styles.graphMeta}>
          {t(
            'graph.meta',
            `Узлы: ${nodesCount} | Рёбра: ${edgesCount} | Зависимости: ${requirementsCount} | Эндпоинты: ${endpointsCount}`,
            { nodes: nodesCount, edges: edgesCount, requirements: requirementsCount, endpoints: endpointsCount }
          )}
        </div>
        {renderComplete && (
          <div className={styles.renderDone} role="status" aria-live="polite">
            <span className={styles.renderDoneDot} aria-hidden="true" />
            {t('graph.rendered', 'Отрисовка закончена')}
          </div>
        )}
      </div>
      <div className={styles.graphActions}>
        {onDelete && (
          <div className={styles.moreWrapper} ref={menuRef}>
            <button
              className={styles.moreBtn}
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={t('graph.actions.more', 'Открыть меню')}
              title={t('graph.actions.title', 'Действия')}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className={styles.moreMenu}>
                <button
                  onClick={handleDeleteClick}
                  className={styles.deleteBtn}
                  disabled={deleting}
                  aria-label={deleting ? 'Удаление...' : deleteLabel}
                  title={deleting ? 'Удаление...' : deleteLabel}
                >
                  {deleteIcon && <img src={deleteIcon} alt="" className={styles.deleteIcon} />}
                  {deleteLabel}
                </button>
              </div>
            )}
          </div>
        )}
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose}>
            {closeLabel}
          </button>
        )}
      </div>
    </div>
  );
}

src/pages/Projects/NewProject.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { SmartStepEdge } from '@tisoap/react-flow-smart-edge'; // npm install @tisoap/react-flow-smart-edge
import { projectsAPI } from '../../services/api';
import grpcClient from '../../services/grpcClient';
import buildGraph from '../../utils/buildGraph';
import { layoutWithElk } from '../../utils/layoutWithElk';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import styles from './Projects.module.css';
import analysisStyles from './ProjectAnalysis.module.css';
import GraphHeader from './GraphHeader';

const edgeTypes = {
  smart: SmartStepEdge,
};

export default function NewProject() {
  const [form, setForm] = useState({
    name: '',
    description: '',
  });
  const [file, setFile] = useState(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState(''); // 'creating', 'analyzing', 'completed'
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Состояние для графа
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architectureData, setArchitectureData] = useState([]);
  const [showGraph, setShowGraph] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [depsCollapsed, setDepsCollapsed] = useState(false);
  const [buildStatus, setBuildStatus] = useState(''); // 'building', 'done', ''
  const architectureDataRef = useRef([]);
  const streamControllerRef = useRef(null);
  const isSavingRef = useRef(false);
  const formRef = useRef(null);
  const { t, language } = useI18n();

  const buildArchitecturePayload = () => ({
    requirements,
    endpoints: Object.entries(endpoints).map(([k, v]) => ({ [k]: v })),
    data: architectureDataRef.current.reduce((acc, item) => {
      acc[item.parent] = item.children;
      return acc;
    }, {})
  });

  const saveArchitecture = async (reason = 'auto') => {
    if (!currentProjectId || architectureDataRef.current.length === 0) return;
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      const token = localStorage.getItem('access_token');
      const archData = buildArchitecturePayload();
      console.log(`💾 Сохранение архитектуры (${reason})...`, {
        projectId: currentProjectId,
        reqs: archData.requirements?.length,
        eps: archData.endpoints?.length,
        nodes: Object.keys(archData.data || {}).length
      });

      await fetch(`${import.meta.env.VITE_API_URL || '/v1'}/project/${currentProjectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ architecture: archData }),
        keepalive: reason === 'exit'
      });

      console.log('✅ Архитектура сохранена');
    } catch (err) {
      console.error('❌ Ошибка сохранения архитектуры:', err);
    } finally {
      isSavingRef.current = false;
    }
  };

  // Сохранение архитектуры при уходе со страницы
  useEffect(() => {
    const handleSaveOnExit = async () => {
      await saveArchitecture('exit');
    };
    
    // Сохранение при уходе со страницы
    const handleBeforeUnload = (e) => {
      if (currentProjectId && architectureDataRef.current.length > 0) {
        handleSaveOnExit();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Сохранение при размонтировании компонента (переход по навигации)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (currentProjectId && architectureDataRef.current.length > 0) {
        handleSaveOnExit();
      }
    };
  }, [currentProjectId, requirements, endpoints]);
  
  // Синхронизация ref с state
  useEffect(() => {
    architectureDataRef.current = architectureData;
  }, [architectureData]);

  useEffect(() => {
    if (showGraph) {
      setDepsCollapsed(false);
    }
  }, [showGraph]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    const rounded = value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1);
    return `${rounded} ${units[exponent]}`;
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    const LIMIT = 50 * 1024 * 1024; // 50 MB
    if (f && f.size > LIMIT) {
      setFile(f);
      setShowPremiumModal(true);
    } else {
      setFile(f);
    }
    setError('');
  }

  const submitFormProgrammatically = () => {
    if (!formRef.current) return;
    if (typeof formRef.current.requestSubmit === 'function') {
      formRef.current.requestSubmit();
    } else {
      formRef.current.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  };

  const handleFormKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    if (showPremiumModal || showGraph || loading) return;

    const tagName = event.target?.tagName?.toLowerCase();
    if (tagName === 'textarea') return;

    event.preventDefault();
    submitFormProgrammatically();
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Валидация
    if (!form.name.trim()) {
      setError(t('projects.new.error.nameRequired', 'Введите название проекта'));
      setLoading(false);
      return;
    }

    // Проверка что файл выбран (обязательно по API)
    if (!file) {
      setError(t('projects.new.error.fileRequired', 'Необходимо выбрать ZIP-файл проекта'));
      setLoading(false);
      return;
    }

    try {
      const LIMIT = 50 * 1024 * 1024; // 50 MB
      if (file.size > LIMIT) {
        setShowPremiumModal(true);
        setLoading(false);
        return;
      }

      // ШАГ 1: Создание проекта через POST /v1/project
      console.log('📤 Создание проекта через REST API...');
      
      setAnalysisStatus('creating');
      
      const payload = { 
        name: form.name,
        description: form.description,
        file: file
      };
      
      const result = await projectsAPI.create(payload);
      
      console.log('✅ Проект создан:', result);
      
      // Определяем правильный ID проекта
      const projectId = result.project_id || result.id;
      
      if (!projectId) {
        throw new Error('Backend не вернул ID проекта');
      }
      
      setCurrentProjectId(projectId);
      console.log('✅ Проект создан, ID:', projectId);

      // ШАГ 2: Запуск gRPC анализа и показ визуализации
      setAnalysisStatus('analyzing');
      setShowGraph(true); // Показываем граф сразу
      setBuildStatus('building'); // Начало построения

      if (!user || !user.id) {
        throw new Error('User ID не найден. Перезайдите в систему.');
      }
      
      const validUserId = parseInt(user.id);
      const validProjectId = parseInt(projectId);
      
      if (isNaN(validUserId) || validUserId === 0) {
        throw new Error('Невалидный User ID');
      }
      
      if (isNaN(validProjectId) || validProjectId === 0) {
        throw new Error('Невалидный Project ID');
      }
      
      console.log('═══════════════════════════════════════════════════');
      console.log('🚀 ЗАПУСК gRPC АНАЛИЗА ПРОЕКТА');
      console.log('═══════════════════════════════════════════════════');
      console.log('📊 Параметры подключения:', {
        user_id: validUserId,
        task_id: validProjectId,
        project_name: form.name
      });

      // Отправляем gRPC запрос
      const controller = await grpcClient.connectToStream(validUserId, validProjectId, {
        onStart: () => {
          console.log('\n🎬 ПОДКЛЮЧЕНИЕ УСТАНОВЛЕНО');
          console.log('⏳ Ожидание данных от сервера...');
        },
        
        onRequirements: (data) => {
          console.log('\n📋 REQUIREMENTS (Зависимости проекта)');
          console.log('───────────────────────────────────────────────────');
          console.log('Количество зависимостей:', data.requirements?.length || 0);
          if (data.requirements && data.requirements.length > 0) {
            console.log('Список зависимостей:', data.requirements.slice(0, 10).join(', ') + (data.requirements.length > 10 ? '...' : ''));
          }
          setRequirements(data.requirements || []);
        },
        
        onEndpoints: (data) => {
          console.log('\n🔗 ENDPOINTS (HTTP маршруты)');
          console.log('───────────────────────────────────────────────────');
          const eps = data.endpoints || {};
          const epsList = Object.entries(eps);
          console.log('Количество эндпоинтов:', epsList.length);
          
          // Группировка по методам
          const byMethod = {};
          epsList.forEach(([key]) => {
            const method = key.split(' ')[0];
            byMethod[method] = (byMethod[method] || 0) + 1;
          });
          console.log('По методам:', byMethod);
          
          // Примеры эндпоинтов
          if (epsList.length > 0) {
            console.log('Примеры эндпоинтов:');
            epsList.slice(0, 5).forEach(([key, value]) => {
              console.log(`  ${key} → ${value}`);
            });
            if (epsList.length > 5) {
              console.log(`  ... и ещё ${epsList.length - 5} эндпоинтов`);
            }
          }
          setEndpoints(eps);
        },
        
        onArchitecture: (data) => {
          setArchitectureData(prev => {
            const newData = [...prev, {
              parent: data.parent,
              children: data.children || []
            }];
            
            // Логирование с прогрессом
            if (newData.length % 10 === 0 || newData.length <= 5) {
              console.log(`\n🏗️ ARCHITECTURE (Связь #${newData.length})`);
              console.log('───────────────────────────────────────────────────');
            }
            console.log(`  ${data.parent} → [${(data.children || []).length} зависимостей]`);
            if (data.children && data.children.length > 0) {
              console.log(`    └─ ${data.children.slice(0, 3).join(', ')}${data.children.length > 3 ? '...' : ''}`);
            }
            
            return newData;
          });
        },
        
        onDone: async () => {
          console.log('\n═══════════════════════════════════════════════════');
          console.log('✅ АНАЛИЗ ЗАВЕРШЁН УСПЕШНО!');
          console.log('═══════════════════════════════════════════════════');
          console.log('📊 Итоговая статистика:');
          console.log('  📋 Requirements:', requirements.length);
          console.log('  🔗 Endpoints:', Object.keys(endpoints).length);
          console.log('  🏗️ Architecture nodes:', architectureDataRef.current.length);
          console.log('═══════════════════════════════════════════════════\n');
          
          setAnalysisStatus('completed');
          setLoading(false);
          streamControllerRef.current = null;
          
          // Показываем статус завершения
          setBuildStatus('done');
          setTimeout(() => {
            setBuildStatus('');
          }, 5000); // Скрываем через 5 секунд
          
          await saveArchitecture('done');
        },
        
        onError: (error) => {
          console.log('\n═══════════════════════════════════════════════════');
          console.error('❌ ОШИБКА gRPC STREAM');
          console.log('═══════════════════════════════════════════════════');
          console.error('Тип ошибки:', error.name || 'Unknown');
          console.error('Сообщение:', error.message);
          console.error('Stack trace:', error.stack);
          console.log('\n📊 Данные получены до ошибки:');
          console.log('  📋 Requirements:', requirements.length);
          console.log('  🔗 Endpoints:', Object.keys(endpoints).length);
          console.log('  🏗️ Architecture nodes:', architectureDataRef.current.length);
          console.log('═══════════════════════════════════════════════════\n');
          
          setError(`${t('projects.new.error.analysis', 'Ошибка анализа проекта')}: ${error.message}`);
          setAnalysisStatus('error');
          setLoading(false);
          streamControllerRef.current = null;
          setTimeout(() => {
            navigate(`/projects/${projectId}/architecture`);
          }, 3000);
        }
      }, 2000); // Задержка 2 секунды перед подключением к gRPC
      
    } catch (err) {
      console.error('Ошибка создания проекта:', err);
      
      let errorMessage = t('projects.new.error.create', 'Ошибка создания проекта');
      
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === 'string') {
          if (detail.includes('async for') && detail.includes('UploadFile')) {
            errorMessage = t('projects.new.error.fileProcessing', 'Ошибка обработки файла на сервере. Обратитесь к администратору.');
          } else {
            errorMessage = detail;
          }
        } else if (Array.isArray(detail)) {
          errorMessage = detail.map(e => `${e.loc?.join('.') || 'field'}: ${e.msg}`).join('; ');
        } else {
          errorMessage = JSON.stringify(detail);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
      setAnalysisStatus('error');
    }
  }

  // Build graph in real-time with shared builder
  useEffect(() => {
    if (architectureData.length === 0 && Object.keys(endpoints).length === 0) return;

    const methodColors = {
      'GET': { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669' },
      'POST': { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb' },
      'PATCH': { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#d97706' },
      'PUT': { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed' },
      'DELETE': { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#dc2626' },
    };

    const serviceColors = {
      'AuthService': { color: '#8b5cf6', icon: '🔐', label: 'Auth' },
      'AccountService': { color: '#3b82f6', icon: '👤', label: 'Account' },
      'ProjectService': { color: '#10b981', icon: '📁', label: 'Project' },
      'CoreService': { color: '#f59e0b', icon: '⚙️', label: 'Core' },
    };

    const { nodes: builtNodes, edges: builtEdges, summary } = buildGraph({
      requirements,
      endpoints,
      architectureData,
      methodColors,
      serviceColors
    });

    console.log('✅ Граф отрисован (итог, до layout):', summary);

    // Асинхронно применяем ELK-лэйаут
    layoutWithElk(builtNodes, builtEdges, 'RIGHT')
      .then(({ nodes: layoutNodes, edges: layoutEdges }) => {
        setNodes(layoutNodes);
        setEdges(layoutEdges);
      })
      .catch((err) => {
        console.error('ELK layout error:', err);
        // fallback: если ELK сломался, показываем как было
        setNodes(builtNodes);
        setEdges(builtEdges);
      });
  }, [architectureData, endpoints, setNodes, setEdges]);

  const requirementsCount = requirements.length;
  const endpointsCount = Object.keys(endpoints).length;
  const dependenciesSubtitle = useMemo(() => {
    if (requirementsCount > 0) {
      if (language === 'en') {
        const word = requirementsCount === 1 ? 'package' : 'packages';
        return `${requirementsCount} ${word}`;
      }
      const mod10 = requirementsCount % 10;
      const mod100 = requirementsCount % 100;
      let word = 'зависимостей';
      if (mod10 === 1 && mod100 !== 11) word = 'зависимость';
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'зависимости';
      return `${requirementsCount} ${word}`;
    }
    return analysisStatus !== 'completed'
      ? t('analysis.waitingStream', 'Ожидание данных потока...')
      : t('analysis.noDependencies', 'Зависимости не найдены');
  }, [analysisStatus, language, requirementsCount, t]);

  return (
    <div className={styles.container}>
      {/* Форма создания проекта */}
      {!showGraph && (
        <div className={styles.newProjectWrapper}>
          <form
            ref={formRef}
            className={styles.newProjectForm}
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
          >
            <h1>{t('projects.new.title', 'Создать новый проект')}</h1>

            <div className={styles.inputGroup}>
              <label htmlFor="name">{t('projects.new.nameLabel', 'Название проекта')}</label>
              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                placeholder={t('projects.new.namePlaceholder', 'Введите название')}
                disabled={loading}
                maxLength={100}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="description">{t('projects.new.descriptionLabel', 'Описание')}</label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder={t('projects.new.descriptionPlaceholder', 'Опишите ваш проект')}
                rows={4}
                disabled={loading}
                maxLength={500}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="file">{t('projects.new.fileLabel', 'Архитектура / файл *')}</label>
              <div className={styles.fileUpload}>
                <input
                  id="file"
                  name="file"
                  type="file"
                  onChange={handleFileChange}
                  disabled={loading}
                  accept=".zip,application/zip,application/x-zip-compressed"
                  required
                  className={styles.fileInput}
                />
                <label htmlFor="file" className={styles.fileLabel} aria-disabled={loading}>
                  <div className={styles.fileIcon}>📦</div>
                  <div className={styles.fileText}>
                    <div className={styles.fileTitle}>{file ? t('projects.new.fileTitleSelected', 'Файл выбран') : t('projects.new.fileTitle', 'Загрузить проект (ZIP)')}</div>
                    <div className={styles.fileHint}>
                      {file
                        ? t('projects.new.fileHintSelected', `${file.name} • ${formatFileSize(file.size)}`, {
                            name: file.name,
                            size: formatFileSize(file.size),
                          })
                        : t('projects.new.fileHint', 'Перетащите архив сюда или нажмите, чтобы выбрать')}
                    </div>
                  </div>
                  <div className={styles.fileBadge}>{t('projects.new.fileBadge', 'ZIP')}</div>
                </label>
              </div>
              <small className={styles.fileNote}>{t('projects.new.fileNote', 'Загрузите ZIP-архив с проектом (обязательно)')}</small>
            </div>

            {/* Ошибка */}
            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}

            {/* Статус анализа */}
            {analysisStatus && !error && (
              <div className={styles.analysisStatus}>
                {analysisStatus === 'creating' && `📤 ${t('projects.new.analysis.creating', 'Создание проекта...')}`}
                {analysisStatus === 'analyzing' && `📡 ${t('projects.new.analysis.analyzing', 'Анализ проекта в реальном времени...')}`}
                {analysisStatus === 'completed' && `✅ ${t('projects.new.analysis.completed', 'Анализ завершён!')}`}
              </div>
            )}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => navigate('/projects')}
                disabled={loading}
              >
                {t('projects.new.actions.cancel', 'Отмена')}
              </button>
              <button 
                type="submit" 
                className={styles.createProjectBtn} 
                disabled={loading}
              >
                {loading ? t('projects.new.actions.submitting', 'Создание...') : t('projects.new.actions.submit', 'Создать')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Граф в реальном времени на весь экран */}
      {showGraph && (
        <div className={analysisStyles.graphOverlay}>
          <GraphHeader
            title={t('graph.title', 'Архитектура проекта')}
            nodesCount={nodes.length}
            edgesCount={edges.length}
            requirementsCount={requirementsCount}
            endpointsCount={endpointsCount}
            onClose={() => { setShowGraph(false); navigate('/projects'); }}
            closeLabel={t('common.close', 'Закрыть')}
          />
          
          {/* Статус построения графа */}
          {buildStatus && (
            <div className={analysisStyles.renderStatusOverlay}>
              {buildStatus === 'building' && (
                <div className={analysisStyles.renderProgress}>
                  <div className={analysisStyles.renderProgressDot} />
                  {t('projects.new.building', 'Построение графа в процессе...')}
                </div>
              )}
              {buildStatus === 'done' && (
                <div className={analysisStyles.renderDone}>
                  <div className={analysisStyles.renderDoneDot} />
                  {t('projects.new.built', 'Построение завершено')}
                </div>
              )}
            </div>
          )}
          
          <div className={analysisStyles.graphBody}>
            <div className={analysisStyles.visualLayout}>
              <div className={analysisStyles.flowWrapper}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  edgeTypes={edgeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  minZoom={0.05}
                  maxZoom={2}
                  fitView
                  fitViewOptions={{ padding: 0.15 }}
                >
                  <Background color="#d1d5db" gap={20} />
                  <Controls />
                </ReactFlow>
              </div>

              <aside
                className={`${analysisStyles.dependenciesPanel} ${depsCollapsed ? analysisStyles.dependenciesCollapsed : ''}`}
                aria-expanded={!depsCollapsed}
              >
                <div className={analysisStyles.dependenciesHeader}>
                  <div className={analysisStyles.dependenciesHeaderText}>
                    <div className={analysisStyles.dependenciesTitle}>{t('analysis.dependencies', 'Зависимости')}</div>
                    <div className={analysisStyles.dependenciesSubtitle}>{dependenciesSubtitle}</div>
                  </div>
                  <div className={analysisStyles.dependenciesHeaderActions}>
                    <div className={analysisStyles.dependenciesBadge}>{requirementsCount}</div>
                    <button
                      type="button"
                      className={analysisStyles.dependenciesToggle}
                      onClick={() => setDepsCollapsed((prev) => !prev)}
                      aria-label={
                        depsCollapsed
                          ? t('analysis.expandDependencies', 'Развернуть список зависимостей')
                          : t('analysis.collapseDependencies', 'Свернуть список зависимостей')
                      }
                    >
                      {depsCollapsed ? '❯' : '❮'}
                    </button>
                  </div>
                </div>

                {!depsCollapsed && (
                  <div className={analysisStyles.dependenciesList}>
                    {requirementsCount > 0 ? (
                      requirements.map((req, idx) => (
                        <div key={`${req}-${idx}`} className={analysisStyles.requirementItem}>
                          <span className={analysisStyles.reqBullet} aria-hidden="true" />
                          <span className={analysisStyles.reqName}>{req}</span>
                        </div>
                      ))
                    ) : (
                      <div className={analysisStyles.emptyState}>{t('analysis.dependenciesEmpty', 'Список появится после получения данных.')}</div>
                    )}
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}

      {showPremiumModal && (
        <div className={styles.modalOverlay} onClick={() => setShowPremiumModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setShowPremiumModal(false)}>×</button>
            <div className={styles.modalHeader}>
              <h2>{t('projects.new.premium.title', 'Требуется Premium')}</h2>
              <div className={styles.warningBanner}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>{t('projects.new.premium.description', 'Файл превышает 50 МБ. Купить Premium для загрузки больших проектов.')}</span>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.modalPrimaryBtn} onClick={() => { navigate('/pricing'); }}>
                {t('projects.new.premium.buy', 'Купить Premium')}
              </button>
              <button className={styles.modalSecondaryBtn} onClick={() => { setFile(null); setShowPremiumModal(false); }}>
                {t('projects.new.premium.continueWithout', 'Продолжить без файла')}
              </button>
              <button className={styles.modalCancelBtn} onClick={() => setShowPremiumModal(false)}>
                {t('common.cancel', 'Отмена')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

src/pages/Projects/ProjectAnalysis.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
} from 'reactflow';
import { SmartStepEdge } from '@tisoap/react-flow-smart-edge';
import 'reactflow/dist/style.css';
import styles from './ProjectAnalysis.module.css';
import { projectsAPI } from '../../services/api';
import grpcClient from '../../services/grpcClient';
import buildGraph from '../../utils/buildGraph';
import { layoutWithElk } from '../../utils/layoutWithElk';
import { useAuth } from '../../context/AuthContext';
import trashBinIcon from '../../assets/img/trash-bin.png';
import GraphHeader from './GraphHeader';
import { useI18n } from '../../context/I18nContext';

const METHOD_COLORS = {
  GET: { bg: 'linear-gradient(135deg, #22c39b 0%, #14b38a 100%)', border: '#14b38a' },
  POST: { bg: 'linear-gradient(135deg, #4f8cf7 0%, #3366f0 100%)', border: '#3366f0' },
  PATCH: { bg: 'linear-gradient(135deg, #f6c263 0%, #e09b2d 100%)', border: '#e09b2d' },
  PUT: { bg: 'linear-gradient(135deg, #9b8cf6 0%, #7f6bec 100%)', border: '#7f6bec' },
  DELETE: { bg: 'linear-gradient(135deg, #f98080 0%, #ef4444 100%)', border: '#ef4444' },
};

const SERVICE_COLORS = {
  AuthService: { color: '#8b5cf6', icon: 'A', label: 'Auth' },
  AccountService: { color: '#3b82f6', icon: 'AC', label: 'Account' },
  ProjectService: { color: '#10b981', icon: 'P', label: 'Project' },
  CoreService: { color: '#f59e0b', icon: 'C', label: 'Core' },
};

const edgeTypes = {
  smart: SmartStepEdge,
};

export default function ProjectAnalysis() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, language } = useI18n();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [baseEdges, setBaseEdges] = useState([]);
  const [highlightEdges, setHighlightEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [pinnedSourceId, setPinnedSourceId] = useState(null);
  const [hoverNodeId, setHoverNodeId] = useState(null);
  const [hoverEdgeId, setHoverEdgeId] = useState(null);
  const [depsCollapsed, setDepsCollapsed] = useState(false);
  
  // Project data and graph state
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architectureData, setArchitectureData] = useState([]);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [streamComplete, setStreamComplete] = useState(false);
  const [grpcStarted, setGrpcStarted] = useState(false);
  const [isFirstRenderSession, setIsFirstRenderSession] = useState(false);
  const [showRenderComplete, setShowRenderComplete] = useState(false);
  const streamControllerRef = useRef(null);
  const layoutRunIdRef = useRef(0);
  const architectureDataRef = useRef([]);
  const renderCompleteTimerRef = useRef(null);

  // Reset state when project id changes
  useEffect(() => {
    setProject(null);
    setRequirements([]);
    setEndpoints({});
    setArchitectureData([]);
    setNodes([]);
    setBaseEdges([]);
    setHighlightEdges([]);
    setStreamComplete(false);
    setGrpcStarted(false);
    setIsFirstRenderSession(false);
    setShowRenderComplete(false);
    if (renderCompleteTimerRef.current) {
      clearTimeout(renderCompleteTimerRef.current);
      renderCompleteTimerRef.current = null;
    }
    setDeleteError('');
    setDeleting(false);
    setError(null);
    setIsFirstLoad(true);
    setSelectedNode(null);
    setPinnedSourceId(null);
    setHoverNodeId(null);
    setHoverEdgeId(null);
    setLoading(true);
    setDepsCollapsed(false);
  }, [id]);

  useEffect(() => {
    architectureDataRef.current = architectureData;
  }, [architectureData]);

  const adjacencyMap = useMemo(() => {
    const map = new Map();
    baseEdges.forEach((edge) => {
      if (!map.has(edge.source)) {
        map.set(edge.source, { in: [], out: [] });
      }
      if (!map.has(edge.target)) {
        map.set(edge.target, { in: [], out: [] });
      }
      map.get(edge.source).out.push(edge);
      map.get(edge.target).in.push(edge);
    });
    return map;
  }, [baseEdges]);

  const edgeById = useMemo(() => {
    const map = new Map();
    baseEdges.forEach((edge) => {
      map.set(edge.id, edge);
    });
    return map;
  }, [baseEdges]);

  const buildHighlightEdges = useCallback(
    (edgesToHighlight, suffix) =>
      edgesToHighlight.map((edge, idx) => ({
        ...edge,
        id: `hl-${edge.id}-${suffix}-${idx}`,
        className: styles.edgeRunningDash,
        animated: true,
        label: undefined,
        data: { ...edge.data, isHighlight: true },
        style: {
          ...(edge.style || {}),
          strokeDasharray: '6 6',
          strokeWidth: (edge.style?.strokeWidth || 2) + 0.4,
          pointerEvents: 'none',
        },
      })),
    []
  );

  const applyNodeHighlight = useCallback(
    (nodeId) => {
      if (!nodeId) {
        setHighlightEdges([]);
        return;
      }

      const entry = adjacencyMap.get(nodeId);
      if (!entry) {
        setHighlightEdges([]);
        return;
      }

      const overlays = buildHighlightEdges([...(entry.in || []), ...(entry.out || [])], nodeId);
      setHighlightEdges(overlays);
    },
    [adjacencyMap, buildHighlightEdges]
  );

  const applyEdgeHighlight = useCallback(
    (edgeId) => {
      if (!edgeId) {
        setHighlightEdges([]);
        return;
      }
      const edge = edgeById.get(edgeId);
      if (!edge) {
        setHighlightEdges([]);
        return;
      }
      setHighlightEdges(buildHighlightEdges([edge], edgeId));
    },
    [edgeById, buildHighlightEdges]
  );

  const activeNodeId = hoverNodeId || pinnedSourceId;

  useEffect(() => {
    if (hoverEdgeId) {
      applyEdgeHighlight(hoverEdgeId);
      return;
    }
    if (activeNodeId) {
      applyNodeHighlight(activeNodeId);
      return;
    }
    setHighlightEdges([]);
  }, [hoverEdgeId, activeNodeId, applyNodeHighlight, applyEdgeHighlight]);

  const visibleEdges = useMemo(() => [...baseEdges, ...highlightEdges], [baseEdges, highlightEdges]);
  const handleEdgesChange = useCallback(() => {}, []);
  const defaultEdgeOptions = useMemo(() => ({ animated: false }), []);
  const fitViewOptions = useMemo(() => ({ padding: 0.15, maxZoom: 0.9 }), []);
  const proOptions = useMemo(() => ({ hideAttribution: true }), []);
  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 0.6 }), []);

  // Load project data via REST first, then keep updates flowing through gRPC
  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      try {
        let hasArchitectureFromApi = false;

        if (isFirstLoad) {
          setLoading(true);
          setError(null);
        }

        const projectData = await projectsAPI.getById(id);
        if (cancelled) return;

        let archFromApi = projectData.architecture;
        if (typeof archFromApi === 'string') {
          try {
            archFromApi = JSON.parse(archFromApi);
          } catch (parseError) {
            console.warn('[ui] Failed to parse architecture from API response', parseError);
            archFromApi = null;
          }
        }

        if (archFromApi && typeof archFromApi === 'object') {
          const requirementsList = Array.isArray(archFromApi.requirements) ? archFromApi.requirements : [];

          let endpointsObj = {};
          if (archFromApi.endpoints) {
            if (Array.isArray(archFromApi.endpoints)) {
              archFromApi.endpoints.forEach((endpoint) => {
                Object.entries(endpoint).forEach(([key, value]) => {
                  endpointsObj[key] = value;
                });
              });
            } else if (typeof archFromApi.endpoints === 'object') {
              endpointsObj = archFromApi.endpoints;
            }
          }

          const dataObj = archFromApi.data && typeof archFromApi.data === 'object' ? archFromApi.data : {};

          const hasArchitectureFromApiLocal =
            requirementsList.length > 0 || Object.keys(endpointsObj).length > 0 || Object.keys(dataObj).length > 0;
          hasArchitectureFromApi = hasArchitectureFromApiLocal;

          setProject({
            ...projectData,
            architecture: {
              ...archFromApi,
              requirements: requirementsList,
              endpoints: endpointsObj,
              data: dataObj,
            },
          });

          if (hasArchitectureFromApiLocal) {
            setIsFirstRenderSession(false);
            setRequirements(requirementsList);
            setEndpoints(endpointsObj);

            const archArray = Object.entries(dataObj).map(([parent, children]) => ({
              parent,
              children: Array.isArray(children) ? children : [],
            }));
            architectureDataRef.current = archArray;
            setArchitectureData(archArray);
            setStreamComplete(true);
            setLoading(false);
            setIsFirstLoad(false);
            return;
          }
        } else {
          setProject(projectData);
        }

        setLoading(false);
        setIsFirstLoad(false);

        if (grpcStarted || streamControllerRef.current) {
          return;
        }

        setIsFirstRenderSession(!hasArchitectureFromApi);
        setGrpcStarted(true);

        if (!user || !user.id) {
          setError('Authentication required. Please re-login.');
          setGrpcStarted(false);
          return;
        }

        const controller = await grpcClient.connectToStream(user.id, parseInt(id, 10), {
          onStart: () => {
            console.log('Stream started');
          },

          onRequirements: (data) => {
            setRequirements(data.requirements);
          },

          onEndpoints: (data) => {
            setEndpoints(data.endpoints);
          },

          onArchitecture: (data) => {
            architectureDataRef.current = [
              ...architectureDataRef.current,
              { parent: data.parent, children: data.children },
            ];
          },

          onDone: async () => {
            setArchitectureData([...architectureDataRef.current]);
            setStreamComplete(true);
            setGrpcStarted(false);
            streamControllerRef.current = null;
          },

          onError: (error) => {
            streamControllerRef.current = null;
            setGrpcStarted(false);
            const errorMessage = error.message || t('analysis.error.unknown', 'Неизвестная ошибка подключения');

            setArchitectureData([...architectureDataRef.current]);
            setStreamComplete(true);

            if (errorMessage.includes('500') && project?.architecture?.data) {
              setError(null);
              return;
            }

            if (errorMessage.includes('404')) {
              setError(t('analysis.error.notFound', 'Проект не найден (404).'));
            } else if (errorMessage.includes('502') || errorMessage.includes('503')) {
              setError(t('analysis.error.backend', 'Ошибка серверной инфраструктуры (502/503).'));
            } else if (errorMessage.includes('Failed to fetch')) {
              setError(t('analysis.error.connect', 'Не удалось подключиться к серверу.'));
            } else {
              setError(`${t('analysis.error.label', 'Ошибка')}: ${errorMessage}`);
            }
          },
        });

        streamControllerRef.current = controller;
      } catch (err) {
        if (cancelled) return;
        console.error('Ошибка загрузки проекта:', err);

        if (err.response?.status === 401) {
          navigate('/login');
        } else {
          setError(err.response?.data?.detail || err.message || t('analysis.error.generic', 'Не удалось получить данные проекта'));
        }

        if (isFirstLoad) {
          setLoading(false);
          setIsFirstLoad(false);
        }
      }
    };

    loadProject();

    return () => {
      cancelled = true;
      setGrpcStarted(false);
      if (streamControllerRef.current) {
        streamControllerRef.current.abort?.();
        streamControllerRef.current.cancel?.();
        streamControllerRef.current = null;
      }
    };
  }, [id, user, grpcStarted, isFirstLoad, navigate]);

  const handleDeleteProject = async () => {
    if (!id || deleting) return;

    const confirmed = window.confirm(
      t('analysis.delete.confirm', 'Удалить проект? После удаления восстановить его будет нельзя.')
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      setDeleteError('');
      await projectsAPI.delete(id);
      navigate('/projects');
    } catch (err) {
      console.error('Ошибка при удалении проекта:', err);
      const status = err.response?.status;
      const backendMessage = err.response?.data?.message || err.response?.data?.detail;

      if (status === 404) {
        setDeleteError(t('analysis.delete.notFound', 'Проект не найден или уже удалён.'));
      } else if (status === 401) {
        setDeleteError(t('analysis.delete.unauthorized', 'Сессия истекла. Авторизуйтесь снова.'));
        logout?.();
        navigate('/login');
      } else {
        setDeleteError(backendMessage || t('analysis.delete.failed', 'Не удалось удалить проект. Попробуйте позже.'));
      }
    } finally {
      setDeleting(false);
    }
  };

  // Run ELK layout with stale-run guard
  const runLayout = useCallback(
    async (builtNodes, builtEdges) => {
      const runId = ++layoutRunIdRef.current;
      try {
        const { nodes: layoutNodes, edges: layoutEdges } = await layoutWithElk(builtNodes, builtEdges, 'RIGHT');
        if (layoutRunIdRef.current !== runId) return;
        setNodes(layoutNodes);
        setBaseEdges(layoutEdges);
      } catch (err) {
        console.error('ELK layout error:', err);
        if (layoutRunIdRef.current !== runId) return;
        setNodes(builtNodes);
        setBaseEdges(builtEdges);
      } finally {
        if (isFirstLoad && builtNodes.length > 0 && layoutRunIdRef.current === runId) {
          setIsFirstLoad(false);
        }
      }
    },
    [isFirstLoad, setNodes]
  );

  // Build graph once data is ready (initial load or after stream)
  useEffect(() => {
    if (!streamComplete) return;
    if (architectureData.length === 0 && Object.keys(endpoints || {}).length === 0 && requirements.length === 0) return;

    const { nodes: builtNodes, edges: builtEdges, summary } = buildGraph({
      requirements,
      endpoints,
      architectureData,
      methodColors: METHOD_COLORS,
      serviceColors: SERVICE_COLORS,
    });

    console.log('Graph built (before layout):', summary);
    runLayout(builtNodes, builtEdges);
  }, [streamComplete, requirements, endpoints, architectureData, runLayout]);

  const onNodeMouseEnter = useCallback((event, node) => {
    setHoverNodeId(node.id);
    setHoverEdgeId(null);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoverNodeId(null);
  }, []);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    setPinnedSourceId((prev) => (prev === node.id ? null : node.id));
    setHoverEdgeId(null);
  }, []);

  const onEdgeMouseEnter = useCallback((event, edge) => {
    setHoverEdgeId(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoverEdgeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setPinnedSourceId(null);
    setHoverNodeId(null);
    setHoverEdgeId(null);
  }, []);

  const nodesCount = nodes.length;
  const edgesCount = baseEdges.length;
  const requirementsCount = requirements.length;
  const endpointsCount = Object.keys(endpoints || {}).length;
  const renderComplete = streamComplete && nodes.length > 0 && !loading;
  const showRenderInProgress = isFirstRenderSession && grpcStarted && !streamComplete;
  const showRenderCompleteOverlay = showRenderComplete;
  const renderStatusOverlayNode =
    (showRenderCompleteOverlay || showRenderInProgress) && (
      <div className={styles.renderStatusOverlay} role="status" aria-live="polite">
        {showRenderCompleteOverlay ? (
          <div className={styles.renderDone}>
            <span className={styles.renderDoneDot} aria-hidden="true" />
            {t('analysis.renderDone', 'Отрисовка закончена')}
          </div>
        ) : (
          <div className={styles.renderProgress}>
            <span className={styles.renderProgressDot} aria-hidden="true" />
            {t('analysis.renderInProgress', 'Идёт отрисовка, дождитесь завершения')}
          </div>
        )}
      </div>
    );

  useEffect(() => {
    if (!renderComplete || !isFirstRenderSession) return;
    setShowRenderComplete(true);
    if (renderCompleteTimerRef.current) {
      clearTimeout(renderCompleteTimerRef.current);
    }
    renderCompleteTimerRef.current = setTimeout(() => {
      setShowRenderComplete(false);
      renderCompleteTimerRef.current = null;
    }, 5000);

    return () => {
      if (renderCompleteTimerRef.current) {
        clearTimeout(renderCompleteTimerRef.current);
        renderCompleteTimerRef.current = null;
      }
    };
  }, [renderComplete, isFirstRenderSession]);

  const dependenciesSubtitle = useMemo(() => {
    if (requirementsCount > 0) {
      if (language === 'en') {
        const word = requirementsCount === 1 ? 'package' : 'packages';
        return `${requirementsCount} ${word}`;
      }
      const mod10 = requirementsCount % 10;
      const mod100 = requirementsCount % 100;
      let word = 'зависимостей';
      if (mod10 === 1 && mod100 !== 11) word = 'зависимость';
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'зависимости';
      return `${requirementsCount} ${word}`;
    }
    if (!streamComplete) {
      return t('analysis.waitingStream', 'Ожидание данных потока...');
    }
    return t('analysis.noDependencies', 'Зависимости не найдены');
  }, [language, requirementsCount, streamComplete, t]);

  // Loading state while initial data is fetched
  if (loading) {
    return (
      <div className={styles.container}>
        <GraphHeader
          title={t('graph.title', 'Архитектура проекта')}
          nodesCount={nodesCount}
          edgesCount={edgesCount}
          requirementsCount={requirementsCount}
          endpointsCount={endpointsCount}
          onClose={() => navigate('/projects')}
          closeLabel={t('common.close', 'Закрыть')}
        />
        <div className={styles.flowWrapper}>
          {renderStatusOverlayNode}
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner} />
            <p>{t('analysis.loadingData', 'Пожалуйста, подождите. Данные загружаются...')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <GraphHeader
          title={t('graph.title', 'Архитектура проекта')}
          nodesCount={nodesCount}
          edgesCount={edgesCount}
          requirementsCount={requirementsCount}
          endpointsCount={endpointsCount}
          onClose={() => navigate('/projects')}
          closeLabel={t('common.close', 'Закрыть')}
        />
        <div className={styles.flowWrapper}>
          {renderStatusOverlayNode}
          <div className={styles.loadingState}>
            <p style={{ color: '#ef4444' }}>⚠️ {error}</p>
            <button 
              onClick={() => window.location.reload()} 
              style={{ 
                marginTop: '20px', 
                padding: '10px 20px', 
                background: '#3b82f6', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              {t('analysis.reload', 'Обновить страницу')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Detect whether there is architecture data to render
  const hasArchitectureData = project?.architecture && (
    (project.architecture.requirements && project.architecture.requirements.length > 0) ||
    (project.architecture.endpoints && Object.keys(project.architecture.endpoints).length > 0) ||
    (project.architecture.data && Object.keys(project.architecture.data).length > 0)
  );

  if (!loading && !hasArchitectureData) {
    return (
      <div className={styles.container}>
        <GraphHeader
          title={t('graph.title', 'Архитектура проекта')}
          nodesCount={nodesCount}
          edgesCount={edgesCount}
          requirementsCount={requirementsCount}
          endpointsCount={endpointsCount}
          onClose={() => navigate('/projects')}
          closeLabel={t('common.close', 'Закрыть')}
          onDelete={handleDeleteProject}
          deleteLabel={deleting ? t('analysis.delete.deleting', 'Удаляем...') : t('analysis.delete.delete', 'Удалить проект')}
          deleteIcon={trashBinIcon}
          deleting={deleting}
        />
        {deleteError && (
          <div className={styles.errorBanner}>{deleteError}</div>
        )}
        <div className={styles.flowWrapper}>
          {renderStatusOverlayNode}
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner}></div>
            <h2>{t('analysis.preparingTitle', 'Готовим визуализацию архитектуры...')}</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '30px', maxWidth: '400px', textAlign: 'center' }}>
              {t('analysis.preparingSubtitle', 'Подключаемся и подготавливаем данные. Обычно это занимает всего несколько секунд.')}
            </p>
            <div className={styles.progressBar} style={{ width: '400px', height: '8px', background: 'rgba(90, 111, 214, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div 
                className={styles.progressFill}
                style={{ 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #5A6FD6 0%, #6B8FE8 100%)', 
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                  width: '30%'
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <GraphHeader
        title={t('graph.title', 'Архитектура проекта')}
        nodesCount={nodesCount}
        edgesCount={edgesCount}
        requirementsCount={requirementsCount}
        endpointsCount={endpointsCount}
        onClose={() => navigate('/projects')}
        closeLabel={t('common.close', 'Закрыть')}
        onDelete={handleDeleteProject}
        deleteLabel={deleting ? t('analysis.delete.deleting', 'Удаляем...') : t('analysis.delete.delete', 'Удалить проект')}
        deleteIcon={trashBinIcon}
        deleting={deleting}
      />

      {deleteError && (
        <div className={styles.errorBanner}>{deleteError}</div>
      )}

      <div className={styles.visualLayout}>
        {renderStatusOverlayNode}
        {/* Graph */}
        <div className={styles.flowWrapper}>
          {nodes.length > 0 ? (
            <ReactFlow
              nodes={nodes}
              edges={visibleEdges}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={handleEdgesChange}
              onNodeClick={onNodeClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              onPaneClick={onPaneClick}
              fitView={isFirstLoad}
              fitViewOptions={fitViewOptions}
              minZoom={0.1}
              maxZoom={2}
              defaultViewport={defaultViewport}
              proOptions={proOptions}
              defaultEdgeOptions={defaultEdgeOptions}
              onlyRenderVisibleElements
              nodesDraggable={true}
              nodesConnectable={false}
              elementsSelectable={true}
              panOnDrag={true}
              panOnScroll={true}
              zoomOnScroll={true}
              zoomOnPinch={true}
              zoomOnDoubleClick={false}
              selectionOnDrag={false}
              panActivationKeyCode={null}
              preventScrolling={true}
              attributionPosition="bottom-right"
              nodeOrigin={[0.5, 0.5]}
              selectNodesOnDrag={false}
            >
              <Background color="#f0f0f0" gap={20} size={1} />
              <Controls className={styles.controls} />
            </ReactFlow>
          ) : (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <p>{t('analysis.buildingGraph', 'Пожалуйста, подождите. Строим граф...')}</p>
            </div>
          )}
        </div>

        {/* Dependencies Sidebar */}
              <aside
                className={`${styles.dependenciesPanel} ${depsCollapsed ? styles.dependenciesCollapsed : ''}`}
                aria-expanded={!depsCollapsed}
              >
                <div className={styles.dependenciesHeader}>
                  <div className={styles.dependenciesHeaderText}>
                    <div className={styles.dependenciesTitle}>{t('analysis.dependencies', 'Зависимости')}</div>
                    <div className={styles.dependenciesSubtitle}>{dependenciesSubtitle}</div>
                  </div>
                  <div className={styles.dependenciesHeaderActions}>
                    <div className={styles.dependenciesBadge}>{requirementsCount}</div>
                    <button
                      type="button"
                      className={styles.dependenciesToggle}
                      onClick={() => setDepsCollapsed((prev) => !prev)}
                      aria-label={
                        depsCollapsed
                          ? t('analysis.expandDependencies', 'Развернуть список зависимостей')
                          : t('analysis.collapseDependencies', 'Свернуть список зависимостей')
                      }
                    >
                      {depsCollapsed ? '❯' : '❮'}
                    </button>
                  </div>
                </div>
                {!depsCollapsed && (
            <div className={styles.dependenciesList}>
              {requirementsCount > 0 ? (
                requirements.map((req, idx) => (
                  <div key={`${req}-${idx}`} className={styles.requirementItem}>
                    <span className={styles.reqBullet} aria-hidden="true" />
                    <span className={styles.reqName}>{req}</span>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>{t('analysis.dependenciesEmpty', 'Список появится после получения данных.')}</div>
              )}
            </div>
          )}
        </aside>

        {/* Node Details Tooltip */}
        {selectedNode && (
          <div className={styles.tooltip}>
            <button className={styles.tooltipClose} onClick={() => setSelectedNode(null)}>
              ×
            </button>
            <h3>{selectedNode.data.label}</h3>
            <p><strong>ID:</strong> {selectedNode.id}</p>
          </div>
        )}
      </div>
    </div>
  );
}

src/pages/Projects/ProjectAnalysis.module.css
/* Layered Architecture Analysis View */

.container {
  width: 100%;
  height: 100vh;
  background: var(--page-gradient);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graphOverlay {
  position: fixed;
  inset: 0;
  background: var(--page-gradient);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.graphHeader {
  padding: 16px 20px;
  background: var(--surface);
  border-bottom: 2px solid var(--border-strong);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  z-index: 10;
}

.graphHeaderLeft {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.graphTitle {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.graphMeta {
  font-size: 12px;
  color: var(--text-subtle);
}

.renderStatusOverlay {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  pointer-events: none;
  text-align: center;
}

.renderDone {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--success);
  background: var(--success-soft);
  border: 1px solid color-mix(in srgb, var(--success) 35%, transparent);
  border-radius: 9999px;
  box-shadow: 0 4px 12px var(--shadow-soft);
}

.renderDoneDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.18);
}

.renderProgress {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--warning-strong);
  background: var(--warning-soft);
  border: 1px solid var(--warning);
  border-radius: 10px;
  box-shadow: 0 6px 16px var(--shadow-soft);
}

.renderProgressDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--warning);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--warning) 30%, transparent);
}

.graphActions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.moreWrapper {
  position: relative;
}

.moreBtn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.moreBtn:hover {
  background: var(--surface);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.moreMenu {
  position: absolute;
  top: 44px;
  right: 0;
  min-width: 180px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  padding: 8px;
  z-index: 20;
}

.closeBtn {
  background: var(--danger);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
}

.closeBtn:hover {
  background: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.3);
}

.closeBtn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);
}

.graphBody {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--graph-surface);
}

/* Animation for new nodes appearing */
@keyframes fadeInScale {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.05);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Layer Header with Labels */
.layerHeader {
  position: relative;
  height: 60px;
  background: var(--surface);
  border-bottom: 2px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  z-index: 10;
}

.layerLabel {
  position: absolute;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  letter-spacing: 0.3px;
}

/* Control Bar */
.controlBar {
  background: var(--surface);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  border-bottom: 1px solid var(--border);
  z-index: 5;
}

.backBtn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.backBtn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(90, 111, 214, 0.3);
}

.deleteBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  min-width: 44px;
  min-height: 44px;
  background: var(--danger-soft);
  color: var(--danger-strong);
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 8px 18px var(--shadow-soft);
}

.deleteIcon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  display: block;
}

.deleteBtn:hover {
  background: color-mix(in srgb, var(--danger) 20%, transparent);
  border-color: var(--danger);
  color: var(--danger-strong);
  transform: translateY(-1px);
  box-shadow: 0 10px 22px var(--shadow-strong);
}

.deleteBtn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.titleContainer {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.statusBadge {
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Info Bar */
.infoBar {
  background: var(--surface);
  padding: 12px 24px;
  display: flex;
  gap: 30px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.infoItem {
  display: flex;
  align-items: center;
  gap: 8px;
}

.infoLabel {
  font-size: 13px;
  color: var(--text-subtle);
  font-weight: 600;
}

.infoValue {
  font-size: 16px;
  color: #5A6FD6;
  font-weight: 700;
  padding: 4px 10px;
  background: var(--surface-raised);
  border-radius: 6px;
}

.errorBanner {
  margin: 12px 24px 0 24px;
  background: var(--danger-soft);
  color: var(--danger-strong);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  border-left: 4px solid #f43f5e;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 10px 22px var(--shadow-soft);
}

/* Flow Wrapper */
.flowWrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  background: var(--graph-surface);
  /* GPU ускорение */
  transform: translateZ(0);
  will-change: transform;
  /* Курсор видимый по умолчанию */
  cursor: default !important;
}

/* Черный курсор для всех элементов ReactFlow */
.flowWrapper * {
  cursor: inherit;
}

/* ReactFlow курсор видимый везде */
.flowWrapper :global(.react-flow) {
  cursor: default !important;
}

.flowWrapper :global(.react-flow__renderer) {
  cursor: default !important;
}

.flowWrapper :global(.react-flow__viewport) {
  cursor: grab !important;
}

.flowWrapper :global(.react-flow__pane) {
  cursor: grab !important;
}

.flowWrapper :global(.react-flow__pane):active,
.flowWrapper :global(.react-flow__viewport):active {
  cursor: grabbing !important;
}

.flowWrapper :global(.react-flow__selectionpane) {
  cursor: grab !important;
}

.flowWrapper :global(.react-flow__node) {
  cursor: pointer !important;
  /* GPU ускорение для узлов */
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-font-smoothing: subpixel-antialiased;
}

.flowWrapper :global(.react-flow__edge) {
  cursor: pointer !important;
}

.flowWrapper :global(.react-flow__edge-path) {
  cursor: pointer !important;
}

.flowWrapper :global(.react-flow__controls) {
  cursor: default !important;
}

.flowWrapper :global(.react-flow__controls button) {
  cursor: pointer !important;
}

.flowWrapper :global(.react-flow__background) {
  cursor: grab !important;
}

/* Отключаем анимацию при взаимодействии для производительности */
.flowWrapper :global(.react-flow__node.dragging) {
  transition: none !important;
  box-shadow: none !important;
  filter: none !important;
}

.flowWrapper :global(.react-flow__node.dragging * ) {
  transition: none !important;
  box-shadow: none !important;
  filter: none !important;
}

.visualLayout {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 12px 16px 16px 16px;
  min-height: 0;
  position: relative;
}

.dependenciesPanel {
  width: 320px;
  background: var(--graph-surface);
  border: 1px solid var(--graph-node-border);
  border-radius: 16px;
  box-shadow: 0 18px 40px var(--shadow-soft);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  max-height: calc(100vh - 160px);
  position: relative;
  transition: width 0.32s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease, border-color 0.25s ease,
    background 0.25s ease;
  will-change: width, box-shadow;
}

.dependenciesCollapsed {
  width: 76px;
  border-radius: 18px;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.18);
}

.dependenciesCollapsed::after {
  content: 'Dependencies';
  position: absolute;
  top: 50%;
  left: 24px;
  transform: translateY(-50%);
  writing-mode: vertical-rl;
  text-transform: uppercase;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 2.4px;
  color: #cbd5e1;
  opacity: 0.95;
  pointer-events: none;
}

.dependenciesHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(135deg, color-mix(in srgb, var(--graph-node-bg) 60%, transparent), color-mix(in srgb, var(--primary) 15%, transparent));
}

.dependenciesHeaderText {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dependenciesHeaderActions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dependenciesTitle {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.dependenciesSubtitle {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-subtle);
}

.dependenciesBadge {
  min-width: 36px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: linear-gradient(135deg, #5A6FD6 0%, #6B8FE8 100%);
  color: white;
  font-weight: 800;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(90, 111, 214, 0.2);
}

.dependenciesToggle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-primary) 35%, #0b1220 100%);
  color: var(--border-strong);
  font-weight: 800;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.25);
}

.dependenciesToggle:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.32);
}

.dependenciesToggle:active {
  transform: translateY(0);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.24);
}

.dependenciesCollapsed .dependenciesHeaderText,
.dependenciesCollapsed .dependenciesBadge {
  display: none;
}

.dependenciesCollapsed .dependenciesHeader {
  padding: 12px;
  justify-content: center;
}

.dependenciesCollapsed .dependenciesList {
  display: none;
}

.dependenciesCollapsed .dependenciesToggle {
  background: linear-gradient(135deg, #0b1220 0%, #0f172a 100%);
}

.dependenciesList {
  flex: 1;
  min-height: 0;
  padding: 12px 14px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  background: var(--graph-surface);
}

.dependenciesList::-webkit-scrollbar {
  width: 7px;
}

.dependenciesList::-webkit-scrollbar-track {
  background: transparent;
}

.dependenciesList::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 10px;
}

.dependenciesList::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.6);
}

.requirementItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--graph-node-bg);
  border: 1px solid var(--graph-node-border);
  border-radius: 12px;
  transition: all 0.2s ease;
  box-shadow: 0 10px 24px var(--shadow-soft);
}

.requirementItem:hover {
  border-color: var(--primary);
  transform: translateX(2px) translateY(-1px);
  box-shadow: 0 14px 28px var(--shadow-strong);
}

.reqBullet {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5A6FD6 0%, #6B8FE8 100%);
  box-shadow: 0 0 0 4px rgba(90, 111, 214, 0.12);
  flex-shrink: 0;
}

.reqName {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
  font-family: 'Courier New', monospace;
  word-break: break-word;
}

.emptyState {
  text-align: center;
  color: var(--text-subtle);
  font-size: 13px;
  padding: 30px 10px;
  background: var(--graph-node-bg);
  border: 1px dashed var(--graph-node-border);
  border-radius: 10px;
}

/* Loading State */
.loadingState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #0f172a;
  gap: 20px;
}

.loadingState h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.loadingSpinner {
  width: 60px;
  height: 60px;
  border: 4px solid rgba(90, 111, 214, 0.2);
  border-top-color: #5A6FD6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loadingState p {
  font-size: 16px;
  font-weight: 400;
  color: var(--text-subtle);
  margin: 0;
}

.progressBar {
  width: 100%;
  max-width: 400px;
  height: 8px;
  background: rgba(90, 111, 214, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: linear-gradient(90deg, #5A6FD6 0%, #6B8FE8 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* Node Labels */
.nodeLabel,
.endpointLabel,
.serviceLabel,
.dbManagerLabel,
.dbLabel,
.brokerLabel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.4;
  white-space: pre-line;
}

.nodeTitle {
  font-size: 16px;
  font-weight: 700;
}

.endpointLabel {
  font-size: 13px;
  line-height: 1.3;
}

/* Method Group Styles */
.methodGroup {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s ease;
}

.methodGroup:hover {
  transform: scale(1.05);
}

.methodBadge {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.methodCount {
  font-size: 11px;
  opacity: 0.95;
  font-weight: 600;
}

.expandIcon {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 2px;
}

/* Endpoint Card */
.endpointCard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 10px 22px var(--shadow-soft);
}

.endpointMethod {
  padding: 6px 12px;
  font-weight: 700;
  font-size: 11px;
  color: var(--text-inverse);
  letter-spacing: 0.5px;
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--shadow-soft);
  transition: all 0.2s ease;
}

.endpointMethod:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--shadow-strong);
}

.endpointPath {
  font-size: 11px;
  font-family: 'Courier New', monospace;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.3;
}

.endpointKey {
  font-size: 10px;
  color: var(--text-subtle);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Cylinder Node (Database) */
.cylinderNode {
  position: relative;
}

.cylinderNode::before {
  content: '';
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 6px);
  height: 24px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-radius: 50%;
  border: 3px solid #475569;
  border-bottom: none;
  z-index: -1;
}

.cylinderNode::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 6px);
  height: 16px;
  background: linear-gradient(180deg, transparent 0%, #0f172a 50%);
  border-radius: 0 0 50% 50%;
  z-index: -1;
}

/* Tooltip */
.tooltip {
  position: absolute;
  top: 120px;
  right: 360px;
  background: var(--surface);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 24px var(--shadow-soft);
  z-index: 1000;
  min-width: 250px;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.tooltipClose {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  background: var(--surface-raised);
  border: none;
  border-radius: 50%;
  font-size: 18px;
  color: var(--text-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.tooltipClose:hover {
  background: var(--surface);
  color: var(--text-primary);
}

.tooltip h3 {
  margin: 0 0 12px 0;
  color: var(--text-primary);
  font-size: 16px;
}

.tooltip p {
  margin: 6px 0;
  color: var(--text-subtle);
  font-size: 13px;
}

.tooltip strong {
  color: var(--text-primary);
}

/* Controls */
.controls {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  box-shadow: 0 2px 8px var(--shadow-soft) !important;
}

/* Responsive */
@media (max-width: 1200px) {
  .layerLabel {
    font-size: 13px;
  }

  .visualLayout {
    flex-direction: column;
  }

  .dependenciesPanel {
    width: 100%;
  }

  .tooltip {
    right: 24px;
  }
}

@media (max-width: 768px) {
  .layerHeader {
    height: auto;
    padding: 12px;
  }

  .layerLabel {
    position: relative;
    left: auto !important;
    font-size: 11px;
    margin-right: 15px;
  }

  .controlBar {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .titleContainer {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .infoBar {
    padding: 10px 15px;
    gap: 15px;
  }

  .title {
    font-size: 16px;
  }

  .deleteBtn {
    width: 100%;
  }

  .errorBanner {
    margin: 10px 12px 0 12px;
  }

  .tooltip {
    right: 15px;
    left: 15px;
    top: auto;
    bottom: 80px;
  }
}

@keyframes runningDash {
  to {
    stroke-dashoffset: -24;
  }
}

.edgeRunningDash path {
  stroke-dasharray: 6 6;
  animation: runningDash 1s linear infinite;
}

src/pages/Projects/ProjectView.module.css
.container {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    flex-direction: column;
}

.header {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    padding: 20px 40px;
    display: flex;
    align-items: center;
    gap: 30px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.backBtn {
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.backBtn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.projectInfo {
    flex: 1;
}

.projectInfo h1 {
    margin: 0 0 5px 0;
    font-size: 24px;
    color: var(--text-primary);
}

.projectInfo p {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
}

.stats {
    display: flex;
    gap: 30px;
}

.stat {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.statLabel {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
}

.statValue {
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.flowWrapper {
    flex: 1;
    position: relative;
    margin: 20px;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    height: calc(100vh - 140px); /* Явная высота для ReactFlow */
    min-height: 600px;
}

/* Custom Node Styles */
.customNode {
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.3s ease;
    cursor: pointer;
}

.customNode:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.nodeContent {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.nodeLabel {
    font-size: 16px;
    font-weight: 700;
    text-align: center;
}

.nodeDescription {
    font-size: 11px;
    opacity: 0.9;
    font-weight: 400;
    text-align: center;
}

.nodeLines {
    font-size: 10px;
    opacity: 0.8;
    font-weight: 500;
    text-align: center;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
}

/* Node Styles */
:global(.react-flow__node) {
    background: var(--surface);
    border: 2px solid #e0e0e0;
    border-radius: 12px;
    padding: 16px 20px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
    min-width: 180px;
}

:global(.react-flow__node:hover) {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

:global(.react-flow__node.selected) {
    border-color: #667eea;
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2);
}

/* Gateway Node */
.gatewayNode {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    color: white !important;
    border: none !important;
}

/* Service Node */
.serviceNode {
    background: linear-gradient(135deg, #48bb78 0%, #38a169 100%) !important;
    color: white !important;
    border: none !important;
}

/* Database Node */
.databaseNode {
    background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%) !important;
    color: white !important;
    border: none !important;
}

/* Queue Node */
.queueNode {
    background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%) !important;
    color: white !important;
    border: none !important;
}

/* Worker Node */
.workerNode {
    background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%) !important;
    color: white !important;
    border: none !important;
}

/* Util Node */
.utilNode {
    background: linear-gradient(135deg, #a0aec0 0%, var(--text-subtle) 100%) !important;
    color: white !important;
    border: none !important;
}

:global(.react-flow__node) div {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

:global(.react-flow__node) div span:first-child {
    font-size: 16px;
    font-weight: 700;
}

:global(.react-flow__node) div span:last-child {
    font-size: 11px;
    opacity: 0.9;
    font-weight: 400;
}

/* Edge Labels */
:global(.react-flow__edge-text) {
    font-size: 11px;
    font-weight: 600;
    fill: var(--text-muted);
    background: var(--surface);
    padding: 2px 6px;
    border-radius: 4px;
}

/* Controls */
:global(.react-flow__controls) {
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border: none;
}

:global(.react-flow__controls-button) {
    background: var(--surface);
    border: none;
    border-bottom: 1px solid #e0e0e0;
    transition: all 0.2s ease;
}

:global(.react-flow__controls-button:hover) {
    background: #f7fafc;
}

:global(.react-flow__controls-button svg) {
    fill: #667eea;
}

/* MiniMap */
:global(.react-flow__minimap) {
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border: 2px solid #e0e0e0;
}

/* Legend Panel */
.legend {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    min-width: 180px;
}

.legend h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
}

.legendItem {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--text-muted);
}

.legendColor {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Details Panel */
.detailsPanel {
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: 350px;
    background: var(--surface);
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    animation: slideIn 0.3s ease;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(100%);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.detailsHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 2px solid var(--border);
}

.detailsHeader h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text-primary);
}

.detailsHeader button {
    background: var(--border);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    color: var(--text-muted);
    transition: all 0.2s ease;
}

.detailsHeader button:hover {
    background: #e0e0e0;
    color: var(--text-secondary);
}

.detailsContent {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.detailItem {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.detailLabel {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.detailItem > span:last-child {
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 500;
}

.codeText {
    font-family: 'Courier New', monospace;
    background: #f7fafc;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px !important;
    color: #667eea !important;
}

/* Responsive */
@media (max-width: 768px) {
    .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 15px;
    }

    .stats {
        width: 100%;
        justify-content: space-around;
    }

    .flowWrapper {
        margin: 10px;
    }

    .detailsPanel {
        width: calc(100% - 40px);
        right: 20px;
        left: 20px;
    }

    .legend {
        display: none;
    }
}

src/pages/Projects/ProjectViewArchitecture.jsx
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectViewArchitecture.module.css';
import { projectsAPI } from '../../services/api';

// Memoized node content component for better performance
const NodeContent = memo(({ serviceName, methodCount }) => (
  <div className={styles.nodeContent}>
    <div className={styles.nodeName}>{serviceName}</div>
    <div className={styles.nodeInfo}>
      {methodCount} method{methodCount !== 1 ? 's' : ''}
    </div>
  </div>
));

NodeContent.displayName = 'NodeContent';

export default function ProjectViewArchitecture() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architecture, setArchitecture] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  
  const [streamStatus, setStreamStatus] = useState('connecting');
  const [progress, setProgress] = useState({ total: 100, current: 0 });
  
  // Для инкрементального построения графа
  const [serviceMap, setServiceMap] = useState(new Map());

  // Симуляция gRPC стрима с моковыми данными (пока бэкенд сломан)
  useEffect(() => {
    if (!id) {
      setStreamStatus('error');
      console.error('No project ID provided');
      return;
    }

    let cancelled = false;
    
    const _simulateStream = async () => {
      setStreamStatus('loading');
      setProgress({ total: 100, current: 5 });
      console.log('🎭 Запуск симуляции gRPC стрима...');
      
      // Mock data из grpcClient.js
      const mockData = {
        requirements: [
          'aio-pika', 'asyncpg', 'bcrypt', 'boto3', 'fastapi',
          'grpcio', 'grpcio-tools', 'pika', 'protobuf', 'pyjwt',
          'python-dotenv', 'python-multipart', 'pyyaml', 'sqlalchemy', 'uvicorn'
        ],
        endpoints: {
          'registration': 'POST /v1/auth/registration',
          'refresh': 'POST /v1/auth/refresh',
          'patch_project': 'PATCH /v1/project/{project_id}',
          'patch_account': 'PATCH /v1/account',
          'login': 'POST /v1/auth/login',
          'homepage': 'GET /v1/home',
          'get_project': 'GET /v1/project/{project_id}',
          'get_projects_list': 'GET /v1/project',
          'get_account': 'GET /v1/account',
          'delete_project': 'DELETE /v1/project/{project_id}',
          'create_project': 'POST /v1/project',
        },
        architecture: [
          { parent: 'Account.create_account', children: ['datamanager/DatabaseManager.session', 'accounts/Account', 'accounts/session.add'] },
          { parent: 'Account.get_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/session.get', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'] },
          { parent: 'Account.get_account_by_login', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute', 'accounts/where', 'accounts/select', 'accounts/result.scalar_one_or_none', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'] },
          { parent: 'Account.is_login_exists', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute', 'accounts/where', 'accounts/select', 'accounts/result.scalar_one_or_none'] },
          { parent: 'Account.patch_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/Account.get_account_by_id', 'accounts/items', 'accounts/patch_data.model_dump', 'accounts/setattr', 'accounts/session.flush'] },
          { parent: 'DataBaseException.__init__', children: ['base/__init__', 'base/super'] },
          { parent: 'DataBaseEntityNotExists.__init__', children: ['base/__init__', 'base/super'] },
          { parent: 'DatabaseManager.__init__', children: ['datamanager/create_async_engine', 'datamanager/async_sessionmaker'] },
          { parent: 'DatabaseManager.init_models', children: ['datamanager/self.engine.begin', 'datamanager/Base.metadata.tables.get', 'datamanager/conn.run_sync', 'datamanager/ValueError', 'datamanager/conn.run_sync', 'datamanager/Base.metadata.tables.get', 'datamanager/conn.run_sync', 'datamanager/ValueError', 'datamanager/conn.run_sync'] },
          { parent: 'DatabaseManager.session', children: ['datamanager/self.session_factory', 'datamanager/session.commit', 'datamanager/session.rollback', 'datamanager/DatabaseManager.close'] },
          { parent: 'DatabaseManager.close', children: ['datamanager/self.engine.dispose'] },
          { parent: 'init_db', children: ['datamanager/DatabaseManager.init_models'] },
          { parent: 'Project.create_project', children: ['datamanager/DatabaseManager.session', 'projects/Project', 'projects/session.add'] },
          { parent: 'Project.get_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/session.get', 'projects/log.error', 'projects/DataBaseEntityNotExists'] },
          { parent: 'Project.patch_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/Project.get_project_by_id', 'projects/items', 'projects/patch_data.model_dump', 'projects/setattr', 'projects/session.flush'] },
          { parent: 'Project.get_project_list_by_account_id', children: ['datamanager/DatabaseManager.session', 'projects/where', 'projects/select', 'projects/session.execute', 'projects/all', 'projects/result.scalars', 'projects/len'] },
          { parent: 'Project.delete_project', children: ['datamanager/DatabaseManager.session', 'projects/Project.get_project_by_id', 'projects/session.delete'] },
          { parent: 'get_account', children: ['account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/log.info', 'auth_service/AuthService.verify_token', 'account_service/AccountService.get_account_by_id', 'account_endpoints/log.info', 'account_endpoints/router.get'] },
          { parent: 'patch_account', children: ['account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/log.info', 'auth_service/AuthService.verify_token', 'account_service/AccountService.patch_account_by_id', 'account_endpoints/log.info', 'account_endpoints/router.patch'] },
          { parent: 'login', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.login', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
          { parent: 'refresh', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.refresh', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
          { parent: 'registration', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.registration', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
          { parent: 'homepage', children: ['core_endpoints/Depends', 'core_endpoints/Depends', 'core_endpoints/Depends', 'core_endpoints/log.info', 'auth_service/AuthService.verify_token', 'core_service/CoreService.get_homepage', 'core_endpoints/log.info', 'core_endpoints/router.get'] },
          { parent: 'get_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.get_project_by_id', 'project_endpoints/log.info', 'project_endpoints/router.get'] },
          { parent: 'create_project', children: ['project_endpoints/File', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.create_project', 'project_endpoints/ProjectCreateData', 'project_endpoints/log.info', 'project_endpoints/router.post'] },
          { parent: 'patch_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.update_project', 'project_endpoints/log.info', 'project_endpoints/router.patch'] },
          { parent: 'delete_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.delete_project', 'project_endpoints/log.info', 'project_endpoints/router.delete'] },
          { parent: 'get_projects_list', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.get_projects_by_account_id', 'project_endpoints/log.info', 'project_endpoints/router.get'] },
          { parent: 'lifespan', children: ['datamanager/DatabaseManager.init_models', 'manager/ConnectionBrokerManager.connect', 'datamanager/DatabaseManager.close', 'datamanager/DatabaseManager.close'] },
          { parent: 'TaskSession.__init__', children: ['core_server/asyncio.Queue'] },
          { parent: 'TaskSession.add_message', children: ['core_server/self.message_queue.put'] },
          { parent: 'TaskSession.get_next_message', children: ['core_server/self.message_queue.get'] },
          { parent: 'TaskSession.close', children: [] },
          { parent: 'TaskManager.__init__', children: [] },
          { parent: 'TaskManager.get_or_create_session', children: ['core_server/TaskSession'] },
          { parent: 'TaskManager.remove_session', children: [] },
          { parent: 'FrontendStreamService.__init__', children: [] },
          { parent: 'FrontendStreamService.RunAlgorithm', children: ['core_pb2_grpc/grpc.experimental.unary_stream'] },
          { parent: 'AlgorithmConnectionService.__init__', children: [] },
          { parent: 'AlgorithmConnectionService.ConnectToCore', children: ['algorithm_pb2_grpc/grpc.experimental.stream_unary'] },
          { parent: 'CoreServer.__init__', children: ['core_server/TaskManager', 'core_server/FrontendStreamService', 'core_server/AlgorithmConnectionService', 'core_server/grpc.aio.server', 'core_server/core_pb2_grpc.add_FrontendStreamServiceServicer_to_server', 'core_server/algorithm_pb2_grpc.add_AlgorithmConnectionServiceServicer_to_server', 'core_server/self.server.add_insecure_port'] },
          { parent: 'CoreServer.start', children: ['core_server/print', 'core_server/self.server.start', 'core_server/self.server.wait_for_termination'] },
          { parent: 'CoreServer.stop', children: ['core_server/print', 'core_server/list', 'core_server/self.task_manager.tasks.items', 'datamanager/DatabaseManager.close', 'core_server/self.task_manager.remove_session', 'core_server/self.server.stop'] },
          { parent: 'AlgorithmConnectionServiceStub.__init__', children: ['algorithm_pb2_grpc/channel.stream_unary'] },
          { parent: 'AlgorithmConnectionServiceServicer.ConnectToCore', children: ['algorithm_pb2_grpc/context.set_code', 'algorithm_pb2_grpc/context.set_details', 'algorithm_pb2_grpc/NotImplementedError'] },
          { parent: 'add_AlgorithmConnectionServiceServicer_to_server', children: ['algorithm_pb2_grpc/grpc.stream_unary_rpc_method_handler', 'algorithm_pb2_grpc/grpc.method_handlers_generic_handler', 'algorithm_pb2_grpc/server.add_generic_rpc_handlers', 'algorithm_pb2_grpc/server.add_registered_method_handlers'] },
          { parent: 'FrontendStreamServiceStub.__init__', children: ['core_pb2_grpc/channel.unary_stream'] },
          { parent: 'FrontendStreamServiceServicer.RunAlgorithm', children: ['core_pb2_grpc/context.set_code', 'core_pb2_grpc/context.set_details', 'core_pb2_grpc/NotImplementedError'] },
          { parent: 'add_FrontendStreamServiceServicer_to_server', children: ['core_pb2_grpc/grpc.unary_stream_rpc_method_handler', 'core_pb2_grpc/grpc.method_handlers_generic_handler', 'core_pb2_grpc/server.add_generic_rpc_handlers', 'core_pb2_grpc/server.add_registered_method_handlers'] },
          { parent: 'Consumer.__init__', children: [] },
          { parent: 'Consumer.start', children: ['consumer/self.connection.connect', 'consumer/self.connection.channel.declare_queue', 'consumer/log.info', 'consumer/self.connection.channel.set_qos', 'consumer/log.info', 'consumer/wait', 'consumer/asyncio.Event', 'consumer/log.info'] },
          { parent: 'Consumer.messages', children: ['consumer/RuntimeError', 'consumer/self.queue.iterator', 'consumer/message.process', 'consumer/json.loads', 'consumer/log.info', 'consumer/log.error'] },
          { parent: 'ConnectionBrokerManager.__init__', children: [] },
          { parent: 'ConnectionBrokerManager.connect', children: ['manager/aio_pika.connect_robust', 'manager/self.connection.channel', 'manager/self.channel.declare_exchange', 'manager/log.info', 'manager/ConnectionBrokerManager._create_queue', 'manager/ConnectionBrokerManager._bind_exchange_as_queue'] },
          { parent: 'ConnectionBrokerManager.close', children: ['manager/self.connection.close', 'manager/log.info'] },
          { parent: 'ConnectionBrokerManager._create_queue', children: ['manager/self.channel.declare_queue', 'manager/log.info'] },
          { parent: 'ConnectionBrokerManager._bind_exchange_as_queue', children: ['manager/queue.bind', 'manager/log.info'] },
          { parent: 'Producer.__init__', children: [] },
          { parent: 'Producer.publish', children: ['producer/encode', 'producer/json.dumps', 'producer/aio_pika.Message', 'producer/self.connection.exchange.publish', 'producer/log.info'] },
          { parent: 'AbstractStorage.upload_fileobj', children: [] },
          { parent: 'AbstractStorage.delete_file', children: [] },
          { parent: 'ObjectStorageManager.__init__', children: ['s3_manager/boto3.session.Session', 's3_manager/session.client'] },
          { parent: 'ObjectStorageManager.upload_fileobj', children: ['s3_manager/run_in_threadpool', 's3_manager/log.info', 's3_manager/log.error'] },
          { parent: 'ObjectStorageManager.delete_file', children: ['s3_manager/run_in_threadpool', 's3_manager/log.info', 's3_manager/log.error'] },
          { parent: 'AccountService.get_account_by_id', children: ['accounts/Account.get_account_by_id', 'account_service/AccountFullData.model_validate', 'account_service/log.error', 'account_service/HTTPException', 'account_service/log.error', 'account_service/type', 'account_service/str', 'account_service/HTTPException', 'account_service/type', 'account_service/str'] },
          { parent: 'AccountService.patch_account_by_id', children: ['accounts/Account.patch_account_by_id', 'account_service/AccountFullData.model_validate', 'account_service/log.error', 'account_service/HTTPException', 'account_service/log.error', 'account_service/type', 'account_service/str', 'account_service/HTTPException', 'account_service/type', 'account_service/str'] },
          { parent: 'AuthService.registration', children: ['auth_service/AuthService.hash_password', 'accounts/Account.is_login_exists', 'auth_service/log.error', 'auth_service/HTTPException', 'accounts/Account.create_account', 'auth_service/AccountCreateData', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AccountData.model_validate'] },
          { parent: 'AuthService.verify_token', children: ['auth_service/AuthService.check_access_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str'] },
          { parent: 'AuthService.check_access_token', children: ['auth_service/AuthService.decode_token', 'auth_service/datetime.now', 'auth_service/HTTPException'] },
          { parent: 'AuthService.login', children: ['accounts/Account.get_account_by_login', 'auth_service/AuthService.verify_password', 'auth_service/AccountData', 'auth_service/AuthService.encode_to_token', 'auth_service/AuthService.encode_to_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AuthResponseData'] },
          { parent: 'AuthService.refresh', children: ['auth_service/AuthService.decode_token', 'auth_service/datetime.now', 'auth_service/log.error', 'auth_service/HTTPException', 'accounts/Account.get_account_by_id', 'auth_service/HTTPException', 'auth_service/AccountData', 'auth_service/AuthService.encode_to_token', 'auth_service/AuthService.encode_to_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AuthResponseData'] },
          { parent: 'AuthService.encode_to_token', children: ['auth_service/datetime.now', 'auth_service/timedelta', 'auth_service/data.model_dump', 'auth_service/start_date.isoformat', 'auth_service/end_date.isoformat', 'auth_service/JWT.encode'] },
          { parent: 'AuthService.decode_token', children: ['auth_service/JWT.decode', 'auth_service/AccountEncodeData', 'auth_service/datetime.fromisoformat', 'auth_service/datetime.fromisoformat'] },
          { parent: 'AuthService.hash_password', children: ['auth_service/bcrypt.gensalt', 'auth_service/bcrypt.hashpw', 'auth_service/password.encode', 'auth_service/hashed.decode'] },
          { parent: 'AuthService.verify_password', children: ['auth_service/bcrypt.checkpw', 'auth_service/password.encode', 'auth_service/hashed_password.encode', 'auth_service/log.error', 'auth_service/HTTPException'] },
          { parent: 'CoreService.get_homepage', children: ['accounts/Account.get_account_by_id', 'core_service/AccountData.model_validate', 'projects/Project.get_project_list_by_account_id', 'core_service/ProjectDataLite.model_validate', 'core_service/ProjectListDataLite', 'core_service/HomePageData', 'core_service/log.error', 'core_service/type', 'core_service/str', 'core_service/HTTPException', 'core_service/type', 'core_service/str'] },
          { parent: 'ProjectService.get_project_by_id', children: ['projects/Project.get_project_by_id', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'ProjectService.create_project', children: ['projects/Project.create_project', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'ProjectService.update_project', children: ['projects/Project.patch_project_by_id', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'ProjectService.delete_project', children: ['projects/Project.delete_project', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'ProjectService.get_projects_by_account_id', children: ['projects/Project.get_project_list_by_account_id', 'project_service/ProjectDataLite.model_validate', 'project_service/ProjectListDataLite', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'TaskService.add_task', children: [] },
          { parent: 'load_config', children: ['config/Config', 'config/ConfigAuth', 'config/os.environ.get', 'config/int', 'config/int', 'config/ConfigServer', 'config/os.environ.get', 'config/int', 'config/os.environ.get', 'config/ConfigDB', 'config/os.environ.get', 'config/int', 'config/os.environ.get', 'config/lower', 'config/os.environ.get', 'config/ConfigBroker', 'config/os.environ.get', 'config/os.environ.get', 'config/os.environ.get', 'config/os.environ.get'] },
          { parent: 'create_logger', children: ['logger/logging.getLogger', 'logger/setLevel', 'logger/logging.Formatter', 'logger/logging.StreamHandler', 'logger/console_handler.setFormatter', 'logger/logger.addHandler'] }
        ]
      };

      // 1. Requirements
      await new Promise(r => setTimeout(r, 500));
      if (cancelled) return;
      console.log('📦 Загружаем requirements');
      setRequirements(mockData.requirements);
      setStreamStatus('streaming');
      setProgress({ total: 100, current: 10 });

      // 2. Endpoints
      await new Promise(r => setTimeout(r, 500));
      if (cancelled) return;
      console.log('🌐 Загружаем endpoints');
      setEndpoints(mockData.endpoints);
      setProgress({ total: 100, current: 15 });

      // 3. Architecture (по частям, как стрим)
      console.log(`🏗️ Загружаем архитектуру (${mockData.architecture.length} элементов)...`);
      for (let i = 0; i < mockData.architecture.length; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (cancelled) return;
        
        setArchitecture(prev => [...prev, mockData.architecture[i]]);
        
        const progressPercent = 15 + Math.floor((i / mockData.architecture.length) * 80);
        setProgress({ total: 100, current: progressPercent });
      }

      if (cancelled) return;
      console.log('✅ Все данные загружены!');
      setStreamStatus('done');
      setProgress({ total: 100, current: 100 });
    };

    _simulateStream();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Group endpoints by service/class
  const endpointsByService = useMemo(() => {
    const grouped = {};
    Object.entries(endpoints).forEach(([route, handler]) => {
      // Parse handler: "file/ClassName.method_name" or just "ClassName.method_name"
      const parts = handler.split('/');
      const lastPart = parts[parts.length - 1];
      const className = lastPart.split('.')[0];
      
      // Skip Health endpoints, main, and database-related
      if (className === 'Health' || 
          className === 'main' || 
          className === 'DataManager' || 
          className === 'DatabaseManager' ||
          lastPart.includes('database')) {
        return;
      }
      
      if (!className) return;
      if (!grouped[className]) {
        grouped[className] = [];
      }
      grouped[className].push({ route, handler });
    });
    return grouped;
  }, [endpoints]);

  // Build graph incrementally from architecture data
  useEffect(() => {
    if (architecture.length === 0) return;

    // Обрабатываем только последний элемент (новый)
    const lastArch = architecture[architecture.length - 1];
    
    const parts = lastArch.parent.split('/');
    const lastPart = parts[parts.length - 1];
    const [className, methodName] = lastPart.split('.');
    
    // Skip specific classes
    if (className === 'Health' || 
        className === 'main' || 
        className === 'DataManager' || 
        className === 'DatabaseManager' ||
        lastPart.includes('_main_') ||
        lastPart.includes('database')) {
      return;
    }
    
    if (!className) return;
    
    // Обновляем serviceMap инкрементально
    setServiceMap(prevServiceMap => {
      const newServiceMap = new Map(prevServiceMap);
      
      if (!newServiceMap.has(className)) {
        newServiceMap.set(className, {
          methods: [],
          dependencies: new Set()
        });
      }
      
      const service = newServiceMap.get(className);
      service.methods.push({ method: methodName || lastPart, children: lastArch.children });
      
      // Track dependencies
      lastArch.children.forEach(child => {
        const childParts = child.split('/');
        const childLastPart = childParts[childParts.length - 1];
        const depClass = childLastPart.split('.')[0];
        
        // Skip database and main dependencies
        if (depClass && depClass !== className && 
            depClass !== 'DataManager' && 
            depClass !== 'DatabaseManager' &&
            depClass !== 'main' &&
            !childLastPart.includes('database')) {
          service.dependencies.add(depClass);
        }
      });
      
      return newServiceMap;
    });
  }, [architecture]);
  
  // Отдельный useEffect для перестроения графа когда serviceMap обновляется
  useEffect(() => {
    if (serviceMap.size === 0) return;
    
    const newNodes = [];
    const newEdges = [];
    const nodeMap = new Map();
    
    const LAYER_WIDTH = 450;
    const NODE_HEIGHT = 100;
    const VERTICAL_SPACING = 120;
    const START_X = 100;
    const START_Y = 100;

    // Determine layers for left-to-right layout
    const layers = new Map();
    const assignLayer = (serviceName, layer = 0) => {
      if (layers.has(serviceName)) return;
      layers.set(serviceName, layer);
      
      const service = serviceMap.get(serviceName);
      if (service && service.dependencies.size > 0) {
        service.dependencies.forEach(dep => {
          if (serviceMap.has(dep)) {
            assignLayer(dep, layer + 1);
          }
        });
      }
    };

    // Assign layers
    serviceMap.forEach((_, serviceName) => assignLayer(serviceName));

    // Sort services by layer
    const layerGroups = new Map();
    layers.forEach((layer, serviceName) => {
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer).push(serviceName);
    });

    // Create nodes for each service
    layerGroups.forEach((services, layer) => {
      services.forEach((serviceName, index) => {
        const service = serviceMap.get(serviceName);
        const x = START_X + layer * LAYER_WIDTH;
        const y = START_Y + index * (NODE_HEIGHT + VERTICAL_SPACING);
        
        const nodeIdStr = `service_${serviceName}`;
        
        const node = {
          id: nodeIdStr,
          type: 'default',
          position: { x, y },
          data: { 
            label: (
              <NodeContent 
                serviceName={serviceName} 
                methodCount={service.methods.length}
              />
            ),
            serviceName,
            methodCount: service.methods.length,
          },
          style: {
            background: getServiceColor(serviceName),
            border: 'none',
            borderRadius: '12px',
            padding: '16px 20px',
            minWidth: '240px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          },
        };

        newNodes.push(node);
        nodeMap.set(serviceName, nodeIdStr);
      });
    });

    // Create edges between services
    const edgeSet = new Set();
    serviceMap.forEach((service, sourceName) => {
      const sourceId = nodeMap.get(sourceName);
      if (!sourceId) return;
      
      service.dependencies.forEach(targetName => {
        const targetId = nodeMap.get(targetName);
        if (!targetId) return;
        
        const edgeKey = `${sourceId}-${targetId}`;
        if (edgeSet.has(edgeKey)) return;
        edgeSet.add(edgeKey);
        
        newEdges.push({
          id: edgeKey,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          animated: false,
          className: 'custom-edge',
          pathOptions: { offset: 20, borderRadius: 10 },
          style: { 
            stroke: '#A0A0A0', 
            strokeWidth: 2,
            strokeOpacity: 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#A0A0A0',
            width: 20,
            height: 20,
          },
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [serviceMap]);

  // Update edge styles based on hovered node
  const styledEdges = useMemo(() => {
    if (!hoveredNode || edges.length === 0) return edges;

    return edges.map(edge => {
      const isConnected = edge.source === hoveredNode || edge.target === hoveredNode;
      return {
        ...edge,
        animated: isConnected,
        style: {
          stroke: isConnected ? '#5A6FD6' : '#A0A0A0',
          strokeWidth: isConnected ? 3 : 2,
          strokeOpacity: isConnected ? 1 : 0.3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConnected ? '#5A6FD6' : '#A0A0A0',
          width: 20,
          height: 20,
        },
      };
    });
  }, [edges, hoveredNode]);

  // Service colors inspired by the design
  const getServiceColor = (serviceName) => {
    const colors = {
      'Account': 'linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%)',
      'Project': 'linear-gradient(135deg, #6B8FE8 0%, #5A7FD8 100%)',
      'DatabaseManager': 'linear-gradient(135deg, #7BA3F2 0%, #6B93E2 100%)',
      'Core': 'linear-gradient(135deg, #8BB7FC 0%, #7BA7EC 100%)',
    };
    
    return colors[serviceName] || 'linear-gradient(135deg, #F4F6FF 0%, #E4E6EF 100%)';
  };

  // Handle node click
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Handle node hover for edge highlighting
  const onNodeMouseEnter = useCallback((event, node) => {
    setHoveredNode(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Назад к проектам
        </button>
        <div className={styles.projectInfo}>
          <h1>Project #{id} - Architecture Visualization</h1>
          <div className={styles.statusBadge}>
            {streamStatus === 'loading' && '🔄 Initializing...'}
            {streamStatus === 'streaming' && '🔄 Receiving data...'}
            {streamStatus === 'done' && '✅ Complete'}
            {streamStatus === 'connecting' && '⏳ Connecting...'}
            {streamStatus === 'error' && '❌ Error'}
          </div>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
            </span>
            <span className={styles.statLabel}>Progress</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{nodes.length}</span>
            <span className={styles.statLabel}>Services</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{edges.length}</span>
            <span className={styles.statLabel}>Connections</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.content}>
        {/* Requirements Panel */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3>📦 Requirements</h3>
          </div>
          <div className={styles.sidebarContent}>
            {requirements.length === 0 ? (
              <p className={styles.emptyState}>⏳ Loading requirements...</p>
            ) : (
              <div className={styles.requirementsList}>
                {requirements.map((req, i) => (
                  <div key={i} className={styles.requirementItem}>
                    <span className={styles.reqIcon}>📦</span>
                    <span className={styles.reqName}>{req}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Graph Visualization */}
        <main className={styles.mainContent}>
          {/* Loading State - show when loading or connecting without data */}
          {(streamStatus === 'connecting' || streamStatus === 'loading') && nodes.length === 0 && requirements.length === 0 && Object.keys(endpoints).length === 0 && (
            <div className={styles.loadingContainer}>
              <div className={styles.loadingSpinner}></div>
              <h2>Анализ архитектуры проекта...</h2>
              <p>Пожалуйста, подождите. Данные загружаются...</p>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill} 
                  style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Graph Visualization - show as soon as we have data */}
          {(requirements.length > 0 || Object.keys(endpoints).length > 0 || nodes.length > 0) && (
            <div className={styles.flowWrapper}>
              <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              fitView
              fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              elementsSelectable={true}
              nodesConnectable={false}
              nodesDraggable={true}
              zoomOnScroll={true}
              panOnScroll={false}
              preventScrolling={true}
              zoomOnDoubleClick={false}
              selectNodesOnDrag={false}
              connectionLineType="smoothstep"
              defaultEdgeOptions={{
                type: 'smoothstep',
                pathOptions: { offset: 20, borderRadius: 10 }
              }}
            >
              <Background color="#E0E0E0" gap={20} size={1} />
              <Controls className={styles.controls} />
              <MiniMap
                nodeColor={(node) => {
                  const serviceName = node.data?.serviceName || '';
                  if (serviceName.includes('Account')) return '#5A6FD6';
                  if (serviceName.includes('Project')) return '#6B8FE8';
                  if (serviceName.includes('Database')) return '#7BA3F2';
                  if (serviceName.includes('Core')) return '#8BB7FC';
                  return '#D0D4F0';
                }}
                className={styles.minimap}
              />
              
              {/* Legend Panel */}
              <Panel position="top-right" className={styles.legendPanel}>
                <div className={styles.legend}>
                  <h4>Legend</h4>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#5A6FD6' }}></div>
                    <span>Account</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#6B8FE8' }}></div>
                    <span>Project</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#7BA3F2' }}></div>
                    <span>Database</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#8BB7FC' }}></div>
                    <span>Core</span>
                  </div>
                </div>
              </Panel>

              {/* Endpoints Panel */}
              <Panel position="bottom-left" className={styles.endpointsPanel}>
                <div className={styles.endpoints}>
                  <h4>🌐 API Endpoints</h4>
                  {Object.keys(endpointsByService).length === 0 ? (
                    <p className={styles.emptyState}>⏳ Loading endpoints...</p>
                  ) : (
                    <div className={styles.endpointsList}>
                      {Object.entries(endpointsByService).map(([serviceName, eps]) => (
                        <div key={serviceName} className={styles.endpointGroup}>
                          <div className={styles.endpointServiceName}>{serviceName}</div>
                          {eps.slice(0, 3).map((ep, idx) => {
                            const [method, path] = ep.route.split(' ');
                            return (
                              <div key={idx} className={styles.endpointItem}>
                                <span className={`${styles.httpMethod} ${styles[method?.toLowerCase()]}`}>
                                  {method}
                                </span>
                                <span className={styles.endpointPath}>{path}</span>
                              </div>
                            );
                          })}
                          {eps.length > 3 && (
                            <div className={styles.endpointMore}>
                              +{eps.length - 3} more
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            </ReactFlow>
            </div>
          )}
        </main>
      </div>

      {/* Node Details Modal */}
      {selectedNode && (
        <div className={styles.detailsModal} onClick={() => setSelectedNode(null)}>
          <div className={styles.detailsContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailsHeader}>
              <h3>{selectedNode.data.serviceName}</h3>
              <button onClick={() => setSelectedNode(null)}>✕</button>
            </div>
            <div className={styles.detailsBody}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Service:</span>
                <span className={styles.detailValue}>{selectedNode.data.serviceName}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Methods:</span>
                <span className={styles.detailValue}>{selectedNode.data.methodCount}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Dependencies:</span>
                <span className={styles.detailValue}>
                  {edges.filter(e => e.source === selectedNode.id).length}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Used by:</span>
                <span className={styles.detailValue}>
                  {edges.filter(e => e.target === selectedNode.id).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

src/pages/Projects/ProjectViewArchitecture.jsx.bak
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectViewArchitecture.module.css';
import { projectsAPI } from '../../services/api';

// Memoized node content component for better performance
const NodeContent = memo(({ serviceName, methodCount }) => (
  <div className={styles.nodeContent}>
    <div className={styles.nodeName}>{serviceName}</div>
    <div className={styles.nodeInfo}>
      {methodCount} method{methodCount !== 1 ? 's' : ''}
    </div>
  </div>
));

NodeContent.displayName = 'NodeContent';

export default function ProjectViewArchitecture() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architecture, setArchitecture] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  
  const [streamStatus, setStreamStatus] = useState('connecting');
  const [progress, setProgress] = useState({ total: 100, current: 0 });
  
  // Для инкрементального построения графа
  const [serviceMap, setServiceMap] = useState(new Map());

  // Симуляция gRPC стрима с моковыми данными (пока бэкенд сломан)
  useEffect(() => {
    if (!id) {
      setStreamStatus('error');
      console.error('No project ID provided');
      return;
    }

    let cancelled = false;
    
    const _simulateStream = async () => {
      setStreamStatus('loading');
      setProgress({ total: 100, current: 5 });
      console.log('🎭 Запуск симуляции gRPC стрима...');
      
      // Mock data из grpcClient.js
      const mockData = {
        requirements: [
          'aio-pika', 'asyncpg', 'bcrypt', 'boto3', 'fastapi',
          'grpcio', 'grpcio-tools', 'pika', 'protobuf', 'pyjwt',
          'python-dotenv', 'python-multipart', 'pyyaml', 'sqlalchemy', 'uvicorn'
        ],
        endpoints: {
          'registration': 'POST /v1/auth/registration',
          'refresh': 'POST /v1/auth/refresh',
          'patch_project': 'PATCH /v1/project/{project_id}',
          'patch_account': 'PATCH /v1/account',
          'login': 'POST /v1/auth/login',
          'homepage': 'GET /v1/home',
          'get_project': 'GET /v1/project/{project_id}',
          'get_projects_list': 'GET /v1/project',
          'get_account': 'GET /v1/account',
          'delete_project': 'DELETE /v1/project/{project_id}',
          'create_project': 'POST /v1/project',
        },
        architecture: [
          { parent: 'Account.create_account', children: ['datamanager/DatabaseManager.session', 'accounts/Account', 'accounts/session.add'] },
          { parent: 'Account.get_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/session.get', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'] },
          { parent: 'Account.get_account_by_login', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute', 'accounts/where', 'accounts/select', 'accounts/result.scalar_one_or_none', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'] },
          { parent: 'Account.is_login_exists', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute', 'accounts/where', 'accounts/select', 'accounts/result.scalar_one_or_none'] },
          { parent: 'Account.patch_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/Account.get_account_by_id', 'accounts/items', 'accounts/patch_data.model_dump', 'accounts/setattr', 'accounts/session.flush'] },
          { parent: 'DataBaseException.__init__', children: ['base/__init__', 'base/super'] },
          { parent: 'DataBaseEntityNotExists.__init__', children: ['base/__init__', 'base/super'] },
          { parent: 'DatabaseManager.__init__', children: ['datamanager/create_async_engine', 'datamanager/async_sessionmaker'] },
          { parent: 'DatabaseManager.init_models', children: ['datamanager/self.engine.begin', 'datamanager/Base.metadata.tables.get', 'datamanager/conn.run_sync', 'datamanager/ValueError', 'datamanager/conn.run_sync', 'datamanager/Base.metadata.tables.get', 'datamanager/conn.run_sync', 'datamanager/ValueError', 'datamanager/conn.run_sync'] },
          { parent: 'DatabaseManager.session', children: ['datamanager/self.session_factory', 'datamanager/session.commit', 'datamanager/session.rollback', 'datamanager/DatabaseManager.close'] },
          { parent: 'DatabaseManager.close', children: ['datamanager/self.engine.dispose'] },
          { parent: 'init_db', children: ['datamanager/DatabaseManager.init_models'] },
          { parent: 'Project.create_project', children: ['datamanager/DatabaseManager.session', 'projects/Project', 'projects/session.add'] },
          { parent: 'Project.get_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/session.get', 'projects/log.error', 'projects/DataBaseEntityNotExists'] },
          { parent: 'Project.patch_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/Project.get_project_by_id', 'projects/items', 'projects/patch_data.model_dump', 'projects/setattr', 'projects/session.flush'] },
          { parent: 'Project.get_project_list_by_account_id', children: ['datamanager/DatabaseManager.session', 'projects/where', 'projects/select', 'projects/session.execute', 'projects/all', 'projects/result.scalars', 'projects/len'] },
          { parent: 'Project.delete_project', children: ['datamanager/DatabaseManager.session', 'projects/Project.get_project_by_id', 'projects/session.delete'] },
          { parent: 'get_account', children: ['account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/log.info', 'auth_service/AuthService.verify_token', 'account_service/AccountService.get_account_by_id', 'account_endpoints/log.info', 'account_endpoints/router.get'] },
          { parent: 'patch_account', children: ['account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/log.info', 'auth_service/AuthService.verify_token', 'account_service/AccountService.patch_account_by_id', 'account_endpoints/log.info', 'account_endpoints/router.patch'] },
          { parent: 'login', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.login', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
          { parent: 'refresh', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.refresh', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
          { parent: 'registration', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.registration', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
          { parent: 'homepage', children: ['core_endpoints/Depends', 'core_endpoints/Depends', 'core_endpoints/Depends', 'core_endpoints/log.info', 'auth_service/AuthService.verify_token', 'core_service/CoreService.get_homepage', 'core_endpoints/log.info', 'core_endpoints/router.get'] },
          { parent: 'get_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.get_project_by_id', 'project_endpoints/log.info', 'project_endpoints/router.get'] },
          { parent: 'create_project', children: ['project_endpoints/File', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.create_project', 'project_endpoints/ProjectCreateData', 'project_endpoints/log.info', 'project_endpoints/router.post'] },
          { parent: 'patch_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.update_project', 'project_endpoints/log.info', 'project_endpoints/router.patch'] },
          { parent: 'delete_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.delete_project', 'project_endpoints/log.info', 'project_endpoints/router.delete'] },
          { parent: 'get_projects_list', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.get_projects_by_account_id', 'project_endpoints/log.info', 'project_endpoints/router.get'] },
          { parent: 'lifespan', children: ['datamanager/DatabaseManager.init_models', 'manager/ConnectionBrokerManager.connect', 'datamanager/DatabaseManager.close', 'datamanager/DatabaseManager.close'] },
          { parent: 'TaskSession.__init__', children: ['core_server/asyncio.Queue'] },
          { parent: 'TaskSession.add_message', children: ['core_server/self.message_queue.put'] },
          { parent: 'TaskSession.get_next_message', children: ['core_server/self.message_queue.get'] },
          { parent: 'TaskSession.close', children: [] },
          { parent: 'TaskManager.__init__', children: [] },
          { parent: 'TaskManager.get_or_create_session', children: ['core_server/TaskSession'] },
          { parent: 'TaskManager.remove_session', children: [] },
          { parent: 'FrontendStreamService.__init__', children: [] },
          { parent: 'FrontendStreamService.RunAlgorithm', children: ['core_pb2_grpc/grpc.experimental.unary_stream'] },
          { parent: 'AlgorithmConnectionService.__init__', children: [] },
          { parent: 'AlgorithmConnectionService.ConnectToCore', children: ['algorithm_pb2_grpc/grpc.experimental.stream_unary'] },
          { parent: 'CoreServer.__init__', children: ['core_server/TaskManager', 'core_server/FrontendStreamService', 'core_server/AlgorithmConnectionService', 'core_server/grpc.aio.server', 'core_server/core_pb2_grpc.add_FrontendStreamServiceServicer_to_server', 'core_server/algorithm_pb2_grpc.add_AlgorithmConnectionServiceServicer_to_server', 'core_server/self.server.add_insecure_port'] },
          { parent: 'CoreServer.start', children: ['core_server/print', 'core_server/self.server.start', 'core_server/self.server.wait_for_termination'] },
          { parent: 'CoreServer.stop', children: ['core_server/print', 'core_server/list', 'core_server/self.task_manager.tasks.items', 'datamanager/DatabaseManager.close', 'core_server/self.task_manager.remove_session', 'core_server/self.server.stop'] },
          { parent: 'AlgorithmConnectionServiceStub.__init__', children: ['algorithm_pb2_grpc/channel.stream_unary'] },
          { parent: 'AlgorithmConnectionServiceServicer.ConnectToCore', children: ['algorithm_pb2_grpc/context.set_code', 'algorithm_pb2_grpc/context.set_details', 'algorithm_pb2_grpc/NotImplementedError'] },
          { parent: 'add_AlgorithmConnectionServiceServicer_to_server', children: ['algorithm_pb2_grpc/grpc.stream_unary_rpc_method_handler', 'algorithm_pb2_grpc/grpc.method_handlers_generic_handler', 'algorithm_pb2_grpc/server.add_generic_rpc_handlers', 'algorithm_pb2_grpc/server.add_registered_method_handlers'] },
          { parent: 'FrontendStreamServiceStub.__init__', children: ['core_pb2_grpc/channel.unary_stream'] },
          { parent: 'FrontendStreamServiceServicer.RunAlgorithm', children: ['core_pb2_grpc/context.set_code', 'core_pb2_grpc/context.set_details', 'core_pb2_grpc/NotImplementedError'] },
          { parent: 'add_FrontendStreamServiceServicer_to_server', children: ['core_pb2_grpc/grpc.unary_stream_rpc_method_handler', 'core_pb2_grpc/grpc.method_handlers_generic_handler', 'core_pb2_grpc/server.add_generic_rpc_handlers', 'core_pb2_grpc/server.add_registered_method_handlers'] },
          { parent: 'Consumer.__init__', children: [] },
          { parent: 'Consumer.start', children: ['consumer/self.connection.connect', 'consumer/self.connection.channel.declare_queue', 'consumer/log.info', 'consumer/self.connection.channel.set_qos', 'consumer/log.info', 'consumer/wait', 'consumer/asyncio.Event', 'consumer/log.info'] },
          { parent: 'Consumer.messages', children: ['consumer/RuntimeError', 'consumer/self.queue.iterator', 'consumer/message.process', 'consumer/json.loads', 'consumer/log.info', 'consumer/log.error'] },
          { parent: 'ConnectionBrokerManager.__init__', children: [] },
          { parent: 'ConnectionBrokerManager.connect', children: ['manager/aio_pika.connect_robust', 'manager/self.connection.channel', 'manager/self.channel.declare_exchange', 'manager/log.info', 'manager/ConnectionBrokerManager._create_queue', 'manager/ConnectionBrokerManager._bind_exchange_as_queue'] },
          { parent: 'ConnectionBrokerManager.close', children: ['manager/self.connection.close', 'manager/log.info'] },
          { parent: 'ConnectionBrokerManager._create_queue', children: ['manager/self.channel.declare_queue', 'manager/log.info'] },
          { parent: 'ConnectionBrokerManager._bind_exchange_as_queue', children: ['manager/queue.bind', 'manager/log.info'] },
          { parent: 'Producer.__init__', children: [] },
          { parent: 'Producer.publish', children: ['producer/encode', 'producer/json.dumps', 'producer/aio_pika.Message', 'producer/self.connection.exchange.publish', 'producer/log.info'] },
          { parent: 'AbstractStorage.upload_fileobj', children: [] },
          { parent: 'AbstractStorage.delete_file', children: [] },
          { parent: 'ObjectStorageManager.__init__', children: ['s3_manager/boto3.session.Session', 's3_manager/session.client'] },
          { parent: 'ObjectStorageManager.upload_fileobj', children: ['s3_manager/run_in_threadpool', 's3_manager/log.info', 's3_manager/log.error'] },
          { parent: 'ObjectStorageManager.delete_file', children: ['s3_manager/run_in_threadpool', 's3_manager/log.info', 's3_manager/log.error'] },
          { parent: 'AccountService.get_account_by_id', children: ['accounts/Account.get_account_by_id', 'account_service/AccountFullData.model_validate', 'account_service/log.error', 'account_service/HTTPException', 'account_service/log.error', 'account_service/type', 'account_service/str', 'account_service/HTTPException', 'account_service/type', 'account_service/str'] },
          { parent: 'AccountService.patch_account_by_id', children: ['accounts/Account.patch_account_by_id', 'account_service/AccountFullData.model_validate', 'account_service/log.error', 'account_service/HTTPException', 'account_service/log.error', 'account_service/type', 'account_service/str', 'account_service/HTTPException', 'account_service/type', 'account_service/str'] },
          { parent: 'AuthService.registration', children: ['auth_service/AuthService.hash_password', 'accounts/Account.is_login_exists', 'auth_service/log.error', 'auth_service/HTTPException', 'accounts/Account.create_account', 'auth_service/AccountCreateData', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AccountData.model_validate'] },
          { parent: 'AuthService.verify_token', children: ['auth_service/AuthService.check_access_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str'] },
          { parent: 'AuthService.check_access_token', children: ['auth_service/AuthService.decode_token', 'auth_service/datetime.now', 'auth_service/HTTPException'] },
          { parent: 'AuthService.login', children: ['accounts/Account.get_account_by_login', 'auth_service/AuthService.verify_password', 'auth_service/AccountData', 'auth_service/AuthService.encode_to_token', 'auth_service/AuthService.encode_to_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AuthResponseData'] },
          { parent: 'AuthService.refresh', children: ['auth_service/AuthService.decode_token', 'auth_service/datetime.now', 'auth_service/log.error', 'auth_service/HTTPException', 'accounts/Account.get_account_by_id', 'auth_service/HTTPException', 'auth_service/AccountData', 'auth_service/AuthService.encode_to_token', 'auth_service/AuthService.encode_to_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AuthResponseData'] },
          { parent: 'AuthService.encode_to_token', children: ['auth_service/datetime.now', 'auth_service/timedelta', 'auth_service/data.model_dump', 'auth_service/start_date.isoformat', 'auth_service/end_date.isoformat', 'auth_service/JWT.encode'] },
          { parent: 'AuthService.decode_token', children: ['auth_service/JWT.decode', 'auth_service/AccountEncodeData', 'auth_service/datetime.fromisoformat', 'auth_service/datetime.fromisoformat'] },
          { parent: 'AuthService.hash_password', children: ['auth_service/bcrypt.gensalt', 'auth_service/bcrypt.hashpw', 'auth_service/password.encode', 'auth_service/hashed.decode'] },
          { parent: 'AuthService.verify_password', children: ['auth_service/bcrypt.checkpw', 'auth_service/password.encode', 'auth_service/hashed_password.encode', 'auth_service/log.error', 'auth_service/HTTPException'] },
          { parent: 'CoreService.get_homepage', children: ['accounts/Account.get_account_by_id', 'core_service/AccountData.model_validate', 'projects/Project.get_project_list_by_account_id', 'core_service/ProjectDataLite.model_validate', 'core_service/ProjectListDataLite', 'core_service/HomePageData', 'core_service/log.error', 'core_service/type', 'core_service/str', 'core_service/HTTPException', 'core_service/type', 'core_service/str'] },
          { parent: 'ProjectService.get_project_by_id', children: ['projects/Project.get_project_by_id', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'ProjectService.create_project', children: ['projects/Project.create_project', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'ProjectService.update_project', children: ['projects/Project.patch_project_by_id', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'ProjectService.delete_project', children: ['projects/Project.delete_project', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'ProjectService.get_projects_by_account_id', children: ['projects/Project.get_project_list_by_account_id', 'project_service/ProjectDataLite.model_validate', 'project_service/ProjectListDataLite', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
          { parent: 'TaskService.add_task', children: [] },
          { parent: 'load_config', children: ['config/Config', 'config/ConfigAuth', 'config/os.environ.get', 'config/int', 'config/int', 'config/ConfigServer', 'config/os.environ.get', 'config/int', 'config/os.environ.get', 'config/ConfigDB', 'config/os.environ.get', 'config/int', 'config/os.environ.get', 'config/lower', 'config/os.environ.get', 'config/ConfigBroker', 'config/os.environ.get', 'config/os.environ.get', 'config/os.environ.get', 'config/os.environ.get'] },
          { parent: 'create_logger', children: ['logger/logging.getLogger', 'logger/setLevel', 'logger/logging.Formatter', 'logger/logging.StreamHandler', 'logger/console_handler.setFormatter', 'logger/logger.addHandler'] }
        ]
      };

      // 1. Requirements
      await new Promise(r => setTimeout(r, 500));
      if (cancelled) return;
      console.log('📦 Загружаем requirements');
      setRequirements(mockData.requirements);
      setStreamStatus('streaming');
      setProgress({ total: 100, current: 10 });

      // 2. Endpoints
      await new Promise(r => setTimeout(r, 500));
      if (cancelled) return;
      console.log('🌐 Загружаем endpoints');
      setEndpoints(mockData.endpoints);
      setProgress({ total: 100, current: 15 });

      // 3. Architecture (по частям, как стрим)
      console.log(`🏗️ Загружаем архитектуру (${mockData.architecture.length} элементов)...`);
      for (let i = 0; i < mockData.architecture.length; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (cancelled) return;
        
        setArchitecture(prev => [...prev, mockData.architecture[i]]);
        
        const progressPercent = 15 + Math.floor((i / mockData.architecture.length) * 80);
        setProgress({ total: 100, current: progressPercent });
      }

      if (cancelled) return;
      console.log('✅ Все данные загружены!');
      setStreamStatus('done');
      setProgress({ total: 100, current: 100 });
    };

    _simulateStream();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Group endpoints by service/class
  const endpointsByService = useMemo(() => {
    const grouped = {};
    Object.entries(endpoints).forEach(([route, handler]) => {
      // Parse handler: "file/ClassName.method_name" or just "ClassName.method_name"
      const parts = handler.split('/');
      const lastPart = parts[parts.length - 1];
      const className = lastPart.split('.')[0];
      
      // Skip Health endpoints, main, and database-related
      if (className === 'Health' || 
          className === 'main' || 
          className === 'DataManager' || 
          className === 'DatabaseManager' ||
          lastPart.includes('database')) {
        return;
      }
      
      if (!className) return;
      if (!grouped[className]) {
        grouped[className] = [];
      }
      grouped[className].push({ route, handler });
    });
    return grouped;
  }, [endpoints]);

  // Build graph incrementally from architecture data
  useEffect(() => {
    if (architecture.length === 0) return;

    // Обрабатываем только последний элемент (новый)
    const lastArch = architecture[architecture.length - 1];
    
    const parts = lastArch.parent.split('/');
    const lastPart = parts[parts.length - 1];
    const [className, methodName] = lastPart.split('.');
    
    // Skip specific classes
    if (className === 'Health' || 
        className === 'main' || 
        className === 'DataManager' || 
        className === 'DatabaseManager' ||
        lastPart.includes('_main_') ||
        lastPart.includes('database')) {
      return;
    }
    
    if (!className) return;
    
    // Обновляем serviceMap инкрементально
    setServiceMap(prevServiceMap => {
      const newServiceMap = new Map(prevServiceMap);
      
      if (!newServiceMap.has(className)) {
        newServiceMap.set(className, {
          methods: [],
          dependencies: new Set()
        });
      }
      
      const service = newServiceMap.get(className);
      service.methods.push({ method: methodName || lastPart, children: lastArch.children });
      
      // Track dependencies
      lastArch.children.forEach(child => {
        const childParts = child.split('/');
        const childLastPart = childParts[childParts.length - 1];
        const depClass = childLastPart.split('.')[0];
        
        // Skip database and main dependencies
        if (depClass && depClass !== className && 
            depClass !== 'DataManager' && 
            depClass !== 'DatabaseManager' &&
            depClass !== 'main' &&
            !childLastPart.includes('database')) {
          service.dependencies.add(depClass);
        }
      });
      
      return newServiceMap;
    });
  }, [architecture]);
  
  // Отдельный useEffect для перестроения графа когда serviceMap обновляется
  useEffect(() => {
    if (serviceMap.size === 0) return;
    
    const newNodes = [];
    const newEdges = [];
    const nodeMap = new Map();
    
    const LAYER_WIDTH = 450;
    const NODE_HEIGHT = 100;
    const VERTICAL_SPACING = 120;
    const START_X = 100;
    const START_Y = 100;

    // Determine layers for left-to-right layout
    const layers = new Map();
    const assignLayer = (serviceName, layer = 0) => {
      if (layers.has(serviceName)) return;
      layers.set(serviceName, layer);
      
      const service = serviceMap.get(serviceName);
      if (service && service.dependencies.size > 0) {
        service.dependencies.forEach(dep => {
          if (serviceMap.has(dep)) {
            assignLayer(dep, layer + 1);
          }
        });
      }
    };

    // Assign layers
    serviceMap.forEach((_, serviceName) => assignLayer(serviceName));

    // Sort services by layer
    const layerGroups = new Map();
    layers.forEach((layer, serviceName) => {
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer).push(serviceName);
    });

    // Create nodes for each service
    layerGroups.forEach((services, layer) => {
      services.forEach((serviceName, index) => {
        const service = serviceMap.get(serviceName);
        const x = START_X + layer * LAYER_WIDTH;
        const y = START_Y + index * (NODE_HEIGHT + VERTICAL_SPACING);
        
        const nodeIdStr = `service_${serviceName}`;
        
        const node = {
          id: nodeIdStr,
          type: 'default',
          position: { x, y },
          data: { 
            label: (
              <NodeContent 
                serviceName={serviceName} 
                methodCount={service.methods.length}
              />
            ),
            serviceName,
            methodCount: service.methods.length,
          },
          style: {
            background: getServiceColor(serviceName),
            border: 'none',
            borderRadius: '12px',
            padding: '16px 20px',
            minWidth: '240px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          },
        };

        newNodes.push(node);
        nodeMap.set(serviceName, nodeIdStr);
      });
    });

    // Create edges between services
    const edgeSet = new Set();
    serviceMap.forEach((service, sourceName) => {
      const sourceId = nodeMap.get(sourceName);
      if (!sourceId) return;
      
      service.dependencies.forEach(targetName => {
        const targetId = nodeMap.get(targetName);
        if (!targetId) return;
        
        const edgeKey = `${sourceId}-${targetId}`;
        if (edgeSet.has(edgeKey)) return;
        edgeSet.add(edgeKey);
        
        newEdges.push({
          id: edgeKey,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          animated: false,
          className: 'custom-edge',
          pathOptions: { offset: 20, borderRadius: 10 },
          style: { 
            stroke: '#A0A0A0', 
            strokeWidth: 2,
            strokeOpacity: 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#A0A0A0',
            width: 20,
            height: 20,
          },
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [serviceMap]);

  // Update edge styles based on hovered node
  const styledEdges = useMemo(() => {
    if (!hoveredNode || edges.length === 0) return edges;

    return edges.map(edge => {
      const isConnected = edge.source === hoveredNode || edge.target === hoveredNode;
      return {
        ...edge,
        animated: isConnected,
        style: {
          stroke: isConnected ? '#5A6FD6' : '#A0A0A0',
          strokeWidth: isConnected ? 3 : 2,
          strokeOpacity: isConnected ? 1 : 0.3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConnected ? '#5A6FD6' : '#A0A0A0',
          width: 20,
          height: 20,
        },
      };
    });
  }, [edges, hoveredNode]);

  // Service colors inspired by the design
  const getServiceColor = (serviceName) => {
    const colors = {
      'Account': 'linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%)',
      'Project': 'linear-gradient(135deg, #6B8FE8 0%, #5A7FD8 100%)',
      'DatabaseManager': 'linear-gradient(135deg, #7BA3F2 0%, #6B93E2 100%)',
      'Core': 'linear-gradient(135deg, #8BB7FC 0%, #7BA7EC 100%)',
    };
    
    return colors[serviceName] || 'linear-gradient(135deg, #F4F6FF 0%, #E4E6EF 100%)';
  };

  // Handle node click
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Handle node hover for edge highlighting
  const onNodeMouseEnter = useCallback((event, node) => {
    setHoveredNode(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Назад к проектам
        </button>
        <div className={styles.projectInfo}>
          <h1>Project #{id} - Architecture Visualization</h1>
          <div className={styles.statusBadge}>
            {streamStatus === 'loading' && '🔄 Initializing...'}
            {streamStatus === 'streaming' && '🔄 Receiving data...'}
            {streamStatus === 'done' && '✅ Complete'}
            {streamStatus === 'connecting' && '⏳ Connecting...'}
            {streamStatus === 'error' && '❌ Error'}
          </div>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
            </span>
            <span className={styles.statLabel}>Progress</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{nodes.length}</span>
            <span className={styles.statLabel}>Services</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{edges.length}</span>
            <span className={styles.statLabel}>Connections</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.content}>
        {/* Requirements Panel */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3>📦 Requirements</h3>
          </div>
          <div className={styles.sidebarContent}>
            {requirements.length === 0 ? (
              <p className={styles.emptyState}>⏳ Loading requirements...</p>
            ) : (
              <div className={styles.requirementsList}>
                {requirements.map((req, i) => (
                  <div key={i} className={styles.requirementItem}>
                    <span className={styles.reqIcon}>📦</span>
                    <span className={styles.reqName}>{req}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Graph Visualization */}
        <main className={styles.mainContent}>
          {/* Loading State - show when loading or connecting without data */}
          {(streamStatus === 'connecting' || streamStatus === 'loading') && nodes.length === 0 && requirements.length === 0 && Object.keys(endpoints).length === 0 && (
            <div className={styles.loadingContainer}>
              <div className={styles.loadingSpinner}></div>
              <h2>Анализ архитектуры проекта...</h2>
              <p>Пожалуйста, подождите. Данные загружаются...</p>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill} 
                  style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Graph Visualization - show as soon as we have data */}
          {(requirements.length > 0 || Object.keys(endpoints).length > 0 || nodes.length > 0) && (
            <div className={styles.flowWrapper}>
              <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              fitView
              fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              elementsSelectable={true}
              nodesConnectable={false}
              nodesDraggable={true}
              zoomOnScroll={true}
              panOnScroll={false}
              preventScrolling={true}
              zoomOnDoubleClick={false}
              selectNodesOnDrag={false}
              connectionLineType="smoothstep"
              defaultEdgeOptions={{
                type: 'smoothstep',
                pathOptions: { offset: 20, borderRadius: 10 }
              }}
            >
              <Background color="#E0E0E0" gap={20} size={1} />
              <Controls className={styles.controls} />
              <MiniMap
                nodeColor={(node) => {
                  const serviceName = node.data?.serviceName || '';
                  if (serviceName.includes('Account')) return '#5A6FD6';
                  if (serviceName.includes('Project')) return '#6B8FE8';
                  if (serviceName.includes('Database')) return '#7BA3F2';
                  if (serviceName.includes('Core')) return '#8BB7FC';
                  return '#D0D4F0';
                }}
                className={styles.minimap}
              />
              
              {/* Legend Panel */}
              <Panel position="top-right" className={styles.legendPanel}>
                <div className={styles.legend}>
                  <h4>Legend</h4>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#5A6FD6' }}></div>
                    <span>Account</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#6B8FE8' }}></div>
                    <span>Project</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#7BA3F2' }}></div>
                    <span>Database</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#8BB7FC' }}></div>
                    <span>Core</span>
                  </div>
                </div>
              </Panel>

              {/* Endpoints Panel */}
              <Panel position="bottom-left" className={styles.endpointsPanel}>
                <div className={styles.endpoints}>
                  <h4>🌐 API Endpoints</h4>
                  {Object.keys(endpointsByService).length === 0 ? (
                    <p className={styles.emptyState}>⏳ Loading endpoints...</p>
                  ) : (
                    <div className={styles.endpointsList}>
                      {Object.entries(endpointsByService).map(([serviceName, eps]) => (
                        <div key={serviceName} className={styles.endpointGroup}>
                          <div className={styles.endpointServiceName}>{serviceName}</div>
                          {eps.slice(0, 3).map((ep, idx) => {
                            const [method, path] = ep.route.split(' ');
                            return (
                              <div key={idx} className={styles.endpointItem}>
                                <span className={`${styles.httpMethod} ${styles[method?.toLowerCase()]}`}>
                                  {method}
                                </span>
                                <span className={styles.endpointPath}>{path}</span>
                              </div>
                            );
                          })}
                          {eps.length > 3 && (
                            <div className={styles.endpointMore}>
                              +{eps.length - 3} more
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            </ReactFlow>
            </div>
          )}
        </main>
      </div>

      {/* Node Details Modal */}
      {selectedNode && (
        <div className={styles.detailsModal} onClick={() => setSelectedNode(null)}>
          <div className={styles.detailsContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailsHeader}>
              <h3>{selectedNode.data.serviceName}</h3>
              <button onClick={() => setSelectedNode(null)}>✕</button>
            </div>
            <div className={styles.detailsBody}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Service:</span>
                <span className={styles.detailValue}>{selectedNode.data.serviceName}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Methods:</span>
                <span className={styles.detailValue}>{selectedNode.data.methodCount}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Dependencies:</span>
                <span className={styles.detailValue}>
                  {edges.filter(e => e.source === selectedNode.id).length}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Used by:</span>
                <span className={styles.detailValue}>
                  {edges.filter(e => e.target === selectedNode.id).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

src/pages/Projects/ProjectViewArchitecture.module.css
/* Architecture Visualization - Inspired by Graphviz design */

.container {
    min-height: 100vh;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    display: flex;
    flex-direction: column;
}

/* Header */
.header {
    background: var(--surface);
    padding: 20px 40px;
    display: flex;
    align-items: center;
    gap: 30px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    z-index: 100;
}

.backBtn {
    padding: 10px 20px;
    background: linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.backBtn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(90, 111, 214, 0.3);
}

.projectInfo {
    flex: 1;
}

.projectInfo h1 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
}

.statusBadge {
    display: inline-block;
    padding: 4px 12px;
    background: #f0f4ff;
    color: #5A6FD6;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
}

.stats {
    display: flex;
    gap: 30px;
}

.stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.statValue {
    font-size: 28px;
    font-weight: 700;
    color: #5A6FD6;
}

.statLabel {
    font-size: 11px;
    color: var(--text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
}

/* Main Content */
.content {
    display: flex;
    flex: 1;
    gap: 20px;
    padding: 20px;
    overflow: hidden;
}

/* Requirements Sidebar */
.sidebar {
    width: 280px;
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.sidebarHeader {
    padding: 16px 20px;
    border-bottom: 2px solid #f0f4ff;
    background: linear-gradient(135deg, #f0f4ff 0%, #fafbff 100%);
}

.sidebarHeader h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
}

.sidebarContent {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

.emptyState {
    text-align: center;
    color: #a0aec0;
    font-size: 13px;
    padding: 40px 20px;
}

/* Requirements List */
.requirementsList {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.requirementItem {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #fafbff;
    border: 1px solid var(--border);
    border-radius: 8px;
    transition: all 0.2s ease;
    animation: slideIn 0.3s ease;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-10px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.requirementItem:hover {
    background: var(--surface);
    border-color: #5A6FD6;
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(90, 111, 214, 0.15);
}

.reqIcon {
    font-size: 16px;
    flex-shrink: 0;
}

.reqName {
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;
    font-family: 'Courier New', monospace;
}

/* Main Visualization Area */
.mainContent {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.flowWrapper {
    flex: 1;
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    /* Performance optimizations */
    transform: translateZ(0);
    will-change: transform;
    contain: layout style paint;
}

/* Node Content */
.nodeContent {
    text-align: center;
    color: white;
    /* Performance optimizations */
    transform: translateZ(0);
    backface-visibility: hidden;
}

.nodeName {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 6px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.nodeInfo {
    font-size: 11px;
    opacity: 0.9;
    font-weight: 500;
}

/* Legend Panel */
.legendPanel {
    margin: 16px;
}

.legend {
    background: var(--surface);
    padding: 16px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    min-width: 160px;
    border: 2px solid #D0D4F0;
}

.legend h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
}

.legendItem {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
}

.legendItem:last-child {
    margin-bottom: 0;
}

.legendColor {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    flex-shrink: 0;
}

/* Endpoints Panel */
.endpointsPanel {
    margin: 16px;
    max-width: 400px;
}

.endpoints {
    background: var(--surface);
    padding: 16px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    border: 2px solid #D0D4F0;
    max-height: 400px;
    overflow-y: auto;
}

.endpoints h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
}

.endpointsList {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.endpointGroup {
    background: #fafbff;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
}

.endpointServiceName {
    font-size: 13px;
    font-weight: 700;
    color: #5A6FD6;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
}

.endpointItem {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 12px;
}

.httpMethod {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: white;
    min-width: 50px;
    text-align: center;
    flex-shrink: 0;
}

.httpMethod.get {
    background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
}

.httpMethod.post {
    background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
}

.httpMethod.put {
    background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%);
}

.httpMethod.delete {
    background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
}

.endpointPath {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.endpointMore {
    font-size: 11px;
    color: #a0aec0;
    font-style: italic;
    text-align: center;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
}

/* Node Details Modal */
.detailsModal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

.detailsContent {
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    min-width: 400px;
    max-width: 600px;
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.detailsHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 2px solid #f0f4ff;
    background: linear-gradient(135deg, #f0f4ff 0%, #fafbff 100%);
    border-radius: 12px 12px 0 0;
}

.detailsHeader h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
}

.detailsHeader button {
    background: none;
    border: none;
    font-size: 24px;
    color: #a0aec0;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: all 0.2s ease;
}

.detailsHeader button:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text-primary);
}

.detailsBody {
    padding: 24px;
}

.detailItem {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid #f0f4ff;
}

.detailItem:last-child {
    border-bottom: none;
}

.detailLabel {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-subtle);
}

.detailValue {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
}

/* React Flow Customization */
:global(.react-flow__node) {
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    z-index: 10 !important;
    /* Hardware acceleration */
    transform: translateZ(0);
    will-change: transform;
    backface-visibility: hidden;
}

:global(.react-flow__node:hover) {
    transform: scale(1.05) translateZ(0);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2) !important;
    z-index: 15 !important;
}

:global(.react-flow__node.selected) {
    box-shadow: 0 0 0 3px rgba(90, 111, 214, 0.4) !important;
    z-index: 15 !important;
}

:global(.react-flow__edges) {
    z-index: 5 !important;
}

:global(.react-flow__edge) {
    z-index: 5 !important;
    pointer-events: all;
}

:global(.react-flow__edge-path) {
    transition: stroke 0.3s ease, stroke-width 0.3s ease, stroke-opacity 0.3s ease;
    z-index: 5 !important;
    stroke-opacity: inherit !important;
}

:global(.react-flow__edge:hover) {
    z-index: 8 !important;
}

:global(.react-flow__edge:hover .react-flow__edge-path) {
    stroke-width: 3px !important;
}

:global(.react-flow__edge-textwrapper),
:global(.react-flow__edge-text) {
    transition: opacity 0.3s ease;
}

:global(.react-flow__controls) {
    background: var(--surface);
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    border: 2px solid #D0D4F0;
}

:global(.react-flow__controls-button) {
    background: var(--surface);
    border: none;
    border-bottom: 1px solid var(--border);
    transition: all 0.2s ease;
}

:global(.react-flow__controls-button:hover) {
    background: #f0f4ff;
}

:global(.react-flow__controls-button svg) {
    fill: #5A6FD6;
}

:global(.react-flow__minimap) {
    border-radius: 8px;
    border: 2px solid #D0D4F0;
    background: var(--surface);
    overflow: hidden;
}

/* Scrollbar styling */
.sidebarContent::-webkit-scrollbar,
.endpoints::-webkit-scrollbar {
    width: 6px;
}

.sidebarContent::-webkit-scrollbar-track,
.endpoints::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
}

.sidebarContent::-webkit-scrollbar-thumb,
.endpoints::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%);
    border-radius: 10px;
}

.sidebarContent::-webkit-scrollbar-thumb:hover,
.endpoints::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #4A5FC6 0%, #3A4FB6 100%);
}

/* Responsive Design */
@media (max-width: 1200px) {
    .content {
        flex-direction: column;
    }

    .sidebar {
        width: 100%;
        max-height: 250px;
    }

    .endpointsPanel {
        max-width: none;
    }

    .endpoints {
        max-height: 200px;
    }
}

@media (max-width: 768px) {
    .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 15px;
    }

    .stats {
        width: 100%;
        justify-content: space-around;
    }

    .detailsContent {
        min-width: auto;
        width: 90%;
        margin: 20px;
    }
}

/* Loading Container */
.loadingContainer {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 500px;
    gap: 20px;
    padding: 40px;
    text-align: center;
}

.loadingSpinner {
    width: 60px;
    height: 60px;
    border: 4px solid rgba(90, 111, 214, 0.2);
    border-top-color: #5A6FD6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.loadingContainer h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
}

.loadingContainer p {
    margin: 0;
    font-size: 16px;
    color: var(--text-subtle);
}

.progressBar {
    width: 100%;
    max-width: 400px;
    height: 8px;
    background: rgba(90, 111, 214, 0.1);
    border-radius: 4px;
    overflow: hidden;
}

.progressFill {
    height: 100%;
    background: linear-gradient(90deg, #5A6FD6 0%, #6B8FE8 100%);
    border-radius: 4px;
    transition: width 0.3s ease;
}

src/pages/Projects/ProjectViewDetailed.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectViewDetailed.module.css';

export default function ProjectViewDetailed() {
  const navigate = useNavigate();
  const [selectedSection, setSelectedSection] = useState('architecture');

  // Данные парсинга проекта
  const projectData = {
    name: "Backend API Service",
    taskId: 987,
    requirements: {
      total: 15,
      list: [
        "aio-pika", "asyncpg", "bcrypt", "boto3", "fastapi",
        "grpcio", "grpcio-tools", "pika", "protobuf", "pyjwt",
        "python-dotenv", "python-multipart", "pyyaml", "sqlalchemy", "uvicorn"
      ]
    },
    endpoints: {
      total: 11,
      list: [
        { key: "registration", value: "POST /v1/auth/registration" },
        { key: "login", value: "POST /v1/auth/login" },
        { key: "refresh", value: "POST /v1/auth/refresh" },
        { key: "get_account", value: "GET /v1/account" },
        { key: "patch_account", value: "PATCH /v1/account" },
        { key: "get_projects_list", value: "GET /v1/project" },
        { key: "create_project", value: "POST /v1/project" },
        { key: "get_project", value: "GET /v1/project/{project_id}" },
        { key: "patch_project", value: "PATCH /v1/project/{project_id}" },
        { key: "delete_project", value: "DELETE /v1/project/{project_id}" },
        { key: "homepage", value: "GET /v1/home" },
      ]
    }
  };

  // Структура папок и модулей
  const folderStructure = [
    {
      name: "accounts",
      icon: "📁",
      files: [
        { name: "Account.py", icon: "🐍", type: "model" },
        { name: "__init__.py", icon: "📄", type: "init" },
      ]
    },
    {
      name: "datamanager",
      icon: "📁",
      files: [
        { name: "DatabaseManager.py", icon: "🐍", type: "manager" },
        { name: "__init__.py", icon: "📄", type: "init" },
      ]
    },
    {
      name: "services",
      icon: "📁",
      files: [
        { name: "auth_service.py", icon: "🐍", type: "service" },
        { name: "project_service.py", icon: "🐍", type: "service" },
        { name: "__init__.py", icon: "📄", type: "init" },
      ]
    },
    {
      name: "endpoints",
      icon: "📁",
      files: [
        { name: "auth.py", icon: "🌐", type: "endpoint" },
        { name: "projects.py", icon: "🌐", type: "endpoint" },
        { name: "accounts.py", icon: "🌐", type: "endpoint" },
      ]
    },
  ];

  // Граф архитектуры на основе данных парсинга
  const architectureNodes = [
    // Account methods
    {
      id: 'create_account',
      data: { label: <div><strong>create_account</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 50 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },
    {
      id: 'get_account_by_id',
      data: { label: <div><strong>get_account_by_id</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 150 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },
    {
      id: 'get_account_by_login',
      data: { label: <div><strong>get_account_by_login</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 250 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },
    {
      id: 'is_login_exists',
      data: { label: <div><strong>is_login_exists</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 350 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },
    {
      id: 'patch_account',
      data: { label: <div><strong>patch_account_by_id</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 450 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },

    // DatabaseManager
    {
      id: 'db_session',
      data: { label: <div><strong>session</strong><div style={{fontSize: '10px', opacity: 0.8}}>DatabaseManager</div></div> },
      position: { x: 350, y: 200 },
      style: { background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 160 }
    },

    // Database operations
    {
      id: 'session_add',
      data: { label: <div><strong>session.add</strong><div style={{fontSize: '10px', opacity: 0.8}}>SQLAlchemy</div></div> },
      position: { x: 600, y: 50 },
      style: { background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },
    {
      id: 'session_get',
      data: { label: <div><strong>session.get</strong><div style={{fontSize: '10px', opacity: 0.8}}>SQLAlchemy</div></div> },
      position: { x: 600, y: 120 },
      style: { background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },
    {
      id: 'session_execute',
      data: { label: <div><strong>session.execute</strong><div style={{fontSize: '10px', opacity: 0.8}}>SQLAlchemy</div></div> },
      position: { x: 600, y: 220 },
      style: { background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },
    {
      id: 'session_flush',
      data: { label: <div><strong>session.flush</strong><div style={{fontSize: '10px', opacity: 0.8}}>SQLAlchemy</div></div> },
      position: { x: 600, y: 450 },
      style: { background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },

    // Query operations
    {
      id: 'select',
      data: { label: 'select' },
      position: { x: 820, y: 240 },
      style: { background: '#ed8936', color: 'white', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '12px' }
    },
    {
      id: 'where',
      data: { label: 'where' },
      position: { x: 820, y: 290 },
      style: { background: '#ed8936', color: 'white', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '12px' }
    },

    // Logging
    {
      id: 'log_error',
      data: { label: <div><strong>log.error</strong><div style={{fontSize: '10px', opacity: 0.8}}>Logger</div></div> },
      position: { x: 350, y: 400 },
      style: { background: 'linear-gradient(135deg, #a0aec0 0%, #718096 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 120 }
    },

    // Exceptions
    {
      id: 'db_exception',
      data: { label: <div><strong>DataBaseEntityNotExists</strong><div style={{fontSize: '10px', opacity: 0.8}}>Exception</div></div> },
      position: { x: 600, y: 380 },
      style: { background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },
  ];

  const architectureEdges = [
    // create_account connections
    { id: 'e1', source: 'create_account', target: 'db_session', label: 'uses', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e2', source: 'create_account', target: 'session_add', label: 'add', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },

    // get_account_by_id connections
    { id: 'e3', source: 'get_account_by_id', target: 'db_session', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e4', source: 'get_account_by_id', target: 'session_get', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e5', source: 'get_account_by_id', target: 'log_error', label: 'on error', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f56565', strokeWidth: 1, strokeDasharray: '5,5' } },
    { id: 'e6', source: 'get_account_by_id', target: 'db_exception', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f56565', strokeWidth: 1, strokeDasharray: '5,5' } },

    // get_account_by_login connections
    { id: 'e7', source: 'get_account_by_login', target: 'db_session', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e8', source: 'get_account_by_login', target: 'session_execute', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e9', source: 'session_execute', target: 'select', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#4299e1', strokeWidth: 1.5 } },
    { id: 'e10', source: 'session_execute', target: 'where', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#4299e1', strokeWidth: 1.5 } },
    { id: 'e11', source: 'get_account_by_login', target: 'log_error', label: 'on error', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f56565', strokeWidth: 1, strokeDasharray: '5,5' } },
    { id: 'e12', source: 'get_account_by_login', target: 'db_exception', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f56565', strokeWidth: 1, strokeDasharray: '5,5' } },

    // is_login_exists connections
    { id: 'e13', source: 'is_login_exists', target: 'db_session', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e14', source: 'is_login_exists', target: 'session_execute', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },

    // patch_account connections
    { id: 'e15', source: 'patch_account', target: 'db_session', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e16', source: 'patch_account', target: 'get_account_by_id', label: 'calls', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#9f7aea', strokeWidth: 2 } },
    { id: 'e17', source: 'patch_account', target: 'session_flush', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/projects')}>
          ← Назад
        </button>
        <div className={styles.projectInfo}>
          <h1>{projectData.name}</h1>
          <p>Task ID: {projectData.taskId}</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Requirements</span>
            <span className={styles.statValue}>{projectData.requirements.total}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Endpoints</span>
            <span className={styles.statValue}>{projectData.endpoints.total}</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {/* Sidebar - Folder Structure */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3>📂 Project Structure</h3>
          </div>

          {/* Sections Tabs */}
          <div className={styles.tabs}>
            <button 
              className={`${styles.tab} ${selectedSection === 'structure' ? styles.tabActive : ''}`}
              onClick={() => setSelectedSection('structure')}
            >
              📁 Files
            </button>
            <button 
              className={`${styles.tab} ${selectedSection === 'requirements' ? styles.tabActive : ''}`}
              onClick={() => setSelectedSection('requirements')}
            >
              📦 Requirements
            </button>
            <button 
              className={`${styles.tab} ${selectedSection === 'endpoints' ? styles.tabActive : ''}`}
              onClick={() => setSelectedSection('endpoints')}
            >
              🌐 Endpoints
            </button>
            <button 
              className={`${styles.tab} ${selectedSection === 'architecture' ? styles.tabActive : ''}`}
              onClick={() => setSelectedSection('architecture')}
            >
              🏗️ Architecture
            </button>
          </div>

          {/* Content based on selected section */}
          <div className={styles.sidebarContent}>
            {selectedSection === 'structure' && (
              <div className={styles.folderStructure}>
                {folderStructure.map((folder, idx) => (
                  <div key={idx} className={styles.folder}>
                    <div className={styles.folderName}>
                      <span>{folder.icon}</span>
                      <span>{folder.name}/</span>
                    </div>
                    <div className={styles.files}>
                      {folder.files.map((file, fidx) => (
                        <div key={fidx} className={styles.file}>
                          <span>{file.icon}</span>
                          <span>{file.name}</span>
                          <span className={styles.fileType}>{file.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedSection === 'requirements' && (
              <div className={styles.requirementsList}>
                <div className={styles.listHeader}>
                  <strong>Total: {projectData.requirements.total}</strong>
                </div>
                {projectData.requirements.list.map((req, idx) => (
                  <div key={idx} className={styles.requirementItem}>
                    <span className={styles.reqIcon}>📦</span>
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedSection === 'endpoints' && (
              <div className={styles.endpointsList}>
                <div className={styles.listHeader}>
                  <strong>Total: {projectData.endpoints.total}</strong>
                </div>
                {projectData.endpoints.list.map((endpoint, idx) => (
                  <div key={idx} className={styles.endpointItem}>
                    <div className={styles.endpointMethod}>
                      {endpoint.value.split(' ')[0]}
                    </div>
                    <div className={styles.endpointPath}>
                      {endpoint.value.split(' ')[1]}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedSection === 'architecture' && (
              <div className={styles.architectureInfo}>
                <div className={styles.infoBlock}>
                  <h4>🟣 Methods</h4>
                  <p>Parent functions/methods</p>
                </div>
                <div className={styles.infoBlock}>
                  <h4>🟢 Database</h4>
                  <p>DatabaseManager sessions</p>
                </div>
                <div className={styles.infoBlock}>
                  <h4>🔵 Operations</h4>
                  <p>SQLAlchemy operations</p>
                </div>
                <div className={styles.infoBlock}>
                  <h4>🟠 Queries</h4>
                  <p>Select, where clauses</p>
                </div>
                <div className={styles.infoBlock}>
                  <h4>⚪ Utils</h4>
                  <p>Logging, exceptions</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content - Flow Diagram */}
        <main className={styles.mainContent}>
          <div className={styles.flowWrapper}>
            <ReactFlow
              nodes={architectureNodes}
              edges={architectureEdges}
              fitView
              fitViewOptions={{ padding: 0.1 }}
              minZoom={0.1}
              maxZoom={2}
              defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e0e0e0" gap={16} />
              <Controls />
            </ReactFlow>
          </div>
        </main>
      </div>
    </div>
  );
}

src/pages/Projects/ProjectViewDetailed.module.css
.container {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    flex-direction: column;
}

.header {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    padding: 20px 40px;
    display: flex;
    align-items: center;
    gap: 30px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.backBtn {
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.backBtn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.projectInfo {
    flex: 1;
}

.projectInfo h1 {
    margin: 0 0 5px 0;
    font-size: 24px;
    color: var(--text-primary);
}

.projectInfo p {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
}

.stats {
    display: flex;
    gap: 30px;
}

.stat {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.statLabel {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.statValue {
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.content {
    display: flex;
    flex: 1;
    gap: 20px;
    padding: 20px;
    overflow: hidden;
}

/* Sidebar */
.sidebar {
    width: 320px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.sidebarHeader {
    padding: 20px;
    border-bottom: 2px solid var(--border);
}

.sidebarHeader h3 {
    margin: 0;
    font-size: 18px;
    color: var(--text-primary);
}

.tabs {
    display: flex;
    flex-direction: column;
    padding: 10px;
    gap: 5px;
    border-bottom: 2px solid var(--border);
}

.tab {
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-radius: 8px;
    text-align: left;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
}

.tab:hover {
    background: #f7fafc;
    color: var(--text-primary);
}

.tabActive {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    color: white !important;
}

.sidebarContent {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

/* Folder Structure */
.folderStructure {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.folder {
    background: #f7fafc;
    border-radius: 8px;
    padding: 10px;
}

.folderName {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
    font-size: 14px;
}

.files {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 20px;
}

.file {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--surface);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-muted);
    transition: all 0.2s ease;
}

.file:hover {
    background: #edf2f7;
    transform: translateX(4px);
}

.fileType {
    margin-left: auto;
    font-size: 10px;
    padding: 2px 8px;
    background: var(--border);
    border-radius: 4px;
    color: #667eea;
    font-weight: 600;
}

/* Requirements List */
.requirementsList,
.endpointsList {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.listHeader {
    padding: 10px;
    background: #f7fafc;
    border-radius: 8px;
    margin-bottom: 8px;
    color: var(--text-primary);
    font-size: 13px;
}

.requirementItem {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-primary);
    transition: all 0.2s ease;
}

.requirementItem:hover {
    border-color: #667eea;
    transform: translateX(4px);
}

.reqIcon {
    font-size: 16px;
}

/* Endpoints List */
.endpointItem {
    padding: 12px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    transition: all 0.2s ease;
}

.endpointItem:hover {
    border-color: #667eea;
    transform: translateX(4px);
}

.endpointMethod {
    display: inline-block;
    padding: 4px 10px;
    background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
    color: white;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 6px;
}

.endpointPath {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: var(--text-muted);
}

/* Architecture Info */
.architectureInfo {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.infoBlock {
    padding: 12px;
    background: var(--surface);
    border-left: 4px solid #667eea;
    border-radius: 8px;
}

.infoBlock h4 {
    margin: 0 0 6px 0;
    font-size: 14px;
    color: var(--text-primary);
}

.infoBlock p {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
}

/* Main Content */
.mainContent {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.flowWrapper {
    flex: 1;
    background: var(--surface);
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    overflow: hidden;
}

/* React Flow Customization */
:global(.react-flow__node) {
    cursor: pointer;
}

:global(.react-flow__node:hover) {
    filter: brightness(1.1);
}

:global(.react-flow__edge-text) {
    font-size: 11px;
    font-weight: 600;
}

:global(.react-flow__controls) {
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border: none;
}

:global(.react-flow__controls-button) {
    background: var(--surface);
    border: none;
    border-bottom: 1px solid #e0e0e0;
}

:global(.react-flow__controls-button:hover) {
    background: #f7fafc;
}

:global(.react-flow__controls-button svg) {
    fill: #667eea;
}

/* Responsive */
@media (max-width: 1024px) {
    .content {
        flex-direction: column;
    }

    .sidebar {
        width: 100%;
        max-height: 300px;
    }

    .tabs {
        flex-direction: row;
        overflow-x: auto;
    }

    .tab {
        white-space: nowrap;
    }
}

src/pages/Projects/ProjectViewLayered.jsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectViewLayered.module.css';
import { projectsAPI } from '../../services/api';

export default function ProjectViewLayered() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  // Build layered architecture graph from data
  useEffect(() => {
    const newNodes = [];
    const newEdges = [];

    // Layer configuration (left to right)
    const LAYER_GAP = 280;
    const NODE_HEIGHT = 100;
    const START_X = 100;
    const START_Y = 80;

    // Layer 1: Main Service
    newNodes.push({
      id: 'main-service',
      type: 'default',
      position: { x: START_X, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.nodeLabel}>
            <div className={styles.nodeTitle}>Main Service</div>
          </div>
        ),
        layer: 'main',
      },
      style: {
        background: 'linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        padding: '20px 24px',
        width: 180,
        fontWeight: 'bold',
        fontSize: '16px',
        boxShadow: '0 4px 12px rgba(90, 111, 214, 0.3)',
      },
    });

    // Layer 2: API Endpoints (hexagons via CSS)
    const endpoints = [
      { id: 'ep-account', label: 'GET\n/account', y: START_Y },
      { id: 'ep-projects-get', label: 'GET\n/projects', y: START_Y + 140 },
      { id: 'ep-projects-post', label: 'POST\n/projects', y: START_Y + 280 },
      { id: 'ep-projects-db', label: 'Projects\nDB', y: START_Y + 420 },
    ];

    endpoints.forEach((ep) => {
      newNodes.push({
        id: ep.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP, y: ep.y },
        data: {
          label: (
            <div className={styles.endpointLabel}>
              {ep.label.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ),
          layer: 'endpoints',
        },
        style: {
          background: 'linear-gradient(135deg, #A8C5F0 0%, #8AABDE 100%)',
          color: '#1a365d',
          border: '2px solid #5A6FD6',
          borderRadius: '8px',
          padding: '12px 16px',
          width: 120,
          fontWeight: '600',
          fontSize: '13px',
          textAlign: 'center',
          clipPath: 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)',
          boxShadow: '0 2px 8px rgba(90, 111, 214, 0.2)',
        },
      });
    });

    // Layer 3: Services
    const services = [
      { id: 'auth-service', label: 'AuthService', color: '#5A6FD6', y: START_Y - 20 },
      { id: 'account-service', label: 'Account\nService', color: '#6B8FE8', y: START_Y + 110 },
      { id: 'core-service', label: 'CoreService', color: '#7BA3F2', y: START_Y + 240 },
      { id: 'services', label: 'Services', color: '#8BB7FC', y: START_Y + 370 },
    ];

    services.forEach((svc) => {
      newNodes.push({
        id: svc.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2, y: svc.y },
        data: {
          label: (
            <div className={styles.serviceLabel}>
              {svc.label.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ),
          layer: 'services',
        },
        style: {
          background: `linear-gradient(135deg, ${svc.color} 0%, ${svc.color}dd 100%)`,
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          padding: '16px 20px',
          width: 160,
          fontWeight: '600',
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
        },
      });
    });

    // Layer 4: Database Manager & Databases
    newNodes.push({
      id: 'database-manager',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 3, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.dbManagerLabel}>
            <div>Database-</div>
            <div>Manager</div>
          </div>
        ),
        layer: 'database',
      },
      style: {
        background: 'linear-gradient(135deg, #8BB7FC 0%, #6B97DC 100%)',
        color: 'white',
        border: '2px solid #5A6FD6',
        borderRadius: '8px',
        padding: '18px 22px',
        width: 160,
        fontWeight: '600',
        fontSize: '14px',
        textAlign: 'center',
        boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
      },
    });

    // Databases (cylinder shape via CSS)
    const databases = [
      { id: 'accounts-db', label: 'Accounts\nDB', y: START_Y + 80 },
      { id: 'projects-db', label: 'Projects\nDB', y: START_Y + 280 },
    ];

    databases.forEach((db) => {
      newNodes.push({
        id: db.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3 + 50, y: db.y },
        data: {
          label: (
            <div className={styles.dbLabel}>
              {db.label.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ),
          layer: 'database',
          isDatabase: true,
        },
        style: {
          background: 'linear-gradient(180deg, #6B8FE8 0%, #5A7FD8 100%)',
          color: 'white',
          border: '2px solid #4A6FC6',
          borderRadius: '50px 50px 10px 10px',
          padding: '16px 20px',
          width: 120,
          fontWeight: '600',
          fontSize: '13px',
          textAlign: 'center',
          boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
          position: 'relative',
        },
        className: styles.cylinderNode,
      });
    });

    // Layer 5: Broker
    newNodes.push({
      id: 'broker',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 4 + 80, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.brokerLabel}>
            Broker
          </div>
        ),
        layer: 'broker',
      },
      style: {
        background: 'white',
        color: '#E0A04A',
        border: '3px solid #E0A04A',
        borderRadius: '50%',
        padding: '24px',
        width: 120,
        height: 120,
        fontWeight: 'bold',
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(224, 160, 74, 0.3)',
      },
    });

    // Create edges (connections)
    const connections = [
      // Main Service to Endpoints
      { source: 'main-service', target: 'ep-account' },
      { source: 'main-service', target: 'ep-projects-get' },
      { source: 'main-service', target: 'ep-projects-post' },
      { source: 'main-service', target: 'ep-projects-db' },
      
      // Endpoints to Services
      { source: 'ep-account', target: 'auth-service' },
      { source: 'ep-account', target: 'account-service' },
      { source: 'ep-projects-get', target: 'account-service' },
      { source: 'ep-projects-post', target: 'core-service' },
      { source: 'ep-projects-db', target: 'services' },
      
      // Services to Database Manager
      { source: 'auth-service', target: 'database-manager' },
      { source: 'account-service', target: 'database-manager' },
      { source: 'core-service', target: 'database-manager' },
      
      // Services to Databases
      { source: 'account-service', target: 'accounts-db' },
      { source: 'services', target: 'projects-db' },
      
      // Database Manager to Databases and Broker
      { source: 'database-manager', target: 'accounts-db' },
      { source: 'database-manager', target: 'projects-db' },
      { source: 'database-manager', target: 'broker' },
    ];

    connections.forEach((conn, idx) => {
      newEdges.push({
        id: `edge-${idx}`,
        source: conn.source,
        target: conn.target,
        type: 'smoothstep',
        animated: false,
        style: { 
          stroke: '#A0A0A0', 
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#A0A0A0',
          width: 18,
          height: 18,
        },
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, []);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className={styles.container}>
      {/* Header with layer labels */}
      <div className={styles.layerHeader}>
        <div className={styles.layerLabel} style={{ left: '100px' }}>Главный сервис</div>
        <div className={styles.layerLabel} style={{ left: '380px' }}>API endpoints</div>
        <div className={styles.layerLabel} style={{ left: '660px' }}>Сервисы</div>
        <div className={styles.layerLabel} style={{ left: '940px' }}>Базы данных</div>
        <div className={styles.layerLabel} style={{ left: '1220px' }}>Брокер сообщений</div>
      </div>

      {/* Control bar */}
      <div className={styles.controlBar}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Назад
        </button>
        <h1 className={styles.title}>Layered Architecture - Project #{id}</h1>
      </div>

      {/* Graph */}
      <div className={styles.flowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#f0f0f0" gap={20} size={1} />
          <Controls className={styles.controls} />
        </ReactFlow>
      </div>

      {/* Node details tooltip */}
      {selectedNode && (
        <div className={styles.tooltip}>
          <button className={styles.tooltipClose} onClick={() => setSelectedNode(null)}>
            ×
          </button>
          <h3>{selectedNode.data.label}</h3>
          <p><strong>Layer:</strong> {selectedNode.data.layer}</p>
          <p><strong>ID:</strong> {selectedNode.id}</p>
        </div>
      )}
    </div>
  );
}

src/pages/Projects/ProjectViewLayered.module.css
/* Layered Architecture View - Based on Screenshot Design */

.container {
    width: 100%;
    height: 100vh;
    background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf2 100%);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* Layer Header with Labels */
.layerHeader {
    position: relative;
    height: 60px;
    background: var(--surface);
    border-bottom: 2px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    z-index: 10;
}

.layerLabel {
    position: absolute;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    letter-spacing: 0.3px;
}

/* Control Bar */
.controlBar {
    background: var(--surface);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 20px;
    border-bottom: 1px solid var(--border);
    z-index: 5;
}

.backBtn {
    padding: 8px 16px;
    background: linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.backBtn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(90, 111, 214, 0.3);
}

.title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
}

/* Flow Wrapper */
.flowWrapper {
    flex: 1;
    position: relative;
    background: #fafbfc;
}

/* Node Labels */
.nodeLabel,
.endpointLabel,
.serviceLabel,
.dbManagerLabel,
.dbLabel,
.brokerLabel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.4;
    white-space: pre-line;
}

.nodeTitle {
    font-size: 16px;
    font-weight: 700;
}

.endpointLabel {
    font-size: 13px;
    line-height: 1.3;
}

.serviceLabel {
    font-size: 14px;
    line-height: 1.3;
}

.dbManagerLabel {
    font-size: 14px;
    line-height: 1.2;
}

.dbLabel {
    font-size: 13px;
    line-height: 1.3;
}

.brokerLabel {
    font-size: 16px;
    font-weight: 700;
}

/* Cylinder Database Node Effect */
.cylinderNode::before {
    content: '';
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    height: 16px;
    background: radial-gradient(ellipse at center, #7BA3F2 0%, #6B93E2 100%);
    border-radius: 50%;
    border: 2px solid #4A6FC6;
    border-bottom: none;
}

/* Tooltip */
.tooltip {
    position: fixed;
    bottom: 30px;
    right: 30px;
    background: var(--surface);
    border-radius: 10px;
    padding: 20px;
    min-width: 280px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 100;
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.tooltip h3 {
    margin: 0 0 12px 0;
    font-size: 18px;
    color: var(--text-primary);
    font-weight: 700;
}

.tooltip p {
    margin: 8px 0;
    font-size: 14px;
    color: var(--text-muted);
}

.tooltip strong {
    font-weight: 600;
    color: var(--text-primary);
}

.tooltipClose {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    font-size: 24px;
    color: #a0aec0;
    cursor: pointer;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
}

.tooltipClose:hover {
    background: #f7fafc;
    color: var(--text-primary);
}

/* React Flow Customization */
:global(.react-flow__node) {
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

:global(.react-flow__node:hover) {
    transform: scale(1.05);
}

:global(.react-flow__node.selected) {
    box-shadow: 0 0 0 3px rgba(90, 111, 214, 0.5) !important;
}

:global(.react-flow__edge-path) {
    transition: stroke-width 0.2s ease;
}

:global(.react-flow__edge:hover .react-flow__edge-path) {
    stroke-width: 3px !important;
    stroke: #667eea !important;
}

:global(.react-flow__controls) {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border);
}

:global(.react-flow__controls-button) {
    background: var(--surface);
    border: none;
    border-bottom: 1px solid var(--border);
    transition: all 0.2s ease;
}

:global(.react-flow__controls-button:last-child) {
    border-bottom: none;
}

:global(.react-flow__controls-button:hover) {
    background: #f7fafc;
}

:global(.react-flow__controls-button svg) {
    fill: #5A6FD6;
}

/* Responsive Design */
@media (max-width: 1400px) {
    .layerLabel {
        font-size: 14px;
    }
}

@media (max-width: 1024px) {
    .layerHeader {
        display: none;
    }

    .tooltip {
        bottom: 20px;
        right: 20px;
        left: 20px;
        min-width: auto;
    }
}

@media (max-width: 768px) {
    .controlBar {
        flex-direction: column;
        align-items: flex-start;
    }

    .title {
        font-size: 16px;
    }
}

src/pages/Projects/ProjectViewStream.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectViewStream.module.css';
import { projectsAPI } from '../../services/api';
import grpcClient from '../../services/grpcClient';
import { useAuth } from '../../context/AuthContext';

export default function ProjectViewStream() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architecture, setArchitecture] = useState([]);
  
  // tabs removed: we show requirements, endpoints and architecture side-by-side
  const [expandedClasses, setExpandedClasses] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  
  const [streamStatus, setStreamStatus] = useState('connecting'); // connecting, streaming, done
  const [progress, setProgress] = useState({ total: 0, current: 0 });
  const [error, setError] = useState(null);

  // Load project data from backend or stream via gRPC if architecture is missing
  useEffect(() => {
    let cancelled = false;
    let controller = null;

    const normalizeEndpoints = (raw) => {
      if (!raw) return {};
      if (Array.isArray(raw)) {
        const result = {};
        raw.forEach((entry) => {
          if (entry && typeof entry === 'object') {
            Object.entries(entry).forEach(([key, value]) => {
              result[key] = value;
            });
          }
        });
        return result;
      }
      return typeof raw === 'object' ? raw : {};
    };

    const normalizeArchitecture = (raw) => {
      if (!raw) return [];
      if (Array.isArray(raw)) {
        return raw
          .map((item) => ({
            parent: item.parent || item.name || '',
            children: Array.isArray(item.children) ? item.children : []
          }))
          .filter((item) => item.parent);
      }
      if (typeof raw === 'object') {
        return Object.entries(raw).map(([parent, children]) => ({
          parent,
          children: Array.isArray(children) ? children : (children ? Object.values(children) : [])
        }));
      }
      return [];
    };

    const loadData = async () => {
      try {
        setStreamStatus('connecting');
        setError(null);
        setProgress({ total: 0, current: 0 });

        if (!id) {
          setStreamStatus('error');
          setError('No project ID provided');
          return;
        }

        // 1) Try to load saved architecture from REST
        const res = await projectsAPI.getById(id);
        if (cancelled) return;
        const arch = res?.architecture || {};

        const reqs = Array.isArray(arch.requirements) ? arch.requirements : [];
        const eps = normalizeEndpoints(arch.endpoints);
        const archParts = normalizeArchitecture(arch.data || arch.architecture || arch.parts);

        if (reqs.length || Object.keys(eps).length || archParts.length) {
          setRequirements(reqs);
          setEndpoints(eps);
          setArchitecture(archParts);
          const totalCount = reqs.length + Object.keys(eps).length + archParts.length;
          setProgress({ total: totalCount, current: totalCount });
          setStreamStatus('done');
          return;
        }

        // 2) If nothing saved yet, stream from Core via gRPC
        if (!user?.id) {
          setStreamStatus('error');
          setError('Missing user id for gRPC call');
          return;
        }

        setStreamStatus('streaming');
        controller = await grpcClient.connectToStream(user.id, parseInt(id, 10), {
          onStart: () => {
            if (cancelled) return;
            setProgress({ total: 0, current: 0 });
          },
          onRequirements: (data) => {
            if (cancelled) return;
            const reqList = data?.requirements || [];
            setRequirements(reqList);
            setProgress((prev) => ({
              total: Math.max(prev.total, prev.current + reqList.length),
              current: prev.current + reqList.length
            }));
          },
          onEndpoints: (data) => {
            if (cancelled) return;
            const normalized = normalizeEndpoints(data?.endpoints);
            const count = Object.keys(normalized).length;
            setEndpoints(normalized);
            setProgress((prev) => ({
              total: Math.max(prev.total, prev.current + count),
              current: prev.current + count
            }));
          },
          onArchitecture: (data) => {
            if (cancelled) return;
            setArchitecture((prev) => [...prev, { parent: data.parent, children: data.children || [] }]);
            setProgress((prev) => ({
              total: Math.max(prev.total, prev.current + 1),
              current: prev.current + 1
            }));
          },
          onDone: () => {
            if (cancelled) return;
            setStreamStatus('done');
          },
          onError: (err) => {
            if (cancelled) return;
            console.error('gRPC stream error', err);
            setStreamStatus('error');
            setError(err?.message || 'gRPC stream error');
          }
        });

      } catch (err) {
        if (cancelled) return;
        console.error('Load error', err);
        setStreamStatus('error');
        setError(err?.message || 'Failed to load project');
      }
    };

    loadData();

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [id, user]);

  // Группировка endpoints по классам
  const endpointsByClass = useMemo(() => {
    const grouped = {};
    Object.entries(endpoints).forEach(([route, handler]) => {
      const handlerStr = typeof handler === 'string' ? handler : '';
      const [className, methodName] = handlerStr.split('.');
      const bucket = className || 'Other';
      if (!grouped[bucket]) {
        grouped[bucket] = [];
      }
      grouped[bucket].push({ route, method: methodName || handlerStr || route });
    });
    return grouped;
  }, [endpoints]);

  // expand all classes by default when endpoints arrive
  useEffect(() => {
    const classes = Object.keys(endpointsByClass);
    if (classes.length > 0) {
      setExpandedClasses(new Set(classes));
    }
  }, [endpointsByClass]);

  // Построение графа из architecture с группировкой по классам
  useEffect(() => {
    if (architecture.length === 0) return;

    const newNodes = [];
    const newEdges = [];
    
    // Layout: слева направо (Requirements → Endpoints → Architecture)
    const COLUMN_WIDTH = 350;
    const ROW_HEIGHT = 80;
    const START_X = 50;
    const START_Y = 50;

    // Группировка по классам
    const classMethods = {};
    
    architecture.forEach((arch) => {
      if (!arch?.parent) {
        return;
      }
      const [className, methodName] = String(arch.parent).split('.');
      if (!classMethods[className]) {
        classMethods[className] = [];
      }
      classMethods[className].push({
        fullName: arch.parent,
        methodName: methodName || arch.parent,
        children: arch.children
      });
    });

    // Создание узлов классов с методами
    let currentY = START_Y;
    const nodeMap = new Map();

    Object.entries(classMethods).forEach(([className, methods]) => {
      const classNodeId = `class_${className}`;
      
      // Создаём узел класса (группа)
      const classNode = {
        id: classNodeId,
        type: 'default',
        position: { x: START_X + COLUMN_WIDTH * 2, y: currentY },
        data: { 
          label: (
            <div style={{ padding: '10px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
                {className}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>
                {methods.length} {methods.length === 1 ? 'method' : 'methods'}
              </div>
            </div>
          ),
          className: className,
        },
        style: {
          background: getNodeColor(className),
          color: 'white',
          border: '3px solid rgba(255,255,255,0.3)',
          borderRadius: '12px',
          padding: '8px',
          fontSize: '12px',
          fontWeight: '600',
          minWidth: '200px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        },
      };

      newNodes.push(classNode);
      nodeMap.set(classNodeId, classNode);

      // Создаём связи для всех методов класса
      methods.forEach((method) => {
        method.children.forEach((child) => {
          const childName = child.split('/').pop();
          const edgeId = `${classNodeId}-${child}`;
          
          newEdges.push({
            id: edgeId,
            source: classNodeId,
            target: child,
            type: 'smoothstep',
            animated: false, // Убрали анимацию
            style: { stroke: '#667eea', strokeWidth: 2, opacity: 0.6 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#667eea',
            },
            label: method.methodName,
            labelStyle: { fill: '#667eea', fontSize: 9, fontWeight: 600 },
          });

          // Создаём узел для child если его ещё нет
          if (!nodeMap.has(child)) {
            const childNode = {
              id: child,
              type: 'default',
              position: { x: START_X + COLUMN_WIDTH * 3, y: newNodes.length * 60 },
              data: { 
                label: child.split('/').pop(),
                fullPath: child,
              },
              style: {
                background: '#f7fafc',
                color: '#2d3748',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '11px',
                fontWeight: '500',
                minWidth: '120px',
              },
            };
            newNodes.push(childNode);
            nodeMap.set(child, childNode);
          }
        });
      });

      currentY += 120; // Spacing between classes
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [architecture]);

  // Цвета узлов в зависимости от типа класса
  const getNodeColor = (className) => {
    if (className.includes('Account')) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    if (className.includes('Auth')) return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
    if (className.includes('Project')) return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
    if (className.includes('Database') || className.includes('DataBase')) return 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
    if (className.includes('Core')) return 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)';
    if (className.includes('Task')) return 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)';
    if (className.includes('Frontend') || className.includes('Algorithm')) return 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)';
    if (className.includes('Consumer') || className.includes('Producer') || className.includes('Broker')) return 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)';
    if (className.includes('Storage') || className.includes('Object')) return 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)';
    if (className.includes('Service')) return 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)';
    return 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)';
  };

  // Обработка соединений (растягивание стрелок)
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: false }, eds)),
    [setEdges]
  );

  // Обработка клика по узлу
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  // Переключение раскрытия класса в списке endpoints
  const toggleClass = (className) => {
    setExpandedClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(className)) {
        newSet.delete(className);
      } else {
        newSet.add(className);
      }
      return newSet;
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Back to Projects
        </button>
        <div className={styles.projectInfo}>
          <h1>Project #{id} - Architecture Visualization</h1>
          <p className={styles.statusBadge}>
            Status: {streamStatus === 'streaming'
              ? '🔄 Receiving data...'
              : streamStatus === 'done'
                ? '✅ Complete'
                : streamStatus === 'error'
                  ? '⛔ Error'
                  : '⏳ Connecting...'}
          </p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Progress</span>
            <span className={styles.statValue}>
              {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Nodes</span>
            <span className={styles.statValue}>{nodes.length}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Edges</span>
            <span className={styles.statValue}>{edges.length}</span>
          </div>
        </div>
      </header>

      {streamStatus === 'error' && error && (
        <div style={{ color: '#e53e3e', padding: '8px 40px 0', fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div className={styles.content}>
        {/* Left column: Requirements */}
        <aside className={styles.sidebar} style={{ width: 300 }}>
          <div className={styles.sidebarHeader}>
            <h3>📦 Requirements</h3>
          </div>
          <div className={styles.sidebarContent}>
            {requirements.length === 0 ? (
              <p className={styles.emptyState}>⏳ Waiting for requirements...</p>
            ) : (
              <div className={styles.requirementsList}>
                {requirements.map((req, i) => (
                  <div key={i} className={styles.requirementItem}>
                    <span className={styles.reqIcon}>📦</span>
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Middle column: Endpoints (vertical) */}
        <aside className={styles.sidebar} style={{ width: 360 }}>
          <div className={styles.sidebarHeader}>
            <h3>🌐 Endpoints</h3>
          </div>
          <div className={styles.sidebarContent}>
            {Object.keys(endpointsByClass).length === 0 ? (
              <p className={styles.emptyState}>⏳ Waiting for endpoints...</p>
            ) : (
              <div className={styles.endpointsList}>
                {Object.entries(endpointsByClass).map(([className, methods]) => (
                  <div key={className} className={styles.endpointClass}>
                    <div className={styles.classHeader} onClick={() => toggleClass(className)}>
                      <span className={styles.classIcon}>{expandedClasses.has(className) ? '▼' : '▶'}</span>
                      <span className={styles.className}>{className}</span>
                      <span className={styles.methodCount}>({methods.length})</span>
                    </div>

                    <div className={styles.methodsList}>
                      {methods.map((m, idx) => (
                        <div key={idx} className={styles.methodItem}>
                          <span className={styles.httpMethod}>{m.route.split(' ')[0]}</span>
                          <div className={styles.methodDetails}>
                            <span className={styles.routePath}>{m.route.split(' ')[1]}</span>
                            <span className={styles.methodName}>{m.method}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Graph Area */}
        <main className={styles.mainContent}>
          <div className={styles.flowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#aaa" gap={16} />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  if (node.data.className?.includes('Account')) return '#667eea';
                  if (node.data.className?.includes('Project')) return '#f5576c';
                  if (node.data.className?.includes('Database')) return '#00f2fe';
                  return '#a8edea';
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '8px',
                }}
              />
              
              {/* Legend Panel */}
              <Panel position="top-right">
                <div className={styles.legend}>
                  <h4>Legend</h4>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}></div>
                    <span>Account</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}></div>
                    <span>Auth</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}></div>
                    <span>Project</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}></div>
                    <span>Database</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}></div>
                    <span>Core</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' }}></div>
                    <span>Broker/Queue</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)' }}></div>
                    <span>Service</span>
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* Node Details Panel */}
          {selectedNode && (
            <div className={styles.detailsPanel}>
              <div className={styles.detailsHeader}>
                <h3>Node Details</h3>
                <button onClick={() => setSelectedNode(null)}>✕</button>
              </div>
              <div className={styles.detailsContent}>
                <p><strong>ID:</strong> {selectedNode.id}</p>
                <p><strong>Class:</strong> {selectedNode.data.className}</p>
                <p><strong>Method:</strong> {selectedNode.data.methodName}</p>
                <p><strong>Position:</strong> ({Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)})</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

src/pages/Projects/ProjectViewStream.module.css
.container {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    flex-direction: column;
}

.header {
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(10px);
    padding: 20px 40px;
    display: flex;
    align-items: center;
    gap: 30px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    z-index: 10;
}

.backBtn {
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.backBtn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.projectInfo {
    flex: 1;
}

.projectInfo h1 {
    margin: 0 0 8px 0;
    font-size: 24px;
    color: var(--text-primary);
}

.statusBadge {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
    padding: 4px 12px;
    background: var(--border);
    border-radius: 12px;
    display: inline-block;
}

.stats {
    display: flex;
    gap: 30px;
}

.stat {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.statLabel {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
}

.statValue {
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.content {
    display: flex;
    flex: 1;
    gap: 20px;
    padding: 20px;
    overflow: hidden;
}

/* Sidebar */
.sidebar {
    width: 350px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.tabs {
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 6px;
    border-bottom: 2px solid var(--border);
}

.tab {
    padding: 14px 18px;
    background: transparent;
    border: none;
    border-radius: 10px;
    text-align: left;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 8px;
}

.tab:hover {
    background: #f7fafc;
    color: var(--text-primary);
}

.tabActive {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    color: white !important;
}

.sidebarContent {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

.emptyState {
    text-align: center;
    color: #999;
    font-size: 14px;
    padding: 40px 20px;
}

/* Requirements List */
.requirementsList {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.requirementItem {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-primary);
    transition: all 0.2s ease;
    animation: slideIn 0.3s ease;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-20px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.requirementItem:hover {
    border-color: #667eea;
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.reqIcon {
    font-size: 18px;
}

/* Endpoints List - Grouped by Class */
.endpointsList {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.endpointClass {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    transition: all 0.3s ease;
    animation: slideIn 0.3s ease;
}

.endpointClass:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.classHeader {
    width: 100%;
    padding: 14px 16px;
    background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
    border: none;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 600;
    font-size: 14px;
}

.classHeader:hover {
    background: linear-gradient(135deg, #edf2f7 0%, var(--border) 100%);
}

.classIcon {
    color: #667eea;
    font-size: 12px;
    transition: transform 0.2s ease;
}

.className {
    flex: 1;
    color: var(--text-primary);
    font-size: 15px;
}

.methodCount {
    color: #667eea;
    font-size: 12px;
    padding: 2px 8px;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 12px;
}

.methodsList {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background: #fafafa;
}

.methodItem {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--surface);
    border-radius: 6px;
    transition: all 0.2s ease;
}

.methodItem:hover {
    background: #f7fafc;
    transform: translateX(4px);
}

.httpMethod {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    color: white;
    min-width: 60px;
    text-align: center;
}

.httpMethod:nth-child(1) {
    background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); /* POST */
}

.methodItem:has(.httpMethod:contains("GET")) .httpMethod {
    background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
}

.methodItem:has(.httpMethod:contains("PUT")) .httpMethod {
    background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%);
}

.methodItem:has(.httpMethod:contains("DELETE")) .httpMethod {
    background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
}

.methodDetails {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.routePath {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: var(--text-muted);
}

.methodName {
    font-size: 11px;
    color: var(--text-subtle);
}

/* Architecture List */
.architectureList {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.archItem {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    transition: all 0.2s ease;
    animation: slideIn 0.3s ease;
}

.archItem:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.archParent {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: var(--text-primary);
    font-size: 14px;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
}

.archIcon {
    font-size: 14px;
}

.archChildren {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 10px;
}

.archChild {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
    padding: 6px 8px;
    background: #f7fafc;
    border-radius: 4px;
}

.archArrow {
    color: #cbd5e0;
    font-family: monospace;
}

/* Main Content Area */
.mainContent {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
}

.flowWrapper {
    flex: 1;
    background: var(--surface);
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    overflow: hidden;
}

/* Legend Panel */
.legend {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    min-width: 150px;
}

.legend h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 600;
}

.legendItem {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--text-muted);
}

.legendColor {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

/* Node Details Panel */
.detailsPanel {
    position: absolute;
    bottom: 20px;
    left: 20px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
    min-width: 300px;
    z-index: 10;
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.detailsHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 2px solid var(--border);
}

.detailsHeader h3 {
    margin: 0;
    font-size: 16px;
    color: var(--text-primary);
}

.detailsHeader button {
    background: none;
    border: none;
    font-size: 20px;
    color: #999;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
}

.detailsHeader button:hover {
    background: #f7fafc;
    color: var(--text-muted);
}

.detailsContent {
    padding: 16px 18px;
}

.detailsContent p {
    margin: 0 0 10px 0;
    font-size: 13px;
    color: var(--text-muted);
}

.detailsContent strong {
    color: var(--text-primary);
    font-weight: 600;
}

/* React Flow Customization */
:global(.react-flow__node) {
    cursor: grab;
}

:global(.react-flow__node:active) {
    cursor: grabbing;
}

:global(.react-flow__node.selected) {
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3);
}

:global(.react-flow__edge) {
    cursor: pointer;
}

:global(.react-flow__edge.selected) {
    stroke-width: 3px !important;
}

:global(.react-flow__edge-path) {
    stroke-width: 2px;
    transition: stroke-width 0.2s ease;
}

:global(.react-flow__edge:hover .react-flow__edge-path) {
    stroke-width: 3px;
}

:global(.react-flow__controls) {
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border: none;
}

:global(.react-flow__controls-button) {
    background: var(--surface);
    border: none;
    border-bottom: 1px solid #e0e0e0;
}

:global(.react-flow__controls-button:hover) {
    background: #f7fafc;
}

:global(.react-flow__controls-button svg) {
    fill: #667eea;
}

:global(.react-flow__minimap) {
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid var(--border);
}

/* Responsive */
@media (max-width: 1024px) {
    .content {
        flex-direction: column;
    }

    .sidebar {
        width: 100%;
        max-height: 300px;
    }

    .tabs {
        flex-direction: row;
        overflow-x: auto;
    }

    .tab {
        white-space: nowrap;
        min-width: fit-content;
    }

    .detailsPanel {
        left: 50%;
        transform: translateX(-50%);
    }
}

/* Scrollbar styling */
.sidebarContent::-webkit-scrollbar {
    width: 6px;
}

.sidebarContent::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
}

.sidebarContent::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 10px;
}

.sidebarContent::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

src/pages/Projects/ProjectViewV2.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectViewV2.module.css';

// Структура папок проекта
const projectStructure = [
  {
    name: 'src/',
    type: 'folder',
    expanded: true,
    children: [
      {
        name: 'api/',
        type: 'folder',
        expanded: true,
        children: [
          { name: 'gateway.py', type: 'file', lines: 450, module: 'api-gateway' },
          { name: '__init__.py', type: 'file', lines: 10 },
        ]
      },
      {
        name: 'services/',
        type: 'folder',
        expanded: true,
        children: [
          { name: 'auth.py', type: 'file', lines: 890, module: 'auth-service' },
          { name: 'user.py', type: 'file', lines: 1240, module: 'user-service' },
          { name: 'product.py', type: 'file', lines: 2100, module: 'product-service' },
          { name: 'order.py', type: 'file', lines: 1650, module: 'order-service' },
        ]
      },
      {
        name: 'database/',
        type: 'folder',
        expanded: false,
        children: [
          { name: 'postgres.py', type: 'file', lines: 320, module: 'postgres' },
          { name: 'redis.py', type: 'file', lines: 180, module: 'redis' },
          { name: 'mongo.py', type: 'file', lines: 250, module: 'mongodb' },
        ]
      },
      {
        name: 'workers/',
        type: 'folder',
        expanded: true,
        children: [
          { name: 'email_worker.py', type: 'file', lines: 320, module: 'email-worker' },
          { name: 'payment_worker.py', type: 'file', lines: 580, module: 'payment-worker' },
        ]
      },
      {
        name: 'utils/',
        type: 'folder',
        expanded: false,
        children: [
          { name: 'logger.py', type: 'file', lines: 180, module: 'logger' },
          { name: 'config.py', type: 'file', lines: 120, module: 'config' },
        ]
      },
    ]
  },
  {
    name: 'tests/',
    type: 'folder',
    expanded: false,
    children: [
      { name: 'test_auth.py', type: 'file', lines: 450 },
      { name: 'test_api.py', type: 'file', lines: 380 },
    ]
  },
  { name: 'requirements.txt', type: 'file', lines: 45 },
  { name: 'README.md', type: 'file', lines: 120 },
  { name: '.env', type: 'file', lines: 15 },
];

// Граф зависимостей
const nodes = [
  {
    id: 'api-gateway',
    data: { label: '🌐 API Gateway\ngateway.py\n450 lines' },
    position: { x: 400, y: 50 },
    style: { 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'auth-service',
    data: { label: '🔐 Auth Service\nauth.py\n890 lines' },
    position: { x: 100, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'user-service',
    data: { label: '👤 User Service\nuser.py\n1,240 lines' },
    position: { x: 320, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'product-service',
    data: { label: '📦 Product Service\nproduct.py\n2,100 lines' },
    position: { x: 540, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'order-service',
    data: { label: '🛒 Order Service\norder.py\n1,650 lines' },
    position: { x: 760, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'postgres',
    data: { label: '🗄️ PostgreSQL\npostgres.py' },
    position: { x: 200, y: 380 },
    style: { 
      background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 160,
    },
  },
  {
    id: 'redis',
    data: { label: '⚡ Redis\nredis.py' },
    position: { x: 450, y: 380 },
    style: { 
      background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 160,
    },
  },
  {
    id: 'mongodb',
    data: { label: '🍃 MongoDB\nmongo.py' },
    position: { x: 700, y: 380 },
    style: { 
      background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 160,
    },
  },
  {
    id: 'email-worker',
    data: { label: '📧 Email Worker\nemail_worker.py\n320 lines' },
    position: { x: 950, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #9f7aea 0%, #805ad5 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'payment-worker',
    data: { label: '💳 Payment Worker\npayment_worker.py\n580 lines' },
    position: { x: 950, y: 350 },
    style: { 
      background: 'linear-gradient(135deg, #9f7aea 0%, #805ad5 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
];

const edges = [
  { id: 'e1', source: 'api-gateway', target: 'auth-service', animated: true, style: { stroke: '#667eea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2', source: 'api-gateway', target: 'user-service', animated: true, style: { stroke: '#667eea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3', source: 'api-gateway', target: 'product-service', animated: true, style: { stroke: '#667eea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4', source: 'api-gateway', target: 'order-service', animated: true, style: { stroke: '#667eea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e5', source: 'auth-service', target: 'postgres', style: { stroke: '#48bb78', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e6', source: 'user-service', target: 'postgres', style: { stroke: '#48bb78', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e7', source: 'product-service', target: 'mongodb', style: { stroke: '#48bb78', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e8', source: 'order-service', target: 'postgres', style: { stroke: '#48bb78', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e9', source: 'auth-service', target: 'redis', style: { stroke: '#f56565', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e10', source: 'product-service', target: 'redis', style: { stroke: '#f56565', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e11', source: 'order-service', target: 'email-worker', animated: true, style: { stroke: '#9f7aea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e12', source: 'order-service', target: 'payment-worker', animated: true, style: { stroke: '#9f7aea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
];

export default function ProjectViewV2() {
  const navigate = useNavigate();
  const [expandedFolders, setExpandedFolders] = useState(['src/', 'src/api/', 'src/services/', 'src/workers/']);
  const [selectedFile, setSelectedFile] = useState(null);

  const toggleFolder = (path) => {
    setExpandedFolders(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  const renderTree = (items, path = '') => {
    return items.map((item) => {
      const fullPath = path + item.name;
      const isExpanded = expandedFolders.includes(fullPath);

      if (item.type === 'folder') {
        return (
          <div key={fullPath} className={styles.folderItem}>
            <div 
              className={styles.folderHeader}
              onClick={() => toggleFolder(fullPath)}
            >
              <span className={styles.folderIcon}>{isExpanded ? '📂' : '📁'}</span>
              <span className={styles.folderName}>{item.name}</span>
            </div>
            {isExpanded && item.children && (
              <div className={styles.folderChildren}>
                {renderTree(item.children, fullPath)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div 
            key={fullPath} 
            className={`${styles.fileItem} ${selectedFile === fullPath ? styles.fileItemSelected : ''}`}
            onClick={() => setSelectedFile(fullPath)}
          >
            <span className={styles.fileIcon}>📄</span>
            <span className={styles.fileName}>{item.name}</span>
            {item.lines && <span className={styles.fileLines}>{item.lines}L</span>}
          </div>
        );
      }
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/projects')}>
          ← Назад к проектам
        </button>
        <div className={styles.projectInfo}>
          <h1>E-Commerce Platform</h1>
          <p>Микросервисная архитектура интернет-магазина</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>10</span>
            <span className={styles.statLabel}>модулей</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>12</span>
            <span className={styles.statLabel}>связей</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* File Tree Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2>📦 Структура проекта</h2>
          </div>
          <div className={styles.fileTree}>
            {renderTree(projectStructure)}
          </div>
        </aside>

        {/* Visualization */}
        <main className={styles.visualization}>
          <ReactFlow 
            nodes={nodes} 
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
          >
            <Background color="#e0e0e0" gap={16} />
            <Controls />
          </ReactFlow>
        </main>
      </div>
    </div>
  );
}

src/pages/Projects/ProjectViewV2.module.css
.container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.backBtn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.backBtn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.projectInfo {
  flex: 1;
}

.projectInfo h1 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary);
  font-weight: 700;
}

.projectInfo p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-subtle);
}

.stats {
  display: flex;
  gap: 24px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.statValue {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.statLabel {
  font-size: 11px;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mainContent {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-right: 1px solid rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebarHeader {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.sidebarHeader h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.fileTree {
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
}

.folderItem {
  margin-bottom: 4px;
}

.folderHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
  user-select: none;
}

.folderHeader:hover {
  background: rgba(102, 126, 234, 0.1);
}

.folderIcon {
  font-size: 16px;
}

.folderName {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.folderChildren {
  margin-left: 20px;
  padding-left: 12px;
  border-left: 2px solid rgba(102, 126, 234, 0.2);
}

.fileItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
  margin-bottom: 2px;
}

.fileItem:hover {
  background: rgba(102, 126, 234, 0.1);
}

.fileItemSelected {
  background: rgba(102, 126, 234, 0.2);
}

.fileIcon {
  font-size: 14px;
}

.fileName {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
}

.fileLines {
  font-size: 11px;
  color: #a0aec0;
  font-weight: 500;
}

.visualization {
  flex: 1;
  position: relative;
  background: #fafafa;
}

/* Скроллбары */
.fileTree::-webkit-scrollbar {
  width: 6px;
}

.fileTree::-webkit-scrollbar-track {
  background: transparent;
}

.fileTree::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 3px;
}

.fileTree::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.5);
}

src/pages/Projects/Projects.module.css
.container {
    min-height: 100vh;
    background: var(--page-gradient);
    padding: 20px;
    color: var(--text-primary);
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 40px;
    position: relative;
}

.createBtn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--glass-strong);
    backdrop-filter: blur(10px);
    border: none;
    padding: 12px 24px;
    border-radius: 16px;
    font-size: 16px;
    font-weight: 600;
    color: var(--primary);
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px var(--shadow-soft);
    border: 1px solid var(--glass-border);
}

.createBtn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px var(--shadow-strong);
    background: var(--surface);
}

.plusIcon {
    font-size: 20px;
    font-weight: bold;
    color: var(--primary);
}

.centerTitle {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    background: var(--primary-gradient);
    backdrop-filter: blur(10px);
    padding: 12px 80px;
    border-radius: 16px;
    box-shadow: 0 4px 15px var(--shadow-soft);
}

.centerTitle h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-inverse);
}

.userMenu {
    position: relative;
}

.userBtn {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--glass-strong);
    backdrop-filter: blur(10px);
    border: none;
    padding: 8px 16px 8px 8px;
    border-radius: 50px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px var(--shadow-soft);
    border: 1px solid var(--glass-border);
}

.userBtn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px var(--shadow-strong);
    background: var(--surface);
}

.userBtn:hover + .dropdown {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

.avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--primary-gradient);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-inverse);
    font-weight: 700;
    font-size: 18px;
}

.userName {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-secondary);
}

.chevron {
    font-size: 12px;
    color: var(--primary);
}

.dropdown {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 10px 30px var(--shadow-soft);
    padding: 8px;
    min-width: 150px;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-10px);
    transition: all 0.3s ease;
    z-index: 100;
    border: 1px solid var(--border);
}

.userMenu:hover .dropdown {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

.dropdown button {
    width: 100%;
    padding: 12px 16px;
    border: none;
    background: transparent;
    text-align: left;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.2s ease;
}

.dropdown button:hover {
    background: var(--surface-raised);
    color: var(--danger-strong);
}

.main {
    max-width: 1200px;
    margin: 0 auto;
}

.projectsGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 24px;
}

.projectCard {
    background: var(--glass-strong);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    overflow: visible;
    box-shadow: 0 4px 15px var(--shadow-soft);
    transition: all 0.3s ease;
    position: relative;
    z-index: 1;
    border: 1px solid var(--glass-border);
}

/* Демо-карточка с особым стилем */
.demoCard {
    border: 2px solid var(--primary);
    background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 20%, transparent), color-mix(in srgb, var(--primary-2) 20%, transparent));
}

.demoCard::before {
    content: '🎮 DEMO';
    position: absolute;
    top: 10px;
    right: 10px;
    background: var(--primary-gradient);
    color: var(--text-inverse);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    z-index: 10;
    box-shadow: 0 2px 8px var(--shadow-soft);
}

.projectLink {
    display: block;
    text-decoration: none;
}

.projectCard:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
}

.projectImage {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    position: relative;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.18));
    border: 1px solid var(--glass-border);
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
}

.projectImage img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.projectImagePlaceholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.08));
    border: 1px dashed var(--glass-border);
}

.projectInfo {
    padding: 20px;
}

.projectName {
    margin: 0 0 10px 0;
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary);
}

.projectDescription {
    margin: 0;
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.5;
}

.projectActions {
    display: flex;
    gap: 10px;
    padding: 0 20px 20px 20px;
    justify-content: flex-start;
    align-items: center;
}

.actionBtn,
.actionBtnPrimary {
    flex: 0 0 32%;
    min-width: 140px;
    max-width: 240px;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    transition: all 0.3s ease;
    border: 2px solid var(--border);
}

.actionBtn {
    background: var(--surface);
    color: var(--text-muted);
}

.actionBtn:hover {
    background: var(--surface-raised);
    border-color: var(--primary);
    color: var(--primary);
    transform: translateY(-2px);
}

.actionBtnPrimary {
    background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 90%, #fff 10%), color-mix(in srgb, var(--primary-2) 85%, #fff 15%));
    color: var(--text-inverse);
    border: 1px solid var(--primary-strong);
    flex: 1 1 auto;
    min-width: 50%;
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 14px 28px rgba(90, 111, 214, 0.35);
    isolation: isolate;
    backdrop-filter: blur(12px);
}

.actionBtnPrimary::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(120deg, rgba(255,255,255,0.3), rgba(255,255,255,0));
    opacity: 0;
    transform: translateX(-10%);
    transition: opacity 0.3s ease, transform 0.4s ease;
    z-index: 0;
}

.previewButton {
    letter-spacing: 0.3px;
    text-shadow: 0 1px 6px var(--shadow-soft);
    border: 1px solid var(--primary-strong);
    margin: 0 auto;
}

.previewButton:hover {
    box-shadow: 0 16px 36px var(--shadow-strong);
    transform: translateY(-2px);
}

.previewButton:hover::before {
    opacity: 1;
    transform: translateX(0);
}

.dangerBtn {
    background: linear-gradient(135deg, var(--danger-soft), color-mix(in srgb, var(--danger) 18%, transparent));
    color: var(--danger-strong);
    border-color: var(--danger);
    box-shadow: 0 10px 22px var(--shadow-soft);
}

.dangerBtn:hover {
    background: linear-gradient(135deg, color-mix(in srgb, var(--danger) 20%, transparent), color-mix(in srgb, var(--danger-strong) 20%, transparent));
    border-color: var(--danger);
    transform: translateY(-2px);
    box-shadow: 0 12px 26px var(--shadow-strong);
}

.dangerBtn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.trashIcon {
    width: 20px;
    height: 20px;
    display: block;
    object-fit: contain;
}

.moreMenuWrapper {
    position: relative;
    margin-left: auto;
}

.moreBtn {
    width: 44px;
    height: 44px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--glass-strong);
    color: var(--text-muted);
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 8px 18px var(--shadow-soft);
    transition: all 0.2s ease;
}

.moreBtn:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px var(--shadow-strong);
    border-color: var(--primary);
    color: var(--primary);
}

.moreMenu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 160px;
    background: var(--surface);
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: 0 16px 34px var(--shadow-soft);
    padding: 8px;
    z-index: 1000;
}

.moreMenuItem {
    width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    border: none;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--danger-strong);
    cursor: pointer;
    transition: background 0.2s ease;
}

.moreMenuItem:hover {
    background: var(--danger-soft);
}

.moreMenuItem:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.moreMenuLabel {
    font-weight: 700;
    color: var(--danger-strong);
}

.actionBtnLabel {
    position: relative;
    z-index: 1;
    font-weight: 700;
}

.previewButton:focus-visible {
    outline: 3px solid rgba(255,255,255,0.6);
    outline-offset: 3px;
}

.newBadge {
    display: inline-block;
    margin-top: 12px;
    padding: 6px 12px;
    background: var(--primary-gradient);
    color: var(--text-inverse);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.3px;
}

/* Адаптивность */
@media (max-width: 768px) {
    .header {
        flex-wrap: wrap;
        gap: 20px;
    }

    .centerTitle {
        position: static;
        transform: none;
        width: 100%;
        order: -1;
        text-align: center;
    }

    .projectsGrid {
        grid-template-columns: 1fr;
    }

    .userName {
        display: none;
    }
}

/* New Project Styles */
.newProjectWrapper {
    max-width: 600px;
    margin: 0 auto;
    background: var(--glass-strong);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    box-shadow: 0 20px 60px var(--shadow-strong);
    border: 1px solid var(--glass-border);
    padding: 40px;
    animation: slideUp 0.4s ease-out;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.newProjectForm {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.newProjectForm h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
    text-align: center;
    background: var(--primary-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.newProjectForm .inputGroup {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.newProjectForm label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-left: 4px;
}

.newProjectForm input,
.newProjectForm textarea {
    padding: 14px 16px;
    border: 2px solid var(--border);
    border-radius: 12px;
    font-size: 15px;
    transition: all 0.3s ease;
    background: var(--surface);
    color: var(--text-primary);
    font-family: inherit;
}

.newProjectForm input:focus,
.newProjectForm textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
}

.newProjectForm textarea {
    resize: vertical;
    min-height: 100px;
}

.fileUpload {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.fileInput {
    display: none;
}

.fileLabel {
    display: flex;
    align-items: center;
    gap: 14px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, transparent), color-mix(in srgb, var(--primary-2) 12%, transparent));
    border: 2px dashed color-mix(in srgb, var(--primary) 35%, transparent);
    border-radius: 14px;
    padding: 14px 16px;
    cursor: pointer;
    transition: all 0.25s ease;
}

.fileLabel:hover {
    border-color: var(--primary);
    box-shadow: 0 10px 25px var(--shadow-soft);
    transform: translateY(-1px);
}

.fileLabel[aria-disabled="true"] {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.fileIcon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--primary-gradient);
    display: grid;
    place-items: center;
    font-size: 24px;
    color: var(--text-inverse);
    box-shadow: 0 8px 20px var(--shadow-soft);
}

.fileText {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.fileTitle {
    font-weight: 700;
    color: var(--text-primary);
    font-size: 15px;
}

.fileHint {
    color: var(--text-subtle);
    font-size: 13px;
}

.fileBadge {
    background: var(--surface);
    color: var(--primary);
    padding: 8px 12px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 12px;
    border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
    box-shadow: 0 4px 12px var(--shadow-soft);
}

.fileMeta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
    color: var(--text-secondary);
    font-size: 13px;
    gap: 8px;
}

.fileChip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: var(--surface);
    border-radius: 10px;
    border: 1px solid var(--border);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 70%;
}

.fileSize {
    color: var(--text-subtle);
    font-weight: 600;
}

.fileNote {
    color: var(--text-subtle);
}

.formActions {
    display: flex;
    gap: 12px;
    margin-top: 10px;
}

.cancelBtn,
.createProjectBtn {
    flex: 1;
    padding: 16px;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.cancelBtn {
    background: var(--input-disabled);
    color: var(--text-muted);
}

.cancelBtn:hover {
    background: var(--surface-raised);
}

.createProjectBtn {
    background: var(--primary-gradient);
    color: var(--text-inverse);
}

.createProjectBtn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px var(--shadow-strong);
}

.createProjectBtn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* Стили для ошибок */
.error {
    background: var(--danger-soft);
    color: var(--danger-strong);
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 14px;
    border-left: 4px solid var(--danger-strong);
    margin: 0;
    animation: shake 0.3s ease;
}

.analysisStatus {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 14px;
    border-left: 4px solid var(--primary);
    margin: 0;
    animation: pulse 2s ease-in-out infinite;
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
}

/* Логи в реальном времени */
.logsContainer {
    margin-top: 20px;
    background: var(--surface-raised);
    border-radius: 12px;
    padding: 16px;
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--border);
}

.logsContainer h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: var(--text-secondary);
}

.logsList {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.logEntry {
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.5;
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    border-left: 3px solid;
    animation: slideIn 0.3s ease;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-10px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.logInfo {
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    border-left-color: var(--primary);
    color: color-mix(in srgb, var(--primary) 80%, #0b1221 20%);
}

.logSuccess {
    background: var(--success-soft);
    border-left-color: var(--success);
    color: color-mix(in srgb, var(--success) 75%, #0b1221 25%);
}

.logWarning {
    background: var(--warning-soft);
    border-left-color: var(--warning);
    color: var(--warning-strong);
}

.logError {
    background: var(--danger-soft);
    border-left-color: var(--danger);
    color: var(--danger-strong);
}

.logTime {
    color: var(--text-subtle);
    font-size: 11px;
    margin-right: 8px;
}

.logMessage {
    flex: 1;
    word-break: break-word;
}

.logDetails {
    margin: 8px 0 0 0;
    padding: 8px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    font-size: 11px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
}

/* Автоскролл вниз */
.logsList::-webkit-scrollbar {
    width: 8px;
}

.logsList::-webkit-scrollbar-track {
    background: var(--surface-raised);
    border-radius: 4px;
}

.logsList::-webkit-scrollbar-thumb {
    background: var(--text-subtle);
    border-radius: 4px;
}

.logsList::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}


/* Modal styles for Premium purchase */
.modalOverlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modalContent {
    background: var(--primary-gradient);
    color: var(--text-inverse);
    border-radius: 14px;
    padding: 24px;
    max-width: 480px;
    width: 92%;
    box-shadow: 0 20px 60px var(--shadow-strong);
}

.modalClose {
    position: absolute;
    right: 16px;
    top: 12px;
    background: var(--frost);
    border: none;
    color: var(--text-inverse);
    font-size: 20px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
}

.modalHeader h2 {
    margin: 0 0 12px 0;
}

.warningBanner {
    background: rgba(245,158,11,0.12);
    border: 1px solid rgba(245,158,11,0.28);
    padding: 10px 12px;
    border-radius: 10px;
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--text-inverse);
}

.modalActions {
    display: flex;
    gap: 10px;
    margin-top: 18px;
    flex-direction: column;
}

.modalPrimaryBtn {
    background: var(--surface);
    color: var(--primary);
    border: none;
    padding: 12px 16px;
    border-radius: 10px;
    font-weight: 700;
    cursor: pointer;
}

.modalSecondaryBtn {
    background: var(--frost);
    color: var(--text-inverse);
    border: 1px solid var(--glass-border);
    padding: 12px 16px;
    border-radius: 10px;
    cursor: pointer;
}

.modalCancelBtn {
    background: transparent;
    color: white;
    border: none;
    padding: 10px 12px;
    font-size: 14px;
    cursor: pointer;
    opacity: 0.95;
}

.modalCancelBtn:hover {
    opacity: 1;
}

src/pages/Projects/ProjectsList.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeAPI, projectsAPI } from '../../services/api';
import { useI18n } from '../../context/I18nContext';
import styles from './Projects.module.css';
import trashBinIcon from '../../assets/img/trash-bin.png';

export default function ProjectsList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  // Загрузка проектов при монтировании компонента
  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const response = await homeAPI.getHomepage();
      
      // response = { user: { id, name, surname }, projects: { total, data: [...] } }
      if (response.user) {
        setUserName(response.user.login || '');
      }
      
      const projectsList = response.projects?.data || [];
      setProjects(projectsList);
      setError('');
    } catch (err) {
      console.error('Ошибка загрузки проектов:', err);
      setError(t('projects.list.error.load', 'Не удалось загрузить проекты'));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    if (!menuOpenId) return;

    const handleClickOutside = () => setMenuOpenId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpenId]);

  const handleCreateProject = () => {
    navigate('/projects/new');
  };

  const handleDeleteProject = async (projectId) => {
    if (!projectId || deletingId) return;

    const confirmDelete = window.confirm(
      t('projects.list.confirmDelete', 'Удалить проект? Это действие нельзя отменить.')
    );
    if (!confirmDelete) return;

    try {
      setDeletingId(projectId);
      setError('');
      await projectsAPI.delete(projectId);
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
    } catch (err) {
      console.error('Ошибка при удалении проекта:', err);
      const status = err.response?.status;
      const backendMessage = err.response?.data?.message || err.response?.data?.detail;

      if (status === 404) {
        setError(t('projects.list.error.notFound', 'Проект не найден или нет прав доступа.'));
      } else if (status === 401) {
        setError(t('projects.list.error.invalidToken', 'Неверный токен.'));
      } else {
        setError(backendMessage || t('projects.list.error.deleteFailed', 'Не удалось удалить проект. Попробуйте еще раз.'));
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ 
          textAlign: 'center', 
          padding: '100px 20px',
          color: 'var(--text-primary)',
          fontSize: '20px',
          fontWeight: '600'
        }}>
          {t('projects.list.loading', 'Загрузка проектов...')}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.createBtn} onClick={handleCreateProject}>
          <span className={styles.plusIcon}>+</span>
          {t('projects.list.create', 'Создать')}
        </button>

        <div className={styles.centerTitle}>
          <h1>{t('projects.list.title', 'Проекты')}</h1>
        </div>

        <div className={styles.userMenu}>
          <button className={styles.userBtn}>
            <div className={styles.avatar}>
              {userName?.[0]?.toUpperCase() || user?.login?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || t('projects.list.userPlaceholderLetter', 'П')}
            </div>
            <span className={styles.userName}>
              {userName || user?.login || user?.name || t('projects.list.userPlaceholderName', 'Пользователь')}
            </span>
            <span className={styles.chevron}>▼</span>
          </button>
          
          <div className={styles.dropdown}>
            <button onClick={() => navigate('/settings')}>{t('projects.list.settings', 'Настройки')}</button>
            <button onClick={handleLogout}>{t('projects.list.logout', 'Выйти')}</button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {error && (
          <div className={styles.error} style={{ marginBottom: '20px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {projects.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '100px 20px',
            background: 'var(--glass-strong)',
            borderRadius: '20px',
            color: 'var(--text-muted)'
          }}>
            <h2 style={{ marginBottom: '10px', color: 'var(--text-primary)' }}>{t('projects.list.emptyTitle', 'Проекты не найдены')}</h2>
            <p style={{ margin: 0 }}>{t('projects.list.emptySubtitle', 'Создайте новый проект, чтобы начать.')}</p>
          </div>
        ) : (
          <div className={styles.projectsGrid}>
            {projects.map((project) => {
              return (
                <div 
                  key={project.id} 
                  className={styles.projectCard}
                  style={menuOpenId === project.id ? { zIndex: 30 } : undefined}
                >
                  {/* Preview temporarily disabled */}
                  {false && (
                    <div className={styles.projectImage}>
                      {project.picture_url ? (
                        <img src={project.picture_url} alt={project.name} />
                      ) : (
                        <div className={styles.projectImagePlaceholder} aria-hidden="true" />
                      )}
                    </div>
                  )}
                  <div className={styles.projectInfo}>
                    <h2 className={styles.projectName}>{project.name}</h2>
                    <p className={styles.projectDescription}>{project.description}</p>
                  </div>
                  {/* Actions */}
                  <div className={styles.projectActions}>
                    <Link 
                        to={`/projects/${project.id}/architecture`} 
                        className={`${styles.actionBtnPrimary} ${styles.previewButton}`} 
                      >
                      <span className={styles.actionBtnLabel}>{t('projects.list.view', 'Просмотр')}</span>
                      </Link>
                      <div 
                      className={styles.moreMenuWrapper}
                      onClick={(e) => e.stopPropagation()}
                      >
                      <button
                        type="button"
                        className={styles.moreBtn}
                        aria-haspopup="menu"
                        aria-expanded={menuOpenId === project.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === project.id ? null : project.id);
                        }}
                      >
                        ⋯
                      </button>
                      {menuOpenId === project.id && (
                        <div className={styles.moreMenu} role="menu">
                          <button
                            type="button"
                            className={styles.moreMenuItem}
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(null);
                            handleDeleteProject(project.id);
                          }}
                          disabled={deletingId === project.id}
                        >
                          <img
                            src={trashBinIcon}
                            alt=""
                            aria-hidden="true"
                            className={styles.trashIcon}
                          />
                          <span className={styles.moreMenuLabel}>
                              {deletingId === project.id ? t('projects.list.deleting', 'Удаление...') : t('projects.list.delete', 'Удалить')}
                            </span>
                          </button>
                        </div>
                      )}
                      </div>
                    </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

src/pages/Projects/TestFlow.jsx
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

const nodes = [
  {
    id: '1',
    data: { label: '🌐 API Gateway' },
    position: { x: 250, y: 0 },
    style: { background: '#667eea', color: 'white', padding: 10, borderRadius: 8 },
  },
  {
    id: '2',
    data: { label: '🔐 Auth Service' },
    position: { x: 100, y: 150 },
    style: { background: '#48bb78', color: 'white', padding: 10, borderRadius: 8 },
  },
  {
    id: '3',
    data: { label: '🗄️ Database' },
    position: { x: 400, y: 150 },
    style: { background: '#4299e1', color: 'white', padding: 10, borderRadius: 8 },
  },
];

const edges = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e1-3', source: '1', target: '3', animated: true },
];

export default function TestFlow() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

src/pages/Settings/Settings.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { accountAPI } from '../../services/api';
import { useI18n } from '../../context/I18nContext';
import { useTheme } from '../../context/ThemeContext';
import styles from './Settings.module.css';

const SunIcon = () => (
  <svg className={styles.themeGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg className={styles.themeGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </svg>
);

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t, language, setLanguage, availableLanguages } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [profileForm, setProfileForm] = useState({ name: '', surname: '' });
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLinkingEmail, setIsLinkingEmail] = useState(false);
  const [isUnlinkingEmail, setIsUnlinkingEmail] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verifyType, setVerifyType] = useState('LINK');
  const [successMessage, setSuccessMessage] = useState('');
  const [emailJustLinked, setEmailJustLinked] = useState(false);

  const accountLogin = accountData?.login || user?.login || '';
  const deletePhrase = accountLogin
    ? t('settings.delete.phrase', 'удалить мой аккаунт {{login}}', { login: accountLogin })
    : '';
  const isDark = theme === 'dark';

  useEffect(() => {
    loadAccountData();
  }, []);

  useEffect(() => {
    if (accountData || user) {
      setProfileForm({
        name: accountData?.name ?? user?.name ?? '',
        surname: accountData?.surname ?? user?.surname ?? '',
      });
    }
  }, [accountData, user]);

  async function loadAccountData() {
    try {
      setLoading(true);
      setError('');
      const data = await accountAPI.getAccount();
      setAccountData(data);
    } catch (err) {
      console.error('Ошибка загрузки данных аккаунта:', err);
      setError(err.response?.data?.message || t('settings.profileLoadError', 'Не удалось загрузить профиль'));
    } finally {
      setLoading(false);
    }
  }

  function handleProfileChange(field, value) {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetProfileForm() {
    setProfileForm({
      name: accountData?.name ?? user?.name ?? '',
      surname: accountData?.surname ?? user?.surname ?? '',
    });
    setProfileError('');
    setProfileSuccess('');
  }

  async function handleUpdateProfile(e) {
    e.preventDefault();

    const payload = {
      name: profileForm.name.trim(),
      surname: profileForm.surname.trim(),
    };

    if (!payload.name || !payload.surname) {
      setProfileError(t('settings.profileError', 'Заполните имя и фамилию'));
      return;
    }

    try {
      setIsSavingProfile(true);
      setProfileError('');
      setProfileSuccess('');

      const updated = await accountAPI.updateAccount(payload);
      const updatedLogin = updated.login ?? accountLogin;
      setAccountData((prev) => ({
        ...prev,
        ...updated,
        login: updatedLogin ?? prev?.login ?? accountLogin,
      }));
      setProfileSuccess(t('settings.profileSuccess', 'Данные профиля обновлены'));

      if (updateUser) {
        updateUser({
          id: updated.id,
          login: updatedLogin,
          name: updated.name,
          surname: updated.surname,
          email: updated.email,
        });
      }
    } catch (err) {
      const message = err.response?.data?.message || t('settings.profileUpdateError', 'Не удалось обновить профиль');
      setProfileError(message);
    } finally {
      setIsSavingProfile(false);
    }
  }

  function openDeleteModal() {
    setDeleteInput('');
    setDeleteError('');
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    setDeleteInput('');
    setDeleteError('');
    setShowDeleteModal(false);
  }

  async function handleDeleteAccount() {
    if (!deletePhrase || deleteInput.trim() !== deletePhrase) {
      setDeleteError(t('settings.delete.exact', 'Введите точную фразу подтверждения'));
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError('');
      await accountAPI.deleteAccount();
      logout();
      navigate('/login');
    } catch (err) {
      const message = err.response?.data?.message || t('settings.profileDeleteError', 'Не удалось удалить аккаунт');
      setDeleteError(message);
      setIsDeleting(false);
    }
  }

  async function handleLinkEmail(e) {
    e.preventDefault();
    
    if (!email.trim()) {
      setError(t('settings.emailRequired', 'Введите email'));
      return;
    }

    try {
      setIsLinkingEmail(true);
      setError('');
      setSuccessMessage('');
      
      await accountAPI.linkEmail(email);
      
      setShowVerification(true);
      setVerifyType('LINK');
      setSuccessMessage(t('settings.codeSent', 'Код отправлен на {{email}}', { email }));
    } catch (err) {
      console.error('Ошибка привязки email:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'EMAIL_ALREADY_LINKED') {
        setError(t('settings.emailAlreadyLinked', 'Email уже привязан к аккаунту'));
      } else if (errorData?.type === 'EMAIL_ALREADY_EXISTS') {
        setError(t('settings.emailExists', 'Email уже используется'));
      } else if (errorData?.type === 'EMAIL_SEND_CRASH') {
        setError(t('settings.emailSendFailed', 'Не удалось отправить письмо. Попробуйте снова или позже.'));
      } else {
        setError(errorData?.message || t('settings.linkError', 'Не удалось привязать email'));
      }
    } finally {
      setIsLinkingEmail(false);
    }
  }

  async function handleUnlinkEmail() {
    if (!window.confirm(t('settings.unlinkConfirm', 'Точно отвязать email?'))) {
      return;
    }

    try {
      setIsUnlinkingEmail(true);
      setError('');
      setSuccessMessage('');
      
      await accountAPI.unlinkEmail();
      
      setShowVerification(true);
      setVerifyType('UNLINK');
      setSuccessMessage(t('settings.codeSentCurrent', 'Код отправлен на текущий email'));
    } catch (err) {
      console.error('Ошибка отвязки email:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'EMAIL_DONT_LINKED') {
        setError(t('settings.emailNotLinked', 'Email не привязан'));
      } else if (errorData?.type === 'EMAIL_SEND_CRASH') {
        setError(t('settings.emailSendFailed', 'Не удалось отправить письмо. Попробуйте снова или позже.'));
      } else {
        setError(errorData?.message || t('settings.unlinkError', 'Не удалось отвязать email'));
      }
    } finally {
      setIsUnlinkingEmail(false);
    }
  }

  async function handleVerifyEmail(e) {
    e.preventDefault();
    
    if (!verificationCode.trim()) {
      setError(t('settings.codeRequired', 'Введите код подтверждения'));
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      
      const emailToVerify = verifyType === 'LINK' ? email : accountData?.email;
      
      await accountAPI.verifyEmail(emailToVerify, verifyType, parseInt(verificationCode, 10));
      
      setSuccessMessage(
        verifyType === 'LINK' 
          ? t('settings.emailLinked', 'Email подтвержден!') 
          : t('settings.emailUnlinked', 'Отвязка email подтверждена!')
      );
      
      setShowVerification(false);
      setEmail('');
      setVerificationCode('');
      
      if (verifyType === 'LINK') {
        setEmailJustLinked(true);
      }
      
      await loadAccountData();
    } catch (err) {
      console.error('Ошибка подтверждения email:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'INVALID_VERIFICATION_CODE') {
        setError(t('settings.invalidCode', 'Неверный код подтверждения'));
      } else {
        setError(errorData?.message || t('settings.linkError', 'Не удалось подтвердить email'));
      }
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('common.loading', 'Загрузка...')}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/projects')}>
          {t('settings.back', '← Назад')}
        </button>
        <h1>{t('settings.title', 'Настройки аккаунта')}</h1>
      </header>

      <main className={styles.main}>
        <div className={styles.section}>
          <h2>{t('settings.language.title', 'Язык')}</h2>
          <p className={styles.langHint}>{t('settings.language.subtitle', 'Выберите язык интерфейса (по умолчанию русский)')}</p>
          <div className={styles.langSwitch}>
            {availableLanguages.map((code) => (
              <button
                key={code}
                type="button"
                className={`${styles.langBtn} ${language === code ? styles.langBtnActive : ''}`}
                onClick={() => setLanguage(code)}
                disabled={language === code}
              >
                {code.toUpperCase()} · {t(`common.lang.${code}`, code.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.themeRow}>
            <div>
              <h2>{t('settings.theme.title', 'Тема')}</h2>
              <p className={styles.langHint}>{t('settings.theme.subtitle', 'Выберите светлую или тёмную тему')}</p>
            </div>
            <button
              type="button"
              className={`${styles.themeToggle} ${isDark ? styles.themeToggleActive : ''}`}
              onClick={toggleTheme}
              aria-pressed={isDark}
            >
              {isDark ? <MoonIcon /> : <SunIcon />}
              <span className={styles.themeMeta}>
                <span className={styles.themeLabel}>{t('settings.theme.label', 'Текущая тема')}</span>
                <span className={styles.themeState}>{isDark ? t('settings.theme.dark', 'Тёмная') : t('settings.theme.light', 'Светлая')}</span>
              </span>
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <h2>{t('settings.profile', 'Профиль')}</h2>
          {profileError && <div className={styles.error}>{profileError}</div>}
          {profileSuccess && <div className={styles.success}>{profileSuccess}</div>}

          <form onSubmit={handleUpdateProfile} className={styles.profileForm}>
            <label className={styles.fieldGroup}>
              <span className={styles.label}>{t('settings.loginLabel', 'Логин')}</span>
              <input
                type="text"
                value={accountLogin}
                className={styles.input}
                placeholder={t('settings.loginPlaceholder', 'Ваш логин')}
                disabled
                readOnly
              />
              <span className={styles.hint}>{t('settings.loginHint', 'Логин изменить нельзя')}</span>
            </label>

            <div className={styles.dualRow}>
              <label className={styles.fieldGroup}>
                <span className={styles.label}>{t('settings.nameLabel', 'Имя')}</span>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => handleProfileChange('name', e.target.value)}
                  className={styles.input}
                  placeholder={t('settings.namePlaceholder', 'Ваше имя')}
                  required
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>{t('settings.surnameLabel', 'Фамилия')}</span>
                <input
                  type="text"
                  value={profileForm.surname}
                  onChange={(e) => handleProfileChange('surname', e.target.value)}
                  className={styles.input}
                  placeholder={t('settings.surnamePlaceholder', 'Ваша фамилия')}
                  required
                />
              </label>
            </div>

            <div className={styles.btnGroup}>
              <button 
                type="submit" 
                className={styles.btnPrimary}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? t('settings.saveProfileLoading', 'Сохранение...') : t('settings.saveProfile', 'Сохранить изменения')}
              </button>
              <button 
                type="button" 
                className={styles.btnSecondary}
                onClick={resetProfileForm}
                disabled={isSavingProfile}
              >
                {t('settings.resetProfile', 'Сбросить')}
              </button>
            </div>
          </form>
        </div>

        <div className={styles.section}>
          <h2>{t('settings.email', 'Email')}</h2>
          
          {error && <div className={styles.error}>{error}</div>}
          {successMessage && <div className={styles.success}>{successMessage}</div>}

          {accountData?.email ? (
            <div className={styles.emailSection}>
              <div className={styles.currentEmail}>
                <span className={styles.label}>{t('settings.currentEmail', 'Текущий email:')}</span>
                <span className={styles.value}>{accountData.email}</span>
                {accountData.verify_email && (
                  <span className={styles.verified}>{t('settings.emailVerified', 'Почта подтверждена')}</span>
                )}
              </div>
              
              {!showVerification && !emailJustLinked && (
                <button 
                  className={styles.btnDanger}
                  onClick={handleUnlinkEmail}
                  disabled={isUnlinkingEmail}
                >
                  {isUnlinkingEmail ? t('settings.unlinkingEmail', 'Отвязываем...') : t('settings.unlinkEmail', 'Отвязать email')}
                </button>
              )}
            </div>
          ) : (
            !showVerification && (
              <form onSubmit={handleLinkEmail} className={styles.emailForm}>
                <input
                  type="email"
                  placeholder={t('settings.enterEmail', 'Введите email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                  required
                />
                <button 
                  type="submit" 
                  className={styles.btnPrimary}
                  disabled={isLinkingEmail}
                >
                  {isLinkingEmail ? t('settings.linkingEmail', 'Отправляем код...') : t('settings.linkEmail', 'Привязать email')}
                </button>
              </form>
            )
          )}

          {showVerification && (
            <form onSubmit={handleVerifyEmail} className={styles.verificationForm}>
              <p className={styles.verificationText}>
                {t('settings.verificationPrompt', 'Введите код подтверждения из письма:')}
              </p>
              <input
                type="text"
                placeholder={t('settings.verificationPlaceholder', 'Код подтверждения')}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className={styles.input}
                required
              />
              <div className={styles.btnGroup}>
                <button type="submit" className={styles.btnPrimary}>
                  {t('settings.verify', 'Подтвердить')}
                </button>
                <button 
                  type="button" 
                  className={styles.btnSecondary}
                  onClick={() => {
                    setShowVerification(false);
                    setVerificationCode('');
                    setError('');
                    setSuccessMessage('');
                  }}
                >
                  {t('common.cancel', 'Отмена')}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className={`${styles.section} ${styles.dangerSection}`}>
          <div className={styles.dangerHeader}>
            <div>
              <h2>{t('settings.delete.title', 'Удаление аккаунта')}</h2>
              <p className={styles.dangerText}>{t('settings.delete.warning', 'Действие необратимо. Все данные будут удалены.')}</p>
            </div>
            <button 
              className={styles.btnDanger}
              onClick={openDeleteModal}
              disabled={!accountLogin}
            >
              {t('settings.delete.open', 'Удалить аккаунт')}
            </button>
          </div>
        </div>
      </main>

      {showDeleteModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>{t('settings.delete.confirmTitle', 'Подтвердите удаление')}</h3>
            <p className={styles.modalText}>
              {t('settings.delete.promptText', 'Чтобы удалить аккаунт, введите')}{' '}
              <span className={styles.modalPhrase}>{deletePhrase || t('settings.delete.placeholder', 'удалить мой аккаунт {логин}')}</span>.
            </p>
            {deleteError && <div className={styles.error}>{deleteError}</div>}
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className={styles.input}
              placeholder={deletePhrase || t('settings.delete.placeholder', 'удалить мой аккаунт {логин}')}
            />
            <div className={styles.modalActions}>
              <button 
                type="button" 
                className={styles.btnSecondary}
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleDeleteAccount}
                disabled={!deletePhrase || deleteInput.trim() !== deletePhrase || isDeleting}
              >
                {isDeleting ? t('settings.delete.deleting', 'Удаляем...') : t('common.deleteAccount', 'Удалить аккаунт')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

src/pages/Settings/Settings.module.css
.container {
  min-height: 100vh;
  background: var(--page-gradient);
  padding: 20px;
  color: var(--text-primary);
}

.header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
  padding: 0 20px;
}

.header h1 {
  color: var(--text-primary);
  font-size: 32px;
  font-weight: 700;
  margin: 0;
}

.backBtn {
  background: var(--frost);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
}

.backBtn:hover {
  background: var(--frost-strong);
  transform: translateX(-2px);
}

.loading {
  text-align: center;
  padding: 100px 20px;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 600;
}

.main {
  max-width: 800px;
  margin: 0 auto;
}

.section {
  background: var(--surface);
  border-radius: 20px;
  padding: 30px;
  margin-bottom: 20px;
  box-shadow: 0 10px 40px var(--shadow-soft);
  border: 1px solid var(--border);
}

.section h2 {
  margin: 0 0 20px 0;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 600;
}

.infoGrid {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.infoItem {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.infoItem:last-child {
  border-bottom: none;
}

.label {
  color: var(--text-muted);
  font-weight: 500;
  min-width: 120px;
}

.value {
  color: var(--text-primary);
  font-weight: 600;
}

.profileForm {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fieldGroup {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dualRow {
  display: flex;
  gap: 16px;
}

.dualRow .fieldGroup {
  flex: 1;
}

.error {
  background: var(--danger-soft);
  border: 1px solid var(--danger);
  color: var(--danger-strong);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 15px;
  font-size: 14px;
}

.success {
  background: var(--success-soft);
  border: 1px solid var(--success);
  color: var(--success);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 15px;
  font-size: 14px;
}

.langHint {
  color: var(--text-subtle);
  margin: 0 0 12px 0;
  font-size: 14px;
}

.langSwitch {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.langBtn {
  background: var(--badge);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  padding: 10px 16px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.langBtn:hover {
  background: var(--surface-raised);
  transform: translateY(-1px);
}

.langBtnActive {
  background: var(--primary-gradient);
  border-color: transparent;
  color: var(--text-inverse);
  box-shadow: 0 8px 20px var(--shadow-soft);
}

.langBtn:disabled {
  cursor: default;
  transform: none;
  opacity: 0.95;
}

.emailSection {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.currentEmail {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: var(--surface-raised);
  border-radius: 12px;
}

.verified {
  color: var(--success);
  font-weight: 600;
  font-size: 14px;
}

.emailForm,
.verificationForm {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.input {
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 12px;
  font-size: 16px;
  color: var(--text-primary);
  transition: all 0.3s ease;
  background: var(--input-bg);
}

.input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.input:disabled {
  background: var(--input-disabled);
  color: var(--text-subtle);
  cursor: not-allowed;
}

.hint {
  color: var(--text-subtle);
  font-size: 12px;
}

.btnPrimary {
  background: var(--primary-gradient);
  color: var(--text-inverse);
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btnPrimary:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px var(--shadow-strong);
}

.btnPrimary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btnSecondary {
  background: var(--badge);
  color: var(--text-primary);
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btnSecondary:hover {
  background: var(--surface-raised);
}

.btnDanger {
  background: var(--danger);
  color: var(--text-inverse);
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  align-self: flex-start;
}

.btnDanger:hover {
  background: var(--danger-strong);
  transform: translateY(-2px);
  box-shadow: 0 5px 20px var(--shadow-strong);
}

.btnDanger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.dangerSection {
  border: 1px solid var(--danger-soft);
  background: linear-gradient(135deg, var(--surface) 0%, var(--surface-raised) 70%);
}

.dangerHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.dangerText {
  margin: 8px 0 0 0;
  color: var(--danger-strong);
}

.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 10;
}

.modal {
  background: var(--surface);
  border-radius: 16px;
  padding: 24px;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 20px 40px var(--shadow-soft);
  border: 1px solid var(--border);
}

.modal h3 {
  margin: 0 0 10px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.modalText {
  margin: 0 0 6px 0;
  color: var(--text-primary);
}

.modalPhrase {
  color: var(--text-primary);
  font-weight: 700;
  background: var(--badge);
  padding: 2px 6px;
  border-radius: 6px;
}

.modalHint {
  margin: 0 0 12px 0;
  color: var(--text-muted);
  font-size: 14px;
}

.code {
  background: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
}

.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.verificationText {
  color: var(--text-muted);
  margin: 0 0 10px 0;
}

.btnGroup {
  display: flex;
  gap: 10px;
}

.themeRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.themeToggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 6px 20px var(--shadow-soft);
}

.themeToggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px var(--shadow-strong);
}

.themeToggleActive {
  background: var(--primary-gradient);
  color: var(--text-inverse);
  border-color: transparent;
}

.themeGlyph {
  width: 20px;
  height: 20px;
}

.themeMeta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.themeLabel {
  font-size: 14px;
  color: inherit;
  opacity: 0.85;
}

.themeState {
  font-weight: 700;
  font-size: 16px;
}

@media (max-width: 768px) {
  .header h1 {
    font-size: 24px;
  }

  .section {
    padding: 20px;
  }

  .currentEmail {
    flex-direction: column;
    align-items: flex-start;
  }

  .dualRow {
    flex-direction: column;
  }

  .dangerHeader {
    flex-direction: column;
    align-items: flex-start;
  }

  .btnGroup {
    flex-direction: column;
  }

  .btnGroup button {
    width: 100%;
  }
}

src/routes/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}>
          <div style={{
            color: 'white',
            fontSize: '20px',
            fontWeight: '600',
          }}>
          {t('common.loading', 'Загрузка...')}
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

src/routes/index.jsx


src/services/api.js
import axios from 'axios';

//запросы через Vite proxy
const API_BASE_URL = import.meta.env.VITE_API_URL || '/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

//для добавления токена к запросам
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

//обработка ошибок и обновление токена
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRequest =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/registration') ||
      originalRequest?.url?.includes('/auth/refresh');

    // Для запросов авторизации возвращаем ошибку сразу, чтобы отобразить ответ бэка
    if (isAuthRequest) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

//апи для авторизации
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/registration', userData);
    return response.data;
  },

  refresh: async (refreshToken) => {
    const response = await api.post('/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  },
};

//для будущего
export const projectsAPI = {
  getAll: async () => {
    const response = await api.get('/project');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/project/${id}`);
    return response.data;
  },

  create: async (projectData) => {
    // Проверяем что файл обязательно выбран
    if (!projectData.file) {
      throw new Error('Необходимо выбрать ZIP-файл проекта для загрузки');
    }

    // Создаём FormData для отправки файла
    const formData = new FormData();
    formData.append('file', projectData.file);

    // name и description отправляются как query параметры согласно API спецификации
    // ВАЖНО: Удаляем Content-Type из headers чтобы браузер сам добавил boundary
    const response = await api.post('/project', formData, {
      headers: {
        'Content-Type': undefined, // ✅ Удаляем глобальный application/json
      },
      params: {
        name: projectData.name,
        description: projectData.description,
      },
    });

    return response.data;
  },

  update: async (id, projectData) => {
    const response = await api.patch(`/project/${id}`, projectData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/project/${id}`);
    return response.data;
  },
};

// API для домашней страницы
export const homeAPI = {
  getHomepage: async () => {
    const response = await api.get('/home');
    return response.data;
  },
};

// API для работы с аккаунтом
export const accountAPI = {
  // Получить данные аккаунта
  getAccount: async () => {
    const response = await api.get('/account');
    return response.data;
  },

  updateAccount: async (payload) => {
    const response = await api.patch('/account', payload);
    return response.data;
  },

  deleteAccount: async () => {
    const response = await api.delete('/account');
    return response.data;
  },

  // Привязать email
  linkEmail: async (email) => {
    const response = await api.post('/account/email', null, {
      params: { email }
    });
    return response.data;
  },

  // Отвязать email
  unlinkEmail: async () => {
    const response = await api.delete('/account/email');
    return response.data;
  },

  // Верифицировать email
  verifyEmail: async (email, verifyType, verificationCode) => {
    const response = await api.post('/account/verification_email', null, {
      params: {
        email,
        verify_type: verifyType, // 'LINK' или 'UNLINK'
        verification_code: verificationCode
      }
    });
    return response.data;
  },
};

export default api;

src/services/grpcClient-grpc-web.js
/**
 * gRPC Web Client для подключения к Core сервису через Envoy
 * 
 * ВЕРСИЯ С grpc-web и сгенерированными классами из .proto
 * 
 * АРХИТЕКТУРА:
 * ============
 * 1. Используем FrontendStreamServiceClient из сгенерированных proto
 * 2. AlgorithmRequest и GraphPartResponse автоматически кодируются/декодируются
 * 3. Вся работа с бинарными данными делегирована grpc-web библиотеке
 * 
 * ТРЕБОВАНИЯ:
 * ===========
 * 1. npm install grpc-web google-protobuf
 * 2. Сгенерированные файлы в src/grpc/:
 *    - api_core_pb.js
 *    - api_core_grpc_web_pb.js  
 *    - shared_common_pb.js
 */

// Импорты из сгенерированных файлов
// ⚠️ ВАЖНО: Эти файлы должны быть сгенерированы с помощью protoc!
// Команда генерации описана в GRPC_WEB_SETUP.md
import { FrontendStreamServiceClient } from "../grpc/api_core_grpc_web_pb";
import { AlgorithmRequest } from "../grpc/api_core_pb";
import { ParseStatus } from "../grpc/shared_common_pb";

/**
 * Класс для работы с gRPC стримом архитектуры через grpc-web
 */
class GRPCArchitectureClient {
  constructor(envoyUrl = null) {
    const envGrpcUrl = import.meta.env?.VITE_GRPC_URL;
    const isDev = import.meta.env?.DEV;
    const shouldUseProxy = isDev && (!envGrpcUrl || envGrpcUrl.includes("78.153.139.47"));

    if (shouldUseProxy) {
      this.envoyUrl = "/grpc";
    } else if (envGrpcUrl) {
      this.envoyUrl = envGrpcUrl;
    } else if (envoyUrl) {
      this.envoyUrl = envoyUrl;
    } else {
      this.envoyUrl = "http://78.153.139.47:8080";
    }

    console.log("[grpc-web] init", {
      envoyUrl: this.envoyUrl,
      envGrpcUrl,
      passedEnvoyUrl: envoyUrl,
      locationOrigin: typeof window !== "undefined" ? window.location.origin : "n/a",
      dev: isDev,
      shouldUseProxy,
    });
    
    if (shouldUseProxy) {
      console.log("[grpc-web] 🔧 DEV MODE: используем proxy /grpc для избежания CORS");
    }
    
    if (typeof this.envoyUrl === "string" && this.envoyUrl.startsWith("/")) {
      console.log("[grpc-web] ✅ Используется относительный URL (proxy), CORS проблем не будет");
    }

    // Создаём grpc-web клиента
    this.client = new FrontendStreamServiceClient(this.envoyUrl, null, null);
  }

  /**
   * Читабельное имя статуса
   */
  getStatusName(status) {
    const names = {
      [ParseStatus.START]: "START",
      [ParseStatus.REQUIREMENTS]: "REQUIREMENTS",
      [ParseStatus.ENDPOINTS]: "ENDPOINTS",
      [ParseStatus.ARHITECTURE]: "ARHITECTURE",
      [ParseStatus.DONE]: "DONE",
    };
    return names[status] || `UNKNOWN(${status})`;
  }

  /**
   * Основной метод подключения к серверному стриму RunAlgorithm
   *
   * @param {number} userId      - ID пользователя
   * @param {number} taskId      - ID задачи (project ID)
   * @param {object} callbacks   - { onStart, onRequirements, onEndpoints, onArchitecture, onDone, onError }
   * @param {number} delayMs     - задержка перед подключением (для только что созданных проектов)
   * @returns {Promise<{abort: () => void}>} - объект с методом abort() для отмены стрима
   */
  async connectToStream(userId, taskId, callbacks = {}, delayMs = 0) {
    if (delayMs > 0) {
      console.log(`⏱️ Ожидание ${delayMs}ms перед подключением к gRPC (grpc-web)...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.log(`📡 [grpc-web] Подключение к RunAlgorithm: user_id=${userId}, task_id=${taskId}`);

    const numericUserId = Number(userId);
    const numericTaskId = Number(taskId);

    if (!Number.isFinite(numericUserId) || !Number.isFinite(numericTaskId)) {
      const err = new Error("userId и taskId должны быть числами");
      console.error("[grpc-web] ❌ Некорректные параметры:", { userId, taskId });
      callbacks.onError?.(err);
      throw err;
    }

    // Формируем AlgorithmRequest через сгенерированный класс
    const request = new AlgorithmRequest();
    request.setUserId(numericUserId);
    request.setTaskId(numericTaskId);

    // Если захочешь гонять токен до Envoy:
    // const token = localStorage.getItem("access_token");
    // const metadata = token ? { Authorization: `Bearer ${token}` } : {};
    const metadata = {}; // сейчас Core не использует JWT, оставим пустым

    const timeoutMs = Number(import.meta.env?.VITE_GRPC_TIMEOUT_MS ?? 60000);
    let receivedDone = false;
    let messageCount = 0;
    let timedOut = false;
    let timeoutId = null;

    console.log("[grpc-web] Старт стрима runAlgorithm", {
      baseUrl: this.envoyUrl,
      timeoutMs,
    });

    // Запускаем стрим через grpc-web
    const stream = this.client.runAlgorithm(request, metadata);

    // Настраиваем таймаут: если долго нет DONE — прерываем
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        console.error("[grpc-web] ⏰ Таймаут ожидания DONE, отменяем стрим", {
          userId: numericUserId,
          taskId: numericTaskId,
          timeoutMs,
        });
        stream.cancel();
        const timeoutError = new Error("gRPC request timed out: DONE status not received");
        callbacks.onError?.(timeoutError);
      }, timeoutMs);
    }

    // Обработка входящих сообщений
    stream.on("data", (resp) => {
      messageCount += 1;

      const status = resp.getStatus();
      const responseId = resp.getResponseId ? resp.getResponseId() : undefined;

      console.log(`📬 [grpc-web] msg #${messageCount}`, {
        status: this.getStatusName(status),
        responseId,
      });

      // Собираем "унифицированный" объект сообщения, похожий на то, что было в ручной версии
      const msg = { status, response_id: responseId };

      switch (status) {
        case ParseStatus.START: {
          this._handleStreamMessage(msg, callbacks);
          break;
        }

        case ParseStatus.REQUIREMENTS: {
          const part = resp.getGraphRequirements();
          const total = part?.getTotal?.() ?? 0;
          const reqs = part?.getRequirementsList?.() ?? [];
          msg.requirements = reqs;
          msg.total_requirements = total;
          this._handleStreamMessage(msg, callbacks);
          break;
        }

        case ParseStatus.ENDPOINTS: {
          const part = resp.getGraphEndpoints();
          const total = part?.getTotal?.() ?? 0;
          let endpointsObj = {};

          // map<string,string> endpoints → JS-объект
          const endpointsMap = part?.getEndpointsMap?.();
          if (endpointsMap && typeof endpointsMap.forEach === "function") {
            endpointsMap.forEach((value, key) => {
              endpointsObj[key] = value;
            });
          }

          msg.endpoints = endpointsObj;
          msg.total_endpoints = total;
          this._handleStreamMessage(msg, callbacks);
          break;
        }

        case ParseStatus.ARHITECTURE: {
          const part = resp.getGraphArchitecture();
          const parent = part?.getParent?.() ?? "";
          const children = part?.getChildrenList?.() ?? [];
          msg.parent = parent;
          msg.children = children;
          this._handleStreamMessage(msg, callbacks);
          break;
        }

        case ParseStatus.DONE: {
          receivedDone = true;
          console.log("✅ [grpc-web] Получен статус DONE");
          this._handleStreamMessage(msg, callbacks);
          break;
        }

        default: {
          console.warn("[grpc-web] ⚠️ Неизвестный статус:", status);
          this._handleStreamMessage(msg, callbacks);
        }
      }
    });

    // Ошибка стрима
    stream.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);

      // Если это мы сами отменили из-за таймаута — ошибку уже прокинули
      if (timedOut) {
        return;
      }

      console.error("❌ [grpc-web] Ошибка стрима:", err);
      callbacks.onError?.(err);
    });

    // Конец стрима
    stream.on("end", () => {
      if (timeoutId) clearTimeout(timeoutId);

      console.log("[grpc-web] Stream завершён", {
        messageCount,
        receivedDone,
      });

      if (messageCount === 0) {
        const err = new Error(
          "Stream завершился без данных. Возможно, проект не найден или произошла ошибка на сервере."
        );
        console.error("❌ [grpc-web] Stream без сообщений");
        callbacks.onError?.(err);
        return;
      }

      if (!receivedDone) {
        const err = new Error(
          `Stream прерван преждевременно.\n\n` +
            `Получено сообщений: ${messageCount}\n` +
            `Статус DONE не получен.\n\n` +
            `Возможные причины:\n` +
            `• Ошибка в алгоритме анализа на сервере\n` +
            `• Таймаут обработки\n` +
            `• Проблема с файлом проекта\n` +
            `• Недостаточно памяти на сервере\n\n` +
            `Проверьте логи Core gRPC сервиса`
        );
        console.error("❌ [grpc-web] Stream завершён без DONE");
        callbacks.onError?.(err);
        return;
      }

      console.log("✅ [grpc-web] Stream завершён корректно");
      callbacks.onDone?.();
    });

    // Возвращаем объект с abort(), чтобы внешний код мог отменить стрим
    const controllerLike = {
      abort: () => {
        console.log("🛑 [grpc-web] Принудительная отмена стрима");
        if (timeoutId) clearTimeout(timeoutId);
        stream.cancel();
      },
    };

    return controllerLike;
  }

  /**
   * Обработка одного сообщения из stream (интерфейс как раньше)
   * @private
   */
  _handleStreamMessage(message, callbacks) {
    const { status, response_id, requirements, endpoints, parent, children } = message;

    console.log(
      `📨 [grpc-web] Обработка: status=${this.getStatusName(status)}, response_id=${response_id}`
    );

    switch (status) {
      case ParseStatus.START:
        console.log("🎬 START - анализ начался");
        callbacks.onStart?.();
        break;

      case ParseStatus.REQUIREMENTS:
        console.log(
          `📋 REQUIREMENTS - получено ${requirements?.length ?? 0} зависимостей`
        );
        callbacks.onRequirements?.({
          requirements: requirements || [],
        });
        break;

      case ParseStatus.ENDPOINTS:
        console.log(
          `🔗 ENDPOINTS - получено ${endpoints ? Object.keys(endpoints).length : 0} эндпоинтов`
        );
        callbacks.onEndpoints?.({
          endpoints: endpoints || {},
        });
        break;

      case ParseStatus.ARHITECTURE:
        console.log(
          `🏗️ ARHITECTURE - узел ${parent} с ${children?.length ?? 0} детьми`
        );
        callbacks.onArchitecture?.({
          parent,
          children: children || [],
        });
        break;

      case ParseStatus.DONE:
        console.log("✅ DONE - анализ завершён (финальная обработка в stream.on('end'))");
        break;

      default:
        console.warn("⚠️ Неизвестный статус:", status);
    }
  }
}

// Singleton, как было раньше
const grpcClient = new GRPCArchitectureClient();

export { GRPCArchitectureClient, grpcClient, ParseStatus };
export default grpcClient;

src/services/grpcClient-new.js
/**
 * gRPC Web Client для подключения к Core сервису через Envoy
 * НОВАЯ РЕАЛИЗАЦИЯ с использованием сгенерированных proto файлов
 * 
 * АРХИТЕКТУРА БЭКЕНДА:
 * =====================
 * 1. REST API (FastAPI) на порту 8000
 *    - GET /v1/project/{project_id} - получение метаданных проекта
 * 
 * 2. Core gRPC Service на порту 50051
 *    - Метод: /core.api.FrontendStreamService/RunAlgorithm
 *    - Запрос: AlgorithmRequest {user_id: int64, task_id: int64}
 *    - Ответ: серверный стрим GraphPartResponse
 * 
 * 3. Envoy Proxy на порту 8080
 *    - gRPC-Web gateway для браузерных клиентов
 */

import { SimpleFrontendStreamServiceClient } from '../grpc/api_core_grpc_web_pb';
import { AlgorithmRequest } from '../grpc/api_core_pb';
import { ParseStatus } from '../grpc/shared_common_pb';

/**
 * Класс для работы с gRPC стримом архитектуры
 * Использует сгенерированные proto-клиенты
 */
class GRPCArchitectureClient {
  constructor(envoyUrl = null) {
    const envGrpcUrl = import.meta.env?.VITE_GRPC_URL;
    const isDev = import.meta.env?.DEV;
    const shouldUseProxy = isDev && (!envGrpcUrl || envGrpcUrl.includes('78.153.139.47'));
    
    if (shouldUseProxy) {
      this.envoyUrl = '/grpc';
    } else if (envGrpcUrl) {
      this.envoyUrl = envGrpcUrl;
    } else if (envoyUrl) {
      this.envoyUrl = envoyUrl;
    } else {
      this.envoyUrl = 'http://78.153.139.47:8080';
    }

    // Создаём клиент gRPC-Web
    this.client = new SimpleFrontendStreamServiceClient(this.envoyUrl);

    console.log('[grpc] init (NEW IMPLEMENTATION)', {
      envoyUrl: this.envoyUrl,
      envGrpcUrl,
      dev: isDev,
      shouldUseProxy
    });
    
    if (shouldUseProxy) {
      console.log('[grpc] 🔧 DEV MODE: используем proxy /grpc для избежания CORS');
    }
  }

  /**
   * Подключение к стриму RunAlgorithm через gRPC-Web
   * 
   * @param {number} userId - ID пользователя
   * @param {number} taskId - ID задачи (project ID)
   * @param {object} callbacks - Коллбэки для обработки данных
   * @param {number} delayMs - Задержка перед подключением (для новых проектов)
   * @returns {Promise<Object>} - объект с методом cancel() для отмены
   */
  async connectToStream(userId, taskId, callbacks, delayMs = 0) {
    if (delayMs > 0) {
      console.log(`⏱️ Ожидание ${delayMs}ms перед подключением к gRPC...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    console.log(`📡 Подключение к gRPC стриму: user_id=${userId}, task_id=${taskId}`);

    // Создаём запрос используя сгенерированный класс
    const request = new AlgorithmRequest();
    request.setUserId(parseInt(userId));
    request.setTaskId(parseInt(taskId));

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 ОТПРАВКА gRPC ЗАПРОСА (NEW)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 URL:', `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`);
    console.log('👤 User ID:', parseInt(userId));
    console.log('📋 Task ID:', parseInt(taskId));
    console.log('📦 Using generated proto classes');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let receivedDone = false;
    let messageCount = 0;
    let timedOut = false;
    const timeoutMs = Number(import.meta.env?.VITE_GRPC_TIMEOUT_MS ?? 60000);
    let timeoutId = null;

    // Вызываем метод runAlgorithm
    const stream = this.client.runAlgorithm(request, {});

    // Устанавливаем таймаут после начала stream
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        stream.cancel();
        console.error('[grpc] timeout waiting for DONE status', { userId, taskId, timeoutMs });
        const error = new Error('gRPC request timed out: DONE status not received');
        callbacks.onError?.(error);
      }, timeoutMs);
    }

    // Обработчик данных
    stream.on('data', (message) => {
      messageCount++;
      const status = message.getStatus();
      const responseId = message.getResponseId();
      
      console.log(`📬 Получено сообщение #${messageCount}:`, {
        status: this.getStatusName(status),
        response_id: responseId
      });

      // Отслеживаем DONE
      if (status === ParseStatus.DONE) {
        receivedDone = true;
        console.log('✅ Получен статус DONE - stream завершён успешно');
      }

      this._handleStreamMessage(message, callbacks);
    });

    // Обработчик ошибок
    stream.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      
      if (!timedOut) {
        console.error('❌ gRPC stream error:', error);
        
        let errorMsg = `gRPC request failed: ${error.message}`;
        
        if (error.code === 500) {
          errorMsg += '\n\n❌ Внутренняя ошибка Core gRPC сервиса.';
          errorMsg += '\n\nВозможные причины:';
          errorMsg += '\n• Проект не найден в БД (task_id=' + taskId + ')';
          errorMsg += '\n• Файл проекта отсутствует или повреждён';
          errorMsg += '\n• Ошибка парсинга/анализа кода';
          errorMsg += '\n\nПроверьте логи: docker logs -f core-service';
        } else if (error.code === 404) {
          errorMsg += '\nЭндпоинт не найден. Проверьте конфигурацию Envoy.';
        } else if (error.code === 502 || error.code === 503) {
          errorMsg += '\nCore gRPC сервис недоступен. Проверьте: docker ps | grep core';
        }
        
        const wrappedError = new Error(errorMsg);
        callbacks.onError?.(wrappedError);
      }
    });

    // Обработчик завершения stream
    stream.on('end', () => {
      if (timeoutId) clearTimeout(timeoutId);
      
      console.log(`📭 Stream завершён. Получено сообщений: ${messageCount}`);

      // Проверяем получение DONE
      if (messageCount === 0) {
        console.error('❌ Stream завершился без сообщений');
        const error = new Error('Stream завершился без данных. Возможно, проект не найден.');
        callbacks.onError?.(error);
        return;
      }

      if (!receivedDone) {
        console.error('❌ Stream оборвался до получения статуса DONE');
        const error = new Error(
          `Stream прерван преждевременно.\n\n` +
          `Получено сообщений: ${messageCount}\n` +
          `Статус DONE не получен.\n\n` +
          `Проверьте логи Core gRPC сервиса`
        );
        callbacks.onError?.(error);
        return;
      }

      // Успешное завершение
      console.log('✅ Stream завершён корректно');
      callbacks.onDone?.();
    });

    // Возвращаем объект для возможности отмены
    return {
      cancel: () => {
        if (timeoutId) clearTimeout(timeoutId);
        stream.cancel();
      }
    };
  }

  getStatusName(status) {
    const names = ['START', 'REQUIREMENTS', 'ENDPOINTS', 'ARHITECTURE', 'DONE'];
    return names[status] || `UNKNOWN(${status})`;
  }

  /**
   * Обработка одного сообщения из stream
   * @private
   */
  _handleStreamMessage(message, callbacks) {
    const status = message.getStatus();
    const responseId = message.getResponseId();
    
    console.log(`📨 Обработка сообщения: status=${this.getStatusName(status)}, response_id=${responseId}`);

    switch (status) {
      case ParseStatus.START:
        console.log('🎬 START - анализ начался');
        callbacks.onStart?.();
        break;

      case ParseStatus.REQUIREMENTS:
        const graphReq = message.getGraphRequirements();
        if (graphReq) {
          const requirements = graphReq.getRequirementsList();
          console.log(`📋 REQUIREMENTS - получено ${requirements.length} зависимостей`);
          callbacks.onRequirements?.({
            requirements: requirements || []
          });
        }
        break;

      case ParseStatus.ENDPOINTS:
        const graphEndp = message.getGraphEndpoints();
        if (graphEndp) {
          const endpointsMap = graphEndp.getEndpointsMap();
          const endpoints = {};
          
          // Конвертируем Map в обычный объект
          if (endpointsMap) {
            endpointsMap.forEach((value, key) => {
              endpoints[key] = value;
            });
          }
          
          console.log(`🔗 ENDPOINTS - получено ${Object.keys(endpoints).length} эндпоинтов`);
          callbacks.onEndpoints?.({
            endpoints: endpoints || {}
          });
        }
        break;

      case ParseStatus.ARHITECTURE:
        const graphArch = message.getGraphArchitecture();
        if (graphArch) {
          const parent = graphArch.getParent();
          const children = graphArch.getChildrenList();
          console.log(`🏗️ ARHITECTURE - узел ${parent} с ${children.length} детьми`);
          callbacks.onArchitecture?.({
            parent,
            children: children || []
          });
        }
        break;

      case ParseStatus.DONE:
        console.log('✅ DONE - анализ завершён');
        // onDone вызывается в обработчике 'end'
        break;

      default:
        console.warn('⚠️ Неизвестный статус:', status);
    }
  }
}

// Экспортируем класс и создаём singleton instance
const grpcClient = new GRPCArchitectureClient();

export { GRPCArchitectureClient, grpcClient, ParseStatus };
export default grpcClient;

src/services/grpcClient-old.js
/**
 * gRPC Web Client для подключения к Core сервису через Envoy
 * 
 * АРХИТЕКТУРА БЭКЕНДА:
 * =====================
 * 1. REST API (FastAPI) на порту 8000
 *    - GET /v1/project/{project_id} - получение метаданных проекта
 *    - Требует заголовок: Authorization: Bearer <JWT>
 *    - Возвращает: {id, name, description, picture_url, architecture:{requirements[], endpoints[], data{}}}
 * 
 * 2. Core gRPC Service на порту 50051
 *    - Метод: /core.api.FrontendStreamService/RunAlgorithm
 *    - Запрос: AlgorithmRequest {user_id: int64, task_id: int64}
 *    - Ответ: серверный стрим GraphPartResponse
 * 
 * 3. Envoy Proxy на порту 8080
 *    - gRPC-Web gateway для браузерных клиентов
 *    - Транслирует gRPC-Web (HTTP/1.1) в нативный gRPC (HTTP/2)
 * 
 * ПОТОК АНАЛИЗА:
 * ==============
 * 1. Frontend отправляет binary Protobuf через POST:
 *    URL: http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm
 *    Headers: Content-Type: application/grpc-web+proto
 *    Body: [0x08, user_id, 0x10, task_id] (varint encoded)
 * 
 * 2. Backend отвечает серверным стримом с последовательностью сообщений:
 *    GraphStatus.START (0) → REQUIREMENTS (1) → ENDPOINTS (2) → ARCHITECTURE (3) → DONE (4)
 * 
 * 3. Frontend получает каждое сообщение в формате:
 *    [compressed-flag(1 byte)][length(4 bytes BE)][GraphPartResponse protobuf]
 * 
 * 4. КРИТИЧЕСКИ ВАЖНО: Stream считается успешным ТОЛЬКО если получен статус DONE.
 *    Если stream оборвался до DONE - это ошибка, нужно показать пользователю.
 * 
 * ОБРАБОТКА ОШИБОК:
 * =================
 * - 401 INVALID_TOKEN - токен невалиден
 * - 404 PROJECT_NO_RIGHT_OR_NOT_FOUND - проект не найден или нет прав
 * - 422 VALIDATION_ERROR - ошибка валидации параметров
 * - 500 INTERNAL_SERVER_ERROR - ошибка на сервере (проверить логи Core)
 * - 502/503 - Core gRPC сервис недоступен
 * 
 * ВАЖНО: Бэкенд ожидает бинарный Protobuf, НЕ JSON!
 * Используется ручная сериализация/десериализация Protobuf (временно).
 * TODO: Генерировать клиент из proto-файлов с помощью protoc
 */

// gRPC-Web статусы из proto/shared/common.proto
const ParseStatus = {
  START: 0,
  REQUIREMENTS: 1,
  ENDPOINTS: 2,
  ARHITECTURE: 3,  // Обратите внимание: ARHITECTURE (опечатка в proto)
  DONE: 4
};

/**
 * Класс для работы с gRPC стримом архитектуры
 * 
 * ВРЕМЕННОЕ РЕШЕНИЕ: Используем прямые бинарные запросы
 * TODO: Генерировать клиент из proto-файлов с помощью protoc
 */
class GRPCArchitectureClient {
  constructor(envoyUrl = null) {
    const envGrpcUrl = import.meta.env?.VITE_GRPC_URL;
    // Приоритет: VITE_GRPC_URL → переданный аргумент → dev proxy /grpc → продовый Envoy
    // ВАЖНО: В dev режиме НЕ используем VITE_GRPC_URL если он указывает на внешний IP
    const isDev = import.meta.env?.DEV;
    const shouldUseProxy = isDev && (!envGrpcUrl || envGrpcUrl.includes('78.153.139.47'));
    
    if (shouldUseProxy) {
      this.envoyUrl = '/grpc';
    } else if (envGrpcUrl) {
      this.envoyUrl = envGrpcUrl;
    } else if (envoyUrl) {
      this.envoyUrl = envoyUrl;
    } else {
      this.envoyUrl = 'http://78.153.139.47:8080';
    }

    console.log('[grpc] init', {
      envoyUrl: this.envoyUrl,
      envGrpcUrl,
      passedEnvoyUrl: envoyUrl,
      locationOrigin: typeof window !== 'undefined' ? window.location.origin : 'n/a',
      dev: import.meta.env?.DEV,
      shouldUseProxy,
    });
    if (shouldUseProxy) {
      console.log('[grpc] 🔧 DEV MODE: используем proxy /grpc для избежания CORS');
    }
    if (typeof this.envoyUrl === 'string' && this.envoyUrl.startsWith('/')) {
      console.log('[grpc] ✅ Используется относительный URL (proxy), CORS проблем не будет');
    }
  }

  /**
   * Создание Protobuf запроса AlgorithmRequest
   * 
   * Формат (согласно proto/core/api/core.proto):
   * message AlgorithmRequest {
   *   int64 user_id = 1;
   *   int64 task_id = 2;
   * }
   * 
   * Protobuf encoding (varint):
   * field_number = 1, wire_type = 0 (varint) → tag = (1 << 3) | 0 = 0x08
   * field_number = 2, wire_type = 0 (varint) → tag = (2 << 3) | 0 = 0x10
   */
  encodeAlgorithmRequest(userId, taskId) {
    const buffer = [];
    
    // Поле 1: user_id (int64)
    buffer.push(0x08); // tag для field 1
    this.writeVarint(buffer, userId);
    
    // Поле 2: task_id (int64)
    buffer.push(0x10); // tag для field 2
    this.writeVarint(buffer, taskId);
    
    return new Uint8Array(buffer);
  }

  /**
   * Кодирование varint (переменная длина для чисел)
   */
  writeVarint(buffer, value) {
    while (value > 0x7f) {
      buffer.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    buffer.push(value & 0x7f);
  }

  /**
   * Декодирование Protobuf ответа GraphPartResponse
   * 
   * Формат (согласно proto/shared/common.proto):
   * message GraphPartResponse {
   *   int64 task_id = 1;
   *   int32 response_id = 2;
   *   ParseStatus status = 3;
   *   oneof graph_part_type {
   *     GraphPartRequirements graph_requirements = 4;
   *     GraphPartEndpoints graph_endpoints = 5;
   *     GraphPartArchitecture graph_architecture = 6;
   *   }
   * }
   */
  decodeGraphPartResponse(bytes) {
    const result = {
      task_id: null,
      response_id: null,
      status: null,
      requirements: [],
      endpoints: {},
      parent: null,
      children: []
    };

    let pos = 0;
    const data = new Uint8Array(bytes);

    while (pos < data.length) {
      // Читаем tag (field_number << 3 | wire_type)
      const { value: tag, length: tagLen } = this.readVarint(data, pos);
      pos += tagLen;

      const fieldNumber = tag >>> 3;
      const wireType = tag & 0x07;

      switch (fieldNumber) {
        case 1: // task_id (int64, varint)
          const { value: taskId, length: taskIdLen } = this.readVarint(data, pos);
          result.task_id = taskId;
          pos += taskIdLen;
          break;

        case 2: // response_id (int32, varint)
          const { value: respId, length: respIdLen } = this.readVarint(data, pos);
          result.response_id = respId;
          pos += respIdLen;
          break;

        case 3: // status (enum ParseStatus, varint)
          const { value: status, length: statusLen } = this.readVarint(data, pos);
          result.status = status;
          pos += statusLen;
          break;

        case 4: // graph_requirements (message GraphPartRequirements)
          const { value: reqMsg, length: reqMsgLen } = this.readLengthDelimited(data, pos);
          const requirements = this.decodeGraphPartRequirements(reqMsg);
          result.requirements = requirements.requirements;
          result.total_requirements = requirements.total;
          pos += reqMsgLen;
          break;

        case 5: // graph_endpoints (message GraphPartEndpoints)
          const { value: endpMsg, length: endpMsgLen } = this.readLengthDelimited(data, pos);
          const endpoints = this.decodeGraphPartEndpoints(endpMsg);
          result.endpoints = endpoints.endpoints;
          result.total_endpoints = endpoints.total;
          pos += endpMsgLen;
          break;

        case 6: // graph_architecture (message GraphPartArchitecture)
          const { value: archMsg, length: archMsgLen } = this.readLengthDelimited(data, pos);
          const architecture = this.decodeGraphPartArchitecture(archMsg);
          result.parent = architecture.parent;
          result.children = architecture.children;
          pos += archMsgLen;
          break;

        default:
          // Пропускаем неизвестные поля
          pos = this.skipField(data, pos, wireType);
      }
    }

    return result;
  }

  /**
   * Декодирование GraphPartRequirements
   * message GraphPartRequirements {
   *   uint32 total = 1;
   *   repeated string requirements = 2;
   * }
   */
  decodeGraphPartRequirements(bytes) {
    const result = { total: 0, requirements: [] };
    let pos = 0;
    const data = new Uint8Array(bytes);

    while (pos < data.length) {
      const { value: tag, length: tagLen } = this.readVarint(data, pos);
      pos += tagLen;
      const fieldNumber = tag >>> 3;

      switch (fieldNumber) {
        case 1: // total (uint32)
          const { value: total, length: totalLen } = this.readVarint(data, pos);
          result.total = total;
          pos += totalLen;
          break;
        case 2: // requirements (repeated string)
          const { value: reqStr, length: reqLen } = this.readString(data, pos);
          result.requirements.push(reqStr);
          pos += reqLen;
          break;
        default:
          pos = this.skipField(data, pos, tag & 0x07);
      }
    }

    return result;
  }

  /**
   * Декодирование GraphPartEndpoints
   * message GraphPartEndpoints {
   *   uint32 total = 1;
   *   map<string, string> endpoints = 2;
   * }
   */
  decodeGraphPartEndpoints(bytes) {
    const result = { total: 0, endpoints: {} };
    let pos = 0;
    const data = new Uint8Array(bytes);

    while (pos < data.length) {
      const { value: tag, length: tagLen } = this.readVarint(data, pos);
      pos += tagLen;
      const fieldNumber = tag >>> 3;

      switch (fieldNumber) {
        case 1: // total (uint32)
          const { value: total, length: totalLen } = this.readVarint(data, pos);
          result.total = total;
          pos += totalLen;
          break;
        case 2: // endpoints (map<string, string>)
          const { key, value: endpValue, length: endpLen } = this.readMapEntry(data, pos);
          result.endpoints[key] = endpValue;
          pos += endpLen;
          break;
        default:
          pos = this.skipField(data, pos, tag & 0x07);
      }
    }

    return result;
  }

  /**
   * Декодирование GraphPartArchitecture
   * message GraphPartArchitecture {
   *   string parent = 1;
   *   repeated string children = 2;
   * }
   */
  decodeGraphPartArchitecture(bytes) {
    const result = { parent: '', children: [] };
    let pos = 0;
    const data = new Uint8Array(bytes);

    while (pos < data.length) {
      const { value: tag, length: tagLen } = this.readVarint(data, pos);
      pos += tagLen;
      const fieldNumber = tag >>> 3;

      switch (fieldNumber) {
        case 1:
          const { value: parentStr, length: parentLen } = this.readString(data, pos);
          result.parent = parentStr;
          pos += parentLen;
          break;
        case 2: // children (repeated string)
          const { value: childStr, length: childLen } = this.readString(data, pos);
          result.children.push(childStr);
          pos += childLen;
          break;
        default:
          pos = this.skipField(data, pos, tag & 0x07);
      }
    }

    return result;
  }

  readVarint(data, pos) {
    let value = 0;
    let shift = 0;
    let length = 0;

    while (pos < data.length) {
      const byte = data[pos++];
      length++;
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }

    return { value, length };
  }

  readLengthDelimited(data, pos) {
    const { value: len, length: lenSize } = this.readVarint(data, pos);
    const bytes = data.slice(pos + lenSize, pos + lenSize + len);
    return { value: bytes, length: lenSize + len };
  }

  readString(data, pos) {
    const { value: len, length: lenSize } = this.readVarint(data, pos);
    pos += lenSize;
    
    const bytes = data.slice(pos, pos + len);
    const str = new TextDecoder().decode(bytes);
    
    return { value: str, length: lenSize + len };
  }

  readMapEntry(data, pos) {
    const { value: entryLen, length: entryLenSize } = this.readVarint(data, pos);
    pos += entryLenSize;
    
    const entryEnd = pos + entryLen;
    let key = '', value = '';
    
    while (pos < entryEnd) {
      const { value: tag, length: tagLen } = this.readVarint(data, pos);
      pos += tagLen;
      const fieldNum = tag >>> 3;
      
      if (fieldNum === 1) {
        const { value: k, length: kLen } = this.readString(data, pos);
        key = k;
        pos += kLen;
      } else if (fieldNum === 2) {
        const { value: v, length: vLen } = this.readString(data, pos);
        value = v;
        pos += vLen;
      }
    }
    
    return { key, value, length: entryLenSize + entryLen };
  }

  skipField(data, pos, wireType) {
    if (wireType === 0) { // varint
      const { length } = this.readVarint(data, pos);
      return pos + length;
    } else if (wireType === 2) { // length-delimited
      const { value: len, length: lenSize } = this.readVarint(data, pos);
      return pos + lenSize + len;
    }
    return pos + 1;
  }

  /**
   * Подключение к стриму RunAlgorithm через gRPC-Web
   * 
   * ВАЖНО: Отправляем бинарный Protobuf, получаем бинарный stream
   * 
   * @param {number} userId - ID пользователя
   * @param {number} taskId - ID задачи (project ID)
   * @param {object} callbacks - Коллбэки для обработки данных
   * @param {number} delayMs - Задержка перед подключением (для новых проектов)
   * @returns {Promise<AbortController>} - контроллер для отмены запроса
   */
  async connectToStream(userId, taskId, callbacks, delayMs = 0) {
    // Задержка перед подключением (для только что созданных проектов)
    if (delayMs > 0) {
      console.log(`⏱️ Ожидание ${delayMs}ms перед подключением к gRPC...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    console.log(`📡 Подключение к gRPC стриму: user_id=${userId}, task_id=${taskId}`);

    const abortController = new AbortController();
    let receivedDone = false;
    let timedOut = false;
    const timeoutMs = Number(import.meta.env?.VITE_GRPC_TIMEOUT_MS ?? 60000);
    
    // Таймаут будет запущен ПОСЛЕ получения response, а не до
    let timeoutId = null;
    
    try {
      // URL для gRPC-Web запроса через Envoy
      const url = `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`;
      console.log('[grpc] connect', { url: `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`, envoyUrl: this.envoyUrl, envGrpcUrl: import.meta.env?.VITE_GRPC_URL, dev: import.meta.env?.DEV, userId, taskId });
      
      // Создаём бинарный Protobuf запрос
      const requestBody = this.encodeAlgorithmRequest(parseInt(userId), parseInt(taskId));

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📤 ОТПРАВКА gRPC ЗАПРОСА');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🌐 URL:', url);
      console.log('👤 User ID:', parseInt(userId));
      console.log('📋 Task ID (Project ID):', parseInt(taskId));
      console.log('📦 Request Headers:', {
        'Content-Type': 'application/grpc-web+proto',
        'Accept': 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
        'X-User-Agent': 'grpc-web-javascript/0.1'
      });
      console.log('📏 Payload Length:', requestBody.length, 'bytes');
      console.log('🔍 Payload (hex):', Array.from(requestBody).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('🔍 Payload (bytes):', Array.from(requestBody).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', '));
      console.log('🔍 Decoded: field 1 (user_id)=' + userId + ', field 2 (task_id)=' + taskId);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      console.log('⏳ Отправка fetch запроса...');
      const fetchStartTime = Date.now();
      
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
      
      const fetchDuration = Date.now() - fetchStartTime;
      console.log(`✅ Fetch завершён за ${fetchDuration}ms`);
      
      // ВАЖНО: Запускаем таймаут ПОСЛЕ получения response
      // Таймаут нужен для случая когда stream зависает и не присылает DONE
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          abortController.abort();
          console.error('[grpc] timeout waiting for DONE status, aborting stream', { userId, taskId, timeoutMs });
        }, timeoutMs);
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📥 ПОЛУЧЕН ОТВЕТ');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 HTTP Status:', response.status, response.statusText);
      console.log('📊 response.ok:', response.ok);
      console.log('📦 Response Headers:');
      console.log('  • Content-Type:', response.headers.get('content-type'));
      console.log('  • grpc-status:', response.headers.get('grpc-status'));
      console.log('  • grpc-message:', response.headers.get('grpc-message'));
      console.log('  • transfer-encoding:', response.headers.get('transfer-encoding'));
      console.log('📖 Response body exists:', !!response.body);
      console.log('📖 Response body type:', typeof response.body);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (!response.ok) {
        let errorText = 'Нет детальной информации';
        let errorDetails = {};
        
        try {
          const bodyBytes = await response.arrayBuffer();
          errorText = new TextDecoder().decode(bodyBytes);
          
          if (!errorText) {
            errorText = 'Пустой ответ от сервера';
          }
          
          // Попытка распарсить JSON ошибку
          try {
            errorDetails = JSON.parse(errorText);
            console.error('📄 Детали ошибки (JSON):', errorDetails);
          } catch {
            console.error('📄 Детали ошибки (text):', errorText);
          }
        } catch (e) {
          console.warn('Не удалось прочитать тело ошибки:', e);
        }
        
        console.error('❌ gRPC response error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          headers: Object.fromEntries(response.headers.entries()),
          url: url,
          userId,
          taskId
        });
        
        // Детальное сообщение об ошибке
        let errorMsg = `gRPC request failed: ${response.status} ${response.statusText}.`;
        
        if (response.status === 500) {
          errorMsg += '\n\n❌ Внутренняя ошибка Core gRPC сервиса.';
          errorMsg += '\n\nВозможные причины:';
          errorMsg += '\n• Проект не найден в БД (task_id=' + taskId + ')';
          errorMsg += '\n• Файл проекта отсутствует или повреждён';
          errorMsg += '\n• Ошибка парсинга/анализа кода';
          errorMsg += '\n• Exception в алгоритме RunAlgorithm';
          errorMsg += '\n\nПроверьте логи: docker logs -f core-service';
        } else if (response.status === 404) {
          errorMsg += ' Эндпоинт не найден. Проверьте конфигурацию Envoy (роутинг к core-service:50051).';
        } else if (response.status === 502 || response.status === 503) {
          errorMsg += ' Core gRPC сервис недоступен. Проверьте: docker ps | grep core';
        } else {
          errorMsg += ` ${errorText}`;
        }
        
        throw new Error(errorMsg);
      }

      console.log('✅ gRPC соединение установлено, читаем бинарный stream...');
      console.log('📖 Response body:', response.body);
      console.log('📖 Response body type:', typeof response.body);

      // Читаем stream как бинарные данные (gRPC-Web format)
      const reader = response.body.getReader();
      let buffer = new Uint8Array(0);
      let messageCount = 0;
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        chunkCount++;
        
        console.log(`📦 Chunk #${chunkCount}:`, {
          done,
          valueLength: value ? value.length : 0,
          valueType: value ? value.constructor.name : 'null',
          bufferLength: buffer.length
        });
        
        if (done) {
          console.log(`📭 Stream завершён. Получено чанков: ${chunkCount}, сообщений: ${messageCount}`);
          break;
        }

        if (!value || value.length === 0) {
          console.warn('⚠️ Получен пустой chunk, пропускаем');
          continue;
        }

        // Добавляем чанк к буферу
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;
        
        console.log(`🔄 Буфер после добавления chunk: ${buffer.length} bytes`);

        // gRPC-Web формат: [compressed-flag(1)][length(4)][message(length)]
        while (buffer.length >= 5) {
          const compressedFlag = buffer[0];
          const messageLength = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];
          
          console.log(`🔍 Frame header:`, {
            compressedFlag,
            messageLength,
            bufferAvailable: buffer.length,
            needsTotal: 5 + messageLength
          });
          
          if (buffer.length < 5 + messageLength) {
            // Недостаточно данных, ждём следующий чанк
            console.log(`⏳ Недостаточно данных: есть ${buffer.length}, нужно ${5 + messageLength}, ждём ещё...`);
            break;
          }

          // Извлекаем сообщение
          const messageBytes = buffer.slice(5, 5 + messageLength);
          buffer = buffer.slice(5 + messageLength);
          
          console.log(`✂️ Извлечено сообщение: ${messageBytes.length} bytes, осталось в буфере: ${buffer.length}`);
          
          try {
            const message = this.decodeGraphPartResponse(messageBytes);
            messageCount++;
            console.log(`📬 Получено сообщение #${messageCount}:`, {
              status: this.getStatusName(message.status),
              response_id: message.response_id,
              data: message
            });
            
            // Отслеживаем получение статуса DONE
            if (message.status === ParseStatus.DONE) {
              receivedDone = true;
              console.log('✅ Получен статус DONE - stream завершён успешно');
            }
            
            this._handleStreamMessage(message, callbacks);
          } catch (parseError) {
            console.error('❌ Ошибка декодирования Protobuf:', parseError);
            console.error('📄 Bytes (first 100):', Array.from(messageBytes.slice(0, 100)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', '));
          }
        }
      }

      // Проверяем, был ли получен статус DONE
      if (messageCount === 0) {
        console.error('❌ Stream завершился без сообщений');
        const error = new Error('Stream завершился без данных. Возможно, проект не найден или произошла ошибка на сервере.');
        callbacks.onError?.(error);
        return abortController;
      }
      
      if (!receivedDone) {
        console.error('❌ Stream оборвался до получения статуса DONE');
        console.error('📊 Статистика:', {
          totalMessages: messageCount,
          receivedDone: receivedDone,
          lastStatus: 'Stream прерван'
        });
        const error = new Error(
          `Stream прерван преждевременно.\n\n` +
          `Получено сообщений: ${messageCount}\n` +
          `Статус DONE не получен.\n\n` +
          `Возможные причины:\n` +
          `• Ошибка в алгоритме анализа на сервере\n` +
          `• Таймаут обработки\n` +
          `• Проблема с файлом проекта\n` +
          `• Недостаточно памяти на сервере\n\n` +
          `Проверьте логи Core gRPC сервиса: docker logs -f core-service`
        );
        callbacks.onError?.(error);
        return abortController;
      }
      
      // Только если получен DONE - вызываем onDone
      console.log('✅ Stream завершён корректно, всего сообщений:', messageCount);
      callbacks.onDone?.();

    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        if (timedOut) {
          console.error('[grpc] timeout waiting for DONE status, stream aborted', { userId, taskId, timeoutMs });
          const timeoutError = new Error('gRPC request timed out: DONE status not received');
          callbacks.onError?.(timeoutError);
        } else {
          console.log('🛑 Stream отменён');
        }
      } else {
        console.error('❌ gRPC stream error:', error);
        callbacks.onError?.(error);
      }
    }

    return abortController;
  }

  getStatusName(status) {
    const names = ['START', 'REQUIREMENTS', 'ENDPOINTS', 'ARHITECTURE', 'DONE'];
    return names[status] || `UNKNOWN(${status})`;
  }

  /**
   * Обработка одного сообщения из stream
   * @private
   */
  _handleStreamMessage(message, callbacks) {
    const { status, response_id, requirements, endpoints, parent, children } = message;
    
    console.log(`📨 Обработка сообщения: status=${this.getStatusName(status)}, response_id=${response_id}`);

    switch (status) {
      case ParseStatus.START:
        console.log('🎬 START - анализ начался');
        callbacks.onStart?.();
        break;

      case ParseStatus.REQUIREMENTS:
        console.log(`📋 REQUIREMENTS - получено ${requirements.length} зависимостей`);
        callbacks.onRequirements?.({
          requirements: requirements || []
        });
        break;

      case ParseStatus.ENDPOINTS:
        console.log(`🔗 ENDPOINTS - получено ${Object.keys(endpoints).length} эндпоинтов`);
        callbacks.onEndpoints?.({
          endpoints: endpoints || {}
        });
        break;

      case ParseStatus.ARHITECTURE:
        console.log(`🏗️ ARHITECTURE - узел ${parent} с ${children.length} детьми`);
        callbacks.onArchitecture?.({
          parent,
          children: children || []
        });
        break;

      case ParseStatus.DONE:
        console.log('✅ DONE - анализ завершён (обработка в основном цикле)');
        // onDone вызывается в основном цикле connectToStream после проверки receivedDone
        break;

      default:
        console.warn('⚠️ Неизвестный статус:', status);
    }
  }
}

// Экспортируем класс и создаём singleton instance
const grpcClient = new GRPCArchitectureClient();

export { GRPCArchitectureClient, grpcClient, ParseStatus };
export default grpcClient;








src/services/grpcClient.js
/**
 * gRPC Web Client для подключения к Core сервису через Envoy
 * НОВАЯ РЕАЛИЗАЦИЯ с использованием сгенерированных proto файлов
 * 
 * АРХИТЕКТУРА БЭКЕНДА:
 * =====================
 * 1. REST API (FastAPI) на порту 8000
 *    - GET /v1/project/{project_id} - получение метаданных проекта
 * 
 * 2. Core gRPC Service на порту 50051
 *    - Метод: /core.api.FrontendStreamService/RunAlgorithm
 *    - Запрос: AlgorithmRequest {user_id: int64, task_id: int64}
 *    - Ответ: серверный стрим GraphPartResponse
 * 
 * 3. Envoy Proxy на порту 8080
 *    - gRPC-Web gateway для браузерных клиентов
 * 
 * ПОТОК АНАЛИЗА:
 * ==============
 * 1. Frontend отправляет binary Protobuf через POST:
 *    URL: /grpc/core.api.FrontendStreamService/RunAlgorithm (в dev через Vite proxy)
 *    Headers: Content-Type: application/grpc-web+proto
 *    Body: AlgorithmRequest (user_id, task_id)
 * 
 * 2. Backend отвечает серверным стримом с последовательностью сообщений:
 *    REQUIREMENTS (1) → ENDPOINTS (2) → ARHITECTURE (3) → DONE (4)
 *    ВАЖНО: START (0) не используется бэкендом, stream начинается сразу с REQUIREMENTS
 * 
 * 3. КРИТИЧЕСКИ ВАЖНО: Stream считается успешным ТОЛЬКО если получен статус DONE.
 *    Если stream оборвался до DONE - это ошибка, нужно показать пользователю.
 */

import { SimpleFrontendStreamServiceClient } from '../grpc/api_core_grpc_web_pb';
import { AlgorithmRequest } from '../grpc/api_core_pb';
import { ParseStatus } from '../grpc/shared_common_pb';

/**
 * Класс для работы с gRPC стримом архитектуры
 * Использует сгенерированные proto-клиенты
 */
class GRPCArchitectureClient {
  constructor(envoyUrl = null) {
    const envGrpcUrl = import.meta.env?.VITE_GRPC_URL;
    const isDev = import.meta.env?.DEV;
    const shouldUseProxy = isDev && (!envGrpcUrl || envGrpcUrl.includes('78.153.139.47'));
    
    if (shouldUseProxy) {
      this.envoyUrl = '/grpc';
    } else if (envGrpcUrl) {
      this.envoyUrl = envGrpcUrl;
    } else if (envoyUrl) {
      this.envoyUrl = envoyUrl;
    } else {
      this.envoyUrl = 'http://78.153.139.47:8080';
    }

    // Создаём клиент gRPC-Web
    this.client = new SimpleFrontendStreamServiceClient(this.envoyUrl);

    console.log('[grpc] init (NEW IMPLEMENTATION)', {
      envoyUrl: this.envoyUrl,
      envGrpcUrl,
      dev: isDev,
      shouldUseProxy
    });
  }

  /**
   * Подключение к стриму RunAlgorithm через gRPC-Web
   * 
   * @param {number} userId - ID пользователя
   * @param {number} taskId - ID задачи (project ID)
   * @param {object} callbacks - Коллбэки для обработки данных
   * @param {number} delayMs - Задержка перед подключением (для новых проектов)
   * @returns {Promise<Object>} - объект с методом cancel() для отмены
   */
  async connectToStream(userId, taskId, callbacks, delayMs = 0) {
    // КРИТИЧНО: Детальное логирование входных параметров
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 [grpc] connectToStream ВЫЗВАН');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RAW параметры:');
    console.log('  - userId (raw):', userId, `(type: ${typeof userId})`);
    console.log('  - taskId (raw):', taskId, `(type: ${typeof taskId})`);
    console.log('  - delayMs:', delayMs);
    console.log('');
    console.log('📊 PARSED параметры:');
    console.log('  - parseInt(userId):', parseInt(userId));
    console.log('  - parseInt(taskId):', parseInt(taskId));
    console.log('  - Number(userId):', Number(userId));
    console.log('  - Number(taskId):', Number(taskId));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Валидация
    const parsedUserId = parseInt(userId);
    const parsedTaskId = parseInt(taskId);
    
    if (isNaN(parsedUserId) || parsedUserId === 0) {
      const error = `❌ КРИТИЧЕСКАЯ ОШИБКА: userId невалидный! raw=${userId}, parsed=${parsedUserId}`;
      console.error(error);
      throw new Error(error);
    }
    
    if (isNaN(parsedTaskId) || parsedTaskId === 0) {
      const error = `❌ КРИТИЧЕСКАЯ ОШИБКА: taskId невалидный! raw=${taskId}, parsed=${parsedTaskId}`;
      console.error(error);
      throw new Error(error);
    }
    
    console.log('✅ Валидация пройдена:', { userId: parsedUserId, taskId: parsedTaskId });
    
    if (delayMs > 0) {
      console.log(`⏱️ Ожидание ${delayMs}ms перед подключением к gRPC...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    console.log(`📡 Подключение к gRPC стриму: user_id=${parsedUserId}, task_id=${parsedTaskId}`);

    // Создаём запрос используя сгенерированный класс
    const request = new AlgorithmRequest();
    request.setUserId(parsedUserId);
    request.setTaskId(parsedTaskId);
    
    // Проверяем что установилось
    console.log('🔍 Проверка созданного request:');
    console.log('  - request.getUserId():', request.getUserId());
    console.log('  - request.getTaskId():', request.getTaskId());
    console.log('  - Serialized bytes length:', request.serializeBinary().length);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 ОТПРАВКА gRPC ЗАПРОСА');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 URL:', `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`);
    console.log('👤 User ID:', parsedUserId);
    console.log('📋 Task ID (Project ID):', parsedTaskId);
    console.log('📦 Using generated proto classes');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    callbacks.onStart?.();
    console.log('[grpc] ▶️ connectToStream start', {
      url: `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`,
      userId: parsedUserId,
      taskId: parsedTaskId
    });

    let receivedDone = false;
    let messageCount = 0;
    let timedOut = false;
    const timeoutMs = Number(import.meta.env?.VITE_GRPC_TIMEOUT_MS ?? 60000);
    let timeoutId = null;

    const payload = request.serializeBinary();
    console.log('[grpc] request bytes len:', payload.length, 'hex:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('[grpc] headers:', {
      'Content-Type': 'application/grpc-web+proto',
      'Accept': 'application/grpc-web+proto',
      'X-Grpc-Web': '1',
      'X-User-Agent': 'grpc-web-javascript/0.1',
    });
    console.log('[grpc] url:', `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`);


    // Вызываем метод runAlgorithm
    const stream = this.client.runAlgorithm(request, {});

    // Устанавливаем таймаут после начала stream
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        stream.cancel();
        console.error('[grpc] timeout waiting for DONE status', { userId, taskId, timeoutMs });
        const error = new Error('gRPC request timed out: DONE status not received');
        callbacks.onError?.(error);
      }, timeoutMs);
    }

    // Обработчик данных
    stream.on('data', (message) => {
      messageCount++;
      const status = message.getStatus();
      const responseId = message.getResponseId();
      
      console.log('\n✅ Получено сообщение от Core:');
      console.log(`task_id: ${parsedTaskId}`);
      console.log(`response_id: ${responseId}`);
      console.log(`status: ${this.getStatusName(status).split(' ')[0]}`);
      
      // Форматированный вывод содержимого сообщения
      try {
        switch (status) {
          case ParseStatus.REQUIREMENTS:
            const graphReq = message.getGraphRequirements();
            if (graphReq) {
              const requirements = graphReq.getRequirementsList();
              console.log('graph_requirements {');
              console.log(`  total: ${requirements.length}`);
              requirements.forEach(req => {
                console.log(`  requirements: "${req}"`);
              });
              console.log('}');
            }
            break;

          case ParseStatus.ENDPOINTS:
            const graphEndp = message.getGraphEndpoints();
            if (graphEndp) {
              const endpointsMap = graphEndp.getEndpointsMap();
              const entries = [];
              if (endpointsMap) {
                endpointsMap.forEach((value, key) => entries.push({key, value}));
              }
              console.log('graph_endpoints {');
              console.log(`  total: ${entries.length}`);
              entries.forEach(({key, value}) => {
                console.log('  endpoints {');
                console.log(`    key: "${key}"`);
                console.log(`    value: "${value}"`);
                console.log('  }');
              });
              console.log('}');
            }
            break;

          case ParseStatus.ARHITECTURE:
            const graphArch = message.getGraphArchitecture();
            if (graphArch) {
              const parent = graphArch.getParent();
              const children = graphArch.getChildrenList();
              console.log('graph_architecture {');
              console.log(`  parent: "${parent}"`);
              children.forEach(child => {
                console.log(`  children: "${child}"`);
              });
              console.log('}');
            }
            break;

          case ParseStatus.DONE:
            console.log('graph_architecture {');
            console.log('}');
            break;
        }
      } catch (err) {
        console.error('❌ Ошибка при форматировании сообщения:', err);
      }
      
      console.log('');

      // Отслеживаем DONE
      if (status === ParseStatus.DONE) {
        receivedDone = true;
      }

      this._handleStreamMessage(message, callbacks);
    });

    // Обработчик ошибок
    stream.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      
      if (!timedOut) {
        console.error('❌ gRPC stream error:', {
          code: error?.code,
          message: error?.message,
          error
        });
        
        let errorMsg = `gRPC request failed: ${error.message}`;
        
        if (error.code === 500) {
          errorMsg += '\n\n❌ Внутренняя ошибка Core gRPC сервиса.';
          errorMsg += '\n\nВозможные причины:';
          errorMsg += '\n• Проект не найден в БД (task_id=' + taskId + ')';
          errorMsg += '\n• Файл проекта отсутствует или повреждён';
          errorMsg += '\n• Ошибка парсинга/анализа кода';
          errorMsg += '\n\nПроверьте логи: docker logs -f core-service';
        } else if (error.code === 404 || error.message?.includes('404')) {
          errorMsg = '❌ BACKEND ERROR: Envoy не настроен для gRPC-Web';
          errorMsg += '\n\n🔧 Backend team должен добавить в envoy.yaml:';
          errorMsg += '\n\nroutes:';
          errorMsg += '\n  - match:';
          errorMsg += '\n      prefix: "/core.api.FrontendStreamService"';
          errorMsg += '\n    route:';
          errorMsg += '\n      cluster: core_grpc_service';
          errorMsg += '\n      timeout: 300s';
          errorMsg += '\n\n📋 Тестовый curl:';
          errorMsg += '\ncurl -X POST http://78.153.139.47:8080/core.api.FrontendStreamService/RunAlgorithm \\';
          errorMsg += '\n  -H "Content-Type: application/grpc-web+proto" \\';
          errorMsg += '\n  -H "X-Grpc-Web: 1"';
          errorMsg += '\n\n💡 Должен вернуть 200 или grpc-status, а не 404';
        } else if (error.code === 502 || error.code === 503) {
          errorMsg += '\nCore gRPC сервис недоступен. Проверьте: docker ps | grep core';
        }
        
        const wrappedError = new Error(errorMsg);
        wrappedError.code = error.code;
        callbacks.onError?.(wrappedError);
      }
    });

    // Обработчик завершения stream
    stream.on('end', () => {
      if (timeoutId) clearTimeout(timeoutId);
      
      console.log(`📭 Stream завершён. Получено сообщений: ${messageCount}`);

      // Проверяем получение DONE
      if (messageCount === 0) {
        console.error('❌ Stream завершился без сообщений');
        const error = new Error('Stream завершился без данных. Возможно, проект не найден.');
        callbacks.onError?.(error);
        return;
      }

      if (!receivedDone) {
        console.error('❌ Stream оборвался до получения статуса DONE');
        const error = new Error(
          `Stream прерван преждевременно.\n\n` +
          `Получено сообщений: ${messageCount}\n` +
          `Статус DONE не получен.\n\n` +
          `Проверьте логи Core gRPC сервиса`
        );
        callbacks.onError?.(error);
        return;
      }

      // Успешное завершение
      console.log('✅ Stream завершён корректно');
      callbacks.onDone?.();
    });

    // Возвращаем объект для возможности отмены
    // ВАЖНО: используем abort() для совместимости с React компонентами
    return {
      abort: () => {
        if (timeoutId) clearTimeout(timeoutId);
        stream.cancel();
      },
      cancel: () => {
        if (timeoutId) clearTimeout(timeoutId);
        stream.cancel();
      }
    };
  }

  getStatusName(status) {
    const names = [
      'START (не используется)', 
      'REQUIREMENTS', 
      'ENDPOINTS', 
      'ARHITECTURE', 
      'DONE'
    ];
    return names[status] || `UNKNOWN(${status})`;
  }

  /**
   * Обработка одного сообщения из stream
   * @private
   */
  _handleStreamMessage(message, callbacks) {
    const status = message.getStatus();

    switch (status) {
      case ParseStatus.REQUIREMENTS:
        const graphReq = message.getGraphRequirements();
        if (graphReq) {
          const requirements = graphReq.getRequirementsList();
          callbacks.onRequirements?.({
            requirements: requirements || []
          });
        }
        break;

      case ParseStatus.ENDPOINTS:
        const graphEndp = message.getGraphEndpoints();
        if (graphEndp) {
          const endpointsMap = graphEndp.getEndpointsMap();
          const endpoints = {};
          
          if (endpointsMap) {
            endpointsMap.forEach((value, key) => {
              endpoints[key] = value;
            });
          }
          
          callbacks.onEndpoints?.({
            endpoints: endpoints || {}
          });
        }
        break;

      case ParseStatus.ARHITECTURE:
        const graphArch = message.getGraphArchitecture();
        if (graphArch) {
          const parent = graphArch.getParent();
          const children = graphArch.getChildrenList();
          
          callbacks.onArchitecture?.({
            parent,
            children: children || []
          });
        }
        break;

      case ParseStatus.DONE:
        // onDone вызывается в обработчике 'end'
        break;

      default:
        console.warn('⚠️ Неизвестный статус:', status);
    }
  }
}

// Экспортируем класс и создаём singleton instance
const grpcClient = new GRPCArchitectureClient();

export { GRPCArchitectureClient, grpcClient, ParseStatus };
export default grpcClient;

src/utils/buildGraph.jsx
import { MarkerType } from 'reactflow';

// Default colors for HTTP methods
const defaultMethodColors = {
  GET: { bg: 'linear-gradient(135deg, #22c39b 0%, #14b38a 100%)', border: '#14b38a' },
  POST: { bg: 'linear-gradient(135deg, #4f8cf7 0%, #3366f0 100%)', border: '#3366f0' },
  PATCH: { bg: 'linear-gradient(135deg, #f6c263 0%, #e09b2d 100%)', border: '#e09b2d' },
  PUT: { bg: 'linear-gradient(135deg, #9b8cf6 0%, #7f6bec 100%)', border: '#7f6bec' },
  DELETE: { bg: 'linear-gradient(135deg, #f98080 0%, #ef4444 100%)', border: '#ef4444' },
};

// Default colors for services/classes
const defaultServiceColors = {
  AuthService: { color: '#8b5cf6', icon: '🔐', label: 'Auth' },
  AccountService: { color: '#3b82f6', icon: '👤', label: 'Account' },
  ProjectService: { color: '#10b981', icon: '📁', label: 'Project' },
  CoreService: { color: '#f59e0b', icon: '⚙️', label: 'Core' },
};

const nodeBg = 'var(--graph-node-bg)';
const nodeBorder = 'var(--graph-node-border)';
const nodeChipBg = 'var(--graph-chip-bg)';
const nodeText = 'var(--text-primary)';
const nodeMuted = 'var(--text-subtle)';

const normalizeName = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const getBaseName = (name = '') => (name || '').split('/').pop() || '';

// Skip framework/built-in nodes so they don't create fake lanes on the graph
const IGNORED_EXACT_NODES = new Set(
  [
    'depends',
    '__init__',
    'init',
    'super',
    'file',
    'httpexception',
    'print',
    'len',
    'list',
    'dict',
    'set',
    'tuple',
    'type',
    'str',
    'int',
    'float',
    'items',
    'setattr',
    'getattr',
    'hasattr',
    'where',
    'select',
    'all',
    'any',
    'first',
    'scalars',
    'execute',
    'result',
    'data',
    'valueerror',
    'runtimeerror',
    'notimplementederror',
    'keyerror',
    'attributeerror',
    'indexerror',
  ].map((v) => v.toLowerCase())
);

const IGNORED_DOT_PREFIXES = new Set(
  [
    'log',
    'logger',
    'router',
    'session',
    'result',
    'conn',
    'connection',
    'context',
    'channel',
    'queue',
    'message',
    'data',
    'patch_data',
    'password',
    'hashed',
    'start_date',
    'end_date',
    'datetime',
    'json',
    'os',
  ].map((v) => v.toLowerCase())
);

const IGNORED_EXCEPTION_PATTERNS = [/(exception)$/i, /(error)$/i, /(notfound)$/i, /(notexists?)$/i, /(doesnotexist)$/i];

const shouldIgnoreNodeName = (name = '') => {
  const baseName = getBaseName(name);
  if (!baseName) return true;

  const normalized = baseName.toLowerCase();

  if (IGNORED_EXACT_NODES.has(normalized)) return true;

  const dotPrefix = normalized.split('.')[0];
  if (dotPrefix && IGNORED_DOT_PREFIXES.has(dotPrefix)) return true;

  if (normalized.startsWith('__') && normalized.endsWith('__')) return true;

  if (IGNORED_EXCEPTION_PATTERNS.some((pattern) => pattern.test(baseName))) return true;

  return false;
};

/**
 * Build React Flow nodes/edges based on requirements, endpoints and architecture data.
 */
export function buildGraph({
  requirements = [],
  endpoints = {},
  architectureData = [],
  methodColors = defaultMethodColors,
  serviceColors = defaultServiceColors,
}) {
  if (architectureData.length === 0 && Object.keys(endpoints).length === 0) {
    return { nodes: [], edges: [], summary: {} };
  }

  const median = (arr) => {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const LAYER_GAP = 900;
  const START_X = 120;
  const START_Y = 80;
  const HTTP_SPACING = 110;
  const LANE_COLUMN_GAP = 450; // расстояние между колонками классов
  const LANE_CARD_WIDTH = 360;
  const LANE_VERTICAL_GAP = 120; // вертикальный зазор между карточками

  const dependencyMap = new Map(); // node -> nodes that depend on it
  const reverseDependencyMap = new Map(); // node -> nodes it depends on (children)

  architectureData.forEach(({ parent, children = [] }) => {
    if (shouldIgnoreNodeName(parent)) return;

    children.forEach((child) => {
      const cleanChild = getBaseName(child);
      if (shouldIgnoreNodeName(cleanChild)) return;

      if (!dependencyMap.has(cleanChild)) {
        dependencyMap.set(cleanChild, new Set());
      }
      dependencyMap.get(cleanChild).add(parent);

      if (!reverseDependencyMap.has(parent)) {
        reverseDependencyMap.set(parent, new Set());
      }
      reverseDependencyMap.get(parent).add(cleanChild);
    });
  });

  const connectedNodes = new Set();
  const traverse = (node) => {
    if (shouldIgnoreNodeName(node)) return;
    if (connectedNodes.has(node)) return;
    connectedNodes.add(node);
    if (reverseDependencyMap.has(node)) {
      reverseDependencyMap.get(node).forEach((child) => traverse(child));
    }
  };

  // Сначала добавляем все endpoints
  Object.keys(endpoints).forEach((endpointKey) => {
    connectedNodes.add(endpointKey);
  });

  // Затем обходим граф от endpoints и связанных с ними родителей
  Object.keys(endpoints).forEach((endpointKey) => {
    const endpointName = normalizeName(endpointKey);
    architectureData.forEach(({ parent }) => {
      const parentName = normalizeName(parent);
      if (!endpointName || !parentName) return;
      if (parentName.includes(endpointName) || endpointName.includes(parentName)) {
        traverse(parent);
      }
    });
  });

  const getNodeType = (nodeName) => {
    if (!connectedNodes.has(nodeName)) return null;

    if (shouldIgnoreNodeName(nodeName)) return null;

    const baseName = getBaseName(nodeName);
    const nameForCheck = baseName || nodeName;
    const lowerName = nameForCheck.toLowerCase();

    if (endpoints[nodeName]) {
      return { type: 'endpoint', layer: 1, class: 'HTTP' };
    }

    if (
      lowerName.startsWith('databasemanager') ||
      lowerName.startsWith('init_db') ||
      lowerName.includes('broker') ||
      lowerName.includes('storage') ||
      lowerName.includes('consumer') ||
      lowerName.includes('producer') ||
      lowerName.includes('connection') ||
      lowerName.includes('tasksession') ||
      lowerName.includes('taskmanager') ||
      lowerName.includes('streamservice') ||
      lowerName.includes('grpc') ||
      lowerName.includes('servicer') ||
      lowerName.includes('stub')
    ) {
      let className = 'Database';
      if (nameForCheck.startsWith('DatabaseManager') || lowerName.startsWith('databasemanager')) className = 'DatabaseManager';
      else if (lowerName.includes('broker')) className = 'MessageBroker';
      else if (lowerName.includes('storage')) className = 'ObjectStorage';
      else if (lowerName.includes('consumer') || lowerName.includes('producer')) className = 'MessageQueue';
      else if (lowerName.includes('tasksession') || lowerName.includes('taskmanager')) className = 'TaskManager';
      else if (lowerName.includes('streamservice') || lowerName.includes('grpc') || lowerName.includes('servicer') || lowerName.includes('stub'))
        className = 'CoreServer';

      return { type: 'database', layer: 3, class: className };
    }

    if (nameForCheck.includes('.')) {
      const className = nameForCheck.split('.')[0];
      return { type: 'domain', layer: 2, class: className };
    }

    const handlerPatterns = [
      'homepage',
      'health',
      'lifespan',
      'get_account',
      'patch_account',
      'get_project',
      'get_projects_list',
      'create_project',
      'patch_project',
      'delete_project',
      'login',
      'refresh',
      'registration',
      'load_config',
      'create_logger',
      'run_frontend_test',
    ];

    const isHandler = handlerPatterns.some((pattern) => lowerName.includes(pattern));

    if (isHandler) {
      let className = 'Other';
      if (lowerName.includes('account')) className = 'Account';
      else if (lowerName.includes('project')) className = 'Project';
      else if (
        lowerName.includes('login') ||
        lowerName.includes('auth') ||
        lowerName.includes('registration') ||
        lowerName.includes('refresh')
      )
        className = 'Auth';
      else if (lowerName.includes('home') || lowerName.includes('health')) className = 'System';
      else if (lowerName.includes('config') || lowerName.includes('logger')) className = 'Config';

      return { type: 'handler', layer: 2, class: className };
    }

    return { type: 'other', layer: 2, class: 'Other' };
  };

  const classByLayer = {
    0: { Requirements: [] },
    1: { HTTP: [] },
    2: {},
    3: {},
  };
  const methodMeta = new Map();

  const register = (name, layer, className) => {
    if (!classByLayer[layer]) classByLayer[layer] = {};
    if (!classByLayer[layer][className]) classByLayer[layer][className] = [];
    classByLayer[layer][className].push(name);
    methodMeta.set(name, { layer, className });
  };

  requirements.forEach((req) => {
    if (req) {
      classByLayer[0].Requirements.push(req);
    }
  });

  connectedNodes.forEach((nodeName) => {
    const nodeType = getNodeType(nodeName);
    if (!nodeType) return;
    const { layer, class: className } = nodeType;
    register(nodeName, layer, className);
  });

  const laneX = {
    http: START_X,
    handlers: START_X + LAYER_GAP,
    db: START_X + LAYER_GAP * 2,
  };

  const newNodes = [];

  const requirementsList = classByLayer[0].Requirements || [];
  requirementsList.forEach((reqName, idx) => {
    newNodes.push({
      id: reqName,
      type: 'default',
      position: { x: START_X - LAYER_GAP * 0.8, y: START_Y + idx * 60 },
      data: {
        label: (
          <div style={{ padding: '6px 10px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: nodeMuted }}>{reqName}</div>
          </div>
        ),
        meta: { layer: 0, kind: 'requirement' },
      },
      style: {
        background: nodeBg,
        border: `2px solid ${nodeBorder}`,
        borderRadius: '8px',
        width: 140,
        fontSize: '10px',
        boxShadow: '0 6px 14px var(--shadow-soft)',
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    });
  });

  const httpEndpoints = classByLayer[1].HTTP || [];
  const endpointsList = httpEndpoints.map((key) => ({ key, value: endpoints[key] }));
  const methodOrder = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
  const sortedEndpoints = endpointsList.sort((a, b) => {
    const methodA = a.value?.split(' ')[0] || 'GET';
    const methodB = b.value?.split(' ')[0] || 'GET';
    const orderDiff = methodOrder.indexOf(methodA) - methodOrder.indexOf(methodB);
    if (orderDiff !== 0) return orderDiff;
    const pathA = a.value?.split(' ')[1] || a.key || '';
    const pathB = b.value?.split(' ')[1] || b.key || '';
    return pathA.localeCompare(pathB);
  });

  const endpointIndexMap = new Map();
  sortedEndpoints.forEach(({ key, value }, idx) => {
    endpointIndexMap.set(key, idx);
    const method = value?.split(' ')[0] || 'GET';
    const path = value?.split(' ')[1] || '';
    const color = methodColors[method] || methodColors.GET;

    newNodes.push({
      id: key,
      type: 'default',
      position: { x: laneX.http, y: START_Y + idx * HTTP_SPACING },
      data: {
        label: (
          <div style={{ padding: '10px 14px' }}>
            <div
              style={{
                background: color.bg,
                color: 'var(--text-inverse)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 'bold',
                marginBottom: '6px',
                display: 'inline-block',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              {method}
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '6px', color: nodeText }}>{key}</div>
            <div style={{ fontSize: '11px', color: nodeMuted, marginTop: '4px', wordBreak: 'break-all' }}>{path}</div>
          </div>
        ),
        meta: {
          layer: 1,
          kind: 'endpoint',
          method,
          path,
        },
      },
      style: {
        background: nodeBg,
        border: `3px solid ${color.border}`,
        borderRadius: '12px',
        width: 240,
        fontSize: '12px',
        boxShadow: `0 6px 16px ${color.border}35`,
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    });
  });

  const computeAnchors = (layerKey, classMap, upstreamAnchors) => {
    const anchors = {};
    Object.entries(classMap || {}).forEach(([className, methods], idx) => {
      const hits = [];

      if (layerKey === 2) {
        // Расставляем хендлеры по средней позиции их входящих HTTP эндпоинтов
        Object.keys(endpoints).forEach((endpointKey) => {
          const children = reverseDependencyMap.get(endpointKey);
          if (!children) return;
          children.forEach((childName) => {
            const meta = methodMeta.get(childName);
            if (meta?.className === className) {
              const endpointIdx = endpointIndexMap.get(endpointKey);
              if (typeof endpointIdx === 'number') hits.push(endpointIdx);
            }
          });
        });
      }

      if (layerKey === 3) {
        // Инфраструктуру якорим около слоёв, которые её вызывают
        methods.forEach((methodName) => {
          const parents = dependencyMap.get(methodName);
          if (!parents) return;
          parents.forEach((parentName) => {
            const meta = methodMeta.get(parentName);
            if (meta?.layer === 2 && upstreamAnchors?.[meta.className] !== undefined) {
              hits.push(upstreamAnchors[meta.className]);
            }
          });
        });
      }

      const anchor = hits.length ? median(hits) : idx + 0.5;
      anchors[className] = anchor;
    });
    return anchors;
  };

  const handlerAnchors = computeAnchors(2, classByLayer[2], null);
  const infraAnchors = computeAnchors(3, classByLayer[3], handlerAnchors);

  // Функция для вычисления уровня зависимости класса (топологическая сортировка)
  const computeClassDependencyLevels = (layerKey) => {
    const classMap = classByLayer[layerKey] || {};
    const classNames = Object.keys(classMap).filter(cn => classMap[cn]?.length);
    
    // Строим граф зависимостей между классами
    const classDeps = new Map(); // className -> Set of classes it depends on
    const classReverseDeps = new Map(); // className -> Set of classes that depend on it
    
    classNames.forEach(cn => {
      classDeps.set(cn, new Set());
      classReverseDeps.set(cn, new Set());
    });
    
    // Анализируем зависимости между классами через методы
    classNames.forEach(sourceClass => {
      const methods = classMap[sourceClass] || [];
      methods.forEach(methodName => {
        const children = reverseDependencyMap.get(methodName) || new Set();
        children.forEach(childName => {
          const childMeta = methodMeta.get(childName);
          if (childMeta?.layer === layerKey) {
            const targetClass = childMeta.className;
            if (targetClass && targetClass !== sourceClass && classNames.includes(targetClass)) {
              classDeps.get(sourceClass).add(targetClass);
              classReverseDeps.get(targetClass).add(sourceClass);
            }
          }
        });
      });
    });
    
    // Топологическая сортировка (Kahn's algorithm)
    const levels = new Map();
    const inDegree = new Map();
    
    classNames.forEach(cn => {
      inDegree.set(cn, classDeps.get(cn).size);
    });
    
    let currentLevel = 0;
    let remaining = new Set(classNames);
    
    while (remaining.size > 0) {
      // Находим классы без зависимостей (или все зависимости уже размещены)
      const nodesAtLevel = Array.from(remaining).filter(cn => {
        const deps = classDeps.get(cn);
        return Array.from(deps).every(dep => levels.has(dep));
      });
      
      if (nodesAtLevel.length === 0) {
        // Циклические зависимости или изолированные узлы - размещаем оставшиеся
        nodesAtLevel.push(...Array.from(remaining));
      }
      
      nodesAtLevel.forEach(cn => {
        levels.set(cn, currentLevel);
        remaining.delete(cn);
      });
      
      currentLevel++;
    }
    
    return levels;
  };

  const renderLaneNodes = (layerKey, baseXPos, anchors) => {
    const cards = Object.entries(classByLayer[layerKey] || {})
      .filter(([, methods]) => methods?.length)
      .map(([className, methods]) => {
        const classColor = serviceColors[className]?.color || '#64748b';
        const preview = methods.map((m) => m.split('.').pop() || m);
        const methodItemHeight = 28;
        const baseHeight = 120;
        const estimatedHeight = baseHeight + preview.length * methodItemHeight;
        return { 
          className, 
          methods, 
          classColor, 
          preview, 
          estimatedHeight, 
          anchor: anchors?.[className] ?? 0 
        };
      });

    if (cards.length === 0) return;

    // Вычисляем уровни зависимостей для классов
    const dependencyLevels = computeClassDependencyLevels(layerKey);
    
    // Группируем карточки по уровням
    const cardsByLevel = new Map();
    cards.forEach(card => {
      const level = dependencyLevels.get(card.className) ?? 0;
      if (!cardsByLevel.has(level)) {
        cardsByLevel.set(level, []);
      }
      cardsByLevel.get(level).push(card);
    });
    
    // Сортируем карточки внутри каждого уровня по anchor
    cardsByLevel.forEach(levelCards => {
      levelCards.sort((a, b) => a.anchor - b.anchor);
    });
    
    // Размещаем карточки
    const sortedLevels = Array.from(cardsByLevel.keys()).sort((a, b) => a - b);
    
    sortedLevels.forEach((level, levelIdx) => {
      const levelCards = cardsByLevel.get(level);
      const xPos = baseXPos + levelIdx * LANE_COLUMN_GAP;
      
      let yOffset = START_Y;
      levelCards.forEach((card, cardIdx) => {
        newNodes.push({
          id: `lane-${layerKey}-${card.className}`,
          type: 'default',
          position: { x: xPos, y: yOffset },
          data: {
            label: (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: nodeText }}>{card.className}</div>
                <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', color: nodeMuted }}>{card.methods.length} методов</div>
                <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                  {card.preview.map((m) => (
                    <div
                      key={m}
                      style={{
                        background: nodeChipBg,
                        borderRadius: '8px',
                        padding: '6px 8px',
                        fontSize: '11px',
                        color: nodeText,
                        border: `1px solid ${card.classColor}33`,
                      }}
                    >
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            ),
            meta: {
              layer: layerKey,
              kind: 'lane',
              className: card.className,
              },
            },
          style: {
            background: nodeBg,
            border: `2px solid ${card.classColor}`,
            borderRadius: '14px',
            width: LANE_CARD_WIDTH,
            boxShadow: `0 10px 24px ${card.classColor}25`,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
        
        yOffset += card.estimatedHeight + LANE_VERTICAL_GAP;
      });
    });
  };

  renderLaneNodes(2, laneX.handlers, handlerAnchors);
  renderLaneNodes(3, laneX.db, infraAnchors);

  const getLaneId = (layer, className) => `lane-${layer}-${className}`;

  const nodeIds = new Set(newNodes.map((n) => n.id));
  const edgeStats = new Map();
  const nodesWithIncomingEdges = new Set();
  const nodesWithOutgoingEdges = new Set();

  const registerEdge = (source, target, options = {}) => {
    const key = `${source}->${target}`;
    const existing = edgeStats.get(key);
    if (!existing) {
      edgeStats.set(key, { source, target, options: { ...options }, count: 1 });
    } else {
      edgeStats.set(key, {
        source,
        target,
        options: { ...existing.options, ...options },
        count: existing.count + 1,
      });
    }
    nodesWithOutgoingEdges.add(source);
    nodesWithIncomingEdges.add(target);
  };

  Object.keys(endpoints).forEach((endpointKey) => {
    const method = endpoints[endpointKey]?.split(' ')[0] || 'GET';
    const color = methodColors[method]?.border || '#3b82f6';
    const endpointName = normalizeName(endpointKey);

    const matchedChildren = new Set();
    if (reverseDependencyMap.has(endpointKey)) {
      reverseDependencyMap.get(endpointKey).forEach((child) => matchedChildren.add(child));
    }
    architectureData.forEach(({ parent, children = [] }) => {
      if (shouldIgnoreNodeName(parent)) return;
      const parentName = normalizeName(parent);
      if (!endpointName || !parentName) return;
      if (parentName.includes(endpointName) || endpointName.includes(parentName)) {
        children.forEach((childRaw) => {
          const child = getBaseName(childRaw);
          if (child && !shouldIgnoreNodeName(child)) matchedChildren.add(child);
        });
      }
    });

    matchedChildren.forEach((target) => {
      const meta = methodMeta.get(target);
      if (!meta) return;
      const targetId = meta.layer === 1 ? target : getLaneId(meta.layer, meta.className);
      if (!nodeIds.has(targetId)) return;

      registerEdge(endpointKey, targetId, {
        color,
        strokeWidth: 3,
        kind: 'http',
      });
    });
  });

  architectureData.forEach(({ parent, children = [] }) => {
    const parentMeta = methodMeta.get(parent);
    if (!parentMeta) return;

    const sourceId = parentMeta.layer === 1 ? parent : getLaneId(parentMeta.layer, parentMeta.className);
    if (!nodeIds.has(sourceId)) return;

    children.forEach((childRaw) => {
      const child = getBaseName(childRaw);
      if (shouldIgnoreNodeName(child)) return;
      const childMeta = methodMeta.get(child);
      if (!childMeta) return;

      const targetId = childMeta.layer === 1 ? child : getLaneId(childMeta.layer, childMeta.className);
      if (!nodeIds.has(targetId)) return;

      registerEdge(sourceId, targetId, {
        color: '#cbd5f5',
        opacity: 0.7,
        kind: 'internal',
      });
    });
  });

  const newEdges = [];
  edgeStats.forEach(({ source, target, options, count }, key) => {
    const baseColor = options?.color || '#94a3b8';
    const kind = options?.kind;
    const weight = Math.min(count, 4);
    const baseWidth = options?.strokeWidth ?? (kind === 'http' ? 2.6 : 2.0);
    const strokeWidth = baseWidth + (weight - 1) * 0.6;
    const opacity = options?.opacity ?? (kind === 'http' ? 0.95 : 0.8);
    const label = count > 1 ? options?.label ?? `×${count}` : options?.label;
    const hasLabel = Boolean(label);
    const labelBg = baseColor;
    const labelColor = kind === 'internal' ? nodeText : 'var(--text-inverse)';
    const labelYOffset = hasLabel ? -10 : 0;
    const baseStyle = {
      stroke: baseColor,
      strokeWidth,
      opacity,
      strokeDasharray: undefined,
    };

    newEdges.push({
      id: key,
      source,
      target,
      type: 'smart',
      markerEnd: { type: MarkerType.ArrowClosed, color: baseColor },
      style: baseStyle,
      animated: Boolean(options?.animated),
      label,
      labelStyle: hasLabel
        ? {
            fontSize: 10,
            fontWeight: 600,
            transform: `translateY(${labelYOffset}px)`,
            position: 'relative',
            zIndex: 5,
            ...options?.labelStyle,
          }
        : undefined,
      labelBgStyle: hasLabel
        ? {
            fill: labelBg,
            color: labelColor,
            borderRadius: 999,
            padding: 4,
            transform: `translateY(${labelYOffset}px)`,
            position: 'relative',
            zIndex: 4,
            ...options?.labelBgStyle,
          }
        : undefined,
      data: {
        ...(options?.data || {}),
        aggCount: count,
        baseStyle,
      },
    });
  });

  // Фильтруем узлы: оставляем только те, которые участвуют в рёбрах
  // (хотя бы один вход/выход) + сами endpoints.
  // Иначе стрелки от endpoints пропадали, если зависимые узлы были конечными.
  const filteredNodes = newNodes.filter((node) => {
    if (endpoints[node.id]) {
      return true;
    }
    return nodesWithOutgoingEdges.has(node.id) || nodesWithIncomingEdges.has(node.id);
  });

  // Создаём Set из ID отфильтрованных узлов для быстрой проверки
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

  // Фильтруем рёбра: оставляем только те, у которых оба конца существуют в отфильтрованных узлах
  const filteredEdges = newEdges.filter((edge) => {
    return filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target);
  });

  const summary = {
    nodes: filteredNodes.length,
    edges: filteredEdges.length,
    requirements: requirements.length,
    endpoints: Object.keys(endpoints).length,
    lanes: {
      http: classByLayer[1].HTTP?.length || 0,
      handlers: Object.keys(classByLayer[2] || {}).map((cls) => `${cls} (${classByLayer[2][cls].length})`),
      infra: Object.keys(classByLayer[3] || {}).map((cls) => `${cls} (${classByLayer[3][cls].length})`),
    },
  };

  return { nodes: filteredNodes, edges: filteredEdges, summary };
}

export default buildGraph;

src/utils/frontend.code-workspace
{
	"folders": [
		{
			"path": "../.."
		}
	],
	"settings": {}
}

src/utils/layoutWithElk.js
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

export async function layoutWithElk(nodes, edges, direction = 'RIGHT') {
  const clonedNodes = nodes.map((n) => ({ ...n }));

  const requirements = [];
  const httpEndpoints = [];
  const classNodes = [];
  const infraNodes = [];
  const otherNodes = [];

  clonedNodes.forEach((node) => {
    const meta = node?.data?.meta || {};
    const layer = meta.layer;
    const kind = meta.kind;

    if (kind === 'requirement' || layer === 0) {
      requirements.push(node);
    } else if (kind === 'endpoint' || layer === 1) {
      httpEndpoints.push(node);
    } else if (kind === 'lane' && layer === 2) {
      classNodes.push(node);
    } else if (kind === 'lane' && layer === 3) {
      infraNodes.push(node);
    } else {
      otherNodes.push(node);
    }
  });

  // Детализация порядка для стабильной сетки
  httpEndpoints.sort((a, b) => {
    const ma = a.data?.meta || {};
    const mb = b.data?.meta || {};
    const aKey = `${ma.method || ''} ${ma.path || ''}`.trim() || a.id;
    const bKey = `${mb.method || ''} ${mb.path || ''}`.trim() || b.id;
    return aKey.localeCompare(bKey);
  });
  const laneSorter = (a, b) => {
    const ma = a.data?.meta || {};
    const mb = b.data?.meta || {};
    const aKey = ma.className || a.id;
    const bKey = mb.className || b.id;
    return aKey.localeCompare(bKey);
  };
  classNodes.sort(laneSorter);
  infraNodes.sort(laneSorter);

  const getNodeHeight = (node, fallback) => {
    const rawHeight = typeof node?.style?.height === 'number' ? node.style.height : parseFloat(node?.style?.height);
    return Number.isFinite(rawHeight) ? rawHeight : fallback;
  };
  // Строит накопленные смещения по строкам с учётом фактической высоты нод в строке
  const buildRowOffsets = (
    nodesForLayer,
    maxRows,
    fallbackHeight,
    verticalGap,
    baseY = START_Y,
    extraGapFactor = 0
  ) => {
    if (!nodesForLayer.length) return [];
    const rowCount = Math.ceil(nodesForLayer.length / maxRows);
    const rowHeights = Array.from({ length: rowCount }, () => fallbackHeight);
    nodesForLayer.forEach((node, idx) => {
      const row = idx % maxRows;
      rowHeights[row] = Math.max(rowHeights[row], getNodeHeight(node, fallbackHeight));
    });
    const offsets = [];
    let currentY = baseY;
    rowHeights.forEach((rowHeight) => {
      offsets.push(currentY);
      const extraGap = Math.max(0, rowHeight - fallbackHeight) * extraGapFactor;
      currentY += rowHeight + verticalGap + extraGap;
    });
    return offsets;
  };

  // Константы сетки
  const START_Y = 80;
  const REQ_X = -400;
  const REQ_Y_STEP = 60;

  const HTTP_BASE_X = 0;
  const HTTP_ROW_HEIGHT = 200;
  const HTTP_MAX_ROWS = 8;
  const HTTP_COL_WIDTH = 400;
  const HTTP_TO_CLASS_GAP = 380; // оставляем коридор между HTTP и классами

  const CLASS_STAGGER_X = 90;
  const CLASS_ROW_HEIGHT = 240;
  const CLASS_VERTICAL_GAP = 80;
  const CLASS_EXTRA_GAP_FACTOR = 0.35;
  const CLASS_MAX_ROWS = 4;
  const CLASS_COL_WIDTH = 440;
  const CLASS_COL_GAP = 120;

  const INFRA_STAGGER_X = 110;
  const INFRA_ROW_HEIGHT = 220;
  const INFRA_VERTICAL_GAP = 60;
  const INFRA_EXTRA_GAP_FACTOR = 0.3;
  const INFRA_MAX_ROWS = 4;
  const INFRA_COL_WIDTH = 360;
  const INFRA_COL_GAP = 120;
  const CLASS_TO_INFRA_GAP = 380; // коридор между классами и инфрой

  const OTHER_MAX_ROWS = 6;
  const OTHER_ROW_HEIGHT = 180;
  const OTHER_COL_WIDTH = 280;

  requirements.forEach((node, idx) => {
    node.position = {
      x: REQ_X,
      y: START_Y + idx * REQ_Y_STEP,
    };
  });

  httpEndpoints.forEach((node, idx) => {
    const row = idx % HTTP_MAX_ROWS;
    const col = Math.floor(idx / HTTP_MAX_ROWS);
    node.position = {
      x: HTTP_BASE_X + col * HTTP_COL_WIDTH,
      y: START_Y + row * HTTP_ROW_HEIGHT,
    };
  });

  const httpCols = Math.ceil(httpEndpoints.length / HTTP_MAX_ROWS);
  const classBaseX = HTTP_BASE_X + httpCols * HTTP_COL_WIDTH + HTTP_TO_CLASS_GAP;

  const classRowOffsets = buildRowOffsets(
    classNodes,
    CLASS_MAX_ROWS,
    CLASS_ROW_HEIGHT,
    CLASS_VERTICAL_GAP,
    START_Y,
    CLASS_EXTRA_GAP_FACTOR
  );

  classNodes.forEach((node, idx) => {
    const row = idx % CLASS_MAX_ROWS;
    const col = Math.floor(idx / CLASS_MAX_ROWS);
    const isOddRow = row % 2 === 1;
    node.position = {
      x: classBaseX + col * (CLASS_COL_WIDTH + CLASS_COL_GAP) + (isOddRow ? CLASS_STAGGER_X : 0),
      y: classRowOffsets[row] ?? START_Y,
    };
  });

  const classCols = Math.ceil(classNodes.length / CLASS_MAX_ROWS);
  const classLayerWidth = classCols ? classCols * (CLASS_COL_WIDTH + CLASS_COL_GAP) - CLASS_COL_GAP : 0;
  const infraBaseX = classBaseX + classLayerWidth + CLASS_TO_INFRA_GAP;

  const infraRowOffsets = buildRowOffsets(
    infraNodes,
    INFRA_MAX_ROWS,
    INFRA_ROW_HEIGHT,
    INFRA_VERTICAL_GAP,
    START_Y,
    INFRA_EXTRA_GAP_FACTOR
  );

  infraNodes.forEach((node, idx) => {
    const row = idx % INFRA_MAX_ROWS;
    const col = Math.floor(idx / INFRA_MAX_ROWS);
    const isOddRow = row % 2 === 1;
    node.position = {
      x: infraBaseX + col * (INFRA_COL_WIDTH + INFRA_COL_GAP) + (isOddRow ? INFRA_STAGGER_X : 0),
      y: infraRowOffsets[row] ?? START_Y,
    };
  });

  const infraCols = Math.ceil(infraNodes.length / INFRA_MAX_ROWS);
  const infraLayerWidth = infraCols ? infraCols * (INFRA_COL_WIDTH + INFRA_COL_GAP) - INFRA_COL_GAP : 0;
  const otherBaseX = infraBaseX + infraLayerWidth + 200;
  otherNodes.forEach((node, idx) => {
    const row = idx % OTHER_MAX_ROWS;
    const col = Math.floor(idx / OTHER_MAX_ROWS);
    node.position = {
      x: otherBaseX + col * OTHER_COL_WIDTH,
      y: START_Y + row * OTHER_ROW_HEIGHT,
    };
  });

  return {
    nodes: clonedNodes,
    edges,
  };
}

test-grpc-console.js
/**
 * Тестовый скрипт для проверки gRPC подключения в консоли браузера
 * 
 * Использование:
 * 1. Откройте DevTools → Console
 * 2. Скопируйте и вставьте весь скрипт
 * 3. Запустите: testGrpcConnection(9, 242)
 *    где 9 = user_id, 242 = project_id
 */

async function testGrpcConnection(userId, projectId) {
  console.log('🚀 Тест gRPC подключения');
  console.log('👤 User ID:', userId);
  console.log('📋 Project ID:', projectId);
  
  // Кодирование varint
  function encodeVarint(value) {
    const bytes = [];
    while (value > 0x7f) {
      bytes.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    bytes.push(value & 0x7f);
    return bytes;
  }
  
  // Создание Protobuf запроса AlgorithmRequest
  const requestBytes = [
    0x08, ...encodeVarint(userId),  // field 1: user_id
    0x10, ...encodeVarint(projectId) // field 2: task_id (project_id)
  ];
  
  console.log('📦 Request payload (hex):', requestBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', '));
  
  const requestBody = new Uint8Array(requestBytes);
  
  try {
    const response = await fetch('/grpc/core.api.FrontendStreamService/RunAlgorithm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc-web+proto',
        'Accept': 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
        'X-User-Agent': 'grpc-web-javascript/0.1',
      },
      body: requestBody
    });
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      console.error('❌ HTTP error:', response.status, response.statusText);
      return;
    }
    
    const reader = response.body.getReader();
    let buffer = new Uint8Array(0);
    let messageCount = 0;
    
    console.log('📖 Читаем stream...\n');
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('✅ Stream завершён');
        break;
      }
      
      // Добавляем chunk к буферу
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;
      
      // Парсим все доступные сообщения
      while (buffer.length >= 5) {
        const compressedFlag = buffer[0];
        const messageLength = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];
        
        if (buffer.length < 5 + messageLength) {
          break; // Ждём больше данных
        }
        
        const messageBytes = buffer.slice(5, 5 + messageLength);
        buffer = buffer.slice(5 + messageLength);
        
        messageCount++;
        
        console.log(`📬 Message #${messageCount}:`);
        console.log('  Length:', messageLength);
        console.log('  Hex:', Array.from(messageBytes.slice(0, Math.min(50, messageBytes.length)))
          .map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Простой парсинг для отображения status
        if (messageBytes.length >= 2) {
          let pos = 0;
          while (pos < messageBytes.length && pos < 10) {
            const tag = messageBytes[pos++];
            const fieldNum = tag >>> 3;
            const wireType = tag & 0x07;
            
            if (fieldNum === 3 && wireType === 0) { // status field
              let statusValue = 0;
              let shift = 0;
              while (pos < messageBytes.length) {
                const byte = messageBytes[pos++];
                statusValue |= (byte & 0x7f) << shift;
                if ((byte & 0x80) === 0) break;
                shift += 7;
              }
              const statusNames = ['START', 'REQUIREMENTS', 'ENDPOINTS', 'ARHITECTURE', 'DONE'];
              console.log(`  Status: ${statusNames[statusValue] || statusValue}`);
              break;
            } else {
              // Skip field
              if (wireType === 0) { // varint
                while (pos < messageBytes.length && (messageBytes[pos++] & 0x80));
              } else if (wireType === 2) { // length-delimited
                let len = 0, shift = 0;
                while (pos < messageBytes.length) {
                  const byte = messageBytes[pos++];
                  len |= (byte & 0x7f) << shift;
                  if ((byte & 0x80) === 0) break;
                  shift += 7;
                }
                pos += len;
              }
            }
          }
        }
        console.log('');
      }
    }
    
    console.log(`\n✅ Получено сообщений: ${messageCount}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

console.log('✅ Скрипт загружен! Используйте: testGrpcConnection(userId, projectId)');
console.log('Пример: testGrpcConnection(9, 242)');

vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/grpc/:path*",
      "destination": "http://78.153.139.47:8080/:path*"
    },
    {
      "source": "/core.api.FrontendStreamService/:path*",
      "destination": "http://78.153.139.47:8080/core.api.FrontendStreamService/:path*"
    },
    {
      "source": "/v1/:path*",
      "destination": "http://78.153.139.47:8000/v1/:path*"
    },
    {
      "source": "/:path((?!.*\\.).*)",
      "destination": "/index.html"
    }
  ]
}

vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'reactflow-vendor': ['reactflow'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      '/health': {
        target: 'http://78.153.139.47:8000',
        changeOrigin: true,
        secure: false,
      },
      '/v1': {
        target: 'http://78.153.139.47:8000',
        changeOrigin: true,
        secure: false,
      },
      '/grpc': {
        target: 'http://78.153.139.47:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/grpc/, ''),
        ws: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[Vite Proxy] →', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[Vite Proxy] ←', proxyRes.statusCode);
          });
          proxy.on('error', (err, req, res) => {
            console.error('[Vite Proxy] ✗', err.message);
          });
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'reactflow'],
  },
});
