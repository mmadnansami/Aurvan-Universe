import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { UniversePage } from './pages/UniversePage';
import { InstitutionsPage } from './pages/InstitutionsPage';
import { RegionsPage } from './pages/RegionsPage';
import { CaseLibraryPage } from './pages/CaseLibraryPage';
import { CareerPage } from './pages/CareerPage';
import { HallOfFamePage } from './pages/HallOfFamePage';
import { AuthPage } from './pages/AuthPage';
import { PlayerDashboardPage } from './pages/PlayerDashboardPage';
import { InvestigationRoomPage } from './pages/InvestigationRoomPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

function AppShell() {
  const { bootstrap } = usePlatform();
  const maintenanceMode = bootstrap?.settings?.maintenance_mode === 'true';

  return (
    <div className="min-h-screen flex flex-col bg-[#070B13] text-slate-100">
      <Navbar />
      {maintenanceMode && (
        <div className="border-b border-amber-800/60 bg-amber-950/50 px-4 py-2 text-center text-xs text-amber-200">
          Scheduled Directorate maintenance is currently active. Some operational services may be limited.
        </div>
      )}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/universe" element={<UniversePage />} />
          <Route path="/institutions" element={<InstitutionsPage />} />
          <Route path="/regions" element={<RegionsPage />} />
          <Route path="/cases" element={<CaseLibraryPage />} />
          <Route path="/career" element={<CareerPage />} />
          <Route path="/hall-of-fame" element={<HallOfFamePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/dashboard" element={<PlayerDashboardPage />} />
          <Route path="/investigate/:caseId" element={<InvestigationRoomPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <PlatformProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </PlatformProvider>
  );
}
