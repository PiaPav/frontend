import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import styles from './Auth.module.css';

export default function Login() {
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

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
      setError(t('auth.login.error.missing', 'Заполните все поля'));
      setLoading(false);
      return;
    }

    try {
      const result = await login(form);

      if (result?.success) {
        navigate('/projects');
      } else {
        setError(result?.error || t('auth.login.error.failed', 'Не удалось авторизоваться.'));
      }
    } catch (submitError) {
      console.error('Submit login error:', submitError);
      setError(t('auth.login.error.failed', 'Не удалось авторизоваться. Попробуйте ещё раз.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.container}>
      <div className={styles.formWrapper}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h1 className={styles.title}>{t('auth.login.title', 'Вход')}</h1>
          
          <div className={styles.inputGroup}>
            <label htmlFor="login">{t('auth.login.loginLabel', 'Логин')}</label>
            <input
              id="login"
              name="login"
              type="text"
              value={form.login}
              onChange={handleChange}
              className={styles.input}
              placeholder={t('auth.login.loginPlaceholder', 'Введите логин')}
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">{t('auth.login.passwordLabel', 'Пароль')}</label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder={t('auth.login.passwordPlaceholder', 'Введите пароль')}
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
                aria-label={showPassword ? t('auth.login.hidePassword', 'Скрыть пароль') : t('auth.login.showPassword', 'Показать пароль')}
              >
                {showPassword ? t('auth.login.hidePassword', 'Скрыть') : t('auth.login.showPassword', 'Показать')}
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? t('auth.login.submitting', 'Вход...') : t('auth.login.submit', 'Войти')}
          </button>

          <p className={styles.switch}>
            {t('auth.login.noAccount', 'Нет аккаунта?')}{' '}
            <Link to="/register">{t('auth.login.create', 'Создать')}</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
