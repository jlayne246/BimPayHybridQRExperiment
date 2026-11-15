import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Generator from "./Generator";
import "@fontsource-variable/public-sans/wght.css";
import "./style.css";

createRoot(document.getElementById("root")!).render(<StrictMode><Generator /></StrictMode>);
