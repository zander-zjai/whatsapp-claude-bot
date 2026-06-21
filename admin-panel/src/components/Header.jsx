export default function Header({ title, onMenuClick }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-panel px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 text-cream-dim hover:bg-panel-2 lg:hidden"
          aria-label="Open menu"
        >
          ☰
        </button>
        <h1 className="text-lg font-semibold text-cream">{title}</h1>
      </div>
      <div className="flex items-center gap-2 text-sm font-medium text-cream-dim">
        <span className="hidden sm:inline">ZJAI Technologies</span>
        <span className="text-lg">🟡</span>
      </div>
    </header>
  );
}
