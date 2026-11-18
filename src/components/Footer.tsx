import { Link } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';

export function Footer() {
  const { bootstrap } = usePlatform();
  const siteTitle = bootstrap?.settings?.site_title || 'AURVAN UNIVERSE';
  const contactEmail = bootstrap?.settings?.contact_email || 'archive@aurvan-universe.org';
  const disclaimer =
    bootstrap?.content?.footer_disclaimer?.body ||
    'AURVAN UNIVERSE is an independent fictional investigation and educational mystery platform inspired by Bangladesh. It is not a real government agency, police department, intelligence service, or law enforcement organization.';
  const logoUrl = bootstrap?.settings?.platform_logo_url;

  return (
    <footer className="border-t border-slate-800/80 bg-[#05080F] text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={siteTitle}
                  referrerPolicy="no-referrer"
                  className="h-11 w-auto object-contain shrink-0"
                />
              ) : null}
              <span className="font-display text-xl font-semibold tracking-wider text-white">
                {siteTitle}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-400 max-w-md">{disclaimer}</p>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300">
              Platform
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/universe" className="hover:text-white transition-colors">
                  Universe Overview
                </Link>
              </li>
              <li>
                <Link to="/institutions" className="hover:text-white transition-colors">
                  Three Institutions
                </Link>
              </li>
              <li>
                <Link to="/regions" className="hover:text-white transition-colors">
                  Bangladesh Divisions
                </Link>
              </li>
              <li>
                <Link to="/cases" className="hover:text-white transition-colors">
                  Case Library
                </Link>
              </li>
              <li>
                <Link to="/hall-of-fame" className="hover:text-white transition-colors">
                  Hall of Fame
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300">
              Directorate & Contact
            </h3>
            <p className="text-sm text-slate-400">
              Administrative & Institutional Inquiries:
            </p>
            <p className="text-sm font-mono-tabular text-slate-200">{contactEmail}</p>
            <div className="pt-2 flex flex-wrap gap-4 text-xs text-slate-400">
              <Link to="/career" className="hover:text-[#C9A45C] transition-colors">
                Career & Rank Rules
              </Link>
              <Link to="/auth" className="hover:text-[#C9A45C] transition-colors">
                Investigator Sign In
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-800/80 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} {siteTitle}. Fictional Educational & Mystery Platform.</p>
          <p>Inspired by Bangladesh · All Eight Divisions</p>
        </div>
      </div>
    </footer>
  );
}
