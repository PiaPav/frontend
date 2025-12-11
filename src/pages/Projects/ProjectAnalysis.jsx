import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './ProjectAnalysis.module.css';
import { projectsAPI } from '../../services/api';
import grpcClient from '../../services/grpcClient';
import buildGraph from '../../utils/buildGraph';
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
  const [grpcStarted, setGrpcStarted] = useState(false);
  const streamControllerRef = useRef(null);
  const requirementsRef = useRef([]);
  const endpointsRef = useRef({});
  const architectureDataRef = useRef([]);

  // Сбрасываем состояние при смене id проекта
  useEffect(() => {
    setProject(null);
    setRequirements([]);
    setEndpoints({});
    setArchitectureData([]);
    setStreamComplete(false);
    setGrpcStarted(false);
    setError(null);
    setIsFirstLoad(true);
    setLoading(true);
  }, [id]);

  useEffect(() => {
    requirementsRef.current = requirements;
  }, [requirements]);

  useEffect(() => {
    endpointsRef.current = endpoints;
  }, [endpoints]);

  useEffect(() => {
    architectureDataRef.current = architectureData;
  }, [architectureData]);

  // Загрузка проекта через REST + gRPC stream
  useEffect(() => {
    let cancelled = false;
    
    // Реальный проект: REST + gRPC
    const loadProject = async () => {
      try {
        if (isFirstLoad) {
          setLoading(true);
          setError(null);
        }
        
        console.log('[load] Loading project via REST, ID:', id);
        
        // 1. REST: fetch project data
        const projectData = await projectsAPI.getById(id);
        console.log('[REST] /project response:', {
          id: projectData?.id,
          name: projectData?.name,
          description: projectData?.description,
          hasArchitecture: !!projectData?.architecture,
          archRequirements: projectData?.architecture?.requirements?.length || 0,
          archEndpoints: Array.isArray(projectData?.architecture?.endpoints)
            ? projectData.architecture.endpoints.length
            : projectData?.architecture?.endpoints
              ? Object.keys(projectData.architecture.endpoints).length
              : 0,
          archDataNodes: projectData?.architecture?.data
            ? Object.keys(projectData.architecture.data).length
            : 0,
          rawArchitecture: projectData?.architecture,
        });
        if (cancelled) return;

        let archFromApi = projectData.architecture;
        if (typeof archFromApi === 'string') {
          try {
            archFromApi = JSON.parse(archFromApi);
          } catch (parseError) {
            console.warn('[ui] Failed to parse architecture from API response', parseError);
            archFromApi = null;
          }
        }

        if (archFromApi && typeof archFromApi === "object") {
          const requirementsList = Array.isArray(archFromApi.requirements) ? archFromApi.requirements : [];

          let endpointsObj = {};
          if (archFromApi.endpoints) {
            if (Array.isArray(archFromApi.endpoints)) {
              archFromApi.endpoints.forEach(endpoint => {
                Object.entries(endpoint).forEach(([key, value]) => {
                  endpointsObj[key] = value;
                });
              });
            } else if (typeof archFromApi.endpoints === "object") {
              endpointsObj = archFromApi.endpoints;
            }
          }

          const dataObj = archFromApi.data && typeof archFromApi.data === "object" ? archFromApi.data : {};

          const hasArchitectureFromApi = (
            requirementsList.length > 0 ||
            Object.keys(endpointsObj).length > 0 ||
            Object.keys(dataObj).length > 0
          );

          setProject({
            ...projectData,
            architecture: {
              ...archFromApi,
              requirements: requirementsList,
              endpoints: endpointsObj,
              data: dataObj
            }
          });

          if (hasArchitectureFromApi) {
            console.log('[ui] Architecture received via GET, skip gRPC stream');
            setRequirements(requirementsList);
            setEndpoints(endpointsObj);

            const archArray = Object.entries(dataObj).map(([parent, children]) => ({
              parent,
              children: Array.isArray(children) ? children : []
            }));
            setArchitectureData(archArray);
            console.log('[REST] Architecture from GET:', {
              requirements: requirementsList.length,
              endpoints: Object.keys(endpointsObj).length,
              nodes: archArray.length,
            });

            setStreamComplete(true);
            setLoading(false);
            setIsFirstLoad(false);
            return;
          }
        } else {
          setProject(projectData);
        }

        // 2. If no architecture came from REST - start gRPC stream
        setLoading(false);
        setIsFirstLoad(false);
        
        // Guard: do not start gRPC stream twice
        if (grpcStarted || streamControllerRef.current) {
          console.log('⚠️ gRPC stream уже запущен или есть активный controller, пропускаем повторный вызов');
          return;
        }
        
        setGrpcStarted(true);
        console.log('📡 Запуск gRPC stream для анализа проекта');
        
        if (!user || !user.id) {
          console.error('❌ User ID не найден');
          setError('Ошибка авторизации. Перезайдите в систему.');
          setGrpcStarted(false);
          return;
        }
        
        console.log('[ui] 🛰 вызов grpcClient.connectToStream()', {
          userId: user.id,
          taskId: parseInt(id, 10),
        });

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
            setArchitectureData(prev => {
              const next = [...prev, {
                parent: data.parent,
                children: data.children
              }];
              architectureDataRef.current = next;
              return next;
            });
          },
          
          onDone: async () => {
            console.log('✅ gRPC Stream завершён');
            setStreamComplete(true);
            streamControllerRef.current = null;
            
            // PATCH будет вызван при закрытии страницы или вручную
            console.log('💡 Архитектура получена. Сохранение при закрытии проекта.');
          },
          
          onError: (error) => {
            console.error('❌ gRPC ошибка:', error);
            streamControllerRef.current = null;
            setGrpcStarted(false);
            const errorMessage = error.message || 'Ошибка получения данных архитектуры';
            
            // Если ошибка 500 и данные уже есть в БД - игнорируем
            if (errorMessage.includes('500') && project?.architecture?.data) {
              console.log('⚠️ gRPC 500, но данные уже в БД - показываем их');
              setError(null);
              return;
            }
            
            // Проверяем конкретные типы ошибок
            if (errorMessage.includes('прерван преждевременно')) {
              setError('⚠️ Анализ не был завершён корректно.\n\n' +
                'Stream оборвался до получения статуса DONE.\n\n' +
                'Возможные причины:\n' +
                '• Ошибка в алгоритме анализа проекта\n' +
                '• Таймаут обработки (слишком большой проект)\n' +
                '• Повреждён архив или файлы проекта\n' +
                '• Недостаточно памяти на сервере\n\n' +
                'Детали:\n' + errorMessage + '\n\n' +
                'Проверьте логи Core gRPC сервиса:\n' +
                'docker logs -f core-service');
            } else if (errorMessage.includes('500')) {
              setError('⚠️ Внутренняя ошибка сервера при анализе проекта.\n\n' +
                'Возможные причины:\n' +
                '• Проект не найден в БД (task_id не существует)\n' +
                '• Поле files_url пустое или файл отсутствует в S3\n' +
                '• Ошибка парсинга кода или распаковки архива\n' +
                '• Исключение (Exception) в алгоритме RunAlgorithm\n\n' +
                'Что проверить на бэкенде:\n' +
                '1. docker logs -f core-service (ищите traceback)\n' +
                '2. SELECT id, author_id, files_url FROM projects WHERE id=' + id + '\n' +
                '3. Проверьте, существует ли файл в S3 (ключ из files_url)\n' +
                '4. docker logs -f envoy (upstream connect error?)\n\n' +
                'Детали: ' + errorMessage);
            } else if (errorMessage.includes('404')) {
              setError('❌ Сервис анализа недоступен (404).\n\n' +
                'Проверьте конфигурацию Envoy:\n' +
                '• Роутинг для /core.api.FrontendStreamService/RunAlgorithm\n' +
                '• Upstream cluster указывает на core-service:50051\n' +
                '• Core gRPC сервис запущен: docker ps | grep core');
            } else if (errorMessage.includes('502') || errorMessage.includes('503')) {
              setError('❌ Сервис анализа временно недоступен (502/503).\n\n' +
                'Core gRPC сервер недоступен через Envoy.\n\n' +
                'Проверьте:\n' +
                '• docker ps (core-service запущен?)\n' +
                '• docker logs envoy (upstream connect error?)\n' +
                '• GRPC_HOST в .env алгоритм-сервиса указывает на core-service');
            } else if (errorMessage.includes('Failed to fetch')) {
              setError('❌ Не удалось подключиться к серверу анализа.\n\n' +
                'Проверьте сетевое подключение:\n' +
                '• Vite proxy: /grpc → http://78.153.139.47:8080\n' +
                '• Envoy доступен: curl http://78.153.139.47:8080\n' +
                '• Нет блокировки CORS или firewall');
            } else if (errorMessage.includes('завершился без данных')) {
              setError('❌ Stream завершился без получения данных.\n\n' +
                'Backend не отправил ни одного сообщения.\n\n' +
                'Возможные причины:\n' +
                '• Проект не принадлежит user_id=' + user.id + '\n' +
                '• Проект не найден в БД (task_id=' + id + ')\n' +
                '• Ошибка перед началом отправки данных\n\n' +
                'Проверьте логи Core: docker logs -f core-service');
            } else {
              setError(`❌ Ошибка: ${errorMessage}\n\nПопробуйте перезагрузить страницу или обратитесь к администратору.`);
            }
            setStreamComplete(true);
          }
        });
        
        
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
      setGrpcStarted(false); // Сбрасываем флаг при cleanup
      if (streamControllerRef.current) {
        streamControllerRef.current.abort?.();
        streamControllerRef.current.cancel?.();
        streamControllerRef.current = null;
      }
    };
  }, [id, user]);

  // Построение графа с единой схемой (как при создании проекта)
  useEffect(() => {
    if (!project) return;
    if (architectureData.length === 0 && Object.keys(endpoints || {}).length === 0) return;

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
      serviceColors,
    });

    console.log('✅ Граф отрисован (просмотр):', summary);

    setNodes(builtNodes);
    setEdges(builtEdges);
    if (isFirstLoad && builtNodes.length > 0) {
      setIsFirstLoad(false);
    }
  }, [project, requirements, endpoints, architectureData, setNodes, setEdges, isFirstLoad]);

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
