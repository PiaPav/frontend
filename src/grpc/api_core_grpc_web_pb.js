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
          'Accept': 'application/grpc-web+proto',
          'X-Grpc-Web': '1',
          'X-User-Agent': 'grpc-web-javascript/0.1',
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
