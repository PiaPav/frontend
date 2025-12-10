import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeAPI } from '../../services/api';
import styles from './Projects.module.css';

export default function ProjectsList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Загрузка проектов при монтировании компонента
  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const response = await homeAPI.getHomepage();
      
      // response = { user: { id, name, surname }, projects: { total, data: [...] } }
      if (response.user) {
        setUserName(response.user.login || '');
      }
      
      const projectsList = response.projects?.data || [];
      setProjects(projectsList);
      setError('');
    } catch (err) {
      console.error('Ошибка загрузки проектов:', err);
      setError('Не удалось загрузить проекты');
      setProjects([]);
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
              {userName?.[0]?.toUpperCase() || user?.login?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || 'П'}
            </div>
            <span className={styles.userName}>
              {userName || user?.login || user?.name || 'Пользователь'}
            </span>
            <span className={styles.chevron}>▼</span>
          </button>
          
          <div className={styles.dropdown}>
            <button onClick={() => navigate('/settings')}>Настройки</button>
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

        {projects.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '100px 20px',
            background: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '20px',
            color: '#666'
          }}>
            <h2 style={{ marginBottom: '10px', color: '#1a1a1a' }}>Проекты не найдены</h2>
            <p style={{ margin: 0 }}>Создайте новый проект, чтобы начать.</p>
          </div>
        ) : (
          <div className={styles.projectsGrid}>
            {projects.map((project) => (
              <div 
                key={project.id} 
                className={styles.projectCard}
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
                </div>
                <div className={styles.projectActions}>
                  <Link to={`/projects/${project.id}/architecture`} className={styles.actionBtnPrimary} style={{ width: '100%' }}>
                    👁️ Просмотр
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
