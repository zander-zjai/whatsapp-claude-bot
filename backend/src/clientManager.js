'use strict';

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./fileStore');

const CLIENTS_FILE = 'clients.json';

// Fields the Add/Edit Client form always sends. Anything else on the
// incoming object is ignored so callers can't inject arbitrary keys.
const EDITABLE_FIELDS = [
  'name',
  'business_type',
  'contact_person',
  'contact_email',
  'contact_phone',
  'phone_number_id',
  'whatsapp_token',
  'claude_api_key',
  'use_platform_key',
  'monthly_message_limit',
  'bot_personality',
  'bot_name',
  'system_prompt',
  'active',
  'owner_phone',
  'business_hours',
  'quote_requests_enabled',
  'price_list',
  'logo_url',
  'brand_color',
  'quote_terms',
  'monthly_fee',
  'payment_status',
  'service_package',
  'last_invoice_date',
  'next_invoice_date',
  'onboarding_checklist',
  'banking_details',
  'payment_link_url',
  'google_calendar_enabled',
  'google_client_id',
  'google_client_secret',
  'google_refresh_token',
  'google_calendar_id',
  'team_members',
  'monthly_interaction_cap',
  'email_receptionist_enabled',
  'email_address',
  'gmail_refresh_token',
  'default_margin',
  'customer_margins',
  'mockup_generator_enabled',
];

const REQUIRED_FIELDS = [
  'name',
  'contact_person',
  'contact_email',
  'contact_phone',
  'phone_number_id',
  'whatsapp_token',
  'system_prompt',
];

// Fresh-copied per client in addClient/updateClient so clients never share
// the same nested object reference.
const DEFAULT_BUSINESS_HOURS = {
  enabled: false,
  timezone: 'Africa/Johannesburg',
  open: '08:00',
  close: '17:00',
  days: [1, 2, 3, 4, 5],
};

// Fresh-copied per client in addClient/updateClient so clients never share
// the same nested object reference.
const DEFAULT_ONBOARDING_CHECKLIST = {
  whatsapp_configured: false,
  system_prompt_set: false,
  business_hours_set: false,
  owner_notifications_on: false,
  first_payment_received: false,
};

const DEFAULTS = {
  business_type: 'Other',
  use_platform_key: false,
  claude_api_key: '',
  monthly_message_limit: 1000,
  bot_personality: 'Professional',
  bot_name: 'Assistant',
  active: true,
  owner_phone: '',
  quote_requests_enabled: false,
  price_list: [],
  logo_url: '',
  brand_color: '#1E3A8A',
  quote_terms: '',
  client_password: null,
  monthly_fee: 3000,
  payment_status: 'unpaid',
  service_package: '',
  last_invoice_date: '',
  next_invoice_date: '',
  google_calendar_enabled: false,
  google_client_id: '',
  google_client_secret: '',
  google_refresh_token: '',
  google_calendar_id: '',
  team_members: [],
  monthly_interaction_cap: 750,
  email_receptionist_enabled: false,
  email_address: '',
  gmail_refresh_token: '',
  default_margin: 0,
  customer_margins: [],
  mockup_generator_enabled: false,
};

// Google Calendar event colorId values 1-11 (Lavender, Sage, Grape, Flamingo,
// Banana, Tangerine, Peacock, Graphite, Blueberry, Basil, Tomato). Cycled
// through as team members are added so each gets a distinct color without
// the admin panel needing a color picker.
const CALENDAR_COLOR_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

/**
 * Coerce arbitrary input into a clean team member list: an array of
 * { name, color_id }, auto-assigning a colorId (cycling through
 * CALENDAR_COLOR_IDS) to any entry missing one. Entries without a name are
 * dropped.
 */
function sanitizeTeamMembers(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry, index) => ({
      name: String((entry && entry.name) || '').trim(),
      color_id: String((entry && entry.color_id) || '').trim() || CALENDAR_COLOR_IDS[index % CALENDAR_COLOR_IDS.length],
    }))
    .filter((entry) => entry.name);
}

// Fields a client can change themselves via PUT /client/settings. Notably
// excludes phone_number_id, whatsapp_token, claude_api_key, quote_tier, etc.
// â€” those remain owner (admin)-only.
const CLIENT_PORTAL_SETTINGS_FIELDS = [
  'business_hours',
  'system_prompt',
  'bot_personality',
  'bot_name',
  'contact_person',
  'contact_email',
  'contact_phone',
  'banking_details',
  'payment_link_url',
];

/**
 * Coerce arbitrary input into a clean price list: an array of
 * { item, unit, price } with strings trimmed and price numeric. Entries
 * without an item name are dropped.
 */
function sanitizePriceList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => ({
      item: String((entry && entry.item) || '').trim(),
      unit: String((entry && entry.unit) || '').trim(),
      price: Number(entry && entry.price) || 0,
    }))
    .filter((entry) => entry.item);
}

// In-memory cache of clients, keyed for fast lookup by phone_number_id.
let clients = [];

/**
 * Read clients.json from disk and load it into memory, creating it with an
 * empty client list if it doesn't exist yet (fresh deploy / empty volume).
 * Throws if the file exists but is malformed so the server fails loudly at
 * startup rather than silently serving zero clients.
 */
function loadClients() {
  const parsed = readJSON(CLIENTS_FILE, { clients: [] });

  if (!parsed || !Array.isArray(parsed.clients)) {
    throw new Error('clients.json must contain a top-level "clients" array');
  }

  clients = parsed.clients;
  return clients;
}

/** Return every loaded client (active and inactive). */
function getAllClients() {
  return clients;
}

/** Return only active clients. */
function getActiveClients() {
  return clients.filter((c) => c.active === true);
}

/** Find a client by its internal id. Returns undefined if not found. */
function getClientById(id) {
  return clients.find((c) => c.id === id);
}

/**
 * Find an ACTIVE client by the WhatsApp phone_number_id that Meta sends
 * in the webhook payload. Returns undefined if no active match exists.
 */
function getClientByPhoneNumberId(phoneNumberId) {
  return clients.find(
    (c) => c.active === true && String(c.phone_number_id) === String(phoneNumberId)
  );
}

/** Find a client by their portal login email (contact_email), case-insensitive. */
function getClientByEmail(email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return undefined;
  return clients.find((c) => String(c.contact_email || '').toLowerCase() === target);
}

/** Build a URL-safe id from the business name plus a short random suffix. */
function generateClientId(name) {
  const slug =
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30) || 'client';

  let id;
  do {
    id = `${slug}_${crypto.randomBytes(3).toString('hex')}`;
  } while (clients.some((c) => c.id === id));

  return id;
}

function validateClientData(data, { isUpdate = false, currentId = null } = {}) {
  if (!isUpdate) {
    const missing = REQUIRED_FIELDS.filter((field) => !data[field]);
    if (missing.length > 0) {
      const err = new Error(`Missing required field(s): ${missing.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const usePlatformKey = data.use_platform_key === true;
    if (!usePlatformKey && !data.claude_api_key) {
      const err = new Error(
        'claude_api_key is required unless use_platform_key is true'
      );
      err.statusCode = 400;
      throw err;
    }
  }

  if (data.phone_number_id !== undefined) {
    const clash = clients.find(
      (c) =>
        c.id !== currentId &&
        String(c.phone_number_id) === String(data.phone_number_id)
    );
    if (clash) {
      const err = new Error(
        `A client with phone_number_id "${data.phone_number_id}" already exists`
      );
      err.statusCode = 409;
      throw err;
    }
  }
}

/** Pick only the editable fields out of an arbitrary input object. */
function pickEditableFields(data) {
  const result = {};
  for (const field of EDITABLE_FIELDS) {
    if (data[field] !== undefined) {
      result[field] = data[field];
    }
  }
  return result;
}

/**
 * Create a new client, auto-generating its id, applying defaults, and
 * persisting clients.json. Returns the newly created client object.
 */
function addClient(data) {
  validateClientData(data, { isUpdate: false });

  const picked = pickEditableFields(data);
  const now = new Date().toISOString();

  const newClient = {
    id: generateClientId(data.name),
    ...DEFAULTS,
    ...picked,
    phone_number_id: String(picked.phone_number_id),
    monthly_message_limit: Number(
      picked.monthly_message_limit ?? DEFAULTS.monthly_message_limit
    ),
    monthly_interaction_cap: Number(
      picked.monthly_interaction_cap ?? DEFAULTS.monthly_interaction_cap
    ),
    use_platform_key: Boolean(picked.use_platform_key),
    active: picked.active !== undefined ? Boolean(picked.active) : DEFAULTS.active,
    quote_requests_enabled: Boolean(picked.quote_requests_enabled),
    price_list: sanitizePriceList(picked.price_list),
    team_members: sanitizeTeamMembers(picked.team_members),
    business_hours: { ...DEFAULT_BUSINESS_HOURS, ...(picked.business_hours || {}) },
    onboarding_checklist: { ...DEFAULT_ONBOARDING_CHECKLIST, ...(picked.onboarding_checklist || {}) },
    monthly_fee: Number(picked.monthly_fee ?? DEFAULTS.monthly_fee) || 0,
    payment_status: picked.payment_status === 'paid' ? 'paid' : 'unpaid',
    created_at: now,
    updated_at: now,
  };

  clients.push(newClient);
  persist();
  return newClient;
}

/**
 * Update an existing client by id. Only fields present in `data` are
 * changed. Returns the updated client, or undefined if no client matches.
 */
function updateClient(id, data) {
  const client = getClientById(id);
  if (!client) return undefined;

  validateClientData(data, { isUpdate: true, currentId: id });

  const picked = pickEditableFields(data);

  if (picked.phone_number_id !== undefined) {
    picked.phone_number_id = String(picked.phone_number_id);
  }
  if (picked.monthly_message_limit !== undefined) {
    picked.monthly_message_limit = Number(picked.monthly_message_limit);
  }
  if (picked.monthly_interaction_cap !== undefined) {
    picked.monthly_interaction_cap = Number(picked.monthly_interaction_cap);
  }
  if (picked.use_platform_key !== undefined) {
    picked.use_platform_key = Boolean(picked.use_platform_key);
  }
  if (picked.active !== undefined) {
    picked.active = Boolean(picked.active);
  }
  if (picked.quote_requests_enabled !== undefined) {
    picked.quote_requests_enabled = Boolean(picked.quote_requests_enabled);
  }
  if (picked.price_list !== undefined) {
    picked.price_list = sanitizePriceList(picked.price_list);
  }
  if (picked.team_members !== undefined) {
    picked.team_members = sanitizeTeamMembers(picked.team_members);
  }
  if (picked.business_hours !== undefined) {
    picked.business_hours = {
      ...DEFAULT_BUSINESS_HOURS,
      ...client.business_hours,
      ...picked.business_hours,
    };
  }
  if (picked.monthly_fee !== undefined) {
    picked.monthly_fee = Number(picked.monthly_fee) || 0;
  }
  if (picked.payment_status !== undefined) {
    picked.payment_status = picked.payment_status === 'paid' ? 'paid' : 'unpaid';
  }
  if (picked.onboarding_checklist !== undefined) {
    picked.onboarding_checklist = {
      ...DEFAULT_ONBOARDING_CHECKLIST,
      ...client.onboarding_checklist,
      ...picked.onboarding_checklist,
    };
  }

  Object.assign(client, picked, { updated_at: new Date().toISOString() });
  persist();
  return client;
}

/**
 * Strip fields the client portal must never expose: WhatsApp/Claude
 * credentials and the portal password hash.
 */
function sanitizeClientForPortal(client) {
  const {
    whatsapp_token,
    claude_api_key,
    client_password,
    reset_token,
    reset_token_expires_at,
    google_client_secret,
    google_refresh_token,
    gmail_refresh_token,
    monthly_interaction_cap,
    ...safe
  } = client;
  return safe;
}

/**
 * Update the subset of settings a client can change themselves via the
 * client portal (business hours, system prompt, personality, contact
 * details). Never touches phone_number_id, whatsapp_token, claude_api_key,
 * quote_tier, price_list, active, etc. â€” those stay owner-only.
 */
function updatePortalSettings(id, data) {
  const client = getClientById(id);
  if (!client) return undefined;

  const picked = {};
  for (const field of CLIENT_PORTAL_SETTINGS_FIELDS) {
    if (data[field] !== undefined) {
      picked[field] = data[field];
    }
  }

  if (picked.contact_email !== undefined) {
    const target = String(picked.contact_email).trim().toLowerCase();
    const clash = clients.find(
      (c) => c.id !== id && String(c.contact_email || '').toLowerCase() === target
    );
    if (clash) {
      const err = new Error('Another client already uses this email');
      err.statusCode = 409;
      throw err;
    }
  }

  if (picked.business_hours !== undefined) {
    picked.business_hours = {
      ...DEFAULT_BUSINESS_HOURS,
      ...client.business_hours,
      ...picked.business_hours,
    };
  }

  Object.assign(client, picked, { updated_at: new Date().toISOString() });
  persist();
  return client;
}

/**
 * Replace a Tier 2 client's price list (the only thing the client portal's
 * Price List page can change). Returns undefined if no client matches.
 */
function updatePriceList(id, priceList) {
  const client = getClientById(id);
  if (!client) return undefined;

  client.price_list = sanitizePriceList(priceList);
  client.updated_at = new Date().toISOString();
  persist();
  return client;
}

/** Set a client's portal password to an already-hashed value. */
function setClientPasswordHash(id, hash) {
  const client = getClientById(id);
  if (!client) return undefined;

  client.client_password = hash;
  client.updated_at = new Date().toISOString();
  persist();
  return client;
}

// ------------------------------------------------------------------
// Customer margin helpers â€” stored as client.customer_margins, an array of
// { id, label, phone_number, email, margin_percent, created_at } records.
// Matching is by phone_number (normalised) for WhatsApp/voice, or by email
// (case-insensitive) for email-channel quotes. Either field is optional but
// at least one must be set.
// ------------------------------------------------------------------

const { normalizeNumber: _normalize } = require('./phone');

function _isEmail(s) { return String(s || '').includes('@'); }

/**
 * Resolve the margin percentage to apply for a given customer identifier
 * (phone number or email address).
 *
 * @returns {{ marginPercent: number, marginId: string|null }}
 */
function resolveMarginForCustomer(client, customerIdentifier) {
  const margins = Array.isArray(client.customer_margins) ? client.customer_margins : [];
  const id = String(customerIdentifier || '');
  let match;
  if (_isEmail(id)) {
    const lower = id.toLowerCase();
    match = margins.find((m) => m.email && String(m.email).toLowerCase() === lower);
  } else {
    const normalized = _normalize(id);
    match = margins.find((m) => m.phone_number && _normalize(String(m.phone_number)) === normalized);
  }
  if (match) return { marginPercent: Number(match.margin_percent) || 0, marginId: match.id };
  return { marginPercent: Number(client.default_margin) || 0, marginId: null };
}

/** Add or update a customer margin record. Matches existing records by phone_number
 *  or email. At least one of phone_number / email must be supplied. */
function addCustomerMargin(clientId, { label, phone_number, email, margin_percent }) {
  const client = getClientById(clientId);
  if (!client) return undefined;

  if (!Array.isArray(client.customer_margins)) client.customer_margins = [];

  const normalizedPhone = phone_number ? _normalize(String(phone_number)) : null;
  const normalizedEmail = email ? String(email).toLowerCase() : null;

  const existing = client.customer_margins.find((m) => {
    if (normalizedPhone && m.phone_number && _normalize(String(m.phone_number)) === normalizedPhone) return true;
    if (normalizedEmail && m.email && String(m.email).toLowerCase() === normalizedEmail) return true;
    return false;
  });

  if (existing) {
    if (label !== undefined) existing.label = label || existing.label;
    existing.margin_percent = Number(margin_percent) || 0;
    if (phone_number !== undefined) existing.phone_number = phone_number || existing.phone_number || '';
    if (email !== undefined) existing.email = email || existing.email || '';
    existing.updated_at = new Date().toISOString();
  } else {
    client.customer_margins.push({
      id: require('crypto').randomUUID(),
      label: label || '',
      phone_number: phone_number || '',
      email: email || '',
      margin_percent: Number(margin_percent) || 0,
      created_at: new Date().toISOString(),
    });
  }

  client.updated_at = new Date().toISOString();
  persist();
  return client.customer_margins;
}

/** Update specific fields on an existing margin record by id. */
function updateCustomerMargin(clientId, marginId, fields) {
  const client = getClientById(clientId);
  if (!client || !Array.isArray(client.customer_margins)) return undefined;
  const record = client.customer_margins.find((m) => m.id === marginId);
  if (!record) return undefined;
  const allowed = ['label', 'phone_number', 'email', 'margin_percent'];
  for (const key of allowed) {
    if (fields[key] !== undefined) record[key] = key === 'margin_percent' ? Number(fields[key]) || 0 : fields[key];
  }
  record.updated_at = new Date().toISOString();
  client.updated_at = new Date().toISOString();
  persist();
  return client.customer_margins;
}

/** Remove a customer margin by its id. */
function removeCustomerMargin(clientId, marginId) {
  const client = getClientById(clientId);
  if (!client || !Array.isArray(client.customer_margins)) return undefined;

  client.customer_margins = client.customer_margins.filter((m) => m.id !== marginId);
  client.updated_at = new Date().toISOString();
  persist();
  return client.customer_margins;
}

/** Store a portal-password reset token + expiry (ISO string) for a client. */
function setResetToken(id, token, expiresAt) {
  const client = getClientById(id);
  if (!client) return undefined;

  client.reset_token = token;
  client.reset_token_expires_at = expiresAt;
  persist();
  return client;
}

/** Clear a client's reset token (used once, or expired/invalidated). */
function clearResetToken(id) {
  const client = getClientById(id);
  if (!client) return undefined;

  client.reset_token = null;
  client.reset_token_expires_at = null;
  persist();
  return client;
}

/** Find a client by an unexpired reset token. Returns undefined if not found or expired. */
function getClientByResetToken(token) {
  if (!token) return undefined;
  return clients.find(
    (c) =>
      c.reset_token === token &&
      c.reset_token_expires_at &&
      new Date(c.reset_token_expires_at).getTime() > Date.now()
  );
}

/**
 * Remove a client by id. Returns true if a client was removed, false if
 * no client matched the given id.
 */
function deleteClient(id) {
  const index = clients.findIndex((c) => c.id === id);
  if (index === -1) return false;

  clients.splice(index, 1);
  persist();
  return true;
}

/** Write the current in-memory clients array back to clients.json. */
function persist() {
  writeJSON(CLIENTS_FILE, { clients });
}

module.exports = {
  loadClients,
  getAllClients,
  getActiveClients,
  getClientById,
  getClientByPhoneNumberId,
  getClientByEmail,
  addClient,
  updateClient,
  deleteClient,
  sanitizeClientForPortal,
  updatePortalSettings,
  updatePriceList,
  setClientPasswordHash,
  setResetToken,
  clearResetToken,
  getClientByResetToken,
  resolveMarginForCustomer,
  addCustomerMargin,
  updateCustomerMargin,
  removeCustomerMargin,
};

