import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { message: string }
> {
  state = { message: "" };
  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }
  render() {
    if (this.state.message)
      return (
        <main className="empty-state" style={{ height: "100dvh" }}>
          <h2>工作区暂时无法显示</h2>
          <p>{this.state.message}</p>
          <button onClick={() => window.location.reload()}>重新打开</button>
          <p>已保存的项目文件不会因页面错误被删除。</p>
        </main>
      );
    return this.props.children;
  }
}
