import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register } = useAuth();
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

    // Валидация
    if (!form.name || !form.surname || !form.login || !form.password || !form.confirmPassword) {
      setError(t('auth.register.error.missing', 'Заполните все поля'));
      setLoading(false);
      return;
    }

    if (form.password.length < 8) {
      setError(t('auth.register.error.shortPassword', 'Пароль должен содержать минимум 8 символов'));
      setLoading(false);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(t('auth.register.error.mismatch', 'Пароли не совпадают'));
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
          <h1 className={styles.title}>{t('auth.register.title', 'Регистрация')}</h1>

          <div className={styles.inputGroup}>
            <label htmlFor="name">{t('auth.register.nameLabel', 'Имя')}</label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              className={styles.input}
              placeholder={t('auth.register.namePlaceholder', 'Введите имя')}
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="surname">{t('auth.register.surnameLabel', 'Фамилия')}</label>
            <input
              id="surname"
              name="surname"
              type="text"
              value={form.surname}
              onChange={handleChange}
              className={styles.input}
              placeholder={t('auth.register.surnamePlaceholder', 'Введите фамилию')}
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="login">{t('auth.register.loginLabel', 'Логин')}</label>
            <input
              id="login"
              name="login"
              type="text"
              value={form.login}
              onChange={handleChange}
              className={styles.input}
              placeholder={t('auth.register.loginPlaceholder', 'Введите логин')}
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">{t('auth.register.passwordLabel', 'Пароль')}</label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder={t('auth.register.passwordPlaceholder', 'Минимум 8 символов')}
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
                aria-label={showPassword ? t('auth.register.hidePassword', 'Скрыть пароль') : t('auth.register.showPassword', 'Показать пароль')}
              >
                {showPassword ? t('auth.register.hidePassword', 'Скрыть') : t('auth.register.showPassword', 'Показать')}
              </button>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="confirmPassword">{t('auth.register.confirmLabel', 'Подтвердите пароль')}</label>
            <div className={styles.passwordWrapper}>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder={t('auth.register.confirmPlaceholder', 'Повторите пароль')}
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                disabled={loading}
                aria-label={
                  showConfirmPassword
                    ? t('auth.register.hideConfirm', 'Скрыть подтверждение пароля')
                    : t('auth.register.showConfirm', 'Показать подтверждение пароля')
                }
              >
                {showConfirmPassword ? t('auth.register.hideConfirm', 'Скрыть') : t('auth.register.showConfirm', 'Показать')}
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? t('auth.register.submitting', 'Регистрация...') : t('auth.register.submit', 'Зарегистрироваться')}
          </button>

          <p className={styles.switch}>
            {t('auth.register.haveAccount', 'Уже есть аккаунт?')}{' '}
            <Link to="/login">{t('auth.register.login', 'Войти')}</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
