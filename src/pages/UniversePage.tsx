import { usePlatform } from '../context/PlatformContext';

export function UniversePage() {
  const { bootstrap } = usePlatform();
  const about = bootstrap?.content?.about_universe;
  const intro = bootstrap?.content?.universe_intro;

  return (
    <div className="bg-[#070B13] py-14 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-12">
        <header className="space-y-4 border-b border-slate-800 pb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
            Universe Charter
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white text-balance">
            {about?.title || 'The AURVAN UNIVERSE Mandate'}
          </h1>
          <p className="text-base leading-relaxed text-slate-300">
            {about?.body}
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="font-display text-3xl font-semibold text-white">
            Fictional World & Educational Mission
          </h2>
          <p className="text-base leading-relaxed text-slate-300">
            {intro?.body}
          </p>
          <p className="text-base leading-relaxed text-slate-300">
            Every case within AURVAN UNIVERSE is authored as an analytical exercise. Rather than relying on arcade mechanics or guesswork, investigators examine structured dossiers—field photographs, archival documents, witness testimonies, audio recordings, and regional logistics—to construct a defensible conclusion.
          </p>
        </section>

        <section className="grid gap-6 sm:grid-cols-2 border-y border-slate-800 py-10">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-white">Three-Tier Institutional Structure</h3>
            <p className="text-sm leading-relaxed text-slate-400">
              Investigators begin in AURVAN POLICE, progress into the tactical inquiries of SAB (Special Action Battalion), and earn clearance for the strategic dossiers of SIA (State Intelligence Agency).
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-white">Eight-Division Regional Worldbuilding</h3>
            <p className="text-sm leading-relaxed text-slate-400">
              Cases unfold across Dhaka, Chattogram, Rajshahi, Khulna, Barishal, Sylhet, Rangpur, and Mymensingh—grounded in the rivers, ports, rail corridors, and civic architecture of Bangladesh.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 sm:p-8 space-y-4">
          <h2 className="font-display text-2xl font-semibold text-white">
            Rules & Fictional Disclaimer
          </h2>
          <ul className="space-y-3 text-sm leading-relaxed text-slate-300 list-disc pl-5">
            <li>
              AURVAN UNIVERSE is an independent fictional entertainment and critical-thinking platform. It is not a government body, police department, military unit, or intelligence agency.
            </li>
            <li>
              All characters, cases, divisions, records, and investigative scenarios are works of fiction created for educational problem-solving.
            </li>
            <li>
              Players must submit original analytical reasoning in their reports. Confidential solution keys and administrative evaluations remain strictly restricted.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
