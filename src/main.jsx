import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import deepLearningFavicon from './assets/img/logo/deep-learning.png'
import { I18nProvider } from './context/I18nContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

const faviconElement =
  document.querySelector("link[rel~='icon']") || document.createElement('link')
faviconElement.rel = 'icon'
faviconElement.type = 'image/png'
faviconElement.href = deepLearningFavicon
if (!faviconElement.parentNode) {
  document.head.appendChild(faviconElement)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
