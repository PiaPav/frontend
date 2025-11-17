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

// Симуляция потока данных с сервера (в будущем заменить на gRPC)
const simulateServerStream = async (onMessage) => {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // 1. REQUIREMENTS (response_id: 1)
  await delay(800);
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
  await delay(1000);
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

  // 3-87. ARCHITECTURE (response_id: 3-86, поэтапно)
  const architectureData = [
    { parent: 'Account.create_account', children: ['datamanager/DatabaseManager.session', 'accounts/Account', 'accounts/session.add'] },
    { parent: 'Account.get_account_by_id', children: ['datamanager/DatabaseManager.session', 'accounts/session.get'] },
    { parent: 'Account.get_account_by_login', children: ['datamanager/DatabaseManager.session', 'accounts/session.execute'] },
    { parent: 'DatabaseManager.__init__', children: ['datamanager/create_async_engine', 'datamanager/async_sessionmaker'] },
    { parent: 'DatabaseManager.session', children: ['datamanager/self.session_factory', 'datamanager/session.commit'] },
    { parent: 'Project.create_project', children: ['datamanager/DatabaseManager.session', 'projects/Project'] },
    { parent: 'Project.get_project_by_id', children: ['datamanager/DatabaseManager.session', 'projects/session.get'] },
    { parent: 'AuthService.registration', children: ['auth_service/AuthService.hash_password', 'accounts/Account.is_login_exists'] },
    { parent: 'AuthService.login', children: ['accounts/Account.get_account_by_login', 'auth_service/AuthService.verify_password'] },
    { parent: 'AuthService.hash_password', children: ['auth_service/bcrypt.gensalt', 'auth_service/bcrypt.hashpw'] },
    { parent: 'ProjectService.create_project', children: ['projects/Project.create_project', 'project_service/ArchitectureModel'] },
    { parent: 'AccountService.get_account_by_id', children: ['accounts/Account.get_account_by_id'] },
    { parent: 'get_account', children: ['account_endpoints/Depends', 'auth_service/AuthService.verify_token', 'account_service/AccountService.get_account_by_id'] },
    { parent: 'login', children: ['auth_endpoints/Depends', 'auth_service/AuthService.login'] },
    { parent: 'registration', children: ['auth_endpoints/Depends', 'auth_service/AuthService.registration'] },
  ];

  let responseId = 3;
  for (const arch of architectureData) {
    await delay(400);
    onMessage({
      task_id: 42,
      response_id: responseId++,
      status: 'ARHITECTURE',
      graph_architecture: arch
    });
  }

  // Final DONE message
  await delay(500);
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

  // Построение layered графа
  useEffect(() => {
    if (Object.keys(endpoints).length === 0) return;

    const newNodes = [];
    const newEdges = [];

    // Конфигурация слоев
    const LAYER_GAP = 280;
    const START_X = 100;
    const START_Y = 80;

    // === LAYER 1: Main Service ===
    newNodes.push({
      id: 'main-service',
      type: 'default',
      position: { x: START_X, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.nodeLabel}>
            <div className={styles.nodeTitle}>Main Service</div>
          </div>
        ),
      },
      style: {
        background: 'linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        padding: '20px 24px',
        width: 180,
        fontWeight: 'bold',
        fontSize: '16px',
        boxShadow: '0 4px 12px rgba(90, 111, 214, 0.3)',
      },
    });

    // === LAYER 2: API Endpoints (гексагоны) ===
    const endpointsList = Object.entries(endpoints).slice(0, 8);
    endpointsList.forEach(([ key, value], idx) => {
      const method = value.split(' ')[0];
      const path = value.split(' ')[1] || '';
      
      newNodes.push({
        id: `endpoint-${key}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP, y: START_Y + idx * 60 },
        data: {
          label: (
            <div className={styles.endpointLabel}>
              <div>{method}</div>
              <div style={{ fontSize: '10px', opacity: 0.9 }}>{path.split('/').pop()}</div>
            </div>
          ),
        },
        style: {
          background: 'linear-gradient(135deg, #A8C5F0 0%, #8AABDE 100%)',
          color: '#1a365d',
          border: '2px solid #5A6FD6',
          borderRadius: '8px',
          padding: '12px 16px',
          width: 120,
          fontWeight: '600',
          fontSize: '13px',
          textAlign: 'center',
          clipPath: 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)',
          boxShadow: '0 2px 8px rgba(90, 111, 214, 0.2)',
        },
      });

      // Connect main service to endpoints
      newEdges.push({
        id: `edge-main-${key}`,
        source: 'main-service',
        target: `endpoint-${key}`,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#A0A0A0', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#A0A0A0', width: 18, height: 18 },
      });
    });

    // === LAYER 3: Services ===
    const services = [
      { id: 'auth-service', label: 'AuthService', color: '#5A6FD6', y: START_Y + 50 },
      { id: 'account-service', label: 'AccountService', color: '#6B8FE8', y: START_Y + 150 },
      { id: 'project-service', label: 'ProjectService', color: '#7BA3F2', y: START_Y + 250 },
      { id: 'core-service', label: 'CoreService', color: '#8BB7FC', y: START_Y + 350 },
    ];

    services.forEach((svc) => {
      newNodes.push({
        id: svc.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2, y: svc.y },
        data: {
          label: (
            <div className={styles.serviceLabel}>{svc.label}</div>
          ),
        },
        style: {
          background: `linear-gradient(135deg, ${svc.color} 0%, ${svc.color}dd 100%)`,
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          padding: '16px 20px',
          width: 160,
          fontWeight: '600',
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
        },
      });
    });

    // Connect endpoints to services
    const endpointServiceMapping = [
      { endpoint: 'registration', service: 'auth-service' },
      { endpoint: 'login', service: 'auth-service' },
      { endpoint: 'refresh', service: 'auth-service' },
      { endpoint: 'get_account', service: 'account-service' },
      { endpoint: 'patch_account', service: 'account-service' },
      { endpoint: 'get_projects_list', service: 'project-service' },
      { endpoint: 'create_project', service: 'project-service' },
      { endpoint: 'homepage', service: 'core-service' },
    ];

    endpointServiceMapping.forEach(({ endpoint, service }) => {
      newEdges.push({
        id: `edge-${endpoint}-${service}`,
        source: `endpoint-${endpoint}`,
        target: service,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#A0A0A0', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#A0A0A0', width: 18, height: 18 },
      });
    });

    // === LAYER 4: Database Manager ===
    newNodes.push({
      id: 'database-manager',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 3, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.dbManagerLabel}>
            <div>Database</div>
            <div>Manager</div>
          </div>
        ),
      },
      style: {
        background: 'linear-gradient(135deg, #8BB7FC 0%, #6B97DC 100%)',
        color: 'white',
        border: '2px solid #5A6FD6',
        borderRadius: '8px',
        padding: '18px 22px',
        width: 160,
        fontWeight: '600',
        fontSize: '14px',
        textAlign: 'center',
        boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
      },
    });

    // Connect services to database manager
    services.forEach(svc => {
      newEdges.push({
        id: `edge-${svc.id}-dbm`,
        source: svc.id,
        target: 'database-manager',
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#A0A0A0', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#A0A0A0', width: 18, height: 18 },
      });
    });

    // === LAYER 4: Databases (цилиндры) ===
    const databases = [
      { id: 'accounts-db', label: 'Accounts\nDB', y: START_Y + 80 },
      { id: 'projects-db', label: 'Projects\nDB', y: START_Y + 280 },
    ];

    databases.forEach((db) => {
      newNodes.push({
        id: db.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3 + 50, y: db.y },
        data: {
          label: (
            <div className={styles.dbLabel}>
              {db.label.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ),
        },
        style: {
          background: 'linear-gradient(180deg, #6B8FE8 0%, #5A7FD8 100%)',
          color: 'white',
          border: '2px solid #4A6FC6',
          borderRadius: '50px 50px 10px 10px',
          padding: '16px 20px',
          width: 120,
          fontWeight: '600',
          fontSize: '13px',
          textAlign: 'center',
          boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
        },
        className: styles.cylinderNode,
      });

      // Connect database manager to databases
      newEdges.push({
        id: `edge-dbm-${db.id}`,
        source: 'database-manager',
        target: db.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#A0A0A0', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#A0A0A0', width: 18, height: 18 },
      });
    });

    // === LAYER 5: Broker (круг) ===
    newNodes.push({
      id: 'broker',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 4 + 80, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.brokerLabel}>Broker</div>
        ),
      },
      style: {
        background: 'white',
        color: '#E0A04A',
        border: '3px solid #E0A04A',
        borderRadius: '50%',
        padding: '24px',
        width: 120,
        height: 120,
        fontWeight: 'bold',
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(224, 160, 74, 0.3)',
      },
    });

    // Connect database manager to broker
    newEdges.push({
      id: 'edge-dbm-broker',
      source: 'database-manager',
      target: 'broker',
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#A0A0A0', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#A0A0A0', width: 18, height: 18 },
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [endpoints, setNodes, setEdges]);

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
