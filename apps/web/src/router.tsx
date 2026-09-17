import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
} from '@tanstack/react-router'
import { AuthProvider, useAuth } from '@/lib/auth'
import { Shell } from '@/components/layout/shell'
import { LoginPage } from '@/pages/login'
import { DashboardPage } from '@/pages/dashboard'
import { InvoicesPage } from '@/pages/invoices'
import { InvoiceDetailPage } from '@/pages/invoice-detail'
import { DocumentsPage } from '@/pages/documents'
import { VendorsPage } from '@/pages/vendors'
import { FormatsPage } from '@/pages/formats'
import { ApiKeysPage } from '@/pages/api-keys'

/**
 * One gate for the whole tree rather than a per-route beforeLoad: the session
 * is an httpOnly cookie, so the client cannot read it synchronously and every
 * route would have to await the same /auth/me call anyway.
 */
function Gate() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
          Loading
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}

const rootRoute = createRootRoute({
  component: () => (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  ),
})

const route = (path: string, component: () => React.JSX.Element) =>
  createRoute({ getParentRoute: () => rootRoute, path, component })

const routeTree = rootRoute.addChildren([
  route('/', DashboardPage),
  route('/invoices', InvoicesPage),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/invoices/$invoiceId',
    component: InvoiceDetailPage,
  }),
  route('/documents', DocumentsPage),
  route('/vendors', VendorsPage),
  route('/formats', FormatsPage),
  route('/api-keys', ApiKeysPage),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
