import { useState } from "react";
import {
  createBrowserRouter,
  Link,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider";
import { LoginPage } from "../features/auth/LoginPage";
import { LogoutPage } from "../features/auth/LogoutPage";
import { Loading } from "../shared/ui/components";
import { NoticeProvider } from "../shared/ui/NoticeProvider";

function AccountPage() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <main className="boot">
      <section className="card panel stack">
        <h1>Đăng nhập thành công</h1>
        <p>Xin chào, {user.full_name}.</p>
        <p>{user.email}</p>
        <Link className="button" to="/logout">Đăng xuất</Link>
      </section>
    </main>
  );
}

export default function App() {
  const [router] = useState(() =>
    createBrowserRouter([
      { path: "/login", element: <LoginPage /> },
      { path: "/logout", element: <LogoutPage /> },
      { path: "/", element: <AccountPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
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
