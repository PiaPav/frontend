import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './GraphRawPreview.module.css';
import graphPreviewData from '../../data/graph-preview.json';
import buildRawGraphFromParser from '../../utils/buildRawGraphFromParser';

const MINI_COLORS = {
  file: '#2563eb',
  entity: '#0f766e',
  method: '#d97706',
  attribute: '#7c3aed',
  dependency: '#be123c',
};

export default function GraphRawPreview() {
  const navigate = useNavigate();
  const rawGraph = useMemo(() => buildRawGraphFromParser(graphPreviewData), []);
  const [selectedNode, setSelectedNode] = useState(null);

  const selectedNodeDetails = selectedNode ? rawGraph.detailsByNodeId[selectedNode.id] : null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>Raw graph.json dump</h1>
          <div className={styles.subtitle}>
            No adapter. No semantic reconstruction. Everything shown here comes directly from the attached file:
            files, entities, methods, attributes and literal dependency refs.
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => navigate('/graph-preview')}>
            Semantics Preview
          </button>
          <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => navigate('/')}>
            Close
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.canvas}>
          <ReactFlow
            nodes={rawGraph.nodes}
            edges={rawGraph.edges}
            onNodeClick={(event, node) => setSelectedNode(node)}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 0.85 }}
            minZoom={0.05}
            maxZoom={1.6}
            defaultViewport={{ x: 0, y: 0, zoom: 0.18 }}
            onlyRenderVisibleElements
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            panOnDrag
            panOnScroll
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#d7dee8" gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(node) => MINI_COLORS[node?.data?.meta?.kind] || '#94a3b8'}
              maskColor="rgba(15, 23, 42, 0.08)"
            />
          </ReactFlow>
        </section>

        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Counts</div>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{rawGraph.summary.files}</span>
                <span className={styles.statLabel}>Files</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{rawGraph.summary.entities}</span>
                <span className={styles.statLabel}>Entities</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{rawGraph.summary.methods}</span>
                <span className={styles.statLabel}>Methods</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{rawGraph.summary.attributes}</span>
                <span className={styles.statLabel}>Attrs</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{rawGraph.summary.dependencies}</span>
                <span className={styles.statLabel}>Dep Refs</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{rawGraph.summary.totalEdges}</span>
                <span className={styles.statLabel}>Edges</span>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>Legend</div>
            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: MINI_COLORS.file }} />
                File nodes
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: MINI_COLORS.entity }} />
                Entities and module scopes
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: MINI_COLORS.method }} />
                Methods
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: MINI_COLORS.attribute }} />
                Attributes
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: MINI_COLORS.dependency }} />
                Literal dependency refs from JSON
              </div>
            </div>
            <div className={styles.panelText}>
              Gray edges are containment. Red edges are dependency links exactly as recorded in the file.
            </div>
          </div>

          <div className={styles.details}>
            {selectedNodeDetails ? (
              <div className={styles.detailsCard}>
                <div className={styles.detailsTitle}>{selectedNodeDetails.title}</div>
                {selectedNodeDetails.lines.map((line) => (
                  <div key={line} className={styles.detailsLine}>
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.detailsCard}>
                <div className={styles.detailsTitle}>Selection</div>
                <div className={styles.empty}>Click any node to inspect its raw metadata.</div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
