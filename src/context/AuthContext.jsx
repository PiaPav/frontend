import { createContext, useState, useContext, useEffect } from 'react';
import { authAPI, accountAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
      
      // Получаем полные данные пользователя с сервера
      try {
        const accountData = await accountAPI.getAccount();
        const userData = {
          id: accountData.id,
          login: accountData.login,
          name: accountData.name,
          email: accountData.email
        };
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      } catch (accountError) {
        console.error('Error fetching account data:', accountError);
        // Fallback: сохраняем хотя бы логин
        const userData = { login: credentials.login };
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        return {
          success: false,
          error: 'Ошибка подключения к серверу. Проверьте настройки CORS на бэкенде.',
        };
      }
      
      const detail = error.response?.data?.detail;
      let errorMessage = backendMessage || '?????? ???????????.';
      
      if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail.map(err => err.msg).join(', ');
      }
      if (!backendMessage && backendType) {
        errorMessage = `${backendType}${errorMessage ? ': ' + errorMessage : ''}`;
      }
      if (backendMessage) {
        errorMessage = backendMessage;
      }
      if (status === 409 && backendMessage) {
        errorMessage = backendMessage;
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
          error: 'Ошибка сети. Проверьте подключение к серверу.',
        };
      }
      
      if (error.message === 'Network Error') {
        return {
          success: false,
          error: 'CORS ошибка. Настройте CORS на бэкенде.',
        };
      }
      
      // Обработка ответа от сервера
      const detail = error.response?.data?.detail;
      let errorMessage = backendMessage || '?????? ???????????.';
      
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
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
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



