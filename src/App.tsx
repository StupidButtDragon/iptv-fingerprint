import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import Compare from "./pages/Compare";
import Identify from "./pages/Identify";
import Investigate from "./pages/Investigate";
import Landing from "./pages/Landing";
import Providers from "./pages/Providers";
import SavedScans from "./pages/SavedScans";
import ScanDetail from "./pages/ScanDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Identify />} />
        <Route path="scans" element={<SavedScans />} />
        <Route path="scans/:name" element={<ScanDetail />} />
        <Route path="compare" element={<Compare />} />
        <Route path="investigate" element={<Investigate />} />
        <Route path="providers" element={<Providers />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
