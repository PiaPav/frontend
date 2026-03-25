const safeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const KIND_CONFIG = {
  file: { baseX: 40, rows: 18, colGap: 320, rowGap: 110, width: 260, height: 88, color: '#2563eb' },
  entity: { baseX: 760, rows: 18, colGap: 340, rowGap: 100, width: 280, height: 84, color: '#0f766e' },
  method: { baseX: 1680, rows: 18, colGap: 360, rowGap: 94, width: 300, height: 78, color: '#d97706' },
  attribute: { baseX: 2720, rows: 18, colGap: 340, rowGap: 88, width: 280, height: 72, color: '#7c3aed' },
  dependency: { baseX: 3720, rows: 18, colGap: 390, rowGap: 86, width: 340, height: 76, color: '#be123c' },
};

const placeNodes = (items, kind) => {
  const config = KIND_CONFIG[kind];
  return items.map((item, index) => {
    const row = index % config.rows;
    const col = Math.floor(index / config.rows);
    return {
      ...item,
      position: {
        x: config.baseX + col * config.colGap,
        y: 60 + row * config.rowGap,
      },
      style: {
        width: config.width,
        height: config.height,
        borderRadius: 16,
        border: `2px solid ${config.color}`,
        background: 'var(--surface)',
        boxShadow: `0 14px 28px ${config.color}18`,
        color: 'var(--text-primary)',
        fontSize: 12,
        fontWeight: 700,
        padding: 12,
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    };
  });
};

const parseDependencyRef = (rawRef = '') => {
  if (!rawRef || typeof rawRef !== 'string') return { raw: rawRef, filePath: '', symbol: '' };
  const match = rawRef.match(/^(.+?\.py)(?:\.(.+))?$/i);
  if (!match) return { raw: rawRef, filePath: '', symbol: '' };
  return {
    raw: rawRef,
    filePath: match[1],
    symbol: match[2] || '',
  };
};

const getShortFileName = (filePath = '') => {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
};

const getFileGroup = (filePath = '') => {
  const parts = filePath.split('/').filter(Boolean);
  const startIndex = parts[0] === 'src' ? 1 : 0;
  return parts[startIndex] || 'root';
};

const buildLabel = (title, subtitle, extra = '') => `${title}\n${subtitle}${extra ? `\n${extra}` : ''}`;

const createEdge = (id, source, target, color, kind) => ({
  id,
  source,
  target,
  type: 'smoothstep',
  animated: false,
  style: {
    stroke: color,
    strokeWidth: kind === 'depends' ? 1.8 : 1.2,
    opacity: kind === 'depends' ? 0.58 : 0.22,
  },
  data: { kind },
});

export function buildRawGraphFromParser(rawGraph = {}) {
  const fileEntries = Object.entries(rawGraph || {}).sort(([left], [right]) => left.localeCompare(right));
  const nodesByKind = {
    file: [],
    entity: [],
    method: [],
    attribute: [],
    dependency: [],
  };
  const edges = [];
  const dependencyNodeIds = new Map();
  const edgeIds = new Set();
  const nodeDetails = new Map();

  const ensureDependencyNode = (rawRef) => {
    if (dependencyNodeIds.has(rawRef)) return dependencyNodeIds.get(rawRef);

    const parsed = parseDependencyRef(rawRef);
    const nodeId = `dependency:${rawRef}`;
    dependencyNodeIds.set(rawRef, nodeId);
    nodesByKind.dependency.push({
      id: nodeId,
      data: {
        label: buildLabel(parsed.symbol || getShortFileName(parsed.filePath) || rawRef, parsed.filePath || 'literal dependency', rawRef),
        meta: {
          kind: 'dependency',
          rawRef,
          filePath: parsed.filePath,
          symbol: parsed.symbol,
        },
      },
    });
    nodeDetails.set(nodeId, {
      title: parsed.symbol || rawRef,
      lines: [rawRef, parsed.filePath ? `target file: ${parsed.filePath}` : 'non-standard dependency literal'],
    });
    return nodeId;
  };

  fileEntries.forEach(([filePath, entitiesMap]) => {
    const fileId = `file:${filePath}`;
    const entities = Object.entries(entitiesMap || {});
    const methodCount = entities.reduce((sum, [, entity]) => sum + Object.keys(entity?.methods || {}).length, 0);
    const attributeCount = entities.reduce((sum, [, entity]) => sum + safeArray(entity?.attributes).length, 0);
    const group = getFileGroup(filePath);

    nodesByKind.file.push({
      id: fileId,
      data: {
        label: buildLabel(getShortFileName(filePath), filePath, `${entities.length} entities • ${methodCount} methods • ${attributeCount} attrs`),
        meta: {
          kind: 'file',
          filePath,
          group,
          entities: entities.length,
          methods: methodCount,
          attributes: attributeCount,
        },
      },
    });
    nodeDetails.set(fileId, {
      title: getShortFileName(filePath),
      lines: [filePath, `group: ${group}`, `entities: ${entities.length}`, `methods: ${methodCount}`, `attributes: ${attributeCount}`],
    });

    entities
      .sort(([left], [right]) => {
        if (!left && right) return -1;
        if (left && !right) return 1;
        return left.localeCompare(right);
      })
      .forEach(([entityName, entityValue]) => {
        const entity = entityValue || {};
        const entityId = `entity:${filePath}::${entityName || '(module)'}`;
        const displayName = entityName || '(module)';
        const methods = Object.entries(entity?.methods || {});
        const attributes = safeArray(entity?.attributes);
        const rootDeps = [...safeArray(entity?.deps), ...safeArray(entity?.['']?.deps)];

        nodesByKind.entity.push({
          id: entityId,
          data: {
            label: buildLabel(displayName, getShortFileName(filePath), `${methods.length} methods • ${attributes.length} attrs • ${rootDeps.length} deps`),
            meta: {
              kind: 'entity',
              filePath,
              entityName: displayName,
              methods: methods.length,
              attributes: attributes.length,
              rootDeps: rootDeps.length,
            },
          },
        });
        nodeDetails.set(entityId, {
          title: displayName,
          lines: [filePath, `methods: ${methods.length}`, `attributes: ${attributes.length}`, `root deps: ${rootDeps.length}`],
        });

        const fileEdgeId = `contains:${fileId}->${entityId}`;
        if (!edgeIds.has(fileEdgeId)) {
          edgeIds.add(fileEdgeId);
          edges.push(createEdge(fileEdgeId, fileId, entityId, '#94a3b8', 'contains'));
        }

        rootDeps.forEach((rawRef) => {
          const depNodeId = ensureDependencyNode(rawRef);
          const depEdgeId = `depends:${entityId}->${depNodeId}`;
          if (!edgeIds.has(depEdgeId)) {
            edgeIds.add(depEdgeId);
            edges.push(createEdge(depEdgeId, entityId, depNodeId, '#e11d48', 'depends'));
          }
        });

        methods.forEach(([methodName, deps]) => {
          const methodId = `method:${filePath}::${displayName}::${methodName}`;
          const methodDeps = safeArray(deps);

          nodesByKind.method.push({
            id: methodId,
            data: {
              label: buildLabel(methodName, displayName, `${methodDeps.length} deps`),
              meta: {
                kind: 'method',
                filePath,
                entityName: displayName,
                methodName,
                deps: methodDeps.length,
              },
            },
          });
          nodeDetails.set(methodId, {
            title: methodName,
            lines: [filePath, `entity: ${displayName}`, `deps: ${methodDeps.length}`],
          });

          const containsEdgeId = `contains:${entityId}->${methodId}`;
          if (!edgeIds.has(containsEdgeId)) {
            edgeIds.add(containsEdgeId);
            edges.push(createEdge(containsEdgeId, entityId, methodId, '#94a3b8', 'contains'));
          }

          methodDeps.forEach((rawRef) => {
            const depNodeId = ensureDependencyNode(rawRef);
            const depEdgeId = `depends:${methodId}->${depNodeId}`;
            if (!edgeIds.has(depEdgeId)) {
              edgeIds.add(depEdgeId);
              edges.push(createEdge(depEdgeId, methodId, depNodeId, '#e11d48', 'depends'));
            }
          });
        });

        attributes.forEach((attribute) => {
          const attributeName = attribute?.name || '(anonymous)';
          const attrDeps = safeArray(attribute?.deps);
          const attributeId = `attribute:${filePath}::${displayName}::${attributeName}`;

          nodesByKind.attribute.push({
            id: attributeId,
            data: {
              label: buildLabel(attributeName, displayName, `${attrDeps.length} deps`),
              meta: {
                kind: 'attribute',
                filePath,
                entityName: displayName,
                attributeName,
                deps: attrDeps.length,
              },
            },
          });
          nodeDetails.set(attributeId, {
            title: attributeName,
            lines: [filePath, `entity: ${displayName}`, `deps: ${attrDeps.length}`],
          });

          const containsEdgeId = `contains:${entityId}->${attributeId}`;
          if (!edgeIds.has(containsEdgeId)) {
            edgeIds.add(containsEdgeId);
            edges.push(createEdge(containsEdgeId, entityId, attributeId, '#94a3b8', 'contains'));
          }

          attrDeps.forEach((rawRef) => {
            const depNodeId = ensureDependencyNode(rawRef);
            const depEdgeId = `depends:${attributeId}->${depNodeId}`;
            if (!edgeIds.has(depEdgeId)) {
              edgeIds.add(depEdgeId);
              edges.push(createEdge(depEdgeId, attributeId, depNodeId, '#e11d48', 'depends'));
            }
          });
        });
      });
  });

  const nodes = [
    ...placeNodes(nodesByKind.file, 'file'),
    ...placeNodes(nodesByKind.entity, 'entity'),
    ...placeNodes(nodesByKind.method, 'method'),
    ...placeNodes(nodesByKind.attribute, 'attribute'),
    ...placeNodes(nodesByKind.dependency, 'dependency'),
  ];

  return {
    nodes,
    edges,
    detailsByNodeId: Object.fromEntries(nodeDetails.entries()),
    summary: {
      files: nodesByKind.file.length,
      entities: nodesByKind.entity.length,
      methods: nodesByKind.method.length,
      attributes: nodesByKind.attribute.length,
      dependencies: nodesByKind.dependency.length,
      totalNodes: nodes.length,
      totalEdges: edges.length,
    },
  };
}

export default buildRawGraphFromParser;
