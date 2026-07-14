import { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  getMockupReferences,
  getMockupReferenceImageBlob,
  addMockupReference,
  updateMockupReference,
  deleteMockupReference,
} from '../api/endpoints';
import { getErrorMessage } from '../api/client';

// Fetches a reference image as a blob (auth header needed) and renders it,
// exposing an onClick/drag surface to position the logo zone.
function ZoneEditor({ referenceId, zone, onChange, cacheKey }) {
  const [src, setSrc] = useState(null);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    let url;
    let cancelled = false;
    getMockupReferenceImageBlob(referenceId)
      .then((blob) => { if (!cancelled) { url = URL.createObjectURL(blob); setSrc(url); } })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [referenceId, cacheKey]);

  function pointToFraction(e) {
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function handleDown(e) {
    e.preventDefault();
    const p = pointToFraction(e);
    startRef.current = p;
    setDragging(true);
  }

  function handleMove(e) {
    if (!dragging || !startRef.current) return;
    const p = pointToFraction(e);
    const s = startRef.current;
    const x = Math.min(s.x, p.x);
    const y = Math.min(s.y, p.y);
    const width = Math.abs(p.x - s.x);
    const height = Math.abs(p.y - s.y);
    onChange({ x, y, width: Math.max(0.02, width), height: Math.max(0.02, height) });
  }

  function handleUp() {
    setDragging(false);
    startRef.current = null;
  }

  if (!src) {
    return <div className="flex h-64 items-center justify-center rounded-lg bg-panel-2 text-sm text-cream-dim">Loading image…</div>;
  }

  return (
    <div
      ref={containerRef}
      className="relative select-none overflow-hidden rounded-lg border border-line"
      onMouseDown={handleDown}
      onMouseMove={handleMove}
      onMouseUp={handleUp}
      onMouseLeave={handleUp}
      style={{ cursor: 'crosshair' }}
    >
      <img src={src} alt="Reference" className="block w-full" draggable={false} />
      {zone && (
        <div
          className="pointer-events-none absolute border-2 border-primary bg-primary/20"
          style={{
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.width * 100}%`,
            height: `${zone.height * 100}%`,
          }}
        >
          <span className="absolute -top-5 left-0 rounded bg-primary px-1 text-[10px] font-medium text-ink">
            Logo zone
          </span>
        </div>
      )}
    </div>
  );
}

function ReferenceCard({ reference, onSaved, onDeleted }) {
  const [zone, setZone] = useState(reference.logo_zone);
  const [name, setName] = useState(reference.name);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState('');

  const dirty =
    name !== reference.name ||
    JSON.stringify(zone) !== JSON.stringify(reference.logo_zone);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateMockupReference(reference.id, { name, logo_zone: zone });
      onSaved(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    setConfirmDel(false);
    try {
      await deleteMockupReference(reference.id);
      onDeleted(reference.id);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete'));
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <ZoneEditor referenceId={reference.id} zone={zone} onChange={setZone} />
      <p className="mt-2 text-xs text-cream-dim">
        Click-drag on the image to set where the customer's logo will sit.
      </p>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-3 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream focus:border-primary focus:outline-none"
        placeholder="Reference name"
      />

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-ink hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedFlash && <span className="text-xs text-green-400">Saved ✓</span>}
        <button
          type="button"
          onClick={() => setConfirmDel(true)}
          className="ml-auto text-sm text-red-400 hover:text-red-300"
        >
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirmDel}
        title="Delete this reference?"
        message="It will no longer be used for compositing new mockups."
        confirmLabel="Delete"
        danger
        onConfirm={del}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}

function UploadForm({ categories, onAdded }) {
  const [category, setCategory] = useState(categories[0]?.id || '');
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  function onFile(e) {
    const f = e.target.files?.[0];
    if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^.]+$/, '')); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) { setError('Choose an image first'); return; }
    setUploading(true);
    setError('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const ref = await addMockupReference({ category, name, image_base64: dataUrl });
      onAdded(ref);
      setFile(null);
      setName('');
    } catch (err) {
      setError(getErrorMessage(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-cream">Add a reference image</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream focus:border-primary focus:outline-none"
        >
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Storefront lightbox)"
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none"
        />
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={onFile}
          className="text-sm text-cream-dim file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={uploading}
        className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-700 disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : 'Upload reference'}
      </button>
    </form>
  );
}

export default function MockupReferences() {
  const [categories, setCategories] = useState([]);
  const [references, setReferences] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getMockupReferences();
      setCategories(data.categories || []);
      setReferences(data.references || []);
      if (!activeCat && data.categories?.length) setActiveCat(data.categories[0].id);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load references'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = references.filter((r) => r.category === activeCat);

  return (
    <Layout title="Mockup References">
      <p className="mb-4 max-w-2xl text-sm text-cream-dim">
        These reference photos are used to build instant, accurate mockups for flat signage.
        When a customer requests a lightbox, PVC sign, banner, window vinyl or flat cut letters,
        their logo is composited onto the best-matching image below at the logo zone you set.
      </p>

      {loading && <LoadingSpinner label="Loading references…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((c) => {
              const count = references.filter((r) => r.category === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCat(c.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    activeCat === c.id ? 'bg-primary text-ink' : 'border border-line text-cream-dim hover:bg-panel-2'
                  }`}
                >
                  {c.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="mb-6">
            <UploadForm
              categories={categories}
              onAdded={(ref) => { setReferences((prev) => [...prev, ref]); setActiveCat(ref.category); }}
            />
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-cream-dim">
              No reference images in this category yet. Upload one above so mockups can be composited for it.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((ref) => (
                <ReferenceCard
                  key={ref.id}
                  reference={ref}
                  onSaved={(updated) => setReferences((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))}
                  onDeleted={(id) => setReferences((prev) => prev.filter((r) => r.id !== id))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
