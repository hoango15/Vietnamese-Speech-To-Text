// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { useAction } from "./useAction";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(() => root.unmount()); document.body.innerHTML = ""; });

it("submits a mutation once even when two submissions arrive before React renders busy", async () => {
  let finish!: () => void, writes = 0;
  const response = new Promise<void>(resolve => { finish = resolve; });
  function Form() {
    const action = useAction();
    const submit = () => action.run(async () => { writes++; await response; });
    return <button disabled={action.busy} onClick={() => { void submit(); void submit(); }}>Save</button>;
  }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<Form />));
  const button = host.querySelector("button")!;
  await act(() => button.click());
  expect(writes).toBe(1);
  expect(button.disabled).toBe(true);
  await act(async () => finish());
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(writes).toBe(2);
});
