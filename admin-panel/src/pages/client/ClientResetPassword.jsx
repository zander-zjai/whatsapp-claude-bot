import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clientResetPassword } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import ErrorMessage from '../../components/ErrorMessage';

export default function ClientResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await clientResetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/client/login', { replace: true }), 2000);
    } catch (err) {
      setError(getErrorMessage(err, 'This reset link is invalid or has expired'));
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
          <h2 className="text-lg font-semibold text-cream">Set a new password</h2>

          {!token && <ErrorMessage message="This reset link is missing its token. Please request a new one." />}

          {success ? (
            <p className="text-sm text-cream-dim">
              Your password has been reset. Redirecting you to sign in…
            </p>
          ) : (
            token && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <ErrorMessage message={error} />
                <div>
                  <label className="mb-1 block text-sm font-medium text-cream-dim">New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-cream-dim">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-700 disabled:opacity-60"
                >
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
              </form>
            )
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
