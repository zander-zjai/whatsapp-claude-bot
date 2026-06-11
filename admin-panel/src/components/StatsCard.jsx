export default function StatsCard({ label, value, icon, status }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {status && (
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              status === 'online' ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
        )}
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
