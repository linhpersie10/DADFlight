import { db, auth } from './firebase';
import { MaintenanceGuard } from './components/MaintenanceGuard';
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MaintenanceGuard db={db} auth={auth}>
    <React.StrictMode>
    <App />
  </React.StrictMode>
  </MaintenanceGuard>
);