import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import {
  getClientCustomers,
  addClientMargin,
  deleteClientMargin,
  updateClientMargin,
  updateDefaultMargin,
} from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';

function toDisplayDiscount(storedPct) { return Math.max(0, -(storedPct ?? 0)); }
function toStoredMargin(displayDiscount) { return -(Math.abs(displayDiscount)); }

// ── Discount cell ─────────────────────────────────────────────────────────────
function MarginCell({ customer, defaultMargin, onSaved }) {
  const displayDiscount = toDisplayDiscount(customer.margin_percent ?? defaultMargin);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(displayDiscount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const val = parseFloat(draft);
    if (isNaN(val) || val < 0 || val > 100) { setError('0–100'); return; }
    setSaving(true);
    setError('');
    try {
      if (customer.margin_is_custom && customer.margin_id) {
        // Update in place — preserves linked email
        await updateClientMargin(customer.margin_id, { margin_percent: toStoredMargin(val) });
      } else {
        const defaultDiscount = toDisplayDiscount(defaultMargin);
        if (val !== defaultDiscount) {
          const isEmail = customer.customer_number.includes('@');
          await addClientMargin({
            label: customer.name,
            phone_number: isEmail ? '' : customer.customer_number,
            email: isEmail ? customer.customer_number : (customer.linked_email || ''),
            margin_percent: toStoredMargin(val),
          });
        }
      }
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed'));
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!customer.margin_is_custom || !customer.margin_id) { setEditing(false); return; }
    setSaving(true);
    try {
      await deleteClientMargin(customer.margin_id);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed'));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button type="button"
        onClick={() => { setDraft(String(toDisplayDiscount(customer.margin_percent ?? defaultMargin))); setEditing(true); }}
        className="group flex items-center gap-1 text-left">
        <span className={`font-medium ${customer.margin_is_custom ? 'text-green-400' : 'text-cream-dim'}`}>
          {toDisplayDiscount(customer.margin_percent ?? defaultMargin)}% off
        </span>
        <span className="text-[10px] text-grey opacity-0 group-hover:opacity-100">edit</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <input type="number" min="0" max="100" step="0.1" value={draft} autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="w-20 rounded border border-line bg-panel px-2 py-0.5 pr-6 text-xs text-cream focus:border-primary focus:outline-none" />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-grey">%</span>
      </div>
      <button type="button" onClick={save} disabled={saving}
        className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-ink disabled:opacity-60">
        {saving ? '…' : '✓'}
      </button>
      {customer.margin_is_custom && (
        <button type="button" onClick={reset} disabled={saving}
          className="rounded border border-line px-1.5 py-0.5 text-[10px] text-cream-dim hover:text-red-400 disabled:opacity-60"
          title="Reset to default">✕</button>
      )}
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}

// ── Email link cell ───────────────────────────────────────────────────────────
function EmailCell({ customer, defaultMargin, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customer.linked_email || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      if (customer.margin_id) {
        await updateClientMargin(customer.margin_id, { email: draft.trim() });
      } else {
        // Create a new margin entry at the default rate, just to store the email link
        const isEmail = customer.customer_number.includes('@');
        await addClientMargin({
          label: customer.name,
          phone_number: isEmail ? '' : customer.customer_number,
          email: draft.trim(),
          margin_percent: customer.margin_percent ?? defaultMargin,
        });
      }
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed'));
    } finally {
      setSaving(false);
    }
  }

  const display = customer.linked_email;

  if (!editing) {
    return (
      <button type="button"
        onClick={() => { setDraft(customer.linked_email || ''); setEditing(true); }}
        className="group flex items-center gap-1 text-left min-w-0">
        {display
          ? <span className="truncate font-mono text-xs text-cream-dim">{display}</span>
          : <span className="text-xs text-grey opacity-60 group-hover:opacity-100">+ link email</span>
        }
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input type="email" value={draft} autoFocus placeholder="customer@email.com"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="w-40 rounded border border-line bg-panel px-2 py-0.5 text-xs text-cream placeholder:text-grey focus:border-primary focus:outline-none" />
      <button type="button" onClick={save} disabled={saving}
        className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-ink disabled:opacity-60">
        {saving ? '…' : '✓'}
      </button>
      <button type="button" onClick={() => setEditing(false)}
        className="rounded border border-line px-1.5 py-0.5 text-[10px] text-cream-dim hover:text-red-400">✕</button>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ClientCustomers() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [defaultDraft, setDefaultDraft] = useState('');
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getClientCustomers();
      setData(d);
      setDefaultDraft(String(toDisplayDiscount(d.default_margin || 0)));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load customers'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveDefault() {
    const val = parseFloat(defaultDraft);
    if (isNaN(val) || val < 0 || val > 100) return;
    setSavingDefault(true);
    try {
      await updateDefaultMargin(toStoredMargin(val));
      setDefaultSaved(true);
      setTimeout(() => setDefaultSaved(false), 2000);
      load();
    } catch { /* ignore */ } finally { setSavingDefault(false); }
  }

  const customers = data?.customers || [];
  const filtered = search
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.customer_number.toLowerCase().includes(search.toLowerCase()) ||
        (c.linked_email || '').toLowerCase().includes(search.toLowerCase())
      )
    : customers;

  const defaultMargin = data?.default_margin || 0;
  const totalValue = customers.reduce((s, c) => s + c.total_value, 0);

  return (
    <ClientLayout title="Customers">
      {loading && <LoadingSpinner label="Loading customers…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && data && (
        <>
          <div className="mb-4 flex flex-wrap items-start gap-4">
            <div className="flex-1 rounded-xl border border-line bg-panel p-4 shadow-sm">
              <div className="flex flex-wrap gap-6">
                <div><p className="text-xs text-cream-dim">Total customers</p><p className="text-lg font-bold text-cream">{customers.length}</p></div>
                <div><p className="text-xs text-cream-dim">Total quote value</p><p className="text-lg font-bold text-cream">R{totalValue.toFixed(2)}</p></div>
                <div>
                  <p className="text-xs text-cream-dim mb-1">Default discount (all customers)</p>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input type="number" min="0" max="100" step="0.1" value={defaultDraft}
                        onChange={(e) => setDefaultDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveDefault(); }}
                        className="w-20 rounded-lg border border-line bg-panel-2 px-2 py-1 pr-6 text-sm text-cream focus:border-primary focus:outline-none" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-grey">%</span>
                    </div>
                    <button type="button" onClick={saveDefault} disabled={savingDefault}
                      className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-ink disabled:opacity-60">
                      {savingDefault ? '…' : 'Save'}
                    </button>
                    {defaultSaved && <span className="text-xs text-green-400">Saved</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="mb-3 text-xs text-cream-dim">
            Link a customer's email address to their phone number so discounts apply whether they contact you via WhatsApp or email.
          </p>

          <div className="mb-3">
            <input type="text" placeholder="Search by name, number, or email…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-line bg-panel px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none" />
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-cream-dim">{search ? 'No customers match.' : 'No customers yet.'}</p>
          ) : (
            <div className="rounded-xl border border-line bg-panel shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-left text-xs font-medium text-cream-dim">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-cream-dim">Number / Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-cream-dim">Linked email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-cream-dim">Discount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-cream-dim">Quotes</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-cream-dim">Total value</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-cream-dim">Won</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((c) => {
                    const wonCount = Object.entries(c.statuses || {})
                      .filter(([s]) => ['won', 'accepted'].includes(s))
                      .reduce((n, [, v]) => n + v, 0);
                    const isEmailCustomer = c.customer_number.includes('@');
                    return (
                      <tr key={c.customer_number} className="hover:bg-panel-2 transition-colors">
                        <td className="px-4 py-3 font-medium text-cream">{c.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-cream-dim">
                          <span className="flex items-center gap-1">
                            {isEmailCustomer ? '📧' : '📱'} {c.customer_number}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {/* Only show email link cell for phone-based customers */}
                          {!isEmailCustomer
                            ? <EmailCell customer={c} defaultMargin={defaultMargin} onSaved={load} />
                            : <span className="text-xs text-grey">—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <MarginCell customer={c} defaultMargin={defaultMargin} onSaved={load} />
                        </td>
                        <td className="px-4 py-3 text-right text-cream">{c.quote_count}</td>
                        <td className="px-4 py-3 text-right text-cream">R{c.total_value.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={wonCount > 0 ? 'font-medium text-green-400' : 'text-cream-dim'}>{wonCount}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button"
                            onClick={() => navigate(`/client/customers/${encodeURIComponent(c.customer_number)}/quotes`)}
                            className="rounded-lg border border-line px-2 py-1 text-xs text-cream-dim hover:bg-panel-2">
                            View quotes →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ClientLayout>
  );
}
