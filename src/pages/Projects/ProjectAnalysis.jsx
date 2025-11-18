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
  const [initialGraphBuilt, setInitialGraphBuilt] = useState(false);

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

  // Построение начального графа (Main Service + Endpoints + Services + DB + Broker)
  useEffect(() => {
    if (Object.keys(endpoints).length === 0 || initialGraphBuilt) return;

    const newNodes = [];
    const newEdges = [];

    // Конфигурация слоев
    const LAYER_GAP = 380;
    const START_X = 100;
    const START_Y = 50;

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

    // === LAYER 2: API Endpoints (сортировка по HTTP методам) ===
    const methodColors = {
      'GET': { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669' },
      'POST': { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb' },
      'PATCH': { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#d97706' },
      'PUT': { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed' },
      'DELETE': { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#dc2626' },
    };

    // Сортируем эндпоинты по HTTP методам
    const endpointsList = Object.entries(endpoints);
    const methodOrder = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
    const sortedEndpoints = endpointsList.sort((a, b) => {
      const methodA = a[1].split(' ')[0];
      const methodB = b[1].split(' ')[0];
      return methodOrder.indexOf(methodA) - methodOrder.indexOf(methodB);
    });

    sortedEndpoints.forEach(([key, value], idx) => {
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

    // === LAYER 3: Services ===
    const services = [
      { id: 'auth-service', label: '🔐 Auth', color: '#8b5cf6', y: START_Y + 100 },
      { id: 'account-service', label: '👤 Account', color: '#3b82f6', y: START_Y + 300 },
      { id: 'project-service', label: '📁 Project', color: '#10b981', y: START_Y + 500 },
      { id: 'core-service', label: '⚙️ Core', color: '#f59e0b', y: START_Y + 700 },
    ];

    services.forEach((svc) => {
      newNodes.push({
        id: svc.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2, y: svc.y },
        data: {
          label: (
            <div className={styles.serviceLabel}>
              <div>{svc.label}</div>
              <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px' }}>Service</div>
            </div>
          ),
        },
        style: {
          background: `linear-gradient(135deg, ${svc.color} 0%, ${svc.color}dd 100%)`,
          color: 'white',
          border: 'none',
          borderRadius: '14px',
          padding: '20px 24px',
          width: 180,
          fontWeight: '700',
          fontSize: '15px',
          textAlign: 'center',
          boxShadow: `0 6px 20px ${svc.color}50`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // Соединяем эндпоинты с сервисами (справа)
    const endpointServiceMapping = [
      { endpoint: 'registration', service: 'auth-service', color: '#8b5cf6' },
      { endpoint: 'login', service: 'auth-service', color: '#8b5cf6' },
      { endpoint: 'refresh', service: 'auth-service', color: '#8b5cf6' },
      { endpoint: 'get_account', service: 'account-service', color: '#3b82f6' },
      { endpoint: 'patch_account', service: 'account-service', color: '#3b82f6' },
      { endpoint: 'get_projects_list', service: 'project-service', color: '#10b981' },
      { endpoint: 'create_project', service: 'project-service', color: '#10b981' },
      { endpoint: 'get_project', service: 'project-service', color: '#10b981' },
      { endpoint: 'patch_project', service: 'project-service', color: '#10b981' },
      { endpoint: 'delete_project', service: 'project-service', color: '#10b981' },
      { endpoint: 'homepage', service: 'core-service', color: '#f59e0b' },
    ];

    endpointServiceMapping.forEach(({ endpoint, service, color }) => {
      newEdges.push({
        id: `edge-${endpoint}-${service}`,
        source: `endpoint-${endpoint}`,
        target: service,
        type: 'smoothstep',
        animated: false,
        style: { 
          stroke: color, 
          strokeWidth: 2.5,
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: color, 
          width: 22, 
          height: 22 
        },
        sourceHandle: 'right',
        targetHandle: 'left',
      });
    });

    // === LAYER 4: Database Manager (по центру между БД) ===
    newNodes.push({
      id: 'database-manager',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 3, y: START_Y + 400 },
      data: {
        label: (
          <div className={styles.dbManagerLabel}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🗄️</div>
            <div>Database</div>
            <div>Manager</div>
          </div>
        ),
      },
      style: {
        background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
        color: 'white',
        border: '3px solid #0e7490',
        borderRadius: '16px',
        padding: '24px 28px',
        width: 180,
        fontWeight: '700',
        fontSize: '15px',
        textAlign: 'center',
        boxShadow: '0 6px 20px rgba(6, 182, 212, 0.4)',
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    });

    // Соединения между сервисами и database manager
    services.forEach(svc => {
      newEdges.push({
        id: `edge-${svc.id}-dbm`,
        source: svc.id,
        target: 'database-manager',
        type: 'smoothstep',
        animated: false,
        style: { 
          stroke: '#06b6d4', 
          strokeWidth: 2.5,
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: '#06b6d4', 
          width: 22, 
          height: 22 
        },
        sourceHandle: 'right',
        targetHandle: 'left',
      });
    });

    // === LAYER 4: Databases (подальше друг от друга) ===
    const databases = [
      { id: 'accounts-db', label: '👥 Accounts', icon: '🗃️', y: START_Y + 150 },
      { id: 'projects-db', label: '📊 Projects', icon: '🗃️', y: START_Y + 650 },
    ];

    databases.forEach((db) => {
      newNodes.push({
        id: db.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3, y: db.y },
        data: {
          label: (
            <div className={styles.dbLabel}>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>{db.icon}</div>
              <div style={{ fontWeight: '700' }}>{db.label}</div>
              <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px' }}>Database</div>
            </div>
          ),
        },
        style: {
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          color: 'white',
          border: '3px solid #475569',
          borderRadius: '20px',
          padding: '20px 24px',
          width: 150,
          fontWeight: '600',
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.5)',
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });

      // Соединяем database manager с databases (справа)
      newEdges.push({
        id: `edge-dbm-${db.id}`,
        source: 'database-manager',
        target: db.id,
        type: 'smoothstep',
        animated: false,
        style: { 
          stroke: '#475569', 
          strokeWidth: 3,
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: '#475569', 
          width: 24, 
          height: 24 
        },
        sourceHandle: 'right',
        targetHandle: 'left',
      });
    });

    // === LAYER 5: Broker ===
    newNodes.push({
      id: 'broker',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 4, y: START_Y + 350 },
      data: {
        label: (
          <div className={styles.brokerLabel}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📮</div>
            <div style={{ fontWeight: '700' }}>Message</div>
            <div style={{ fontWeight: '700' }}>Broker</div>
            <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '6px' }}>RabbitMQ</div>
          </div>
        ),
      },
      style: {
        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        color: 'white',
        border: '4px solid #c2410c',
        borderRadius: '50%',
        padding: '28px',
        width: 160,
        height: 160,
        fontWeight: 'bold',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 28px rgba(249, 115, 22, 0.5)',
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    });

    // Соединяем database manager с broker (справа)
    newEdges.push({
      id: 'edge-dbm-broker',
      source: 'database-manager',
      target: 'broker',
      type: 'smoothstep',
      animated: true,
      style: { 
        stroke: '#f97316', 
        strokeWidth: 3,
        strokeDasharray: '8,4',
      },
      markerEnd: { 
        type: MarkerType.ArrowClosed, 
        color: '#f97316', 
        width: 26, 
        height: 26 
      },
      sourceHandle: 'right',
      targetHandle: 'left',
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setInitialGraphBuilt(true);
  }, [endpoints, initialGraphBuilt, setNodes, setEdges]);

  // Поэтапное добавление узлов из ARCHITECTURE данных (в правильных слоях)
  useEffect(() => {
    if (!initialGraphBuilt || architectureData.length === 0) return;

    const latestArch = architectureData[architectureData.length - 1];
    if (!latestArch || !latestArch.parent) return;

    const parent = latestArch.parent;
    const LAYER_GAP = 380;
    const START_X = 100;
    const START_Y = 50;

    // Счетчики для вертикального позиционирования в каждом слое
    const getNodePosition = (type, index) => {
      const positions = {
        'endpoint': { x: START_X + LAYER_GAP, y: START_Y + index * 95 },
        'service': { x: START_X + LAYER_GAP * 2, y: START_Y + index * 90 },
        'database': { x: START_X + LAYER_GAP * 3, y: START_Y + 200 + index * 120 },
        'broker': { x: START_X + LAYER_GAP * 4, y: START_Y + 300 + index * 100 },
      };
      return positions[type] || { x: START_X + LAYER_GAP * 2 + 200, y: START_Y + 100 + index * 60 };
    };

    setNodes((prevNodes) => {
      const newNodes = [...prevNodes];
      const newNodeId = `arch-${parent}`;
      
      // Проверяем, не существует ли уже такой узел
      if (newNodes.some(n => n.id === newNodeId)) return prevNodes;

      let nodeX, nodeY, nodeColor, layerType;
      const archCount = architectureData.length;

      // Пропускаем создание основных сервисов - они уже созданы статично
      if (parent === 'AuthService' || parent === 'AccountService' || parent === 'ProjectService' || parent === 'CoreService') {
        return prevNodes;
      }

      // Пропускаем методы основных сервисов - они не нужны как отдельные узлы
      if (parent.includes('AuthService.') || parent.includes('AccountService.') || 
          parent.includes('ProjectService.') || parent.includes('CoreService.')) {
        return prevNodes;
      }

      // Определяем позицию и цвет на основе типа узла
      if (parent.includes('Account.') && !parent.includes('Service')) {
        // Database layer - Account методы
        const accountNodes = architectureData.filter(a => a.parent.includes('Account.') && !a.parent.includes('Service')).length;
        nodeX = START_X + LAYER_GAP * 3 + 200;
        nodeY = START_Y + 50 + accountNodes * 55;
        nodeColor = '#3b82f6';
        layerType = 'db-method';
      } else if (parent.includes('Project.') && !parent.includes('Service')) {
        // Database layer - Project методы
        const projectNodes = architectureData.filter(a => a.parent.includes('Project.') && !a.parent.includes('Service')).length;
        nodeX = START_X + LAYER_GAP * 3 + 200;
        nodeY = START_Y + 550 + projectNodes * 55;
        nodeColor = '#10b981';
        layerType = 'db-method';
      } else if (parent.includes('DatabaseManager') || parent.includes('init_db')) {
        // Database Manager layer
        const dbmNodes = architectureData.filter(a => a.parent.includes('DatabaseManager') || a.parent.includes('init_db')).length;
        nodeX = START_X + LAYER_GAP * 3 + 200;
        nodeY = START_Y + 350 + dbmNodes * 50;
        nodeColor = '#06b6d4';
        layerType = 'db-manager';
      } else if (parent.includes('ConnectionBrokerManager') || parent.includes('Consumer') || parent.includes('Producer')) {
        // Broker layer
        const brokerNodes = architectureData.filter(a => 
          a.parent.includes('ConnectionBrokerManager') || 
          a.parent.includes('Consumer') || 
          a.parent.includes('Producer')
        ).length;
        nodeX = START_X + LAYER_GAP * 4 + 200;
        nodeY = START_Y + 250 + brokerNodes * 60;
        nodeColor = '#f97316';
        layerType = 'broker-method';
      } else if (parent.includes('ObjectStorageManager') || parent.includes('AbstractStorage')) {
        // Storage layer (возле broker)
        const storageNodes = architectureData.filter(a => 
          a.parent.includes('ObjectStorage') || 
          a.parent.includes('AbstractStorage')
        ).length;
        nodeX = START_X + LAYER_GAP * 4 + 200;
        nodeY = START_Y + 100 + storageNodes * 55;
        nodeColor = '#ec4899';
        layerType = 'storage';
      } else if (parent.includes('CoreServer') || parent.includes('TaskManager') || parent.includes('TaskSession') || parent.includes('FrontendStreamService') || parent.includes('AlgorithmConnectionService')) {
        // Core server layer (возле broker)
        const coreNodes = architectureData.filter(a => 
          a.parent.includes('CoreServer') || 
          a.parent.includes('TaskManager') || 
          a.parent.includes('TaskSession') ||
          a.parent.includes('FrontendStreamService') ||
          a.parent.includes('AlgorithmConnectionService')
        ).length;
        nodeX = START_X + LAYER_GAP * 4 + 200;
        nodeY = START_Y + 500 + coreNodes * 55;
        nodeColor = '#a855f7';
        layerType = 'core-server';
      } else if (parent.includes('load_config') || parent.includes('create_logger')) {
        // Config/Utils layer (внизу)
        const utilNodes = architectureData.filter(a => 
          a.parent.includes('load_config') || 
          a.parent.includes('create_logger')
        ).length;
        nodeX = START_X + LAYER_GAP * 3;
        nodeY = START_Y + 850 + utilNodes * 50;
        nodeColor = '#64748b';
        layerType = 'util';
      } else {
        // Остальные узлы - справа
        nodeX = START_X + LAYER_GAP * 4 + 400;
        nodeY = START_Y + 100 + (archCount % 10) * 70;
        nodeColor = '#71717a';
        layerType = 'other';
      }

      // Создаем узел с анимацией
      const shortName = parent.split('.').pop() || parent;
      
      newNodes.push({
        id: newNodeId,
        type: 'default',
        position: { x: nodeX, y: nodeY },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: '600', fontSize: '10px', lineHeight: '1.3' }}>
                {shortName}
              </div>
              {latestArch.children && latestArch.children.length > 0 && (
                <div style={{ fontSize: '8px', opacity: 0.7, marginTop: '3px' }}>
                  {latestArch.children.length} deps
                </div>
              )}
            </div>
          ),
        },
        style: {
          background: `linear-gradient(135deg, ${nodeColor} 0%, ${nodeColor}dd 100%)`,
          color: 'white',
          border: `2px solid ${nodeColor}`,
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '10px',
          fontWeight: '600',
          boxShadow: `0 3px 12px ${nodeColor}50`,
          animation: 'fadeInScale 0.4s ease-out',
          minWidth: '110px',
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });

      return newNodes;
    });

    // Добавляем связи между узлами
    if (latestArch.children && latestArch.children.length > 0) {
      setEdges((prevEdges) => {
        const newEdges = [...prevEdges];
        const parentId = `arch-${parent}`;

        latestArch.children.forEach((child) => {
          const childId = `arch-${child}`;
          const edgeId = `edge-${parentId}-${childId}`;
          
          // Проверяем, не существует ли уже такое ребро
          if (newEdges.some(e => e.id === edgeId)) return;

          newEdges.push({
            id: edgeId,
            source: parentId,
            target: childId,
            type: 'smoothstep',
            animated: false,
            style: { 
              stroke: '#94a3b8', 
              strokeWidth: 1,
              opacity: 0.25,
            },
            markerEnd: { 
              type: MarkerType.ArrowClosed, 
              color: '#94a3b8', 
              width: 12, 
              height: 12 
            },
            sourceHandle: 'right',
            targetHandle: 'left',
          });
        });

        return newEdges;
      });
    }
  }, [architectureData, initialGraphBuilt, setNodes, setEdges]);

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
