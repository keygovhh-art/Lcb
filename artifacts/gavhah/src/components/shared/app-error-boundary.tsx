import * as React from "react";
import { reportSystemError } from "@/lib/system-error-reporter";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("Gavhah UI crash recovered by AppErrorBoundary", error);
    void reportSystemError({
      type: "react_crash",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      componentStack: info.componentStack || undefined,
    });
  }

  private reload = () => {
    window.location.reload();
  };

  private goHome = () => {
    const isYi = window.location.pathname === "/yi" || window.location.pathname.startsWith("/yi/");
    window.location.href = isYi ? "/yi" : "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isYi = typeof window !== "undefined" &&
      (window.location.pathname === "/yi" || window.location.pathname.startsWith("/yi/"));

    return (
      <div
        className="min-h-screen bg-background text-foreground flex items-center justify-center p-5"
        dir={isYi ? "rtl" : "ltr"}
      >
        <div className="w-full max-w-lg rounded-2xl border bg-card shadow-xl p-6 sm:p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-2xl font-bold text-primary">
            {isYi ? "עס איז געשען א טעכנישע פראבלעם" : "Something went wrong"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-6">
            {isYi
              ? "דער סייט איז נישט פארשוואונדן. דער פראבלעם איז אויטאמאטיש באריכטעט געווארן צום טיעם. דרוק רילאוד צו צוריקקומען."
              : "The site did not disappear. This problem was automatically reported to the team. Reload the page to recover."}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-lg bg-primary text-primary-foreground px-5 py-3 font-semibold"
            >
              {isYi ? "↻ רילאוד" : "↻ Reload"}
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="rounded-lg border px-5 py-3 font-semibold hover:bg-muted"
            >
              {isYi ? "צוריק צום הויפט בלאט" : "Back to Home"}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
