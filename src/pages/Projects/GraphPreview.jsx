import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls, useNodesState } from 'reactflow';
import { SmartStepEdge } from '@tisoap/react-flow-smart-edge';
import 'reactflow/dist/style.css';
import styles from './ProjectAnalysis.module.css';
import graphPreviewData from '../../data/graph-preview.json';
import buildGraph from '../../utils/buildGraph';
import { layoutWithElk } from '../../utils/layoutWithElk';
import adaptParserGraphToCurrent from '../../utils/adaptParserGraphToCurrent';

const edgeTypes = {
  smart: SmartStepEdge,
};

const buildEdgeMap = (edges) => {
  const map = new Map();
  edges.forEach((edge) => {
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
};

export default function GraphPreview() {
  const navigate = useNavigate();
  const adapted = useMemo(() => adaptParserGraphToCurrent(graphPreviewData), []);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [baseEdges, setBaseEdges] = useState([]);
  const [highlightEdges, setHighlightEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [pinnedSourceId, setPinnedSourceId] = useState(null);
  const [hoverNodeId, setHoverNodeId] = useState(null);
  const [hoverEdgeId, setHoverEdgeId] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const renderGraph = async () => {
      setLoading(true);
      setRenderError('');

      try {
        const { nodes: builtNodes, edges: builtEdges } = buildGraph({
          requirements: adapted.requirements,
          endpoints: adapted.endpoints,
          architectureData: adapted.architectureData,
        });

        const { nodes: laidOutNodes, edges: laidOutEdges } = await layoutWithElk(builtNodes, builtEdges, 'RIGHT');
        if (cancelled) return;

        setNodes(laidOutNodes);
        setBaseEdges(laidOutEdges);
      } catch (error) {
        console.error('Preview graph render failed:', error);
        if (cancelled) return;
        setRenderError(error.message || 'Failed to render graph preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    renderGraph();

    return () => {
      cancelled = true;
    };
  }, [adapted, setNodes]);

  const adjacencyMap = useMemo(() => buildEdgeMap(baseEdges), [baseEdges]);
  const edgeById = useMemo(() => new Map(baseEdges.map((edge) => [edge.id, edge])), [baseEdges]);

  const buildHighlightEdges = useCallback(
    (edgesToHighlight, suffix) =>
      edgesToHighlight.map((edge, index) => ({
        ...edge,
        id: `hl-${edge.id}-${suffix}-${index}`,
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

      setHighlightEdges(buildHighlightEdges([...(entry.in || []), ...(entry.out || [])], nodeId));
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
    [buildHighlightEdges, edgeById]
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
  }, [activeNodeId, applyEdgeHighlight, applyNodeHighlight, hoverEdgeId]);

  const visibleEdges = useMemo(() => [...baseEdges, ...highlightEdges], [baseEdges, highlightEdges]);

  const laneNodes = useMemo(
    () =>
      nodes
        .filter((node) => node?.data?.meta?.kind === 'lane')
        .map((node) => {
          const className = node.data?.meta?.className;
          const sourceInfo = adapted.symbolSources[className] || { files: [], groups: [] };
          return {
            className,
            nodeId: node.id,
            files: sourceInfo.files,
            groups: sourceInfo.groups,
          };
        })
        .sort((left, right) => left.className.localeCompare(right.className)),
    [adapted.symbolSources, nodes]
  );

  const laneNodeByClass = useMemo(() => new Map(laneNodes.map((item) => [item.className, item])), [laneNodes]);

  const selectedNodeInfo = useMemo(() => {
    if (!selectedNode) return null;

    const meta = selectedNode.data?.meta || {};

    if (meta.kind === 'lane') {
      const sourceInfo = adapted.symbolSources[meta.className] || { files: [], groups: [] };
      return {
        title: meta.className,
        subtitle: sourceInfo.files[0] || 'No source file mapped',
        details: [
          `Layer: ${meta.layer}`,
          `Source files: ${sourceInfo.files.length}`,
          `Groups: ${sourceInfo.groups.join(', ') || 'n/a'}`,
        ],
      };
    }

    if (meta.kind === 'endpoint') {
      return {
        title: selectedNode.id,
        subtitle: `${meta.method || ''} ${meta.path || ''}`.trim(),
        details: ['Synthetic endpoint inferred from the new parser output'],
      };
    }

    return {
      title: selectedNode.id,
      subtitle: 'Graph node',
      details: [`Layer: ${meta.layer ?? 'n/a'}`],
    };
  }, [adapted.symbolSources, selectedNode]);

  const handleLaneSelect = useCallback(
    (className) => {
      const laneNode = laneNodeByClass.get(className);
      if (!laneNode) return;

      const targetNode = nodes.find((node) => node.id === laneNode.nodeId);
      if (!targetNode) return;

      setSelectedNode(targetNode);
      setPinnedSourceId(targetNode.id);
      setHoverEdgeId(null);
    },
    [laneNodeByClass, nodes]
  );

  const handleNodeMouseEnter = useCallback((event, node) => {
    setHoverNodeId(node.id);
    setHoverEdgeId(null);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoverNodeId(null);
  }, []);

  const handleNodeClick = useCallback((event, node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    setPinnedSourceId((prev) => (prev === node.id ? null : node.id));
    setHoverEdgeId(null);
  }, []);

  const handleEdgeMouseEnter = useCallback((event, edge) => {
    setHoverEdgeId(edge.id);
  }, []);

  const handleEdgeMouseLeave = useCallback(() => {
    setHoverEdgeId(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    setPinnedSourceId(null);
    setHoverNodeId(null);
    setHoverEdgeId(null);
  }, []);

  const nodesCount = nodes.length;
  const edgesCount = baseEdges.length;
  const endpointsCount = Object.keys(adapted.endpoints || {}).length;
  const visibleLaneCount = laneNodes.length;

  return (
    <div className={styles.container}>
      <div className={styles.graphHeader}>
        <div className={styles.graphHeaderLeft}>
          <h2 className={styles.graphTitle}>Attached graph.json preview</h2>
          <div className={styles.graphMeta}>
            Nodes: {nodesCount} | Edges: {edgesCount} | Endpoints: {endpointsCount} | Visible lanes: {visibleLaneCount}
          </div>
        </div>
        <div className={styles.graphActions}>
          <button className={styles.closeBtn} onClick={() => navigate('/')}>
            Close
          </button>
        </div>
      </div>

      <div className={styles.visualLayout}>
        <div className={styles.flowWrapper}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <p>Rendering the current main graph view on top of the new parser output...</p>
            </div>
          ) : renderError ? (
            <div className={styles.loadingState}>
              <p style={{ color: '#ef4444' }}>{renderError}</p>
            </div>
          ) : nodes.length > 0 ? (
            <ReactFlow
              nodes={nodes}
              edges={visibleEdges}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onNodeClick={handleNodeClick}
              onNodeMouseEnter={handleNodeMouseEnter}
              onNodeMouseLeave={handleNodeMouseLeave}
              onEdgeMouseEnter={handleEdgeMouseEnter}
              onEdgeMouseLeave={handleEdgeMouseLeave}
              onPaneClick={handlePaneClick}
              fitView
              fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ animated: false }}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              panOnDrag
              panOnScroll
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              preventScrolling
              nodeOrigin={[0.5, 0.5]}
              selectNodesOnDrag={false}
            >
              <Background color="#f0f0f0" gap={20} size={1} />
              <Controls className={styles.controls} />
            </ReactFlow>
          ) : (
            <div className={styles.loadingState}>
              <p>Graph is empty.</p>
            </div>
          )}
        </div>

        <aside
          className={`${styles.dependenciesPanel} ${sidebarCollapsed ? styles.dependenciesCollapsed : ''}`}
          aria-expanded={!sidebarCollapsed}
        >
          <div className={styles.dependenciesHeader}>
            <div className={styles.dependenciesHeaderText}>
              <div className={styles.dependenciesTitle}>Visible Lanes</div>
              <div className={styles.dependenciesSubtitle}>
                Derived from the same graph cards as the main project view
              </div>
            </div>
            <div className={styles.dependenciesHeaderActions}>
              <div className={styles.dependenciesBadge}>{visibleLaneCount}</div>
              <button
                type="button"
                className={styles.dependenciesToggle}
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? 'Expand lane list' : 'Collapse lane list'}
              >
                {sidebarCollapsed ? '>' : '<'}
              </button>
            </div>
          </div>

          {!sidebarCollapsed && (
            <div className={styles.dependenciesList}>
              {laneNodes.map((lane) => (
                <button
                  key={lane.className}
                  type="button"
                  className={styles.requirementItem}
                  onClick={() => handleLaneSelect(lane.className)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background:
                      pinnedSourceId === lane.nodeId
                        ? 'color-mix(in srgb, var(--primary) 12%, var(--graph-node-bg))'
                        : 'var(--graph-node-bg)',
                  }}
                >
                  <span className={styles.reqBullet} aria-hidden="true" />
                  <span className={styles.reqName}>
                    {lane.className}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>
                      {lane.files[0] || 'No file mapping'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {selectedNodeInfo && (
          <div className={styles.tooltip}>
            <button className={styles.tooltipClose} onClick={() => setSelectedNode(null)}>
              x
            </button>
            <h3>{selectedNodeInfo.title}</h3>
            <p>{selectedNodeInfo.subtitle}</p>
            {selectedNodeInfo.details.map((detail) => (
              <p key={detail}>
                <strong>{detail}</strong>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
