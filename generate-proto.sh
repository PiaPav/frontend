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
