export default function LoadingSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-cream-dim">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary"></div>
      <span className="text-sm">{label}</span>
    </div>
  );
}
