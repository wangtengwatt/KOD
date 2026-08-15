import React from 'react'
import ReactDOM from 'react-dom/client'
import { SuanbaoWindowApp } from './SuanbaoWindowApp'
import { SuanbaoWindowErrorBoundary } from './SuanbaoWindowErrorBoundary'
import './suanbao-window.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SuanbaoWindowErrorBoundary>
      <SuanbaoWindowApp />
    </SuanbaoWindowErrorBoundary>
  </React.StrictMode>
)
