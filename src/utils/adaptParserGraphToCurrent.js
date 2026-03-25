const safeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const getPathParts = (filePath = '') => filePath.split('/').filter(Boolean);
const getFileName = (filePath = '') => {
  const parts = getPathParts(filePath);
  return parts[parts.length - 1] || filePath;
};
const getFileStem = (filePath = '') => getFileName(filePath).replace(/\.py$/i, '');
const getFileGroup = (filePath = '') => {
  const parts = getPathParts(filePath);
  const startIndex = parts[0] === 'src' ? 1 : 0;
  return parts[startIndex] || 'root';
};
const normalizeLookup = (value = '') => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const ROOT_OVERRIDES = {
  DataManager: 'DatabaseManager',
  email_service: 'EmailService',
  broker_manager: 'BrokerManager',
  object_manager: 'ObjectManager',
};

const ENDPOINT_SERVICE_HINTS = {
  account_endpoints: 'AccountService',
  auth_endpoints: 'AuthService',
  core_endpoints: 'CoreService',
  project_endpoints: 'ProjectService',
};

const ENDPOINT_METHOD_OVERRIDES = {
  account_endpoints: {
    get_account: 'get_account_by_id',
    patch_account: 'patch_account_by_id',
    delete_account: 'delete_account_by_id',
    link_email: 'link_email',
    verification_email: 'verify_email',
    delete_email: 'delete_email',
  },
  auth_endpoints: {
    login: 'login',
    refresh: 'refresh',
    registration: 'registration',
    free_try: 'free_try',
  },
  core_endpoints: {
    homepage: 'get_homepage',
  },
  project_endpoints: {
    get_project: 'get_project_by_id',
    create_project: 'create_project',
    patch_project: 'update_project',
    delete_project: 'delete_project',
    get_projects_list: 'get_projects_by_account_id',
  },
};

const ENDPOINT_ROUTE_OVERRIDES = {
  account_endpoints: {
    get_account: 'GET /v1/account',
    patch_account: 'PATCH /v1/account',
    delete_account: 'DELETE /v1/account',
    link_email: 'POST /v1/account/email',
    verification_email: 'POST /v1/account/email/verify',
    delete_email: 'DELETE /v1/account/email',
  },
  auth_endpoints: {
    login: 'POST /v1/auth/login',
    refresh: 'POST /v1/auth/refresh',
    registration: 'POST /v1/auth/registration',
    free_try: 'POST /v1/auth/free-try',
  },
  core_endpoints: {
    homepage: 'GET /v1/home',
  },
  project_endpoints: {
    get_project: 'GET /v1/project/{project_id}',
    create_project: 'POST /v1/project',
    patch_project: 'PATCH /v1/project/{project_id}',
    delete_project: 'DELETE /v1/project/{project_id}',
    get_projects_list: 'GET /v1/project',
  },
  routers: {
    health_redis: 'GET /health/redis',
  },
};

const PUBLIC_ENDPOINTS = new Set(['login', 'registration', 'refresh', 'free_try']);

const parseDependencyRef = (rawRef = '') => {
  if (!rawRef || typeof rawRef !== 'string') return null;
  const match = rawRef.match(/^(.+?\.py)(?:\.(.+))?$/i);
  if (!match) return null;
  return {
    filePath: match[1],
    symbol: match[2] || '',
  };
};

const countDependencyRefs = (entity = {}) => {
  const rootDeps = [...safeArray(entity?.deps), ...safeArray(entity?.['']?.deps)];
  const methodDeps = Object.values(entity?.methods || {}).reduce((sum, deps) => sum + safeArray(deps).length, 0);
  const attrDeps = safeArray(entity?.attributes).reduce((sum, attr) => sum + safeArray(attr?.deps).length, 0);
  return rootDeps.length + methodDeps + attrDeps;
};

const registerSymbolSource = (symbolSources, symbolName, filePath, group) => {
  if (!symbolName) return;
  const root = symbolName.split('.')[0];
  if (!symbolSources[root]) {
    symbolSources[root] = { files: new Set(), groups: new Set() };
  }
  symbolSources[root].files.add(filePath);
  symbolSources[root].groups.add(group);
};

const mergePart = (partsMap, parent, children = []) => {
  if (!parent) return;
  const filteredChildren = children.filter((child) => child && child !== parent);
  if (filteredChildren.length === 0) return;
  if (!partsMap.has(parent)) partsMap.set(parent, new Set());
  filteredChildren.forEach((child) => partsMap.get(parent).add(child));
};

const buildRootAliasesByFile = (rawGraph) => {
  const aliasesByFile = {};

  Object.entries(rawGraph || {}).forEach(([filePath, entities]) => {
    const classLikeEntities = Object.keys(entities || {}).filter((entityName) => entityName && /^[A-Z]/.test(entityName));
    const classLikeByNormalized = new Map(classLikeEntities.map((entityName) => [normalizeLookup(entityName), entityName]));

    aliasesByFile[filePath] = {};

    Object.keys(entities || {}).forEach((entityName) => {
      if (!entityName) return;

      let canonical = ROOT_OVERRIDES[entityName] || entityName;
      if (!ROOT_OVERRIDES[entityName] && !/^[A-Z]/.test(entityName)) {
        const matchedClass = classLikeByNormalized.get(normalizeLookup(entityName));
        if (matchedClass) canonical = matchedClass;
      }

      aliasesByFile[filePath][entityName] = canonical;
    });
  });

  return aliasesByFile;
};

const normalizeSymbolChain = (symbol = '', filePath = '', rootAliasesByFile = {}) => {
  if (!symbol) return null;

  const parts = symbol.split('.').filter(Boolean);
  if (parts.length === 0) return null;

  const root = rootAliasesByFile[filePath]?.[parts[0]] || ROOT_OVERRIDES[parts[0]] || parts[0];
  const normalizedParts = [root, ...parts.slice(1)];

  if (root === 'CONFIG') {
    return normalizedParts.length > 1 ? `CONFIG.${normalizedParts[1]}` : 'CONFIG';
  }

  if (root === 'Base' && normalizedParts[1] === 'metadata') {
    return 'Base.metadata';
  }

  if (root === 'ErrorType' || root === 'VerifyEmailType') {
    return normalizedParts.slice(0, Math.min(2, normalizedParts.length)).join('.');
  }

  return normalizedParts.slice(0, Math.min(3, normalizedParts.length)).join('.');
};

const normalizeDependencies = (deps = [], rootAliasesByFile = {}) =>
  [...new Set(
    safeArray(deps)
      .map(parseDependencyRef)
      .filter((dep) => dep?.symbol)
      .map((dep) => normalizeSymbolChain(dep.symbol, dep.filePath, rootAliasesByFile))
      .filter(Boolean)
  )];

const buildServiceMethodsByClass = (rawGraph) => {
  const methodsByClass = {};

  Object.entries(rawGraph || {}).forEach(([filePath, entities]) => {
    if (getFileGroup(filePath) !== 'services') return;

    Object.entries(entities || {}).forEach(([entityName, entityValue]) => {
      const entity = entityValue || {};
      const methodNames = Object.keys(entity?.methods || {});
      if (!entityName || methodNames.length === 0) return;
      methodsByClass[entityName] = new Set(methodNames);
    });
  });

  return methodsByClass;
};

const inferEndpointTarget = (fileStem, endpointName, serviceMethodsByClass) => {
  if (fileStem === 'routers') {
    if (endpointName === 'health_redis') return 'Redis.check_redis';
    return null;
  }

  const serviceClass = ENDPOINT_SERVICE_HINTS[fileStem];
  if (!serviceClass) return null;

  const serviceMethods = serviceMethodsByClass[serviceClass] || new Set();
  const override = ENDPOINT_METHOD_OVERRIDES[fileStem]?.[endpointName];
  if (override) return `${serviceClass}.${override}`;
  if (serviceMethods.has(endpointName)) return `${serviceClass}.${endpointName}`;

  const guessedCandidates = [
    `${endpointName}_by_id`,
    endpointName.replace(/^patch_/, 'update_'),
    endpointName.replace(/^get_/, 'get_'),
  ];

  const matched = guessedCandidates.find((candidate) => serviceMethods.has(candidate));
  return matched ? `${serviceClass}.${matched}` : null;
};

const inferEndpointRoute = (fileStem, endpointName) =>
  ENDPOINT_ROUTE_OVERRIDES[fileStem]?.[endpointName] || null;

export function adaptParserGraphToCurrent(rawGraph = {}) {
  const rootAliasesByFile = buildRootAliasesByFile(rawGraph);
  const serviceMethodsByClass = buildServiceMethodsByClass(rawGraph);
  const partsMap = new Map();
  const symbolSources = {};
  const files = [];
  const endpoints = {};

  Object.entries(rawGraph || {}).forEach(([filePath, entities]) => {
    const group = getFileGroup(filePath);
    const fileEntities = Object.entries(entities || {});
    let methodsCount = 0;
    let attributesCount = 0;
    let dependencyRefs = 0;

    fileEntities.forEach(([entityName, entityValue]) => {
      const entity = entityValue || {};
      const canonicalRoot = entityName ? rootAliasesByFile[filePath]?.[entityName] || entityName : null;
      const entityRootDeps = normalizeDependencies(
        [...safeArray(entity?.deps), ...safeArray(entity?.['']?.deps)],
        rootAliasesByFile
      );

      methodsCount += Object.keys(entity?.methods || {}).length;
      attributesCount += safeArray(entity?.attributes).length;
      dependencyRefs += countDependencyRefs(entity);

      if (canonicalRoot) {
        registerSymbolSource(symbolSources, canonicalRoot, filePath, group);
      }

      if (canonicalRoot && entityRootDeps.length > 0) {
        mergePart(partsMap, canonicalRoot, entityRootDeps);
      }

      Object.entries(entity?.methods || {}).forEach(([methodName, deps]) => {
        const parent = canonicalRoot ? `${canonicalRoot}.${methodName}` : methodName;
        const children = normalizeDependencies(deps, rootAliasesByFile);
        registerSymbolSource(symbolSources, parent, filePath, group);
        mergePart(partsMap, parent, children);
      });

      safeArray(entity?.attributes).forEach((attribute) => {
        const children = normalizeDependencies(attribute?.deps, rootAliasesByFile);
        if (!canonicalRoot || children.length === 0) return;
        mergePart(partsMap, `${canonicalRoot}.${attribute.name}`, children);
      });

      const fileStem = getFileStem(filePath);
      const isEndpointCandidate =
        (group === 'endpoints' || fileStem === 'routers') &&
        entityName &&
        entityName !== 'lifespan' &&
        entityName === entityName.toLowerCase();

      if (isEndpointCandidate) {
        const route = inferEndpointRoute(fileStem, entityName);
        const target = inferEndpointTarget(fileStem, entityName, serviceMethodsByClass);
        const hasUserAttr = safeArray(entity?.attributes).some((attribute) => attribute?.name === 'user');
        const children = [...entityRootDeps];

        if (hasUserAttr && !PUBLIC_ENDPOINTS.has(entityName)) {
          children.push('AuthService.verify_token');
        }
        if (target) {
          children.push(target);
        }

        if (route && children.length > 0) {
          endpoints[entityName] = route;
          mergePart(partsMap, entityName, children);
        }
      }
    });

    files.push({
      path: filePath,
      fileName: getFileName(filePath),
      group,
      entityCount: fileEntities.length,
      methodsCount,
      attributesCount,
      dependencyRefs,
    });
  });

  const architectureData = [...partsMap.entries()]
    .map(([parent, children]) => ({
      parent,
      children: [...children],
    }))
    .filter((item) => item.parent && item.children.length > 0);

  const normalizedSymbolSources = Object.fromEntries(
    Object.entries(symbolSources).map(([symbol, info]) => [
      symbol,
      {
        files: [...info.files].sort(),
        groups: [...info.groups].sort(),
      },
    ])
  );

  return {
    requirements: [],
    endpoints,
    architectureData,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    symbolSources: normalizedSymbolSources,
    summary: {
      files: files.length,
      methods: files.reduce((sum, file) => sum + file.methodsCount, 0),
      attributes: files.reduce((sum, file) => sum + file.attributesCount, 0),
      dependencyRefs: files.reduce((sum, file) => sum + file.dependencyRefs, 0),
      endpoints: Object.keys(endpoints).length,
      architectureParts: architectureData.length,
    },
  };
}

export default adaptParserGraphToCurrent;
