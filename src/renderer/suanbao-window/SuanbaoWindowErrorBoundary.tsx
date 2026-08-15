import { Component, type ErrorInfo, type ReactNode } from 'react'
import { defaultSuanbaoWindowCopy } from './copy'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

export class SuanbaoWindowErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The pet window is isolated from the main renderer. Do not reload or terminate KOD here.
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="suanbao-window suanbao-window-fallback" role="alert">
        <section className="suanbao-bubble">
          <p>{defaultSuanbaoWindowCopy.failure}</p>
          <div className="suanbao-bubble-actions">
            <button type="button" onClick={() => void window.suanbaoAPI.openMainWindow()}>
              {defaultSuanbaoWindowCopy.openKod}
            </button>
            <button type="button" onClick={() => void window.suanbaoAPI.hide()}>
              {defaultSuanbaoWindowCopy.hideSuanbao}
            </button>
          </div>
        </section>
      </main>
    )
  }
}
