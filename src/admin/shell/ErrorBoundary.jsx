import { Component } from 'react'
import { Button } from '../../ui/index.jsx'

// Keeps a crashing page (or a failed lazy import) from taking the shell and
// the unsaved draft down with it.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="adm-crash">
        <div className="adm-crash__title">This page failed to load</div>
        <div className="adm-crash__msg">{String(this.state.error.message || this.state.error)}</div>
        <Button onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    )
  }
}
