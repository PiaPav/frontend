# Схема подключений фронтенда

## Базовые адреса и env
- REST `API_BASE_URL = VITE_API_URL || '/v1'` → в dev `/v1` проксится на `http://78.153.139.47:8000` (см. `vite.config.js`).
- gRPC-Web `GRPC_URL = VITE_GRPC_URL` → в dev подставляется `/grpc`, проксится на `http://78.153.139.47:8080` и переписывает префикс (`/grpc` убирается).
- Таймаут gRPC: `VITE_GRPC_TIMEOUT_MS` (120000 мс в `.env.local`, по умолчанию 60000).
- Токены: `localStorage.access_token` и `refresh_token`; access добавляется в Authorization Bearer для REST, refresh используется в `/auth/refresh`.

## REST (src/services/api.js)
- Аутентификация: `POST /auth/login`, `POST /auth/registration`, `POST /auth/refresh`.
- Домашняя страница/профиль: `GET /home` (используется сразу после логина, чтобы загрузить данные пользователя).
- Аккаунт: `GET /account`, `PATCH /account`, `DELETE /account`; email link/unlink `POST /account/email`, `DELETE /account/email`, проверка `POST /account/verification_email`.
- Проекты:
  - `GET /project` — список.
  - `GET /project/{id}` — детали (включая сохранённую архитектуру).
  - `POST /project` — загрузка ZIP: FormData c полем `file`; `name` и `description` передаются в query.
  - `PATCH /project/{id}` — обновление (в т.ч. сохранение architecture {requirements, endpoints, data}).
  - `DELETE /project/{id}` — удаление.

### Где используются REST
- `src/pages/Projects/NewProject.jsx`: создаёт проект через `projectsAPI.create`, затем сохраняет архитектуру `PATCH /project/{id}`.
- `src/pages/Projects/ProjectAnalysis.jsx`: грузит проект `GET /project/{id}`, может удалять через `projectsAPI.delete`.
- `src/pages/Projects/ProjectsList.jsx`, `ProjectView*.jsx`: список/детали/удаление тоже через `projectsAPI`.
- `src/context/AuthContext.jsx`: логин/регистрация/refresh + `GET /home` для данных пользователя.

## gRPC-Web поток (src/services/grpcClient.js)
- Клиент: `SimpleFrontendStreamServiceClient` (`api_core_grpc_web_pb`). URL берётся из логики выше.
- Метод: `POST {GRPC_URL}/core.api.FrontendStreamService/RunAlgorithm` с `Content-Type: application/grpc-web+proto`.
- Запрос: `AlgorithmRequest { user_id, task_id }`.
- Ответный поток по статусам `ParseStatus`:
  - `REQUIREMENTS`: список требований.
  - `ENDPOINTS`: map `"METHOD /path" -> serviceName`.
  - `ARHITECTURE`: `parent` + `children[]`.
  - `DONE`: завершение.
- Ошибки: 401 обрабатываются в axios-интерцепторе, 404/502/503/500 для gRPC логируются и показываются в UI (см. обработчики в `grpcClient.js`).

### Где вызывается gRPC
- `src/pages/Projects/NewProject.jsx`: после успешного `POST /project` стартует `connectToStream(user.id, projectId)`, собирает requirements/endpoints/architecture и сохраняет результат обратно `PATCH /project/{id}`.
- `src/pages/Projects/ProjectAnalysis.jsx`: при открытии проекта, если нет сохранённой архитектуры или первый рендер, запускает тот же поток для обновления данных; по окончании проставляет `streamComplete`.

## Dev proxy (vite.config.js)
- `/v1` и `/health` → `http://78.153.139.47:8000`.
- `/grpc` → `http://78.153.139.47:8080`, `rewrite: /^\\/grpc/ -> ''`, `ws: true`; логирует proxyReq/proxyRes/error.
