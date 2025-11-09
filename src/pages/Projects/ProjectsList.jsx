import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { projectsAPI } from '../../services/api';
import styles from './Projects.module.css';

export default function ProjectsList() {
  // Демо-проекты для визуализации
  const demoProjects = [
    {
      id: 'demo-1',
      name: 'E-Commerce Platform',
      description: 'Микросервисная архитектура интернет-магазина с FastAPI, PostgreSQL и RabbitMQ',
      picture_url: null,
      hasV2View: true, // Новый вид с папками
    },
    {
      id: 'demo-2',
      name: 'Social Network API',
      description: 'REST API для социальной сети с Django, Redis кэшированием и Celery для фоновых задач',
      picture_url: null,
      hasV2View: false,
    },
    {
      id: 'demo-3',
      name: 'ML Pipeline Service',
      description: 'Сервис машинного обучения с Flask, TensorFlow и MongoDB для хранения моделей',
      picture_url: null,
      hasV2View: false,
    },
  ];

  const [projects, setProjects] = useState(demoProjects); // Используем демо-данные
  const [loading, setLoading] = useState(false); // Отключаем загрузку для демо
  const [error, setError] = useState('');
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Загрузка проектов при монтировании компонента
  useEffect(() => {
    // Временно отключаем загрузку с API для демо
    // loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const data = await projectsAPI.getAll();
      setProjects(data);
      setError('');
    } catch (err) {
      console.error('Ошибка загрузки проектов:', err);
      setError('Не удалось загрузить проекты');
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCreateProject = () => {
    navigate('/projects/new');
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ 
          textAlign: 'center', 
          padding: '100px 20px',
          color: 'white',
          fontSize: '20px',
          fontWeight: '600'
        }}>
          Загрузка проектов...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.createBtn} onClick={handleCreateProject}>
          <span className={styles.plusIcon}>+</span>
          Создать
        </button>

        <div className={styles.centerTitle}>
          <h1>Проекты</h1>
        </div>

        <div className={styles.userMenu}>
          <button className={styles.userBtn}>
            <div className={styles.avatar}>
              {user?.name?.[0]?.toUpperCase() || user?.login?.[0]?.toUpperCase() || 'П'}
            </div>
            <span className={styles.userName}>
              {user?.name || user?.login || 'Пользователь'}
            </span>
            <span className={styles.chevron}>▼</span>
          </button>
          
          <div className={styles.dropdown}>
            <button onClick={handleLogout}>Выйти</button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {error && (
          <div className={styles.error} style={{ marginBottom: '20px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {projects.length === 0 && !error ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '100px 20px',
            background: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '20px',
            color: '#666'
          }}>
            <h2 style={{ marginBottom: '10px', color: '#1a1a1a' }}>У вас пока нет проектов</h2>
            <p>Создайте свой первый проект!</p>
          </div>
        ) : (
          <div className={styles.projectsGrid}>
            {projects.map((project) => (
              <div key={project.id} className={styles.projectCard}>
                <Link
                  to={project.hasV2View ? `/projects/${project.id}/v2` : `/projects/${project.id}`}
                  className={styles.projectLink}
                >
                  <div className={styles.projectImage}>
                    {project.picture_url ? (
                      <img src={project.picture_url} alt={project.name} />
                    ) : (
                      <div className={styles.projectImagePlaceholder}></div>
                    )}
                  </div>
                  <div className={styles.projectInfo}>
                    <h2 className={styles.projectName}>{project.name}</h2>
                    <p className={styles.projectDescription}>{project.description}</p>
                    {project.hasV2View && (
                      <span className={styles.newBadge}>✨ С деревом файлов</span>
                    )}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
