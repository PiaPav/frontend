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
import grpcClient from '../../services/grpcClient';
import { DEMO_PROJECT } from '../../data/demoProject';
import { useAuth } from '../../context/AuthContext';

export default function ProjectAnalysis() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
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
  const [isDemoProject, setIsDemoProject] = useState(false);
  const [streamComplete, setStreamComplete] = useState(false);
  const [abortController, setAbortController] = useState(null);

  // Загрузка проекта через REST + gRPC stream
  useEffect(() => {
    let cancelled = false;
    
    // Демо-проект: загружаем моковые данные
    if (id === 'demo') {
      const loadDemo = async () => {
        try {
          setLoading(true);
          setError(null);
          setIsDemoProject(true);
          
          console.log('📦 Загрузка ДЕМО проекта');
          
          await new Promise(r => setTimeout(r, 500));
          if (cancelled) return;
          
          setProject(DEMO_PROJECT);
          setRequirements(DEMO_PROJECT.architecture.requirements);
          setEndpoints(DEMO_PROJECT.architecture.endpoints);
          
          const archArray = Object.entries(DEMO_PROJECT.architecture.data).map(([parent, children]) => ({
            parent,
            children: Array.isArray(children) ? children : []
          }));
          setArchitectureData(archArray);
          setStreamComplete(true);
          
          setLoading(false);
          setIsFirstLoad(false);
        } catch (err) {
          if (cancelled) return;
          console.error('❌ Ошибка загрузки демо:', err);
          setError('Ошибка загрузки демо-проекта');
          setLoading(false);
        }
      };
      
      loadDemo();
      
      return () => {
        cancelled = true;
      };
    }
    
    // Реальный проект: REST + gRPC
    const loadProject = async () => {
      try {
        if (isFirstLoad) {
          setLoading(true);
          setError(null);
        }
        
        setIsDemoProject(false);
        console.log('🌐 Загрузка проекта через REST, ID:', id);
        
        // 1. Получаем данные через REST API
        const projectData = await projectsAPI.getById(id);
        if (cancelled) return;
        
        setProject(projectData);
        
        // Если архитектура уже есть - показываем её
        if (projectData.architecture && projectData.architecture.requirements && projectData.architecture.requirements.length > 0) {
          console.log('✅ Архитектура уже загружена, пропускаем gRPC');
          
          const arch = projectData.architecture;
          setRequirements(arch.requirements || []);
          
          // Endpoints
          let endpointsObj = {};
          if (arch.endpoints) {
            if (Array.isArray(arch.endpoints)) {
              arch.endpoints.forEach(endpoint => {
                Object.entries(endpoint).forEach(([key, value]) => {
                  endpointsObj[key] = value;
                });
              });
            } else if (typeof arch.endpoints === 'object') {
              endpointsObj = arch.endpoints;
            }
          }
          setEndpoints(endpointsObj);
          
          // Architecture data
          if (arch.data && typeof arch.data === 'object') {
            const archArray = Object.entries(arch.data).map(([parent, children]) => ({
              parent,
              children: Array.isArray(children) ? children : []
            }));
            setArchitectureData(archArray);
          }
          
          setStreamComplete(true);
          setLoading(false);
          setIsFirstLoad(false);
          return;
        }
        
        // 2. Если архитектуры нет - запускаем gRPC stream
        setLoading(false);
        setIsFirstLoad(false);
        
        console.log('📡 Запуск gRPC stream для анализа проекта');
        
        if (!user || !user.id) {
          console.error('❌ User ID не найден');
          setError('Ошибка авторизации. Перезайдите в систему.');
          return;
        }
        
        const controller = await grpcClient.connectToStream(user.id, parseInt(id), {
          onStart: () => {
            console.log('🎬 Анализ начался');
          },
          
          onRequirements: (data) => {
            console.log('📋 Requirements получены:', data.requirements.length);
            setRequirements(data.requirements);
          },
          
          onEndpoints: (data) => {
            console.log('🔗 Endpoints получены:', Object.keys(data.endpoints).length);
            setEndpoints(data.endpoints);
          },
          
          onArchitecture: (data) => {
            console.log('🏗️ Architecture часть получена:', data.parent);
            setArchitectureData(prev => [...prev, {
              parent: data.parent,
              children: data.children
            }]);
          },
          
          onDone: async () => {
            console.log('✅ gRPC Stream завершён');
            setStreamComplete(true);
            
            // 3. Сохраняем финальную архитектуру через PATCH
            try {
              // Используем setTimeout чтобы дождаться обновления всех state
              setTimeout(async () => {
                const dataObject = {};
                architectureData.forEach(item => {
                  dataObject[item.parent] = item.children;
                });
                
                await projectsAPI.update(parseInt(id), {
                  architecture: {
                    requirements: requirements,
                    endpoints: endpoints,
                    data: dataObject
                  }
                });
                
                console.log('💾 Архитектура сохранена в БД');
              }, 1000);
            } catch (err) {
              console.error('❌ Ошибка сохранения архитектуры:', err);
            }
          },
          
          onError: (error) => {
            console.error('❌ gRPC ошибка:', error);
            const errorMessage = error.message || 'Ошибка получения данных архитектуры';
            
            // Проверяем конкретные типы ошибок
            if (errorMessage.includes('500')) {
              setError('Внутренняя ошибка сервера при анализе проекта. Проверьте логи бэкенда или попробуйте позже.');
            } else if (errorMessage.includes('404')) {
              setError('Сервис анализа недоступен. Проверьте, что gRPC сервер запущен.');
            } else if (errorMessage.includes('Failed to fetch')) {
              setError('Не удалось подключиться к серверу анализа. Проверьте настройки Envoy и gRPC сервиса.');
            } else {
              setError(`${errorMessage}. Попробуйте перезагрузить страницу.`);
            }
            setStreamComplete(true);
          }
        });
        
        setAbortController(controller);
        
      } catch (err) {
        if (cancelled) return;
        console.error('❌ Ошибка загрузки проекта:', err);
        
        if (err.response?.status === 401) {
          // Redirect to login handled by interceptor
          navigate('/login');
        } else {
          setError(err.response?.data?.detail || err.message || 'Не удалось загрузить проект');
        }
        
        if (isFirstLoad) {
          setLoading(false);
          setIsFirstLoad(false);
        }
      }
    };
    
    loadProject();
    
    // Cleanup: отменяем stream при размонтировании
    return () => {
      cancelled = true;
      if (abortController) {
        abortController.abort();
      }
    };
  }, [id, user]);

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
        // Broker и остальное - исключаем из отображения
        else {
          result = { type: 'excluded', layer: null };
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
      2: [], // Endpoints
      3: [], // Services (AuthService, AccountService, ProjectService, CoreService)
      3.5: [], // Service methods (AuthService.login, AccountService.get_account_by_id)
      4: [], // Database components
    };

    allNodes.forEach(nodeName => {
      const { layer } = getNodeType(nodeName);
      if (layer !== null && nodesByLayer[layer]) {
        nodesByLayer[layer].push(nodeName);
      }
    });

    // Добавляем endpoints в слой 2 (берем только из endpoints, не из architectureData)
    nodesByLayer[2] = Object.keys(endpoints);

    // Отладка: выводим количество узлов на каждом слое
    console.log('📊 Узлы по слоям:', {
      'Layer 2 (Endpoints)': nodesByLayer[2].length,
      'Layer 3 (Services)': nodesByLayer[3].length,
      'Layer 3.5 (Service Methods)': (nodesByLayer[3.5] || []).length,
      'Layer 4 (Database)': nodesByLayer[4].length,
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
        position: { x: START_X, y: START_Y + idx * 120 },
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

    // === LAYER 4: Database components (группировка по классам) ===
    // Группируем узлы по классам
    const dbGroups = {
      'DatabaseManager': [],
      'Account': [],
      'Project': [],
      'Other': []
    };
    
    nodesByLayer[4].forEach(nodeName => {
      if (nodeName.startsWith('DatabaseManager')) {
        dbGroups['DatabaseManager'].push(nodeName);
      } else if (nodeName.startsWith('Account.')) {
        dbGroups['Account'].push(nodeName);
      } else if (nodeName.startsWith('Project.')) {
        dbGroups['Project'].push(nodeName);
      } else {
        dbGroups['Other'].push(nodeName);
      }
    });

    // Конфигурация для каждой группы
    const groupConfigs = {
      'DatabaseManager': { 
        color: '#06b6d4', 
        icon: '🗄️', 
        label: 'DATABASE MANAGER',
        borderColor: '#0891b2',
        bgGradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
      },
      'Account': { 
        color: '#3b82f6', 
        icon: '👥', 
        label: 'ACCOUNT DB',
        borderColor: '#2563eb',
        bgGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
      },
      'Project': { 
        color: '#10b981', 
        icon: '📊', 
        label: 'PROJECT DB',
        borderColor: '#059669',
        bgGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
      },
      'Other': { 
        color: '#64748b', 
        icon: '🗃️', 
        label: 'DATABASE',
        borderColor: '#475569',
        bgGradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
      }
    };

    let currentY = START_Y;
    const groupSpacing = 140; // Увеличенный отступ между группами
    
    Object.entries(dbGroups).forEach(([groupName, nodes]) => {
      if (nodes.length === 0) return;
      
      const config = groupConfigs[groupName];
      const groupHeight = nodes.length * 70 + 20; // Высота группы
      
      // Создаем фоновый прямоугольник для группы
      newNodes.push({
        id: `group-bg-${groupName}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3.2 - 20, y: currentY - 10 },
        data: { label: '' },
        style: {
          background: `${config.color}08`,
          border: `2px dashed ${config.color}40`,
          borderRadius: '16px',
          padding: '0',
          width: 220,
          height: groupHeight + 100,
          pointerEvents: 'none',
          zIndex: -1,
        },
        draggable: false,
        selectable: false,
      });
      
      // Создаем групповой узел-заголовок
      newNodes.push({
        id: `group-${groupName}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3.2, y: currentY },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{config.icon}</div>
              <div style={{ 
                fontSize: '9px', 
                fontWeight: '800',
                letterSpacing: '1px',
                textTransform: 'uppercase'
              }}>
                {config.label}
              </div>
              <div style={{
                fontSize: '8px',
                fontWeight: '600',
                marginTop: '6px',
                opacity: 0.9,
                background: 'rgba(255,255,255,0.2)',
                padding: '3px 8px',
                borderRadius: '6px',
                display: 'inline-block'
              }}>
                {nodes.length} {nodes.length === 1 ? 'метод' : 'методов'}
              </div>
            </div>
          ),
        },
        style: {
          background: config.bgGradient,
          color: 'white',
          border: `3px solid ${config.borderColor}`,
          borderRadius: '14px',
          padding: '20px 24px',
          width: 180,
          fontWeight: '700',
          fontSize: '11px',
          boxShadow: `0 8px 24px ${config.color}50, inset 0 1px 0 rgba(255,255,255,0.3)`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
      
      currentY += 90;
      
      // Создаем дочерние узлы для методов
      nodes.forEach((nodeName, idx) => {
        const methodName = nodeName.split('.').pop();
        
        newNodes.push({
          id: nodeName,
          type: 'default',
          position: { x: START_X + LAYER_GAP * 3.2 + 10, y: currentY + idx * 70 },
          data: {
            label: (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '2px'
              }}>
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: config.color,
                  flexShrink: 0
                }}></div>
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: '600',
                  color: '#1e293b',
                  textAlign: 'left',
                  lineHeight: '1.3'
                }}>
                  {methodName}
                </div>
              </div>
            ),
          },
          style: {
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            color: '#1e293b',
            border: `2px solid ${config.color}`,
            borderRadius: '10px',
            padding: '10px 14px',
            width: 160,
            fontSize: '11px',
            fontWeight: '600',
            boxShadow: `0 4px 12px ${config.color}20, inset 0 1px 0 rgba(255,255,255,0.8)`,
            transition: 'all 0.2s ease',
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      });
      
      currentY += nodes.length * 70 + groupSpacing;
    });

    // === LAYER 5: Удалено - не отображаем служебные компоненты ===

    // === ДИНАМИЧЕСКИЕ СОЕДИНЕНИЯ ИЗ ARCHITECTURE DATA ===
    // Соединения из ARCHITECTURE данных (parent -> children)
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
            <h1 className={styles.title}>
              {project?.name || `Проект #${id}`}
              {isDemoProject && (
                <span style={{
                  marginLeft: '12px',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)'
                }}>
                  🎮 DEMO
                </span>
              )}
            </h1>
            {project?.description && (
              <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                {project.description}
              </p>
            )}
          </div>
        </div>
        <div className={styles.flowWrapper}>
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner}></div>
            <h2>Анализ архитектуры проекта...</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '30px', maxWidth: '400px', textAlign: 'center' }}>
              Пожалуйста, подождите. Это может занять несколько минут.
            </p>
            <div className={styles.progressBar} style={{ width: '400px', height: '8px', background: 'rgba(90, 111, 214, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div 
                className={styles.progressFill}
                style={{ 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #5A6FD6 0%, #6B8FE8 100%)', 
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                  width: '30%'
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Control Bar */}
      <div className={styles.controlBar}>
        <button onClick={() => navigate('/projects')} className={styles.backBtn}>
          ← Назад
        </button>
        <div className={styles.titleContainer}>
          <h1 className={styles.title}>
            {project?.name || `Проект #${id}`}
            {isDemoProject && (
              <span style={{
                marginLeft: '12px',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)'
              }}>
                🎮 DEMO
              </span>
            )}
          </h1>
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
