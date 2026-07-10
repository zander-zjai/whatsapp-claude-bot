import { useState } from 'react';
import { BUSINESS_TYPES, BOT_PERSONALITIES, SERVICE_PACKAGES } from '../utils/constants';
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
  monthly_interaction_cap: 750,
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
  price_list: [],
  logo_url: '',
  brand_color: '#1E3A8A',
  quote_terms: '',
  payment_link_url: '',
  banking_details: '',
  monthly_fee: 3000,
  payment_status: 'unpaid',
  service_package: '',
  last_invoice_date: '',
  next_invoice_date: '',
  email_receptionist_enabled: false,
  mockup_generator_enabled: false,
  email_address: '',
};

const inputClass =
  'w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelClass = 'mb-1 block text-sm font-medium text-cream-dim';

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
      monthly_interaction_cap: Number(values.monthly_interaction_cap) || 0,
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
        <p className="text-xs text-cream-dim">Last updated: {formatDateTime(updatedAt)}</p>
      )}

      {/* Business info */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Business Information</h2>
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
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">WhatsApp Configuration</h2>
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
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Claude Configuration</h2>

        <label className="mb-3 flex items-center gap-3">
          <button
            type="button"
            className="switch"
            data-on={values.use_platform_key}
            onClick={() => set('use_platform_key', !values.use_platform_key)}
          >
            <span />
          </button>
          <span className="text-sm text-cream-dim">
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
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Bot Personality</h2>
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
          <div>
            <label className={labelClass}>Monthly Interaction Cap (cost-warning threshold)</label>
            <input
              type="number"
              name="monthly_interaction_cap"
              value={values.monthly_interaction_cap}
              onChange={handleChange}
              min="0"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-cream-dim">
              Internal soft cap for the Usage tab's 80% cost warning â€” not shown to the client.
            </p>
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
          <p className="mt-1 text-xs text-cream-dim">
            Tip: include an instruction like "Always reply in the same language the customer uses."
          </p>
        </div>
      </section>

      {/* Owner & handover */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Owner & Handover</h2>
        <div>
          <label className={labelClass}>Owner / Staff WhatsApp Number(s)</label>
          <input
            type="text"
            name="owner_phone"
            value={values.owner_phone}
            onChange={handleChange}
            placeholder="+27821234567, +27821234568"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-cream-dim">
            One number, or a comma-separated list (e.g. owner + receptionist + designer). Any of
            these numbers can send <code>#takeover</code> to silence Zara for a conversation and{' '}
            <code>#release</code> to hand it back. Zara notifies all of them when a customer asks
            for a human or after-hours urgent help.
          </p>
        </div>
      </section>

      {/* Business hours */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Business Hours</h2>

        <label className="mb-3 flex items-center gap-3">
          <button
            type="button"
            className="switch"
            data-on={values.business_hours.enabled}
            onClick={() => setBusinessHours('enabled', !values.business_hours.enabled)}
          >
            <span />
          </button>
          <span className="text-sm text-cream-dim">
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
                        ? 'border-primary bg-primary text-ink'
                        : 'border-line bg-panel text-cream-dim'
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
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Quote Requests</h2>
        <label className="flex items-center gap-3">
          <button
            type="button"
            className="switch"
            data-on={values.quote_requests_enabled}
            onClick={() => set('quote_requests_enabled', !values.quote_requests_enabled)}
          >
            <span />
          </button>
          <span className="text-sm text-cream-dim">
            When customers ask for a quote, Zara collects their name, contact number, item,
            size, and quantity.
          </span>
        </label>

        {values.quote_requests_enabled && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-cream-dim">
              Zara collects the customer's details and notifies you via WhatsApp and email. If a price list is configured below, she'll also auto-generate a branded PDF quote for you to approve in the portal before it's sent to the customer.
            </p>

            {(
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Brand Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={values.brand_color}
                        onChange={(e) => set('brand_color', e.target.value)}
                        className="h-10 w-14 rounded border border-line"
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
                          className="rounded-lg border border-line px-3 py-2 text-sm text-cream-dim hover:bg-panel-2"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addPriceListItem}
                    className="mt-2 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-cream-dim hover:bg-panel-2"
                  >
                    + Add Price List Item
                  </button>
                  {values.price_list.length === 0 && (
                    <p className="mt-1 text-xs text-cream-dim">
                      Add items to enable auto PDF quote generation. Without a price list, Zara will collect the details and notify you to quote manually.
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
                  <p className="mt-1 text-xs text-cream-dim">
                    Shown on the generated PDF. Leave blank to use the default terms.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Payment Link URL</label>
                  <input
                    type="text"
                    value={values.payment_link_url}
                    onChange={(e) => set('payment_link_url', e.target.value)}
                    placeholder="https://pay.yoco.com/..."
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-cream-dim">
                    Sent to the customer when the owner approves a quote. Leave blank until a
                    payment provider is set up â€” falls back to EFT banking details below.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>EFT Banking Details</label>
                  <textarea
                    value={values.banking_details}
                    onChange={(e) => set('banking_details', e.target.value)}
                    rows={4}
                    placeholder={'Bank: \nAccount name: \nAccount number: \nBranch code: \nReference: customer name'}
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-cream-dim">
                    Fallback payment instructions sent with the quote when no payment link is set.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Email Receptionist */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Email Receptionist</h2>
        <label className="flex items-center gap-3">
          <button
            type="button"
            className="switch"
            data-on={values.email_receptionist_enabled}
            onClick={() => set('email_receptionist_enabled', !values.email_receptionist_enabled)}
          >
            <span />
          </button>
          <span className="text-sm text-cream-dim">
            Auto-replies to incoming emails using Claude, the same system prompt and price list
            as above.
          </span>
        </label>

        {values.email_receptionist_enabled && (
          <div className="mt-4">
            <label className={labelClass}>Monitored Email Address</label>
            <input
              type="email"
              value={values.email_address}
              onChange={(e) => set('email_address', e.target.value)}
              placeholder="support@clientbusiness.com"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-cream-dim">
              Save this first, then use the "Connect Gmail" button above to authorize access
              (one-time Google consent).
            </p>
          </div>
        )}
      </section>

      {/* Mockup Generator */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Mockup Generator</h2>
        <label className="flex items-center gap-3">
          <button
            type="button"
            className="switch"
            data-on={values.mockup_generator_enabled}
            onClick={() => set('mockup_generator_enabled', !values.mockup_generator_enabled)}
          >
            <span />
          </button>
          <span className="text-sm text-cream-dim">
            When a customer asks for a design preview or mockup, Zara captures the request and
            your team generates and approves a rough visual before sending it to the customer.
          </span>
        </label>
      </section>

      {/* Billing */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-cream">Billing</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <label className={labelClass}>Service Package</label>
            <select name="service_package" value={values.service_package} onChange={handleChange} className={inputClass}>
              <option value="">â€” Not set â€”</option>
              {SERVICE_PACKAGES.map((pkg) => (
                <option key={pkg.value} value={pkg.value}>
                  {pkg.label} (R{pkg.price.toLocaleString()}/mo)
                </option>
              ))}
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
            <label className={labelClass}>Last Invoice Date</label>
            <input
              type="date"
              name="last_invoice_date"
              value={values.last_invoice_date}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Next Invoice Date</label>
            <input
              type="date"
              name="next_invoice_date"
              value={values.next_invoice_date}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* Status */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <label className="flex items-center gap-3">
          <button type="button" className="switch" data-on={values.active} onClick={() => set('active', !values.active)}>
            <span />
          </button>
          <span className="text-sm font-medium text-cream-dim">
            Active {values.active ? '(bot will respond to messages)' : '(bot is paused)'}
          </span>
        </label>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-ink hover:bg-primary-700 disabled:opacity-60"
        >
          {loading ? 'Savingâ€¦' : submitLabel}
        </button>
      </div>
    </form>
  );
}

