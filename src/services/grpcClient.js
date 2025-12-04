/**
 * gRPC Web Client для подключения к Core сервису через Envoy
 * 
 * Используется Fetch API для streaming gRPC-Web запросов
 * Envoy проксирует запросы на core-service:50051
 */

// gRPC-Web статусы из proto/shared/common.proto
const GraphStatus = {
  START: 0,
  REQUIREMENTS: 1,
  ENDPOINTS: 2,
  ARCHITECTURE: 3,
  DONE: 4
};

/**
 * Класс для работы с gRPC стримом архитектуры
 */
class GRPCArchitectureClient {
  constructor(envoyUrl = null) {
    // В dev режиме используем прокси Vite, в prod - прямой адрес Envoy
    if (envoyUrl) {
      this.envoyUrl = envoyUrl;
    } else if (import.meta.env.DEV) {
      this.envoyUrl = '/grpc'; // Vite proxy
    } else {
      this.envoyUrl = 'http://78.153.139.47:8080'; // Production
    }
  }

  /**
   * Подключение к стриму RunAlgorithm через gRPC-Web
   * @param {number} userId - ID пользователя
   * @param {number} taskId - ID задачи (project ID)
   * @param {object} callbacks - Коллбэки для обработки данных
   * @param {function} callbacks.onStart - Вызывается при START
   * @param {function} callbacks.onRequirements - Вызывается при получении requirements
   * @param {function} callbacks.onEndpoints - Вызывается при получении endpoints
   * @param {function} callbacks.onArchitecture - Вызывается при получении architecture части
   * @param {function} callbacks.onDone - Вызывается когда stream завершён
   * @param {function} callbacks.onError - Вызывается при ошибке
   * @returns {Promise<AbortController>} - контроллер для отмены запроса
   */
  async connectToStream(userId, taskId, callbacks) {
    console.log(`📡 Подключение к gRPC стриму: user_id=${userId}, task_id=${taskId}`);

    const abortController = new AbortController();
    
    try {
      // URL для gRPC-Web запроса через Envoy
      const url = `${this.envoyUrl}/core.api.FrontendStreamService/RunAlgorithm`;
      
      // Создаём тело запроса в формате JSON (Envoy может транскодить JSON в Protobuf)
      const requestBody = JSON.stringify({
        user_id: userId,
        task_id: taskId
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/grpc-web+json',
          'Accept': 'application/grpc-web+json',
          'X-User-Agent': 'grpc-web-javascript/0.1',
          'X-Grpc-Web': '1'
        },
        body: requestBody,
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`gRPC request failed: ${response.status} ${response.statusText}`);
      }

      // Читаем stream построчно
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('📭 Stream завершён');
          break;
        }

        // Декодируем чанк и добавляем в буфер
        buffer += decoder.decode(value, { stream: true });
        
        // Обрабатываем построчно (каждая строка = JSON объект GraphPartResponse)
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Последняя неполная строка остаётся в буфере
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const message = JSON.parse(line);
            this._handleStreamMessage(message, callbacks);
          } catch (parseError) {
            console.error('❌ Ошибка парсинга gRPC сообщения:', parseError, line);
          }
        }
      }

      // Проверяем, был ли получен статус DONE
      callbacks.onDone?.();

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('🛑 Stream отменён');
      } else {
        console.error('❌ gRPC stream error:', error);
        callbacks.onError?.(error);
      }
    }

    return abortController;
  }

  /**
   * Обработка одного сообщения из stream
   * @private
   */
  _handleStreamMessage(message, callbacks) {
    const { task_id, response_id, status } = message;
    
    console.log(`📨 Получено сообщение: task_id=${task_id}, response_id=${response_id}, status=${status}`);

    switch (status) {
      case GraphStatus.START:
        callbacks.onStart?.();
        break;

      case GraphStatus.REQUIREMENTS:
        if (message.graph_requirements) {
          const { total, requirements } = message.graph_requirements;
          callbacks.onRequirements?.({
            total,
            requirements: requirements || []
          });
        }
        break;

      case GraphStatus.ENDPOINTS:
        if (message.graph_endpoints) {
          const { total, endpoints } = message.graph_endpoints;
          // Конвертируем map в объект
          const endpointsObj = endpoints || {};
          callbacks.onEndpoints?.({
            total,
            endpoints: endpointsObj
          });
        }
        break;

      case GraphStatus.ARCHITECTURE:
        if (message.graph_architecture) {
          const { parent, children } = message.graph_architecture;
          callbacks.onArchitecture?.({
            parent,
            children: children || []
          });
        }
        break;

      case GraphStatus.DONE:
        callbacks.onDone?.();
        break;

      default:
        console.warn('⚠️ Неизвестный статус:', status);
    }
  }
}

// Экспортируем класс и создаём singleton instance
const grpcClient = new GRPCArchitectureClient();

export { GRPCArchitectureClient, grpcClient };
export default grpcClient;
