import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import './ui/ui.css'

// Two apps share one bundle: the tablet POS at / and the admin panel at /admin.
const PosApp   = lazy(() => import('./pos/PosApp.jsx'))
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      {isAdmin ? <AdminApp /> : <PosApp />}
    </Suspense>
  </StrictMode>,
)
