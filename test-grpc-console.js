/**
 * Тестовый скрипт для проверки gRPC подключения в консоли браузера
 * 
 * Использование:
 * 1. Откройте DevTools → Console
 * 2. Скопируйте и вставьте весь скрипт
 * 3. Запустите: testGrpcConnection(9, 242)
 *    где 9 = user_id, 242 = project_id
 */

async function testGrpcConnection(userId, projectId) {
  console.log('🚀 Тест gRPC подключения');
  console.log('👤 User ID:', userId);
  console.log('📋 Project ID:', projectId);
  
  // Кодирование varint
  function encodeVarint(value) {
    const bytes = [];
    while (value > 0x7f) {
      bytes.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    bytes.push(value & 0x7f);
    return bytes;
  }
  
  // Создание Protobuf запроса AlgorithmRequest
  const requestBytes = [
    0x08, ...encodeVarint(userId),  // field 1: user_id
    0x10, ...encodeVarint(projectId) // field 2: task_id (project_id)
  ];
  
  console.log('📦 Request payload (hex):', requestBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', '));
  
  const requestBody = new Uint8Array(requestBytes);
  
  try {
    const response = await fetch('/grpc/core.api.FrontendStreamService/RunAlgorithm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc-web+proto',
        'Accept': 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
        'X-User-Agent': 'grpc-web-javascript/0.1',
      },
      body: requestBody
    });
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      console.error('❌ HTTP error:', response.status, response.statusText);
      return;
    }
    
    const reader = response.body.getReader();
    let buffer = new Uint8Array(0);
    let messageCount = 0;
    
    console.log('📖 Читаем stream...\n');
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('✅ Stream завершён');
        break;
      }
      
      // Добавляем chunk к буферу
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;
      
      // Парсим все доступные сообщения
      while (buffer.length >= 5) {
        const compressedFlag = buffer[0];
        const messageLength = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];
        
        if (buffer.length < 5 + messageLength) {
          break; // Ждём больше данных
        }
        
        const messageBytes = buffer.slice(5, 5 + messageLength);
        buffer = buffer.slice(5 + messageLength);
        
        messageCount++;
        
        console.log(`📬 Message #${messageCount}:`);
        console.log('  Length:', messageLength);
        console.log('  Hex:', Array.from(messageBytes.slice(0, Math.min(50, messageBytes.length)))
          .map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Простой парсинг для отображения status
        if (messageBytes.length >= 2) {
          let pos = 0;
          while (pos < messageBytes.length && pos < 10) {
            const tag = messageBytes[pos++];
            const fieldNum = tag >>> 3;
            const wireType = tag & 0x07;
            
            if (fieldNum === 3 && wireType === 0) { // status field
              let statusValue = 0;
              let shift = 0;
              while (pos < messageBytes.length) {
                const byte = messageBytes[pos++];
                statusValue |= (byte & 0x7f) << shift;
                if ((byte & 0x80) === 0) break;
                shift += 7;
              }
              const statusNames = ['START', 'REQUIREMENTS', 'ENDPOINTS', 'ARHITECTURE', 'DONE'];
              console.log(`  Status: ${statusNames[statusValue] || statusValue}`);
              break;
            } else {
              // Skip field
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
        }
        console.log('');
      }
    }
    
    console.log(`\n✅ Получено сообщений: ${messageCount}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

console.log('✅ Скрипт загружен! Используйте: testGrpcConnection(userId, projectId)');
console.log('Пример: testGrpcConnection(9, 242)');
