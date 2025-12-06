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
