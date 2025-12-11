import { useState, useEffect, useMemo } from 'react';
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

  const projectPreviews = useMemo(() => {
    const map = {};

    projects.forEach((project) => {
      const nodesCount = 5 + Math.floor(Math.random() * 4);
      const hue = 215 + Math.random() * 80;

      const nodes = Array.from({ length: nodesCount }, (_, idx) => ({
        id: idx,
        x: 12 + Math.random() * 76,
        y: 14 + Math.random() * 68,
        size: 4 + Math.random() * 5,
        opacity: 0.45 + Math.random() * 0.4,
        delay: idx * 0.12,
      }));

      const connections = Array.from({ length: nodesCount - 1 }, () => {
        const from = Math.floor(Math.random() * nodesCount);
        let to = Math.floor(Math.random() * nodesCount);

        if (to === from) {
          to = (to + 1) % nodesCount;
        }

        return { from, to, dash: 10 + Math.random() * 24 };
      });

      map[project.id] = {
        nodes,
        connections,
        hue,
        accent: `hsla(${hue}, 82%, 62%, 1)`,
        accentSoft: `hsla(${hue + 16}, 86%, 72%, 0.6)`,
      };
    });

    return map;
  }, [projects]);

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
            {projects.map((project) => {
              const preview = projectPreviews[project.id] || {};
              const accent = preview.accent || 'rgba(102, 126, 234, 0.9)';
              const accentSoft = preview.accentSoft || 'rgba(118, 75, 162, 0.7)';

              return (
                <div 
                  key={project.id} 
                  className={styles.projectCard}
                >
                  <div className={styles.projectImage}>
                    {project.picture_url ? (
                      <img src={project.picture_url} alt={project.name} />
                    ) : (
                      <div className={styles.projectPreview}>
                        <div 
                          className={styles.previewBackdrop} 
                          style={{ 
                            background: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18), transparent 26%), radial-gradient(circle at 80% 10%, rgba(255,255,255,0.12), transparent 22%), radial-gradient(circle at 50% 80%, rgba(255,255,255,0.08), transparent 28%), linear-gradient(135deg, rgba(102, 126, 234, 0.45), rgba(118, 75, 162, 0.5))`
                          }}
                        />

                        <svg
                          className={styles.previewCanvas}
                          viewBox="0 0 100 100"
                          role="presentation"
                          aria-hidden="true"
                          preserveAspectRatio="none"
                        >
                          <defs>
                            <linearGradient id={`link-${project.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
                              <stop offset="100%" stopColor={accentSoft} stopOpacity="0.7" />
                            </linearGradient>
                            <radialGradient id={`node-${project.id}`} cx="50%" cy="50%" r="50%">
                              <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
                              <stop offset="100%" stopColor={accent} stopOpacity="0.4" />
                            </radialGradient>
                          </defs>

                          {preview.connections?.map((connection, idx) => {
                            const from = preview.nodes?.[connection.from];
                            const to = preview.nodes?.[connection.to];

                            if (!from || !to) return null;

                            return (
                              <line
                                key={`${project.id}-line-${idx}`}
                                x1={from.x}
                                y1={from.y}
                                x2={to.x}
                                y2={to.y}
                                stroke={`url(#link-${project.id})`}
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeDasharray={`${connection.dash} ${connection.dash}`}
                                className={styles.previewLink}
                                style={{ animationDelay: `${idx * 0.18}s` }}
                              />
                            );
                          })}

                          {preview.nodes?.map((node) => (
                            <circle
                              key={`${project.id}-node-${node.id}`}
                              cx={node.x}
                              cy={node.y}
                              r={node.size}
                              fill={`url(#node-${project.id})`}
                              opacity={node.opacity}
                              className={styles.previewNode}
                              style={{ animationDelay: `${node.delay}s` }}
                            />
                          ))}
                        </svg>

                        <div className={styles.previewBadge}>
                          живой скетч
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={styles.projectInfo}>
                    <h2 className={styles.projectName}>{project.name}</h2>
                    <p className={styles.projectDescription}>{project.description}</p>
                  </div>
                  <div className={styles.projectActions}>
                    <Link 
                      to={`/projects/${project.id}/architecture`} 
                      className={`${styles.actionBtnPrimary} ${styles.previewButton}`} 
                      style={{ width: '100%' }}
                    >
                      <span className={styles.actionBtnIcon} aria-hidden="true">✨</span>
                      <span className={styles.actionBtnLabel}>Просмотр</span>
                      <span className={styles.actionBtnRipple} aria-hidden="true" />
                    </Link>
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
