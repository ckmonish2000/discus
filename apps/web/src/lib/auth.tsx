import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { authApi, type User } from './api'

type AuthState = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  /**
   * A 401 here is the normal signed-out state, not an error worth retrying —
   * retrying it would delay the login screen by seconds on every cold load.
   */
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return (await authApi.me()).user
      } catch {
        return null
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const invalidate = () => queryClient.invalidateQueries()

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (r) => {
      queryClient.setQueryData(['auth', 'me'], r.user)
      invalidate()
    },
  })

  const signupMutation = useMutation({
    mutationFn: (v: { email: string; password: string; name?: string }) =>
      authApi.signup(v.email, v.password, v.name),
    onSuccess: (r) => {
      queryClient.setQueryData(['auth', 'me'], r.user)
      invalidate()
    },
  })

  const value: AuthState = {
    user: data ?? null,
    isLoading,
    login: async (email, password) => {
      await loginMutation.mutateAsync({ email, password })
    },
    signup: async (email, password, name) => {
      await signupMutation.mutateAsync({ email, password, name })
    },
    logout: async () => {
      await authApi.logout()
      queryClient.setQueryData(['auth', 'me'], null)
      queryClient.clear()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
