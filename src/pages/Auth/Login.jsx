import { useState } from 'react';
import styles from './Auth.module.css'

export default function Login() {
    const [form, setForm] = useState({ login: '', password: ''});
    const [error, setError] = useState('');
    
    function handleSubmit(e) {
      const { name, value } = e.target;
    }
    async function handleSubmit(e) {
      e.preventDefault();
    }

    return (
        <section className={styles.container}>
            <form className={styles.form} onSubmit={handleSubmit}>
  <h1>Вход</h1>
  <label>
    Логин
    <input name="login" value={form.login} onChange={handleChange} />
  </label>
  <label>
    Пароль
    <input type="password" name="password" value={form.password} onChange={handleChange} />
  </label>
  {error && <p className={styles.error}>{error}</p>}
  <button type='submit'>Войти</button>
  <p className={styles.switch}>
    Нет аккаунта? <Link to="/auth/register">Создать</Link>
  </p>
</form>
        </section>
    );
}