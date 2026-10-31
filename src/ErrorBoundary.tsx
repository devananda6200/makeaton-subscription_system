import { Component, type ReactNode } from "react";
import { Button, Logo } from "./components";

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="boot-screen">
        <Logo />
        <h2>Let’s reconnect your workspace.</h2>
        <p>Something interrupted this screen. Your saved records are safe.</p>
        <Button onClick={() => window.location.reload()}>
          Reload workspace
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
