import React from "react";

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
        <div style={{ padding: "24px", maxWidth: 480 }} role="alert">
          <p style={{ margin: "0 0 12px", color: "#0f172a" }}>{message}</p>
          <button type="button" className="btn primary" onClick={this.handleReload}>
            Reload
          </button>
        </div>
      );
    }

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#f8fafc",
        }}
        role="alert"
      >
        <div
          style={{
            maxWidth: 440,
            width: "100%",
            background: "#fff",
            borderRadius: 12,
            padding: "28px 24px",
            boxShadow: "0 8px 30px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 20, color: "#0f172a" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 20px", color: "#64748b", lineHeight: 1.5 }}>{message}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn primary" onClick={this.handleReload}>
              Reload page
            </button>
            <button type="button" className="btn secondary" onClick={this.handleHome}>
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
