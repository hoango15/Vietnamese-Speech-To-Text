import { useState } from "react";
import {
  createBrowserRouter,
  Link,
  RouterProvider,
} from "react-router-dom";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider";
import { LoginPage } from "../features/auth/LoginPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import ProjectPage from "../features/projects/ProjectPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LogoutPage } from "../features/auth/LogoutPage";
import { Loading } from "../shared/ui/components";
import { NoticeProvider } from "../shared/ui/NoticeProvider";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { workspaceSections, type WorkspaceDestination } from "./layouts/navigation";

function WorkspaceSection({ section }: { section: WorkspaceDestination }) {
  const { user } = useAuth();
  const denied = section.roles && (!user || !section.roles.includes(user.user_role_code));
  return (
    <section className="card panel stack">
      <h1>{denied ? "Bạn không có quyền truy cập" : section.label}</h1>
      <p>{denied
        ? "Tài khoản của bạn không có quyền mở mục này."
        : "Màn hình này sẽ được bổ sung trong bản cập nhật tiếp theo."}</p>
      <Link className="button secondary" to="/">Về tổng quan</Link>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="card panel stack">
      <h1>Không tìm thấy trang</h1>
      <Link className="button" to="/">Về tổng quan</Link>
    </section>
  );
}

export default function App() {
  const [router] = useState(() =>
    createBrowserRouter([
      { path: "/login", element: <LoginPage /> },
      { path: "/logout", element: <LogoutPage /> },
      {
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "projects", element: <ProjectsPage /> },
          { path: "projects/:id", element: <ProjectPage /> },
          { path: "my-projects", element: <ProjectsPage personal /> },
          ...workspaceSections.filter((section) => !["/", "/my-projects"].includes(section.path)).map((section) => ({
            path: section.path === "/projects" ? "projects/*" : section.path.slice(1),
            element: <WorkspaceSection section={section} />,
          })),
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ]),
  );

  return (
    <NoticeProvider>
      <AuthProvider>
        {(ready) => ready ? (
          <RouterProvider router={router} />
        ) : (
          <div className="boot"><Loading /></div>
        )}
      </AuthProvider>
    </NoticeProvider>
  );
}
