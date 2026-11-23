import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startPwa } from './lib/pwa'
import './index.css'
import App from './App.tsx'

// PWA: offline app shell, phone notifications, and a prompt when a new version is ready
startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
