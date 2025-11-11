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
import styles from './ProjectViewStream.module.css';
import graphData from '../../data/graph42.json';

export default function ProjectViewStream() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architecture, setArchitecture] = useState([]);
  
  // tabs removed: we show requirements, endpoints and architecture side-by-side
  const [expandedClasses, setExpandedClasses] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  
  const [streamStatus, setStreamStatus] = useState('connecting'); // connecting, streaming, done
  const [progress, setProgress] = useState({ total: 0, current: 0 });

  // Load saved graph data sequentially (requirements -> endpoints -> architecture)
  useEffect(() => {
    let cancelled = false;
    const loadSequential = async () => {
      try {
        setStreamStatus('streaming');

        // 1) Requirements
        await new Promise((r) => setTimeout(r, 300));
        if (cancelled) return;
        setRequirements(graphData.requirements || []);
        setProgress({ total: (graphData.requirements?.length || 0) + (Object.keys(graphData.endpoints || {}).length) + (graphData.architecture?.length || 0), current: graphData.requirements?.length || 0 });

        // 2) Endpoints
        await new Promise((r) => setTimeout(r, 400));
        if (cancelled) return;
        setEndpoints(graphData.endpoints || {});

        // 3) Architecture - add parts one by one to emulate streaming
        const archParts = graphData.architecture || [];
        for (let i = 0; i < archParts.length; i++) {
          await new Promise((r) => setTimeout(r, 150));
          if (cancelled) return;
          setArchitecture((prev) => [...prev, archParts[i]]);
          setProgress((prev) => ({ ...prev, current: (prev.current || 0) + 1 }));
        }

        setStreamStatus('done');
      } catch (err) {
        console.error('Load error', err);
        setStreamStatus('error');
      }
    };

    loadSequential();

    return () => { cancelled = true; };
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

  // expand all classes by default when endpoints arrive
  useEffect(() => {
    const classes = Object.keys(endpointsByClass);
    if (classes.length > 0) {
      setExpandedClasses(new Set(classes));
    }
  }, [endpointsByClass]);

  // Построение графа из architecture с группировкой по классам
  useEffect(() => {
    if (architecture.length === 0) return;

    const newNodes = [];
    const newEdges = [];
    
    // Layout: слева направо (Requirements → Endpoints → Architecture)
    const COLUMN_WIDTH = 350;
    const ROW_HEIGHT = 80;
    const START_X = 50;
    const START_Y = 50;

    // Группировка по классам
    const classMethods = {};
    
    architecture.forEach((arch) => {
      const [className, methodName] = arch.parent.split('.');
      if (!classMethods[className]) {
        classMethods[className] = [];
      }
      classMethods[className].push({
        fullName: arch.parent,
        methodName: methodName || arch.parent,
        children: arch.children
      });
    });

    // Создание узлов классов с методами
    let currentY = START_Y;
    const nodeMap = new Map();

    Object.entries(classMethods).forEach(([className, methods]) => {
      const classNodeId = `class_${className}`;
      
      // Создаём узел класса (группа)
      const classNode = {
        id: classNodeId,
        type: 'default',
        position: { x: START_X + COLUMN_WIDTH * 2, y: currentY },
        data: { 
          label: (
            <div style={{ padding: '10px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
                {className}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>
                {methods.length} {methods.length === 1 ? 'method' : 'methods'}
              </div>
            </div>
          ),
          className: className,
        },
        style: {
          background: getNodeColor(className),
          color: 'white',
          border: '3px solid rgba(255,255,255,0.3)',
          borderRadius: '12px',
          padding: '8px',
          fontSize: '12px',
          fontWeight: '600',
          minWidth: '200px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        },
      };

      newNodes.push(classNode);
      nodeMap.set(classNodeId, classNode);

      // Создаём связи для всех методов класса
      methods.forEach((method) => {
        method.children.forEach((child) => {
          const childName = child.split('/').pop();
          const edgeId = `${classNodeId}-${child}`;
          
          newEdges.push({
            id: edgeId,
            source: classNodeId,
            target: child,
            type: 'smoothstep',
            animated: false, // Убрали анимацию
            style: { stroke: '#667eea', strokeWidth: 2, opacity: 0.6 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#667eea',
            },
            label: method.methodName,
            labelStyle: { fill: '#667eea', fontSize: 9, fontWeight: 600 },
          });

          // Создаём узел для child если его ещё нет
          if (!nodeMap.has(child)) {
            const childNode = {
              id: child,
              type: 'default',
              position: { x: START_X + COLUMN_WIDTH * 3, y: newNodes.length * 60 },
              data: { 
                label: child.split('/').pop(),
                fullPath: child,
              },
              style: {
                background: '#f7fafc',
                color: '#2d3748',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '11px',
                fontWeight: '500',
                minWidth: '120px',
              },
            };
            newNodes.push(childNode);
            nodeMap.set(child, childNode);
          }
        });
      });

      currentY += 120; // Spacing between classes
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [architecture]);

  // Цвета узлов в зависимости от типа класса
  const getNodeColor = (className) => {
    if (className.includes('Account')) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    if (className.includes('Auth')) return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
    if (className.includes('Project')) return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
    if (className.includes('Database') || className.includes('DataBase')) return 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
    if (className.includes('Core')) return 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)';
    if (className.includes('Task')) return 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)';
    if (className.includes('Frontend') || className.includes('Algorithm')) return 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)';
    if (className.includes('Consumer') || className.includes('Producer') || className.includes('Broker')) return 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)';
    if (className.includes('Storage') || className.includes('Object')) return 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)';
    if (className.includes('Service')) return 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)';
    return 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)';
  };

  // Обработка соединений (растягивание стрелок)
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: false }, eds)),
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
        {/* Left column: Requirements */}
        <aside className={styles.sidebar} style={{ width: 300 }}>
          <div className={styles.sidebarHeader}>
            <h3>📦 Requirements</h3>
          </div>
          <div className={styles.sidebarContent}>
            {requirements.length === 0 ? (
              <p className={styles.emptyState}>⏳ Waiting for requirements...</p>
            ) : (
              <div className={styles.requirementsList}>
                {requirements.map((req, i) => (
                  <div key={i} className={styles.requirementItem}>
                    <span className={styles.reqIcon}>📦</span>
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Middle column: Endpoints (vertical) */}
        <aside className={styles.sidebar} style={{ width: 360 }}>
          <div className={styles.sidebarHeader}>
            <h3>🌐 Endpoints</h3>
          </div>
          <div className={styles.sidebarContent}>
            {Object.keys(endpointsByClass).length === 0 ? (
              <p className={styles.emptyState}>⏳ Waiting for endpoints...</p>
            ) : (
              <div className={styles.endpointsList}>
                {Object.entries(endpointsByClass).map(([className, methods]) => (
                  <div key={className} className={styles.endpointClass}>
                    <div className={styles.classHeader} onClick={() => toggleClass(className)}>
                      <span className={styles.classIcon}>{expandedClasses.has(className) ? '▼' : '▶'}</span>
                      <span className={styles.className}>{className}</span>
                      <span className={styles.methodCount}>({methods.length})</span>
                    </div>

                    <div className={styles.methodsList}>
                      {methods.map((m, idx) => (
                        <div key={idx} className={styles.methodItem}>
                          <span className={styles.httpMethod}>{m.route.split(' ')[0]}</span>
                          <div className={styles.methodDetails}>
                            <span className={styles.routePath}>{m.route.split(' ')[1]}</span>
                            <span className={styles.methodName}>{m.method}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
                    <span>Auth</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}></div>
                    <span>Project</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}></div>
                    <span>Database</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}></div>
                    <span>Core</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' }}></div>
                    <span>Broker/Queue</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)' }}></div>
                    <span>Service</span>
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
