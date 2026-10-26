import { Component, type ReactNode } from 'react';

/** If one page crashes, show a message with a way out instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('Page crashed:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="empty">
        <b>Something went wrong on this page.</b>
        <p>Your work is safe. Try again, or open another page from the menu.</p>
        <button className="btn" onClick={() => window.location.reload()}>Reload the page</button>
      </div>
    );
  }
}
