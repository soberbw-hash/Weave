/** Capture-phase cleanup also sees drops handled by nested targets. */
const bindings = new WeakMap<
  EventTarget,
  { callbacks: Set<() => void>; cleanup: () => void }
>();

export function bindDragCleanup(target: EventTarget, reset: () => void) {
  let binding = bindings.get(target);
  if (!binding) {
    const callbacks = new Set<() => void>();
    const notify = () => callbacks.forEach((callback) => callback());
    const key = (event: Event) => {
      if ((event as KeyboardEvent).key === "Escape") notify();
    };
    const events = ["drop", "dragend", "blur", "focus", "pointerdown"];
    const visibilityTarget =
      typeof window !== "undefined" && target === window && typeof document !== "undefined"
        ? document
        : target;
    for (const name of events) target.addEventListener(name, notify, true);
    visibilityTarget.addEventListener("visibilitychange", notify, true);
    target.addEventListener("keydown", key, true);
    binding = {
      callbacks,
      cleanup: () => {
        for (const name of events) target.removeEventListener(name, notify, true);
        visibilityTarget.removeEventListener("visibilitychange", notify, true);
        target.removeEventListener("keydown", key, true);
        bindings.delete(target);
      },
    };
    bindings.set(target, binding);
  }
  binding.callbacks.add(reset);
  return () => {
    const current = bindings.get(target);
    if (!current) return;
    current.callbacks.delete(reset);
    if (!current.callbacks.size) current.cleanup();
  };
}
