import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from '../utils/constants';

export default function MessageChart({ data, clients }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-cream-dim">No message data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#29292C" />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#B9B6AC' }} stroke="#29292C" />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#B9B6AC' }} stroke="#29292C" />
        <Tooltip
          contentStyle={{ background: '#151517', border: '1px solid #29292C', borderRadius: 8 }}
          labelStyle={{ color: '#F5F2EA' }}
          itemStyle={{ color: '#F5F2EA' }}
        />
        <Legend wrapperStyle={{ color: '#B9B6AC' }} />
        {clients.map((client, idx) => (
          <Line
            key={client.id}
            type="monotone"
            dataKey={client.id}
            name={client.name}
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
