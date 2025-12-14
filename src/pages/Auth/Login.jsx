import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Auth.module.css';

export default function Login() {
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
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

    //валидация
    if (!form.login || !form.password) {
      setError('Заполните все поля');
      setLoading(false);
      return;
    }

    try {
      const result = await login(form);

      if (result?.success) {
        navigate('/projects');
      } else {
        setError(result?.error || 'Не удалось авторизоваться.');
      }
    } catch (submitError) {
      console.error('Submit login error:', submitError);
      setError('Не удалось авторизоваться. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.container}>
      <div className={styles.formWrapper}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h1 className={styles.title}>Вход</h1>
          
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
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder="Введите пароль"
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>

          <p className={styles.switch}>
            Нет аккаунта? <Link to="/register">Создать</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
