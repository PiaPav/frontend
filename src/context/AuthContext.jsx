import { createContext, useState, useContext, useEffect } from 'react';
import { authAPI, homeAPI } from '../services/api';
import { useI18n } from './I18nContext';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  const updateUser = (updatedUser) => {
    if (updatedUser) {
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } else {
      localStorage.removeItem('user');
    }
    setUser(updatedUser);
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    try {
      const data = await authAPI.login(credentials);
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      // Получаем полные данные пользователя с домашнего эндпоинта (приходит сразу)
      try {
        const homeData = await homeAPI.getHomepage();
        const accountData = homeData?.user || {};
        const userData = {
          id: accountData.id,
          login: accountData.login,
          name: accountData.name,
          surname: accountData.surname,
          email: accountData.email
        };
        updateUser(userData);
      } catch (homeError) {
        console.error('Error fetching user from home endpoint:', homeError);
        // Fallback: сохраняем хотя бы логин
        const userData = { login: credentials.login };
        updateUser(userData);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      const status = error.response?.status;
      const backendMessage = error.response?.data?.message;
      const backendType = error.response?.data?.type;
      const detail = error.response?.data?.detail;
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        return {
          success: false,
          error: t('auth.error.network', 'Ошибка подключения к серверу. Проверьте настройки CORS на бэкенде.'),
        };
      }
      
      let errorMessage = backendMessage;
      
      if (!errorMessage) {
        if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (Array.isArray(detail)) {
          errorMessage = detail.map(err => err.msg).join(', ');
        }
      }

      if (!errorMessage && backendType) {
        errorMessage = backendType === 'INVALID_LOGIN'
          ? t('auth.error.invalidLogin', 'Неверный логин')
          : backendType === 'INVALID_PASSWORD'
            ? t('auth.error.invalidPassword', 'Неверный пароль')
            : backendType;
      }

      if (status === 401 && backendMessage) {
        errorMessage = backendMessage;
      }

      if (!errorMessage) {
        errorMessage = t('auth.error.loginFailed', 'Не удалось авторизоваться.');
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const register = async (userData) => {
    try {
      const data = await authAPI.register(userData);
      
      const loginResult = await login({
        login: userData.login,
        password: userData.password,
      });
      
      if (loginResult.success) {
        return { success: true, data };
      }
      
      return { success: true, data, needLogin: true };
    } catch (error) {
      console.error('Registration error:', error);
      const status = error.response?.status;
      const backendMessage = error.response?.data?.message;
      const backendType = error.response?.data?.type;
      
      if (error.code === 'ERR_NETWORK') {
        return {
          success: false,
          error: t('auth.error.registerNetwork', 'Ошибка сети. Проверьте подключение к серверу.'),
        };
      }
      
      if (error.message === 'Network Error') {
        return {
          success: false,
          error: t('auth.error.cors', 'CORS ошибка. Настройте CORS на бэкенде.'),
        };
      }
      
      // Обработка ответа от сервера
      const detail = error.response?.data?.detail;
      let errorMessage = backendMessage || t('auth.error.registerFailed', 'Не удалось зарегистрироваться.');
      
      if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail.map(err => err.msg).join(', ');
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    updateUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
