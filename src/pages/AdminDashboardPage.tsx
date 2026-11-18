import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Activity,
  Box,
  Briefcase,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Globe,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { AdminOverviewTab } from './admin/AdminOverviewTab';
import { AdminCasesTab } from './admin/AdminCasesTab';
import { AdminMediaTab } from './admin/AdminMediaTab';
import { AdminAssetsTab } from './admin/AdminAssetsTab';
import { AdminStudio3DTab } from './admin/AdminStudio3DTab';
import { AdminOperationsTab } from './admin/AdminOperationsTab';
import { AdminContentTab } from './admin/AdminContentTab';

type AdminSection =
  | 'overview'
  | 'cases'
  | 'media'
  | 'studio3d'
  | 'documents'
  | 'audio'
  | 'players'
  | 'reports'
  | 'content'
  | 'settings'
  | 'logs';

const ADMIN_NAV: Array<{ id: AdminSection; label: string; icon: any }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'cases', label: 'Cases & Dossiers', icon: FolderKanban },
  { id: 'media', label: 'Media Library', icon: ImageIcon },
  { id: 'studio3d', label: '3D Evidence Studio', icon: Box },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'audio', label: 'Audio Files', icon: Volume2 },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'reports', label: 'Report Evaluation', icon: ClipboardCheck },
  { id: 'content', label: 'Website Content', icon: Globe },
  { id: 'settings', label: 'Site Settings', icon: Settings },
  { id: 'logs', label: 'Audit Logs', icon: Activity },
];

export function AdminDashboardPage() {
  const { user, loading, logout } = usePlatform();
  const [section, setSection] = useState<AdminSection>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading) {
    return (
      <div className="bg-[#070B13] py-24 text-center text-sm text-slate-400">
        Verifying Directorate clearance...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return (
      <div className="bg-[#070B13] py-24 px-4">
        <div className="mx-auto max-w-md rounded-lg border border-red-900 bg-[#0B111E] p-8 text-center space-y-3">
          <Briefcase className="mx-auto h-8 w-8 text-red-400" />
          <h1 className="font-display text-3xl font-semibold text-white">Access Denied</h1>
          <p className="text-sm text-slate-300">
            Super Admin clearance is required to view the Directorate Management Console.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#070B13] min-h-screen flex flex-col lg:flex-row">
      {/* Mobile Admin Bar */}
      <div className="lg:hidden flex items-center justify-between border-b border-slate-800 bg-[#0B111E] px-4 py-3">
        <div>
          <p className="font-mono-tabular text-[11px] text-[#C9A45C]">SUPER ADMIN CONSOLE</p>
          <p className="text-sm font-semibold text-white">
            {ADMIN_NAV.find((n) => n.id === section)?.label}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen((prev) => !prev)}
          aria-label="Toggle admin navigation"
          className="rounded border border-slate-700 p-2 text-slate-200"
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          mobileNavOpen ? 'block' : 'hidden'
        } lg:block w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#090E18] p-4 flex flex-col justify-between`}
      >
        <div className="space-y-6">
          <div className="hidden lg:block border-b border-slate-800 pb-4">
            <p className="font-mono-tabular text-[11px] text-[#C9A45C] tracking-wider">
              {user.role}
            </p>
            <p className="text-sm font-semibold text-white mt-0.5 truncate">{user.full_name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>

          <nav className="space-y-1" aria-label="Super Admin navigation">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 mt-6 border-t border-slate-800">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-5 sm:p-8 lg:p-10 overflow-x-hidden">
        <div className="mx-auto max-w-6xl">
          {section === 'overview' && <AdminOverviewTab />}
          {section === 'cases' && <AdminCasesTab />}
          {section === 'media' && <AdminMediaTab />}
          {section === 'studio3d' && <AdminStudio3DTab />}
          {section === 'documents' && <AdminAssetsTab mode="documents" />}
          {section === 'audio' && <AdminAssetsTab mode="audio" />}
          {section === 'players' && <AdminOperationsTab mode="players" />}
          {section === 'reports' && <AdminOperationsTab mode="reports" />}
          {section === 'content' && <AdminContentTab mode="content" />}
          {section === 'settings' && <AdminContentTab mode="settings" />}
          {section === 'logs' && <AdminOperationsTab mode="logs" />}
        </div>
      </main>
    </div>
  );
}
