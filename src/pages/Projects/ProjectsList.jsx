import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeAPI, projectsAPI } from '../../services/api';
import { useI18n } from '../../context/I18nContext';
import styles from './Projects.module.css';
import trashBinIcon from '../../assets/img/trash-bin.png';

export default function ProjectsList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

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
      setError(t('projects.list.error.load', 'Не удалось загрузить проекты'));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    if (!menuOpenId) return;

    const handleClickOutside = () => setMenuOpenId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpenId]);

  const handleCreateProject = () => {
    navigate('/projects/new');
  };

  const handleDeleteProject = async (projectId) => {
    if (!projectId || deletingId) return;

    const confirmDelete = window.confirm(
      t('projects.list.confirmDelete', 'Удалить проект? Это действие нельзя отменить.')
    );
    if (!confirmDelete) return;

    try {
      setDeletingId(projectId);
      setError('');
      await projectsAPI.delete(projectId);
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
    } catch (err) {
      console.error('Ошибка при удалении проекта:', err);
      const status = err.response?.status;
      const backendMessage = err.response?.data?.message || err.response?.data?.detail;

      if (status === 404) {
        setError(t('projects.list.error.notFound', 'Проект не найден или нет прав доступа.'));
      } else if (status === 401) {
        setError(t('projects.list.error.invalidToken', 'Неверный токен.'));
      } else {
        setError(backendMessage || t('projects.list.error.deleteFailed', 'Не удалось удалить проект. Попробуйте еще раз.'));
      }
    } finally {
      setDeletingId(null);
    }
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
          {t('projects.list.loading', 'Загрузка проектов...')}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.createBtn} onClick={handleCreateProject}>
          <span className={styles.plusIcon}>+</span>
          {t('projects.list.create', 'Создать')}
        </button>

        <div className={styles.centerTitle}>
          <h1>{t('projects.list.title', 'Проекты')}</h1>
        </div>

        <div className={styles.userMenu}>
          <button className={styles.userBtn}>
            <div className={styles.avatar}>
              {userName?.[0]?.toUpperCase() || user?.login?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || t('projects.list.userPlaceholderLetter', 'П')}
            </div>
            <span className={styles.userName}>
              {userName || user?.login || user?.name || t('projects.list.userPlaceholderName', 'Пользователь')}
            </span>
            <span className={styles.chevron}>▼</span>
          </button>
          
          <div className={styles.dropdown}>
            <button onClick={() => navigate('/settings')}>{t('projects.list.settings', 'Настройки')}</button>
            <button onClick={handleLogout}>{t('projects.list.logout', 'Выйти')}</button>
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
            <h2 style={{ marginBottom: '10px', color: '#1a1a1a' }}>{t('projects.list.emptyTitle', 'Проекты не найдены')}</h2>
            <p style={{ margin: 0 }}>{t('projects.list.emptySubtitle', 'Создайте новый проект, чтобы начать.')}</p>
          </div>
        ) : (
          <div className={styles.projectsGrid}>
            {projects.map((project) => {
              return (
                <div 
                  key={project.id} 
                  className={styles.projectCard}
                  style={menuOpenId === project.id ? { zIndex: 30 } : undefined}
                >
                  {/* Preview temporarily disabled */}
                  {false && (
                    <div className={styles.projectImage}>
                      {project.picture_url ? (
                        <img src={project.picture_url} alt={project.name} />
                      ) : (
                        <div className={styles.projectImagePlaceholder} aria-hidden="true" />
                      )}
                    </div>
                  )}
                  <div className={styles.projectInfo}>
                    <h2 className={styles.projectName}>{project.name}</h2>
                    <p className={styles.projectDescription}>{project.description}</p>
                  </div>
                  {/* Actions */}
                  <div className={styles.projectActions}>
                    <Link 
                        to={`/projects/${project.id}/architecture`} 
                        className={`${styles.actionBtnPrimary} ${styles.previewButton}`} 
                      >
                      <span className={styles.actionBtnLabel}>{t('projects.list.view', 'Просмотр')}</span>
                      </Link>
                      <div 
                      className={styles.moreMenuWrapper}
                      onClick={(e) => e.stopPropagation()}
                      >
                      <button
                        type="button"
                        className={styles.moreBtn}
                        aria-haspopup="menu"
                        aria-expanded={menuOpenId === project.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === project.id ? null : project.id);
                        }}
                      >
                        ⋯
                      </button>
                      {menuOpenId === project.id && (
                        <div className={styles.moreMenu} role="menu">
                          <button
                            type="button"
                            className={styles.moreMenuItem}
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(null);
                            handleDeleteProject(project.id);
                          }}
                          disabled={deletingId === project.id}
                        >
                          <img
                            src={trashBinIcon}
                            alt=""
                            aria-hidden="true"
                            className={styles.trashIcon}
                          />
                          <span className={styles.moreMenuLabel}>
                              {deletingId === project.id ? t('projects.list.deleting', 'Удаление...') : t('projects.list.delete', 'Удалить')}
                            </span>
                          </button>
                        </div>
                      )}
                      </div>
                    </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

