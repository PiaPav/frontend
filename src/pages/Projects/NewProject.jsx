import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI } from '../../services/api';
import grpcClient from '../../services/grpcClient';
import { useAuth } from '../../context/AuthContext';
import styles from './Projects.module.css';

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
  const [logs, setLogs] = useState([]); // Логи для отображения
  const logsEndRef = useRef(null); // Ref для автоскролла
  const navigate = useNavigate();
  const { user } = useAuth();

  // Автоскролл логов вниз
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Функция для добавления лога
  const addLog = (type, message, details = null) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { type, message, details, timestamp };
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`, details || '');
    setLogs(prev => [...prev, logEntry]);
  };

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
    setLogs([]); // Очистить предыдущие логи

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
      addLog('info', '📤 Отправка проекта на backend через REST API...');
      addLog('info', `Название: "${form.name}", Описание: "${form.description}"`);
      addLog('info', `Файл: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      
      setAnalysisStatus('creating');
      
      const payload = { 
        name: form.name,
        description: form.description,
        file: file
      };
      
      const result = await projectsAPI.create(payload);
      addLog('success', '✅ Проект создан успешно!', { project_id: result.id });
      
      if (!result.id) {
        throw new Error('Backend не вернул ID проекта');
      }

      // ШАГ 2: Запуск gRPC анализа сразу после создания
      addLog('info', '📡 Подключаемся к gRPC stream для анализа...');
      addLog('info', `User ID: ${user.id}, Project ID: ${result.id}`);
      addLog('info', '⏱️ Ожидание 2 секунды перед подключением (backend готовит данные)...');
      setAnalysisStatus('analyzing');

      if (!user || !user.id) {
        throw new Error('User ID не найден. Перезайдите в систему.');
      }

      // Таймер для отслеживания долгого ожидания
      let connectionTimer = setTimeout(() => {
        addLog('warning', '⚠️ Подключение к gRPC занимает больше 5 секунд...');
        addLog('warning', 'Возможные причины: backend обрабатывает запрос или не отвечает');
      }, 7000); // +2 секунды на задержку

      let firstMessageTimer = setTimeout(() => {
        addLog('warning', '⚠️ Первое сообщение не пришло за 10 секунд');
        addLog('warning', 'Проверьте: существует ли проект в БД? Запущен ли Algorithm service?');
      }, 12000); // +2 секунды на задержку

      // Добавляем задержку 2 секунды перед подключением к gRPC
      await grpcClient.connectToStream(user.id, result.id, {
        onStart: () => {
          clearTimeout(connectionTimer);
          clearTimeout(firstMessageTimer);
          addLog('success', '🎬 gRPC подключение установлено - начался анализ');
        },
        
        onRequirements: (data) => {
          clearTimeout(firstMessageTimer);
          const count = data.requirements?.length || 0;
          addLog('success', `📋 Получены Requirements (${count} шт.)`);
          addLog('info', 'Содержание:', data.requirements?.slice(0, 3).map(r => r.description).join(', '));
        },
        
        onEndpoints: (data) => {
          const count = Object.keys(data.endpoints || {}).length;
          addLog('success', `🔗 Получены Endpoints (${count} шт.)`);
          addLog('info', 'Endpoints:', Object.keys(data.endpoints || {}).join(', '));
        },
        
        onArchitecture: (data) => {
          addLog('success', `🏗️ Получена Architecture часть (parent: ${data.parent || 'root'})`);
          addLog('info', `Детей: ${data.children?.length || 0}`);
        },
        
        onDone: () => {
          clearTimeout(connectionTimer);
          clearTimeout(firstMessageTimer);
          addLog('success', '✅ gRPC Stream завершён успешно!');
          addLog('info', '🚀 Перенаправление на страницу визуализации...');
          setAnalysisStatus('completed');
          setLoading(false);
          
          // Переход на страницу визуализации архитектуры
          setTimeout(() => {
            navigate(`/projects/${result.id}/architecture`);
          }, 1000);
        },
        
        onError: (error) => {
          clearTimeout(connectionTimer);
          clearTimeout(firstMessageTimer);
          addLog('error', '❌ Ошибка gRPC stream');
          addLog('error', error.message);
          addLog('error', 'Stack trace:', error.stack);
          
          setError(`Ошибка анализа проекта: ${error.message}`);
          setAnalysisStatus('error');
          setLoading(false);
          
          // Даже при ошибке анализа переходим на страницу проекта
          addLog('info', 'Переход на страницу проекта через 3 секунды...');
          setTimeout(() => {
            navigate(`/projects/${result.id}/architecture`);
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
              {analysisStatus === 'analyzing' && '📡 Анализ проекта... Это может занять несколько минут.'}
              {analysisStatus === 'completed' && '✅ Анализ завершён!'}
            </div>
          )}

          {/* Логи в реальном времени */}
          {logs.length > 0 && (
            <div className={styles.logsContainer}>
              <h3>📋 Логи процесса:</h3>
              <div className={styles.logsList}>
                {logs.map((log, index) => (
                  <div 
                    key={index} 
                    className={`${styles.logEntry} ${styles[`log${log.type.charAt(0).toUpperCase() + log.type.slice(1)}`]}`}
                  >
                    <span className={styles.logTime}>[{log.timestamp}]</span>
                    <span className={styles.logMessage}>{log.message}</span>
                    {log.details && (
                      <pre className={styles.logDetails}>{JSON.stringify(log.details, null, 2)}</pre>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
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
