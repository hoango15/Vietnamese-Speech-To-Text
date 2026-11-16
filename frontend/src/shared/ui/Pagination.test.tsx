// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Pagination } from "./components";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  document.body.innerHTML = "";
});

it("shows all seven-entry pages and disables next only on the last page", async () => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  const onChange = vi.fn();
  await act(() => root.render(<Pagination page={1} total={15} pageSize={7} onChange={onChange} />));
  expect(host.textContent).toContain("15 kết quả · Trang 1/3");
  const [previous, next] = host.querySelectorAll("button");
  expect(previous.disabled).toBe(true);
  await act(() => next.click());
  expect(onChange).toHaveBeenCalledWith(2);
  await act(() => root.render(<Pagination page={3} total={15} pageSize={7} onChange={onChange} />));
  expect(host.textContent).toContain("Trang 3/3");
  expect(host.querySelectorAll("button")[1].disabled).toBe(true);
});

it("keeps twenty entries per page for existing callers", async () => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(<Pagination page={2} total={21} onChange={() => {}} />));
  expect(host.textContent).toContain("21 kết quả · Trang 2/2");
  expect(host.querySelectorAll("button")[1].disabled).toBe(true);
});
