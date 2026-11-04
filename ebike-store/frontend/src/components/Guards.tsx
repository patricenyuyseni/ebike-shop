import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/Auth'
import { PageLoader } from './ui'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return <Outlet />
}

/** UI convenience only. The real protection is on the server: every admin API call checks permissions. */
export function RequireAdmin() {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <PageLoader />
  if (!user || !isAdmin) return <Navigate to="/admin/login" replace />
  return <Outlet />
}
