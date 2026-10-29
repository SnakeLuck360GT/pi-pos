import { useState } from 'react'
import { Button, Input, Spinner } from '../../ui/index.jsx'
import { login } from '../../lib/api.js'

export default function Login({ notice, onDone }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await login(password, 'admin')
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="adm-login">
      <form className="adm-login__box" onSubmit={submit}>
        <div className="adm-login__name">PiPOS</div>
        <Input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Admin password" aria-label="Admin password"
          autoComplete="current-password" autoFocus
        />
        {error && <div className="adm-login__error" role="alert">{error}</div>}
        <Button type="submit" variant="primary" disabled={!password || busy}>
          {busy ? <Spinner /> : 'Sign in'}
        </Button>
        <p className="adm-login__note">{notice || 'Use the password you set when you deployed.'}</p>
      </form>
    </div>
  )
}
