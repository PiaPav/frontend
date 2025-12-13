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

const normalizeName = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

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

  const median = (arr) => {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const LAYER_GAP = 900;
  const START_X = 120;
  const START_Y = 80;
  const HTTP_SPACING = 110;
  const LAYER_ANCHOR_SPACING = 40;
  const LANE_COLUMN_GAP = 380; // расстояние между карточками внутри слоя
  const LANE_CARD_WIDTH = 360;
  const LANE_BASE_GAP_Y = 80; // добавляем побольше вертикального зазора
  const LANE_ROW_HEIGHT = 200; // базовая высота ряда; увеличиваем динамически под самый высокий блок
  const MAX_ROWS_LAYER2 = 4;
  const MAX_ROWS_LAYER3 = 4;

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

  // Сначала добавляем все endpoints
  Object.keys(endpoints).forEach((endpointKey) => {
    connectedNodes.add(endpointKey);
  });

  // Затем обходим граф от endpoints и связанных с ними родителей
  Object.keys(endpoints).forEach((endpointKey) => {
    const endpointName = normalizeName(endpointKey);
    architectureData.forEach(({ parent }) => {
      const parentName = normalizeName(parent);
      if (!endpointName || !parentName) return;
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
        meta: { layer: 0, kind: 'requirement' },
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

  const endpointIndexMap = new Map();
  sortedEndpoints.forEach(({ key, value }, idx) => {
    endpointIndexMap.set(key, idx);
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
        meta: {
          layer: 1,
          kind: 'endpoint',
          method,
          path,
        },
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

  const computeAnchors = (layerKey, classMap, upstreamAnchors) => {
    const anchors = {};
    Object.entries(classMap || {}).forEach(([className, methods], idx) => {
      const hits = [];

      if (layerKey === 2) {
        // Расставляем хендлеры по средней позиции их входящих HTTP эндпоинтов
        Object.keys(endpoints).forEach((endpointKey) => {
          const children = reverseDependencyMap.get(endpointKey);
          if (!children) return;
          children.forEach((childName) => {
            const meta = methodMeta.get(childName);
            if (meta?.className === className) {
              const endpointIdx = endpointIndexMap.get(endpointKey);
              if (typeof endpointIdx === 'number') hits.push(endpointIdx);
            }
          });
        });
      }

      if (layerKey === 3) {
        // Инфраструктуру якорим около слоёв, которые её вызывают
        methods.forEach((methodName) => {
          const parents = dependencyMap.get(methodName);
          if (!parents) return;
          parents.forEach((parentName) => {
            const meta = methodMeta.get(parentName);
            if (meta?.layer === 2 && upstreamAnchors?.[meta.className] !== undefined) {
              hits.push(upstreamAnchors[meta.className]);
            }
          });
        });
      }

      const anchor = hits.length ? median(hits) : idx + 0.5;
      anchors[className] = anchor;
    });
    return anchors;
  };

  const handlerAnchors = computeAnchors(2, classByLayer[2], null);
  const infraAnchors = computeAnchors(3, classByLayer[3], handlerAnchors);

  const renderLaneNodes = (layerKey, xPos, anchors) => {
    const cards = Object.entries(classByLayer[layerKey] || {})
      .filter(([, methods]) => methods?.length)
      .map(([className, methods]) => {
        const classColor = serviceColors[className]?.color || '#64748b';
        const preview = methods.map((m) => m.split('.').pop() || m);
        const rowsCount = Math.max(preview.length, 3);
        // Улучшенный расчёт высоты: базовая высота + высота на каждый метод
        const methodItemHeight = 28; // высота одного элемента метода с отступами
        const baseHeight = 120; // заголовок и отступы
        const estimatedHeight = baseHeight + preview.length * methodItemHeight;
        return { className, methods, classColor, preview, estimatedHeight, anchor: anchors?.[className] ?? 0 };
      })
      .sort((a, b) => a.anchor - b.anchor);

    if (cards.length === 0) return;

    const maxRows = layerKey === 2 ? MAX_ROWS_LAYER2 : MAX_ROWS_LAYER3;
    const rowHeights = Array(maxRows).fill(LANE_ROW_HEIGHT);

    cards.forEach((card, idx) => {
      const row = idx % maxRows;
      // Полная высота карточки включая все методы и отступы
      const cardHeight = card.estimatedHeight + LANE_BASE_GAP_Y;
      rowHeights[row] = Math.max(rowHeights[row], cardHeight);
    });

    const rowOffsets = [];
    let yCursor = START_Y;
    rowHeights.forEach((h) => {
      rowOffsets.push(yCursor);
      yCursor += h;
    });

    cards.forEach((card, idx) => {
      const row = idx % maxRows;
      const col = Math.floor(idx / maxRows);
      const targetX = xPos + col * LANE_COLUMN_GAP;
      const targetY = rowOffsets[row] ?? START_Y;

      newNodes.push({
        id: `lane-${layerKey}-${card.className}`,
        type: 'default',
        position: { x: targetX, y: targetY },
        data: {
          label: (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#111' }}>{card.className}</div>
              <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{card.methods.length} методов</div>
              <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                {card.preview.map((m) => (
                  <div
                    key={m}
                    style={{
                      background: '#f8fafc',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      fontSize: '11px',
                      color: '#0f172a',
                      border: `1px solid ${card.classColor}33`,
                    }}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
          ),
          meta: {
            layer: layerKey,
            kind: 'lane',
            className: card.className,
          },
        },
        style: {
          background: 'white',
          border: `2px solid ${card.classColor}`,
          borderRadius: '14px',
          width: LANE_CARD_WIDTH,
          boxShadow: `0 10px 24px ${card.classColor}25`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });
  };

  renderLaneNodes(2, laneX.handlers, handlerAnchors);
  renderLaneNodes(3, laneX.db, infraAnchors);

  const getLaneId = (layer, className) => `lane-${layer}-${className}`;

  const nodeIds = new Set(newNodes.map((n) => n.id));
  const edgeStats = new Map();
  const nodesWithIncomingEdges = new Set();
  const nodesWithOutgoingEdges = new Set();

  const registerEdge = (source, target, options = {}) => {
    const key = `${source}->${target}`;
    const existing = edgeStats.get(key);
    if (!existing) {
      edgeStats.set(key, { source, target, options: { ...options }, count: 1 });
    } else {
      edgeStats.set(key, {
        source,
        target,
        options: { ...existing.options, ...options },
        count: existing.count + 1,
      });
    }
    nodesWithOutgoingEdges.add(source);
    nodesWithIncomingEdges.add(target);
  };

  Object.keys(endpoints).forEach((endpointKey) => {
    const method = endpoints[endpointKey]?.split(' ')[0] || 'GET';
    const color = methodColors[method]?.border || '#3b82f6';
    const endpointName = normalizeName(endpointKey);

    const matchedChildren = new Set();
    if (reverseDependencyMap.has(endpointKey)) {
      reverseDependencyMap.get(endpointKey).forEach((child) => matchedChildren.add(child));
    }
    architectureData.forEach(({ parent, children = [] }) => {
      const parentName = normalizeName(parent);
      if (!endpointName || !parentName) return;
      if (parentName.includes(endpointName) || endpointName.includes(parentName)) {
        children.forEach((childRaw) => {
          const child = childRaw.split('/').pop();
          if (child) matchedChildren.add(child);
        });
      }
    });

    matchedChildren.forEach((target) => {
      const meta = methodMeta.get(target);
      if (!meta) return;
      const targetId = meta.layer === 1 ? target : getLaneId(meta.layer, meta.className);
      if (!nodeIds.has(targetId)) return;

      registerEdge(endpointKey, targetId, {
        color,
        strokeWidth: 3,
        animated: true,
        kind: 'http',
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

      registerEdge(sourceId, targetId, {
        color: '#cbd5f5',
        opacity: 0.7,
        kind: 'internal',
      });
    });
  });

  const newEdges = [];
  edgeStats.forEach(({ source, target, options, count }, key) => {
    const baseColor = options?.color || '#94a3b8';
    const kind = options?.kind;
    const weight = Math.min(count, 4);
    const baseWidth = options?.strokeWidth ?? (kind === 'http' ? 2.6 : 2.0);
    const strokeWidth = baseWidth + (weight - 1) * 0.6;
    const opacity = options?.opacity ?? (kind === 'http' ? 0.95 : 0.8);
    const label = count > 1 ? options?.label ?? `×${count}` : options?.label;
    const hasLabel = Boolean(label);
    const labelBg = baseColor;
    const labelColor = kind === 'internal' ? '#0f172a' : '#f8fafc';
    const labelYOffset = hasLabel ? -10 : 0;

    newEdges.push({
      id: key,
      source,
      target,
      type: 'smart',
      markerEnd: { type: MarkerType.ArrowClosed, color: baseColor },
      style: {
        stroke: baseColor,
        strokeWidth,
        opacity,
        strokeDasharray: kind === 'internal' ? '4 4' : undefined,
      },
      animated: options?.animated || false,
      label,
      labelStyle: hasLabel
        ? {
            fontSize: 10,
            fontWeight: 600,
            transform: `translateY(${labelYOffset}px)`,
            position: 'relative',
            zIndex: 5,
            ...options?.labelStyle,
          }
        : undefined,
      labelBgStyle: hasLabel
        ? {
            fill: labelBg,
            color: labelColor,
            borderRadius: 999,
            padding: 4,
            transform: `translateY(${labelYOffset}px)`,
            position: 'relative',
            zIndex: 4,
            ...options?.labelBgStyle,
          }
        : undefined,
      data: {
        ...(options?.data || {}),
        aggCount: count,
      },
    });
  });

  // Фильтруем узлы: оставляем только те, которые участвуют в рёбрах
  // (хотя бы один вход/выход) + сами endpoints.
  // Иначе стрелки от endpoints пропадали, если зависимые узлы были конечными.
  const filteredNodes = newNodes.filter((node) => {
    if (endpoints[node.id]) {
      return true;
    }
    return nodesWithOutgoingEdges.has(node.id) || nodesWithIncomingEdges.has(node.id);
  });

  // Создаём Set из ID отфильтрованных узлов для быстрой проверки
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

  // Фильтруем рёбра: оставляем только те, у которых оба конца существуют в отфильтрованных узлах
  const filteredEdges = newEdges.filter((edge) => {
    return filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target);
  });

  const summary = {
    nodes: filteredNodes.length,
    edges: filteredEdges.length,
    requirements: requirements.length,
    endpoints: Object.keys(endpoints).length,
    lanes: {
      http: classByLayer[1].HTTP?.length || 0,
      handlers: Object.keys(classByLayer[2] || {}).map((cls) => `${cls} (${classByLayer[2][cls].length})`),
      infra: Object.keys(classByLayer[3] || {}).map((cls) => `${cls} (${classByLayer[3][cls].length})`),
    },
  };

  return { nodes: filteredNodes, edges: filteredEdges, summary };
}

export default buildGraph;
