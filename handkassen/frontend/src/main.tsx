import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.js";
import "./index.css";

// basename = Vite-Base ("/handkassen/" unter dem Suite-Proxy, sonst "/").
const basis = import.meta.env.BASE_URL.replace(/\/$/, "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basis || undefined}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
