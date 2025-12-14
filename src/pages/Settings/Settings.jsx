import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { accountAPI } from '../../services/api';
import styles from './Settings.module.css';

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [profileForm, setProfileForm] = useState({ name: '', surname: '' });
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLinkingEmail, setIsLinkingEmail] = useState(false);
  const [isUnlinkingEmail, setIsUnlinkingEmail] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verifyType, setVerifyType] = useState('LINK');
  const [successMessage, setSuccessMessage] = useState('');
  const [emailJustLinked, setEmailJustLinked] = useState(false);

  const accountLogin = accountData?.login || user?.login || '';
  const deletePhrase = accountLogin ? `удалить мой аккаунт ${accountLogin}` : '';

  useEffect(() => {
    loadAccountData();
  }, []);

  useEffect(() => {
    if (accountData || user) {
      setProfileForm({
        name: accountData?.name ?? user?.name ?? '',
        surname: accountData?.surname ?? user?.surname ?? '',
      });
    }
  }, [accountData, user]);

  async function loadAccountData() {
    try {
      setLoading(true);
      setError('');
      const data = await accountAPI.getAccount();
      setAccountData(data);
    } catch (err) {
      console.error('Ошибка загрузки данных аккаунта:', err);
      setError(err.response?.data?.message || 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }

  function handleProfileChange(field, value) {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetProfileForm() {
    setProfileForm({
      name: accountData?.name ?? user?.name ?? '',
      surname: accountData?.surname ?? user?.surname ?? '',
    });
    setProfileError('');
    setProfileSuccess('');
  }

  async function handleUpdateProfile(e) {
    e.preventDefault();

    const payload = {
      name: profileForm.name.trim(),
      surname: profileForm.surname.trim(),
    };

    if (!payload.name || !payload.surname) {
      setProfileError('Заполните имя и фамилию');
      return;
    }

    try {
      setIsSavingProfile(true);
      setProfileError('');
      setProfileSuccess('');

      const updated = await accountAPI.updateAccount(payload);
      const updatedLogin = updated.login ?? accountLogin;
      setAccountData((prev) => ({
        ...prev,
        ...updated,
        login: updatedLogin ?? prev?.login ?? accountLogin,
      }));
      setProfileSuccess('Данные профиля обновлены');

      if (updateUser) {
        updateUser({
          id: updated.id,
          login: updatedLogin,
          name: updated.name,
          surname: updated.surname,
          email: updated.email,
        });
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Не удалось обновить профиль';
      setProfileError(message);
    } finally {
      setIsSavingProfile(false);
    }
  }

  function openDeleteModal() {
    setDeleteInput('');
    setDeleteError('');
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    setDeleteInput('');
    setDeleteError('');
    setShowDeleteModal(false);
  }

  async function handleDeleteAccount() {
    if (!deletePhrase || deleteInput.trim() !== deletePhrase) {
      setDeleteError('Введите точную фразу подтверждения');
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError('');
      await accountAPI.deleteAccount();
      logout();
      navigate('/login');
    } catch (err) {
      const message = err.response?.data?.message || 'Не удалось удалить аккаунт';
      setDeleteError(message);
      setIsDeleting(false);
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
      setSuccessMessage(`Код отправлен на ${email}`);
    } catch (err) {
      console.error('Ошибка привязки email:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'EMAIL_ALREADY_LINKED') {
        setError('Email уже привязан к аккаунту');
      } else if (errorData?.type === 'EMAIL_ALREADY_EXISTS') {
        setError('Email уже используется');
      } else if (errorData?.type === 'EMAIL_SEND_CRASH') {
        setError('Не удалось отправить письмо. Попробуйте снова или позже.');
      } else {
        setError(errorData?.message || 'Не удалось привязать email');
      }
    } finally {
      setIsLinkingEmail(false);
    }
  }

  async function handleUnlinkEmail() {
    if (!window.confirm('Точно отвязать email?')) {
      return;
    }

    try {
      setIsUnlinkingEmail(true);
      setError('');
      setSuccessMessage('');
      
      await accountAPI.unlinkEmail();
      
      setShowVerification(true);
      setVerifyType('UNLINK');
      setSuccessMessage('Код отправлен на текущий email');
    } catch (err) {
      console.error('Ошибка отвязки email:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'EMAIL_DONT_LINKED') {
        setError('Email не привязан');
      } else if (errorData?.type === 'EMAIL_SEND_CRASH') {
        setError('Не удалось отправить письмо. Попробуйте снова или позже.');
      } else {
        setError(errorData?.message || 'Не удалось отвязать email');
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
      
      await accountAPI.verifyEmail(emailToVerify, verifyType, parseInt(verificationCode, 10));
      
      setSuccessMessage(
        verifyType === 'LINK' 
          ? 'Email подтвержден!' 
          : 'Отвязка email подтверждена!'
      );
      
      setShowVerification(false);
      setEmail('');
      setVerificationCode('');
      
      if (verifyType === 'LINK') {
        setEmailJustLinked(true);
      }
      
      await loadAccountData();
    } catch (err) {
      console.error('Ошибка подтверждения email:', err);
      const errorData = err.response?.data;
      
      if (errorData?.type === 'INVALID_VERIFICATION_CODE') {
        setError('Неверный код подтверждения');
      } else {
        setError(errorData?.message || 'Не удалось подтвердить email');
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
        <h1>Настройки аккаунта</h1>
      </header>

      <main className={styles.main}>
        <div className={styles.section}>
          <h2>Профиль</h2>
          {profileError && <div className={styles.error}>{profileError}</div>}
          {profileSuccess && <div className={styles.success}>{profileSuccess}</div>}

          <form onSubmit={handleUpdateProfile} className={styles.profileForm}>
            <label className={styles.fieldGroup}>
              <span className={styles.label}>Логин</span>
              <input
                type="text"
                value={accountLogin}
                className={styles.input}
                placeholder="Ваш логин"
                disabled
                readOnly
              />
              <span className={styles.hint}>Логин изменить нельзя</span>
            </label>

            <div className={styles.dualRow}>
              <label className={styles.fieldGroup}>
                <span className={styles.label}>Имя</span>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => handleProfileChange('name', e.target.value)}
                  className={styles.input}
                  placeholder="Ваше имя"
                  required
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.label}>Фамилия</span>
                <input
                  type="text"
                  value={profileForm.surname}
                  onChange={(e) => handleProfileChange('surname', e.target.value)}
                  className={styles.input}
                  placeholder="Ваша фамилия"
                  required
                />
              </label>
            </div>

            <div className={styles.btnGroup}>
              <button 
                type="submit" 
                className={styles.btnPrimary}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
              <button 
                type="button" 
                className={styles.btnSecondary}
                onClick={resetProfileForm}
                disabled={isSavingProfile}
              >
                Сбросить
              </button>
            </div>
          </form>
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
                  <span className={styles.verified}>Почта подтверждена</span>
                )}
              </div>
              
              {!showVerification && !emailJustLinked && (
                <button 
                  className={styles.btnDanger}
                  onClick={handleUnlinkEmail}
                  disabled={isUnlinkingEmail}
                >
                  {isUnlinkingEmail ? 'Отвязываем...' : 'Отвязать email'}
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
                  {isLinkingEmail ? 'Отправляем код...' : 'Привязать email'}
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

        <div className={`${styles.section} ${styles.dangerSection}`}>
          <div className={styles.dangerHeader}>
            <div>
              <h2>Удаление аккаунта</h2>
              <p className={styles.dangerText}>Действие необратимо. Все данные будут удалены.</p>
            </div>
            <button 
              className={styles.btnDanger}
              onClick={openDeleteModal}
              disabled={!accountLogin}
            >
              Удалить аккаунт
            </button>
          </div>
        </div>
      </main>

      {showDeleteModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Подтвердите удаление</h3>
            <p className={styles.modalText}>
              Чтобы удалить аккаунт, введите <span className={styles.modalPhrase}>{deletePhrase || 'удалить мой аккаунт {логин}'}</span>.
            </p>
            {deleteError && <div className={styles.error}>{deleteError}</div>}
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className={styles.input}
              placeholder={deletePhrase || 'удалить мой аккаунт {логин}'}
            />
            <div className={styles.modalActions}>
              <button 
                type="button" 
                className={styles.btnSecondary}
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Отмена
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleDeleteAccount}
                disabled={!deletePhrase || deleteInput.trim() !== deletePhrase || isDeleting}
              >
                {isDeleting ? 'Удаляем...' : 'Удалить аккаунт'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
