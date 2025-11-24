import { createRouter, createRootRoute, createRoute, Outlet, Link } from '@tanstack/react-router'
import { HomePage } from './pages/home'
import { StoragePage } from './pages/storage'

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <nav className="container mx-auto flex h-14 items-center gap-6 px-4">
          <Link to="/" className="font-semibold">
            Discus
          </Link>
          <Link
            to="/storage"
            className="text-sm text-muted-foreground hover:text-foreground [&.active]:text-foreground"
          >
            Storage
          </Link>
        </nav>
      </header>
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const storageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/storage',
  component: StoragePage,
})

const routeTree = rootRoute.addChildren([indexRoute, storageRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
