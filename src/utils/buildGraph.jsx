import { MarkerType } from 'reactflow';

// Default colors for HTTP methods
const defaultMethodColors = {
  GET: { bg: 'linear-gradient(135deg, #22c39b 0%, #14b38a 100%)', border: '#14b38a' },
  POST: { bg: 'linear-gradient(135deg, #4f8cf7 0%, #3366f0 100%)', border: '#3366f0' },
  PATCH: { bg: 'linear-gradient(135deg, #f6c263 0%, #e09b2d 100%)', border: '#e09b2d' },
  PUT: { bg: 'linear-gradient(135deg, #9b8cf6 0%, #7f6bec 100%)', border: '#7f6bec' },
  DELETE: { bg: 'linear-gradient(135deg, #f98080 0%, #ef4444 100%)', border: '#ef4444' },
};

// Default colors for services/classes
const defaultServiceColors = {
  AuthService: { color: '#8b5cf6', icon: '🔐', label: 'Auth' },
  AccountService: { color: '#3b82f6', icon: '👤', label: 'Account' },
  ProjectService: { color: '#10b981', icon: '📁', label: 'Project' },
  CoreService: { color: '#f59e0b', icon: '⚙️', label: 'Core' },
};

const nodeBg = 'var(--graph-node-bg)';
const nodeBorder = 'var(--graph-node-border)';
const nodeChipBg = 'var(--graph-chip-bg)';
const nodeText = 'var(--text-primary)';
const nodeMuted = 'var(--text-subtle)';

const normalizeName = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const getBaseName = (name = '') => (name || '').split('/').pop() || '';

// Skip framework/built-in nodes so they don't create fake lanes on the graph
const IGNORED_EXACT_NODES = new Set(
  [
    'depends',
    '__init__',
    'init',
    'super',
    'file',
    'httpexception',
    'print',
    'len',
    'list',
    'dict',
    'set',
    'tuple',
    'type',
    'str',
    'int',
    'float',
    'items',
    'setattr',
    'getattr',
    'hasattr',
    'where',
    'select',
    'all',
    'any',
    'first',
    'scalars',
    'execute',
    'result',
    'data',
    'valueerror',
    'runtimeerror',
    'notimplementederror',
    'keyerror',
    'attributeerror',
    'indexerror',
  ].map((v) => v.toLowerCase())
);

const IGNORED_DOT_PREFIXES = new Set(
  [
    'log',
    'logger',
    'router',
    'session',
    'result',
    'conn',
    'connection',
    'context',
    'channel',
    'queue',
    'message',
    'data',
    'patch_data',
    'password',
    'hashed',
    'start_date',
    'end_date',
    'datetime',
    'json',
    'os',
  ].map((v) => v.toLowerCase())
);

const IGNORED_EXCEPTION_PATTERNS = [/(exception)$/i, /(error)$/i, /(notfound)$/i, /(notexists?)$/i, /(doesnotexist)$/i];

const shouldIgnoreNodeName = (name = '') => {
  const baseName = getBaseName(name);
  if (!baseName) return true;

  const normalized = baseName.toLowerCase();

  if (IGNORED_EXACT_NODES.has(normalized)) return true;

  const dotPrefix = normalized.split('.')[0];
  if (dotPrefix && IGNORED_DOT_PREFIXES.has(dotPrefix)) return true;

  if (normalized.startsWith('__') && normalized.endsWith('__')) return true;

  if (IGNORED_EXCEPTION_PATTERNS.some((pattern) => pattern.test(baseName))) return true;

  return false;
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
  const LANE_COLUMN_GAP = 450; // расстояние между колонками классов
  const LANE_CARD_WIDTH = 360;
  const LANE_VERTICAL_GAP = 120; // вертикальный зазор между карточками

  const dependencyMap = new Map(); // node -> nodes that depend on it
  const reverseDependencyMap = new Map(); // node -> nodes it depends on (children)

  architectureData.forEach(({ parent, children = [] }) => {
    if (shouldIgnoreNodeName(parent)) return;

    children.forEach((child) => {
      const cleanChild = getBaseName(child);
      if (shouldIgnoreNodeName(cleanChild)) return;

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
    if (shouldIgnoreNodeName(node)) return;
    if (connectedNodes.has(node)) return;
    connectedNodes.add(node);
    if (reverseDependencyMap.has(node)) {
      reverseDependencyMap.get(node).forEach((child) => traverse(child));
    }
  };

  const endpointKeys = Object.keys(endpoints || {});
  const hasEndpoints = endpointKeys.length > 0;

  if (hasEndpoints) {
    // Сначала добавляем все endpoints
    endpointKeys.forEach((endpointKey) => {
      connectedNodes.add(endpointKey);
    });

    // Затем обходим граф от endpoints и связанных с ними родителей
    endpointKeys.forEach((endpointKey) => {
      const endpointName = normalizeName(endpointKey);
      architectureData.forEach(({ parent }) => {
        const parentName = normalizeName(parent);
        if (!endpointName || !parentName) return;
        if (parentName.includes(endpointName) || endpointName.includes(parentName)) {
          traverse(parent);
        }
      });
    });
  } else {
    // Нет HTTP-эндпоинтов: включаем все узлы архитектуры, чтобы граф всё равно отображался
    architectureData.forEach(({ parent, children = [] }) => {
      if (!shouldIgnoreNodeName(parent)) {
        connectedNodes.add(parent);
      }
      children.forEach((child) => {
        const cleanChild = getBaseName(child);
        if (cleanChild && !shouldIgnoreNodeName(cleanChild)) {
          connectedNodes.add(cleanChild);
        }
      });
    });
  }

  const getNodeType = (nodeName) => {
    if (!connectedNodes.has(nodeName)) return null;

    if (shouldIgnoreNodeName(nodeName)) return null;

    const baseName = getBaseName(nodeName);
    const nameForCheck = baseName || nodeName;
    const lowerName = nameForCheck.toLowerCase();

    if (endpoints[nodeName]) {
      return { type: 'endpoint', layer: 1, class: 'HTTP' };
    }

    if (
      lowerName.startsWith('databasemanager') ||
      lowerName.startsWith('init_db') ||
      lowerName.includes('broker') ||
      lowerName.includes('storage') ||
      lowerName.includes('consumer') ||
      lowerName.includes('producer') ||
      lowerName.includes('connection') ||
      lowerName.includes('tasksession') ||
      lowerName.includes('taskmanager') ||
      lowerName.includes('streamservice') ||
      lowerName.includes('grpc') ||
      lowerName.includes('servicer') ||
      lowerName.includes('stub')
    ) {
      let className = 'Database';
      if (nameForCheck.startsWith('DatabaseManager') || lowerName.startsWith('databasemanager')) className = 'DatabaseManager';
      else if (lowerName.includes('broker')) className = 'MessageBroker';
      else if (lowerName.includes('storage')) className = 'ObjectStorage';
      else if (lowerName.includes('consumer') || lowerName.includes('producer')) className = 'MessageQueue';
      else if (lowerName.includes('tasksession') || lowerName.includes('taskmanager')) className = 'TaskManager';
      else if (lowerName.includes('streamservice') || lowerName.includes('grpc') || lowerName.includes('servicer') || lowerName.includes('stub'))
        className = 'CoreServer';

      return { type: 'database', layer: 3, class: className };
    }

    if (nameForCheck.includes('.')) {
      const className = nameForCheck.split('.')[0];
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

    const isHandler = handlerPatterns.some((pattern) => lowerName.includes(pattern));

    if (isHandler) {
      let className = 'Other';
      if (lowerName.includes('account')) className = 'Account';
      else if (lowerName.includes('project')) className = 'Project';
      else if (
        lowerName.includes('login') ||
        lowerName.includes('auth') ||
        lowerName.includes('registration') ||
        lowerName.includes('refresh')
      )
        className = 'Auth';
      else if (lowerName.includes('home') || lowerName.includes('health')) className = 'System';
      else if (lowerName.includes('config') || lowerName.includes('logger')) className = 'Config';

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
            <div style={{ fontSize: '10px', fontWeight: '600', color: nodeMuted }}>{reqName}</div>
          </div>
        ),
        meta: { layer: 0, kind: 'requirement' },
      },
      style: {
        background: nodeBg,
        border: `2px solid ${nodeBorder}`,
        borderRadius: '8px',
        width: 140,
        fontSize: '10px',
        boxShadow: '0 6px 14px var(--shadow-soft)',
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
                color: 'var(--text-inverse)',
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
            <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '6px', color: nodeText }}>{key}</div>
            <div style={{ fontSize: '11px', color: nodeMuted, marginTop: '4px', wordBreak: 'break-all' }}>{path}</div>
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
        background: nodeBg,
        border: `3px solid ${color.border}`,
        borderRadius: '12px',
        width: 240,
        fontSize: '12px',
        boxShadow: `0 6px 16px ${color.border}35`,
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

  // Функция для вычисления уровня зависимости класса (топологическая сортировка)
  const computeClassDependencyLevels = (layerKey) => {
    const classMap = classByLayer[layerKey] || {};
    const classNames = Object.keys(classMap).filter(cn => classMap[cn]?.length);
    
    // Строим граф зависимостей между классами
    const classDeps = new Map(); // className -> Set of classes it depends on
    const classReverseDeps = new Map(); // className -> Set of classes that depend on it
    
    classNames.forEach(cn => {
      classDeps.set(cn, new Set());
      classReverseDeps.set(cn, new Set());
    });
    
    // Анализируем зависимости между классами через методы
    classNames.forEach(sourceClass => {
      const methods = classMap[sourceClass] || [];
      methods.forEach(methodName => {
        const children = reverseDependencyMap.get(methodName) || new Set();
        children.forEach(childName => {
          const childMeta = methodMeta.get(childName);
          if (childMeta?.layer === layerKey) {
            const targetClass = childMeta.className;
            if (targetClass && targetClass !== sourceClass && classNames.includes(targetClass)) {
              classDeps.get(sourceClass).add(targetClass);
              classReverseDeps.get(targetClass).add(sourceClass);
            }
          }
        });
      });
    });
    
    // Топологическая сортировка (Kahn's algorithm)
    const levels = new Map();
    const inDegree = new Map();
    
    classNames.forEach(cn => {
      inDegree.set(cn, classDeps.get(cn).size);
    });
    
    let currentLevel = 0;
    let remaining = new Set(classNames);
    
    while (remaining.size > 0) {
      // Находим классы без зависимостей (или все зависимости уже размещены)
      const nodesAtLevel = Array.from(remaining).filter(cn => {
        const deps = classDeps.get(cn);
        return Array.from(deps).every(dep => levels.has(dep));
      });
      
      if (nodesAtLevel.length === 0) {
        // Циклические зависимости или изолированные узлы - размещаем оставшиеся
        nodesAtLevel.push(...Array.from(remaining));
      }
      
      nodesAtLevel.forEach(cn => {
        levels.set(cn, currentLevel);
        remaining.delete(cn);
      });
      
      currentLevel++;
    }
    
    return levels;
  };

  const renderLaneNodes = (layerKey, baseXPos, anchors) => {
    const cards = Object.entries(classByLayer[layerKey] || {})
      .filter(([, methods]) => methods?.length)
      .map(([className, methods]) => {
        const classColor = serviceColors[className]?.color || '#64748b';
        const preview = methods.map((m) => m.split('.').pop() || m);
        const methodItemHeight = 28;
        const baseHeight = 120;
        const estimatedHeight = baseHeight + preview.length * methodItemHeight;
        return { 
          className, 
          methods, 
          classColor, 
          preview, 
          estimatedHeight, 
          anchor: anchors?.[className] ?? 0 
        };
      });

    if (cards.length === 0) return;

    // Вычисляем уровни зависимостей для классов
    const dependencyLevels = computeClassDependencyLevels(layerKey);
    
    // Группируем карточки по уровням
    const cardsByLevel = new Map();
    cards.forEach(card => {
      const level = dependencyLevels.get(card.className) ?? 0;
      if (!cardsByLevel.has(level)) {
        cardsByLevel.set(level, []);
      }
      cardsByLevel.get(level).push(card);
    });
    
    // Сортируем карточки внутри каждого уровня по anchor
    cardsByLevel.forEach(levelCards => {
      levelCards.sort((a, b) => a.anchor - b.anchor);
    });
    
    // Размещаем карточки
    const sortedLevels = Array.from(cardsByLevel.keys()).sort((a, b) => a - b);
    
    sortedLevels.forEach((level, levelIdx) => {
      const levelCards = cardsByLevel.get(level);
      const xPos = baseXPos + levelIdx * LANE_COLUMN_GAP;
      
      let yOffset = START_Y;
      levelCards.forEach((card, cardIdx) => {
        newNodes.push({
          id: `lane-${layerKey}-${card.className}`,
          type: 'default',
          position: { x: xPos, y: yOffset },
          data: {
            label: (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: nodeText }}>{card.className}</div>
                <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', color: nodeMuted }}>{card.methods.length} методов</div>
                <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                  {card.preview.map((m) => (
                    <div
                      key={m}
                      style={{
                        background: nodeChipBg,
                        borderRadius: '8px',
                        padding: '6px 8px',
                        fontSize: '11px',
                        color: nodeText,
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
            background: nodeBg,
            border: `2px solid ${card.classColor}`,
            borderRadius: '14px',
            width: LANE_CARD_WIDTH,
            boxShadow: `0 10px 24px ${card.classColor}25`,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
        
        yOffset += card.estimatedHeight + LANE_VERTICAL_GAP;
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
      if (shouldIgnoreNodeName(parent)) return;
      const parentName = normalizeName(parent);
      if (!endpointName || !parentName) return;
      if (parentName.includes(endpointName) || endpointName.includes(parentName)) {
        children.forEach((childRaw) => {
          const child = getBaseName(childRaw);
          if (child && !shouldIgnoreNodeName(child)) matchedChildren.add(child);
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
        kind: 'http',
      });
    });
  });

  architectureData.forEach(({ parent, children = [] }) => {
    const parentMeta = methodMeta.get(parent);
    if (!parentMeta) return;

    const sourceId = parentMeta.layer === 1 ? parent : getLaneId(parentMeta.layer, parentMeta.className);
    if (!nodeIds.has(sourceId)) return;

    children.forEach((childRaw) => {
      const child = getBaseName(childRaw);
      if (shouldIgnoreNodeName(child)) return;
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
    const labelColor = kind === 'internal' ? nodeText : 'var(--text-inverse)';
    const labelYOffset = hasLabel ? -10 : 0;
    const baseStyle = {
      stroke: baseColor,
      strokeWidth,
      opacity,
      strokeDasharray: undefined,
    };

    newEdges.push({
      id: key,
      source,
      target,
      type: 'smart',
      markerEnd: { type: MarkerType.ArrowClosed, color: baseColor },
      style: baseStyle,
      animated: Boolean(options?.animated),
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
        baseStyle,
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
