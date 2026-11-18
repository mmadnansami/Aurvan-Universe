import { Shield } from 'lucide-react';

interface InstitutionLogoProps {
  logoUrl: string | null | undefined;
  name: string;
  shortName: string;
  size?: 'sm' | 'md' | 'lg';
}

export function InstitutionLogo({ logoUrl, name, shortName, size = 'md' }: InstitutionLogoProps) {
  const sizeClass =
    size === 'lg' ? 'h-28 w-28' : size === 'sm' ? 'h-12 w-12' : 'h-20 w-20';

  if (logoUrl) {
    return (
      <div
        className={`${sizeClass} shrink-0 overflow-hidden rounded-lg border border-slate-700/80 bg-[#0A0F1A] p-1.5 flex items-center justify-center`}
      >
        <img
          src={logoUrl}
          alt={`${name} official emblem`}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} shrink-0 rounded-lg border border-dashed border-slate-700 bg-[#0A0F1A] flex flex-col items-center justify-center text-center p-2`}
      aria-label={`${name} logo placeholder`}
    >
      <Shield className="h-5 w-5 text-slate-500 mb-1" />
      <span className="font-mono-tabular text-[10px] font-semibold tracking-wider text-slate-400">
        {shortName}
      </span>
    </div>
  );
}
