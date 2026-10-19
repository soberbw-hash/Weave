/// <reference types="vite/client" />
import type { DesktopBridge } from "./types";
declare global {
  interface Window {
    weaveDesktop?: DesktopBridge;
  }
}
