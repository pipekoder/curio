import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './discover-preview.css'
import "./visual-stages.css";
import './media-studio.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
