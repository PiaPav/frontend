import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Projects.module.css';

export default function NewProject() {
  const [form, setForm] = useState({
    name: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    //тут подключить создание проекта


    setTimeout(() => {
      navigate('/projects');
    }, 500);
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
              required
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
            />
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => navigate('/projects')}
            >
              Отмена
            </button>
            <button type="submit" className={styles.createProjectBtn} disabled={loading}>
              {loading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
