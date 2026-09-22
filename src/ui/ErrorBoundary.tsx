/**
 * The error boundary.
 *
 * A planning tool that blanks the screen in the middle of an incident is
 * worse than no tool. When a view throws, this keeps the rest of the shell
 * alive, says which view failed, offers the way back, and shows the actual
 * error rather than a shrug — because the person reading it is usually the
 * person who can fix it.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Panel } from './primitives.tsx'

interface Props {
  readonly children: ReactNode
  readonly label: string
  readonly onReset: () => void
}

interface State {
  readonly error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only. There is nowhere else for it to go: the page cannot make
    // a network request, which is the property the whole tool depends on.
    console.error('TOURNIQUET view error', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <Panel className="border-lost/40">
        <div className="px-5 py-8">
          <p className="font-display text-lg font-medium text-ink-0">
            The {this.props.label} view failed to render
          </p>
          <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-ink-2">
            The rest of the tool is unaffected and your plan has not been changed. This is a bug —
            most likely a plan shape the analyser accepted and a view did not expect.
          </p>
          <pre className="scroll-thin mt-4 max-w-full overflow-x-auto rounded border border-line-2 bg-surface-inset px-4 py-3 font-mono text-xs text-lost">
            {error.message}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                this.setState({ error: null })
                this.props.onReset()
              }}
            >
              Reset to the demonstration plan
            </Button>
            <Button variant="quiet" onClick={() => this.setState({ error: null })}>
              Try rendering again
            </Button>
          </div>
        </div>
      </Panel>
    )
  }
}
