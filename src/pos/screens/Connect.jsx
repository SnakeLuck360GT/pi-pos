import { useState } from 'react'
import { login } from '../../lib/api.js'

export function ConnectScreen({ config, expired, onConnected }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async e => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await login(password, 'device')
      onConnected()
    } catch (err) {
      setError(err?.status === 401 ? 'Wrong password' : 'Could not reach the server. Check the connection and try again.')
      setBusy(false)
    }
  }

  return (
    <div className="pos-connect">
      <form className="pos-connect__card" onSubmit={submit}>
        {config?.business?.name ? <p className="pos-connect__shop">{config.business.name}</p> : null}
        <h1 className="pos-connect__title">Connect this tablet</h1>
        <p className="pos-connect__text">
          {expired
            ? 'This tablet was signed out. Enter the admin password to connect it again. The current order is kept.'
            : 'Enter the admin password once. The tablet stays connected for a year.'}
        </p>
        <label className="pos-field">
          <span className="pos-field__label">Admin password</span>
          <input
            className="pos-input" type="password" value={password} autoFocus
            autoComplete="current-password" onChange={e => setPassword(e.target.value)}
          />
        </label>
        {error ? <p className="pos-error-text">{error}</p> : null}
        <button type="submit" className="pos-sbtn pos-sbtn--primary pos-sbtn--block" disabled={!password || busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </div>
  )
}
