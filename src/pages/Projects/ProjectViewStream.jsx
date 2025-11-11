import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { getGRPCClient } from '../../services/grpcClient';
import styles from './ProjectViewStream.module.css';

export default function ProjectViewStream() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architecture, setArchitecture] = useState([]);
  
  const [selectedTab, setSelectedTab] = useState('requirements');
  const [expandedClasses, setExpandedClasses] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  
  const [streamStatus, setStreamStatus] = useState('connecting'); // connecting, streaming, done
  const [progress, setProgress] = useState({ total: 0, current: 0 });

  // Подключение к gRPC стриму
  useEffect(() => {
    const connectToStream = async () => {
      try {
        setStreamStatus('streaming');
        
        const grpcClient = getGRPCClient();
        
        await grpcClient.connectToStream(
          1, // TODO: Получить реальный userId из контекста
          parseInt(id),
          {
            onRequirements: (data) => {
              console.log('📦 Requirements received:', data);
              setRequirements(data.requirements);
              setProgress(prev => ({ 
                ...prev, 
                total: prev.total + data.total,
                current: prev.current + data.total 
              }));
            },
            
            onEndpoints: (data) => {
              console.log('🌐 Endpoints received:', data);
              setEndpoints(data.endpoints);
              setProgress(prev => ({ 
                ...prev, 
                total: prev.total + data.total,
                current: prev.current + data.total 
              }));
            },
            
            onArchitecture: (data) => {
              console.log('🏗️ Architecture part received:', data);
              setArchitecture(prev => [...prev, data]);
              setProgress(prev => ({ 
                ...prev, 
                total: prev.total + 1,
                current: prev.current + 1 
              }));
            },
            
            onDone: () => {
              console.log('✅ Stream completed');
              setStreamStatus('done');
            },
            
            onError: (error) => {
              console.error('❌ Stream error:', error);
              setStreamStatus('error');
            }
          }
        );
        
      } catch (error) {
        console.error('Stream error:', error);
        setStreamStatus('error');
      }
    };

    connectToStream();
    
    return () => {
      // Cleanup при размонтировании
      const grpcClient = getGRPCClient();
      grpcClient.disconnect();
    };
  }, [id]);

  // Группировка endpoints по классам
  const endpointsByClass = useMemo(() => {
    const grouped = {};
    Object.entries(endpoints).forEach(([route, handler]) => {
      const [className, methodName] = handler.split('.');
      if (!grouped[className]) {
        grouped[className] = [];
      }
      grouped[className].push({ route, method: methodName });
    });
    return grouped;
  }, [endpoints]);

  // Построение графа из architecture
  useEffect(() => {
    if (architecture.length === 0) return;

    const newNodes = [];
    const newEdges = [];
    const nodeMap = new Map();
    
    let yOffset = 0;
    const levelMap = new Map(); // для определения уровня узла

    // Функция для получения или создания узла
    const getOrCreateNode = (name, level = 0) => {
      if (nodeMap.has(name)) {
        return nodeMap.get(name);
      }

      if (!levelMap.has(level)) {
        levelMap.set(level, []);
      }
      levelMap.get(level).push(name);

      const xPosition = level * 300;
      const yPosition = levelMap.get(level).length * 100;

      const node = {
        id: name,
        type: 'default',
        position: { x: xPosition, y: yPosition },
        data: { 
          label: name,
          className: name.split('.')[0],
          methodName: name.split('.')[1]
        },
        style: {
          background: getNodeColor(name),
          color: 'white',
          border: '2px solid #333',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '12px',
          fontWeight: '600',
          minWidth: '180px',
        },
      };

      nodeMap.set(name, node);
      newNodes.push(node);
      return node;
    };

    // Построение графа по уровням
    architecture.forEach((arch) => {
      const parentNode = getOrCreateNode(arch.parent, 0);
      
      arch.children.forEach((child, index) => {
        const childNode = getOrCreateNode(child, 1);
        
        // Создаём связь
        newEdges.push({
          id: `${arch.parent}-${child}`,
          source: arch.parent,
          target: child,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#667eea', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#667eea',
          },
          label: `depends`,
          labelStyle: { fill: '#667eea', fontSize: 10, fontWeight: 600 },
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [architecture]);

  // Цвета узлов в зависимости от типа
  const getNodeColor = (nodeName) => {
    if (nodeName.includes('Account')) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    if (nodeName.includes('Project')) return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
    if (nodeName.includes('Database')) return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
    if (nodeName.includes('Health')) return 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
    if (nodeName.includes('session')) return 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)';
    return 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)';
  };

  // Обработка соединений (растягивание стрелок)
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds)),
    [setEdges]
  );

  // Обработка клика по узлу
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  // Переключение раскрытия класса в списке endpoints
  const toggleClass = (className) => {
    setExpandedClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(className)) {
        newSet.delete(className);
      } else {
        newSet.add(className);
      }
      return newSet;
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Back to Projects
        </button>
        <div className={styles.projectInfo}>
          <h1>Project #{id} - Architecture Visualization</h1>
          <p className={styles.statusBadge}>
            Status: {streamStatus === 'streaming' ? '🔄 Receiving data...' : streamStatus === 'done' ? '✅ Complete' : '⏳ Connecting...'}
          </p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Progress</span>
            <span className={styles.statValue}>
              {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Nodes</span>
            <span className={styles.statValue}>{nodes.length}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Edges</span>
            <span className={styles.statValue}>{edges.length}</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${selectedTab === 'requirements' ? styles.tabActive : ''}`}
              onClick={() => setSelectedTab('requirements')}
            >
              📦 Requirements ({requirements.length})
            </button>
            <button
              className={`${styles.tab} ${selectedTab === 'endpoints' ? styles.tabActive : ''}`}
              onClick={() => setSelectedTab('endpoints')}
            >
              🌐 Endpoints ({Object.keys(endpoints).length})
            </button>
            <button
              className={`${styles.tab} ${selectedTab === 'architecture' ? styles.tabActive : ''}`}
              onClick={() => setSelectedTab('architecture')}
            >
              🏗️ Architecture ({architecture.length})
            </button>
          </div>

          <div className={styles.sidebarContent}>
            {/* Requirements Tab */}
            {selectedTab === 'requirements' && (
              <div className={styles.requirementsList}>
                {requirements.length === 0 ? (
                  <p className={styles.emptyState}>⏳ Waiting for requirements...</p>
                ) : (
                  requirements.map((req, index) => (
                    <div key={index} className={styles.requirementItem}>
                      <span className={styles.reqIcon}>📦</span>
                      <span>{req}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Endpoints Tab - Grouped by Class */}
            {selectedTab === 'endpoints' && (
              <div className={styles.endpointsList}>
                {Object.keys(endpointsByClass).length === 0 ? (
                  <p className={styles.emptyState}>⏳ Waiting for endpoints...</p>
                ) : (
                  Object.entries(endpointsByClass).map(([className, methods]) => (
                    <div key={className} className={styles.endpointClass}>
                      <button
                        className={styles.classHeader}
                        onClick={() => toggleClass(className)}
                      >
                        <span className={styles.classIcon}>
                          {expandedClasses.has(className) ? '▼' : '▶'}
                        </span>
                        <span className={styles.className}>{className}</span>
                        <span className={styles.methodCount}>({methods.length})</span>
                      </button>
                      
                      {expandedClasses.has(className) && (
                        <div className={styles.methodsList}>
                          {methods.map((m, idx) => (
                            <div key={idx} className={styles.methodItem}>
                              <span className={styles.httpMethod}>
                                {m.route.split(' ')[0]}
                              </span>
                              <div className={styles.methodDetails}>
                                <span className={styles.routePath}>{m.route.split(' ')[1]}</span>
                                <span className={styles.methodName}>{m.method}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Architecture Tab */}
            {selectedTab === 'architecture' && (
              <div className={styles.architectureList}>
                {architecture.length === 0 ? (
                  <p className={styles.emptyState}>⏳ Waiting for architecture data...</p>
                ) : (
                  architecture.map((arch, index) => (
                    <div key={index} className={styles.archItem}>
                      <div className={styles.archParent}>
                        <span className={styles.archIcon}>🔵</span>
                        {arch.parent}
                      </div>
                      <div className={styles.archChildren}>
                        {arch.children.map((child, idx) => (
                          <div key={idx} className={styles.archChild}>
                            <span className={styles.archArrow}>└─</span>
                            {child}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Main Graph Area */}
        <main className={styles.mainContent}>
          <div className={styles.flowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#aaa" gap={16} />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  if (node.data.className?.includes('Account')) return '#667eea';
                  if (node.data.className?.includes('Project')) return '#f5576c';
                  if (node.data.className?.includes('Database')) return '#00f2fe';
                  return '#a8edea';
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '8px',
                }}
              />
              
              {/* Legend Panel */}
              <Panel position="top-right">
                <div className={styles.legend}>
                  <h4>Legend</h4>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}></div>
                    <span>Account</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}></div>
                    <span>Project</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}></div>
                    <span>Database</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}></div>
                    <span>Health</span>
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* Node Details Panel */}
          {selectedNode && (
            <div className={styles.detailsPanel}>
              <div className={styles.detailsHeader}>
                <h3>Node Details</h3>
                <button onClick={() => setSelectedNode(null)}>✕</button>
              </div>
              <div className={styles.detailsContent}>
                <p><strong>ID:</strong> {selectedNode.id}</p>
                <p><strong>Class:</strong> {selectedNode.data.className}</p>
                <p><strong>Method:</strong> {selectedNode.data.methodName}</p>
                <p><strong>Position:</strong> ({Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)})</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
