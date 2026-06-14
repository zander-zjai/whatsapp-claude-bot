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
};

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
    use_platform_key: Boolean(picked.use_platform_key),
    active: picked.active !== undefined ? Boolean(picked.active) : DEFAULTS.active,
    quote_requests_enabled: Boolean(picked.quote_requests_enabled),
    business_hours: { ...DEFAULT_BUSINESS_HOURS, ...(picked.business_hours || {}) },
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
  if (picked.use_platform_key !== undefined) {
    picked.use_platform_key = Boolean(picked.use_platform_key);
  }
  if (picked.active !== undefined) {
    picked.active = Boolean(picked.active);
  }
  if (picked.quote_requests_enabled !== undefined) {
    picked.quote_requests_enabled = Boolean(picked.quote_requests_enabled);
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
  addClient,
  updateClient,
  deleteClient,
};
