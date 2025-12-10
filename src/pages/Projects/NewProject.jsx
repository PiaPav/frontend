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

  // Сохранение архитектуры при уходе со страницы
  useEffect(() => {
    const handleSaveOnExit = async () => {
      if (currentProjectId && architectureDataRef.current.length > 0) {
        console.log('💾 Сохранение архитектуры при закрытии страницы...');
        
        const archData = {
          requirements,
          endpoints: Object.entries(endpoints).map(([k, v]) => ({ [k]: v })),
          data: architectureDataRef.current.reduce((acc, item) => {
            acc[item.parent] = item.children;
            return acc;
          }, {})
        };
        
        try {
          // Используем fetch с keepalive для надёжной отправки при закрытии
          const token = localStorage.getItem('access_token');
          await fetch(`${import.meta.env.VITE_API_URL || '/v1'}/project/${currentProjectId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ architecture: archData }),
            keepalive: true
          });
          console.log('✅ Архитектура сохранена');
        } catch (err) {
          console.error('❌ Ошибка сохранения:', err);
        }
      }
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
      // Keep the file selection but show premium modal
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

    if (!form.description.trim()) {
      setError('Введите описание проекта');
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
      
      console.log('🚀 Запуск gRPC stream:', { user_id: validUserId, task_id: validProjectId });

      // Отправляем gRPC запрос
      const controller = await grpcClient.connectToStream(validUserId, validProjectId, {
        onStart: () => {
          console.log('🎬 gRPC подключение установлено');
        },
        
        onRequirements: (data) => {
          console.log('📋 Requirements:', data.requirements?.length);
          setRequirements(data.requirements || []);
        },
        
        onEndpoints: (data) => {
          console.log('🔗 Endpoints:', Object.keys(data.endpoints || {}).length);
          setEndpoints(data.endpoints || {});
        },
        
        onArchitecture: (data) => {
          console.log('🏗️ Architecture:', data.parent, '→', data.children?.length);
          setArchitectureData(prev => [...prev, {
            parent: data.parent,
            children: data.children || []
          }]);
        },
        
        onDone: async () => {
          console.log('✅ gRPC Stream завершён успешно!');
          setAnalysisStatus('completed');
          setLoading(false);
          streamControllerRef.current = null;
        },
        
        onError: (error) => {
          console.error('❌ Ошибка gRPC stream:', error);
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

    const LAYER_GAP = 450;
    const START_X = 80;
    const START_Y = 80;
    const NODE_SPACING = 120; // Increased spacing between HTTP endpoints
    const GROUP_SPACING = 180;

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
      
      // Layer 5: gRPC / Algorithm / Core services
      if (nodeName.includes('StreamService') || 
          nodeName.includes('AlgorithmConnection') ||
          nodeName.includes('CoreServer') ||
          nodeName.includes('TaskSession') ||
          nodeName.includes('TaskManager') ||
          nodeName.startsWith('start_grpc') ||
          nodeName.startsWith('stop_grpc') ||
          nodeName.includes('Servicer') ||
          nodeName.includes('Stub') ||
          nodeName.includes('add_') && nodeName.includes('_to_server')) {
        
        let className = 'gRPC Core';
        if (nodeName.includes('FrontendStream')) className = 'FrontendStream';
        else if (nodeName.includes('AlgorithmConnection')) className = 'AlgorithmConnection';
        else if (nodeName.includes('CoreServer') || nodeName.includes('grpc')) className = 'CoreServer';
        else if (nodeName.includes('TaskSession')) className = 'TaskSession';
        else if (nodeName.includes('TaskManager')) className = 'TaskManager';
        
        return { type: 'grpc', layer: 5, class: className };
      }
      
      // Layer 4: Database infrastructure
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
        
        return { type: 'database', layer: 4, class: className };
      }
      
      // Layer 3: Domain / Service layer (classes with methods)
      if (nodeName.includes('.')) {
        const className = nodeName.split('.')[0];
        
        // Service classes
        if (nodeName.includes('Service')) {
          return { type: 'service', layer: 3, class: className };
        }
        
        // Database models (Account.*, Project.*)
        if (className === 'Account' || className === 'Project') {
          return { type: 'model', layer: 3, class: className };
        }
        
        // Other domain classes
        return { type: 'domain', layer: 3, class: className };
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

    // Group nodes by layer and class
    const classByLayer = {
      0: { 'Requirements': [] }, // Requirements (dependencies)
      1: { 'HTTP': [] },        // HTTP Endpoints
      2: {},                     // Handler / Router functions
      3: {},                     // Domain / Service layer
      4: {},                     // Database infrastructure
      5: {}                      // gRPC / Algorithm / Core
    };
    
    // Collect and group connected nodes
    const processedNodes = new Set();
    
    // Add requirements to Layer 0
    requirements.forEach(req => {
      if (req && !processedNodes.has(req)) {
        processedNodes.add(req);
        classByLayer[0]['Requirements'].push(req);
      }
    });
    
    connectedNodes.forEach(nodeName => {
      const nodeType = getNodeType(nodeName);
      if (!nodeType || processedNodes.has(nodeName)) return;
      
      processedNodes.add(nodeName);
      const { layer, class: className } = nodeType;
      
      if (!classByLayer[layer]) classByLayer[layer] = {};
      if (!classByLayer[layer][className]) classByLayer[layer][className] = [];
      
      classByLayer[layer][className].push(nodeName);
    });

    console.log('📊 Grouped nodes:', {
      'Layer 0 (Requirements)': classByLayer[0]['Requirements']?.length || 0,
      'Layer 1 (HTTP Endpoints)': classByLayer[1]['HTTP']?.length || 0,
      'Layer 2 (Handlers)': Object.keys(classByLayer[2]).length,
      'Layer 3 (Domain/Service)': Object.keys(classByLayer[3]).length,
      'Layer 4 (Database/Infra)': Object.keys(classByLayer[4]).length,
      'Layer 5 (gRPC/Core)': Object.keys(classByLayer[5]).length,
    });
    
    console.log('🔍 Classes by layer:', {
      layer0: classByLayer[0]['Requirements']?.slice(0, 5),
      layer2: Object.keys(classByLayer[2]),
      layer3: Object.keys(classByLayer[3]),
      layer4: Object.keys(classByLayer[4]),
      layer5: Object.keys(classByLayer[5])
    });

    // === LAYER 0: Requirements (Dependencies) ===
    const requirementsList = classByLayer[0]['Requirements'] || [];
    requirementsList.forEach((reqName, idx) => {
      newNodes.push({        id: reqName,
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

    // === LAYER 1: HTTP Endpoints ===
    const httpEndpoints = classByLayer[1]['HTTP'] || [];
    const endpointsList = httpEndpoints.map(key => ({ key, value: endpoints[key] }));
    const methodOrder = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
    const sortedEndpoints = endpointsList.sort((a, b) => {
      const methodA = a.value?.split(' ')[0] || 'GET';
      const methodB = b.value?.split(' ')[0] || 'GET';
      return methodOrder.indexOf(methodA) - methodOrder.indexOf(methodB);
    });

    sortedEndpoints.forEach(({ key, value }, idx) => {
      const method = value?.split(' ')[0] || 'GET';
      const path = value?.split(' ')[1] || '';
      const color = methodColors[method] || methodColors['GET'];
      
      newNodes.push({
        id: key,
        type: 'default',
        position: { x: START_X, y: START_Y + idx * 100 },
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
              <div style={{ fontSize: '12px', fontWeight: '600', marginTop: '6px', color: '#1f2937' }}>{path}</div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>{key}</div>
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

    // === LAYER 2: Controllers and Services (grouped by class) ===
    let layer2YOffset = START_Y;
    Object.entries(classByLayer[2]).forEach(([className, methods]) => {
      if (methods.length === 0) return;
      
      // Determine class color
      const classConfig = serviceColors[className] || { color: '#64748b', icon: '⚙️' };
      const classColor = classConfig.color;
      const classIcon = classConfig.icon;
      
      // Class header
      newNodes.push({
        id: `class-${className}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP, y: layer2YOffset },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', marginBottom: '4px' }}>{classIcon}</div>
              <div style={{ fontSize: '14px', fontWeight: '700' }}>{className.replace('Service', '').replace('Controller', '')}</div>
              <div style={{ fontSize: '9px', opacity: 0.85, marginTop: '2px' }}>{methods.length} methods</div>
            </div>
          ),
        },
        style: {
          background: `linear-gradient(135deg, ${classColor} 0%, ${classColor}dd 100%)`,
          color: 'white',
          borderRadius: '14px',
          padding: '16px 20px',
          width: 180,
          boxShadow: `0 8px 20px ${classColor}35`,
          border: '2px solid white',
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
      
      layer2YOffset += 90;
      
      // Methods of this class
      methods.forEach((methodName, idx) => {
        const methodShort = methodName.split('.')[1] || methodName;
        
        newNodes.push({
          id: methodName,
          type: 'default',
          position: { x: START_X + LAYER_GAP * 1.8, y: layer2YOffset + idx * 80 },
          data: {
            label: (
              <div style={{ padding: '6px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#1f2937' }}>{methodShort}</div>
              </div>
            ),
          },
          style: {
            background: 'white',
            border: `2px solid ${classColor}`,
            borderRadius: '10px',
            padding: '6px 10px',
            width: 160,
            boxShadow: `0 4px 12px ${classColor}25`,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      });
      
      layer2YOffset += methods.length * 80 + 60;
    });

    // === LAYER 3: Domain / Service layer (grouped by class) ===
    let layer3YOffset = START_Y;
    Object.entries(classByLayer[3]).forEach(([className, methods]) => {
      if (methods.length === 0) return;

      // Domain/Service class header
      const classColors = {
        'Account': '#3b82f6',
        'Project': '#10b981',
        'Auth': '#8b5cf6',
        'AccountService': '#2563eb',
        'AuthService': '#7c3aed',
        'ProjectService': '#059669',
        'CoreService': '#f59e0b',
      };
      const classColor = classColors[className] || '#64748b';

      newNodes.push({
        id: `class-${className}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2.6, y: layer3YOffset },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', fontWeight: '700', opacity: 0.9, marginBottom: '6px', letterSpacing: '1px' }}>📦 DOMAIN</div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>{className}</div>
              <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '4px' }}>{methods.length} methods</div>
            </div>
          ),
        },
        style: {
          background: `linear-gradient(135deg, ${classColor} 0%, ${classColor}dd 100%)`,
          color: 'white',
          borderRadius: '16px',
          padding: '16px 20px',
          width: 200,
          boxShadow: `0 8px 24px ${classColor}40`,
          border: '2px solid white',
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });

      layer3YOffset += 90;

      // Domain methods
      methods.forEach((method, idx) => {
        const methodShort = method.split('.')[1] || method;
        newNodes.push({
          id: method,
          type: 'default',
          position: { x: START_X + LAYER_GAP * 3.4, y: layer3YOffset + idx * 75 },
          data: {
            label: (
              <div style={{ padding: '6px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#1f2937' }}>{methodShort}</div>
              </div>
            ),
          },
          style: {
            background: 'white',
            border: `2px solid ${classColor}`,
            borderRadius: '8px',
            padding: '4px 8px',
            width: 160,
            fontSize: '11px',
            boxShadow: `0 4px 12px ${classColor}25`,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      });

      layer3YOffset += methods.length * 75 + 60;
    });

    // === LAYER 4: Database / Infrastructure (grouped by class) ===
    let layer4YOffset = START_Y;
    Object.entries(classByLayer[4]).forEach(([className, methods]) => {
      if (methods.length === 0) return;

      newNodes.push({
        id: `class-${className}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 4.2, y: layer4YOffset },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', fontWeight: '700', opacity: 0.9, marginBottom: '6px', letterSpacing: '1px' }}>🗄️ DATABASE</div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>{className}</div>
              <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '4px' }}>{methods.length} items</div>
            </div>
          ),
        },
        style: {
          background: 'linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%)',
          color: 'white',
          borderRadius: '16px',
          padding: '16px 20px',
          width: 200,
          boxShadow: '0 8px 24px #9C27B040',
          border: '2px solid white',
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });

      layer4YOffset += 90;

      methods.forEach((method, idx) => {
        const methodShort = method.split('.')[1] || method;
        newNodes.push({
          id: method,
          type: 'default',
          position: { x: START_X + LAYER_GAP * 5, y: layer4YOffset + idx * 75 },
          data: {
            label: (
              <div style={{ padding: '6px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#1f2937' }}>{methodShort}</div>
              </div>
            ),
          },
          style: {
            background: 'white',
            border: '2px solid #9C27B0',
            borderRadius: '8px',
            padding: '4px 8px',
            width: 160,
            fontSize: '11px',
            boxShadow: '0 4px 12px #9C27B025',
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      });

      layer4YOffset += methods.length * 75 + 60;
    });

    // === LAYER 5: gRPC / Algorithm / Core (grouped by class) ===
    let layer5YOffset = START_Y;
    Object.entries(classByLayer[5]).forEach(([className, methods]) => {
      if (methods.length === 0) return;

      newNodes.push({
        id: `class-${className}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 5.8, y: layer5YOffset },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', fontWeight: '700', opacity: 0.9, marginBottom: '6px', letterSpacing: '1px' }}>⚡ gRPC CORE</div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>{className}</div>
              <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '4px' }}>{methods.length} items</div>
            </div>
          ),
        },
        style: {
          background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
          color: 'white',
          borderRadius: '16px',
          padding: '16px 20px',
          width: 200,
          boxShadow: '0 8px 24px #f9731640',
          border: '2px solid white',
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });

      layer5YOffset += 90;

      methods.forEach((method, idx) => {
        const methodShort = method.split('.').pop();
        newNodes.push({
          id: method,
          type: 'default',
          position: { x: START_X + LAYER_GAP * 6.6, y: layer5YOffset + idx * 75 },
          data: {
            label: (
              <div style={{ padding: '6px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: '#1f2937' }}>{methodShort}</div>
              </div>
            ),
          },
          style: {
            background: 'white',
            border: '2px solid #f97316',
            borderRadius: '8px',
            padding: '4px 8px',
            width: 160,
            fontSize: '11px',
            boxShadow: '0 4px 12px #f9731625',
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        });
      });

      layer5YOffset += methods.length * 75 + 60;
    });

    // === EDGES: Build connections using dependency graph ===
    const newEdges = [];
    const nodeIds = new Set(newNodes.map(n => n.id));
    const nodesWithIncomingEdges = new Set();
    const nodesWithOutgoingEdges = new Set();

    // Direct connections from endpoints
    Object.keys(endpoints).forEach(endpointKey => {
      if (!reverseDependencyMap.has(endpointKey)) return;
      
      const method = endpoints[endpointKey]?.split(' ')[0] || 'GET';
      const color = methodColors[method]?.border || '#3b82f6';
      
      reverseDependencyMap.get(endpointKey).forEach(target => {
        if (nodeIds.has(target) && connectedNodes.has(target) && !target.startsWith('class-')) {
          newEdges.push({
            id: `${endpointKey}-${target}`,
            source: endpointKey,
            target: target,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: color },
            style: { stroke: color, strokeWidth: 3 },
            animated: true,
            label: method,
            labelStyle: { fontSize: '10px', fontWeight: '700', fill: color },
            labelBgStyle: { fill: 'white', fillOpacity: 0.9 }
          });
          nodesWithOutgoingEdges.add(endpointKey);
          nodesWithIncomingEdges.add(target);
        }
      });
    });

    // All other dependencies (excluding class headers)
    architectureData.forEach(({ parent, children }) => {
      if (!connectedNodes.has(parent) || parent.startsWith('class-')) return;
      
      children.forEach(child => {
        const cleanChild = child.split('/').pop();
        if (connectedNodes.has(cleanChild) && nodeIds.has(cleanChild) && !cleanChild.startsWith('class-')) {
          newEdges.push({
            id: `${parent}-${cleanChild}`,
            source: parent,
            target: cleanChild,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#94a3b8', strokeWidth: 2 },
          });
          nodesWithOutgoingEdges.add(parent);
          nodesWithIncomingEdges.add(cleanChild);
        }
      });
    });
    
    // Filter out isolated nodes (nodes with no incoming or outgoing edges)
    // Keep endpoints and class headers
    const filteredNodes = newNodes.filter(node => {
      if (node.id.startsWith('class-')) return true; // Keep class headers
      if (endpoints[node.id]) return true; // Keep all endpoints
      if (classByLayer[0]['Requirements']?.includes(node.id)) return true; // Keep requirements
      // Keep only nodes that have at least one edge
      return nodesWithIncomingEdges.has(node.id) || nodesWithOutgoingEdges.has(node.id);
    });
    
    console.log('🔗 Edges built:', {
      total: newEdges.length,
      fromEndpoints: Object.keys(endpoints).length,
      connectedNodes: connectedNodes.size,
      nodesBeforeFilter: newNodes.length,
      nodesAfterFilter: filteredNodes.length,
      isolated: newNodes.length - filteredNodes.length
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
                    {file ? file.name : 'Перетащите архив сюда или нажмите, чтобы выбрать'}
                  </div>
                </div>
                <div className={styles.fileBadge}>ZIP</div>
              </label>
              {file && (
                <div className={styles.fileMeta}>
                  <span className={styles.fileChip}>{file.name}</span>
                  <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                </div>
              )}
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
              fitView
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
