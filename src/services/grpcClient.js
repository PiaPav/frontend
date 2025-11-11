/**
 * gRPC Web Client для подключения к Core сервису
 * 
 * Этот клиент будет использоваться для получения данных архитектуры
 * в режиме реального времени через gRPC stream.
 * 
 * ВАЖНО: Для работы с gRPC в браузере нужно:
 * 1. Установить пакеты:
 *    npm install grpc-web google-protobuf
 * 
 * 2. Сгенерировать клиентский код из .proto файлов:
 *    protoc -I=. core.proto common.proto \
 *      --js_out=import_style=commonjs:./generated \
 *      --grpc-web_out=import_style=commonjs,mode=grpcwebtext:./generated
 * 
 * 3. Настроить Envoy proxy для конвертации gRPC-Web в gRPC
 */

// После установки grpc-web раскомментируйте:
// import { FrontendStreamServiceClient } from './generated/core_grpc_web_pb';
// import { AlgorithmRequest } from './generated/core_pb';

/**
 * Класс для работы с gRPC стримом архитектуры
 */
class GRPCArchitectureClient {
  constructor(baseUrl = 'http://78.153.139.47:8080') {
    this.baseUrl = baseUrl;
    // this.client = new FrontendStreamServiceClient(baseUrl);
  }

  /**
   * Подключение к стриму RunAlgorithm
   * @param {number} userId - ID пользователя
   * @param {number} taskId - ID задачи (project ID)
   * @param {object} callbacks - Коллбэки для обработки данных
   * @param {function} callbacks.onRequirements - Вызывается при получении requirements
   * @param {function} callbacks.onEndpoints - Вызывается при получении endpoints
   * @param {function} callbacks.onArchitecture - Вызывается при получении architecture части
   * @param {function} callbacks.onDone - Вызывается когда stream завершён
   * @param {function} callbacks.onError - Вызывается при ошибке
   */
  async connectToStream(userId, taskId, callbacks) {
    try {
      console.log(`📡 Connecting to gRPC stream for task ${taskId}...`);

      // TODO: Заменить на реальный gRPC клиент после установки grpc-web
      // const request = new AlgorithmRequest();
      // request.setUserId(userId);
      // request.setTaskId(taskId);

      // const stream = this.client.runAlgorithm(request, {});

      // stream.on('data', (response) => {
      //   const status = response.getStatus();
      //   
      //   switch (status) {
      //     case 1: // REQUIREMENTS
      //       const reqs = response.getGraphRequirements();
      //       callbacks.onRequirements?.({
      //         total: reqs.getTotal(),
      //         requirements: reqs.getRequirementsList()
      //       });
      //       break;
      //     
      //     case 2: // ENDPOINTS
      //       const eps = response.getGraphEndpoints();
      //       callbacks.onEndpoints?.({
      //         total: eps.getTotal(),
      //         endpoints: eps.getEndpointsMap()
      //       });
      //       break;
      //     
      //     case 3: // ARCHITECTURE
      //       const arch = response.getGraphArchitecture();
      //       callbacks.onArchitecture?.({
      //         parent: arch.getParent(),
      //         children: arch.getChildrenList()
      //       });
      //       break;
      //     
      //     case 4: // DONE
      //       callbacks.onDone?.();
      //       break;
      //   }
      // });

      // stream.on('error', (error) => {
      //   console.error('❌ gRPC stream error:', error);
      //   callbacks.onError?.(error);
      // });

      // stream.on('end', () => {
      //   console.log('✅ gRPC stream completed');
      // });

      // ВРЕМЕННАЯ ЗАГЛУШКА - симуляция работы
      // Замените этот код на реальный gRPC клиент выше
      await this._simulateStream(callbacks);

    } catch (error) {
      console.error('❌ Failed to connect to gRPC stream:', error);
      callbacks.onError?.(error);
    }
  }

  /**
   * ВРЕМЕННАЯ ФУНКЦИЯ - Симуляция gRPC стрима
   * Удалите эту функцию после настройки реального gRPC клиента
   */
  async _simulateStream(callbacks) {
    // Симуляция данных из Граф.txt
    const mockData = {
      requirements: {
        total: 15,
        requirements: [
          'aio-pika', 'asyncpg', 'bcrypt', 'boto3', 'fastapi',
          'grpcio', 'grpcio-tools', 'pika', 'protobuf', 'pyjwt',
          'python-dotenv', 'python-multipart', 'pyyaml', 'sqlalchemy', 'uvicorn'
        ]
      },
      endpoints: {
        total: 11,
        endpoints: {
          'POST /v1/auth/registration': 'Account.create_account',
          'POST /v1/auth/login': 'Account.login',
          'POST /v1/auth/refresh': 'Account.refresh_token',
          'GET /v1/project': 'Project.get_all_projects',
          'POST /v1/project': 'Project.create_project',
          'GET /v1/project/{id}': 'Project.get_project_by_id',
          'PUT /v1/project/{id}': 'Project.update_project',
          'DELETE /v1/project/{id}': 'Project.delete_project',
          'POST /v1/project/{id}/upload': 'Project.upload_file',
          'GET /v1/project/{id}/status': 'Project.get_status',
          'GET /v1/health': 'Health.check',
        }
      },
      architecture: [
        { parent: 'Account.create_account', children: ['datamanager/DatabaseManager.session', 'accounts/Account', 'accounts/session.add'] },
        { parent: 'Account.get_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/session.get', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'] },
        { parent: 'Account.login', children: ['datamanager/DatabaseManager.session', 'accounts/session.query', 'accounts/verify_password', 'accounts/create_tokens'] },
        { parent: 'Account.refresh_token', children: ['accounts/verify_token', 'accounts/create_tokens'] },
        { parent: 'Project.create_project', children: ['datamanager/DatabaseManager.session', 'projects/Project', 'projects/session.add', 'projects/commit'] },
        { parent: 'Project.get_all_projects', children: ['datamanager/DatabaseManager.session', 'projects/session.query', 'projects/all'] },
        { parent: 'Project.get_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/session.get', 'projects/DataBaseEntityNotExists'] },
        { parent: 'Project.update_project', children: ['datamanager/DatabaseManager.session', 'projects/session.query', 'projects/commit'] },
        { parent: 'Project.delete_project', children: ['datamanager/DatabaseManager.session', 'projects/session.delete', 'projects/commit'] },
        { parent: 'Project.upload_file', children: ['boto3/S3Client', 'projects/upload_to_s3', 'projects/update_project'] },
        { parent: 'DatabaseManager.session', children: ['sqlalchemy/Session', 'sqlalchemy/create_engine', 'sqlalchemy/sessionmaker'] },
        { parent: 'DatabaseManager.create_tables', children: ['sqlalchemy/Base.metadata.create_all'] },
        { parent: 'Health.check', children: ['fastapi/Response', 'health/status'] },
      ]
    };

    // 1. Отправка START
    console.log('✅ Stream started');
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Отправка Requirements
    console.log('✅ Received REQUIREMENTS');
    callbacks.onRequirements?.(mockData.requirements);
    await new Promise(resolve => setTimeout(resolve, 800));

    // 3. Отправка Endpoints
    console.log('✅ Received ENDPOINTS');
    callbacks.onEndpoints?.(mockData.endpoints);
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Отправка Architecture по частям (как в реальном стриме)
    for (let i = 0; i < mockData.architecture.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 150));
      console.log(`✅ Received ARCHITECTURE part ${i + 1}/${mockData.architecture.length}`);
      callbacks.onArchitecture?.(mockData.architecture[i]);
    }

    // 5. Завершение
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('✅ Stream DONE');
    callbacks.onDone?.();
  }

  /**
   * Закрытие соединения
   */
  disconnect() {
    console.log('Disconnecting from gRPC stream...');
    // TODO: Закрыть stream если он открыт
  }
}

// Singleton instance
let grpcClient = null;

/**
 * Получить экземпляр gRPC клиента
 */
export function getGRPCClient() {
  if (!grpcClient) {
    grpcClient = new GRPCArchitectureClient();
  }
  return grpcClient;
}

export default GRPCArchitectureClient;
