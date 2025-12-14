import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
} from 'reactflow';
import { SmartStepEdge } from '@tisoap/react-flow-smart-edge';
import 'reactflow/dist/style.css';
import styles from './ProjectAnalysis.module.css';
import { projectsAPI } from '../../services/api';
import grpcClient from '../../services/grpcClient';
import buildGraph from '../../utils/buildGraph';
import { layoutWithElk } from '../../utils/layoutWithElk';
import { useAuth } from '../../context/AuthContext';
import trashBinIcon from '../../assets/img/trash-bin.png';
import GraphHeader from './GraphHeader';

const METHOD_COLORS = {
  GET: { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669' },
  POST: { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb' },
  PATCH: { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#d97706' },
  PUT: { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed' },
  DELETE: { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#dc2626' },
};

const SERVICE_COLORS = {
  AuthService: { color: '#8b5cf6', icon: 'A', label: 'Auth' },
  AccountService: { color: '#3b82f6', icon: 'AC', label: 'Account' },
  ProjectService: { color: '#10b981', icon: 'P', label: 'Project' },
  CoreService: { color: '#f59e0b', icon: 'C', label: 'Core' },
};

const edgeTypes = {
  smart: SmartStepEdge,
};

export default function ProjectAnalysis() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [baseEdges, setBaseEdges] = useState([]);
  const [highlightEdges, setHighlightEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [pinnedSourceId, setPinnedSourceId] = useState(null);
  const [hoverNodeId, setHoverNodeId] = useState(null);
  const [hoverEdgeId, setHoverEdgeId] = useState(null);
  const [depsCollapsed, setDepsCollapsed] = useState(false);
  
  // ðöð░ð¢ð¢ÐïðÁ ð┐ÐÇð¥ðÁð║Ðéð░ Ðü ÐüðÁÐÇð▓ðÁÐÇð░
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architectureData, setArchitectureData] = useState([]);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [streamComplete, setStreamComplete] = useState(false);
  const [grpcStarted, setGrpcStarted] = useState(false);
  const streamControllerRef = useRef(null);
  const layoutRunIdRef = useRef(0);
  const architectureDataRef = useRef([]);

  // ðíð▒ÐÇð░ÐüÐïð▓ð░ðÁð╝ Ðüð¥ÐüÐéð¥ÐÅð¢ð©ðÁ ð┐ÐÇð© Ðüð╝ðÁð¢ðÁ id ð┐ÐÇð¥ðÁð║Ðéð░
  useEffect(() => {
    setProject(null);
    setRequirements([]);
    setEndpoints({});
    setArchitectureData([]);
    setNodes([]);
    setBaseEdges([]);
    setHighlightEdges([]);
    setStreamComplete(false);
    setGrpcStarted(false);
    setDeleteError('');
    setDeleting(false);
    setError(null);
    setIsFirstLoad(true);
    setSelectedNode(null);
    setPinnedSourceId(null);
    setHoverNodeId(null);
    setHoverEdgeId(null);
    setLoading(true);
    setDepsCollapsed(false);
  }, [id]);

  useEffect(() => {
    architectureDataRef.current = architectureData;
  }, [architectureData]);

  const adjacencyMap = useMemo(() => {
    const map = new Map();
    baseEdges.forEach((edge) => {
      if (!map.has(edge.source)) {
        map.set(edge.source, { in: [], out: [] });
      }
      if (!map.has(edge.target)) {
        map.set(edge.target, { in: [], out: [] });
      }
      map.get(edge.source).out.push(edge);
      map.get(edge.target).in.push(edge);
    });
    return map;
  }, [baseEdges]);

  const edgeById = useMemo(() => {
    const map = new Map();
    baseEdges.forEach((edge) => {
      map.set(edge.id, edge);
    });
    return map;
  }, [baseEdges]);

  const buildHighlightEdges = useCallback(
    (edgesToHighlight, suffix) =>
      edgesToHighlight.map((edge, idx) => ({
        ...edge,
        id: `hl-${edge.id}-${suffix}-${idx}`,
        className: styles.edgeRunningDash,
        animated: true,
        label: undefined,
        data: { ...edge.data, isHighlight: true },
        style: {
          ...(edge.style || {}),
          strokeDasharray: '6 6',
          strokeWidth: (edge.style?.strokeWidth || 2) + 0.4,
          pointerEvents: 'none',
        },
      })),
    []
  );

  const applyNodeHighlight = useCallback(
    (nodeId) => {
      if (!nodeId) {
        setHighlightEdges([]);
        return;
      }

      const entry = adjacencyMap.get(nodeId);
      if (!entry) {
        setHighlightEdges([]);
        return;
      }

      const overlays = buildHighlightEdges([...(entry.in || []), ...(entry.out || [])], nodeId);
      setHighlightEdges(overlays);
    },
    [adjacencyMap, buildHighlightEdges]
  );

  const applyEdgeHighlight = useCallback(
    (edgeId) => {
      if (!edgeId) {
        setHighlightEdges([]);
        return;
      }
      const edge = edgeById.get(edgeId);
      if (!edge) {
        setHighlightEdges([]);
        return;
      }
      setHighlightEdges(buildHighlightEdges([edge], edgeId));
    },
    [edgeById, buildHighlightEdges]
  );

  const activeNodeId = hoverNodeId || pinnedSourceId;

  useEffect(() => {
    if (hoverEdgeId) {
      applyEdgeHighlight(hoverEdgeId);
      return;
    }
    if (activeNodeId) {
      applyNodeHighlight(activeNodeId);
      return;
    }
    setHighlightEdges([]);
  }, [hoverEdgeId, activeNodeId, applyNodeHighlight, applyEdgeHighlight]);

  const visibleEdges = useMemo(() => [...baseEdges, ...highlightEdges], [baseEdges, highlightEdges]);
  const handleEdgesChange = useCallback(() => {}, []);
  const defaultEdgeOptions = useMemo(() => ({ animated: false }), []);
  const fitViewOptions = useMemo(() => ({ padding: 0.15, maxZoom: 0.9 }), []);
  const proOptions = useMemo(() => ({ hideAttribution: true }), []);
  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 0.6 }), []);

  // ðùð░ð│ÐÇÐâðÀð║ð░ ð┐ÐÇð¥ðÁð║Ðéð░ ÐçðÁÐÇðÁðÀ REST + gRPC stream
    // Load project data via REST first, then fall back to gRPC streaming
  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      try {
        if (isFirstLoad) {
          setLoading(true);
          setError(null);
        }

        const projectData = await projectsAPI.getById(id);
        if (cancelled) return;

        let archFromApi = projectData.architecture;
        if (typeof archFromApi === 'string') {
          try {
            archFromApi = JSON.parse(archFromApi);
          } catch (parseError) {
            console.warn('[ui] Failed to parse architecture from API response', parseError);
            archFromApi = null;
          }
        }

        if (archFromApi && typeof archFromApi === 'object') {
          const requirementsList = Array.isArray(archFromApi.requirements) ? archFromApi.requirements : [];

          let endpointsObj = {};
          if (archFromApi.endpoints) {
            if (Array.isArray(archFromApi.endpoints)) {
              archFromApi.endpoints.forEach((endpoint) => {
                Object.entries(endpoint).forEach(([key, value]) => {
                  endpointsObj[key] = value;
                });
              });
            } else if (typeof archFromApi.endpoints === 'object') {
              endpointsObj = archFromApi.endpoints;
            }
          }

          const dataObj = archFromApi.data && typeof archFromApi.data === 'object' ? archFromApi.data : {};

          const hasArchitectureFromApi =
            requirementsList.length > 0 || Object.keys(endpointsObj).length > 0 || Object.keys(dataObj).length > 0;

          setProject({
            ...projectData,
            architecture: {
              ...archFromApi,
              requirements: requirementsList,
              endpoints: endpointsObj,
              data: dataObj,
            },
          });

          if (hasArchitectureFromApi) {
            setRequirements(requirementsList);
            setEndpoints(endpointsObj);

            const archArray = Object.entries(dataObj).map(([parent, children]) => ({
              parent,
              children: Array.isArray(children) ? children : [],
            }));
            architectureDataRef.current = archArray;
            setArchitectureData(archArray);
            setStreamComplete(true);
            setLoading(false);
            setIsFirstLoad(false);
            return;
          }
        } else {
          setProject(projectData);
        }

        setLoading(false);
        setIsFirstLoad(false);

        if (grpcStarted || streamControllerRef.current) {
          return;
        }

        setGrpcStarted(true);

        if (!user || !user.id) {
          setError('Authentication required. Please re-login.');
          setGrpcStarted(false);
          return;
        }

        const controller = await grpcClient.connectToStream(user.id, parseInt(id, 10), {
          onStart: () => {
            console.log('Stream started');
          },

          onRequirements: (data) => {
            setRequirements(data.requirements);
          },

          onEndpoints: (data) => {
            setEndpoints(data.endpoints);
          },

          onArchitecture: (data) => {
            architectureDataRef.current = [
              ...architectureDataRef.current,
              { parent: data.parent, children: data.children },
            ];
          },

          onDone: async () => {
            setArchitectureData([...architectureDataRef.current]);
            setStreamComplete(true);
            setGrpcStarted(false);
            streamControllerRef.current = null;
          },

          onError: (error) => {
            streamControllerRef.current = null;
            setGrpcStarted(false);
            const errorMessage = error.message || '?????? ????????? ?????? ???????????';

            setArchitectureData([...architectureDataRef.current]);
            setStreamComplete(true);

            if (errorMessage.includes('500') && project?.architecture?.data) {
              setError(null);
              return;
            }

            if (errorMessage.includes('404')) {
              setError('?????? ??????? ?????????? (404).');
            } else if (errorMessage.includes('502') || errorMessage.includes('503')) {
              setError('?????? ??????? ???????? ?????????? (502/503).');
            } else if (errorMessage.includes('Failed to fetch')) {
              setError('?? ??????? ???????????? ? ??????? ???????.');
            } else {
              setError(`??????: ${errorMessage}`);
            }
          },
        });

        streamControllerRef.current = controller;
      } catch (err) {
        if (cancelled) return;
        console.error('?????? ???????? ???????:', err);

        if (err.response?.status === 401) {
          navigate('/login');
        } else {
          setError(err.response?.data?.detail || err.message || '?? ??????? ????????? ??????');
        }

        if (isFirstLoad) {
          setLoading(false);
          setIsFirstLoad(false);
        }
      }
    };

    loadProject();

    return () => {
      cancelled = true;
      setGrpcStarted(false);
      if (streamControllerRef.current) {
        streamControllerRef.current.abort?.();
        streamControllerRef.current.cancel?.();
        streamControllerRef.current = null;
      }
    };
  }, [id, user, grpcStarted, isFirstLoad, navigate]);

  const handleDeleteProject = async () => {
    if (!id || deleting) return;

    const confirmed = window.confirm('ðúð┤ð░ð╗ð©ÐéÐî ð┐ÐÇð¥ðÁð║Ðé? ð¡Ðéð¥ ð┤ðÁð╣ÐüÐéð▓ð©ðÁ ð¢ðÁð╗ÐîðÀÐÅ ð¥Ðéð╝ðÁð¢ð©ÐéÐî.');
    if (!confirmed) return;

    try {
      setDeleting(true);
      setDeleteError('');
      await projectsAPI.delete(id);
      navigate('/projects');
    } catch (err) {
      console.error('ð×Ðêð©ð▒ð║ð░ ð┐ÐÇð© Ðâð┤ð░ð╗ðÁð¢ð©ð© ð┐ÐÇð¥ðÁð║Ðéð░:', err);
      const status = err.response?.status;
      const backendMessage = err.response?.data?.message || err.response?.data?.detail;

      if (status === 404) {
        setDeleteError('ðƒÐÇð¥ðÁð║Ðé ð¢ðÁ ð¢ð░ð╣ð┤ðÁð¢ ð©ð╗ð© ð¢ðÁÐé ð┐ÐÇð░ð▓ ð┤ð¥ÐüÐéÐâð┐ð░.');
      } else if (status === 401) {
        setDeleteError('ðØðÁð▓ðÁÐÇð¢Ðïð╣ Ðéð¥ð║ðÁð¢. ðÆð¥ð╣ð┤ð©ÐéðÁ ðÀð░ð¢ð¥ð▓ð¥.');
        logout?.();
        navigate('/login');
      } else {
        setDeleteError(backendMessage || 'ðØðÁ Ðâð┤ð░ð╗ð¥ÐüÐî Ðâð┤ð░ð╗ð©ÐéÐî ð┐ÐÇð¥ðÁð║Ðé. ðƒð¥ð┐ÐÇð¥ð▒Ðâð╣ÐéðÁ ð┐ð¥ðÀðÂðÁ.');
      }
    } finally {
      setDeleting(false);
    }
  };

  // ðƒð¥ÐüÐéÐÇð¥ðÁð¢ð©ðÁ ð│ÐÇð░Ðäð░ Ðü ðÁð┤ð©ð¢ð¥ð╣ ÐüÐàðÁð╝ð¥ð╣ (ð║ð░ð║ ð┐ÐÇð© Ðüð¥ðÀð┤ð░ð¢ð©ð© ð┐ÐÇð¥ðÁð║Ðéð░)
    const runLayout = useCallback(
    async (builtNodes, builtEdges) => {
      const runId = ++layoutRunIdRef.current;
      try {
        const { nodes: layoutNodes, edges: layoutEdges } = await layoutWithElk(builtNodes, builtEdges, 'RIGHT');
        if (layoutRunIdRef.current !== runId) return;
        setNodes(layoutNodes);
        setBaseEdges(layoutEdges);
      } catch (err) {
        console.error('ELK layout error:', err);
        if (layoutRunIdRef.current !== runId) return;
        setNodes(builtNodes);
        setBaseEdges(builtEdges);
      } finally {
        if (isFirstLoad && builtNodes.length > 0 && layoutRunIdRef.current === runId) {
          setIsFirstLoad(false);
        }
      }
    },
    [isFirstLoad, setNodes]
  );

  // Build graph once data is ready (initial load or after stream)
  useEffect(() => {
    if (!streamComplete) return;
    if (architectureData.length === 0 && Object.keys(endpoints || {}).length === 0 && requirements.length === 0) return;

    const { nodes: builtNodes, edges: builtEdges, summary } = buildGraph({
      requirements,
      endpoints,
      architectureData,
      methodColors: METHOD_COLORS,
      serviceColors: SERVICE_COLORS,
    });

    console.log('Graph built (before layout):', summary);
    runLayout(builtNodes, builtEdges);
  }, [streamComplete, requirements, endpoints, architectureData, runLayout]);

  const onNodeMouseEnter = useCallback((event, node) => {
    setHoverNodeId(node.id);
    setHoverEdgeId(null);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoverNodeId(null);
  }, []);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    setPinnedSourceId((prev) => (prev === node.id ? null : node.id));
    setHoverEdgeId(null);
  }, []);

  const onEdgeMouseEnter = useCallback((event, edge) => {
    setHoverEdgeId(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoverEdgeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setPinnedSourceId(null);
    setHoverNodeId(null);
    setHoverEdgeId(null);
  }, []);

  const nodesCount = nodes.length;
  const edgesCount = baseEdges.length;
  const requirementsCount = requirements.length;
  const endpointsCount = Object.keys(endpoints || {}).length;

  const dependenciesSubtitle = useMemo(() => {
    if (requirementsCount > 0) {
      return `${requirementsCount} package${requirementsCount === 1 ? '' : 's'}`;
    }
    if (!streamComplete) {
      return 'Waiting for stream...';
    }
    return 'No dependencies found';
  }, [requirementsCount, streamComplete]);

  // ð×Ðéð¥ð▒ÐÇð░ðÂðÁð¢ð©ðÁ ÐüÐéð░ÐéÐâÐüð░ ðÀð░ð│ÐÇÐâðÀð║ð© ð©ð╗ð© ð¥Ðêð©ð▒ð║ð©
  if (loading) {
    return (
      <div className={styles.container}>
        <GraphHeader
          title="Project Architecture"
          nodesCount={nodesCount}
          edgesCount={edgesCount}
          requirementsCount={requirementsCount}
          endpointsCount={endpointsCount}
          onClose={() => navigate('/projects')}
          closeLabel="Close"
        />
        <div className={styles.flowWrapper}>
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner} />
            <p>ðùð░ð│ÐÇÐâðÀð║ð░ ð┐ÐÇð¥ðÁð║Ðéð░...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <GraphHeader
          title="Project Architecture"
          nodesCount={nodesCount}
          edgesCount={edgesCount}
          requirementsCount={requirementsCount}
          endpointsCount={endpointsCount}
          onClose={() => navigate('/projects')}
          closeLabel="Close"
        />
        <div className={styles.flowWrapper}>
          <div className={styles.loadingState}>
            <p style={{ color: '#ef4444' }}>ÔÜá´©Å {error}</p>
            <button 
              onClick={() => window.location.reload()} 
              style={{ 
                marginTop: '20px', 
                padding: '10px 20px', 
                background: '#3b82f6', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              ðƒð¥ð┐ÐÇð¥ð▒ð¥ð▓ð░ÐéÐî Ðüð¢ð¥ð▓ð░
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ðƒÐÇð¥ð▓ðÁÐÇð║ð░ ð¢ð░ð╗ð©Ðçð©ÐÅ ð┤ð░ð¢ð¢ÐïÐà ð░ÐÇÐàð©ÐéðÁð║ÐéÐâÐÇÐï
  const hasArchitectureData = project?.architecture && (
    (project.architecture.requirements && project.architecture.requirements.length > 0) ||
    (project.architecture.endpoints && Object.keys(project.architecture.endpoints).length > 0) ||
    (project.architecture.data && Object.keys(project.architecture.data).length > 0)
  );

  if (!loading && !hasArchitectureData) {
    return (
      <div className={styles.container}>
        <GraphHeader
          title="Project Architecture"
          nodesCount={nodesCount}
          edgesCount={edgesCount}
          requirementsCount={requirementsCount}
          endpointsCount={endpointsCount}
          onClose={() => navigate('/projects')}
          closeLabel="Close"
          onDelete={handleDeleteProject}
          deleteLabel={deleting ? 'Deleting...' : 'Delete project'}
          deleteIcon={trashBinIcon}
          deleting={deleting}
        />
        {deleteError && (
          <div className={styles.errorBanner}>{deleteError}</div>
        )}
        <div className={styles.flowWrapper}>
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner}></div>
            <h2>ð×Ðéð║ÐÇÐïð▓ð░ðÁð╝ ð┐ÐÇð¥ðÁð║Ðé...</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '30px', maxWidth: '400px', textAlign: 'center' }}>
              ðƒð¥ð┤ð│ð¥Ðéð░ð▓ð╗ð©ð▓ð░ðÁð╝ Ðüð¥ÐàÐÇð░ð¢Ðæð¢ð¢ÐâÐÄ ð▓ð©ðÀÐâð░ð╗ð©ðÀð░Ðåð©ÐÄ. ð¡Ðéð¥ ðÀð░ð╣ð╝ÐæÐé ð¢ðÁÐüð║ð¥ð╗Ðîð║ð¥ ÐüðÁð║Ðâð¢ð┤.
            </p>
            <div className={styles.progressBar} style={{ width: '400px', height: '8px', background: 'rgba(90, 111, 214, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div 
                className={styles.progressFill}
                style={{ 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #5A6FD6 0%, #6B8FE8 100%)', 
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                  width: '30%'
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <GraphHeader
        title="Project Architecture"
        nodesCount={nodesCount}
        edgesCount={edgesCount}
        requirementsCount={requirementsCount}
        endpointsCount={endpointsCount}
        onClose={() => navigate('/projects')}
        closeLabel="Close"
        onDelete={handleDeleteProject}
        deleteLabel={deleting ? 'Deleting...' : 'Delete project'}
        deleteIcon={trashBinIcon}
        deleting={deleting}
      />

      {deleteError && (
        <div className={styles.errorBanner}>{deleteError}</div>
      )}

      <div className={styles.visualLayout}>
        {/* Graph */}
        <div className={styles.flowWrapper}>
          {nodes.length > 0 ? (
            <ReactFlow
              nodes={nodes}
              edges={visibleEdges}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={handleEdgesChange}
              onNodeClick={onNodeClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              onPaneClick={onPaneClick}
              fitView={isFirstLoad}
              fitViewOptions={fitViewOptions}
              minZoom={0.1}
              maxZoom={2}
              defaultViewport={defaultViewport}
              proOptions={proOptions}
              defaultEdgeOptions={defaultEdgeOptions}
              onlyRenderVisibleElements
              nodesDraggable={true}
              nodesConnectable={false}
              elementsSelectable={true}
              panOnDrag={true}
              panOnScroll={true}
              zoomOnScroll={true}
              zoomOnPinch={true}
              zoomOnDoubleClick={false}
              selectionOnDrag={false}
              panActivationKeyCode={null}
              preventScrolling={true}
              attributionPosition="bottom-right"
              nodeOrigin={[0.5, 0.5]}
              selectNodesOnDrag={false}
            >
              <Background color="#f0f0f0" gap={20} size={1} />
              <Controls className={styles.controls} />
            </ReactFlow>
          ) : (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <p>ðƒð¥ÐüÐéÐÇð¥ðÁð¢ð©ðÁ ð│ÐÇð░Ðäð░ ð░ÐÇÐàð©ÐéðÁð║ÐéÐâÐÇÐï...</p>
            </div>
          )}
        </div>

        {/* Dependencies Sidebar */}
              <aside
                className={`${styles.dependenciesPanel} ${depsCollapsed ? styles.dependenciesCollapsed : ''}`}
                aria-expanded={!depsCollapsed}
              >
                <div className={styles.dependenciesHeader}>
                  <div className={styles.dependenciesHeaderText}>
                    <div className={styles.dependenciesTitle}>Dependencies</div>
                    <div className={styles.dependenciesSubtitle}>{dependenciesSubtitle}</div>
                  </div>
                  <div className={styles.dependenciesHeaderActions}>
                    <div className={styles.dependenciesBadge}>{requirementsCount}</div>
                    <button
                      type="button"
                      className={styles.dependenciesToggle}
                      onClick={() => setDepsCollapsed((prev) => !prev)}
                      aria-label={depsCollapsed ? 'Expand dependencies' : 'Collapse dependencies'}
                    >
                      {depsCollapsed ? '❯' : '❮'}
                    </button>
                  </div>
                </div>
          {!depsCollapsed && (
            <div className={styles.dependenciesList}>
              {requirementsCount > 0 ? (
                requirements.map((req, idx) => (
                  <div key={`${req}-${idx}`} className={styles.requirementItem}>
                    <span className={styles.reqBullet} aria-hidden="true" />
                    <span className={styles.reqName}>{req}</span>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>Dependencies will appear once received.</div>
              )}
            </div>
          )}
        </aside>

        {/* Node Details Tooltip */}
        {selectedNode && (
          <div className={styles.tooltip}>
            <button className={styles.tooltipClose} onClick={() => setSelectedNode(null)}>
              ├ù
            </button>
            <h3>{selectedNode.data.label}</h3>
            <p><strong>ID:</strong> {selectedNode.id}</p>
          </div>
        )}
      </div>
    </div>
  );
}
