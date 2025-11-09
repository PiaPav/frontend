import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

const nodes = [
  {
    id: '1',
    data: { label: '🌐 API Gateway' },
    position: { x: 250, y: 0 },
    style: { background: '#667eea', color: 'white', padding: 10, borderRadius: 8 },
  },
  {
    id: '2',
    data: { label: '🔐 Auth Service' },
    position: { x: 100, y: 150 },
    style: { background: '#48bb78', color: 'white', padding: 10, borderRadius: 8 },
  },
  {
    id: '3',
    data: { label: '🗄️ Database' },
    position: { x: 400, y: 150 },
    style: { background: '#4299e1', color: 'white', padding: 10, borderRadius: 8 },
  },
];

const edges = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e1-3', source: '1', target: '3', animated: true },
];

export default function TestFlow() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
