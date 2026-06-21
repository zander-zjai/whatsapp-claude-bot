import { clientPortalApi } from './clientPortalClient';

// --- Auth ---
export const clientLogin = (email, password) =>
  clientPortalApi.post('/client/login', { email, password }).then((r) => r.data);

// --- Dashboard ---
export const getClientMe = () => clientPortalApi.get('/client/me').then((r) => r.data);

// --- Conversations ---
export const getClientConversations = () =>
  clientPortalApi.get('/client/conversations').then((r) => r.data.conversations);

export const getClientConversation = (customerNumber) =>
  clientPortalApi
    .get(`/client/conversations/${encodeURIComponent(customerNumber)}`)
    .then((r) => r.data);

export const setClientConversationHandover = (customerNumber, active) =>
  clientPortalApi
    .post('/client/conversations/handover', { customer_number: customerNumber, active })
    .then((r) => r.data.conversation);

export const setClientConversationPriority = (customerNumber, priority) =>
  clientPortalApi
    .post('/client/conversations/priority', { customer_number: customerNumber, priority: priority || 'none' })
    .then((r) => r.data.conversation);

// --- Quote requests ---
export const getClientQuotes = () => clientPortalApi.get('/client/quotes').then((r) => r.data.quotes);

export const updateClientQuote = (id, data) =>
  clientPortalApi.patch(`/client/quotes/${id}`, data).then((r) => r.data.quote);

export const getClientQuotePdfBlob = (id) =>
  clientPortalApi.get(`/client/quotes/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);

// --- Price list (Tier 2 only) ---
export const getClientPriceList = () => clientPortalApi.get('/client/pricelist').then((r) => r.data);

export const updateClientPriceList = (priceList) =>
  clientPortalApi.put('/client/pricelist', { price_list: priceList }).then((r) => r.data.price_list);

// --- Call logs ---
export const getClientCallLogs = () =>
  clientPortalApi.get('/client/calls').then((r) => r.data.calls || []);

// --- Settings ---
export const getClientSettings = () =>
  clientPortalApi.get('/client/settings').then((r) => r.data.settings);

export const updateClientSettings = (data) =>
  clientPortalApi.put('/client/settings', data).then((r) => r.data.settings);
