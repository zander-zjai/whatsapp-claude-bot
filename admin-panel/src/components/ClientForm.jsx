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
  owner_phone: '',
  business_hours: {
    enabled: false,
    timezone: 'Africa/Johannesburg',
    open: '08:00',
    close: '17:00',
    days: [1, 2, 3, 4, 5],
  },
  quote_requests_enabled: false,
  quote_tier: 1,
  price_list: [],
  logo_url: '',
  brand_color: '#1E3A8A',
  quote_terms: '',
  monthly_fee: 0,
  payment_status: 'unpaid',
  invoice_date: '',
};

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ClientForm({ initialValues, onSubmit, submitLabel, loading, error, updatedAt }) {
  const [values, setValues] = useState({ ...DEFAULT_CLIENT_VALUES, ...initialValues });

  function set(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleChange(e) {
    const { name, type, value, checked } = e.target;
    set(name, type === 'checkbox' ? checked : value);
  }

  function setBusinessHours(field, value) {
    setValues((prev) => ({
      ...prev,
      business_hours: { ...prev.business_hours, [field]: value },
    }));
  }

  function toggleBusinessDay(day) {
    setValues((prev) => {
      const days = prev.business_hours.days || [];
      const newDays = days.includes(day)
        ? days.filter((d) => d !== day)
        : [...days, day].sort((a, b) => a - b);
      return { ...prev, business_hours: { ...prev.business_hours, days: newDays } };
    });
  }

  function addPriceListItem() {
    setValues((prev) => ({
      ...prev,
      price_list: [...prev.price_list, { item: '', unit: '', price: '' }],
    }));
  }

  function updatePriceListItem(index, field, value) {
    setValues((prev) => ({
      ...prev,
      price_list: prev.price_list.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)),
    }));
  }

  function removePriceListItem(index) {
    setValues((prev) => ({
      ...prev,
      price_list: prev.price_list.filter((_, i) => i !== index),
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      ...values,
      monthly_message_limit: Number(values.monthly_message_limit) || 0,
      quote_tier: Number(values.quote_tier) === 2 ? 2 : 1,
      monthly_fee: Number(values.monthly_fee) || 0,
      price_list: values.price_list
        .map((entry) => ({
          item: String(entry.item || '').trim(),
          unit: String(entry.unit || '').trim(),
          price: Number(entry.price) || 0,
        }))
        .filter((entry) => entry.item),
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

      {/* Owner & handover */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Owner & Handover</h2>
        <div>
          <label className={labelClass}>Owner WhatsApp Number</label>
          <input
            type="tel"
            name="owner_phone"
            value={values.owner_phone}
            onChange={handleChange}
            placeholder="+27821234567"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500">
            From this number, send <code>#takeover</code> to silence Zara for a conversation and{' '}
            <code>#release</code> to hand it back. Zara also notifies this number when a customer
            asks for a human or after-hours urgent help.
          </p>
        </div>
      </section>

      {/* Business hours */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Business Hours</h2>

        <label className="mb-3 flex items-center gap-3">
          <button
            type="button"
            className="switch"
            data-on={values.business_hours.enabled}
            onClick={() => setBusinessHours('enabled', !values.business_hours.enabled)}
          >
            <span />
          </button>
          <span className="text-sm text-gray-700">
            Restrict Zara's replies to business hours (outside these hours, customers get a
            "we're closed" auto-reply)
          </span>
        </label>

        {values.business_hours.enabled && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Timezone</label>
                <input
                  type="text"
                  value={values.business_hours.timezone}
                  onChange={(e) => setBusinessHours('timezone', e.target.value)}
                  placeholder="Africa/Johannesburg"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Opens</label>
                <input
                  type="time"
                  value={values.business_hours.open}
                  onChange={(e) => setBusinessHours('open', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Closes</label>
                <input
                  type="time"
                  value={values.business_hours.close}
                  onChange={(e) => setBusinessHours('close', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Open Days</label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleBusinessDay(day)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      values.business_hours.days.includes(day)
                        ? 'border-primary bg-primary text-white'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Quote requests */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Quote Requests</h2>
        <label className="flex items-center gap-3">
          <button
            type="button"
            className="switch"
            data-on={values.quote_requests_enabled}
            onClick={() => set('quote_requests_enabled', !values.quote_requests_enabled)}
          >
            <span />
          </button>
          <span className="text-sm text-gray-700">
            When customers ask for a quote, Zara collects their name, contact number, item,
            size, and quantity.
          </span>
        </label>

        {values.quote_requests_enabled && (
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass}>Quoting Tier</label>
              <select
                value={values.quote_tier}
                onChange={(e) => set('quote_tier', Number(e.target.value))}
                className={inputClass}
              >
                <option value={1}>Tier 1 — Quote Assist (notify owner, owner quotes manually)</option>
                <option value={2}>Tier 2 — Auto PDF Quote (generate branded PDF for owner approval)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {Number(values.quote_tier) === 2
                  ? 'Zara calculates a total from the price list below and generates a branded PDF. The owner replies #approve or #reject before it\'s sent to the customer.'
                  : 'Zara sends the owner a summary of the request; the owner prepares and sends the final quote manually.'}
              </p>
            </div>

            {Number(values.quote_tier) === 2 && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Brand Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={values.brand_color}
                        onChange={(e) => set('brand_color', e.target.value)}
                        className="h-10 w-14 rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={values.brand_color}
                        onChange={(e) => set('brand_color', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Logo URL</label>
                    <input
                      type="text"
                      value={values.logo_url}
                      onChange={(e) => set('logo_url', e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Price List</label>
                  <div className="space-y-2">
                    {values.price_list.map((entry, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={entry.item}
                          onChange={(e) => updatePriceListItem(index, 'item', e.target.value)}
                          placeholder="Item (e.g. Vinyl Banner)"
                          className={`${inputClass} flex-[2]`}
                        />
                        <input
                          type="text"
                          value={entry.unit}
                          onChange={(e) => updatePriceListItem(index, 'unit', e.target.value)}
                          placeholder="Unit (e.g. per sqm)"
                          className={`${inputClass} flex-1`}
                        />
                        <input
                          type="number"
                          value={entry.price}
                          onChange={(e) => updatePriceListItem(index, 'price', e.target.value)}
                          placeholder="Price (R)"
                          min="0"
                          step="0.01"
                          className={`${inputClass} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removePriceListItem(index)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addPriceListItem}
                    className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    + Add Price List Item
                  </button>
                  {values.price_list.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      Tier 2 needs at least one price list item — without one, quotes fall back to
                      Tier 1 behaviour.
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Quote Terms & Conditions</label>
                  <textarea
                    value={values.quote_terms}
                    onChange={(e) => set('quote_terms', e.target.value)}
                    rows={3}
                    placeholder="This quote is valid for 7 days from the date of issue. Prices are subject to change after the validity period..."
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Shown on the generated PDF. Leave blank to use the default terms.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Billing */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Billing</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass}>Monthly Fee (R)</label>
            <input
              type="number"
              name="monthly_fee"
              value={values.monthly_fee}
              onChange={handleChange}
              min="0"
              step="0.01"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Service Tier</label>
            <select
              value={values.quote_tier}
              onChange={(e) => set('quote_tier', Number(e.target.value))}
              className={inputClass}
            >
              <option value={1}>Tier 1 — Quote Assist</option>
              <option value={2}>Tier 2 — Auto PDF Quote</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Payment Status</label>
            <select name="payment_status" value={values.payment_status} onChange={handleChange} className={inputClass}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Invoice Date</label>
            <input
              type="date"
              name="invoice_date"
              value={values.invoice_date}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
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
