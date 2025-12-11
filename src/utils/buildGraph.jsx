import { MarkerType } from 'reactflow';

// Default colors for HTTP methods
const defaultMethodColors = {
  GET: { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669' },
  POST: { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb' },
  PATCH: { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#d97706' },
  PUT: { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed' },
  DELETE: { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#dc2626' },
};

// Default colors for services/classes
const defaultServiceColors = {
  AuthService: { color: '#8b5cf6', icon: '🔐', label: 'Auth' },
  AccountService: { color: '#3b82f6', icon: '👤', label: 'Account' },
  ProjectService: { color: '#10b981', icon: '📁', label: 'Project' },
  CoreService: { color: '#f59e0b', icon: '⚙️', label: 'Core' },
};

/**
 * Build React Flow nodes/edges based on requirements, endpoints and architecture data.
 */
export function buildGraph({
  requirements = [],
  endpoints = {},
  architectureData = [],
  methodColors = defaultMethodColors,
  serviceColors = defaultServiceColors,
}) {
  if (architectureData.length === 0 && Object.keys(endpoints).length === 0) {
    return { nodes: [], edges: [], summary: {} };
  }

  const LAYER_GAP = 620;
  const START_X = 120;
  const START_Y = 80;
  const HTTP_SPACING = 160;
  const LANE_OFFSET_X = 320;
  const LANE_BASE_GAP_Y = 100;

  const dependencyMap = new Map(); // node -> nodes that depend on it
  const reverseDependencyMap = new Map(); // node -> nodes it depends on (children)

  architectureData.forEach(({ parent, children }) => {
    children.forEach((child) => {
      const cleanChild = child.split('/').pop();

      if (!dependencyMap.has(cleanChild)) {
        dependencyMap.set(cleanChild, new Set());
      }
      dependencyMap.get(cleanChild).add(parent);

      if (!reverseDependencyMap.has(parent)) {
        reverseDependencyMap.set(parent, new Set());
      }
      reverseDependencyMap.get(parent).add(cleanChild);
    });
  });

  const connectedNodes = new Set();
  const traverse = (node) => {
    if (connectedNodes.has(node)) return;
    connectedNodes.add(node);
    if (reverseDependencyMap.has(node)) {
      reverseDependencyMap.get(node).forEach((child) => traverse(child));
    }
  };

  Object.keys(endpoints).forEach((endpointKey) => {
    traverse(endpointKey);
    architectureData.forEach(({ parent }) => {
      const endpointName = endpointKey.toLowerCase().replace(/_/g, '');
      const parentName = parent.toLowerCase().replace(/[._]/g, '');
      if (parentName.includes(endpointName) || endpointName.includes(parentName)) {
        traverse(parent);
      }
    });
  });

  const getNodeType = (nodeName) => {
    if (!connectedNodes.has(nodeName)) return null;

    if (endpoints[nodeName]) {
      return { type: 'endpoint', layer: 1, class: 'HTTP' };
    }

    if (
      nodeName.startsWith('DatabaseManager') ||
      nodeName.startsWith('init_db') ||
      nodeName.includes('Exception') ||
      nodeName.includes('Broker') ||
      nodeName.includes('Storage') ||
      nodeName.includes('Consumer') ||
      nodeName.includes('Producer') ||
      nodeName.includes('Connection') ||
      nodeName.includes('TaskSession') ||
      nodeName.includes('TaskManager') ||
      nodeName.includes('StreamService') ||
      nodeName.includes('grpc') ||
      nodeName.includes('Servicer') ||
      nodeName.includes('Stub')
    ) {
      let className = 'Database';
      if (nodeName.startsWith('DatabaseManager')) className = 'DatabaseManager';
      else if (nodeName.includes('Exception')) className = 'Exceptions';
      else if (nodeName.includes('Broker')) className = 'MessageBroker';
      else if (nodeName.includes('Storage')) className = 'ObjectStorage';
      else if (nodeName.includes('Consumer') || nodeName.includes('Producer')) className = 'MessageQueue';
      else if (nodeName.includes('TaskSession') || nodeName.includes('TaskManager')) className = 'TaskManager';
      else if (nodeName.includes('StreamService') || nodeName.includes('grpc') || nodeName.includes('Servicer') || nodeName.includes('Stub')) className = 'CoreServer';

      return { type: 'database', layer: 3, class: className };
    }

    if (nodeName.includes('.')) {
      const className = nodeName.split('.')[0];
      return { type: 'domain', layer: 2, class: className };
    }

    const handlerPatterns = [
      'homepage',
      'health',
      'lifespan',
      'get_account',
      'patch_account',
      'get_project',
      'get_projects_list',
      'create_project',
      'patch_project',
      'delete_project',
      'login',
      'refresh',
      'registration',
      'load_config',
      'create_logger',
      'run_frontend_test',
    ];

    const isHandler =
      handlerPatterns.some((pattern) => nodeName.includes(pattern)) ||
      (!nodeName.includes('.') && !nodeName.includes('Manager') && !nodeName.includes('Service'));

    if (isHandler) {
      let className = 'Core';
      if (nodeName.includes('account')) className = 'Account';
      else if (nodeName.includes('project')) className = 'Project';
      else if (
        nodeName.includes('login') ||
        nodeName.includes('auth') ||
        nodeName.includes('registration') ||
        nodeName.includes('refresh')
      )
        className = 'Auth';
      else if (nodeName.includes('home') || nodeName.includes('health')) className = 'System';
      else if (nodeName.includes('config') || nodeName.includes('logger')) className = 'Config';

      return { type: 'handler', layer: 2, class: className };
    }

    return { type: 'other', layer: 2, class: 'Other' };
  };

  const classByLayer = {
    0: { Requirements: [] },
    1: { HTTP: [] },
    2: {},
    3: {},
  };
  const methodMeta = new Map();

  const register = (name, layer, className) => {
    if (!classByLayer[layer]) classByLayer[layer] = {};
    if (!classByLayer[layer][className]) classByLayer[layer][className] = [];
    classByLayer[layer][className].push(name);
    methodMeta.set(name, { layer, className });
  };

  requirements.forEach((req) => {
    if (req) {
      classByLayer[0].Requirements.push(req);
    }
  });

  connectedNodes.forEach((nodeName) => {
    const nodeType = getNodeType(nodeName);
    if (!nodeType) return;
    const { layer, class: className } = nodeType;
    register(nodeName, layer, className);
  });

  const laneX = {
    http: START_X,
    handlers: START_X + LAYER_GAP,
    db: START_X + LAYER_GAP * 2,
  };

  const newNodes = [];

  const requirementsList = classByLayer[0].Requirements || [];
  requirementsList.forEach((reqName, idx) => {
    newNodes.push({
      id: reqName,
      type: 'default',
      position: { x: START_X - LAYER_GAP * 0.8, y: START_Y + idx * 60 },
      data: {
        label: (
          <div style={{ padding: '6px 10px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: '#6b7280' }}>{reqName}</div>
          </div>
        ),
      },
      style: {
        background: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '8px',
        width: 140,
        fontSize: '10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    });
  });

  const httpEndpoints = classByLayer[1].HTTP || [];
  const endpointsList = httpEndpoints.map((key) => ({ key, value: endpoints[key] }));
  const methodOrder = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
  const sortedEndpoints = endpointsList.sort((a, b) => {
    const methodA = a.value?.split(' ')[0] || 'GET';
    const methodB = b.value?.split(' ')[0] || 'GET';
    const orderDiff = methodOrder.indexOf(methodA) - methodOrder.indexOf(methodB);
    if (orderDiff !== 0) return orderDiff;
    const pathA = a.value?.split(' ')[1] || a.key || '';
    const pathB = b.value?.split(' ')[1] || b.key || '';
    return pathA.localeCompare(pathB);
  });

  sortedEndpoints.forEach(({ key, value }, idx) => {
    const method = value?.split(' ')[0] || 'GET';
    const path = value?.split(' ')[1] || '';
    const color = methodColors[method] || methodColors.GET;

    newNodes.push({
      id: key,
      type: 'default',
      position: { x: laneX.http, y: START_Y + idx * HTTP_SPACING },
      data: {
        label: (
          <div style={{ padding: '10px 14px' }}>
            <div
              style={{
                background: color.bg,
                color: 'white',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 'bold',
                marginBottom: '6px',
                display: 'inline-block',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              {method}
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '6px', color: '#0f172a' }}>{key}</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', wordBreak: 'break-all' }}>{path}</div>
          </div>
        ),
      },
      style: {
        background: 'white',
        border: `3px solid ${color.border}`,
        borderRadius: '12px',
        width: 240,
        fontSize: '12px',
        boxShadow: `0 4px 16px ${color.border}35`,
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    });
  });

  const renderLaneNodes = (layerKey, xPos) => {
    const cards = Object.entries(classByLayer[layerKey] || {})
      .filter(([, methods]) => methods?.length)
      .map(([className, methods]) => {
        const classColor = serviceColors[className]?.color || '#64748b';
        const preview = methods.map((m) => m.split('.').pop() || m);
        const estimatedHeight = 180 + preview.length * 28;
        return { className, methods, classColor, preview, estimatedHeight };
      });

    let rowY = START_Y;
    const rowStepMin = Math.max(HTTP_SPACING, LANE_BASE_GAP_Y);
    for (let i = 0; i < cards.length; i += 2) {
      const left = cards[i];
      const right = cards[i + 1];

      newNodes.push({
        id: `lane-${layerKey}-${left.className}`,
        type: 'default',
        position: { x: xPos, y: rowY },
        data: {
          label: (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#111' }}>{left.className}</div>
              <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{left.methods.length} методов</div>
              <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                {left.preview.map((m) => (
                  <div
                    key={m}
                    style={{
                      background: '#f8fafc',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      fontSize: '11px',
                      color: '#0f172a',
                      border: `1px solid ${left.classColor}33`,
                    }}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        style: {
          background: 'white',
          border: `2px solid ${left.classColor}`,
          borderRadius: '14px',
          width: 260,
          boxShadow: `0 10px 24px ${left.classColor}25`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });

      if (right) {
        newNodes.push({
          id: `lane-${layerKey}-${right.className}`,
          type: 'default',
          position: { x: xPos + LANE_OFFSET_X, y: rowY + 40 },
          data: {
            label: (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#111' }}>{right.className}</div>
                <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{right.methods.length} методов</div>
                <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                  {right.preview.map((m) => (
                    <div
                      key={m}
                      style={{
                        background: '#f8fafc',
                        borderRadius: '8px',
                        padding: '6px 8px',
                        fontSize: '11px',
                        color: '#0f172a',
                        border: `1px solid ${right.classColor}33`,
                      }}
                    >
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            ),
          },
          style: {
            background: 'white',
            border: `2px solid ${right.classColor}`,
            borderRadius: '14px',
            width: 260,
            boxShadow: `0 10px 24px ${right.classColor}25`,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      }

      const rowHeight = Math.max(left.estimatedHeight, right ? right.estimatedHeight + 40 : 0);
      const rowStep = Math.max(rowHeight + LANE_BASE_GAP_Y, rowStepMin);
      rowY += rowStep;
    }
  };

  renderLaneNodes(2, laneX.handlers);
  renderLaneNodes(3, laneX.db);

  const getLaneId = (layer, className) => `lane-${layer}-${className}`;

  const newEdges = [];
  const nodeIds = new Set(newNodes.map((n) => n.id));
  const nodesWithIncomingEdges = new Set();
  const nodesWithOutgoingEdges = new Set();
  const edgeKeys = new Set();

  const pushEdge = (source, target, options) => {
    const key = `${source}->${target}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    newEdges.push({
      id: key,
      source,
      target,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: options?.color || '#94a3b8' },
      style: { stroke: options?.color || '#94a3b8', strokeWidth: options?.strokeWidth || 2 },
      animated: options?.animated || false,
      label: options?.label,
      labelStyle: options?.labelStyle,
      labelBgStyle: options?.labelBgStyle,
    });
    nodesWithOutgoingEdges.add(source);
    nodesWithIncomingEdges.add(target);
  };

  Object.keys(endpoints).forEach((endpointKey) => {
    if (!reverseDependencyMap.has(endpointKey)) return;

    const method = endpoints[endpointKey]?.split(' ')[0] || 'GET';
    const color = methodColors[method]?.border || '#3b82f6';

    reverseDependencyMap.get(endpointKey).forEach((target) => {
      const meta = methodMeta.get(target);
      if (!meta) return;
      const targetId = meta.layer === 1 ? target : getLaneId(meta.layer, meta.className);
      if (!nodeIds.has(targetId)) return;

      pushEdge(endpointKey, targetId, {
        color,
        strokeWidth: 3,
        animated: true,
      });
    });
  });

  architectureData.forEach(({ parent, children }) => {
    const parentMeta = methodMeta.get(parent);
    if (!parentMeta) return;

    const sourceId = parentMeta.layer === 1 ? parent : getLaneId(parentMeta.layer, parentMeta.className);
    if (!nodeIds.has(sourceId)) return;

    children.forEach((childRaw) => {
      const child = childRaw.split('/').pop();
      const childMeta = methodMeta.get(child);
      if (!childMeta) return;

      const targetId = childMeta.layer === 1 ? child : getLaneId(childMeta.layer, childMeta.className);
      if (!nodeIds.has(targetId)) return;

      pushEdge(sourceId, targetId, { color: '#94a3b8' });
    });
  });

  const filteredNodes = newNodes.filter((node) => {
    const hasEdges = nodesWithIncomingEdges.has(node.id) || nodesWithOutgoingEdges.has(node.id);
    return hasEdges;
  });

  const summary = {
    nodes: filteredNodes.length,
    edges: newEdges.length,
    requirements: requirements.length,
    endpoints: Object.keys(endpoints).length,
    lanes: {
      http: classByLayer[1].HTTP?.length || 0,
      handlers: Object.keys(classByLayer[2] || {}).map((cls) => `${cls} (${classByLayer[2][cls].length})`),
      infra: Object.keys(classByLayer[3] || {}).map((cls) => `${cls} (${classByLayer[3][cls].length})`),
    },
  };

  return { nodes: filteredNodes, edges: newEdges, summary };
}

export default buildGraph;
