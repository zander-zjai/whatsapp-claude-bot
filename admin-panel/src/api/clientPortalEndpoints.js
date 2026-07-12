import { clientPortalApi } from './clientPortalClient';

// --- Auth ---
export const clientLogin = (email, password) =>
  clientPortalApi.post('/client/login', { email, password }).then((r) => r.data);

export const clientForgotPassword = (email) =>
  clientPortalApi.post('/client/forgot-password', { email }).then((r) => r.data);

export const clientResetPassword = (token, password) =>
  clientPortalApi.post('/client/reset-password', { token, password }).then((r) => r.data);

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

export const getClientQuote = (id) => clientPortalApi.get(`/client/quotes/${id}`).then((r) => r.data.quote);

export const updateClientQuote = (id, data) =>
  clientPortalApi.patch(`/client/quotes/${id}`, data).then((r) => r.data.quote);

export const getClientQuoteAnalytics = () =>
  clientPortalApi.get('/client/quotes/analytics').then((r) => r.data.analytics);

export const getClientCustomers = () =>
  clientPortalApi.get('/client/customers').then((r) => r.data);

export const getCustomerQuoteHistory = (identifier) =>
  clientPortalApi.get(`/client/customers/${encodeURIComponent(identifier)}/quotes`).then((r) => r.data);

// --- Customer margins ---
export const getClientMargins = () => clientPortalApi.get('/client/margins').then((r) => r.data);

export const addClientMargin = (data) =>
  clientPortalApi.post('/client/margins', data).then((r) => r.data.margins);

export const deleteClientMargin = (id) =>
  clientPortalApi.delete(`/client/margins/${id}`).then((r) => r.data.margins);

export const updateClientMargin = (id, data) =>
  clientPortalApi.patch(`/client/margins/${id}`, data).then((r) => r.data.margins);

export const updateDefaultMargin = (marginPercent) =>
  clientPortalApi.patch('/client/margins/default', { margin_percent: marginPercent }).then((r) => r.data);

export const getClientQuotePdfBlob = (id) =>
  clientPortalApi.get(`/client/quotes/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);

export const getClientQuoteAttachments = (id) =>
  clientPortalApi.get(`/client/quotes/${id}/attachments`).then((r) => r.data.attachments);

// Attachment files require the client's auth header, so they're fetched as
// blobs (like the PDF download) rather than used directly as <img src>.
export const getClientAttachmentBlob = (attachmentId) =>
  clientPortalApi.get(`/client/attachments/${attachmentId}/file`, { responseType: 'blob' }).then((r) => r.data);

// --- Price list (Tier 2 only) ---
export const getClientPriceList = () => clientPortalApi.get('/client/pricelist').then((r) => r.data);

export const updateClientPriceList = (priceList) =>
  clientPortalApi.put('/client/pricelist', { price_list: priceList }).then((r) => r.data.price_list);

// --- Call logs ---
export const getClientCallLogs = () =>
  clientPortalApi.get('/client/calls').then((r) => r.data.calls || []);

export const markCallbackDone = (callId) =>
  clientPortalApi.patch(`/client/calls/${callId}/callback-done`).then((r) => r.data);

// --- Email Receptionist ---
export const getClientEmails = () =>
  clientPortalApi.get('/client/emails').then((r) => r.data.emails || []);

// --- Settings ---
export const getClientSettings = () =>
  clientPortalApi.get('/client/settings').then((r) => r.data.settings);

export const updateClientSettings = (data) =>
  clientPortalApi.put('/client/settings', data).then((r) => r.data.settings);

// --- Send message (owner reply) ---
export const sendClientMessage = (customerNumber, message) =>
  clientPortalApi.post('/client/send-message', { customer_number: customerNumber, message }).then((r) => r.data);

// --- Mockups ---
export const getClientMockups = () =>
  clientPortalApi.get('/client/mockups').then((r) => r.data.mockups || []);

export const updateClientMockup = (id, data) =>
  clientPortalApi.patch(`/client/mockups/${id}`, data).then((r) => r.data.mockup);

// Returns the URL string for direct use (auth is handled via blob fetch in the component)
export const getClientMockupImageUrl = (id) => `/client/mockups/${id}/image`;

export const reviseClientMockup = (id, data) =>
  clientPortalApi.post(`/client/mockups/${id}/revise`, data).then((r) => r.data.mockup);

export const getClientMockupPresets = () =>
  clientPortalApi.get('/client/mockups/presets').then((r) => r.data);

// Send a linked mockup image + quote PDF to the customer in one action
export const sendQuoteAndMockup = (quoteId, mockupId, eta) =>
  clientPortalApi.post('/client/send-both', { quote_id: quoteId, mockup_id: mockupId, eta }).then((r) => r.data);

export const getClientMockupVersionImageBlob = (id, version) =>
  clientPortalApi
    .get(`/client/mockups/${id}/image`, { params: { version }, responseType: 'blob' })
    .then((r) => r.data);

