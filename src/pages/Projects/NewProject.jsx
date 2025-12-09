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

  // Построение графа в реальном времени
  useEffect(() => {
    if (architectureData.length === 0) return;

    const LAYER_GAP = 400;
    const START_X = 80;
    const START_Y = 80;
    const NODE_SPACING = 110;

    const newNodes = [];
    const newEdges = [];

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

    // Определение типа узла
    const getNodeType = (nodeName) => {
      if (endpoints[nodeName]) {
        return { type: 'endpoint', layer: 2 };
      } else if (['AuthService', 'AccountService', 'ProjectService', 'CoreService'].includes(nodeName)) {
        return { type: 'service', layer: 3 };
      } else if (nodeName.includes('Service.')) {
        return { type: 'service-method', layer: 3.5 };
      } else if (nodeName.startsWith('Account.') || nodeName.startsWith('Project.')) {
        return { type: 'database-method', layer: 4 };
      } else if (nodeName.startsWith('DatabaseManager')) {
        return { type: 'database-manager', layer: 4 };
      } else if (nodeName.includes('Controller.')) {
        return { type: 'controller', layer: 3.5 };
      } else if (nodeName.startsWith('router.')) {
        return { type: 'router', layer: 2.5 };
      }
      return { type: 'other', layer: 5 };
    };

    // Собираем все узлы из architecture data
    const allNodes = new Set();
    architectureData.forEach(({ parent, children }) => {
      allNodes.add(parent);
      children.forEach(child => {
        const cleanChild = child.split('/').pop();
        allNodes.add(cleanChild);
      });
    });

    // Группируем по слоям
    const nodesByLayer = {
      2: [], // Endpoints
      2.5: [], // Routers
      3: [], // Services  
      3.5: [], // Service/Controller methods
      4: [], // Database
      5: [] // Other
    };

    allNodes.forEach(nodeName => {
      const { layer } = getNodeType(nodeName);
      if (nodesByLayer[layer]) {
        nodesByLayer[layer].push(nodeName);
      }
    });

    // Добавляем endpoints из объекта endpoints
    nodesByLayer[2] = Object.keys(endpoints);

    console.log('📊 Узлы по слоям:', {
      'Endpoints': nodesByLayer[2].length,
      'Routers': nodesByLayer[2.5].length,
      'Services': nodesByLayer[3].length,
      'Methods': nodesByLayer[3.5].length,
      'Database': nodesByLayer[4].length,
    });
    
    console.log('🔍 Примеры узлов:', {
      endpoints: nodesByLayer[2].slice(0, 3),
      routers: nodesByLayer[2.5].slice(0, 3),
      services: nodesByLayer[3],
      methods: nodesByLayer[3.5].slice(0, 5),
      database: nodesByLayer[4].slice(0, 5)
    });

    // === LAYER 2: HTTP Endpoints ===
    const endpointsList = nodesByLayer[2].map(key => ({ key, value: endpoints[key] }));
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

    // === LAYER 3: Services ===
    nodesByLayer[3].forEach((serviceName, idx) => {
      const serviceConfig = serviceColors[serviceName] || { 
        color: '#64748b', 
        icon: '⚙️', 
        label: serviceName.replace('Service', '') 
      };
      
      newNodes.push({
        id: serviceName,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 1.5, y: START_Y + idx * 180 },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{serviceConfig.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>{serviceConfig.label}</div>
              <div style={{ fontSize: '9px', opacity: 0.8, marginTop: '2px', letterSpacing: '1px' }}>SERVICE</div>
            </div>
          ),
        },
        style: {
          background: `linear-gradient(135deg, ${serviceConfig.color} 0%, ${serviceConfig.color}dd 100%)`,
          color: 'white',
          borderRadius: '16px',
          padding: '20px 24px',
          width: 160,
          textAlign: 'center',
          boxShadow: `0 8px 24px ${serviceConfig.color}40`,
          border: '2px solid white',
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // === LAYER 3.5: Methods (Controllers/Service Methods) ===
    nodesByLayer[3.5].forEach((methodName, idx) => {
      const serviceName = methodName.split('.')[0];
      const methodShortName = methodName.split('.')[1];
      const serviceConfig = serviceColors[serviceName] || { color: '#64748b' };
      
      newNodes.push({
        id: methodName,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 2.5, y: START_Y + idx * NODE_SPACING },
        data: {
          label: (
            <div style={{ padding: '4px 8px' }}>
              <div style={{ 
                fontSize: '8px', 
                fontWeight: '700', 
                color: serviceConfig.color,
                background: `${serviceConfig.color}15`,
                padding: '2px 6px',
                borderRadius: '4px',
                marginBottom: '4px',
                textAlign: 'center'
              }}>
                {serviceName.replace('Service', '').toUpperCase()}
              </div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#1f2937', textAlign: 'center' }}>
                {methodShortName}
              </div>
            </div>
          ),
        },
        style: {
          background: 'white',
          border: `2px solid ${serviceConfig.color}`,
          borderRadius: '10px',
          padding: '6px 10px',
          width: 170,
          fontSize: '11px',
          boxShadow: `0 4px 12px ${serviceConfig.color}25`,
        },
        sourcePosition: 'right',
        targetPosition: 'left',
      });
    });

    // === LAYER 4: Database (сгруппированные по классам) ===
    const dbGroups = {
      'DatabaseManager': [],
      'Account': [],
      'Project': [],
    };
    
    nodesByLayer[4].forEach(nodeName => {
      if (nodeName.startsWith('DatabaseManager')) {
        dbGroups['DatabaseManager'].push(nodeName);
      } else if (nodeName.startsWith('Account.')) {
        dbGroups['Account'].push(nodeName);
      } else if (nodeName.startsWith('Project.')) {
        dbGroups['Project'].push(nodeName);
      }
    });

    let dbYOffset = START_Y;
    Object.entries(dbGroups).forEach(([groupName, methods]) => {
      if (methods.length === 0) return;

      // Заголовок группы - увеличенный и более заметный
      newNodes.push({
        id: `group-${groupName}`,
        type: 'default',
        position: { x: START_X + LAYER_GAP * 3.5, y: dbYOffset },
        data: {
          label: (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', fontWeight: '700', opacity: 0.9, marginBottom: '6px', letterSpacing: '1px' }}>🗄️ DATABASE</div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>{groupName}</div>
              <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '4px' }}>{methods.length} метод{methods.length > 1 ? 'а' : ''}</div>
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

      dbYOffset += 90;

      // Методы группы
      methods.forEach((method, idx) => {
        const methodShort = method.split('.')[1] || method;
        newNodes.push({
          id: method,
          type: 'default',
          position: { x: START_X + LAYER_GAP * 4.3, y: dbYOffset + idx * 75 },
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

      dbYOffset += methods.length * 70 + 40;
    });

    // === Создание рёбер (связей) ===
    // Строим map всех узлов для быстрой проверки
    const nodeIds = new Set(newNodes.map(n => n.id));
    
    architectureData.forEach(({ parent, children }) => {
      children.forEach(child => {
        const cleanChild = child.split('/').pop();
        
        // Проверяем существование обоих узлов
        if (nodeIds.has(parent) && nodeIds.has(cleanChild)) {
          newEdges.push({
            id: `${parent}-${cleanChild}`,
            source: parent,
            target: cleanChild,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
            style: { stroke: '#94a3b8', strokeWidth: 2 },
            animated: false
          });
        }
      });
    });
    
    // Связываем endpoints напрямую с методами контроллеров
    let endpointLinksCount = 0;
    Object.keys(endpoints).forEach(endpointKey => {
      // Ищем соответствующие узлы: AuthController.login, ProjectController.create_project и т.д.
      const possibleTargets = [
        `AuthController.${endpointKey}`,
        `ProjectController.${endpointKey}`,
        `AccountController.${endpointKey}`,
        `router.${endpointKey}`,
      ];
      
      for (const target of possibleTargets) {
        if (nodeIds.has(target)) {
          const method = endpoints[endpointKey]?.split(' ')[0] || 'GET';
          const color = methodColors[method]?.border || '#3b82f6';
          
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
          endpointLinksCount++;
          break;
        }
      }
    });
    
    console.log('🔗 Связи построены:', {
      total: newEdges.length,
      fromArchitecture: newEdges.length - endpointLinksCount,
      fromEndpoints: endpointLinksCount
    });

    setNodes(newNodes);
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
            <input
              id="file"
              name="file"
              type="file"
              onChange={handleFileChange}
              disabled={loading}
              accept=".zip,application/zip,application/x-zip-compressed"
              required
            />
            <small>Загрузите ZIP-архив с проектом (обязательно)</small>
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
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111' }}>📊 Архитектура проекта</h2>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Узлов: {nodes.length} | Связей: {edges.length} | Requirements: {requirements.length} | Endpoints: {Object.keys(endpoints).length}
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
              Закрыть
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
