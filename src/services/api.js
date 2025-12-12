import axios from 'axios';

//запросы через Vite proxy
const API_BASE_URL = import.meta.env.VITE_API_URL || '/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

//для добавления токена к запросам
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

//обработка ошибок и обновление токена
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

//апи для авторизации
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/registration', userData);
    return response.data;
  },

  refresh: async (refreshToken) => {
    const response = await api.post('/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  },
};

//для будущего
export const projectsAPI = {
  getAll: async () => {
    const response = await api.get('/project');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/project/${id}`);
    return response.data;
  },

  create: async (projectData) => {
    // Проверяем что файл обязательно выбран
    if (!projectData.file) {
      throw new Error('Необходимо выбрать ZIP-файл проекта для загрузки');
    }

    // Создаём FormData для отправки файла
    const formData = new FormData();
    formData.append('file', projectData.file);

    // name и description отправляются как query параметры согласно API спецификации
    // ВАЖНО: Удаляем Content-Type из headers чтобы браузер сам добавил boundary
    const response = await api.post('/project', formData, {
      headers: {
        'Content-Type': undefined, // ✅ Удаляем глобальный application/json
      },
      params: {
        name: projectData.name,
        description: projectData.description,
      },
    });

    return response.data;
  },

  update: async (id, projectData) => {
    const response = await api.patch(`/project/${id}`, projectData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/project/${id}`);
    return response.data;
  },
};

// API для домашней страницы
export const homeAPI = {
  getHomepage: async () => {
    const response = await api.get('/home');
    return response.data;
  },
};

// API для работы с аккаунтом
export const accountAPI = {
  // Получить данные аккаунта
  getAccount: async () => {
    const response = await api.get('/account');
    return response.data;
  },

  updateAccount: async (payload) => {
    const response = await api.patch('/account', payload);
    return response.data;
  },

  deleteAccount: async () => {
    const response = await api.delete('/account');
    return response.data;
  },

  // Привязать email
  linkEmail: async (email) => {
    const response = await api.post('/account/email', null, {
      params: { email }
    });
    return response.data;
  },

  // Отвязать email
  unlinkEmail: async () => {
    const response = await api.delete('/account/email');
    return response.data;
  },

  // Верифицировать email
  verifyEmail: async (email, verifyType, verificationCode) => {
    const response = await api.post('/account/verification_email', null, {
      params: {
        email,
        verify_type: verifyType, // 'LINK' или 'UNLINK'
        verification_code: verificationCode
      }
    });
    return response.data;
  },
};

export default api;
