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
