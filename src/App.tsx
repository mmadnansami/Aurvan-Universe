import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';

const UniversePage = lazy(() =>
  import('./pages/UniversePage').then((m) => ({ default: m.UniversePage }))
);
const InstitutionsPage = lazy(() =>
  import('./pages/InstitutionsPage').then((m) => ({ default: m.InstitutionsPage }))
);
const RegionsPage = lazy(() =>
  import('./pages/RegionsPage').then((m) => ({ default: m.RegionsPage }))
);
const CaseLibraryPage = lazy(() =>
  import('./pages/CaseLibraryPage').then((m) => ({ default: m.CaseLibraryPage }))
);
const CareerPage = lazy(() =>
  import('./pages/CareerPage').then((m) => ({ default: m.CareerPage }))
);

const HallOfFamePage = lazy(() =>
  import('./pages/HallOfFamePage').then((m) => ({ default: m.HallOfFamePage }))
);
const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((m) => ({ default: m.AuthPage }))
);
const PlayerDashboardPage = lazy(() =>
  import('./pages/PlayerDashboardPage').then((m) => ({ default: m.PlayerDashboardPage }))
);
const InvestigationRoomPage = lazy(() =>
  import('./pages/InvestigationRoomPage').then((m) => ({ default: m.InvestigationRoomPage }))
);
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage }))
);

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-[#070B13] text-sm text-slate-400">
      Loading Directorate module...
    </div>
  );
}

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
        <Suspense fallback={<RouteLoadingFallback />}>
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
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PlatformProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </PlatformProvider>
    </ErrorBoundary>
  );
}
