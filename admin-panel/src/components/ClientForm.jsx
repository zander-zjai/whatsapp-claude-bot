import { useState } from 'react';
import { BUSINESS_TYPES, BOT_PERSONALITIES } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import ErrorMessage from './ErrorMessage';

export const DEFAULT_CLIENT_VALUES = {
  name: '',
  business_type: 'Other',
  contact_person: '',
  contact_email: '',
  contact_phone: '',
  phone_number_id: '',
  whatsapp_token: '',
  claude_api_key: '',
  use_platform_key: false,
  monthly_message_limit: 1000,
  bot_personality: 'Professional',
  bot_name: '',
  system_prompt: '',
  active: true,
};

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

export default function ClientForm({ initialValues, onSubmit, submitLabel, loading, error, updatedAt }) {
  const [values, setValues] = useState({ ...DEFAULT_CLIENT_VALUES, ...initialValues });

  function set(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleChange(e) {
    const { name, type, value, checked } = e.target;
    set(name, type === 'checkbox' ? checked : value);
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      ...values,
      monthly_message_limit: Number(values.monthly_message_limit) || 0,
    });
  }

  const promptPlaceholder = `You are a helpful assistant for ${
    values.name || '[Business Name]'
  }. You assist customers with... Always reply in the same language the customer uses.`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ErrorMessage message={error} />

      {updatedAt && (
        <p className="text-xs text-gray-500">Last updated: {formatDateTime(updatedAt)}</p>
      )}

      {/* Business info */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Business Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Business Name *</label>
            <input
              type="text"
              name="name"
              value={values.name}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Business Type</label>
            <select name="business_type" value={values.business_type} onChange={handleChange} className={inputClass}>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Contact Person Name *</label>
            <input
              type="text"
              name="contact_person"
              value={values.contact_person}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Contact Email *</label>
            <input
              type="email"
              name="contact_email"
              value={values.contact_email}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Contact Phone *</label>
            <input
              type="tel"
              name="contact_phone"
              value={values.contact_phone}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* WhatsApp config */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">WhatsApp Configuration</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>WhatsApp Phone Number ID *</label>
            <input
              type="text"
              name="phone_number_id"
              value={values.phone_number_id}
              onChange={handleChange}
              required
              placeholder="From Meta Developer Portal"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>WhatsApp API Token *</label>
            <input
              type="text"
              name="whatsapp_token"
              value={values.whatsapp_token}
              onChange={handleChange}
              required
              placeholder="From Meta Developer Portal"
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      </section>

      {/* Claude config */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Claude Configuration</h2>

        <label className="mb-3 flex items-center gap-3">
          <button
            type="button"
            className="switch"
            data-on={values.use_platform_key}
            onClick={() => set('use_platform_key', !values.use_platform_key)}
          >
            <span />
          </button>
          <span className="text-sm text-gray-700">
            Use platform Claude API key (configured in Settings) instead of a client-specific key
          </span>
        </label>

        {!values.use_platform_key && (
          <div>
            <label className={labelClass}>Claude API Key *</label>
            <input
              type="text"
              name="claude_api_key"
              value={values.claude_api_key}
              onChange={handleChange}
              required={!values.use_platform_key}
              placeholder="sk-ant-..."
              className={`${inputClass} font-mono`}
            />
          </div>
        )}
      </section>

      {/* Bot personality */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Bot Personality</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Bot Personality</label>
            <select name="bot_personality" value={values.bot_personality} onChange={handleChange} className={inputClass}>
              {BOT_PERSONALITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Bot Name</label>
            <input
              type="text"
              name="bot_name"
              value={values.bot_name}
              onChange={handleChange}
              placeholder="What the bot calls itself"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Monthly Message Limit</label>
            <input
              type="number"
              name="monthly_message_limit"
              value={values.monthly_message_limit}
              onChange={handleChange}
              min="0"
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>Custom System Prompt *</label>
          <textarea
            name="system_prompt"
            value={values.system_prompt}
            onChange={handleChange}
            required
            rows={6}
            placeholder={promptPlaceholder}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500">
            Tip: include an instruction like "Always reply in the same language the customer uses."
          </p>
        </div>
      </section>

      {/* Status */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="flex items-center gap-3">
          <button type="button" className="switch" data-on={values.active} onClick={() => set('active', !values.active)}>
            <span />
          </button>
          <span className="text-sm font-medium text-gray-700">
            Active {values.active ? '(bot will respond to messages)' : '(bot is paused)'}
          </span>
        </label>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {loading ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
