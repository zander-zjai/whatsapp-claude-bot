import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import {
  getClientMargins,
  addClientMargin,
  deleteClientMargin,
  updateDefaultMargin,
} from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';

export default function ClientMargins() {
  const [defaultMargin, setDefaultMargin] = useState(0);
  const [margins, setMargins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [defaultDraft, setDefaultDraft] = useState('0');
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultError, setDefaultError] = useState('');
  const [defaultSaved, setDefaultSaved] = useState(false);

  const [form, setForm] = useState({ label: '', phone_number: '', margin_percent: '' });
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getClientMargins();
      setDefaultMargin(data.default_margin || 0);
      setDefaultDraft(String(data.default_margin || 0));
      setMargins(data.customer_margins || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load margins'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveDefault() {
    setDefaultError('');
    setDefaultSaved(false);
    setSavingDefault(true);
    try {
      const val = parseFloat(defaultDraft);
      if (isNaN(val) || val < -100 || val > 100) { setDefaultError('Enter a value between -100 and 100'); return; }
      await updateDefaultMargin(val);
      setDefaultMargin(val);
      setDefaultSaved(true);
      setTimeout(() => setDefaultSaved(false), 2000);
    } catch (err) {
      setDefaultError(getErrorMessage(err, 'Failed to save default margin'));
    } finally {
      setSavingDefault(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAddError('');
    const mp = parseFloat(form.margin_percent);
    if (!form.phone_number) { setAddError('Phone number is required'); return; }
    if (isNaN(mp) || mp < -100 || mp > 100) { setAddError('Enter a value between -100 and 100 (negative = discount off list price)'); return; }
    setAdding(true);
    try {
      const updated = await addClientMargin({ label: form.label, phone_number: form.phone_number, margin_percent: mp });
      setMargins(updated);
      setForm({ label: '', phone_number: '', margin_percent: '' });
    } catch (err) {
      setAddError(getErrorMessage(err, 'Failed to add margin'));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      const updated = await deleteClientMargin(id);
      setMargins(updated);
    } catch {
      // ignore, re-load on error
      load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <ClientLayout title="Pricing Margins">
      {loading && <LoadingSpinner label="Loading margins…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <div className="space-y-6">
          {/* Default margin */}
          <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-cream">Default price adjustment</h2>
            <p className="mb-3 text-xs text-cream-dim">Your price list already includes your margin. Use this to adjust further: <strong className="text-cream">positive % = charge more</strong>, <strong className="text-cream">negative % = give a discount</strong>. 0% = sell at list price.</p>
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="number"
                  min="-100"
                  max="100"
                  step="0.1"
                  value={defaultDraft}
                  onChange={(e) => setDefaultDraft(e.target.value)}
                  className="w-28 rounded-lg border border-line bg-panel-2 px-3 py-2 pr-7 text-sm text-cream focus:border-primary focus:outline-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-cream-dim">%</span>
              </div>
              <button type="button" onClick={saveDefault} disabled={savingDefault}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-ink hover:bg-primary-700 disabled:opacity-60">
                {savingDefault ? 'Saving…' : 'Save'}
              </button>
              {defaultSaved && <span className="text-xs text-green-400">Saved</span>}
            </div>
            {defaultError && <p className="mt-2 text-xs text-red-400">{defaultError}</p>}
          </div>

          {/* Customer-specific margins */}
          <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-cream">Per-customer price adjustments</h2>
            <p className="mb-4 text-xs text-cream-dim">Override the default margin for specific customers matched by WhatsApp number.</p>

            {margins.length === 0 ? (
              <p className="mb-4 text-xs text-cream-dim italic">No custom margins yet. The default ({defaultMargin}%) applies to everyone.</p>
            ) : (
              <table className="mb-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-2 text-left text-xs font-medium text-cream-dim">Label</th>
                    <th className="pb-2 text-left text-xs font-medium text-cream-dim">Phone</th>
                    <th className="pb-2 text-right text-xs font-medium text-cream-dim">Margin</th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {margins.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 text-cream">{m.label || <span className="italic text-grey">—</span>}</td>
                      <td className="py-2 font-mono text-xs text-cream-dim">{m.phone_number}</td>
                      <td className="py-2 text-right font-medium text-cream">+{m.margin_percent}%</td>
                      <td className="py-2 pl-2">
                        <button type="button" onClick={() => handleDelete(m.id)} disabled={deletingId === m.id}
                          className="text-red-400 hover:text-red-300 disabled:opacity-60">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Add form */}
            <form onSubmit={handleAdd} className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium text-cream-dim">Add customer margin</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input type="text" placeholder="Label (e.g. Robin - Sky Art)" value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none" />
                <input type="text" placeholder="WhatsApp number (e.g. 27821234567)" value={form.phone_number} required
                  onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                  className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none" />
                <div className="relative">
                  <input type="number" min="-100" max="100" step="0.1" placeholder="Margin %" value={form.margin_percent} required
                    onChange={(e) => setForm((f) => ({ ...f, margin_percent: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 pr-8 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cream-dim">%</span>
                </div>
              </div>
              {addError && <p className="mt-1 text-xs text-red-400">{addError}</p>}
              <button type="submit" disabled={adding}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-ink hover:bg-primary-700 disabled:opacity-60">
                {adding ? 'Adding…' : 'Add margin'}
              </button>
            </form>
          </div>
        </div>
      )}
    </ClientLayout>
  );
}
