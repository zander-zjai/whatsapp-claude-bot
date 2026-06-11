export default function Header({ title, onMenuClick }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          aria-label="Open menu"
        >
          ☰
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        <span className="hidden sm:inline">ZJAI Technologies</span>
        <span className="text-lg">🟣</span>
      </div>
    </header>
  );
}
