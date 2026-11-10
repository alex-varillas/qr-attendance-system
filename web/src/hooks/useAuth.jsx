import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, setUnauthorizedHandler } from '../lib/api'
import { setAppLocale, setAppTimezone } from '../utils/dates'

const AuthContext = createContext(null)

/**
 * Who is using the app. There is exactly one business per installation, so there is no "which company"
 * to resolve: the state is only whether the system is set up and whether someone is signed in.
 *
 * status: 'loading' | 'needs_setup' | 'signed_out' | 'signed_in' | 'error'
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState({ status: 'loading', me: null, error: null })

  const applyMe = useCallback((me) => {
    setAppTimezone(me.business?.timezone)
    setAppLocale(me.business?.locale)
    setState({ status: 'signed_in', me, error: null })
  }, [])

  const load = useCallback(async () => {
    try {
      const setup = await api.get('/setup/status')
      if (setup.needs_setup) {
        setAppLocale(navigator.language?.startsWith('es') ? 'es' : 'en')
        setState({ status: 'needs_setup', me: null, error: null })
        return
      }
      setAppLocale(setup.locale)
      try {
        applyMe(await api.get('/auth/me'))
      } catch (error) {
        if (error.status !== 401) throw error
        setState({ status: 'signed_out', me: null, error: null })
      }
    } catch (error) {
      setState({ status: 'error', me: null, error })
    }
  }, [applyMe])

  useEffect(() => {
    // Loading the session on mount is this effect's job; `load` only sets state after a network call.
    load()
  }, [load])

  // The server ends a session (expired, signed out elsewhere, account deactivated): go back to sign in.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear()
      setState((current) => (current.status === 'signed_in' ? { status: 'signed_out', me: null, error: null } : current))
    })
    return () => setUnauthorizedHandler(null)
  }, [queryClient])

  const signIn = useCallback(async ({ email, password }) => {
    applyMe(await api.post('/auth/login', { email, password }))
  }, [applyMe])

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      queryClient.clear()
      setState({ status: 'signed_out', me: null, error: null })
    }
  }, [queryClient])

  /** First run: creates the owner and the business, and signs the owner in. */
  const completeSetup = useCallback(async (input) => {
    applyMe(await api.post('/setup', input))
  }, [applyMe])

  /** Accepts an invitation: creates the account of a new administrator and signs them in. */
  const acceptInvite = useCallback(async ({ token, password }) => {
    applyMe(await api.post('/auth/accept-invite', { token, password }))
  }, [applyMe])

  /** Reloads the business settings and the account (after the owner edits them). */
  const refreshBusiness = useCallback(async () => {
    applyMe(await api.get('/auth/me'))
  }, [applyMe])

  const value = useMemo(() => {
    const me = state.me
    const role = me?.employee?.role ?? null
    const permissions = me?.employee?.permissions ?? {}
    const isOwner = role === 'owner'
    return {
      status: state.status,
      error: state.error,
      loading: state.status === 'loading',
      needsSetup: state.status === 'needs_setup',
      user: me?.user ?? null,
      employee: me?.employee ?? null,
      business: me?.business ?? null,
      userRole: role,
      isOwner,
      // Only the owner and the administrators have accounts, so anyone signed in is one of them.
      isAdmin: role === 'admin' || isOwner,
      permissions,
      // The owner has every permission; an administrator has the ones the owner granted.
      hasPermission: (permission) => isOwner || permissions[permission] === true,
      reload: load,
      signIn,
      signOut,
      completeSetup,
      acceptInvite,
      refreshBusiness,
    }
  }, [state, load, signIn, signOut, completeSetup, acceptInvite, refreshBusiness])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return context
}
