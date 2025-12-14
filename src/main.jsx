import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import deepLearningFavicon from './assets/img/logo/deep-learning.png'

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
    <App />
  </StrictMode>,
)
