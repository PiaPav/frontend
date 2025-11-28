import { useState, useEffect, useCallback, useMemo, memo } from 'react';
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
import styles from './ProjectViewArchitecture.module.css';
import { projectsAPI } from '../../services/api';
import { getGRPCClient } from '../../services/grpcClient';

// Memoized node content component for better performance
const NodeContent = memo(({ serviceName, methodCount }) => (
  <div className={styles.nodeContent}>
    <div className={styles.nodeName}>{serviceName}</div>
    <div className={styles.nodeInfo}>
      {methodCount} method{methodCount !== 1 ? 's' : ''}
    </div>
  </div>
));

NodeContent.displayName = 'NodeContent';

export default function ProjectViewArchitecture() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architecture, setArchitecture] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  
  const [streamStatus, setStreamStatus] = useState('connecting');
  const [progress, setProgress] = useState({ total: 0, current: 0 });

  // Load project data from backend
  useEffect(() => {
    let cancelled = false;

    const fetchProject = async () => {
      try {
        setStreamStatus('loading');

        if (!id) {
          setStreamStatus('error');
          console.error('No project ID provided');
          return;
        }

        // GET /v1/project/{id}
        const res = await projectsAPI.getById(id);
        // API shape: { id, name, description, picture_url, architecture }
        const arch = res.architecture || {};

        console.log('🔍 Full response:', res);
        console.log('🏗️ Architecture object:', arch);
        console.log('📊 Architecture.data:', arch.data);

        const reqs = arch.requirements || [];
        const eps = arch.endpoints || {};
        const archParts = arch.data || arch.architecture || arch.parts || [];
        
        console.log('📦 Requirements:', reqs);
        console.log('🌐 Endpoints:', eps);
        console.log('🔗 Architecture parts:', archParts);

        setProgress({ total: reqs.length + Object.keys(eps).length + archParts.length, current: 0 });

        // 1) Requirements
        setRequirements(reqs);
        setProgress((p) => ({ ...p, current: (p.current || 0) + reqs.length }));

        // 2) Endpoints
        setEndpoints(eps);

        // 3) Architecture - insert parts sequentially to preserve animation
        for (let i = 0; i < archParts.length; i++) {
          if (cancelled) return;
          // small delay to mimic streaming
          await new Promise((r) => setTimeout(r, 80));
          setArchitecture((prev) => [...prev, archParts[i]]);
          setProgress((prev) => ({ ...prev, current: (prev.current || 0) + 1 }));
        }

        setStreamStatus('done');

        // Optional: If you want to stream incremental updates from backend via gRPC,
        // you can uncomment the code below (requires grpc-web setup and generated stubs):
        // const grpc = getGRPCClient();
        // grpc.connectToStream(userId, Number(id), {
        //   onRequirements: (r) => setRequirements(r.requirements || r),
        //   onEndpoints: (e) => setEndpoints(e.endpoints || e),
        //   onArchitecture: (part) => setArchitecture((prev) => [...prev, part]),
        //   onDone: () => setStreamStatus('done'),
        //   onError: () => setStreamStatus('error')
        // });

      } catch (err) {
        console.error('Project load error', err);
        setStreamStatus('error');
      }
    };

    fetchProject();

    return () => { cancelled = true; };
  }, [id]);

  // Group endpoints by service/class
  const endpointsByService = useMemo(() => {
    const grouped = {};
    Object.entries(endpoints).forEach(([route, handler]) => {
      // Parse handler: "file/ClassName.method_name" or just "ClassName.method_name"
      const parts = handler.split('/');
      const lastPart = parts[parts.length - 1];
      const className = lastPart.split('.')[0];
      
      // Skip Health endpoints, main, and database-related
      if (className === 'Health' || 
          className === 'main' || 
          className === 'DataManager' || 
          className === 'DatabaseManager' ||
          lastPart.includes('database')) {
        return;
      }
      
      if (!className) return;
      if (!grouped[className]) {
        grouped[className] = [];
      }
      grouped[className].push({ route, handler });
    });
    return grouped;
  }, [endpoints]);

  // Build graph from architecture data
  useEffect(() => {
    if (architecture.length === 0) return;

    const newNodes = [];
    const newEdges = [];
    const nodeMap = new Map();
    
    // Layout configuration
    const LAYER_WIDTH = 450; // Increased for better horizontal spacing
    const NODE_HEIGHT = 100;
    const VERTICAL_SPACING = 120; // Increased spacing between nodes vertically for better margin
    const START_X = 100;
    const START_Y = 100;

    // Group architecture by service classes
    const serviceMap = new Map();
    
    console.log('🏗️ Building graph from architecture:', architecture);
    
    architecture.forEach((arch) => {
      console.log('📍 Processing architecture item:', arch);
      
      // Parse parent: "file/ClassName.method_name" or just "ClassName.method_name"
      const parts = arch.parent.split('/');
      const lastPart = parts[parts.length - 1];
      const [className, methodName] = lastPart.split('.');
      
      console.log(`   Parent: ${arch.parent} → Class: ${className}, Method: ${methodName}`);
      
      // Skip specific classes
      if (className === 'Health' || 
          className === 'main' || 
          className === 'DataManager' || 
          className === 'DatabaseManager' ||
          lastPart.includes('_main_') ||
          lastPart.includes('database')) {
        console.log(`   ❌ Skipped: ${className}`);
        return;
      }
      
      if (!className) {
        console.log('   ❌ No className');
        return;
      }
      
      console.log(`   ✅ Added to service: ${className}`);
      
      if (!serviceMap.has(className)) {
        serviceMap.set(className, {
          methods: [],
          dependencies: new Set()
        });
      }
      
      const service = serviceMap.get(className);
      service.methods.push({ method: methodName || lastPart, children: arch.children });
      
      // Track dependencies
      arch.children.forEach(child => {
        const childParts = child.split('/');
        const childLastPart = childParts[childParts.length - 1];
        const depClass = childLastPart.split('.')[0];
        
        // Skip database and main dependencies
        if (depClass && depClass !== className && 
            depClass !== 'DataManager' && 
            depClass !== 'DatabaseManager' &&
            depClass !== 'main' &&
            !childLastPart.includes('database')) {
          service.dependencies.add(depClass);
          console.log(`      → Dependency: ${depClass}`);
        }
      });
    });
    
    console.log('📊 Final serviceMap:', Array.from(serviceMap.entries()));

    // Determine layers for left-to-right layout
    const layers = new Map();
    const assignLayer = (serviceName, layer = 0) => {
      if (layers.has(serviceName)) return;
      layers.set(serviceName, layer);
      
      const service = serviceMap.get(serviceName);
      if (service && service.dependencies.size > 0) {
        service.dependencies.forEach(dep => {
          if (serviceMap.has(dep)) {
            assignLayer(dep, layer + 1);
          }
        });
      }
    };

    // Assign layers
    serviceMap.forEach((_, serviceName) => assignLayer(serviceName));

    // Sort services by layer
    const layerGroups = new Map();
    layers.forEach((layer, serviceName) => {
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer).push(serviceName);
    });

    // Create nodes for each service
    let nodeId = 0;
    layerGroups.forEach((services, layer) => {
      services.forEach((serviceName, index) => {
        const service = serviceMap.get(serviceName);
        const x = START_X + layer * LAYER_WIDTH;
        const y = START_Y + index * (NODE_HEIGHT + VERTICAL_SPACING);
        
        const nodeIdStr = `service_${serviceName}`;
        
        const node = {
          id: nodeIdStr,
          type: 'default',
          position: { x, y },
          data: { 
            label: (
              <NodeContent 
                serviceName={serviceName} 
                methodCount={service.methods.length}
              />
            ),
            serviceName,
            methodCount: service.methods.length,
          },
          style: {
            background: getServiceColor(serviceName),
            border: 'none',
            borderRadius: '12px',
            padding: '16px 20px',
            minWidth: '240px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          },
        };

        newNodes.push(node);
        nodeMap.set(serviceName, nodeIdStr);
        nodeId++;
      });
    });

    // Create edges between services
    const edgeSet = new Set();
    serviceMap.forEach((service, sourceName) => {
      const sourceId = nodeMap.get(sourceName);
      if (!sourceId) return;
      
      service.dependencies.forEach(targetName => {
        const targetId = nodeMap.get(targetName);
        if (!targetId) return;
        
        const edgeKey = `${sourceId}-${targetId}`;
        if (edgeSet.has(edgeKey)) return;
        edgeSet.add(edgeKey);
        
        newEdges.push({
          id: edgeKey,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          animated: false,
          className: 'custom-edge',
          pathOptions: { offset: 20, borderRadius: 10 },
          style: { 
            stroke: '#A0A0A0', 
            strokeWidth: 2,
            strokeOpacity: 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#A0A0A0',
            width: 20,
            height: 20,
          },
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [architecture]);

  // Update edge styles based on hovered node
  const styledEdges = useMemo(() => {
    if (!hoveredNode || edges.length === 0) return edges;

    return edges.map(edge => {
      const isConnected = edge.source === hoveredNode || edge.target === hoveredNode;
      return {
        ...edge,
        animated: isConnected,
        style: {
          stroke: isConnected ? '#5A6FD6' : '#A0A0A0',
          strokeWidth: isConnected ? 3 : 2,
          strokeOpacity: isConnected ? 1 : 0.3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConnected ? '#5A6FD6' : '#A0A0A0',
          width: 20,
          height: 20,
        },
      };
    });
  }, [edges, hoveredNode]);

  // Service colors inspired by the design
  const getServiceColor = (serviceName) => {
    const colors = {
      'Account': 'linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%)',
      'Project': 'linear-gradient(135deg, #6B8FE8 0%, #5A7FD8 100%)',
      'DatabaseManager': 'linear-gradient(135deg, #7BA3F2 0%, #6B93E2 100%)',
      'Core': 'linear-gradient(135deg, #8BB7FC 0%, #7BA7EC 100%)',
    };
    
    return colors[serviceName] || 'linear-gradient(135deg, #F4F6FF 0%, #E4E6EF 100%)';
  };

  // Handle node click
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Handle node hover for edge highlighting
  const onNodeMouseEnter = useCallback((event, node) => {
    setHoveredNode(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Назад к проектам
        </button>
        <div className={styles.projectInfo}>
          <h1>Project #{id} - Architecture Visualization</h1>
          <div className={styles.statusBadge}>
            {streamStatus === 'streaming' && '🔄 Receiving data...'}
            {streamStatus === 'done' && '✅ Complete'}
            {streamStatus === 'connecting' && '⏳ Connecting...'}
          </div>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
            </span>
            <span className={styles.statLabel}>Progress</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{nodes.length}</span>
            <span className={styles.statLabel}>Services</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{edges.length}</span>
            <span className={styles.statLabel}>Connections</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.content}>
        {/* Requirements Panel */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3>📦 Requirements</h3>
          </div>
          <div className={styles.sidebarContent}>
            {requirements.length === 0 ? (
              <p className={styles.emptyState}>⏳ Loading requirements...</p>
            ) : (
              <div className={styles.requirementsList}>
                {requirements.map((req, i) => (
                  <div key={i} className={styles.requirementItem}>
                    <span className={styles.reqIcon}>📦</span>
                    <span className={styles.reqName}>{req}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Graph Visualization */}
        <main className={styles.mainContent}>
          <div className={styles.flowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              fitView
              fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              elementsSelectable={true}
              nodesConnectable={false}
              nodesDraggable={true}
              zoomOnScroll={true}
              panOnScroll={false}
              preventScrolling={true}
              zoomOnDoubleClick={false}
              selectNodesOnDrag={false}
              connectionLineType="smoothstep"
              defaultEdgeOptions={{
                type: 'smoothstep',
                pathOptions: { offset: 20, borderRadius: 10 }
              }}
            >
              <Background color="#E0E0E0" gap={20} size={1} />
              <Controls className={styles.controls} />
              <MiniMap
                nodeColor={(node) => {
                  const serviceName = node.data?.serviceName || '';
                  if (serviceName.includes('Account')) return '#5A6FD6';
                  if (serviceName.includes('Project')) return '#6B8FE8';
                  if (serviceName.includes('Database')) return '#7BA3F2';
                  if (serviceName.includes('Core')) return '#8BB7FC';
                  return '#D0D4F0';
                }}
                className={styles.minimap}
              />
              
              {/* Legend Panel */}
              <Panel position="top-right" className={styles.legendPanel}>
                <div className={styles.legend}>
                  <h4>Legend</h4>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#5A6FD6' }}></div>
                    <span>Account</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#6B8FE8' }}></div>
                    <span>Project</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#7BA3F2' }}></div>
                    <span>Database</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ background: '#8BB7FC' }}></div>
                    <span>Core</span>
                  </div>
                </div>
              </Panel>

              {/* Endpoints Panel */}
              <Panel position="bottom-left" className={styles.endpointsPanel}>
                <div className={styles.endpoints}>
                  <h4>🌐 API Endpoints</h4>
                  {Object.keys(endpointsByService).length === 0 ? (
                    <p className={styles.emptyState}>⏳ Loading endpoints...</p>
                  ) : (
                    <div className={styles.endpointsList}>
                      {Object.entries(endpointsByService).map(([serviceName, eps]) => (
                        <div key={serviceName} className={styles.endpointGroup}>
                          <div className={styles.endpointServiceName}>{serviceName}</div>
                          {eps.slice(0, 3).map((ep, idx) => {
                            const [method, path] = ep.route.split(' ');
                            return (
                              <div key={idx} className={styles.endpointItem}>
                                <span className={`${styles.httpMethod} ${styles[method?.toLowerCase()]}`}>
                                  {method}
                                </span>
                                <span className={styles.endpointPath}>{path}</span>
                              </div>
                            );
                          })}
                          {eps.length > 3 && (
                            <div className={styles.endpointMore}>
                              +{eps.length - 3} more
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            </ReactFlow>
          </div>
        </main>
      </div>

      {/* Node Details Modal */}
      {selectedNode && (
        <div className={styles.detailsModal} onClick={() => setSelectedNode(null)}>
          <div className={styles.detailsContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailsHeader}>
              <h3>{selectedNode.data.serviceName}</h3>
              <button onClick={() => setSelectedNode(null)}>✕</button>
            </div>
            <div className={styles.detailsBody}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Service:</span>
                <span className={styles.detailValue}>{selectedNode.data.serviceName}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Methods:</span>
                <span className={styles.detailValue}>{selectedNode.data.methodCount}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Dependencies:</span>
                <span className={styles.detailValue}>
                  {edges.filter(e => e.source === selectedNode.id).length}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Used by:</span>
                <span className={styles.detailValue}>
                  {edges.filter(e => e.target === selectedNode.id).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
