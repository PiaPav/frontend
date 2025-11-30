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
      console.log(`📡 Подключение к gRPC стриму для task_id=${taskId}, user_id=${userId}...`);

      // ❗ Прямое подключение через Fetch API в streaming режиме
      // gRPC требует Envoy proxy для браузера, но мы попробуем напрямую
      const grpcUrl = `${this.baseUrl}/core.api.FrontendStreamService/RunAlgorithm`;
      
      // Создаем protobuf запрос вручную (JSON fallback)
      const request = {
        user_id: userId,
        task_id: taskId
      };

      console.log('🔄 Отправка запроса:', request);

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
    console.log('🎭 Запуск симуляции gRPC стрима...');
    
    // Полные данные из Граф.txt
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
          'registration': 'POST /v1/auth/registration',
          'refresh': 'POST /v1/auth/refresh',
          'patch_project': 'PATCH /v1/project/{project_id}',
          'patch_account': 'PATCH /v1/account',
          'login': 'POST /v1/auth/login',
          'homepage': 'GET /v1/home',
          'get_project': 'GET /v1/project/{project_id}',
          'get_projects_list': 'GET /v1/project',
          'get_account': 'GET /v1/account',
          'delete_project': 'DELETE /v1/project/{project_id}',
          'create_project': 'POST /v1/project',
        }
      },
      architecture: [
        { parent: 'Account.create_account', children: ['datamanager/DatabaseManager.session', 'accounts/Account', 'accounts/session.add'] },
        { parent: 'Account.get_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/session.get', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'] },
        { parent: 'Account.get_account_by_login', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute', 'accounts/where', 'accounts/select', 'accounts/result.scalar_one_or_none', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'] },
        { parent: 'Account.is_login_exists', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute', 'accounts/where', 'accounts/select', 'accounts/result.scalar_one_or_none'] },
        { parent: 'Account.patch_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/Account.get_account_by_id', 'accounts/items', 'accounts/patch_data.model_dump', 'accounts/setattr', 'accounts/session.flush'] },
        { parent: 'DataBaseException.__init__', children: ['base/__init__', 'base/super'] },
        { parent: 'DataBaseEntityNotExists.__init__', children: ['base/__init__', 'base/super'] },
        { parent: 'DatabaseManager.__init__', children: ['datamanager/create_async_engine', 'datamanager/async_sessionmaker'] },
        { parent: 'DatabaseManager.init_models', children: ['datamanager/self.engine.begin', 'datamanager/Base.metadata.tables.get', 'datamanager/conn.run_sync', 'datamanager/ValueError', 'datamanager/conn.run_sync', 'datamanager/Base.metadata.tables.get', 'datamanager/conn.run_sync', 'datamanager/ValueError', 'datamanager/conn.run_sync'] },
        { parent: 'DatabaseManager.session', children: ['datamanager/self.session_factory', 'datamanager/session.commit', 'datamanager/session.rollback', 'datamanager/DatabaseManager.close'] },
        { parent: 'DatabaseManager.close', children: ['datamanager/self.engine.dispose'] },
        { parent: 'init_db', children: ['datamanager/DatabaseManager.init_models'] },
        { parent: 'Project.create_project', children: ['datamanager/DatabaseManager.session', 'projects/Project', 'projects/session.add'] },
        { parent: 'Project.get_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/session.get', 'projects/log.error', 'projects/DataBaseEntityNotExists'] },
        { parent: 'Project.patch_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/Project.get_project_by_id', 'projects/items', 'projects/patch_data.model_dump', 'projects/setattr', 'projects/session.flush'] },
        { parent: 'Project.get_project_list_by_account_id', children: ['datamanager/DatabaseManager.session', 'projects/where', 'projects/select', 'projects/session.execute', 'projects/all', 'projects/result.scalars', 'projects/len'] },
        { parent: 'Project.delete_project', children: ['datamanager/DatabaseManager.session', 'projects/Project.get_project_by_id', 'projects/session.delete'] },
        { parent: 'get_account', children: ['account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/log.info', 'auth_service/AuthService.verify_token', 'account_service/AccountService.get_account_by_id', 'account_endpoints/log.info', 'account_endpoints/router.get'] },
        { parent: 'patch_account', children: ['account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/Depends', 'account_endpoints/log.info', 'auth_service/AuthService.verify_token', 'account_service/AccountService.patch_account_by_id', 'account_endpoints/log.info', 'account_endpoints/router.patch'] },
        { parent: 'login', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.login', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
        { parent: 'refresh', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.refresh', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
        { parent: 'registration', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.registration', 'auth_endpoints/log.info', 'auth_endpoints/router.post'] },
        { parent: 'homepage', children: ['core_endpoints/Depends', 'core_endpoints/Depends', 'core_endpoints/Depends', 'core_endpoints/log.info', 'auth_service/AuthService.verify_token', 'core_service/CoreService.get_homepage', 'core_endpoints/log.info', 'core_endpoints/router.get'] },
        { parent: 'get_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.get_project_by_id', 'project_endpoints/log.info', 'project_endpoints/router.get'] },
        { parent: 'create_project', children: ['project_endpoints/File', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.create_project', 'project_endpoints/ProjectCreateData', 'project_endpoints/log.info', 'project_endpoints/router.post'] },
        { parent: 'patch_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.update_project', 'project_endpoints/log.info', 'project_endpoints/router.patch'] },
        { parent: 'delete_project', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.delete_project', 'project_endpoints/log.info', 'project_endpoints/router.delete'] },
        { parent: 'get_projects_list', children: ['project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/Depends', 'project_endpoints/log.info', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.get_projects_by_account_id', 'project_endpoints/log.info', 'project_endpoints/router.get'] },
        { parent: 'lifespan', children: ['datamanager/DatabaseManager.init_models', 'manager/ConnectionBrokerManager.connect', 'datamanager/DatabaseManager.close', 'datamanager/DatabaseManager.close'] },
        { parent: 'TaskSession.__init__', children: ['core_server/asyncio.Queue'] },
        { parent: 'TaskSession.add_message', children: ['core_server/self.message_queue.put'] },
        { parent: 'TaskSession.get_next_message', children: ['core_server/self.message_queue.get'] },
        { parent: 'TaskSession.close', children: [] },
        { parent: 'TaskManager.__init__', children: [] },
        { parent: 'TaskManager.get_or_create_session', children: ['core_server/TaskSession'] },
        { parent: 'TaskManager.remove_session', children: [] },
        { parent: 'FrontendStreamService.__init__', children: [] },
        { parent: 'FrontendStreamService.RunAlgorithm', children: ['core_pb2_grpc/grpc.experimental.unary_stream'] },
        { parent: 'AlgorithmConnectionService.__init__', children: [] },
        { parent: 'AlgorithmConnectionService.ConnectToCore', children: ['algorithm_pb2_grpc/grpc.experimental.stream_unary'] },
        { parent: 'CoreServer.__init__', children: ['core_server/TaskManager', 'core_server/FrontendStreamService', 'core_server/AlgorithmConnectionService', 'core_server/grpc.aio.server', 'core_server/core_pb2_grpc.add_FrontendStreamServiceServicer_to_server', 'core_server/algorithm_pb2_grpc.add_AlgorithmConnectionServiceServicer_to_server', 'core_server/self.server.add_insecure_port'] },
        { parent: 'CoreServer.start', children: ['core_server/print', 'core_server/self.server.start', 'core_server/self.server.wait_for_termination'] },
        { parent: 'CoreServer.stop', children: ['core_server/print', 'core_server/list', 'core_server/self.task_manager.tasks.items', 'datamanager/DatabaseManager.close', 'core_server/self.task_manager.remove_session', 'core_server/self.server.stop'] },
        { parent: 'AlgorithmConnectionServiceStub.__init__', children: ['algorithm_pb2_grpc/channel.stream_unary'] },
        { parent: 'AlgorithmConnectionServiceServicer.ConnectToCore', children: ['algorithm_pb2_grpc/context.set_code', 'algorithm_pb2_grpc/context.set_details', 'algorithm_pb2_grpc/NotImplementedError'] },
        { parent: 'add_AlgorithmConnectionServiceServicer_to_server', children: ['algorithm_pb2_grpc/grpc.stream_unary_rpc_method_handler', 'algorithm_pb2_grpc/grpc.method_handlers_generic_handler', 'algorithm_pb2_grpc/server.add_generic_rpc_handlers', 'algorithm_pb2_grpc/server.add_registered_method_handlers'] },
        { parent: 'FrontendStreamServiceStub.__init__', children: ['core_pb2_grpc/channel.unary_stream'] },
        { parent: 'FrontendStreamServiceServicer.RunAlgorithm', children: ['core_pb2_grpc/context.set_code', 'core_pb2_grpc/context.set_details', 'core_pb2_grpc/NotImplementedError'] },
        { parent: 'add_FrontendStreamServiceServicer_to_server', children: ['core_pb2_grpc/grpc.unary_stream_rpc_method_handler', 'core_pb2_grpc/grpc.method_handlers_generic_handler', 'core_pb2_grpc/server.add_generic_rpc_handlers', 'core_pb2_grpc/server.add_registered_method_handlers'] },
        { parent: 'Consumer.__init__', children: [] },
        { parent: 'Consumer.start', children: ['consumer/self.connection.connect', 'consumer/self.connection.channel.declare_queue', 'consumer/log.info', 'consumer/self.connection.channel.set_qos', 'consumer/log.info', 'consumer/wait', 'consumer/asyncio.Event', 'consumer/log.info'] },
        { parent: 'Consumer.messages', children: ['consumer/RuntimeError', 'consumer/self.queue.iterator', 'consumer/message.process', 'consumer/json.loads', 'consumer/log.info', 'consumer/log.error'] },
        { parent: 'ConnectionBrokerManager.__init__', children: [] },
        { parent: 'ConnectionBrokerManager.connect', children: ['manager/aio_pika.connect_robust', 'manager/self.connection.channel', 'manager/self.channel.declare_exchange', 'manager/log.info', 'manager/ConnectionBrokerManager._create_queue', 'manager/ConnectionBrokerManager._bind_exchange_as_queue'] },
        { parent: 'ConnectionBrokerManager.close', children: ['manager/self.connection.close', 'manager/log.info'] },
        { parent: 'ConnectionBrokerManager._create_queue', children: ['manager/self.channel.declare_queue', 'manager/log.info'] },
        { parent: 'ConnectionBrokerManager._bind_exchange_as_queue', children: ['manager/queue.bind', 'manager/log.info'] },
        { parent: 'Producer.__init__', children: [] },
        { parent: 'Producer.publish', children: ['producer/encode', 'producer/json.dumps', 'producer/aio_pika.Message', 'producer/self.connection.exchange.publish', 'producer/log.info'] },
        { parent: 'AbstractStorage.upload_fileobj', children: [] },
        { parent: 'AbstractStorage.delete_file', children: [] },
        { parent: 'ObjectStorageManager.__init__', children: ['s3_manager/boto3.session.Session', 's3_manager/session.client'] },
        { parent: 'ObjectStorageManager.upload_fileobj', children: ['s3_manager/run_in_threadpool', 's3_manager/log.info', 's3_manager/log.error'] },
        { parent: 'ObjectStorageManager.delete_file', children: ['s3_manager/run_in_threadpool', 's3_manager/log.info', 's3_manager/log.error'] },
        { parent: 'AccountService.get_account_by_id', children: ['accounts/Account.get_account_by_id', 'account_service/AccountFullData.model_validate', 'account_service/log.error', 'account_service/HTTPException', 'account_service/log.error', 'account_service/type', 'account_service/str', 'account_service/HTTPException', 'account_service/type', 'account_service/str'] },
        { parent: 'AccountService.patch_account_by_id', children: ['accounts/Account.patch_account_by_id', 'account_service/AccountFullData.model_validate', 'account_service/log.error', 'account_service/HTTPException', 'account_service/log.error', 'account_service/type', 'account_service/str', 'account_service/HTTPException', 'account_service/type', 'account_service/str'] },
        { parent: 'AuthService.registration', children: ['auth_service/AuthService.hash_password', 'accounts/Account.is_login_exists', 'auth_service/log.error', 'auth_service/HTTPException', 'accounts/Account.create_account', 'auth_service/AccountCreateData', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AccountData.model_validate'] },
        { parent: 'AuthService.verify_token', children: ['auth_service/AuthService.check_access_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str'] },
        { parent: 'AuthService.check_access_token', children: ['auth_service/AuthService.decode_token', 'auth_service/datetime.now', 'auth_service/HTTPException'] },
        { parent: 'AuthService.login', children: ['accounts/Account.get_account_by_login', 'auth_service/AuthService.verify_password', 'auth_service/AccountData', 'auth_service/AuthService.encode_to_token', 'auth_service/AuthService.encode_to_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AuthResponseData'] },
        { parent: 'AuthService.refresh', children: ['auth_service/AuthService.decode_token', 'auth_service/datetime.now', 'auth_service/log.error', 'auth_service/HTTPException', 'accounts/Account.get_account_by_id', 'auth_service/HTTPException', 'auth_service/AccountData', 'auth_service/AuthService.encode_to_token', 'auth_service/AuthService.encode_to_token', 'auth_service/log.error', 'auth_service/HTTPException', 'auth_service/log.error', 'auth_service/type', 'auth_service/str', 'auth_service/HTTPException', 'auth_service/type', 'auth_service/str', 'auth_service/AuthResponseData'] },
        { parent: 'AuthService.encode_to_token', children: ['auth_service/datetime.now', 'auth_service/timedelta', 'auth_service/data.model_dump', 'auth_service/start_date.isoformat', 'auth_service/end_date.isoformat', 'auth_service/JWT.encode'] },
        { parent: 'AuthService.decode_token', children: ['auth_service/JWT.decode', 'auth_service/AccountEncodeData', 'auth_service/datetime.fromisoformat', 'auth_service/datetime.fromisoformat'] },
        { parent: 'AuthService.hash_password', children: ['auth_service/bcrypt.gensalt', 'auth_service/bcrypt.hashpw', 'auth_service/password.encode', 'auth_service/hashed.decode'] },
        { parent: 'AuthService.verify_password', children: ['auth_service/bcrypt.checkpw', 'auth_service/password.encode', 'auth_service/hashed_password.encode', 'auth_service/log.error', 'auth_service/HTTPException'] },
        { parent: 'CoreService.get_homepage', children: ['accounts/Account.get_account_by_id', 'core_service/AccountData.model_validate', 'projects/Project.get_project_list_by_account_id', 'core_service/ProjectDataLite.model_validate', 'core_service/ProjectListDataLite', 'core_service/HomePageData', 'core_service/log.error', 'core_service/type', 'core_service/str', 'core_service/HTTPException', 'core_service/type', 'core_service/str'] },
        { parent: 'ProjectService.get_project_by_id', children: ['projects/Project.get_project_by_id', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
        { parent: 'ProjectService.create_project', children: ['projects/Project.create_project', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
        { parent: 'ProjectService.update_project', children: ['projects/Project.patch_project_by_id', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
        { parent: 'ProjectService.delete_project', children: ['projects/Project.delete_project', 'project_service/log.error', 'project_service/HTTPException', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
        { parent: 'ProjectService.get_projects_by_account_id', children: ['projects/Project.get_project_list_by_account_id', 'project_service/ProjectDataLite.model_validate', 'project_service/ProjectListDataLite', 'project_service/log.error', 'project_service/type', 'project_service/str', 'project_service/HTTPException', 'project_service/type', 'project_service/str'] },
        { parent: 'TaskService.add_task', children: [] },
        { parent: 'load_config', children: ['config/Config', 'config/ConfigAuth', 'config/os.environ.get', 'config/int', 'config/int', 'config/ConfigServer', 'config/os.environ.get', 'config/int', 'config/os.environ.get', 'config/ConfigDB', 'config/os.environ.get', 'config/int', 'config/os.environ.get', 'config/lower', 'config/os.environ.get', 'config/ConfigBroker', 'config/os.environ.get', 'config/os.environ.get', 'config/os.environ.get', 'config/os.environ.get'] },
        { parent: 'create_logger', children: ['logger/logging.getLogger', 'logger/logger.setLevel', 'logger/logging.Formatter', 'logger/logging.StreamHandler', 'logger/console_handler.setFormatter', 'logger/logger.addHandler'] }
      ]
    };

    // 1. Отправка START
    console.log('✅ Stream started');
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Отправка Requirements
    console.log('✅ Sending REQUIREMENTS:', mockData.requirements);
    if (callbacks.onRequirements) {
      callbacks.onRequirements(mockData.requirements);
    } else {
      console.warn('⚠️ onRequirements callback is not defined!');
    }
    await new Promise(resolve => setTimeout(resolve, 800));

    // 3. Отправка Endpoints
    console.log('✅ Sending ENDPOINTS:', mockData.endpoints);
    if (callbacks.onEndpoints) {
      callbacks.onEndpoints(mockData.endpoints);
    } else {
      console.warn('⚠️ onEndpoints callback is not defined!');
    }
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Отправка Architecture по частям (как в реальном стриме)
    console.log(`✅ Starting ARCHITECTURE stream (${mockData.architecture.length} parts)...`);
    for (let i = 0; i < mockData.architecture.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 150));
      console.log(`✅ Sending ARCHITECTURE part ${i + 1}/${mockData.architecture.length}:`, mockData.architecture[i]);
      if (callbacks.onArchitecture) {
        callbacks.onArchitecture(mockData.architecture[i]);
      } else {
        console.warn('⚠️ onArchitecture callback is not defined!');
      }
    }

    // 5. Завершение
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('✅ Stream DONE - calling onDone callback');
    if (callbacks.onDone) {
      callbacks.onDone();
    } else {
      console.warn('⚠️ onDone callback is not defined!');
    }
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
