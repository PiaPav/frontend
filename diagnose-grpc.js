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
