import { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectView.module.css';

// Демо данные Python проекта "E-Commerce Platform"
const demoProject = {
  name: "E-Commerce Platform",
  description: "Микросервисная архитектура интернет-магазина",
};

// Nodes - модули/сервисы Python проекта
const initialNodes = [
  // API Gateway
  {
    id: 'api-gateway',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🌐 API Gateway</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>FastAPI</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>450 lines</div>
        </div>
      ),
    },
    position: { x: 400, y: 50 },
    style: { 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
      fontSize: '14px',
    },
  },
  
  // Services Layer
  {
    id: 'auth-service',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🔐 Auth Service</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>JWT, OAuth2</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>890 lines</div>
        </div>
      ),
    },
    position: { x: 100, y: 250 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  {
    id: 'user-service',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>👤 User Service</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>User Management</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>1,240 lines</div>
        </div>
      ),
    },
    position: { x: 350, y: 250 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  {
    id: 'product-service',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>📦 Product Service</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Catalog, Inventory</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>2,100 lines</div>
        </div>
      ),
    },
    position: { x: 600, y: 250 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  {
    id: 'order-service',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🛒 Order Service</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Order Processing</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>1,650 lines</div>
        </div>
      ),
    },
    position: { x: 850, y: 250 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  
  // Data Layer
  {
    id: 'postgres',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🗄️ PostgreSQL</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Main Database</div>
        </div>
      ),
    },
    position: { x: 200, y: 450 },
    style: { 
      background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  {
    id: 'redis',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>⚡ Redis Cache</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Session, Cache</div>
        </div>
      ),
    },
    position: { x: 500, y: 450 },
    style: { 
      background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  {
    id: 'mongodb',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🍃 MongoDB</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Product Data</div>
        </div>
      ),
    },
    position: { x: 800, y: 450 },
    style: { 
      background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  
  // Message Queue
  {
    id: 'rabbitmq',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>📨 RabbitMQ</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Message Broker</div>
        </div>
      ),
    },
    position: { x: 1100, y: 250 },
    style: { 
      background: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  
  // Workers
  {
    id: 'email-worker',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>📧 Email Worker</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Celery</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>320 lines</div>
        </div>
      ),
    },
    position: { x: 1100, y: 400 },
    style: { 
      background: 'linear-gradient(135deg, #9f7aea 0%, #805ad5 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  {
    id: 'payment-worker',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>💳 Payment Worker</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Stripe Integration</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>580 lines</div>
        </div>
      ),
    },
    position: { x: 1100, y: 550 },
    style: { 
      background: 'linear-gradient(135deg, #9f7aea 0%, #805ad5 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  
  // Utils
  {
    id: 'logger',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>📝 Logger</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Centralized Logging</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>180 lines</div>
        </div>
      ),
    },
    position: { x: 50, y: 600 },
    style: { 
      background: 'linear-gradient(135deg, #a0aec0 0%, #718096 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
  {
    id: 'config',
    data: { 
      label: (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>⚙️ Config</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>Environment Settings</div>
          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>120 lines</div>
        </div>
      ),
    },
    position: { x: 400, y: 600 },
    style: { 
      background: 'linear-gradient(135deg, #a0aec0 0%, #718096 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '16px 20px',
      width: 200,
    },
  },
];

// Edges - связи между модулями
const initialEdges = [
  // API Gateway connections
  { 
    id: 'e1', 
    source: 'api-gateway', 
    target: 'auth-service',
    label: 'authenticate',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#667eea', strokeWidth: 2 },
  },
  { 
    id: 'e2', 
    source: 'api-gateway', 
    target: 'user-service',
    label: 'user_crud',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#667eea', strokeWidth: 2 },
  },
  { 
    id: 'e3', 
    source: 'api-gateway', 
    target: 'product-service',
    label: 'get_products',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#667eea', strokeWidth: 2 },
  },
  { 
    id: 'e4', 
    source: 'api-gateway', 
    target: 'order-service',
    label: 'create_order',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#667eea', strokeWidth: 2 },
  },
  
  // Service to Database connections
  { 
    id: 'e5', 
    source: 'auth-service', 
    target: 'postgres',
    label: 'users',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#48bb78', strokeWidth: 2 },
  },
  { 
    id: 'e6', 
    source: 'user-service', 
    target: 'postgres',
    label: 'profiles',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#48bb78', strokeWidth: 2 },
  },
  { 
    id: 'e7', 
    source: 'product-service', 
    target: 'mongodb',
    label: 'products',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#48bb78', strokeWidth: 2 },
  },
  { 
    id: 'e8', 
    source: 'order-service', 
    target: 'postgres',
    label: 'orders',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#48bb78', strokeWidth: 2 },
  },
  
  // Redis cache connections
  { 
    id: 'e9', 
    source: 'auth-service', 
    target: 'redis',
    label: 'sessions',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#f56565', strokeWidth: 2 },
  },
  { 
    id: 'e10', 
    source: 'product-service', 
    target: 'redis',
    label: 'cache',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#f56565', strokeWidth: 2 },
  },
  
  // Message Queue connections
  { 
    id: 'e11', 
    source: 'order-service', 
    target: 'rabbitmq',
    label: 'order_created',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#ed8936', strokeWidth: 2 },
  },
  { 
    id: 'e12', 
    source: 'rabbitmq', 
    target: 'email-worker',
    label: 'send_email',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#ed8936', strokeWidth: 2 },
  },
  { 
    id: 'e13', 
    source: 'rabbitmq', 
    target: 'payment-worker',
    label: 'process_payment',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#ed8936', strokeWidth: 2 },
  },
  
  // Utility connections
  { 
    id: 'e14', 
    source: 'auth-service', 
    target: 'logger',
    label: 'log',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#a0aec0', strokeWidth: 1, strokeDasharray: '5,5' },
  },
  { 
    id: 'e15', 
    source: 'user-service', 
    target: 'logger',
    label: 'log',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#a0aec0', strokeWidth: 1, strokeDasharray: '5,5' },
  },
  { 
    id: 'e16', 
    source: 'product-service', 
    target: 'config',
    label: 'get_config',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#a0aec0', strokeWidth: 1, strokeDasharray: '5,5' },
  },
];

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState(null);

  // Debug - проверим что узлы и связи загружены
  console.log('Nodes:', nodes.length, 'Edges:', edges.length);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/projects')}>
          ← Назад к проектам
        </button>
        <div className={styles.projectInfo}>
          <h1>{demoProject.name}</h1>
          <p>{demoProject.description}</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Модулей</span>
            <span className={styles.statValue}>{nodes.length}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Связей</span>
            <span className={styles.statValue}>{edges.length}</span>
          </div>
        </div>
      </header>

      {/* Flow Canvas */}
      <div className={styles.flowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={4}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e0e0e0" gap={16} />
          <Controls />
          <MiniMap 
            nodeColor={(node) => {
              if (node.className?.includes('gateway')) return '#667eea';
              if (node.className?.includes('service')) return '#48bb78';
              if (node.className?.includes('database')) return '#4299e1';
              if (node.className?.includes('queue')) return '#ed8936';
              if (node.className?.includes('worker')) return '#f56565';
              return '#a0aec0';
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
          
          <Panel position="top-right" className={styles.legend}>
            <h3>Легенда</h3>
            <div className={styles.legendItem}>
              <div className={styles.legendColor} style={{background: '#667eea'}}></div>
              <span>API Gateway</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendColor} style={{background: '#48bb78'}}></div>
              <span>Сервисы</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendColor} style={{background: '#4299e1'}}></div>
              <span>Базы данных</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendColor} style={{background: '#ed8936'}}></div>
              <span>Очереди</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendColor} style={{background: '#f56565'}}></div>
              <span>Воркеры</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendColor} style={{background: '#a0aec0'}}></div>
              <span>Утилиты</span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className={styles.detailsPanel}>
          <div className={styles.detailsHeader}>
            <h2>{selectedNode.data.label}</h2>
            <button onClick={() => setSelectedNode(null)}>✕</button>
          </div>
          <div className={styles.detailsContent}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Тип:</span>
              <span>{selectedNode.data.description}</span>
            </div>
            {selectedNode.data.lines > 0 && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Строк кода:</span>
                <span>{selectedNode.data.lines.toLocaleString()}</span>
              </div>
            )}
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>ID модуля:</span>
              <span className={styles.codeText}>{selectedNode.id}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Зависимости:</span>
              <span>
                {edges.filter(e => e.source === selectedNode.id).length} исходящих
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Используется:</span>
              <span>
                {edges.filter(e => e.target === selectedNode.id).length} входящих
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
