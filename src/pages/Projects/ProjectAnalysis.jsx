import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectAnalysis.module.css';

// Симуляция потока данных с сервера (имитация реального gRPC)
const simulateServerStream = async (onMessage) => {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // 1. REQUIREMENTS (response_id: 1)
  await delay(300);
  onMessage({
    task_id: 42,
    response_id: 1,
    status: 'REQUIREMENTS',
    graph_requirements: {
      total: 15,
      requirements: [
        'aio-pika', 'asyncpg', 'bcrypt', 'boto3', 'fastapi',
        'grpcio', 'grpcio-tools', 'pika', 'protobuf', 'pyjwt',
        'python-dotenv', 'python-multipart', 'pyyaml', 'sqlalchemy', 'uvicorn'
      ]
    }
  });

  // 2. ENDPOINTS (response_id: 2)
  await delay(400);
  onMessage({
    task_id: 42,
    response_id: 2,
    status: 'ENDPOINTS',
    graph_endpoints: {
      total: 11,
      endpoints: {
        'registration': 'POST /v1/auth/registration',
        'login': 'POST /v1/auth/login',
        'refresh': 'POST /v1/auth/refresh',
        'get_account': 'GET /v1/account',
        'patch_account': 'PATCH /v1/account',
        'get_projects_list': 'GET /v1/project',
        'get_project': 'GET /v1/project/{project_id}',
        'create_project': 'POST /v1/project',
        'patch_project': 'PATCH /v1/project/{project_id}',
        'delete_project': 'DELETE /v1/project/{project_id}',
        'homepage': 'GET /v1/home',
      }
    }
  });

  // 3-87. ARCHITECTURE (response_id: 3-86, поэтапно с задержками)
  const architectureMessages = [
    { parent: 'Account.create_account', children: ['datamanager/DatabaseManager.session', 'accounts/Account', 'accounts/session.add'] },
    { parent: 'Account.get_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/session.get', 'accounts/log.error', 'accounts/DataBaseEntityNotExists'] },
    { parent: 'Account.get_account_by_login', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute', 'accounts/where', 'accounts/select', 'accounts/result.scalar_one_or_none'] },
    { parent: 'Account.is_login_exists', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute', 'accounts/where', 'accounts/select', 'accounts/result.scalar_one_or_none'] },
    { parent: 'Account.patch_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/Account.get_account_by_id', 'accounts/items', 'accounts/patch_data.model_dump', 'accounts/setattr', 'accounts/session.flush'] },
    { parent: 'DatabaseManager.__init__', children: ['datamanager/create_async_engine', 'datamanager/async_sessionmaker'] },
    { parent: 'DatabaseManager.init_models', children: ['datamanager/self.engine.begin', 'datamanager/Base.metadata.tables.get', 'datamanager/conn.run_sync', 'datamanager/ValueError'] },
    { parent: 'DatabaseManager.session', children: ['datamanager/self.session_factory', 'datamanager/session.commit', 'datamanager/session.rollback', 'datamanager/DatabaseManager.close'] },
    { parent: 'DatabaseManager.close', children: ['datamanager/self.engine.dispose'] },
    { parent: 'init_db', children: ['datamanager/DatabaseManager.init_models'] },
    { parent: 'Project.create_project', children: ['datamanager/DatabaseManager.session', 'projects/Project', 'projects/session.add'] },
    { parent: 'Project.get_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/session.get', 'projects/log.error', 'projects/DataBaseEntityNotExists'] },
    { parent: 'Project.patch_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/Project.get_project_by_id', 'projects/items', 'projects/patch_data.model_dump', 'projects/setattr', 'projects/session.flush'] },
    { parent: 'Project.get_project_list_by_account_id', children: ['datamanager/DatabaseManager.session', 'projects/where', 'projects/select', 'projects/session.execute', 'projects/all', 'projects/result.scalars', 'projects/len'] },
    { parent: 'Project.delete_project', children: ['datamanager/DatabaseManager.session', 'projects/Project.get_project_by_id', 'projects/session.delete'] },
    { parent: 'get_account', children: ['account_endpoints/Depends', 'auth_service/AuthService.verify_token', 'account_service/AccountService.get_account_by_id', 'account_endpoints/log.info', 'account_endpoints/router.get'] },
    { parent: 'patch_account', children: ['account_endpoints/Depends', 'auth_service/AuthService.verify_token', 'account_service/AccountService.patch_account_by_id', 'account_endpoints/log.info', 'account_endpoints/router.patch'] },
    { parent: 'login', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.login', 'auth_endpoints/router.post'] },
    { parent: 'refresh', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.refresh', 'auth_endpoints/router.post'] },
    { parent: 'registration', children: ['auth_endpoints/Depends', 'auth_endpoints/log.info', 'auth_service/AuthService.registration', 'auth_endpoints/router.post'] },
    { parent: 'homepage', children: ['core_endpoints/Depends', 'auth_service/AuthService.verify_token', 'core_service/CoreService.get_homepage', 'core_endpoints/log.info', 'core_endpoints/router.get'] },
    { parent: 'get_project', children: ['project_endpoints/Depends', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.get_project_by_id', 'project_endpoints/log.info', 'project_endpoints/router.get'] },
    { parent: 'create_project', children: ['project_endpoints/File', 'project_endpoints/Depends', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.create_project', 'project_endpoints/ProjectCreateData', 'project_endpoints/router.post'] },
    { parent: 'patch_project', children: ['project_endpoints/Depends', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.update_project', 'project_endpoints/router.patch'] },
    { parent: 'delete_project', children: ['project_endpoints/Depends', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.delete_project', 'project_endpoints/router.delete'] },
    { parent: 'get_projects_list', children: ['project_endpoints/Depends', 'auth_service/AuthService.verify_token', 'project_service/ProjectService.get_projects_by_account_id', 'project_endpoints/router.get'] },
    { parent: 'AuthService.registration', children: ['auth_service/AuthService.hash_password', 'accounts/Account.is_login_exists', 'accounts/Account.create_account', 'auth_service/AccountCreateData', 'auth_service/AccountData.model_validate'] },
    { parent: 'AuthService.verify_token', children: ['auth_service/AuthService.check_access_token', 'auth_service/log.error', 'auth_service/HTTPException'] },
    { parent: 'AuthService.check_access_token', children: ['auth_service/AuthService.decode_token', 'auth_service/datetime.now', 'auth_service/HTTPException'] },
    { parent: 'AuthService.login', children: ['accounts/Account.get_account_by_login', 'auth_service/AuthService.verify_password', 'auth_service/AccountData', 'auth_service/AuthService.encode_to_token', 'auth_service/AuthResponseData'] },
    { parent: 'AuthService.refresh', children: ['auth_service/AuthService.decode_token', 'auth_service/datetime.now', 'accounts/Account.get_account_by_id', 'auth_service/AccountData', 'auth_service/AuthService.encode_to_token', 'auth_service/AuthResponseData'] },
    { parent: 'AuthService.encode_to_token', children: ['auth_service/datetime.now', 'auth_service/timedelta', 'auth_service/data.model_dump', 'auth_service/start_date.isoformat', 'auth_service/end_date.isoformat', 'auth_service/JWT.encode'] },
    { parent: 'AuthService.decode_token', children: ['auth_service/JWT.decode', 'auth_service/AccountEncodeData', 'auth_service/datetime.fromisoformat'] },
    { parent: 'AuthService.hash_password', children: ['auth_service/bcrypt.gensalt', 'auth_service/bcrypt.hashpw', 'auth_service/password.encode', 'auth_service/hashed.decode'] },
    { parent: 'AuthService.verify_password', children: ['auth_service/bcrypt.checkpw', 'auth_service/password.encode', 'auth_service/hashed_password.encode', 'auth_service/log.error', 'auth_service/HTTPException'] },
    { parent: 'AccountService.get_account_by_id', children: ['accounts/Account.get_account_by_id', 'account_service/AccountFullData.model_validate', 'account_service/log.error', 'account_service/HTTPException'] },
    { parent: 'AccountService.patch_account_by_id', children: ['accounts/Account.patch_account_by_id', 'account_service/AccountFullData.model_validate', 'account_service/log.error', 'account_service/HTTPException'] },
    { parent: 'CoreService.get_homepage', children: ['accounts/Account.get_account_by_id', 'core_service/AccountData.model_validate', 'projects/Project.get_project_list_by_account_id', 'core_service/ProjectDataLite.model_validate', 'core_service/ProjectListDataLite', 'core_service/HomePageData'] },
    { parent: 'ProjectService.get_project_by_id', children: ['projects/Project.get_project_by_id', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/HTTPException'] },
    { parent: 'ProjectService.create_project', children: ['projects/Project.create_project', 'project_service/ArchitectureModel', 'project_service/ProjectData'] },
    { parent: 'ProjectService.update_project', children: ['projects/Project.patch_project_by_id', 'project_service/ArchitectureModel', 'project_service/ProjectData', 'project_service/log.error', 'project_service/HTTPException'] },
    { parent: 'ProjectService.delete_project', children: ['projects/Project.delete_project', 'project_service/log.error', 'project_service/HTTPException'] },
    { parent: 'ProjectService.get_projects_by_account_id', children: ['projects/Project.get_project_list_by_account_id', 'project_service/ProjectDataLite.model_validate', 'project_service/ProjectListDataLite'] },
    { parent: 'ConnectionBrokerManager.__init__', children: [] },
    { parent: 'ConnectionBrokerManager.connect', children: ['manager/aio_pika.connect_robust', 'manager/self.connection.channel', 'manager/self.channel.declare_exchange', 'manager/log.info', 'manager/ConnectionBrokerManager._create_queue', 'manager/ConnectionBrokerManager._bind_exchange_as_queue'] },
    { parent: 'ConnectionBrokerManager.close', children: ['manager/self.connection.close', 'manager/log.info'] },
  ];

  let responseId = 3;
  for (const arch of architectureMessages) {
    await delay(150 + Math.random() * 100); // 150-250ms задержка между сообщениями
    onMessage({
      task_id: 42,
      response_id: responseId++,
      status: 'ARHITECTURE',
      graph_architecture: arch
    });
  }

  // Final DONE message
  await delay(400);
  onMessage({
    task_id: 42,
    response_id: responseId,
    status: 'DONE',
    graph_architecture: {}
  });
};

export default function ProjectAnalysis() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  
  // Данные с сервера
  const [status, setStatus] = useState('START');
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architectureData, setArchitectureData] = useState([]);
  const [currentMessageId, setCurrentMessageId] = useState(0);

  // Обработка входящих сообщений
  const handleServerMessage = useCallback((message) => {
    setCurrentMessageId(message.response_id);
    setStatus(message.status);

    if (message.status === 'REQUIREMENTS') {
      setRequirements(message.graph_requirements.requirements);
    } 
    else if (message.status === 'ENDPOINTS') {
      setEndpoints(message.graph_endpoints.endpoints);
    } 
    else if (message.status === 'ARHITECTURE' && message.graph_architecture.parent) {
      setArchitectureData(prev => [...prev, message.graph_architecture]);
    }
  }, []);

  // Запуск симуляции при монтировании
  useEffect(() => {
    simulateServerStream(handleServerMessage);
  }, [handleServerMessage]);

  // Построение динамического графа из данных Граф.txt
  useEffect(() => {
    // Ждем пока появятся endpoints, но строим граф каждый раз когда приходят новые данные
    if (Object.keys(endpoints).length === 0) return;

    const newNodes = [];
    const newEdges = [];

    // Конфигурация слоев
    const LAYER_GAP = 380;
    const START_X = 100;
    const START_Y = 50;
    const NODE_HEIGHT = 80; // Средняя высота узла для расчета позиций

    console.log('🔄 Перестраиваем граф. Architecture данных:', architectureData.length);

    // === ФУНКЦИЯ ОПРЕДЕЛЕНИЯ ТИПА УЗЛА ===
    const getNodeType = (nodeName) => {
      // HTTP Endpoints (из endpoints)
      if (endpoints[nodeName]) {
        return { type: 'endpoint', layer: 2 };
      }
      
      // Services (точно соответствуют AuthService, AccountService, ProjectService, CoreService)
      const serviceNames = ['AuthService', 'AccountService', 'ProjectService', 'CoreService'];
      if (serviceNames.includes(nodeName)) {
        return { type: 'service', layer: 3 };
      }
      
      // Service methods (AuthService.login, AccountService.get_account_by_id и т.д.)
      if (nodeName.includes('Service.')) {
        return { type: 'service-method', layer: 3.5 }; // Промежуточный слой между сервисами и БД
      }
      
      // Database methods (Account.*, Project.*)
      if (nodeName.startsWith('Account.') || nodeName.startsWith('Project.')) {
        return { type: 'database-method', layer: 4 };
      }
      
      // DatabaseManager
      if (nodeName.startsWith('DatabaseManager.') || nodeName === 'DatabaseManager') {
        return { type: 'database-manager', layer: 4 };
      }
      
      // Broker
      if (nodeName.startsWith('Broker.') || nodeName === 'Broker') {
        return { type: 'broker', layer: 5 };
      }
      
      // Остальное - прочие компоненты (вероятно вспомогательные функции)
      return { type: 'other', layer: 5 };
    };

    // === СБОР ВСЕХ УНИКАЛЬНЫХ УЗЛОВ ИЗ ARCHITECTURE DATA ===
    const allNodes = new Set();
    architectureData.forEach(({ parent, children }) => {
      allNodes.add(parent);
      children.forEach(child => {
        // Убираем префиксы типа 'accounts/', 'datamanager/' и т.д.
        const cleanChild = child.split('/').pop();
        allNodes.add(cleanChild);
      });
    });

    // === ГРУППИРОВКА УЗЛОВ ПО СЛОЯМ ===
    const nodesByLayer = {
      1: ['main-service'], // Main Service всегда один
      2: [], // Endpoints
      3: [], // Services (AuthService, AccountService, ProjectService, CoreService)
      3.5: [], // Service methods (AuthService.login, AccountService.get_account_by_id)
      4: [], // Database components
      5: [], // Broker и прочее
    };

    allNodes.forEach(nodeName => {
      const { layer } = getNodeType(nodeName);
      if (!nodesByLayer[layer]) {
        nodesByLayer[layer] = [];
      }
      nodesByLayer[layer].push(nodeName);
    });

    // Добавляем endpoints в слой 2 (берем только из endpoints, не из architectureData)
    nodesByLayer[2] = Object.keys(endpoints);

    // Отладка: выводим количество узлов на каждом слое
    console.log('📊 Узлы по слоям:', {
      'Layer 1 (Main)': nodesByLayer[1].length,
      'Layer 2 (Endpoints)': nodesByLayer[2].length,
      'Layer 3 (Services)': nodesByLayer[3].length,
      'Layer 3.5 (Service Methods)': (nodesByLayer[3.5] || []).length,
      'Layer 4 (Database)': nodesByLayer[4].length,
      'Layer 5 (Broker & Other)': nodesByLayer[5].length,
    });

    // === LAYER 1: Main Service ===
    newNodes.push({
      id: 'main-service',
      type: 'default',
      position: { x: START_X, y: START_Y + 300 },
      data: {
        label: (
          <div className={styles.nodeLabel}>
            <div className={styles.nodeTitle}>🚀 Main Service</div>
            <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '4px' }}>FastAPI</div>
          </div>
        ),
      },
      style: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '16px',
        padding: '24px 28px',
        width: 200,
        fontWeight: 'bold',
        fontSize: '16px',
        boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    });

    // === LAYER 2: API Endpoints (динамически из данных) ===
    const methodColors = {
      'GET': { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669' },
      'POST': { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb' },
      'PATCH': { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#d97706' },
      'PUT': { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed' },
      'DELETE': { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#dc2626' },
    };

    // Сортируем эндпоинты по HTTP методам
    const endpointsList = nodesByLayer[2].map(key => ({ key, value: endpoints[key] }));
    const methodOrder = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
    const sortedEndpoints = endpointsList.sort((a, b) => {
      const methodA = a.value.split(' ')[0];
      const methodB = b.value.split(' ')[0];
      return methodOrder.indexOf(methodA) - methodOrder.indexOf(methodB);
    });

    sortedEndpoints.forEach(({ key, value }, idx) => {
      const method = value.split(' ')[0];
      const path = value.split(' ')[1] || '';
      const color = methodColors[method] || methodColors['GET'];
      
      newNodes.push({
        id: `endpoint-${key}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP, y: START_Y + idx * 95 },
        data: {
          label: (
            <div className={styles.endpointCard}>
              <div className={styles.endpointMethod} style={{ background: color.bg }}>
                {method}
              </div>
              <div className={styles.endpointPath}>{path}</div>
              <div className={styles.endpointKey}>{key}</div>
            </div>
          ),
        },
        style: {
          background: 'white',
          color: '#1e293b',
          border: `2px solid ${color.border}`,
          borderRadius: '12px',
          padding: '14px 18px',
          width: 240,
          fontWeight: '600',
          fontSize: '12px',
          boxShadow: `0 4px 16px ${color.border}30`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });

      // Соединяем Main Service с эндпоинтами (справа)
      newEdges.push({
        id: `edge-main-${key}`,
        source: 'main-service',
        target: `endpoint-${key}`,
        type: 'smoothstep',
        animated: true,
        style: { 
          stroke: color.border, 
          strokeWidth: 2.5,
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: color.border, 
          width: 22, 
          height: 22 
        },
        sourceHandle: 'right',
        targetHandle: 'left',
      });
    });

    // === LAYER 3: Services (динамически из данных) ===
    const serviceColors = {
      'AuthService': { color: '#8b5cf6', icon: '🔐', label: 'Auth' },
      'AccountService': { color: '#3b82f6', icon: '👤', label: 'Account' },
      'ProjectService': { color: '#10b981', icon: '📁', label: 'Project' },
      'CoreService': { color: '#f59e0b', icon: '⚙️', label: 'Core' },
    };

    nodesByLayer[3].forEach((serviceName, idx) => {
      const serviceConfig = serviceColors[serviceName] || { 
        color: '#64748b', 
        icon: '⚙️', 
        label: serviceName.replace('Service', '') 
      };
      
      newNodes.push({
        id: serviceName,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2, y: START_Y + idx * 200 },
        data: {
          label: (
            <div className={styles.serviceLabel}>
              <div style={{ 
                fontSize: '8px', 
                fontWeight: '700', 
                background: 'rgba(255,255,255,0.25)',
                padding: '3px 10px',
                borderRadius: '8px',
                marginBottom: '8px',
                letterSpacing: '0.5px'
              }}>
                SERVICE
              </div>
              <div style={{ fontSize: '16px', marginBottom: '4px' }}>{serviceConfig.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>{serviceConfig.label}</div>
            </div>
          ),
        },
        style: {
          background: `linear-gradient(135deg, ${serviceConfig.color} 0%, ${serviceConfig.color}dd 100%)`,
          color: 'white',
          border: 'none',
          borderRadius: '14px',
          padding: '20px 24px',
          width: 180,
          fontWeight: '700',
          fontSize: '15px',
          textAlign: 'center',
          boxShadow: `0 6px 20px ${serviceConfig.color}50`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // === LAYER 3.5: Service Methods (методы сервисов) ===
    (nodesByLayer[3.5] || []).forEach((methodName, idx) => {
      // Определяем к какому сервису относится метод
      const serviceName = methodName.split('.')[0]; // AuthService, AccountService и т.д.
      const methodShortName = methodName.split('.')[1]; // login, get_account_by_id и т.д.
      
      const serviceConfig = serviceColors[serviceName] || { color: '#64748b' };
      
      newNodes.push({
        id: methodName,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2.5, y: START_Y + idx * 90 },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ 
                fontSize: '7px', 
                fontWeight: '700', 
                color: serviceConfig.color,
                background: `${serviceConfig.color}15`,
                padding: '2px 8px',
                borderRadius: '6px',
                marginBottom: '6px',
                display: 'inline-block',
                border: `1px solid ${serviceConfig.color}40`,
                letterSpacing: '0.5px'
              }}>
                {serviceName.replace('Service', '').toUpperCase()} METHOD
              </div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: serviceConfig.color }}>
                {methodShortName}
              </div>
            </div>
          ),
        },
        style: {
          background: 'white',
          border: `2px solid ${serviceConfig.color}`,
          borderRadius: '10px',
          padding: '10px 14px',
          width: 140,
          fontSize: '11px',
          fontWeight: '600',
          boxShadow: `0 3px 12px ${serviceConfig.color}30`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // === LAYER 4: Database components (динамически из данных) ===
    nodesByLayer[4].forEach((nodeName, idx) => {
      const isDatabaseManager = nodeName.startsWith('DatabaseManager');
      const isAccountDB = nodeName.startsWith('Account.');
      const isProjectDB = nodeName.startsWith('Project.');
      
      let nodeStyle, nodeLabel;
      
      if (isDatabaseManager) {
        nodeStyle = {
          background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
          color: 'white',
          border: '3px solid #0e7490',
          borderRadius: '16px',
          padding: '18px 22px',
          width: 160,
          fontWeight: '700',
          fontSize: '13px',
          textAlign: 'center',
          boxShadow: '0 6px 20px rgba(6, 182, 212, 0.4)',
        };
        const methodName = nodeName.replace('DatabaseManager.', '');
        nodeLabel = (
          <div className={styles.dbManagerLabel}>
            <div style={{ 
              fontSize: '8px', 
              fontWeight: '700', 
              background: 'rgba(255,255,255,0.2)',
              padding: '3px 8px',
              borderRadius: '6px',
              marginBottom: '6px'
            }}>
              DATABASE MANAGER
            </div>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>🗄️</div>
            <div style={{ fontSize: '12px' }}>{methodName}</div>
          </div>
        );
      } else {
        const dbColor = isAccountDB ? '#3b82f6' : isProjectDB ? '#10b981' : '#64748b';
        const dbIcon = isAccountDB ? '👥' : isProjectDB ? '📊' : '🗃️';
        const dbType = isAccountDB ? 'ACCOUNT DB' : isProjectDB ? 'PROJECT DB' : 'DATABASE';
        const dbLabel = nodeName.split('.').pop();
        
        nodeStyle = {
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          color: 'white',
          border: `3px solid ${dbColor}`,
          borderRadius: '20px',
          padding: '16px 20px',
          width: 140,
          fontWeight: '600',
          fontSize: '12px',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.5)',
        };
        nodeLabel = (
          <div className={styles.dbLabel}>
            <div style={{ 
              fontSize: '7px', 
              fontWeight: '700', 
              background: `${dbColor}30`,
              color: dbColor,
              padding: '2px 6px',
              borderRadius: '4px',
              marginBottom: '6px',
              letterSpacing: '0.5px'
            }}>
              {dbType}
            </div>
            <div style={{ fontSize: '20px', marginBottom: '4px' }}>{dbIcon}</div>
            <div style={{ fontWeight: '700', fontSize: '10px' }}>{dbLabel}</div>
          </div>
        );
      }
      
      newNodes.push({
        id: nodeName,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3, y: START_Y + idx * 120 },
        data: { label: nodeLabel },
        style: nodeStyle,
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // === LAYER 5: Broker и прочие компоненты ===
    nodesByLayer[5].forEach((nodeName, idx) => {
      const isBroker = nodeName.startsWith('Broker');
      
      if (isBroker) {
        const brokerMethod = nodeName.replace('Broker.', '');
        newNodes.push({
          id: nodeName,
          type: 'default',
          position: { x: START_X + LAYER_GAP * 4, y: START_Y + idx * 180 + 300 },
          data: {
            label: (
              <div className={styles.brokerLabel}>
                <div style={{ 
                  fontSize: '7px', 
                  fontWeight: '700', 
                  background: 'rgba(255,255,255,0.25)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  marginBottom: '6px',
                  letterSpacing: '0.5px'
                }}>
                  MESSAGE BROKER
                </div>
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>📮</div>
                <div style={{ fontWeight: '700', fontSize: '11px' }}>{brokerMethod}</div>
              </div>
            ),
          },
          style: {
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            color: 'white',
            border: '4px solid #c2410c',
            borderRadius: '50%',
            padding: '24px',
            width: 140,
            height: 140,
            fontWeight: 'bold',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 28px rgba(249, 115, 22, 0.5)',
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      } else {
        // Прочие компоненты - определяем тип по имени
        let componentType = 'Util';
        let componentColor = '#64748b';
        let componentBg = '#f1f5f9';
        let componentIcon = '⚙️';
        
        if (nodeName.includes('Exception') || nodeName.includes('Error')) {
          componentType = 'Exception';
          componentColor = '#dc2626';
          componentBg = '#fef2f2';
          componentIcon = '⚠️';
        } else if (nodeName.startsWith('log.')) {
          componentType = 'Logger';
          componentColor = '#7c3aed';
          componentBg = '#faf5ff';
          componentIcon = '📝';
        } else if (nodeName.includes('session') || nodeName.includes('Session')) {
          componentType = 'Session';
          componentColor = '#0891b2';
          componentBg = '#ecfeff';
          componentIcon = '🔗';
        } else if (nodeName.includes('Depends') || nodeName.includes('router')) {
          componentType = 'FastAPI';
          componentColor = '#059669';
          componentBg = '#f0fdf4';
          componentIcon = '🚀';
        }
        
        const shortName = nodeName.split('.').pop();
        
        newNodes.push({
          id: nodeName,
          type: 'default',
          position: { x: START_X + LAYER_GAP * 4, y: START_Y + idx * 100 },
          data: {
            label: (
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  fontSize: '9px', 
                  fontWeight: '700', 
                  color: componentColor,
                  background: componentBg,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  marginBottom: '6px',
                  display: 'inline-block',
                  border: `1px solid ${componentColor}40`
                }}>
                  {componentIcon} {componentType}
                </div>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#1e293b' }}>
                  {shortName}
                </div>
              </div>
            ),
          },
          style: {
            background: 'white',
            border: `2px solid ${componentColor}`,
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '11px',
            fontWeight: '600',
            boxShadow: `0 3px 12px ${componentColor}30`,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      }
    });

    // === ДИНАМИЧЕСКИЕ СОЕДИНЕНИЯ ИЗ ARCHITECTURE DATA ===
    // 1. Main Service -> Endpoints (для всех endpoints)
    Object.keys(endpoints).forEach((endpointKey) => {
      const method = endpoints[endpointKey].split(' ')[0];
      const methodColor = methodColors[method]?.border || '#64748b';
      
      newEdges.push({
        id: `edge-main-${endpointKey}`,
        source: 'main-service',
        target: `endpoint-${endpointKey}`,
        type: 'smoothstep',
        animated: true,
        style: { stroke: methodColor, strokeWidth: 2.5 },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: methodColor, 
          width: 22, 
          height: 22 
        },
      });
    });

    // 2. Соединения из ARCHITECTURE данных (parent -> children)
    architectureData.forEach(({ parent, children }) => {
      children.forEach(child => {
        // Убираем префиксы типа 'accounts/', 'datamanager/', 'auth_service/'
        const cleanChild = child.split('/').pop();
        
        // Определяем ID для parent (endpoints имеют префикс 'endpoint-')
        const parentId = endpoints[parent] ? `endpoint-${parent}` : parent;
        
        // Проверяем что оба узла существуют в графе
        const parentExists = newNodes.some(n => n.id === parentId);
        const childExists = newNodes.some(n => n.id === cleanChild);
        
        if (!parentExists || !childExists) {
          return; // Пропускаем если узлы не найдены
        }
        
        // Определяем цвет соединения в зависимости от типов узлов
        let edgeColor = '#94a3b8';
        const parentType = getNodeType(parent).type;
        const childType = getNodeType(cleanChild).type;
        
        if (parentType === 'endpoint') {
          // Endpoint -> Service method (цвет метода HTTP)
          const method = endpoints[parent].split(' ')[0];
          edgeColor = methodColors[method]?.border || '#64748b';
        } else if (parentType === 'service' || parentType === 'service-method') {
          // Service/Method -> что-то (цвет сервиса)
          const serviceName = parent.split('.')[0];
          edgeColor = serviceColors[serviceName]?.color || '#64748b';
        } else if (childType === 'database-manager') {
          edgeColor = '#06b6d4';
        } else if (childType === 'broker') {
          edgeColor = '#f97316';
        }
        
        newEdges.push({
          id: `edge-${parentId}-${cleanChild}`,
          source: parentId,
          target: cleanChild,
          type: 'smoothstep',
          animated: false,
          style: { stroke: edgeColor, strokeWidth: 2 },
          markerEnd: { 
            type: MarkerType.ArrowClosed, 
            color: edgeColor, 
            width: 20, 
            height: 20 
          },
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [endpoints, architectureData, setNodes, setEdges]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const getStatusLabel = () => {
    switch (status) {
      case 'START': return '🔄 Инициализация...';
      case 'REQUIREMENTS': return '📦 Анализ зависимостей...';
      case 'ENDPOINTS': return '🔗 Обнаружение API эндпоинтов...';
      case 'ARHITECTURE': return '🏗️ Построение архитектуры...';
      case 'DONE': return '✅ Анализ завершен';
      default: return 'Ожидание...';
    }
  };

  return (
    <div className={styles.container}>
      {/* Layer Header with Labels */}
      <div className={styles.layerHeader}>
        <div className={styles.layerLabel} style={{ left: '100px' }}>Главный сервис</div>
        <div className={styles.layerLabel} style={{ left: '380px' }}>API endpoints</div>
        <div className={styles.layerLabel} style={{ left: '660px' }}>Сервисы</div>
        <div className={styles.layerLabel} style={{ left: '940px' }}>Базы данных</div>
        <div className={styles.layerLabel} style={{ left: '1220px' }}>Брокер сообщений</div>
      </div>

      {/* Control Bar */}
      <div className={styles.controlBar}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Назад
        </button>
        <div className={styles.titleContainer}>
          <h1 className={styles.title}>Анализ проекта #{id}</h1>
          <div className={styles.statusBadge}>{getStatusLabel()}</div>
        </div>
      </div>

      {/* Info Panel */}
      {(requirements.length > 0 || Object.keys(endpoints).length > 0 || architectureData.length > 0) && (
        <div className={styles.infoBar}>
          {requirements.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>📦 Зависимости:</span>
              <span className={styles.infoValue}>{requirements.length}</span>
            </div>
          )}
          {Object.keys(endpoints).length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>🔗 Эндпоинты:</span>
              <span className={styles.infoValue}>{Object.keys(endpoints).length}</span>
            </div>
          )}
          {architectureData.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>🏗️ Компоненты:</span>
              <span className={styles.infoValue}>{architectureData.length}</span>
            </div>
          )}
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>📨 Сообщений:</span>
            <span className={styles.infoValue}>{currentMessageId}</span>
          </div>
        </div>
      )}

      {/* Graph */}
      <div className={styles.flowWrapper}>
        {nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
            minZoom={0.3}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#f0f0f0" gap={20} size={1} />
            <Controls className={styles.controls} />
          </ReactFlow>
        ) : (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Ожидание данных с сервера...</p>
          </div>
        )}
      </div>

      {/* Node Details Tooltip */}
      {selectedNode && (
        <div className={styles.tooltip}>
          <button className={styles.tooltipClose} onClick={() => setSelectedNode(null)}>
            ×
          </button>
          <h3>{selectedNode.data.label}</h3>
          <p><strong>ID:</strong> {selectedNode.id}</p>
        </div>
      )}
    </div>
  );
}
