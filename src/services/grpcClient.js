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

    callbacks.onStart?.();
    console.log('[grpc] ▶️ connectToStream start', {
      url: `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`,
      userId: Number(userId),
      taskId: Number(taskId)
    });

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
        } else if (error.code === 404) {
          errorMsg += '\nЭндпоинт не найден. Проверьте конфигурацию Envoy.';
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
    const responseId = message.getResponseId();
    
    console.log(`📨 Обработка сообщения: status=${this.getStatusName(status)}, response_id=${responseId}`);

    switch (status) {
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
        // ВАЖНО: В DONE parent="" и children="" - это заглушка, игнорируем
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
