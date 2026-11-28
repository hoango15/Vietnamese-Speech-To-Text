// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { useUnsavedChanges } from "./useUnsavedChanges";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots) await act(() => root.unmount());
  roots.length = 0;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
function Editor({ otherDirty = false, locked = false }: { otherDirty?: boolean; locked?: boolean }) {
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty, undefined, otherDirty, locked);
  return (
    <>
      <button onClick={() => setDirty(true)}>Sửa nội dung</button>
      <Link to="/other">Rời trang</Link>
    </>
  );
}
it("keeps unsaved editor on screen when navigation is declined, then allows confirmed navigation", async () => {
  const router = createMemoryRouter([
    { path: "/", element: <Editor /> },
    { path: "/other", element: <p>Trang khác</p> },
  ]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<RouterProvider router={router} />));
  vi.stubGlobal("confirm", () => false);
  await act(() => host.querySelector("button")!.click());
  await act(() => host.querySelector("a")!.click());
  expect(host.textContent).toContain("Sửa nội dung");
  expect(router.state.location.pathname).toBe("/");
  vi.stubGlobal("confirm", () => true);
  await act(() => host.querySelector("a")!.click());
  expect(router.state.location.pathname).toBe("/other");
});
it("protects a recording draft without marking the canonical editor dirty", async () => {
  const router = createMemoryRouter([
    { path: "/", element: <Editor otherDirty /> },
    { path: "/other", element: <p>Trang khác</p> },
  ]);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<RouterProvider router={router} />));
  vi.stubGlobal("confirm", () => false);
  await act(() => host.querySelector("a")!.click());
  expect(router.state.location.pathname).toBe("/");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

it("keeps an active upload mounted even when leaving is confirmed", async () => {
 const router=createMemoryRouter([{path:"/",element:<Editor locked />},{path:"/other",element:<p>Other</p>}]);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);roots.push(root);
 await act(async()=>root.render(<RouterProvider router={router}/>));
 vi.stubGlobal("confirm",()=>true);
 await act(()=>host.querySelector("a")!.click());
 expect(router.state.location.pathname).toBe("/");
});
