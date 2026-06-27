import { apiClient } from './client';

// --- Auth ---
export const login = (username, password) =>
  apiClient.post('/admin/login', { username, password }).then((r) => r.data);

// --- Health ---
export const getHealth = () => apiClient.get('/health').then((r) => r.data);

// --- Clients ---
export const getClients = () => apiClient.get('/admin/clients').then((r) => r.data.clients);

export const getClient = (id) => apiClient.get(`/admin/clients/${id}`).then((r) => r.data.client);

export const addClient = (data) => apiClient.post('/admin/clients', data).then((r) => r.data);

export const updateClient = (id, data) =>
  apiClient.put(`/admin/clients/${id}`, data).then((r) => r.data.client);

export const deleteClient = (id) => apiClient.delete(`/admin/clients/${id}`).then((r) => r.data);

// --- Logs ---
export const getClientLogs = (id, params = {}) =>
  apiClient.get(`/admin/clients/${id}/logs`, { params }).then((r) => r.data.logs);

// --- Stats ---
export const getStats = () => apiClient.get('/admin/stats').then((r) => r.data);

// --- Settings ---
export const getSettings = () => apiClient.get('/admin/settings').then((r) => r.data.settings);

export const updateSettings = (data) =>
  apiClient.put('/admin/settings', data).then((r) => r.data.settings);

// --- Conversations ---
export const getConversations = (params = {}) =>
  apiClient.get('/admin/conversations', { params }).then((r) => r.data.conversations);

export const setConversationHandover = (clientId, customerNumber, active) =>
  apiClient
    .post('/admin/conversations/handover', { client_id: clientId, customer_number: customerNumber, active })
    .then((r) => r.data.conversation);

// --- Usage & cost tracking ---
export const getClientUsage = (id) => apiClient.get(`/admin/clients/${id}/usage`).then((r) => r.data);

export const getUsageSummary = () =>
  apiClient.get('/admin/usage/summary').then((r) => r.data.summary);

// --- Quote requests ---
export const getQuotes = (params = {}) =>
  apiClient.get('/admin/quotes', { params }).then((r) => r.data.quotes);

export const getQuotePdfBlob = (id) =>
  apiClient.get(`/admin/quotes/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);

// --- Email Receptionist ---
export const getGmailAuthUrl = (clientId) =>
  apiClient.post(`/admin/clients/${clientId}/gmail-auth-url`).then((r) => r.data.url);
