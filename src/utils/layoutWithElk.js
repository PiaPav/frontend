import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

export async function layoutWithElk(nodes, edges, direction = 'RIGHT') {
  const clonedNodes = nodes.map((n) => ({ ...n }));

  const requirements = [];
  const httpEndpoints = [];
  const classNodes = [];
  const infraNodes = [];
  const otherNodes = [];

  clonedNodes.forEach((node) => {
    const meta = node?.data?.meta || {};
    const layer = meta.layer;
    const kind = meta.kind;

    if (kind === 'requirement' || layer === 0) {
      requirements.push(node);
    } else if (kind === 'endpoint' || layer === 1) {
      httpEndpoints.push(node);
    } else if (kind === 'lane' && layer === 2) {
      classNodes.push(node);
    } else if (kind === 'lane' && layer === 3) {
      infraNodes.push(node);
    } else {
      otherNodes.push(node);
    }
  });

  // Детализация порядка для стабильной сетки
  httpEndpoints.sort((a, b) => {
    const ma = a.data?.meta || {};
    const mb = b.data?.meta || {};
    const aKey = `${ma.method || ''} ${ma.path || ''}`.trim() || a.id;
    const bKey = `${mb.method || ''} ${mb.path || ''}`.trim() || b.id;
    return aKey.localeCompare(bKey);
  });
  const laneSorter = (a, b) => {
    const ma = a.data?.meta || {};
    const mb = b.data?.meta || {};
    const aKey = ma.className || a.id;
    const bKey = mb.className || b.id;
    return aKey.localeCompare(bKey);
  };
  classNodes.sort(laneSorter);
  infraNodes.sort(laneSorter);

  const getNodeHeight = (node, fallback) => {
    const rawHeight = typeof node?.style?.height === 'number' ? node.style.height : parseFloat(node?.style?.height);
    return Number.isFinite(rawHeight) ? rawHeight : fallback;
  };

  // Константы сетки
  const START_Y = 80;
  const REQ_X = -400;
  const REQ_Y_STEP = 60;

  const HTTP_BASE_X = 0;
  const HTTP_ROW_HEIGHT = 140;
  const HTTP_MAX_ROWS = 8;
  const HTTP_COL_WIDTH = 260;
  const HTTP_TO_CLASS_GAP = 360;

  const CLASS_BASE_X_GAP = 300;
  const CLASS_ROW_HEIGHT = 240;
  const CLASS_VERTICAL_GAP = 80;
  const CLASS_MAX_ROWS = 4;
  const CLASS_COL_WIDTH = 440;

  const INFRA_BASE_X_GAP = 300;
  const INFRA_ROW_HEIGHT = 220;
  const INFRA_VERTICAL_GAP = 60;
  const INFRA_MAX_ROWS = 4;
  const INFRA_COL_WIDTH = 360;

  const OTHER_MAX_ROWS = 6;
  const OTHER_ROW_HEIGHT = 180;
  const OTHER_COL_WIDTH = 280;

  requirements.forEach((node, idx) => {
    node.position = {
      x: REQ_X,
      y: START_Y + idx * REQ_Y_STEP,
    };
  });

  httpEndpoints.forEach((node, idx) => {
    const row = idx % HTTP_MAX_ROWS;
    const col = Math.floor(idx / HTTP_MAX_ROWS);
    node.position = {
      x: HTTP_BASE_X + col * HTTP_COL_WIDTH,
      y: START_Y + row * HTTP_ROW_HEIGHT,
    };
  });

  const httpCols = Math.ceil(httpEndpoints.length / HTTP_MAX_ROWS);
  const classBaseX = HTTP_BASE_X + httpCols * HTTP_COL_WIDTH + HTTP_TO_CLASS_GAP;

  const maxClassHeight = classNodes.reduce(
    (max, node) => Math.max(max, getNodeHeight(node, CLASS_ROW_HEIGHT)),
    CLASS_ROW_HEIGHT
  );
  const effectiveClassRowHeight = Math.max(CLASS_ROW_HEIGHT, maxClassHeight + CLASS_VERTICAL_GAP);

  classNodes.forEach((node, idx) => {
    const row = idx % CLASS_MAX_ROWS;
    const col = Math.floor(idx / CLASS_MAX_ROWS);
    node.position = {
      x: classBaseX + col * CLASS_COL_WIDTH,
      y: START_Y + row * effectiveClassRowHeight,
    };
  });

  const classCols = Math.ceil(classNodes.length / CLASS_MAX_ROWS);
  const infraBaseX = classBaseX + classCols * CLASS_COL_WIDTH + INFRA_BASE_X_GAP;

  const maxInfraHeight = infraNodes.reduce(
    (max, node) => Math.max(max, getNodeHeight(node, INFRA_ROW_HEIGHT)),
    INFRA_ROW_HEIGHT
  );
  const effectiveInfraRowHeight = Math.max(INFRA_ROW_HEIGHT, maxInfraHeight + INFRA_VERTICAL_GAP);

  infraNodes.forEach((node, idx) => {
    const row = idx % INFRA_MAX_ROWS;
    const col = Math.floor(idx / INFRA_MAX_ROWS);
    node.position = {
      x: infraBaseX + col * INFRA_COL_WIDTH,
      y: START_Y + row * effectiveInfraRowHeight,
    };
  });

  const otherBaseX = infraBaseX + Math.max(1, Math.ceil(infraNodes.length / INFRA_MAX_ROWS)) * INFRA_COL_WIDTH + 200;
  otherNodes.forEach((node, idx) => {
    const row = idx % OTHER_MAX_ROWS;
    const col = Math.floor(idx / OTHER_MAX_ROWS);
    node.position = {
      x: otherBaseX + col * OTHER_COL_WIDTH,
      y: START_Y + row * OTHER_ROW_HEIGHT,
    };
  });

  return {
    nodes: clonedNodes,
    edges,
  };
}
