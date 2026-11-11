import { createRoot } from "react-dom/client";
import "./shared/styles.css";
import App from "./app/App";
import "./shared/responsive.css";
createRoot(document.getElementById("root")!).render(<App />);
