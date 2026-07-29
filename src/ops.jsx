import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { OpsApp } from './ops/OpsApp'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <OpsApp />
  </StrictMode>
)
