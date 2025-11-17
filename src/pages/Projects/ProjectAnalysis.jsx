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
  const [expandedMethods, setExpandedMethods] = useState(new Set()); // Какие методы раскрыты
  
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
    const LAYER_GAP = 350;
    const START_X = 100;
    const START_Y = 50;

    // === LAYER 1: Main Service ===
    newNodes.push({
      id: 'main-service',
      type: 'default',
      position: { x: START_X, y: START_Y + 250 },
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
    });

    // === LAYER 2: API Endpoints (группировка по методам) ===
    // Группируем эндпоинты по HTTP методам
    const groupedEndpoints = {};
    Object.entries(endpoints).forEach(([key, value]) => {
      const method = value.split(' ')[0];
      if (!groupedEndpoints[method]) {
        groupedEndpoints[method] = [];
      }
      groupedEndpoints[method].push({ key, value });
    });

    const methodColors = {
      'GET': { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669', text: '#fff' },
      'POST': { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb', text: '#fff' },
      'PATCH': { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#d97706', text: '#fff' },
      'PUT': { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed', text: '#fff' },
      'DELETE': { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#dc2626', text: '#fff' },
    };

    let methodYOffset = START_Y;
    Object.entries(groupedEndpoints).forEach(([method, endpointList], methodIdx) => {
      const isExpanded = expandedMethods.has(method);
      const color = methodColors[method] || methodColors['GET'];

      // Узел-группа метода
      newNodes.push({
        id: `method-${method}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP, y: methodYOffset },
        data: {
          label: (
            <div className={styles.methodGroup} onClick={() => {
              const newExpanded = new Set(expandedMethods);
              if (isExpanded) {
                newExpanded.delete(method);
              } else {
                newExpanded.add(method);
              }
              setExpandedMethods(newExpanded);
            }}>
              <div className={styles.methodBadge}>{method}</div>
              <div className={styles.methodCount}>{endpointList.length} endpoints</div>
              <div className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</div>
            </div>
          ),
        },
        style: {
          background: color.bg,
          color: color.text,
          border: `3px solid ${color.border}`,
          borderRadius: '12px',
          padding: '16px 20px',
          width: 160,
          fontWeight: '700',
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: `0 4px 16px ${color.border}40`,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
        },
      });

      // Соединяем Main Service с методом-группой
      newEdges.push({
        id: `edge-main-method-${method}`,
        source: 'main-service',
        target: `method-${method}`,
        type: 'smoothstep',
        animated: true,
        style: { 
          stroke: color.border, 
          strokeWidth: 3,
          strokeDasharray: '5,5',
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: color.border, 
          width: 24, 
          height: 24 
        },
      });

      // Если метод раскрыт, показываем эндпоинты
      if (isExpanded) {
        endpointList.forEach((endpoint, idx) => {
          const path = endpoint.value.split(' ')[1] || '';
          const endpointY = methodYOffset + 100 + idx * 90;
          
          newNodes.push({
            id: `endpoint-${endpoint.key}`,
            type: 'default',
            position: { x: START_X + LAYER_GAP + 200, y: endpointY },
            data: {
              label: (
                <div className={styles.endpointCard}>
                  <div className={styles.endpointPath}>{path}</div>
                  <div className={styles.endpointKey}>{endpoint.key}</div>
                </div>
              ),
            },
            style: {
              background: 'white',
              color: '#1e293b',
              border: `2px solid ${color.border}`,
              borderRadius: '10px',
              padding: '12px 16px',
              width: 200,
              fontWeight: '600',
              fontSize: '12px',
              boxShadow: `0 2px 12px ${color.border}30`,
            },
          });

          // Соединяем группу метода с эндпоинтом
          newEdges.push({
            id: `edge-method-endpoint-${endpoint.key}`,
            source: `method-${method}`,
            target: `endpoint-${endpoint.key}`,
            type: 'smoothstep',
            animated: false,
            style: { 
              stroke: color.border, 
              strokeWidth: 2,
            },
            markerEnd: { 
              type: MarkerType.ArrowClosed, 
              color: color.border, 
              width: 20, 
              height: 20 
            },
          });
        });
      }

      methodYOffset += isExpanded ? 100 + endpointList.length * 90 : 100;
    });

    // === LAYER 3: Services ===
    const services = [
      { id: 'auth-service', label: '🔐 Auth', color: '#8b5cf6', y: START_Y + 80 },
      { id: 'account-service', label: '👤 Account', color: '#3b82f6', y: START_Y + 220 },
      { id: 'project-service', label: '📁 Project', color: '#10b981', y: START_Y + 360 },
      { id: 'core-service', label: '⚙️ Core', color: '#f59e0b', y: START_Y + 500 },
    ];

    services.forEach((svc) => {
      newNodes.push({
        id: svc.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2 + 100, y: svc.y },
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
      });
    });

    // Соединяем раскрытые эндпоинты с сервисами
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
      if (newNodes.some(n => n.id === `endpoint-${endpoint}`)) {
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
        });
      }
    });

    // === LAYER 4: Database Manager ===
    newNodes.push({
      id: 'database-manager',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 3 + 100, y: START_Y + 250 },
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
    });

    // Соединяем сервисы с database manager
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
      });
    });

    // === LAYER 4: Databases (красивые формы) ===
    const databases = [
      { id: 'accounts-db', label: '👥 Accounts', icon: '🗃️', y: START_Y + 120 },
      { id: 'projects-db', label: '📊 Projects', icon: '🗃️', y: START_Y + 380 },
    ];

    databases.forEach((db) => {
      newNodes.push({
        id: db.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3 + 100, y: db.y },
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
      });

      // Соединяем database manager с databases
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
      });
    });

    // === LAYER 5: Broker (красивая форма) ===
    newNodes.push({
      id: 'broker',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 4 + 150, y: START_Y + 250 },
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
    });

    // Соединяем database manager с broker
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
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [endpoints, expandedMethods, setNodes, setEdges]);

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
