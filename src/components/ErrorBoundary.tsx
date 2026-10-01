import React from "react";
import { Button } from "./ui";

type Props = {
  children: React.ReactNode;
  /** Optional compact fallback for route-level boundaries */
  compact?: boolean;
};

type State = {
  error: Error | null;
};

/**
 * Catches render errors and failed lazy chunks so users never get a blank white screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const message =
      this.state.error.name === "ChunkLoadError" ||
      /Loading chunk|Failed to fetch dynamically imported module/i.test(
        this.state.error.message || ""
      )
        ? "This page failed to load. A refresh usually fixes it after a deploy."
        : "Something went wrong displaying this page.";

    if (this.props.compact) {
      return (
        <div className="error-boundary-compact" role="alert">
          <p>{message}</p>
          <Button onClick={this.handleReload}>Reload</Button>
        </div>
      );
    }

    return (
      <div className="error-boundary-page" role="alert">
        <div className="error-boundary-card">
          <h1>Something went wrong</h1>
          <p>{message}</p>
          <div className="error-boundary-actions">
            <Button onClick={this.handleReload}>Reload page</Button>
            <Button variant="secondary" onClick={this.handleHome}>
              Go home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
