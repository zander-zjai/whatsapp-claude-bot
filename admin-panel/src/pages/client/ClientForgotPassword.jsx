import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clientForgotPassword } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import ErrorMessage from '../../components/ErrorMessage';

export default function ClientForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await clientForgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong — please try again'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src="/icon-192.png" alt="ZJAI" className="mb-3 h-14 w-14 rounded-xl" />
          <h1 className="text-xl font-bold text-cream">ZJAI Technologies</h1>
          <p className="text-sm text-cream-dim">Client Portal</p>
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-panel p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-cream">Reset your password</h2>

          {submitted ? (
            <p className="text-sm text-cream-dim">
              If that email is registered, we've sent a password reset link — check your inbox. The
              link is valid for 1 hour.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <ErrorMessage message={error} />
              <p className="text-sm text-cream-dim">
                Enter the email address on your account and we'll send you a link to reset your
                password.
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium text-cream-dim">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-700 disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <p className="text-center text-sm">
            <Link to="/client/login" className="text-cream-dim hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
