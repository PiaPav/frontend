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
import styles from './ProjectAnalysis.module.css';
import { projectsAPI } from '../../services/api';

export default function ProjectAnalysis() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  
  // Данные проекта с сервера
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architectureData, setArchitectureData] = useState([]);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Автосохранение архитектуры при выходе со страницы
  useEffect(() => {
    const saveArchitecture = async () => {
      // Сохраняем только если есть данные для сохранения
      if (!project || !architectureData || architectureData.length === 0) return;
      
      try {
        console.log('💾 Сохранение архитектуры проекта...');
        
        // Преобразуем массив architectureData обратно в объект
        const dataObject = {};
        architectureData.forEach(item => {
          dataObject[item.parent] = item.children;
        });
        
        await projectsAPI.update(project.id, {
          architecture: {
            requirements: requirements,
            endpoints: endpoints,
            data: dataObject
          }
        });
        
        console.log('✅ Архитектура сохранена в БД');
      } catch (err) {
        console.error('❌ Ошибка сохранения архитектуры:', err);
      }
    };

    // Сохраняем при размонтировании компонента (уход со страницы)
    return () => {
      saveArchitecture();
    };
  }, [project, requirements, endpoints, architectureData]);

  // Загрузка данных проекта с сервера
  useEffect(() => {
    const loadProject = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔍 Загрузка проекта ID:', id);
        const projectData = await projectsAPI.getById(id);
        console.log('✅ Получены данные проекта:', projectData);
        
        setProject(projectData);
        
        // Извлекаем данные из architecture
        if (projectData.architecture) {
          const arch = projectData.architecture;
          console.log('� Architecture данные:', arch);
          
          // Requirements
          if (arch.requirements && Array.isArray(arch.requirements)) {
            setRequirements(arch.requirements);
            console.log('✓ Requirements:', arch.requirements.length);
          }
          
          // Endpoints - могут быть массивом объектов или объектом
          if (arch.endpoints) {
            let endpointsObj = {};
            
            if (Array.isArray(arch.endpoints)) {
              // Если массив объектов: [{key1: value1}, {key2: value2}]
              arch.endpoints.forEach(endpoint => {
                Object.entries(endpoint).forEach(([key, value]) => {
                  endpointsObj[key] = value;
                });
              });
            } else if (typeof arch.endpoints === 'object') {
              // Если уже объект: {key1: value1, key2: value2}
              endpointsObj = arch.endpoints;
            }
            
            setEndpoints(endpointsObj);
            console.log('✓ Endpoints:', Object.keys(endpointsObj).length);
          }
          
          // Architecture data - преобразуем из объекта в массив
          if (arch.data && typeof arch.data === 'object') {
            const archArray = Object.entries(arch.data).map(([parent, children]) => ({
              parent,
              children: Array.isArray(children) ? children : []
            }));
            setArchitectureData(archArray);
            console.log('✓ Architecture data:', archArray.length, 'связей');
          }
        } else {
          console.warn('⚠️ Нет данных architecture в проекте');
        }
        
        setLoading(false);
      } catch (err) {
        console.error('❌ Ошибка загрузки проекта:', err);
        console.error('Детали ошибки:', err.response?.data);
        setError(err.response?.data?.detail || err.message || 'Не удалось загрузить проект');
        setLoading(false);
      }
    };

    if (id) {
      loadProject();
    }
  }, [id]);

  // Построение динамического графа из данных с сервера
  useEffect(() => {
    // Проверяем что данные загружены и не пустые
    if (!project) return;
    if (!endpoints || Object.keys(endpoints).length === 0) {
      console.log('⏳ Endpoints пока пусты, ожидание данных...');
      return;
    }

    // Debounce - обновляем граф раз в 600ms вместо каждого сообщения
    const debounceTimer = setTimeout(() => {
      const newNodes = [];
      const newEdges = [];

      // Конфигурация слоев
      const LAYER_GAP = 420; // Увеличено для равных расстояний
      const START_X = 100;
      const START_Y = 50;
      const NODE_HEIGHT = 80; // Средняя высота узла для расчета позиций

      console.log('🔄 Перестраиваем граф. Architecture данных:', architectureData.length);

      // === ФУНКЦИЯ ОПРЕДЕЛЕНИЯ ТИПА УЗЛА (мемоизация) ===
      const nodeTypeCache = new Map();
      const getNodeType = (nodeName) => {
        if (nodeTypeCache.has(nodeName)) {
          return nodeTypeCache.get(nodeName);
        }
        
        let result;
        
        // HTTP Endpoints (из endpoints)
        if (endpoints[nodeName]) {
          result = { type: 'endpoint', layer: 2 };
        }
        // Services (точно соответствуют AuthService, AccountService, ProjectService, CoreService)
        else if (['AuthService', 'AccountService', 'ProjectService', 'CoreService'].includes(nodeName)) {
          result = { type: 'service', layer: 3 };
        }
        // Service methods (AuthService.login, AccountService.get_account_by_id и т.д.)
        else if (nodeName.includes('Service.')) {
          result = { type: 'service-method', layer: 3.5 };
        }
        // Database methods (Account.*, Project.*)
        else if (nodeName.startsWith('Account.') || nodeName.startsWith('Project.')) {
          result = { type: 'database-method', layer: 4 };
        }
        // DatabaseManager
        else if (nodeName.startsWith('DatabaseManager.') || nodeName === 'DatabaseManager') {
          result = { type: 'database-manager', layer: 4 };
        }
        // Broker
        else if (nodeName.startsWith('Broker.') || nodeName === 'Broker') {
          result = { type: 'broker', layer: 5 };
        }
        // Остальное - прочие компоненты
        else {
          result = { type: 'other', layer: 5 };
        }
        
        nodeTypeCache.set(nodeName, result);
        return result;
      };

    // === СБОР ВСЕХ УНИКАЛЬНЫХ УЗЛОВ ИЗ ARCHITECTURE DATA ===
    const allNodes = new Set();
    
    // Фильтр для неинформативных данных (системные функции, встроенные методы)
    const isInformativeNode = (nodeName) => {
      // Список паттернов для исключения неинформативных узлов
      const excludePatterns = [
        // Python магические методы и встроенные функции
        /^__\w+__$/,           // __init__, __str__, __name__ и т.д.
        /^super$/,             // super()
        /^self\./,             // self.method
        /^str$/,               // str()
        /^int$/,               // int()
        /^bool$/,              // bool()
        /^float$/,             // float()
        /^list$/,              // list()
        /^dict$/,              // dict()
        /^tuple$/,             // tuple()
        /^set$/,               // set()
        /^len$/,               // len()
        /^print$/,             // print()
        /^range$/,             // range()
        /^enumerate$/,         // enumerate()
        /^zip$/,               // zip()
        /^map$/,               // map()
        /^filter$/,            // filter()
        /^sorted$/,            // sorted()
        /^reversed$/,          // reversed()
        /^any$/,               // any()
        /^all$/,               // all()
        /^sum$/,               // sum()
        /^min$/,               // min()
        /^max$/,               // max()
        /^abs$/,               // abs()
        /^round$/,             // round()
        /^type$/,              // type()
        /^isinstance$/,        // isinstance()
        /^issubclass$/,        // issubclass()
        /^callable$/,          // callable()
        /^hasattr$/,           // hasattr()
        /^getattr$/,           // getattr()
        /^setattr$/,           // setattr()
        /^delattr$/,           // delattr()
        
        // Методы коллекций
        /^items$/,             // dict.items()
        /^keys$/,              // dict.keys()
        /^values$/,            // dict.values()
        /^append$/,            // list.append()
        /^extend$/,            // list.extend()
        /^insert$/,            // list.insert()
        /^update$/,            // dict.update()
        /^get$/,               // dict.get()
        /^pop$/,               // list/dict.pop()
        /^remove$/,            // list.remove()
        /^clear$/,             // list.clear()
        /^copy$/,              // copy()
        /^index$/,             // list.index()
        /^count$/,             // list.count()
        /^sort$/,              // list.sort()
        /^reverse$/,           // list.reverse()
        
        // Методы строк
        /^format$/,            // format()
        /^join$/,              // str.join()
        /^split$/,             // str.split()
        /^strip$/,             // str.strip()
        /^lstrip$/,            // str.lstrip()
        /^rstrip$/,            // str.rstrip()
        /^replace$/,           // str.replace()
        /^lower$/,             // str.lower()
        /^upper$/,             // str.upper()
        /^capitalize$/,        // str.capitalize()
        /^title$/,             // str.title()
        /^startswith$/,        // str.startswith()
        /^endswith$/,          // str.endswith()
        /^find$/,              // str.find()
        /^rfind$/,             // str.rfind()
        /^encode$/,            // str.encode()
        /^decode$/,            // str.decode()
        
        // SQLAlchemy и ORM методы
        /^select$/,            // select()
        /^where$/,             // where()
        /^order_by$/,          // order_by()
        /^group_by$/,          // group_by()
        /^having$/,            // having()
        /^limit$/,             // limit()
        /^offset$/,            // offset()
        /^join$/,              // join()
        /^outerjoin$/,         // outerjoin()
        /^subquery$/,          // subquery()
        /^alias$/,             // alias()
        /^scalar$/,            // scalar()
        /^scalar_one$/,        // scalar_one()
        /^scalar_one_or_none$/,// scalar_one_or_none()
        /^all$/,               // all()
        /^first$/,             // first()
        /^one$/,               // one()
        /^one_or_none$/,       // one_or_none()
        /^execute$/,           // execute()
        /^fetchall$/,          // fetchall()
        /^fetchone$/,          // fetchone()
        /^fetchmany$/,         // fetchmany()
        /^commit$/,            // commit()
        /^rollback$/,          // rollback()
        /^flush$/,             // flush()
        /^refresh$/,           // refresh()
        /^expire$/,            // expire()
        /^expunge$/,           // expunge()
        /^merge$/,             // merge()
        /^add$/,               // add()
        /^delete$/,            // delete()
        /^query$/,             // query()
        
        // FastAPI и Pydantic
        /^model_dump$/,        // model_dump()
        /^model_validate$/,    // model_validate()
        /^dict$/,              // dict()
        /^json$/,              // json()
        /^parse_obj$/,         // parse_obj()
        /^parse_raw$/,         // parse_raw()
        /^schema$/,            // schema()
        /^fields$/,            // fields()
        
        // HTTP и роутинг (низкоуровневые)
        /^router\.\w+$/,      // router.get, router.post и т.д.
        /^status_code$/,       // status_code
        /^headers$/,           // headers
        /^cookies$/,           // cookies
        /^params$/,            // params
        /^body$/,              // body
        
        // Логирование базовое
        /^log\.debug$/,        // log.debug()
        /^log\.warning$/,      // log.warning()
        
        // Общие служебные
        /^ValueError$/,        // ValueError
        /^TypeError$/,         // TypeError
        /^KeyError$/,          // KeyError
        /^AttributeError$/,    // AttributeError
        /^IndexError$/,        // IndexError
        /^RuntimeError$/,      // RuntimeError
      ];
      
      // Проверяем каждый паттерн
      return !excludePatterns.some(pattern => pattern.test(nodeName));
    };
    
    architectureData.forEach(({ parent, children }) => {
      // Добавляем parent только если он информативен
      if (isInformativeNode(parent)) {
        allNodes.add(parent);
      }
      
      children.forEach(child => {
        // Убираем префиксы типа 'accounts/', 'datamanager/' и т.д.
        const cleanChild = child.split('/').pop();
        
        // Добавляем child только если он информативен
        if (isInformativeNode(cleanChild)) {
          allNodes.add(cleanChild);
        }
      });
    });

    // === ГРУППИРОВКА УЗЛОВ ПО СЛОЯМ ===
    const nodesByLayer = {
      1: ['main-service'], // Main Service всегда один
      2: [], // Endpoints
      3: [], // Services (AuthService, AccountService, ProjectService, CoreService)
      3.5: [], // Service methods (AuthService.login, AccountService.get_account_by_id)
      4: [], // Database components
      5: [], // Broker и прочее
    };

    allNodes.forEach(nodeName => {
      const { layer } = getNodeType(nodeName);
      if (!nodesByLayer[layer]) {
        nodesByLayer[layer] = [];
      }
      nodesByLayer[layer].push(nodeName);
    });

    // Добавляем endpoints в слой 2 (берем только из endpoints, не из architectureData)
    nodesByLayer[2] = Object.keys(endpoints);

    // Отладка: выводим количество узлов на каждом слое
    console.log('📊 Узлы по слоям:', {
      'Layer 1 (Main)': nodesByLayer[1].length,
      'Layer 2 (Endpoints)': nodesByLayer[2].length,
      'Layer 3 (Services)': nodesByLayer[3].length,
      'Layer 3.5 (Service Methods)': (nodesByLayer[3.5] || []).length,
      'Layer 4 (Database)': nodesByLayer[4].length,
      'Layer 5 (Broker & Other)': nodesByLayer[5].length,
    });

    // === LAYER 1: Main Service ===
    newNodes.push({
      id: 'main-service',
      type: 'default',
      position: { x: START_X, y: START_Y + 300 },
      data: {
        label: (
          <div className={styles.nodeLabel}>
            <div className={styles.nodeTitle}>🚀 Main Service</div>
            <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '4px' }}>FastAPI</div>
          </div>
        ),
      },
      style: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '16px',
        padding: '24px 28px',
        width: 200,
        fontWeight: 'bold',
        fontSize: '16px',
        boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    });

    // === LAYER 2: API Endpoints (динамически из данных) ===
    const methodColors = {
      'GET': { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669' },
      'POST': { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb' },
      'PATCH': { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#d97706' },
      'PUT': { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed' },
      'DELETE': { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#dc2626' },
    };

    // Сортируем эндпоинты по HTTP методам
    const endpointsList = nodesByLayer[2].map(key => ({ key, value: endpoints[key] }));
    const methodOrder = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
    const sortedEndpoints = endpointsList.sort((a, b) => {
      const methodA = a.value.split(' ')[0];
      const methodB = b.value.split(' ')[0];
      return methodOrder.indexOf(methodA) - methodOrder.indexOf(methodB);
    });

    sortedEndpoints.forEach(({ key, value }, idx) => {
      const method = value.split(' ')[0];
      const path = value.split(' ')[1] || '';
      const color = methodColors[method] || methodColors['GET'];
      
      newNodes.push({
        id: `endpoint-${key}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP, y: START_Y + idx * 120 },
        data: {
          label: (
            <div className={styles.endpointCard}>
              <div className={styles.endpointMethod} style={{ background: color.bg }}>
                {method}
              </div>
              <div className={styles.endpointPath}>{path}</div>
              <div className={styles.endpointKey}>{key}</div>
            </div>
          ),
        },
        style: {
          background: 'white',
          color: '#1e293b',
          border: `2px solid ${color.border}`,
          borderRadius: '12px',
          padding: '14px 18px',
          width: 240,
          fontWeight: '600',
          fontSize: '12px',
          boxShadow: `0 4px 16px ${color.border}30`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });

      // Соединяем Main Service с эндпоинтами (справа)
      newEdges.push({
        id: `edge-main-${key}`,
        source: 'main-service',
        target: `endpoint-${key}`,
        type: 'smoothstep',
        animated: true,
        style: { 
          stroke: color.border, 
          strokeWidth: 2.5,
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: color.border, 
          width: 22, 
          height: 22 
        },
        sourceHandle: 'right',
        targetHandle: 'left',
      });
    });

    // === LAYER 3: Services (динамически из данных) ===
    const serviceColors = {
      'AuthService': { color: '#8b5cf6', icon: '🔐', label: 'Auth' },
      'AccountService': { color: '#3b82f6', icon: '👤', label: 'Account' },
      'ProjectService': { color: '#10b981', icon: '📁', label: 'Project' },
      'CoreService': { color: '#f59e0b', icon: '⚙️', label: 'Core' },
    };

    nodesByLayer[3].forEach((serviceName, idx) => {
      const serviceConfig = serviceColors[serviceName] || { 
        color: '#64748b', 
        icon: '⚙️', 
        label: serviceName.replace('Service', '') 
      };
      
      newNodes.push({
        id: serviceName,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2, y: START_Y + idx * 200 },
        data: {
          label: (
            <div className={styles.serviceLabel}>
              <div style={{ 
                fontSize: '8px', 
                fontWeight: '700', 
                background: 'rgba(255,255,255,0.25)',
                padding: '3px 10px',
                borderRadius: '8px',
                marginBottom: '8px',
                letterSpacing: '0.5px'
              }}>
                SERVICE
              </div>
              <div style={{ fontSize: '16px', marginBottom: '4px' }}>{serviceConfig.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>{serviceConfig.label}</div>
            </div>
          ),
        },
        style: {
          background: `linear-gradient(135deg, ${serviceConfig.color} 0%, ${serviceConfig.color}dd 100%)`,
          color: 'white',
          border: 'none',
          borderRadius: '14px',
          padding: '20px 24px',
          width: 180,
          fontWeight: '700',
          fontSize: '15px',
          textAlign: 'center',
          boxShadow: `0 6px 20px ${serviceConfig.color}50`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // === LAYER 3.5: Service Methods (методы сервисов) ===
    (nodesByLayer[3.5] || []).forEach((methodName, idx) => {
      // Определяем к какому сервису относится метод
      const serviceName = methodName.split('.')[0]; // AuthService, AccountService и т.д.
      const methodShortName = methodName.split('.')[1]; // login, get_account_by_id и т.д.
      
      const serviceConfig = serviceColors[serviceName] || { color: '#64748b' };
      
      newNodes.push({
        id: methodName,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2.4, y: START_Y + idx * 110 },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ 
                fontSize: '7px', 
                fontWeight: '700', 
                color: serviceConfig.color,
                background: `${serviceConfig.color}15`,
                padding: '2px 8px',
                borderRadius: '6px',
                marginBottom: '6px',
                display: 'inline-block',
                border: `1px solid ${serviceConfig.color}40`,
                letterSpacing: '0.5px'
              }}>
                {serviceName.replace('Service', '').toUpperCase()} METHOD
              </div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: serviceConfig.color }}>
                {methodShortName}
              </div>
            </div>
          ),
        },
        style: {
          background: 'white',
          border: `2px solid ${serviceConfig.color}`,
          borderRadius: '10px',
          padding: '10px 14px',
          width: 140,
          fontSize: '11px',
          fontWeight: '600',
          boxShadow: `0 3px 12px ${serviceConfig.color}30`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // === LAYER 4: Database components (динамически из данных) ===
    nodesByLayer[4].forEach((nodeName, idx) => {
      const isDatabaseManager = nodeName.startsWith('DatabaseManager');
      const isAccountDB = nodeName.startsWith('Account.');
      const isProjectDB = nodeName.startsWith('Project.');
      
      let nodeStyle, nodeLabel;
      
      if (isDatabaseManager) {
        nodeStyle = {
          background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
          color: 'white',
          border: '3px solid #0e7490',
          borderRadius: '16px',
          padding: '18px 22px',
          width: 160,
          fontWeight: '700',
          fontSize: '13px',
          textAlign: 'center',
          boxShadow: '0 6px 20px rgba(6, 182, 212, 0.4)',
        };
        const methodName = nodeName.replace('DatabaseManager.', '');
        nodeLabel = (
          <div className={styles.dbManagerLabel}>
            <div style={{ 
              fontSize: '8px', 
              fontWeight: '700', 
              background: 'rgba(255,255,255,0.2)',
              padding: '3px 8px',
              borderRadius: '6px',
              marginBottom: '6px'
            }}>
              DATABASE MANAGER
            </div>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>🗄️</div>
            <div style={{ fontSize: '12px' }}>{methodName}</div>
          </div>
        );
      } else {
        const dbColor = isAccountDB ? '#3b82f6' : isProjectDB ? '#10b981' : '#64748b';
        const dbIcon = isAccountDB ? '👥' : isProjectDB ? '📊' : '🗃️';
        const dbType = isAccountDB ? 'ACCOUNT DB' : isProjectDB ? 'PROJECT DB' : 'DATABASE';
        const dbLabel = nodeName.split('.').pop();
        
        nodeStyle = {
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          color: 'white',
          border: `3px solid ${dbColor}`,
          borderRadius: '20px',
          padding: '16px 20px',
          width: 140,
          fontWeight: '600',
          fontSize: '12px',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.5)',
        };
        nodeLabel = (
          <div className={styles.dbLabel}>
            <div style={{ 
              fontSize: '7px', 
              fontWeight: '700', 
              background: `${dbColor}30`,
              color: dbColor,
              padding: '2px 6px',
              borderRadius: '4px',
              marginBottom: '6px',
              letterSpacing: '0.5px'
            }}>
              {dbType}
            </div>
            <div style={{ fontSize: '20px', marginBottom: '4px' }}>{dbIcon}</div>
            <div style={{ fontWeight: '700', fontSize: '10px' }}>{dbLabel}</div>
          </div>
        );
      }
      
      newNodes.push({
        id: nodeName,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3.2, y: START_Y + idx * 180 },
        data: { label: nodeLabel },
        style: nodeStyle,
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // === LAYER 5: Broker и прочие компоненты (компактное расположение) ===
    // Фильтруем Util компоненты
    const filteredLayer5 = nodesByLayer[5].filter(nodeName => {
      const isBroker = nodeName.startsWith('Broker');
      if (isBroker) return true;
      
      // Определяем тип
      let componentType = 'Util';
      if (nodeName.includes('Exception') || nodeName.includes('Error')) {
        componentType = 'Exception';
      } else if (nodeName.startsWith('log.')) {
        componentType = 'Logger';
      } else if (nodeName.includes('session') || nodeName.includes('Session')) {
        componentType = 'Session';
      } else if (nodeName.includes('Depends') || nodeName.includes('router')) {
        componentType = 'FastAPI';
      }
      
      // Исключаем Util
      return componentType !== 'Util';
    });
    
    filteredLayer5.forEach((nodeName, idx) => {
      const isBroker = nodeName.startsWith('Broker');
      
      // Компактное расположение
      const column = Math.floor(idx / 10); // 10 элементов в колонке
      const row = idx % 10; // Позиция в колонке
      const xPosition = START_X + LAYER_GAP * 4 + column * 180;
      const yPosition = START_Y + row * 100; // Увеличено с 85 до 100 для лучшей видимости
      
      if (isBroker) {
        const brokerMethod = nodeName.replace('Broker.', '');
        newNodes.push({
          id: nodeName,
          type: 'default',
          position: { x: xPosition, y: yPosition + 300 },
          data: {
            label: (
              <div className={styles.brokerLabel}>
                <div style={{ 
                  fontSize: '7px', 
                  fontWeight: '700', 
                  background: 'rgba(255,255,255,0.25)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  marginBottom: '6px',
                  letterSpacing: '0.5px'
                }}>
                  MESSAGE BROKER
                </div>
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>📮</div>
                <div style={{ fontWeight: '700', fontSize: '11px' }}>{brokerMethod}</div>
              </div>
            ),
          },
          style: {
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            color: 'white',
            border: '4px solid #c2410c',
            borderRadius: '50%',
            padding: '24px',
            width: 140,
            height: 140,
            fontWeight: 'bold',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 28px rgba(249, 115, 22, 0.5)',
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      } else {
        // Прочие компоненты - определяем тип по имени
        let componentType = 'Util';
        let componentColor = '#64748b';
        let componentBg = '#f1f5f9';
        let componentIcon = '⚙️';
        
        if (nodeName.includes('Exception') || nodeName.includes('Error')) {
          componentType = 'Exception';
          componentColor = '#dc2626';
          componentBg = '#fef2f2';
          componentIcon = '⚠️';
        } else if (nodeName.startsWith('log.')) {
          componentType = 'Logger';
          componentColor = '#7c3aed';
          componentBg = '#faf5ff';
          componentIcon = '📝';
        } else if (nodeName.includes('session') || nodeName.includes('Session')) {
          componentType = 'Session';
          componentColor = '#0891b2';
          componentBg = '#ecfeff';
          componentIcon = '🔗';
        } else if (nodeName.includes('Depends') || nodeName.includes('router')) {
          componentType = 'FastAPI';
          componentColor = '#059669';
          componentBg = '#f0fdf4';
          componentIcon = '🚀';
        }
        
        const shortName = nodeName.split('.').pop();
        
        newNodes.push({
          id: nodeName,
          type: 'default',
          position: { x: xPosition, y: yPosition },
          data: {
            label: (
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  fontSize: '9px', 
                  fontWeight: '700', 
                  color: componentColor,
                  background: componentBg,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  marginBottom: '6px',
                  display: 'inline-block',
                  border: `1px solid ${componentColor}40`
                }}>
                  {componentIcon} {componentType}
                </div>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#1e293b' }}>
                  {shortName}
                </div>
              </div>
            ),
          },
          style: {
            background: 'white',
            border: `2px solid ${componentColor}`,
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '11px',
            fontWeight: '600',
            boxShadow: `0 3px 12px ${componentColor}30`,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      }
    });

    // === ДИНАМИЧЕСКИЕ СОЕДИНЕНИЯ ИЗ ARCHITECTURE DATA ===
    // 1. Main Service -> Endpoints (только если endpoint существует)
    Object.keys(endpoints).forEach((endpointKey) => {
      const endpointId = `endpoint-${endpointKey}`;
      // Проверяем что endpoint существует в графе
      const endpointExists = newNodes.some(n => n.id === endpointId);
      if (!endpointExists) return;
      
      const method = endpoints[endpointKey].split(' ')[0];
      const methodColor = methodColors[method]?.border || '#64748b';
      
      newEdges.push({
        id: `edge-main-${endpointKey}`,
        source: 'main-service',
        target: `endpoint-${endpointKey}`,
        type: 'smoothstep',
        animated: false, // Отключаем анимацию для производительности
        style: { stroke: methodColor, strokeWidth: 2.5 },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: methodColor, 
          width: 22, 
          height: 22 
        },
      });
    });

    // 2. Соединения из ARCHITECTURE данных (parent -> children)
    architectureData.forEach(({ parent, children }) => {
      children.forEach(child => {
        // Убираем префиксы типа 'accounts/', 'datamanager/', 'auth_service/'
        const cleanChild = child.split('/').pop();
        
        // Определяем ID для parent (endpoints имеют префикс 'endpoint-')
        const parentId = endpoints[parent] ? `endpoint-${parent}` : parent;
        
        // Проверяем что оба узла существуют в графе
        const parentExists = newNodes.some(n => n.id === parentId);
        const childExists = newNodes.some(n => n.id === cleanChild);
        
        if (!parentExists || !childExists) {
          return; // Пропускаем если узлы не найдены
        }
        
        // Определяем цвет соединения в зависимости от типов узлов
        let edgeColor = '#94a3b8';
        const parentType = getNodeType(parent).type;
        const childType = getNodeType(cleanChild).type;
        
        if (parentType === 'endpoint') {
          // Endpoint -> Service method (цвет метода HTTP)
          const method = endpoints[parent].split(' ')[0];
          edgeColor = methodColors[method]?.border || '#64748b';
        } else if (parentType === 'service' || parentType === 'service-method') {
          // Service/Method -> что-то (цвет сервиса)
          const serviceName = parent.split('.')[0];
          edgeColor = serviceColors[serviceName]?.color || '#64748b';
        } else if (childType === 'database-manager') {
          edgeColor = '#06b6d4';
        } else if (childType === 'broker') {
          edgeColor = '#f97316';
        }
        
        newEdges.push({
          id: `edge-${parentId}-${cleanChild}`,
          source: parentId,
          target: cleanChild,
          type: 'smoothstep',
          animated: false,
          style: { stroke: edgeColor, strokeWidth: 2 },
          markerEnd: { 
            type: MarkerType.ArrowClosed, 
            color: edgeColor, 
            width: 20, 
            height: 20 
          },
        });
      });
    });

      setNodes(newNodes);
      setEdges(newEdges);
      if (isFirstLoad && newNodes.length > 0) {
        setIsFirstLoad(false);
      }
    }, 600); // Обновляем граф раз в 600ms

    return () => clearTimeout(debounceTimer);
  }, [endpoints, architectureData, setNodes, setEdges]);

  // Обработчик наведения на узел - подсвечиваем исходящие стрелки
  const onNodeMouseEnter = useCallback((event, node) => {
    setHoveredNode(node.id);
    
    // Обновляем стрелки: делаем ярче те, которые исходят из этого узла
    setEdges((eds) => 
      eds.map((edge) => {
        if (edge.source === node.id) {
          // Подсвечиваем исходящие стрелки
          return {
            ...edge,
            style: { 
              ...edge.style, 
              strokeWidth: 4, 
              opacity: 1,
              filter: 'drop-shadow(0 0 8px currentColor)'
            },
            animated: true,
            zIndex: 1000
          };
        } else {
          // Делаем остальные стрелки полупрозрачными
          return {
            ...edge,
            style: { 
              ...edge.style, 
              opacity: 0.15
            },
            animated: false
          };
        }
      })
    );
  }, [setEdges]);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
    
    // Возвращаем стрелкам исходный вид
    setEdges((eds) => 
      eds.map((edge) => ({
        ...edge,
        style: { 
          stroke: edge.style.stroke, 
          strokeWidth: edge.id.includes('edge-main-') ? 2.5 : 2,
          opacity: 1,
          filter: 'none'
        },
        animated: false
      }))
    );
  }, [setEdges]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Отображение статуса загрузки или ошибки
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.controlBar}>
          <button onClick={() => navigate('/projects')} className={styles.backBtn}>
            ← Назад
          </button>
          <div className={styles.titleContainer}>
            <h1 className={styles.title}>Анализ проекта #{id}</h1>
          </div>
        </div>
        <div className={styles.flowWrapper}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Загрузка проекта...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.controlBar}>
          <button onClick={() => navigate('/projects')} className={styles.backBtn}>
            ← Назад
          </button>
          <div className={styles.titleContainer}>
            <h1 className={styles.title}>Анализ проекта #{id}</h1>
          </div>
        </div>
        <div className={styles.flowWrapper}>
          <div className={styles.loadingState}>
            <p style={{ color: '#ef4444' }}>⚠️ {error}</p>
            <button 
              onClick={() => window.location.reload()} 
              style={{ 
                marginTop: '20px', 
                padding: '10px 20px', 
                background: '#3b82f6', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Проверка наличия данных архитектуры
  const hasArchitectureData = project?.architecture && (
    (project.architecture.requirements && project.architecture.requirements.length > 0) ||
    (project.architecture.endpoints && Object.keys(project.architecture.endpoints).length > 0) ||
    (project.architecture.data && Object.keys(project.architecture.data).length > 0)
  );

  if (!loading && !hasArchitectureData) {
    return (
      <div className={styles.container}>
        <div className={styles.controlBar}>
          <button onClick={() => navigate('/projects')} className={styles.backBtn}>
            ← Назад
          </button>
          <div className={styles.titleContainer}>
            <h1 className={styles.title}>{project?.name || `Проект #${id}`}</h1>
            {project?.description && (
              <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                {project.description}
              </p>
            )}
          </div>
        </div>
        <div className={styles.flowWrapper}>
          <div className={styles.loadingState}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📊</div>
            <p style={{ fontSize: '18px', marginBottom: '10px' }}>Архитектура проекта пока не проанализирована</p>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '30px', maxWidth: '400px', textAlign: 'center' }}>
              Для создания графа зависимостей необходимо выполнить анализ исходного кода проекта
            </p>
            <button 
              onClick={() => navigate('/projects')} 
              style={{ 
                padding: '12px 24px', 
                background: '#3b82f6', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              Вернуться к проектам
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Layer Header with Labels */}
      <div className={styles.layerHeader}>
        <div className={styles.layerLabel} style={{ left: '100px' }}>Главный сервис</div>
        <div className={styles.layerLabel} style={{ left: '380px' }}>API endpoints</div>
        <div className={styles.layerLabel} style={{ left: '660px' }}>Сервисы</div>
        <div className={styles.layerLabel} style={{ left: '940px' }}>Базы данных</div>
        <div className={styles.layerLabel} style={{ left: '1220px' }}>Брокер сообщений</div>
      </div>

      {/* Control Bar */}
      <div className={styles.controlBar}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Назад
        </button>
        <div className={styles.titleContainer}>
          <h1 className={styles.title}>{project?.name || `Проект #${id}`}</h1>
          {project?.description && (
            <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
              {project.description}
            </p>
          )}
        </div>
      </div>

      {/* Info Panel */}
      {(requirements.length > 0 || Object.keys(endpoints).length > 0 || architectureData.length > 0) && (
        <div className={styles.infoBar}>
          {requirements.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>📦 Зависимости:</span>
              <span className={styles.infoValue}>{requirements.length}</span>
            </div>
          )}
          {Object.keys(endpoints).length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>🔗 Эндпоинты:</span>
              <span className={styles.infoValue}>{Object.keys(endpoints).length}</span>
            </div>
          )}
          {architectureData.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>🏗️ Компоненты:</span>
              <span className={styles.infoValue}>{architectureData.length}</span>
            </div>
          )}
        </div>
      )}

      {/* Graph */}
      <div className={styles.flowWrapper}>
        {nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onPaneClick={onPaneClick}
            fitView={isFirstLoad}
            fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
            minZoom={0.1}
            maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              animated: false, // Отключаем анимацию для производительности
            }}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag={true}
            panOnScroll={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            selectionOnDrag={false}
            panActivationKeyCode={null}
            preventScrolling={true}
            attributionPosition="bottom-right"
            nodeOrigin={[0.5, 0.5]}
            selectNodesOnDrag={false}
          >
            <Background color="#f0f0f0" gap={20} size={1} />
            <Controls className={styles.controls} />
          </ReactFlow>
        ) : (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Построение графа архитектуры...</p>
          </div>
        )}
      </div>

      {/* Node Details Tooltip */}
      {selectedNode && (
        <div className={styles.tooltip}>
          <button className={styles.tooltipClose} onClick={() => setSelectedNode(null)}>
            ×
          </button>
          <h3>{selectedNode.data.label}</h3>
          <p><strong>ID:</strong> {selectedNode.id}</p>
        </div>
      )}
    </div>
  );
}
