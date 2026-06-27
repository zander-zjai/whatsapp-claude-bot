import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientEmails } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ClientEmails() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getClientEmails()
      .then((data) => { if (!cancelled) setEmails(data); })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Failed to load emails')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <ClientLayout title="Email Receptionist">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-cream-dim">{emails.length} email(s) handled</p>
      </div>

      {loading && <LoadingSpinner label="Loading emails…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && emails.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-panel py-16 text-center text-cream-dim">
          <p className="text-lg">📧</p>
          <p className="mt-2 font-medium">No emails yet</p>
          <p className="mt-1 text-sm">
            Replies appear here once Zara handles her first email enquiry.
          </p>
        </div>
      )}

      {!loading && !error && emails.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-sm">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-panel-2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Date &amp; Time</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">From</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Subject</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Reply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {emails.map((email) => (
                <tr
                  key={email.id}
                  className="hover:bg-panel-2 cursor-pointer"
                  onClick={() => setExpanded(expanded === email.id ? null : email.id)}
                >
                  <td className="px-4 py-3 text-cream-dim whitespace-nowrap">
                    {formatDateTime(email.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-medium text-cream">
                    {email.from_name || email.from_address}
                  </td>
                  <td className="px-4 py-3 text-cream">{email.subject || '(no subject)'}</td>
                  <td className="px-4 py-3 text-cream-dim">
                    {expanded === email.id ? (
                      <span className="whitespace-pre-wrap">{email.reply_text}</span>
                    ) : (
                      <span className="line-clamp-1">{email.reply_text}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ClientLayout>
  );
}
