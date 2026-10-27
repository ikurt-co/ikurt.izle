import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import AdminDashboard from "./pages/AdminDashboard";
import LocationsPage from "./pages/LocationsPage";
import CamerasPage from "./pages/CamerasPage";
import AccessLinksPage from "./pages/AccessLinksPage";
import ViewersPage from "./pages/ViewersPage";
import StreamsPage from "./pages/StreamsPage";
import SettingsPage from "./pages/SettingsPage";
import ViewerPage from "./pages/ViewerPage";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/admin" replace />}
        />

        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/locations" element={<LocationsPage />} />
        <Route path="/admin/cameras" element={<CamerasPage />} />
        <Route path="/admin/access-links" element={<AccessLinksPage />} />
        <Route path="/admin/viewers" element={<ViewersPage />} />
        <Route path="/admin/streams" element={<StreamsPage />} />
        <Route path="/admin/settings" element={<SettingsPage />} />

        <Route path="/c/:code" element={<ViewerPage />} />

        <Route
          path="*"
          element={<Navigate to="/admin" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;