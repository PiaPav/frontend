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
  // Строит накопленные смещения по строкам с учётом фактической высоты нод в строке
  const buildRowOffsets = (
    nodesForLayer,
    maxRows,
    fallbackHeight,
    verticalGap,
    baseY = START_Y,
    extraGapFactor = 0
  ) => {
    if (!nodesForLayer.length) return [];
    const rowCount = Math.ceil(nodesForLayer.length / maxRows);
    const rowHeights = Array.from({ length: rowCount }, () => fallbackHeight);
    nodesForLayer.forEach((node, idx) => {
      const row = idx % maxRows;
      rowHeights[row] = Math.max(rowHeights[row], getNodeHeight(node, fallbackHeight));
    });
    const offsets = [];
    let currentY = baseY;
    rowHeights.forEach((rowHeight) => {
      offsets.push(currentY);
      const extraGap = Math.max(0, rowHeight - fallbackHeight) * extraGapFactor;
      currentY += rowHeight + verticalGap + extraGap;
    });
    return offsets;
  };

  // Константы сетки
  const START_Y = 80;
  const REQ_X = -400;
  const REQ_Y_STEP = 60;

  const HTTP_BASE_X = 0;
  const HTTP_ROW_HEIGHT = 200;
  const HTTP_MAX_ROWS = 8;
  const HTTP_COL_WIDTH = 400;
  const HTTP_TO_CLASS_GAP = 380; // оставляем коридор между HTTP и классами

  const CLASS_STAGGER_X = 90;
  const CLASS_ROW_HEIGHT = 240;
  const CLASS_VERTICAL_GAP = 80;
  const CLASS_EXTRA_GAP_FACTOR = 0.35;
  const CLASS_MAX_ROWS = 4;
  const CLASS_COL_WIDTH = 440;
  const CLASS_COL_GAP = 120;

  const INFRA_STAGGER_X = 110;
  const INFRA_ROW_HEIGHT = 220;
  const INFRA_VERTICAL_GAP = 60;
  const INFRA_EXTRA_GAP_FACTOR = 0.3;
  const INFRA_MAX_ROWS = 4;
  const INFRA_COL_WIDTH = 360;
  const INFRA_COL_GAP = 120;
  const CLASS_TO_INFRA_GAP = 380; // коридор между классами и инфрой

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

  const classRowOffsets = buildRowOffsets(
    classNodes,
    CLASS_MAX_ROWS,
    CLASS_ROW_HEIGHT,
    CLASS_VERTICAL_GAP,
    START_Y,
    CLASS_EXTRA_GAP_FACTOR
  );

  classNodes.forEach((node, idx) => {
    const row = idx % CLASS_MAX_ROWS;
    const col = Math.floor(idx / CLASS_MAX_ROWS);
    const isOddRow = row % 2 === 1;
    node.position = {
      x: classBaseX + col * (CLASS_COL_WIDTH + CLASS_COL_GAP) + (isOddRow ? CLASS_STAGGER_X : 0),
      y: classRowOffsets[row] ?? START_Y,
    };
  });

  const classCols = Math.ceil(classNodes.length / CLASS_MAX_ROWS);
  const classLayerWidth = classCols ? classCols * (CLASS_COL_WIDTH + CLASS_COL_GAP) - CLASS_COL_GAP : 0;
  const infraBaseX = classBaseX + classLayerWidth + CLASS_TO_INFRA_GAP;

  const infraRowOffsets = buildRowOffsets(
    infraNodes,
    INFRA_MAX_ROWS,
    INFRA_ROW_HEIGHT,
    INFRA_VERTICAL_GAP,
    START_Y,
    INFRA_EXTRA_GAP_FACTOR
  );

  infraNodes.forEach((node, idx) => {
    const row = idx % INFRA_MAX_ROWS;
    const col = Math.floor(idx / INFRA_MAX_ROWS);
    const isOddRow = row % 2 === 1;
    node.position = {
      x: infraBaseX + col * (INFRA_COL_WIDTH + INFRA_COL_GAP) + (isOddRow ? INFRA_STAGGER_X : 0),
      y: infraRowOffsets[row] ?? START_Y,
    };
  });

  const infraCols = Math.ceil(infraNodes.length / INFRA_MAX_ROWS);
  const infraLayerWidth = infraCols ? infraCols * (INFRA_COL_WIDTH + INFRA_COL_GAP) - INFRA_COL_GAP : 0;
  const otherBaseX = infraBaseX + infraLayerWidth + 200;
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
