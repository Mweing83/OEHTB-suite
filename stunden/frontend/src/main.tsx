import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./index.css";

// basename = Vite-Base (z. B. "/stunden/" unter dem Suite-Proxy, sonst "/").
// import.meta.env.BASE_URL endet mit "/"; React Router erwartet ohne.
const basis = import.meta.env.BASE_URL.replace(/\/$/, "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basis || undefined}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
