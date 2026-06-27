export const BUSINESS_TYPES = ['Restaurant', 'Retail', 'Medical', 'Legal', 'Real Estate', 'Signage', 'Other'];

export const BOT_PERSONALITIES = ['Professional', 'Friendly', 'Formal', 'Casual'];

// Named billing packages — must match what's sold in proposals.
export const SERVICE_PACKAGES = [
  { value: 'ai_receptionist', label: 'AI Receptionist', price: 3000, features: ['vapi'] },
  { value: 'whatsapp_bot', label: 'WhatsApp Bot', price: 2500, features: ['whatsapp'] },
  { value: 'email_receptionist', label: 'Email Receptionist', price: 2000, features: ['email'] },
  { value: 'full_bundle', label: 'Full Bundle', price: 5000, features: ['vapi', 'whatsapp'] },
];

// A handful of distinct colors for the per-client lines on the dashboard chart.
export const CHART_COLORS = [
  '#C9A876', // gold (primary)
  '#7FA88A', // green
  '#E2C594', // gold-bright
  '#EF4444', // red
  '#3B82F6', // blue
  '#EC4899', // pink
  '#14B8A6', // teal
  '#B9B6AC', // cream-dim
];
