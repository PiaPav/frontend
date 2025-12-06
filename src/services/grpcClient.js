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
const GraphStatus = {
  START: 0,
  REQUIREMENTS: 1,
  ENDPOINTS: 2,
  ARCHITECTURE: 3,
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
    if (envGrpcUrl) {
      this.envoyUrl = envGrpcUrl;
    } else if (envoyUrl) {
      this.envoyUrl = envoyUrl;
    } else if (import.meta.env?.DEV) {
      this.envoyUrl = '/grpc';
    } else {
      this.envoyUrl = 'http://78.153.139.47:8080';
    }

    console.log('[grpc] init', {
      envoyUrl: this.envoyUrl,
      envGrpcUrl,
      passedEnvoyUrl: envoyUrl,
      locationOrigin: typeof window !== 'undefined' ? window.location.origin : 'n/a',
      dev: import.meta.env?.DEV,
    });
    if (typeof this.envoyUrl === 'string' && this.envoyUrl.startsWith('/')) {
      console.warn('[grpc] base URL looks relative, check VITE_GRPC_URL');
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
   *   GraphStatus status = 1;
   *   int64 response_id = 2;
   *   repeated string requirements = 3;
   *   map<string, string> endpoints = 4;
   *   string parent = 5;
   *   repeated string children = 6;
   * }
   */
  decodeGraphPartResponse(bytes) {
    const result = {
      status: null,
      response_id: null,
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
        case 1: // status (enum, varint)
          const { value: status, length: statusLen } = this.readVarint(data, pos);
          result.status = status;
          pos += statusLen;
          break;

        case 2: // response_id (int64, varint)
          const { value: respId, length: respIdLen } = this.readVarint(data, pos);
          result.response_id = respId;
          pos += respIdLen;
          break;

        case 3: // requirements (repeated string)
          const { value: reqStr, length: reqLen } = this.readString(data, pos);
          result.requirements.push(reqStr);
          pos += reqLen;
          break;

        case 4: // endpoints (map<string, string>)
          const { key, value: endpValue, length: endpLen } = this.readMapEntry(data, pos);
          result.endpoints[key] = endpValue;
          pos += endpLen;
          break;

        case 5: // parent (string)
          const { value: parentStr, length: parentLen } = this.readString(data, pos);
          result.parent = parentStr;
          pos += parentLen;
          break;

        case 6: // children (repeated string)
          const { value: childStr, length: childLen } = this.readString(data, pos);
          result.children.push(childStr);
          pos += childLen;
          break;

        default:
          // Пропускаем неизвестные поля
          pos = this.skipField(data, pos, wireType);
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
   * @returns {Promise<AbortController>} - контроллер для отмены запроса
   */
  async connectToStream(userId, taskId, callbacks) {
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
            if (message.status === GraphStatus.DONE) {
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
    const names = ['START', 'REQUIREMENTS', 'ENDPOINTS', 'ARCHITECTURE', 'DONE'];
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
      case GraphStatus.START:
        console.log('🎬 START - анализ начался');
        callbacks.onStart?.();
        break;

      case GraphStatus.REQUIREMENTS:
        console.log(`📋 REQUIREMENTS - получено ${requirements.length} зависимостей`);
        callbacks.onRequirements?.({
          requirements: requirements || []
        });
        break;

      case GraphStatus.ENDPOINTS:
        console.log(`🔗 ENDPOINTS - получено ${Object.keys(endpoints).length} эндпоинтов`);
        callbacks.onEndpoints?.({
          endpoints: endpoints || {}
        });
        break;

      case GraphStatus.ARCHITECTURE:
        console.log(`🏗️ ARCHITECTURE - узел ${parent} с ${children.length} детьми`);
        callbacks.onArchitecture?.({
          parent,
          children: children || []
        });
        break;

      case GraphStatus.DONE:
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

export { GRPCArchitectureClient, grpcClient, GraphStatus };
export default grpcClient;







