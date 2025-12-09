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

    const LAYER_GAP = 420;
    const START_X = 100;
    const START_Y = 50;
    const NODE_HEIGHT = 80;

    const newNodes = [];
    const newEdges = [];

    // Группируем узлы по слоям
    const layerGroups = {
      2: [], // endpoints
      3: [], // services  
      3.5: [], // service methods
      4: [] // database
    };

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
      }
      return null;
    };

    // Собираем все узлы
    architectureData.forEach(({ parent, children }) => {
      const parentType = getNodeType(parent);
      if (parentType) {
        layerGroups[parentType.layer].push(parent);
      }

      children.forEach(child => {
        const childType = getNodeType(child);
        if (childType) {
          layerGroups[childType.layer].push(child);
        }
      });
    });

    // Удаляем дубликаты
    Object.keys(layerGroups).forEach(layer => {
      layerGroups[layer] = [...new Set(layerGroups[layer])];
    });

    // Создаём узлы
    Object.entries(layerGroups).forEach(([layer, nodes]) => {
      nodes.forEach((nodeName, idx) => {
        const nodeType = getNodeType(nodeName);
        newNodes.push({
          id: nodeName,
          type: 'default',
          position: {
            x: START_X + parseFloat(layer) * LAYER_GAP,
            y: START_Y + idx * NODE_HEIGHT
          },
          data: {
            label: (
              <div style={{ padding: '10px', textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{nodeName}</div>
                {endpoints[nodeName] && (
                  <div style={{ fontSize: '10px', color: '#666' }}>{endpoints[nodeName]}</div>
                )}
              </div>
            )
          },
          style: {
            background: nodeType?.type === 'endpoint' ? '#4CAF50' :
                       nodeType?.type === 'service' ? '#2196F3' :
                       nodeType?.type === 'service-method' ? '#03A9F4' :
                       '#9C27B0',
            color: 'white',
            border: '1px solid #333',
            borderRadius: '8px',
            fontSize: '12px'
          }
        });
      });
    });

    // Создаём рёбра
    architectureData.forEach(({ parent, children }) => {
      children.forEach(child => {
        const parentType = getNodeType(parent);
        const childType = getNodeType(child);
        
        if (parentType && childType) {
          newEdges.push({
            id: `${parent}-${child}`,
            source: parent,
            target: child,
            type: 'default',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#555', strokeWidth: 1.5 }
          });
        }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [architectureData, endpoints, setNodes, setEdges]);

  return (
    <div className={styles.container}>
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

        {/* Граф в реальном времени */}
        {showGraph && (
          <div className={analysisStyles.graphContainer} style={{ marginTop: '20px', height: '600px', border: '1px solid #333', borderRadius: '8px' }}>
            <div style={{ padding: '10px', background: '#1a1a1a', borderBottom: '1px solid #333' }}>
              <h3>📊 Визуализация архитектуры</h3>
              <div style={{ fontSize: '12px', color: '#888' }}>
                Узлов: {nodes.length} | Связей: {edges.length} | Requirements: {requirements.length} | Endpoints: {Object.keys(endpoints).length}
              </div>
            </div>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        )}
      </div>

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
