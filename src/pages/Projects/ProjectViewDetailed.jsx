import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectViewDetailed.module.css';

export default function ProjectViewDetailed() {
  const navigate = useNavigate();
  const [selectedSection, setSelectedSection] = useState('architecture');

  // Данные парсинга проекта
  const projectData = {
    name: "Backend API Service",
    taskId: 987,
    requirements: {
      total: 15,
      list: [
        "aio-pika", "asyncpg", "bcrypt", "boto3", "fastapi",
        "grpcio", "grpcio-tools", "pika", "protobuf", "pyjwt",
        "python-dotenv", "python-multipart", "pyyaml", "sqlalchemy", "uvicorn"
      ]
    },
    endpoints: {
      total: 11,
      list: [
        { key: "registration", value: "POST /v1/auth/registration" },
        { key: "login", value: "POST /v1/auth/login" },
        { key: "refresh", value: "POST /v1/auth/refresh" },
        { key: "get_account", value: "GET /v1/account" },
        { key: "patch_account", value: "PATCH /v1/account" },
        { key: "get_projects_list", value: "GET /v1/project" },
        { key: "create_project", value: "POST /v1/project" },
        { key: "get_project", value: "GET /v1/project/{project_id}" },
        { key: "patch_project", value: "PATCH /v1/project/{project_id}" },
        { key: "delete_project", value: "DELETE /v1/project/{project_id}" },
        { key: "homepage", value: "GET /v1/home" },
      ]
    }
  };

  // Структура папок и модулей
  const folderStructure = [
    {
      name: "accounts",
      icon: "📁",
      files: [
        { name: "Account.py", icon: "🐍", type: "model" },
        { name: "__init__.py", icon: "📄", type: "init" },
      ]
    },
    {
      name: "datamanager",
      icon: "📁",
      files: [
        { name: "DatabaseManager.py", icon: "🐍", type: "manager" },
        { name: "__init__.py", icon: "📄", type: "init" },
      ]
    },
    {
      name: "services",
      icon: "📁",
      files: [
        { name: "auth_service.py", icon: "🐍", type: "service" },
        { name: "project_service.py", icon: "🐍", type: "service" },
        { name: "__init__.py", icon: "📄", type: "init" },
      ]
    },
    {
      name: "endpoints",
      icon: "📁",
      files: [
        { name: "auth.py", icon: "🌐", type: "endpoint" },
        { name: "projects.py", icon: "🌐", type: "endpoint" },
        { name: "accounts.py", icon: "🌐", type: "endpoint" },
      ]
    },
  ];

  // Граф архитектуры на основе данных парсинга
  const architectureNodes = [
    // Account methods
    {
      id: 'create_account',
      data: { label: <div><strong>create_account</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 50 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },
    {
      id: 'get_account_by_id',
      data: { label: <div><strong>get_account_by_id</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 150 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },
    {
      id: 'get_account_by_login',
      data: { label: <div><strong>get_account_by_login</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 250 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },
    {
      id: 'is_login_exists',
      data: { label: <div><strong>is_login_exists</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 350 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },
    {
      id: 'patch_account',
      data: { label: <div><strong>patch_account_by_id</strong><div style={{fontSize: '10px', opacity: 0.8}}>Account</div></div> },
      position: { x: 50, y: 450 },
      style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 180 }
    },

    // DatabaseManager
    {
      id: 'db_session',
      data: { label: <div><strong>session</strong><div style={{fontSize: '10px', opacity: 0.8}}>DatabaseManager</div></div> },
      position: { x: 350, y: 200 },
      style: { background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', width: 160 }
    },

    // Database operations
    {
      id: 'session_add',
      data: { label: <div><strong>session.add</strong><div style={{fontSize: '10px', opacity: 0.8}}>SQLAlchemy</div></div> },
      position: { x: 600, y: 50 },
      style: { background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },
    {
      id: 'session_get',
      data: { label: <div><strong>session.get</strong><div style={{fontSize: '10px', opacity: 0.8}}>SQLAlchemy</div></div> },
      position: { x: 600, y: 120 },
      style: { background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },
    {
      id: 'session_execute',
      data: { label: <div><strong>session.execute</strong><div style={{fontSize: '10px', opacity: 0.8}}>SQLAlchemy</div></div> },
      position: { x: 600, y: 220 },
      style: { background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },
    {
      id: 'session_flush',
      data: { label: <div><strong>session.flush</strong><div style={{fontSize: '10px', opacity: 0.8}}>SQLAlchemy</div></div> },
      position: { x: 600, y: 450 },
      style: { background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },

    // Query operations
    {
      id: 'select',
      data: { label: 'select' },
      position: { x: 820, y: 240 },
      style: { background: '#ed8936', color: 'white', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '12px' }
    },
    {
      id: 'where',
      data: { label: 'where' },
      position: { x: 820, y: 290 },
      style: { background: '#ed8936', color: 'white', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '12px' }
    },

    // Logging
    {
      id: 'log_error',
      data: { label: <div><strong>log.error</strong><div style={{fontSize: '10px', opacity: 0.8}}>Logger</div></div> },
      position: { x: 350, y: 400 },
      style: { background: 'linear-gradient(135deg, #a0aec0 0%, #718096 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 120 }
    },

    // Exceptions
    {
      id: 'db_exception',
      data: { label: <div><strong>DataBaseEntityNotExists</strong><div style={{fontSize: '10px', opacity: 0.8}}>Exception</div></div> },
      position: { x: 600, y: 380 },
      style: { background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: 'none', width: 140 }
    },
  ];

  const architectureEdges = [
    // create_account connections
    { id: 'e1', source: 'create_account', target: 'db_session', label: 'uses', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e2', source: 'create_account', target: 'session_add', label: 'add', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },

    // get_account_by_id connections
    { id: 'e3', source: 'get_account_by_id', target: 'db_session', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e4', source: 'get_account_by_id', target: 'session_get', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e5', source: 'get_account_by_id', target: 'log_error', label: 'on error', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f56565', strokeWidth: 1, strokeDasharray: '5,5' } },
    { id: 'e6', source: 'get_account_by_id', target: 'db_exception', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f56565', strokeWidth: 1, strokeDasharray: '5,5' } },

    // get_account_by_login connections
    { id: 'e7', source: 'get_account_by_login', target: 'db_session', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e8', source: 'get_account_by_login', target: 'session_execute', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e9', source: 'session_execute', target: 'select', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#4299e1', strokeWidth: 1.5 } },
    { id: 'e10', source: 'session_execute', target: 'where', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#4299e1', strokeWidth: 1.5 } },
    { id: 'e11', source: 'get_account_by_login', target: 'log_error', label: 'on error', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f56565', strokeWidth: 1, strokeDasharray: '5,5' } },
    { id: 'e12', source: 'get_account_by_login', target: 'db_exception', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f56565', strokeWidth: 1, strokeDasharray: '5,5' } },

    // is_login_exists connections
    { id: 'e13', source: 'is_login_exists', target: 'db_session', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e14', source: 'is_login_exists', target: 'session_execute', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },

    // patch_account connections
    { id: 'e15', source: 'patch_account', target: 'db_session', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
    { id: 'e16', source: 'patch_account', target: 'get_account_by_id', label: 'calls', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#9f7aea', strokeWidth: 2 } },
    { id: 'e17', source: 'patch_account', target: 'session_flush', animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#667eea', strokeWidth: 2 } },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/projects')}>
          ← Назад
        </button>
        <div className={styles.projectInfo}>
          <h1>{projectData.name}</h1>
          <p>Task ID: {projectData.taskId}</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Requirements</span>
            <span className={styles.statValue}>{projectData.requirements.total}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Endpoints</span>
            <span className={styles.statValue}>{projectData.endpoints.total}</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {/* Sidebar - Folder Structure */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3>📂 Project Structure</h3>
          </div>

          {/* Sections Tabs */}
          <div className={styles.tabs}>
            <button 
              className={`${styles.tab} ${selectedSection === 'structure' ? styles.tabActive : ''}`}
              onClick={() => setSelectedSection('structure')}
            >
              📁 Files
            </button>
            <button 
              className={`${styles.tab} ${selectedSection === 'requirements' ? styles.tabActive : ''}`}
              onClick={() => setSelectedSection('requirements')}
            >
              📦 Requirements
            </button>
            <button 
              className={`${styles.tab} ${selectedSection === 'endpoints' ? styles.tabActive : ''}`}
              onClick={() => setSelectedSection('endpoints')}
            >
              🌐 Endpoints
            </button>
            <button 
              className={`${styles.tab} ${selectedSection === 'architecture' ? styles.tabActive : ''}`}
              onClick={() => setSelectedSection('architecture')}
            >
              🏗️ Architecture
            </button>
          </div>

          {/* Content based on selected section */}
          <div className={styles.sidebarContent}>
            {selectedSection === 'structure' && (
              <div className={styles.folderStructure}>
                {folderStructure.map((folder, idx) => (
                  <div key={idx} className={styles.folder}>
                    <div className={styles.folderName}>
                      <span>{folder.icon}</span>
                      <span>{folder.name}/</span>
                    </div>
                    <div className={styles.files}>
                      {folder.files.map((file, fidx) => (
                        <div key={fidx} className={styles.file}>
                          <span>{file.icon}</span>
                          <span>{file.name}</span>
                          <span className={styles.fileType}>{file.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedSection === 'requirements' && (
              <div className={styles.requirementsList}>
                <div className={styles.listHeader}>
                  <strong>Total: {projectData.requirements.total}</strong>
                </div>
                {projectData.requirements.list.map((req, idx) => (
                  <div key={idx} className={styles.requirementItem}>
                    <span className={styles.reqIcon}>📦</span>
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedSection === 'endpoints' && (
              <div className={styles.endpointsList}>
                <div className={styles.listHeader}>
                  <strong>Total: {projectData.endpoints.total}</strong>
                </div>
                {projectData.endpoints.list.map((endpoint, idx) => (
                  <div key={idx} className={styles.endpointItem}>
                    <div className={styles.endpointMethod}>
                      {endpoint.value.split(' ')[0]}
                    </div>
                    <div className={styles.endpointPath}>
                      {endpoint.value.split(' ')[1]}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedSection === 'architecture' && (
              <div className={styles.architectureInfo}>
                <div className={styles.infoBlock}>
                  <h4>🟣 Methods</h4>
                  <p>Parent functions/methods</p>
                </div>
                <div className={styles.infoBlock}>
                  <h4>🟢 Database</h4>
                  <p>DatabaseManager sessions</p>
                </div>
                <div className={styles.infoBlock}>
                  <h4>🔵 Operations</h4>
                  <p>SQLAlchemy operations</p>
                </div>
                <div className={styles.infoBlock}>
                  <h4>🟠 Queries</h4>
                  <p>Select, where clauses</p>
                </div>
                <div className={styles.infoBlock}>
                  <h4>⚪ Utils</h4>
                  <p>Logging, exceptions</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content - Flow Diagram */}
        <main className={styles.mainContent}>
          <div className={styles.flowWrapper}>
            <ReactFlow
              nodes={architectureNodes}
              edges={architectureEdges}
              fitView
              fitViewOptions={{ padding: 0.1 }}
              minZoom={0.1}
              maxZoom={2}
              defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e0e0e0" gap={16} />
              <Controls />
            </ReactFlow>
          </div>
        </main>
      </div>
    </div>
  );
}
