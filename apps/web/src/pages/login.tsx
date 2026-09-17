import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export function LoginPage() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await signup(email, password, name || undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded bg-brand font-bold text-white">
            D
          </span>
          <span className="text-lg font-semibold tracking-tight">Discus</span>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <h1 className="text-lg font-semibold">
            {mode === 'login' ? 'Sign in' : 'Create an account'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === 'login'
              ? 'Access your invoice workspace.'
              : 'Your account starts with the standard invoice format.'}
          </p>

          <form onSubmit={submit} className="mt-5 flex flex-col gap-3.5">
            {mode === 'signup' ? (
              <Field
                id="name"
                label="Name"
                value={name}
                onChange={setName}
                autoComplete="name"
              />
            ) : null}

            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />
            <Field
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
            />

            {error ? (
              <p
                role="alert"
                className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={busy} className="mt-1 w-full">
              {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-muted">
            {mode === 'login' ? "Don't have an account?" : 'Already registered?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                setError(null)
              }}
              className="font-medium text-brand hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  ...props
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'id'>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        {...props}
      />
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  )
}
