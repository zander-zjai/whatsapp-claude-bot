export const BUSINESS_TYPES = ['Restaurant', 'Retail', 'Medical', 'Legal', 'Real Estate', 'Signage', 'Other'];

export const BOT_PERSONALITIES = ['Professional', 'Friendly', 'Formal', 'Casual'];

// Named billing packages — must match what's sold in proposals.
export const SERVICE_PACKAGES = [
  { value: 'ai_receptionist', label: 'AI Receptionist', price: 3000, features: ['vapi'] },
  { value: 'whatsapp_bot', label: 'WhatsApp Bot', price: 2500, features: ['whatsapp'] },
  { value: 'full_bundle', label: 'Full Bundle', price: 5000, features: ['vapi', 'whatsapp'] },
];

// A handful of distinct colors for the per-client lines on the dashboard chart.
export const CHART_COLORS = [
  '#7C3AED', // primary purple
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#3B82F6', // blue
  '#EC4899', // pink
  '#14B8A6', // teal
  '#8B5CF6', // violet
];
