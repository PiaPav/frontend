import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectViewV2.module.css';

// Структура папок проекта
const projectStructure = [
  {
    name: 'src/',
    type: 'folder',
    expanded: true,
    children: [
      {
        name: 'api/',
        type: 'folder',
        expanded: true,
        children: [
          { name: 'gateway.py', type: 'file', lines: 450, module: 'api-gateway' },
          { name: '__init__.py', type: 'file', lines: 10 },
        ]
      },
      {
        name: 'services/',
        type: 'folder',
        expanded: true,
        children: [
          { name: 'auth.py', type: 'file', lines: 890, module: 'auth-service' },
          { name: 'user.py', type: 'file', lines: 1240, module: 'user-service' },
          { name: 'product.py', type: 'file', lines: 2100, module: 'product-service' },
          { name: 'order.py', type: 'file', lines: 1650, module: 'order-service' },
        ]
      },
      {
        name: 'database/',
        type: 'folder',
        expanded: false,
        children: [
          { name: 'postgres.py', type: 'file', lines: 320, module: 'postgres' },
          { name: 'redis.py', type: 'file', lines: 180, module: 'redis' },
          { name: 'mongo.py', type: 'file', lines: 250, module: 'mongodb' },
        ]
      },
      {
        name: 'workers/',
        type: 'folder',
        expanded: true,
        children: [
          { name: 'email_worker.py', type: 'file', lines: 320, module: 'email-worker' },
          { name: 'payment_worker.py', type: 'file', lines: 580, module: 'payment-worker' },
        ]
      },
      {
        name: 'utils/',
        type: 'folder',
        expanded: false,
        children: [
          { name: 'logger.py', type: 'file', lines: 180, module: 'logger' },
          { name: 'config.py', type: 'file', lines: 120, module: 'config' },
        ]
      },
    ]
  },
  {
    name: 'tests/',
    type: 'folder',
    expanded: false,
    children: [
      { name: 'test_auth.py', type: 'file', lines: 450 },
      { name: 'test_api.py', type: 'file', lines: 380 },
    ]
  },
  { name: 'requirements.txt', type: 'file', lines: 45 },
  { name: 'README.md', type: 'file', lines: 120 },
  { name: '.env', type: 'file', lines: 15 },
];

// Граф зависимостей
const nodes = [
  {
    id: 'api-gateway',
    data: { label: '🌐 API Gateway\ngateway.py\n450 lines' },
    position: { x: 400, y: 50 },
    style: { 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'auth-service',
    data: { label: '🔐 Auth Service\nauth.py\n890 lines' },
    position: { x: 100, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'user-service',
    data: { label: '👤 User Service\nuser.py\n1,240 lines' },
    position: { x: 320, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'product-service',
    data: { label: '📦 Product Service\nproduct.py\n2,100 lines' },
    position: { x: 540, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'order-service',
    data: { label: '🛒 Order Service\norder.py\n1,650 lines' },
    position: { x: 760, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'postgres',
    data: { label: '🗄️ PostgreSQL\npostgres.py' },
    position: { x: 200, y: 380 },
    style: { 
      background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 160,
    },
  },
  {
    id: 'redis',
    data: { label: '⚡ Redis\nredis.py' },
    position: { x: 450, y: 380 },
    style: { 
      background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 160,
    },
  },
  {
    id: 'mongodb',
    data: { label: '🍃 MongoDB\nmongo.py' },
    position: { x: 700, y: 380 },
    style: { 
      background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 160,
    },
  },
  {
    id: 'email-worker',
    data: { label: '📧 Email Worker\nemail_worker.py\n320 lines' },
    position: { x: 950, y: 200 },
    style: { 
      background: 'linear-gradient(135deg, #9f7aea 0%, #805ad5 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
  {
    id: 'payment-worker',
    data: { label: '💳 Payment Worker\npayment_worker.py\n580 lines' },
    position: { x: 950, y: 350 },
    style: { 
      background: 'linear-gradient(135deg, #9f7aea 0%, #805ad5 100%)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 180,
    },
  },
];

const edges = [
  { id: 'e1', source: 'api-gateway', target: 'auth-service', animated: true, style: { stroke: '#667eea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2', source: 'api-gateway', target: 'user-service', animated: true, style: { stroke: '#667eea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3', source: 'api-gateway', target: 'product-service', animated: true, style: { stroke: '#667eea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4', source: 'api-gateway', target: 'order-service', animated: true, style: { stroke: '#667eea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e5', source: 'auth-service', target: 'postgres', style: { stroke: '#48bb78', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e6', source: 'user-service', target: 'postgres', style: { stroke: '#48bb78', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e7', source: 'product-service', target: 'mongodb', style: { stroke: '#48bb78', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e8', source: 'order-service', target: 'postgres', style: { stroke: '#48bb78', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e9', source: 'auth-service', target: 'redis', style: { stroke: '#f56565', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e10', source: 'product-service', target: 'redis', style: { stroke: '#f56565', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e11', source: 'order-service', target: 'email-worker', animated: true, style: { stroke: '#9f7aea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e12', source: 'order-service', target: 'payment-worker', animated: true, style: { stroke: '#9f7aea', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } },
];

export default function ProjectViewV2() {
  const navigate = useNavigate();
  const [expandedFolders, setExpandedFolders] = useState(['src/', 'src/api/', 'src/services/', 'src/workers/']);
  const [selectedFile, setSelectedFile] = useState(null);

  const toggleFolder = (path) => {
    setExpandedFolders(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  const renderTree = (items, path = '') => {
    return items.map((item) => {
      const fullPath = path + item.name;
      const isExpanded = expandedFolders.includes(fullPath);

      if (item.type === 'folder') {
        return (
          <div key={fullPath} className={styles.folderItem}>
            <div 
              className={styles.folderHeader}
              onClick={() => toggleFolder(fullPath)}
            >
              <span className={styles.folderIcon}>{isExpanded ? '📂' : '📁'}</span>
              <span className={styles.folderName}>{item.name}</span>
            </div>
            {isExpanded && item.children && (
              <div className={styles.folderChildren}>
                {renderTree(item.children, fullPath)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div 
            key={fullPath} 
            className={`${styles.fileItem} ${selectedFile === fullPath ? styles.fileItemSelected : ''}`}
            onClick={() => setSelectedFile(fullPath)}
          >
            <span className={styles.fileIcon}>📄</span>
            <span className={styles.fileName}>{item.name}</span>
            {item.lines && <span className={styles.fileLines}>{item.lines}L</span>}
          </div>
        );
      }
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/projects')}>
          ← Назад к проектам
        </button>
        <div className={styles.projectInfo}>
          <h1>E-Commerce Platform</h1>
          <p>Микросервисная архитектура интернет-магазина</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>10</span>
            <span className={styles.statLabel}>модулей</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>12</span>
            <span className={styles.statLabel}>связей</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* File Tree Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2>📦 Структура проекта</h2>
          </div>
          <div className={styles.fileTree}>
            {renderTree(projectStructure)}
          </div>
        </aside>

        {/* Visualization */}
        <main className={styles.visualization}>
          <ReactFlow 
            nodes={nodes} 
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
          >
            <Background color="#e0e0e0" gap={16} />
            <Controls />
          </ReactFlow>
        </main>
      </div>
    </div>
  );
}
