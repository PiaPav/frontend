import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { SmartStepEdge } from '@tisoap/react-flow-smart-edge'; // npm install @tisoap/react-flow-smart-edge
import { projectsAPI } from '../../services/api';
import grpcClient from '../../services/grpcClient';
import buildGraph from '../../utils/buildGraph';
import { layoutWithElk } from '../../utils/layoutWithElk';
import { useAuth } from '../../context/AuthContext';
import styles from './Projects.module.css';
import analysisStyles from './ProjectAnalysis.module.css';
import GraphHeader from './GraphHeader';

const edgeTypes = {
  smart: SmartStepEdge,
};

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

  // Build graph in real-time with shared builder
  useEffect(() => {
    if (architectureData.length === 0 && Object.keys(endpoints).length === 0) return;

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

    const { nodes: builtNodes, edges: builtEdges, summary } = buildGraph({
      requirements,
      endpoints,
      architectureData,
      methodColors,
      serviceColors
    });

    console.log('✅ Граф отрисован (итог, до layout):', summary);

    // Асинхронно применяем ELK-лэйаут
    layoutWithElk(builtNodes, builtEdges, 'RIGHT')
      .then(({ nodes: layoutNodes, edges: layoutEdges }) => {
        setNodes(layoutNodes);
        setEdges(layoutEdges);
      })
      .catch((err) => {
        console.error('ELK layout error:', err);
        // fallback: если ELK сломался, показываем как было
        setNodes(builtNodes);
        setEdges(builtEdges);
      });
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
        <div className={analysisStyles.graphOverlay}>
          <GraphHeader
            title="Project Architecture"
            nodesCount={nodes.length}
            edgesCount={edges.length}
            requirementsCount={requirements.length}
            endpointsCount={Object.keys(endpoints).length}
            onClose={() => { setShowGraph(false); navigate('/projects'); }}
            closeLabel="Close"
          />
          <div className={analysisStyles.graphBody}>
            <div className={analysisStyles.flowWrapper}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                edgeTypes={edgeTypes}
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
