import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Projects.module.css';

export default function ProjectsList() {
  const [projects, setProjects] = useState([
    {
      id: 1,
      name: 'Чебуречная',
      description: 'Этот проект описывает работоспособность',
      imageUrl: null,
    },
    {
      id: 2,
      name: 'Финансовый трекер',
      description: 'Этот проект описывает работоспособность подсчёта денег',
      imageUrl: null,
    },
  ]);
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCreateProject = () => {
    navigate('/projects/new');
  };

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
              {user?.name?.[0]?.toUpperCase() || 'И'}
            </div>
            <span className={styles.userName}>
              {user?.name || 'Игорь'}
            </span>
            <span className={styles.chevron}>▼</span>
          </button>
          
          <div className={styles.dropdown}>
            <button onClick={handleLogout}>Выйти</button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.projectsGrid}>
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className={styles.projectCard}
            >
              <div className={styles.projectImage}>
                {project.imageUrl ? (
                  <img src={project.imageUrl} alt={project.name} />
                ) : (
                  <div className={styles.projectImagePlaceholder}></div>
                )}
              </div>
              <div className={styles.projectInfo}>
                <h2 className={styles.projectName}>{project.name}</h2>
                <p className={styles.projectDescription}>{project.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
