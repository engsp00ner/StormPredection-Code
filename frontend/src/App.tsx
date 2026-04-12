import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AlertHistoryPage from "./pages/AlertHistoryPage";
import DashboardPage from "./pages/DashboardPage";
import RecipientsPage from "./pages/RecipientsPage";
import SensorHistoryPage from "./pages/SensorHistoryPage";
import SettingsPage from "./pages/SettingsPage";
import WhatsAppStatusPage from "./pages/WhatsAppStatusPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/alerts/" element={<AlertHistoryPage />} />
        <Route path="/history/" element={<SensorHistoryPage />} />
        <Route path="/whatsapp/" element={<WhatsAppStatusPage />} />
        <Route path="/whatsapp/recipients/" element={<RecipientsPage />} />
        <Route path="/settings/" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
