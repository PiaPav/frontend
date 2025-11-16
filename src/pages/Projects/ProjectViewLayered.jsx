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
import styles from './ProjectViewLayered.module.css';
import graphData from '../../data/graph42.json';

export default function ProjectViewLayered() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  // Build layered architecture graph from data
  useEffect(() => {
    const newNodes = [];
    const newEdges = [];

    // Layer configuration (left to right)
    const LAYER_GAP = 280;
    const NODE_HEIGHT = 100;
    const START_X = 100;
    const START_Y = 80;

    // Layer 1: Main Service
    newNodes.push({
      id: 'main-service',
      type: 'default',
      position: { x: START_X, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.nodeLabel}>
            <div className={styles.nodeTitle}>Main Service</div>
          </div>
        ),
        layer: 'main',
      },
      style: {
        background: 'linear-gradient(135deg, #5A6FD6 0%, #4A5FC6 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        padding: '20px 24px',
        width: 180,
        fontWeight: 'bold',
        fontSize: '16px',
        boxShadow: '0 4px 12px rgba(90, 111, 214, 0.3)',
      },
    });

    // Layer 2: API Endpoints (hexagons via CSS)
    const endpoints = [
      { id: 'ep-account', label: 'GET\n/account', y: START_Y },
      { id: 'ep-projects-get', label: 'GET\n/projects', y: START_Y + 140 },
      { id: 'ep-projects-post', label: 'POST\n/projects', y: START_Y + 280 },
      { id: 'ep-projects-db', label: 'Projects\nDB', y: START_Y + 420 },
    ];

    endpoints.forEach((ep) => {
      newNodes.push({
        id: ep.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP, y: ep.y },
        data: {
          label: (
            <div className={styles.endpointLabel}>
              {ep.label.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ),
          layer: 'endpoints',
        },
        style: {
          background: 'linear-gradient(135deg, #A8C5F0 0%, #8AABDE 100%)',
          color: '#1a365d',
          border: '2px solid #5A6FD6',
          borderRadius: '8px',
          padding: '12px 16px',
          width: 120,
          fontWeight: '600',
          fontSize: '13px',
          textAlign: 'center',
          clipPath: 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)',
          boxShadow: '0 2px 8px rgba(90, 111, 214, 0.2)',
        },
      });
    });

    // Layer 3: Services
    const services = [
      { id: 'auth-service', label: 'AuthService', color: '#5A6FD6', y: START_Y - 20 },
      { id: 'account-service', label: 'Account\nService', color: '#6B8FE8', y: START_Y + 110 },
      { id: 'core-service', label: 'CoreService', color: '#7BA3F2', y: START_Y + 240 },
      { id: 'services', label: 'Services', color: '#8BB7FC', y: START_Y + 370 },
    ];

    services.forEach((svc) => {
      newNodes.push({
        id: svc.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2, y: svc.y },
        data: {
          label: (
            <div className={styles.serviceLabel}>
              {svc.label.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ),
          layer: 'services',
        },
        style: {
          background: `linear-gradient(135deg, ${svc.color} 0%, ${svc.color}dd 100%)`,
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          padding: '16px 20px',
          width: 160,
          fontWeight: '600',
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
        },
      });
    });

    // Layer 4: Database Manager & Databases
    newNodes.push({
      id: 'database-manager',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 3, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.dbManagerLabel}>
            <div>Database-</div>
            <div>Manager</div>
          </div>
        ),
        layer: 'database',
      },
      style: {
        background: 'linear-gradient(135deg, #8BB7FC 0%, #6B97DC 100%)',
        color: 'white',
        border: '2px solid #5A6FD6',
        borderRadius: '8px',
        padding: '18px 22px',
        width: 160,
        fontWeight: '600',
        fontSize: '14px',
        textAlign: 'center',
        boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
      },
    });

    // Databases (cylinder shape via CSS)
    const databases = [
      { id: 'accounts-db', label: 'Accounts\nDB', y: START_Y + 80 },
      { id: 'projects-db', label: 'Projects\nDB', y: START_Y + 280 },
    ];

    databases.forEach((db) => {
      newNodes.push({
        id: db.id,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3 + 50, y: db.y },
        data: {
          label: (
            <div className={styles.dbLabel}>
              {db.label.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ),
          layer: 'database',
          isDatabase: true,
        },
        style: {
          background: 'linear-gradient(180deg, #6B8FE8 0%, #5A7FD8 100%)',
          color: 'white',
          border: '2px solid #4A6FC6',
          borderRadius: '50px 50px 10px 10px',
          padding: '16px 20px',
          width: 120,
          fontWeight: '600',
          fontSize: '13px',
          textAlign: 'center',
          boxShadow: '0 3px 10px rgba(90, 111, 214, 0.25)',
          position: 'relative',
        },
        className: styles.cylinderNode,
      });
    });

    // Layer 5: Broker
    newNodes.push({
      id: 'broker',
      type: 'default',
      position: { x: START_X + LAYER_GAP * 4 + 80, y: START_Y + 180 },
      data: {
        label: (
          <div className={styles.brokerLabel}>
            Broker
          </div>
        ),
        layer: 'broker',
      },
      style: {
        background: 'white',
        color: '#E0A04A',
        border: '3px solid #E0A04A',
        borderRadius: '50%',
        padding: '24px',
        width: 120,
        height: 120,
        fontWeight: 'bold',
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(224, 160, 74, 0.3)',
      },
    });

    // Create edges (connections)
    const connections = [
      // Main Service to Endpoints
      { source: 'main-service', target: 'ep-account' },
      { source: 'main-service', target: 'ep-projects-get' },
      { source: 'main-service', target: 'ep-projects-post' },
      { source: 'main-service', target: 'ep-projects-db' },
      
      // Endpoints to Services
      { source: 'ep-account', target: 'auth-service' },
      { source: 'ep-account', target: 'account-service' },
      { source: 'ep-projects-get', target: 'account-service' },
      { source: 'ep-projects-post', target: 'core-service' },
      { source: 'ep-projects-db', target: 'services' },
      
      // Services to Database Manager
      { source: 'auth-service', target: 'database-manager' },
      { source: 'account-service', target: 'database-manager' },
      { source: 'core-service', target: 'database-manager' },
      
      // Services to Databases
      { source: 'account-service', target: 'accounts-db' },
      { source: 'services', target: 'projects-db' },
      
      // Database Manager to Databases and Broker
      { source: 'database-manager', target: 'accounts-db' },
      { source: 'database-manager', target: 'projects-db' },
      { source: 'database-manager', target: 'broker' },
    ];

    connections.forEach((conn, idx) => {
      newEdges.push({
        id: `edge-${idx}`,
        source: conn.source,
        target: conn.target,
        type: 'smoothstep',
        animated: false,
        style: { 
          stroke: '#A0A0A0', 
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#A0A0A0',
          width: 18,
          height: 18,
        },
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, []);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className={styles.container}>
      {/* Header with layer labels */}
      <div className={styles.layerHeader}>
        <div className={styles.layerLabel} style={{ left: '100px' }}>Главный сервис</div>
        <div className={styles.layerLabel} style={{ left: '380px' }}>API endpoints</div>
        <div className={styles.layerLabel} style={{ left: '660px' }}>Сервисы</div>
        <div className={styles.layerLabel} style={{ left: '940px' }}>Базы данных</div>
        <div className={styles.layerLabel} style={{ left: '1220px' }}>Брокер сообщений</div>
      </div>

      {/* Control bar */}
      <div className={styles.controlBar}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Назад
        </button>
        <h1 className={styles.title}>Layered Architecture - Project #{id}</h1>
      </div>

      {/* Graph */}
      <div className={styles.flowWrapper}>
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
      </div>

      {/* Node details tooltip */}
      {selectedNode && (
        <div className={styles.tooltip}>
          <button className={styles.tooltipClose} onClick={() => setSelectedNode(null)}>
            ×
          </button>
          <h3>{selectedNode.data.label}</h3>
          <p><strong>Layer:</strong> {selectedNode.data.layer}</p>
          <p><strong>ID:</strong> {selectedNode.id}</p>
        </div>
      )}
    </div>
  );
}
