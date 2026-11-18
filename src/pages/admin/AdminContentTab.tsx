import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { usePlatform } from '../../context/PlatformContext';
import { ImagePickerModal } from '../../components/ImagePickerModal';
import { InstitutionLogo } from '../../components/InstitutionLogo';

export function AdminContentTab({ mode }: { mode: 'content' | 'settings' }) {
  const { bootstrap, refreshBootstrap } = usePlatform();
  const [msg, setMsg] = useState('');
  const [picker, setPicker] = useState<null | { target: 'platform_logo' | 'favicon' | 'hero_bg' | 'inst_logo' | 'region_img'; id?: number | string }>(null);

  // Content states
  const [contentForms, setContentForms] = useState<Record<string, any>>({});
  const [instForms, setInstForms] = useState<any[]>([]);
  const [regionForms, setRegionForms] = useState<any[]>([]);
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (bootstrap) {
      setContentForms(JSON.parse(JSON.stringify(bootstrap.content || {})));
      setInstForms(JSON.parse(JSON.stringify(bootstrap.institutions || [])));
      setRegionForms(JSON.parse(JSON.stringify(bootstrap.regions || [])));
      setSettingsForm({ ...(bootstrap.settings || {}) });
    }
  }, [bootstrap]);

  const saveContentKey = async (key: string) => {
    setMsg('');
    const item = contentForms[key];
    await apiFetch(`/api/admin/content/${key}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
    await refreshBootstrap();
    setMsg(`Updated website section "${key}".`);
  };

  const saveInstitution = async (inst: any) => {
    setMsg('');
    await apiFetch(`/api/admin/institutions/${inst.id}`, {
      method: 'PUT',
      body: JSON.stringify(inst),
    });
    await refreshBootstrap();
    setMsg(`Updated ${inst.name} profile & emblem.`);
  };

  const saveRegion = async (reg: any) => {
    setMsg('');
    await apiFetch(`/api/admin/regions/${reg.id}`, {
      method: 'PUT',
      body: JSON.stringify(reg),
    });
    await refreshBootstrap();
    setMsg(`Updated ${reg.name} division profile.`);
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    await apiFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settingsForm),
    });
    await refreshBootstrap();
    setMsg('Site settings saved.');
  };

  return (
    <div className="space-y-8">
      {msg && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/50 px-4 py-2.5 text-xs text-emerald-200">
          {msg}
        </div>
      )}

      {mode === 'content' ? (
        <>
          <div>
            <h2 className="font-display text-3xl font-semibold text-white">Website Content & Logos</h2>
            <p className="text-sm text-slate-400">
              Edit homepage sections, institutional profiles and official logos, Bangladesh divisions, and visibility controls.
            </p>
          </div>

          {/* Editable Website Content Blocks */}
          <div className="space-y-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
              Homepage, Universe & Global Sections
            </h3>
            {Object.values(contentForms).map((item: any) => (
              <div key={item.key} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tabular text-xs text-[#C9A45C]">
                    Section: {item.key} ({item.section_group})
                  </span>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(item.is_visible)}
                      onChange={(e) =>
                        setContentForms((prev) => ({
                          ...prev,
                          [item.key]: { ...item, is_visible: e.target.checked },
                        }))
                      }
                    />
                    <span>Section Visible</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) =>
                    setContentForms((prev) => ({
                      ...prev,
                      [item.key]: { ...item, title: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <textarea
                  rows={3}
                  value={item.body}
                  onChange={(e) =>
                    setContentForms((prev) => ({
                      ...prev,
                      [item.key]: { ...item, body: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                {item.key === 'hero' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={item.media_url || ''}
                      onChange={(e) =>
                        setContentForms((prev) => ({
                          ...prev,
                          [item.key]: { ...item, media_url: e.target.value },
                        }))
                      }
                      placeholder="Hero background image URL"
                      className="flex-1 rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setPicker({ target: 'hero_bg', id: item.key })}
                      className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Choose / Upload Backdrop
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => saveContentKey(item.key)}
                  className="rounded bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]"
                >
                  Save Section
                </button>
              </div>
            ))}
          </div>

          {/* Institutions & Official Logos */}
          <div className="space-y-6 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
              Three Institutions & Official Logos
            </h3>
            {instForms.map((inst, idx) => (
              <div key={inst.id} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <InstitutionLogo
                      logoUrl={inst.logo_url}
                      name={inst.name}
                      shortName={inst.short_name}
                      size="sm"
                    />
                    <div>
                      <h4 className="font-display text-2xl font-semibold text-white">{inst.name}</h4>
                      <p className="text-xs text-slate-400">{inst.code}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPicker({ target: 'inst_logo', id: inst.id })}
                      className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Upload / Replace Logo
                    </button>
                    {inst.logo_url && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...instForms];
                          updated[idx] = { ...inst, logo_url: null };
                          setInstForms(updated);
                        }}
                        className="rounded border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950"
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={inst.tagline}
                  onChange={(e) => {
                    const updated = [...instForms];
                    updated[idx] = { ...inst, tagline: e.target.value };
                    setInstForms(updated);
                  }}
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <textarea
                  rows={3}
                  value={inst.description}
                  onChange={(e) => {
                    const updated = [...instForms];
                    updated[idx] = { ...inst, description: e.target.value };
                    setInstForms(updated);
                  }}
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => saveInstitution(inst)}
                  className="rounded bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]"
                >
                  Save {inst.short_name}
                </button>
              </div>
            ))}
          </div>

          {/* Regions Management */}
          <div className="space-y-6 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
              Bangladesh Eight Divisions
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {regionForms.map((reg, idx) => (
                <div key={reg.id} className="rounded-lg border border-slate-800 bg-[#0B111E] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xl font-semibold text-white">
                      {reg.name} ({reg.division_bn})
                    </span>
                    <button
                      type="button"
                      onClick={() => setPicker({ target: 'region_img', id: reg.id })}
                      className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200"
                    >
                      Set Illustration
                    </button>
                  </div>
                  <input
                    type="text"
                    value={reg.headquarters_label}
                    onChange={(e) => {
                      const updated = [...regionForms];
                      updated[idx] = { ...reg, headquarters_label: e.target.value };
                      setRegionForms(updated);
                    }}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-1.5 text-xs text-white"
                  />
                  <textarea
                    rows={2}
                    value={reg.description}
                    onChange={(e) => {
                      const updated = [...regionForms];
                      updated[idx] = { ...reg, description: e.target.value };
                      setRegionForms(updated);
                    }}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => saveRegion(reg)}
                    className="rounded bg-[#C9A45C] px-3 py-1.5 text-xs font-semibold text-[#070B13]"
                  >
                    Save Division
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <form onSubmit={saveSettings} className="max-w-2xl rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-5">
          <div>
            <h2 className="font-display text-3xl font-semibold text-white">Site Settings</h2>
            <p className="text-sm text-slate-400">Configure platform branding, registration, and contact details.</p>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Website Title</label>
            <input
              type="text"
              value={settingsForm.site_title || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, site_title: e.target.value })}
              className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Platform Logo</label>
            <div className="flex flex-wrap items-center gap-3">
              {settingsForm.platform_logo_url ? (
                <img
                  src={settingsForm.platform_logo_url}
                  alt="Platform logo"
                  referrerPolicy="no-referrer"
                  className="h-12 w-auto rounded border border-slate-700 bg-black p-1"
                />
              ) : null}
              <button
                type="button"
                onClick={() => setPicker({ target: 'platform_logo' })}
                className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                Upload / Replace Logo
              </button>
              {settingsForm.platform_logo_url && (
                <button
                  type="button"
                  onClick={() => setSettingsForm({ ...settingsForm, platform_logo_url: '' })}
                  className="rounded border border-red-900 px-3 py-2 text-xs text-red-300"
                >
                  Remove Logo
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Contact Email</label>
            <input
              type="email"
              value={settingsForm.contact_email || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, contact_email: e.target.value })}
              className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Allow New Player Registrations</label>
              <select
                value={settingsForm.registration_enabled || 'true'}
                onChange={(e) => setSettingsForm({ ...settingsForm, registration_enabled: e.target.value })}
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              >
                <option value="true">Open</option>
                <option value="false">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Maintenance Mode</label>
              <select
                value={settingsForm.maintenance_mode || 'false'}
                onChange={(e) => setSettingsForm({ ...settingsForm, maintenance_mode: e.target.value })}
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              >
                <option value="false">Normal Operation</option>
                <option value="true">Maintenance Banner Active</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="rounded-md bg-[#C9A45C] px-6 py-2.5 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
          >
            Save Site Settings
          </button>
        </form>
      )}

      <ImagePickerModal
        open={Boolean(picker)}
        defaultFolder={picker?.target === 'inst_logo' || picker?.target === 'platform_logo' ? 'logos' : 'general'}
        onSelect={(url) => {
          if (picker?.target === 'platform_logo') {
            setSettingsForm({ ...settingsForm, platform_logo_url: url });
          } else if (picker?.target === 'hero_bg') {
            setContentForms((prev) => ({
              ...prev,
              hero: { ...prev.hero, media_url: url },
            }));
          } else if (picker?.target === 'inst_logo') {
            setInstForms((prev) =>
              prev.map((i) => (i.id === picker.id ? { ...i, logo_url: url } : i))
            );
          } else if (picker?.target === 'region_img') {
            setRegionForms((prev) =>
              prev.map((r) => (r.id === picker.id ? { ...r, illustration_url: url } : r))
            );
          }
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
