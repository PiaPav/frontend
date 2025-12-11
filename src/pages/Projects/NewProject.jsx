import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { projectsAPI } from '../../services/api';
import grpcClient from '../../services/grpcClient';
import { useAuth } from '../../context/AuthContext';
import styles from './Projects.module.css';
import analysisStyles from './ProjectAnalysis.module.css';

export default function NewProject() {
  const [form, setForm] = useState({
    name: '',
    description: '',
  });
  const [file, setFile] = useState(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState(''); // 'creating', 'analyzing', 'completed'
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Состояние для графа
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [requirements, setRequirements] = useState([]);
  const [endpoints, setEndpoints] = useState({});
  const [architectureData, setArchitectureData] = useState([]);
  const [showGraph, setShowGraph] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const architectureDataRef = useRef([]);
  const streamControllerRef = useRef(null);
  const isSavingRef = useRef(false);

  const buildArchitecturePayload = () => ({
    requirements,
    endpoints: Object.entries(endpoints).map(([k, v]) => ({ [k]: v })),
    data: architectureDataRef.current.reduce((acc, item) => {
      acc[item.parent] = item.children;
      return acc;
    }, {})
  });

  const saveArchitecture = async (reason = 'auto') => {
    if (!currentProjectId || architectureDataRef.current.length === 0) return;
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      const token = localStorage.getItem('access_token');
      const archData = buildArchitecturePayload();
      console.log(`💾 Сохранение архитектуры (${reason})...`, {
        projectId: currentProjectId,
        reqs: archData.requirements?.length,
        eps: archData.endpoints?.length,
        nodes: Object.keys(archData.data || {}).length
      });

      await fetch(`${import.meta.env.VITE_API_URL || '/v1'}/project/${currentProjectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ architecture: archData }),
        keepalive: reason === 'exit'
      });

      console.log('✅ Архитектура сохранена');
    } catch (err) {
      console.error('❌ Ошибка сохранения архитектуры:', err);
    } finally {
      isSavingRef.current = false;
    }
  };

  // Сохранение архитектуры при уходе со страницы
  useEffect(() => {
    const handleSaveOnExit = async () => {
      await saveArchitecture('exit');
    };
    
    // Сохранение при уходе со страницы
    const handleBeforeUnload = (e) => {
      if (currentProjectId && architectureDataRef.current.length > 0) {
        handleSaveOnExit();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Сохранение при размонтировании компонента (переход по навигации)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (currentProjectId && architectureDataRef.current.length > 0) {
        handleSaveOnExit();
      }
    };
  }, [currentProjectId, requirements, endpoints]);
  
  // Синхронизация ref с state
  useEffect(() => {
    architectureDataRef.current = architectureData;
  }, [architectureData]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    const rounded = value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1);
    return `${rounded} ${units[exponent]}`;
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    const LIMIT = 50 * 1024 * 1024; // 50 MB
    if (f && f.size > LIMIT) {
      setFile(f);
      setShowPremiumModal(true);
    } else {
      setFile(f);
    }
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Валидация
    if (!form.name.trim()) {
      setError('Введите название проекта');
      setLoading(false);
      return;
    }

    // Проверка что файл выбран (обязательно по API)
    if (!file) {
      setError('Необходимо выбрать ZIP-файл проекта');
      setLoading(false);
      return;
    }

    try {
      const LIMIT = 50 * 1024 * 1024; // 50 MB
      if (file.size > LIMIT) {
        setShowPremiumModal(true);
        setLoading(false);
        return;
      }

      // ШАГ 1: Создание проекта через POST /v1/project
      console.log('📤 Создание проекта через REST API...');
      
      setAnalysisStatus('creating');
      
      const payload = { 
        name: form.name,
        description: form.description,
        file: file
      };
      
      const result = await projectsAPI.create(payload);
      
      console.log('✅ Проект создан:', result);
      
      // Определяем правильный ID проекта
      const projectId = result.project_id || result.id;
      
      if (!projectId) {
        throw new Error('Backend не вернул ID проекта');
      }
      
      setCurrentProjectId(projectId);
      console.log('✅ Проект создан, ID:', projectId);

      // ШАГ 2: Запуск gRPC анализа и показ визуализации
      setAnalysisStatus('analyzing');
      setShowGraph(true); // Показываем граф сразу

      if (!user || !user.id) {
        throw new Error('User ID не найден. Перезайдите в систему.');
      }
      
      const validUserId = parseInt(user.id);
      const validProjectId = parseInt(projectId);
      
      if (isNaN(validUserId) || validUserId === 0) {
        throw new Error('Невалидный User ID');
      }
      
      if (isNaN(validProjectId) || validProjectId === 0) {
        throw new Error('Невалидный Project ID');
      }
      
      console.log('═══════════════════════════════════════════════════');
      console.log('🚀 ЗАПУСК gRPC АНАЛИЗА ПРОЕКТА');
      console.log('═══════════════════════════════════════════════════');
      console.log('📊 Параметры подключения:', {
        user_id: validUserId,
        task_id: validProjectId,
        project_name: form.name
      });

      // Отправляем gRPC запрос
      const controller = await grpcClient.connectToStream(validUserId, validProjectId, {
        onStart: () => {
          console.log('\n🎬 ПОДКЛЮЧЕНИЕ УСТАНОВЛЕНО');
          console.log('⏳ Ожидание данных от сервера...');
        },
        
        onRequirements: (data) => {
          console.log('\n📋 REQUIREMENTS (Зависимости проекта)');
          console.log('───────────────────────────────────────────────────');
          console.log('Количество зависимостей:', data.requirements?.length || 0);
          if (data.requirements && data.requirements.length > 0) {
            console.log('Список зависимостей:', data.requirements.slice(0, 10).join(', ') + (data.requirements.length > 10 ? '...' : ''));
          }
          setRequirements(data.requirements || []);
        },
        
        onEndpoints: (data) => {
          console.log('\n🔗 ENDPOINTS (HTTP маршруты)');
          console.log('───────────────────────────────────────────────────');
          const eps = data.endpoints || {};
          const epsList = Object.entries(eps);
          console.log('Количество эндпоинтов:', epsList.length);
          
          // Группировка по методам
          const byMethod = {};
          epsList.forEach(([key]) => {
            const method = key.split(' ')[0];
            byMethod[method] = (byMethod[method] || 0) + 1;
          });
          console.log('По методам:', byMethod);
          
          // Примеры эндпоинтов
          if (epsList.length > 0) {
            console.log('Примеры эндпоинтов:');
            epsList.slice(0, 5).forEach(([key, value]) => {
              console.log(`  ${key} → ${value}`);
            });
            if (epsList.length > 5) {
              console.log(`  ... и ещё ${epsList.length - 5} эндпоинтов`);
            }
          }
          setEndpoints(eps);
        },
        
        onArchitecture: (data) => {
          setArchitectureData(prev => {
            const newData = [...prev, {
              parent: data.parent,
              children: data.children || []
            }];
            
            // Логирование с прогрессом
            if (newData.length % 10 === 0 || newData.length <= 5) {
              console.log(`\n🏗️ ARCHITECTURE (Связь #${newData.length})`);
              console.log('───────────────────────────────────────────────────');
            }
            console.log(`  ${data.parent} → [${(data.children || []).length} зависимостей]`);
            if (data.children && data.children.length > 0) {
              console.log(`    └─ ${data.children.slice(0, 3).join(', ')}${data.children.length > 3 ? '...' : ''}`);
            }
            
            return newData;
          });
        },
        
        onDone: async () => {
          console.log('\n═══════════════════════════════════════════════════');
          console.log('✅ АНАЛИЗ ЗАВЕРШЁН УСПЕШНО!');
          console.log('═══════════════════════════════════════════════════');
          console.log('📊 Итоговая статистика:');
          console.log('  📋 Requirements:', requirements.length);
          console.log('  🔗 Endpoints:', Object.keys(endpoints).length);
          console.log('  🏗️ Architecture nodes:', architectureDataRef.current.length);
          console.log('═══════════════════════════════════════════════════\n');
          
          setAnalysisStatus('completed');
          setLoading(false);
          streamControllerRef.current = null;
          await saveArchitecture('done');
        },
        
        onError: (error) => {
          console.log('\n═══════════════════════════════════════════════════');
          console.error('❌ ОШИБКА gRPC STREAM');
          console.log('═══════════════════════════════════════════════════');
          console.error('Тип ошибки:', error.name || 'Unknown');
          console.error('Сообщение:', error.message);
          console.error('Stack trace:', error.stack);
          console.log('\n📊 Данные получены до ошибки:');
          console.log('  📋 Requirements:', requirements.length);
          console.log('  🔗 Endpoints:', Object.keys(endpoints).length);
          console.log('  🏗️ Architecture nodes:', architectureDataRef.current.length);
          console.log('═══════════════════════════════════════════════════\n');
          
          setError(`Ошибка анализа проекта: ${error.message}`);
          setAnalysisStatus('error');
          setLoading(false);
          streamControllerRef.current = null;
          setTimeout(() => {
            navigate(`/projects/${projectId}/architecture`);
          }, 3000);
        }
      }, 2000); // Задержка 2 секунды перед подключением к gRPC
      
    } catch (err) {
      console.error('Ошибка создания проекта:', err);
      
      let errorMessage = 'Ошибка создания проекта';
      
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === 'string') {
          if (detail.includes('async for') && detail.includes('UploadFile')) {
            errorMessage = 'Ошибка обработки файла на сервере. Обратитесь к администратору.';
          } else {
            errorMessage = detail;
          }
        } else if (Array.isArray(detail)) {
          errorMessage = detail.map(e => `${e.loc?.join('.') || 'field'}: ${e.msg}`).join('; ');
        } else {
          errorMessage = JSON.stringify(detail);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
      setAnalysisStatus('error');
    }
  }

  // Build graph in real-time with proper grouping and filtering
  useEffect(() => {
    if (architectureData.length === 0) return;

    const LAYER_GAP = 620;
    const START_X = 120;
    const START_Y = 80;
    const HTTP_SPACING = 160; // Равномерный отступ между HTTP эндпоинтами
    const NODE_SPACING = 140; // Increased spacing between HTTP endpoints
    const LANE_GAP_Y = 60; // Дополнительный зазор между классами

    const newNodes = [];
    
    // Build dependency graph to filter isolated nodes
    const dependencyMap = new Map(); // node -> nodes that depend on it
    const reverseDependencyMap = new Map(); // node -> nodes it depends on (children)
    
    architectureData.forEach(({ parent, children }) => {
      children.forEach(child => {
        const cleanChild = child.split('/').pop();
        
        // dependencyMap: who uses this node
        if (!dependencyMap.has(cleanChild)) {
          dependencyMap.set(cleanChild, new Set());
        }
        dependencyMap.get(cleanChild).add(parent);
        
        // reverseDependencyMap: what this node uses
        if (!reverseDependencyMap.has(parent)) {
          reverseDependencyMap.set(parent, new Set());
        }
        reverseDependencyMap.get(parent).add(cleanChild);
      });
    });
    
    // Start from endpoints and traverse DOWN the dependency tree
    const connectedNodes = new Set();
    
    const traverse = (node) => {
      if (connectedNodes.has(node)) return;
      connectedNodes.add(node);
      
      // Traverse to children (dependencies)
      if (reverseDependencyMap.has(node)) {
        reverseDependencyMap.get(node).forEach(child => traverse(child));
      }
    };
    
    // Start traversal from all endpoints
    Object.keys(endpoints).forEach(endpointKey => {
      traverse(endpointKey);
      
      // Also need to find what endpoints call directly
      // Look for any architecture node that might be called by this endpoint
      architectureData.forEach(({ parent }) => {
        // Check if this parent is related to the endpoint
        const endpointName = endpointKey.toLowerCase().replace(/_/g, '');
        const parentName = parent.toLowerCase().replace(/[._]/g, '');
        
        // If parent name contains endpoint name, it's likely called by this endpoint
        if (parentName.includes(endpointName) || endpointName.includes(parentName)) {
          traverse(parent);
        }
      });
    });
    
    // Also mark nodes that have incoming edges as connected
    architectureData.forEach(({ parent, children }) => {
      if (connectedNodes.has(parent)) {
        children.forEach(child => {
          const cleanChild = child.split('/').pop();
          traverse(cleanChild);
        });
      }
    });

    console.log('🔍 Debug info:', {
      architectureDataLength: architectureData.length,
      endpointsCount: Object.keys(endpoints).length,
      connectedNodesCount: connectedNodes.size,
      reverseDependencyMapSize: reverseDependencyMap.size,
      sampleArchitectureData: architectureData.slice(0, 3),
      sampleConnectedNodes: Array.from(connectedNodes).slice(0, 10)
    });

    // Цвета для HTTP методов
    const methodColors = {
      'GET': { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669' },
      'POST': { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb' },
      'PATCH': { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#d97706' },
      'PUT': { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed' },
      'DELETE': { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#dc2626' },
    };

    const serviceColors = {
      'AuthService': { color: '#8b5cf6', icon: '🔐', label: 'Auth' },
      'AccountService': { color: '#3b82f6', icon: '👤', label: 'Account' },
      'ProjectService': { color: '#10b981', icon: '📁', label: 'Project' },
      'CoreService': { color: '#f59e0b', icon: '⚙️', label: 'Core' },
    };

    // Determine node layer and classification based on naming patterns
    const getNodeType = (nodeName) => {
      // Skip if not connected
      if (!connectedNodes.has(nodeName)) return null;
      
      // Layer 1: HTTP Endpoints
      if (endpoints[nodeName]) {
        return { type: 'endpoint', layer: 1, class: 'HTTP' };
      }
      
      // Layer 3: Database / infra / gRPC
      if (nodeName.startsWith('DatabaseManager') ||
          nodeName.startsWith('init_db') ||
          nodeName.includes('Exception') ||
          nodeName.includes('Broker') ||
          nodeName.includes('Storage') ||
          nodeName.includes('Consumer') ||
          nodeName.includes('Producer') ||
          nodeName.includes('Connection')) {
        
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
      
      // Layer 2: Domain / Service layer (classes with methods)
      if (nodeName.includes('.')) {
        const className = nodeName.split('.')[0];

        // Все классы (даже модели) кладём в слой handlers/app
        return { type: 'domain', layer: 2, class: className };
      }
      
      // Layer 2: Handler / Router functions (simple names without dots)
      // These are FastAPI route handlers
      const handlerPatterns = [
        'homepage', 'health', 'lifespan',
        'get_account', 'patch_account', 
        'get_project', 'get_projects_list', 'create_project', 'patch_project', 'delete_project',
        'login', 'refresh', 'registration',
        'load_config', 'create_logger', 'run_frontend_test'
      ];
      
      const isHandler = handlerPatterns.some(pattern => nodeName.includes(pattern)) ||
                        (!nodeName.includes('.') && !nodeName.includes('Manager') && !nodeName.includes('Service'));
      
      if (isHandler) {
        let className = 'Core';
        if (nodeName.includes('account')) className = 'Account';
        else if (nodeName.includes('project')) className = 'Project';
        else if (nodeName.includes('login') || nodeName.includes('auth') || nodeName.includes('registration') || nodeName.includes('refresh')) className = 'Auth';
        else if (nodeName.includes('home') || nodeName.includes('health')) className = 'System';
        else if (nodeName.includes('config') || nodeName.includes('logger')) className = 'Config';
        
        return { type: 'handler', layer: 2, class: className };
      }
      
      // Default: Layer 3, Other
      return { type: 'other', layer: 3, class: 'Other' };
    };

    // Group nodes by layer and class (HTTP → Handlers → Infra, плюс requirements)
    const classByLayer = {
      0: { Requirements: [] },
      1: { HTTP: [] },
      2: {}, // Handlers / routers
      3: {}, // DB / infra / gRPC
    };
    const methodMeta = new Map(); // nodeName -> { layer, className }

    const register = (name, layer, className) => {
      if (!classByLayer[layer]) classByLayer[layer] = {};
      if (!classByLayer[layer][className]) classByLayer[layer][className] = [];
      classByLayer[layer][className].push(name);
      methodMeta.set(name, { layer, className });
    };

    // Add requirements to Layer 0
    requirements.forEach(req => {
      if (req) {
        classByLayer[0].Requirements.push(req);
      }
    });

    connectedNodes.forEach(nodeName => {
      const nodeType = getNodeType(nodeName);
      if (!nodeType) return;

      const { layer, class: className } = nodeType;
      register(nodeName, layer, className);
    });

    console.log('📊 Grouped nodes:', {
      'Layer 1 (HTTP Endpoints)': classByLayer[1].HTTP?.length || 0,
      'Layer 2 (Handlers)': Object.keys(classByLayer[2]).length,
      'Layer 3 (Infra/DB)': Object.keys(classByLayer[3]).length,
    });

    const laneX = {
      http: START_X,
      handlers: START_X + LAYER_GAP,
      db: START_X + LAYER_GAP * 2,
    };

    const lanePreviewLimit = Infinity;
    const laneOffsetX = 320; // горизонтальный сдвиг для шахматного порядка
    const laneGapY = 80;     // вертикальный зазор между рядами карточек

    // === LAYER 0: Requirements (Dependencies) ===
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

    // === LAYER 1: HTTP Endpoints (карточки как раньше) ===
    const httpEndpoints = classByLayer[1].HTTP || [];
    const endpointsList = httpEndpoints.map(key => ({ key, value: endpoints[key] }));
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
              <div style={{
                background: color.bg,
                color: 'white',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 'bold',
                marginBottom: '6px',
                display: 'inline-block',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>
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

    // Helper to render one lane-card node
    const renderLaneNodes = (layerKey, xPos) => {
      const cards = Object.entries(classByLayer[layerKey] || {})
        .filter(([, methods]) => methods?.length)
        .map(([className, methods]) => {
          const classColor = serviceColors[className]?.color || '#64748b';
          const preview = methods.map(m => m.split('.').pop() || m);
          const estimatedHeight = 180 + preview.length * 28;
          return { className, methods, classColor, preview, estimatedHeight };
        });

      let rowY = START_Y;
      for (let i = 0; i < cards.length; i += 2) {
        const left = cards[i];
        const right = cards[i + 1];

        // Левая карточка
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
                  {left.preview.map(m => (
                    <div key={m} style={{ background: '#f8fafc', borderRadius: '8px', padding: '6px 8px', fontSize: '11px', color: '#0f172a', border: `1px solid ${left.classColor}33` }}>
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

        // Правая карточка (шахматный сдвиг)
        if (right) {
          newNodes.push({
            id: `lane-${layerKey}-${right.className}`,
            type: 'default',
            position: { x: xPos + laneOffsetX, y: rowY + 40 },
            data: {
              label: (
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#111' }}>{right.className}</div>
                  <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{right.methods.length} методов</div>
                  <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                    {right.preview.map(m => (
                      <div key={m} style={{ background: '#f8fafc', borderRadius: '8px', padding: '6px 8px', fontSize: '11px', color: '#0f172a', border: `1px solid ${right.classColor}33` }}>
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
        rowY += rowHeight + laneGapY;
      }
    };

    // === LAYER 2: Handlers (FastAPI + доменные методы) ===
    renderLaneNodes(2, laneX.handlers);
    // === LAYER 3: Database / Infra / gRPC ===
    renderLaneNodes(3, laneX.db);

    const getLaneId = (layer, className) => `lane-${layer}-${className}`;

    // === EDGES: Build connections between lanes (class-level) ===
    const newEdges = [];
    const nodeIds = new Set(newNodes.map(n => n.id));
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

    // Edges from HTTP endpoints -> handler/infra lanes
    Object.keys(endpoints).forEach(endpointKey => {
      if (!reverseDependencyMap.has(endpointKey)) return;

      const method = endpoints[endpointKey]?.split(' ')[0] || 'GET';
      const color = methodColors[method]?.border || '#3b82f6';

      reverseDependencyMap.get(endpointKey).forEach(target => {
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

    // Edges between classes (parent -> child aggregated)
    architectureData.forEach(({ parent, children }) => {
      const parentMeta = methodMeta.get(parent);
      if (!parentMeta) return;

      const sourceId = parentMeta.layer === 1 ? parent : getLaneId(parentMeta.layer, parentMeta.className);
      if (!nodeIds.has(sourceId)) return;

      children.forEach(childRaw => {
        const child = childRaw.split('/').pop();
        const childMeta = methodMeta.get(child);
        if (!childMeta) return;

        const targetId = childMeta.layer === 1 ? child : getLaneId(childMeta.layer, childMeta.className);
        if (!nodeIds.has(targetId)) return;

        pushEdge(sourceId, targetId, { color: '#94a3b8' });
      });
    });

    // Filter out isolated nodes (оставляем только с рёбрами)
    const filteredNodes = newNodes.filter(node => {
      const hasEdges = nodesWithIncomingEdges.has(node.id) || nodesWithOutgoingEdges.has(node.id);
      return hasEdges;
    });

    console.log('🔗 Edges built:', {
      total: newEdges.length,
      fromEndpoints: Object.keys(endpoints).length,
      connectedNodes: connectedNodes.size,
      nodesBeforeFilter: newNodes.length,
      nodesAfterFilter: filteredNodes.length,
      isolated: newNodes.length - filteredNodes.length
    });

    const summaryByLane = {
      http: classByLayer[1].HTTP?.length || 0,
      handlers: Object.keys(classByLayer[2] || {}).map((cls) => `${cls} (${classByLayer[2][cls].length})`),
      infra: Object.keys(classByLayer[3] || {}).map((cls) => `${cls} (${classByLayer[3][cls].length})`),
    };

    console.log('✅ Граф отрисован (итог):', {
      nodes: filteredNodes.length,
      edges: newEdges.length,
      requirements: requirements.length,
      endpoints: Object.keys(endpoints).length,
      lanes: summaryByLane,
    });

    setNodes(filteredNodes);
    setEdges(newEdges);
  }, [architectureData, endpoints, setNodes, setEdges]);

  return (
    <div className={styles.container}>
      {/* Форма создания проекта */}
      {!showGraph && (
        <div className={styles.newProjectWrapper}>
          <form className={styles.newProjectForm} onSubmit={handleSubmit}>
          <h1>Создать новый проект</h1>

          <div className={styles.inputGroup}>
            <label htmlFor="name">Название проекта</label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="Введите название"
              disabled={loading}
              maxLength={100}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="description">Описание</label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Опишите ваш проект"
              rows={4}
              disabled={loading}
              maxLength={500}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="file">Архитектура / файл *</label>
            <div className={styles.fileUpload}>
              <input
                id="file"
                name="file"
                type="file"
                onChange={handleFileChange}
                disabled={loading}
                accept=".zip,application/zip,application/x-zip-compressed"
                required
                className={styles.fileInput}
              />
              <label htmlFor="file" className={styles.fileLabel} aria-disabled={loading}>
                <div className={styles.fileIcon}>📦</div>
                <div className={styles.fileText}>
                  <div className={styles.fileTitle}>{file ? 'Файл выбран' : 'Загрузить проект (ZIP)'}</div>
                  <div className={styles.fileHint}>
                    {file ? `${file.name} • ${formatFileSize(file.size)}` : 'Перетащите архив сюда или нажмите, чтобы выбрать'}
                  </div>
                </div>
                <div className={styles.fileBadge}>ZIP</div>
              </label>
            </div>
            <small className={styles.fileNote}>Загрузите ZIP-архив с проектом (обязательно)</small>
          </div>

          {/* Ошибка */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* Статус анализа */}
          {analysisStatus && !error && (
            <div className={styles.analysisStatus}>
              {analysisStatus === 'creating' && '📤 Создание проекта...'}
              {analysisStatus === 'analyzing' && '📡 Анализ проекта в реальном времени...'}
              {analysisStatus === 'completed' && '✅ Анализ завершён!'}
            </div>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => navigate('/projects')}
              disabled={loading}
            >
              Отмена
            </button>
            <button 
              type="submit" 
              className={styles.createProjectBtn} 
              disabled={loading}
            >
              {loading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
        </div>
      )}

      {/* Граф в реальном времени на весь экран */}
      {showGraph && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#f5f5f5', zIndex: 1000 }}>
          <div style={{ padding: '16px 20px', background: 'white', borderBottom: '2px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111' }}>📊 Project Architecture</h2>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Nodes: {nodes.length} | Edges: {edges.length} | Requirements: {requirements.length} | Endpoints: {Object.keys(endpoints).length}
              </div>
            </div>
            <button 
              onClick={() => { setShowGraph(false); navigate('/projects'); }}
              style={{ 
                background: '#ef4444', 
                color: 'white', 
                border: 'none', 
                padding: '8px 16px', 
                borderRadius: '6px', 
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              Close
            </button>
          </div>
          <div style={{ height: 'calc(100vh - 80px)' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              minZoom={0.05}
              maxZoom={2}
              fitView
              fitViewOptions={{ padding: 0.15 }}
            >
              <Background color="#d1d5db" gap={20} />
              <Controls />
            </ReactFlow>
          </div>
        </div>
      )}

      {showPremiumModal && (
        <div className={styles.modalOverlay} onClick={() => setShowPremiumModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setShowPremiumModal(false)}>×</button>
            <div className={styles.modalHeader}>
              <h2>Требуется Premium</h2>
              <div className={styles.warningBanner}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Файл превышает 50 МБ. Купить Premium для загрузки больших проектов.</span>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.modalPrimaryBtn} onClick={() => { navigate('/pricing'); }}>
                Купить Premium
              </button>
              <button className={styles.modalSecondaryBtn} onClick={() => { setFile(null); setShowPremiumModal(false); }}>
                Продолжить без файла
              </button>
              <button className={styles.modalCancelBtn} onClick={() => setShowPremiumModal(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
