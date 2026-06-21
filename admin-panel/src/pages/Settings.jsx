import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getSettings, updateSettings } from '../api/endpoints';
import { getErrorMessage } from '../api/client';

const inputClass =
  'w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelClass = 'mb-1 block text-sm font-medium text-cream-dim';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [platformKey, setPlatformKey] = useState('');
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
  const [clientPortalUrl, setClientPortalUrl] = useState('');
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [maxMemory, setMaxMemory] = useState(10);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (cancelled) return;
        setPlatformKey(s.platform_claude_api_key || '');
        setWebhookBaseUrl(s.webhook_base_url || '');
        setClientPortalUrl(s.client_portal_url || '');
        setFallbackMessage(s.fallback_message || '');
        setMaxMemory(s.max_conversation_memory || 10);
      })
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err, 'Failed to load settings')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

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
        platform_claude_api_key: platformKey,
        webhook_base_url: webhookBaseUrl,
        client_portal_url: clientPortalUrl,
        fallback_message: fallbackMessage,
        max_conversation_memory: Number(maxMemory),
      };
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      await updateSettings(payload);
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
    <Layout title="Settings">
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
            <h2 className="mb-4 text-base font-semibold text-cream">Platform Defaults</h2>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Platform Claude API Key</label>
                <input
                  type="text"
                  value={platformKey}
                  onChange={(e) => setPlatformKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className={`${inputClass} font-mono`}
                />
                <p className="mt-1 text-xs text-cream-dim">
                  Used as the default key for clients with "use platform key" enabled.
                </p>
              </div>

              <div>
                <label className={labelClass}>Webhook Base URL</label>
                <input
                  type="text"
                  value={webhookBaseUrl}
                  onChange={(e) => setWebhookBaseUrl(e.target.value)}
                  placeholder="https://yourdomain.com"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-cream-dim">
                  Used to generate the webhook URL shown after adding a client.
                </p>
              </div>

              <div>
                <label className={labelClass}>Client Portal URL</label>
                <input
                  type="text"
                  value={clientPortalUrl}
                  onChange={(e) => setClientPortalUrl(e.target.value)}
                  placeholder="https://zjai-admin.vercel.app"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-cream-dim">
                  Used to build the "Approve in portal" link in quote request notifications.
                </p>
              </div>

              <div>
                <label className={labelClass}>Fallback Message</label>
                <textarea
                  value={fallbackMessage}
                  onChange={(e) => setFallbackMessage(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-cream-dim">Sent to customers when Claude fails to respond.</p>
              </div>

              <div>
                <label className={labelClass}>Max Conversation Memory (messages)</label>
                <input
                  type="number"
                  min="1"
                  value={maxMemory}
                  onChange={(e) => setMaxMemory(e.target.value)}
                  className={`${inputClass} max-w-[160px]`}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-cream">Change Admin Password</h2>
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
              <p className="text-xs text-cream-dim">Leave blank to keep your current password.</p>
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
    </Layout>
  );
}
