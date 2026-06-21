import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientSettings, updateClientSettings } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import { BOT_PERSONALITIES } from '../../utils/constants';

const inputClass =
  'w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelClass = 'mb-1 block text-sm font-medium text-cream-dim';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULT_BUSINESS_HOURS = {
  enabled: false,
  timezone: 'Africa/Johannesburg',
  open: '08:00',
  close: '17:00',
  days: [1, 2, 3, 4, 5],
};

export default function ClientSettings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [botName, setBotName] = useState('');
  const [botPersonality, setBotPersonality] = useState('Professional');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [businessHours, setBusinessHours] = useState(DEFAULT_BUSINESS_HOURS);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    getClientSettings()
      .then((s) => {
        if (cancelled) return;
        setContactPerson(s.contact_person || '');
        setContactEmail(s.contact_email || '');
        setContactPhone(s.contact_phone || '');
        setBotName(s.bot_name || '');
        setBotPersonality(s.bot_personality || 'Professional');
        setSystemPrompt(s.system_prompt || '');
        setBusinessHours({ ...DEFAULT_BUSINESS_HOURS, ...(s.business_hours || {}) });
      })
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err, 'Failed to load settings')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function setHours(field, value) {
    setBusinessHours((prev) => ({ ...prev, [field]: value }));
  }

  function toggleDay(day) {
    setBusinessHours((prev) => {
      const days = prev.days || [];
      const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
      return { ...prev, days: newDays };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveError('');
    setSuccessMsg('');

    if (newPassword && newPassword !== confirmPassword) {
      setSaveError('New password and confirmation do not match');
      return;
    }
    if (newPassword && !currentPassword) {
      setSaveError('Enter your current password to set a new one');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        contact_person: contactPerson,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        bot_name: botName,
        bot_personality: botPersonality,
        system_prompt: systemPrompt,
        business_hours: businessHours,
      };
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      await updateClientSettings(payload);
      setSuccessMsg('Settings saved successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ClientLayout title="Settings">
      {loading && <LoadingSpinner label="Loading settings…" />}
      {!loading && loadError && <ErrorMessage message={loadError} />}

      {!loading && !loadError && (
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
          {successMsg && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              {successMsg}
            </div>
          )}
          <ErrorMessage message={saveError} />

          <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-cream">Contact Information</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Contact Person</label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Contact Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Contact Phone</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-cream">Assistant</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Bot Personality</label>
                <select value={botPersonality} onChange={(e) => setBotPersonality(e.target.value)} className={inputClass}>
                  {BOT_PERSONALITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Bot Name</label>
                <input
                  type="text"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  placeholder="What the bot calls itself"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className={labelClass}>Custom System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-cream-dim">
                Describes how the assistant should behave when chatting with your customers.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-cream">Business Hours</h2>

            <label className="mb-3 flex items-center gap-3">
              <button
                type="button"
                className="switch"
                data-on={businessHours.enabled}
                onClick={() => setHours('enabled', !businessHours.enabled)}
              >
                <span />
              </button>
              <span className="text-sm text-cream-dim">
                Restrict replies to business hours (outside these hours, customers get a "we're
                closed" auto-reply)
              </span>
            </label>

            {businessHours.enabled && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelClass}>Timezone</label>
                    <input
                      type="text"
                      value={businessHours.timezone}
                      onChange={(e) => setHours('timezone', e.target.value)}
                      placeholder="Africa/Johannesburg"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Opens</label>
                    <input
                      type="time"
                      value={businessHours.open}
                      onChange={(e) => setHours('open', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Closes</label>
                    <input
                      type="time"
                      value={businessHours.close}
                      onChange={(e) => setHours('close', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Open Days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_LABELS.map((label, day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                          businessHours.days.includes(day)
                            ? 'border-primary bg-primary text-ink'
                            : 'border-line bg-panel text-cream-dim'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-cream">Change Portal Password</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className={labelClass}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className={labelClass}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-cream-dim">Leave blank to keep your current password. Must be at least 8 characters.</p>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-ink hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </ClientLayout>
  );
}
