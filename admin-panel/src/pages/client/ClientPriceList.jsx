import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientPriceList, updateClientPriceList } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

export default function ClientPriceList() {
  const [priceList, setPriceList] = useState([]);
  const [quoteTier, setQuoteTier] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await getClientPriceList();
        if (cancelled) return;
        setPriceList(data.price_list || []);
        setQuoteTier(Number(data.quote_tier) || 1);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load price list'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function addItem() {
    setPriceList((prev) => [...prev, { item: '', unit: '', price: '' }]);
  }

  function updateItem(index, field, value) {
    setPriceList((prev) => prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  }

  function removeItem(index) {
    setPriceList((prev) => prev.filter((_, i) => i !== index));
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return [];

    const firstCols = lines[0].split(',').map((c) => c.trim().toLowerCase());
    const hasHeader = firstCols.includes('item');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines
      .map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        const [item = '', unit = '', price = ''] = cols;
        return { item, unit, price };
      })
      .filter((entry) => entry.item);
  }

  function handleCsvUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaveError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseCsv(String(reader.result || ''));
        if (imported.length === 0) {
          setSaveError('No rows found. Expected CSV columns: item,unit,price');
          return;
        }
        setPriceList((prev) => [...prev, ...imported]);
      } catch (err) {
        setSaveError('Failed to read CSV file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveError('');
    setSavedAt(null);
    setSaving(true);
    try {
      const cleaned = priceList
        .map((entry) => ({
          item: String(entry.item || '').trim(),
          unit: String(entry.unit || '').trim(),
          price: Number(entry.price) || 0,
        }))
        .filter((entry) => entry.item);

      const updated = await updateClientPriceList(cleaned);
      setPriceList(updated);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Failed to save price list'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ClientLayout title="Price List">
      {loading && <LoadingSpinner label="Loading price list…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && quoteTier !== 2 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-sm">
          The price list is only available for clients on the Auto PDF Quote (Tier 2) plan. Contact
          ZJAI Technologies to upgrade.
        </div>
      )}

      {!loading && !error && quoteTier === 2 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <ErrorMessage message={saveError} />

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Price List</h2>
              <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Bulk Upload CSV
                <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} className="hidden" />
              </label>
            </div>
            <p className="-mt-2 mb-3 text-xs text-gray-500">
              CSV columns: item, unit, price (header row optional, e.g. "Vinyl Banner,per sqm,150").
              Uploaded rows are added to the list below — review then click Save.
            </p>

            <div className="space-y-2">
              {priceList.map((entry, index) => (
                <div key={index} className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={entry.item}
                    onChange={(e) => updateItem(index, 'item', e.target.value)}
                    placeholder="Item (e.g. Vinyl Banner)"
                    className={`${inputClass} w-full sm:flex-[2]`}
                  />
                  <input
                    type="text"
                    value={entry.unit}
                    onChange={(e) => updateItem(index, 'unit', e.target.value)}
                    placeholder="Unit (e.g. per sqm)"
                    className={`${inputClass} w-full sm:flex-1`}
                  />
                  <input
                    type="number"
                    value={entry.price}
                    onChange={(e) => updateItem(index, 'price', e.target.value)}
                    placeholder="Price (R)"
                    min="0"
                    step="0.01"
                    className={`${inputClass} w-full sm:flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 sm:w-auto"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
            >
              + Add Price List Item
            </button>

            {priceList.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Without at least one item, quote requests fall back to manual handling.
              </p>
            )}
          </section>

          <div className="flex items-center justify-end gap-3">
            {savedAt && <p className={labelClass + ' m-0 text-green-600'}>Saved.</p>}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Price List'}
            </button>
          </div>
        </form>
      )}
    </ClientLayout>
  );
}
