import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { accountAPI } from '../../services/api';
import styles from './Settings.module.css';

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Email management
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLinkingEmail, setIsLinkingEmail] = useState(false);
  const [isUnlinkingEmail, setIsUnlinkingEmail] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verifyType, setVerifyType] = useState('LINK'); // 'LINK' или 'UNLINK'
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    loadAccountData();
  }, []);

  async function loadAccountData() {
    try {
      setLoading(true);
      setError('');
      const data = await accountAPI.getAccount();
      setAccountData(data);
    } catch (err) {
      console.error('Ошибка загрузки данных аккаунта:', err);
      setError(err.response?.data?.message || 'Не удалось загрузить данные аккаунта');
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkEmail(e) {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Введите email');
      return;
    }

    try {
      setIsLinkingEmail(true);
      setError('');
      setSuccessMessage('');
      
      await accountAPI.linkEmail(email);
      
      setShowVerification(true);
      setVerifyType('LINK');
      setSuccessMessage('Код подтверждения отправлен на ' + email);
    } catch (err) {
      console.error('Ошибка привязки email:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'EMAIL_ALREADY_LINKED') {
        setError('Email уже привязан к другому аккаунту');
      } else if (errorData?.type === 'EMAIL_ALREADY_EXISTS') {
        setError('Email уже занят');
      } else if (errorData?.type === 'EMAIL_SEND_CRASH') {
        setError('Ошибка отправки письма. Попробуйте позже');
      } else {
        setError(errorData?.message || 'Ошибка привязки email');
      }
    } finally {
      setIsLinkingEmail(false);
    }
  }

  async function handleUnlinkEmail() {
    if (!window.confirm('Вы уверены, что хотите отвязать email?')) {
      return;
    }

    try {
      setIsUnlinkingEmail(true);
      setError('');
      setSuccessMessage('');
      
      await accountAPI.unlinkEmail();
      
      setShowVerification(true);
      setVerifyType('UNLINK');
      setSuccessMessage('Код подтверждения отправлен на ваш email');
    } catch (err) {
      console.error('Ошибка отвязки email:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'EMAIL_DONT_LINKED') {
        setError('Email не привязан к аккаунту');
      } else if (errorData?.type === 'EMAIL_SEND_CRASH') {
        setError('Ошибка отправки письма. Попробуйте позже');
      } else {
        setError(errorData?.message || 'Ошибка отвязки email');
      }
    } finally {
      setIsUnlinkingEmail(false);
    }
  }

  async function handleVerifyEmail(e) {
    e.preventDefault();
    
    if (!verificationCode.trim()) {
      setError('Введите код подтверждения');
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      
      const emailToVerify = verifyType === 'LINK' ? email : accountData?.email;
      
      await accountAPI.verifyEmail(emailToVerify, verifyType, parseInt(verificationCode));
      
      setSuccessMessage(
        verifyType === 'LINK' 
          ? 'Email успешно привязан!' 
          : 'Email успешно отвязан!'
      );
      
      setShowVerification(false);
      setEmail('');
      setVerificationCode('');
      
      // Перезагружаем данные аккаунта
      await loadAccountData();
    } catch (err) {
      console.error('Ошибка верификации:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'INVALID_VERIFICATION_CODE') {
        setError('Неверный код подтверждения');
      } else {
        setError(errorData?.message || 'Ошибка верификации');
      }
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/projects')}>
          ← Назад
        </button>
        <h1>Настройки</h1>
      </header>

      <main className={styles.main}>
        <div className={styles.section}>
          <h2>Информация о пользователе</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.label}>Логин:</span>
              <span className={styles.value}>{accountData?.login || user?.login || '—'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Имя:</span>
              <span className={styles.value}>{accountData?.name || user?.name || '—'}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2>Email</h2>
          
          {error && <div className={styles.error}>{error}</div>}
          {successMessage && <div className={styles.success}>{successMessage}</div>}

          {accountData?.email ? (
            <div className={styles.emailSection}>
              <div className={styles.currentEmail}>
                <span className={styles.label}>Текущий email:</span>
                <span className={styles.value}>{accountData.email}</span>
                {accountData.verify_email && (
                  <span className={styles.verified}>✓ Подтвержден</span>
                )}
              </div>
              
              {!showVerification && (
                <button 
                  className={styles.btnDanger}
                  onClick={handleUnlinkEmail}
                  disabled={isUnlinkingEmail}
                >
                  {isUnlinkingEmail ? 'Отправка кода...' : 'Отвязать email'}
                </button>
              )}
            </div>
          ) : (
            !showVerification && (
              <form onSubmit={handleLinkEmail} className={styles.emailForm}>
                <input
                  type="email"
                  placeholder="Введите email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                  required
                />
                <button 
                  type="submit" 
                  className={styles.btnPrimary}
                  disabled={isLinkingEmail}
                >
                  {isLinkingEmail ? 'Отправка кода...' : 'Привязать email'}
                </button>
              </form>
            )
          )}

          {showVerification && (
            <form onSubmit={handleVerifyEmail} className={styles.verificationForm}>
              <p className={styles.verificationText}>
                Введите код подтверждения из письма:
              </p>
              <input
                type="text"
                placeholder="Код подтверждения"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className={styles.input}
                required
              />
              <div className={styles.btnGroup}>
                <button type="submit" className={styles.btnPrimary}>
                  Подтвердить
                </button>
                <button 
                  type="button" 
                  className={styles.btnSecondary}
                  onClick={() => {
                    setShowVerification(false);
                    setVerificationCode('');
                    setError('');
                    setSuccessMessage('');
                  }}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
