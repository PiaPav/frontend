import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Auth.module.css';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    surname: '',
    login: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Валидация
    if (!form.name || !form.surname || !form.login || !form.password || !form.confirmPassword) {
      setError('Заполните все поля');
      setLoading(false);
      return;
    }

    if (form.password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      setLoading(false);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Пароли не совпадают');
      setLoading(false);
      return;
    }

    const result = await register({
      name: form.name,
      surname: form.surname,
      login: form.login,
      password: form.password,
    });

    if (result.success) {
      navigate('/projects');
    } else {
      setError(result.error);
    }

    setLoading(false);
  }

  return (
    <section className={styles.container}>
      <div className={styles.formWrapper}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h1 className={styles.title}>Регистрация</h1>

          <div className={styles.inputGroup}>
            <label htmlFor="name">Имя</label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              className={styles.input}
              placeholder="Введите имя"
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="surname">Фамилия</label>
            <input
              id="surname"
              name="surname"
              type="text"
              value={form.surname}
              onChange={handleChange}
              className={styles.input}
              placeholder="Введите фамилию"
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="login">Логин</label>
            <input
              id="login"
              name="login"
              type="text"
              value={form.login}
              onChange={handleChange}
              className={styles.input}
              placeholder="Введите логин"
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className={styles.input}
              placeholder="Минимум 8 символов"
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="confirmPassword">Подтвердите пароль</label>
            <input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              className={styles.input}
              placeholder="Повторите пароль"
              disabled={loading}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>

          <p className={styles.switch}>
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
