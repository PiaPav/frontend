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
