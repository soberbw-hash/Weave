// Dev-only real-gesture harness. Constructed test File is not external-site acceptance.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../App";
import "../styles.css";
import "../typography.css";
function CaptureHarness() {
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState("");
  useEffect(() => {
    void fetch("/artifacts/capture-audio-20261016/旁白验收.wav")
      .then((r) => r.blob())
      .then((blob) =>
        setFile(new File([blob], "旁白验收.wav", { type: "audio/wav" })),
      );
    const drop = (event: DragEvent) =>
      setResult(`实际松开：${event.dataTransfer?.files.length || 0} 个文件`);
    window.addEventListener("drop", drop, true);
    return () => window.removeEventListener("drop", drop, true);
  }, []);
  return (
    <>
      <App />
      <aside
        style={{
          position: "fixed",
          top: 73,
          right: 20,
          zIndex: 100,
          display: "flex",
          gap: 8,
          background: "white",
          padding: 5,
          border: "1px solid #ccc",
          borderRadius: 6,
        }}
      >
        <button
          draggable={!!file}
          disabled={!file}
          onDragStart={(event) => {
            setResult("实际拖拽已开始");
            event.dataTransfer.items.add(file!);
            event.dataTransfer.effectAllowed = "copy";
          }}
        >
          拖入测试音频
        </button>
        <output>{result}</output>
      </aside>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<CaptureHarness />);
