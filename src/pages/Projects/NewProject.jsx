import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI } from '../../services/api';
import styles from './Projects.module.css';

export default function NewProject() {
  const [form, setForm] = useState({
    name: '',
    description: '',
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
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

    try {
      // Отправка на backend
      const payload = { ...form };
      if (file) payload.file = file;
      const result = await projectsAPI.create(payload);
      console.log('Проект создан:', result);
      
      // После успешного создания перейти к просмотру архитектуры проекта
      if (result.id) {
        navigate(`/projects/${result.id}/architecture`);
      } else {
        navigate('/projects');
      }
    } catch (err) {
      console.error('Ошибка создания проекта:', err);
      
      // Обработка ошибок
      let errorMessage = 'Ошибка создания проекта';
      
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === 'string') {
          // Проверка на известную ошибку бекенда
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
    } finally {
      setLoading(false);
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
            <label htmlFor="file">Архитектура / файл</label>
            <input
              id="file"
              name="file"
              type="file"
              onChange={handleFileChange}
              disabled={loading}
              accept="application/json,application/zip,application/octet-stream"
            />
            <small>Можно загрузить JSON с архитектурой или файл (опционально)</small>
          </div>

          {/* Ошибка */}
          {error && (
            <div className={styles.error}>
              {error}
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
    </div>
  );
}
