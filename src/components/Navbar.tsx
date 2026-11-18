import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

const NAV_LINKS = [
  { to: '/universe', label: 'Universe' },
  { to: '/institutions', label: 'Institutions' },
  { to: '/regions', label: 'Regions' },
  { to: '/cases', label: 'Case Library' },
  { to: '/career', label: 'Career' },
];

export function Navbar() {
  const { user, bootstrap } = usePlatform();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const siteTitle = bootstrap?.settings?.site_title || 'AURVAN UNIVERSE';
  const logoUrl =
    bootstrap?.settings?.platform_logo_url ??
    '/assets/aistudio/Picsart_26-11-18_14-53-47-026_fe064427.png';
  const primaryHref = user
    ? user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
      ? '/admin'
      : '/dashboard'
    : '/auth';
  const primaryLabel = user
    ? user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
      ? 'Admin Panel'
      : 'Dashboard'
    : 'Sign In';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#070B13]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line Brand Logo & Title */}
        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          className="inline-flex items-center gap-2.5 font-display text-lg sm:text-xl font-semibold tracking-wider text-white whitespace-nowrap shrink-0 hover:text-[#C9A45C] transition-colors"
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${siteTitle} logo`}
              referrerPolicy="no-referrer"
              className="h-9 w-auto object-contain shrink-0"
            />
          ) : null}
          <span>{siteTitle}</span>
        </Link>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300" aria-label="Primary navigation">
          {NAV_LINKS.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b ${
                  active
                    ? 'text-[#C9A45C] border-[#C9A45C]'
                    : 'border-transparent hover:text-white hover:border-slate-600'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action + mobile menu trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to={primaryHref}
            className="hidden sm:inline-flex items-center justify-center rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold tracking-wide text-[#070B13] hover:bg-[#D8B774] transition-colors whitespace-nowrap shrink-0"
          >
            {primaryLabel}
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex md:hidden items-center justify-center rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white min-h-[44px] min-w-[44px]"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-800 bg-[#0B111E] px-4 py-4 space-y-2">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/80 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/hall-of-fame"
            onClick={() => setMobileOpen(false)}
            className="block rounded-md px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/80 hover:text-white"
          >
            Hall of Fame
          </Link>
          <div className="pt-2 border-t border-slate-800">
            <Link
              to={primaryHref}
              onClick={() => setMobileOpen(false)}
              className="block w-full rounded-md bg-[#C9A45C] px-4 py-2.5 text-center text-sm font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
