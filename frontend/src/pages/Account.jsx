import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  IoShieldCheckmarkOutline,
  IoDocumentTextOutline,
  IoPersonOutline,
  IoTimeOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoLockClosedOutline,
} from 'react-icons/io5';
import API_URL from '../config/api';

const Account = () => {
  const { user } = useSelector((state) => state.auth);

  const [kycStatus, setKycStatus]   = useState('loading'); // loading | none | pending | approved | rejected
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  // Controlled form state
  const [fullName,       setFullName]       = useState('');
  const [dob,            setDob]            = useState('');
  const [documentType,   setDocumentType]   = useState('passport');
  const [documentNumber, setDocumentNumber] = useState('');
  const [file,           setFile]           = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100

  // Change-password state
  const [pwCurrent,  setPwCurrent]  = useState('');
  const [pwNew,      setPwNew]      = useState('');
  const [pwConfirm,  setPwConfirm]  = useState('');
  const [pwLoading,  setPwLoading]  = useState(false);
  const [pwError,    setPwError]    = useState('');
  const [pwSuccess,  setPwSuccess]  = useState(false);

  // Load existing KYC status on mount
  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/api/kyc/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setKycStatus(data.status ?? 'none'))
      .catch(() => setKycStatus('none'));
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUploadProgress(0);

    if (!file) {
      setError('Please select a document to upload.');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Get a presigned S3 PUT URL from our backend
      const urlRes = await fetch(
        `${API_URL}/api/kyc/upload-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        { credentials: 'include' }
      );
      const { uploadUrl, key, error: urlErr } = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlErr || 'Failed to get upload URL');

      // Step 2: Upload the file directly to S3 (never touches our server)
      setUploadProgress(10);
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('File upload to S3 failed');
      setUploadProgress(80);

      // Step 3: Submit the KYC form with the S3 key
      const submitRes = await fetch(`${API_URL}/api/kyc/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name:       fullName,
          date_of_birth:   dob,
          document_type:   documentType,
          document_number: documentNumber,
          document_key:    key,
        }),
      });
      const data = await submitRes.json();
      if (!submitRes.ok) throw new Error(data.error || 'Submission failed');

      setUploadProgress(100);
      setKycStatus('pending');
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(''); setPwSuccess(false);
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match'); return; }
    setPwLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || 'Failed to change password'); }
      else { setPwSuccess(true); setPwCurrent(''); setPwNew(''); setPwConfirm(''); }
    } catch { setPwError('Network error. Please try again.'); }
    finally { setPwLoading(false); }
  };

  if (kycStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0b0c0e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00D68F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-white pt-4 px-4 pb-20 flex flex-col items-center">

      {/* Header */}
      <div className="w-full max-w-3xl mt-10 mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#00D68F]/10 mb-4">
          <IoShieldCheckmarkOutline className="text-[#00D68F]" size={32} />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3 text-white">Account Verification</h1>
        <p className="text-gray-400">
          Complete your KYC verification to unlock trading and increase withdrawal limits.
        </p>
      </div>

      <div className="w-full max-w-3xl bg-[#181a20] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8">

          {/* ── APPROVED ── */}
          {kycStatus === 'approved' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-24 h-24 bg-[#00D68F]/10 rounded-full flex items-center justify-center mb-6 border border-[#00D68F]/20">
                <IoCheckmarkCircle className="text-[#00D68F]" size={48} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Verification Approved</h2>
              <p className="text-gray-400 max-w-md">
                Your identity has been verified. You have full access to all trading features.
              </p>
            </div>
          )}

          {/* ── PENDING ── */}
          {kycStatus === 'pending' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-24 h-24 bg-yellow-500/10 rounded-full flex items-center justify-center mb-6 border border-yellow-500/20">
                <IoTimeOutline className="text-yellow-500" size={48} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Verification Under Review</h2>
              <p className="text-gray-400 max-w-md leading-relaxed">
                Your documents are being reviewed by our compliance team.
                This usually takes <strong className="text-white">1–3 business days</strong>.
                We will notify you via email once complete.
              </p>
            </div>
          )}

          {/* ── REJECTED — allow re-submission ── */}
          {kycStatus === 'rejected' && (
            <div className="mb-6 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <IoCloseCircle className="text-red-400 mt-0.5 shrink-0" size={20} />
              <div>
                <p className="text-red-400 font-semibold text-sm">Verification Rejected</p>
                <p className="text-gray-400 text-sm mt-1">
                  Your previous submission was not accepted. Please re-submit with a clear, valid document.
                </p>
              </div>
            </div>
          )}

          {/* ── KYC FORM (none or rejected) ── */}
          {(kycStatus === 'none' || kycStatus === 'rejected') && (
            <>
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <IoPersonOutline className="text-[#00D68F]" />
                Personal Details
              </h2>

              {error && (
                <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form className="flex flex-col gap-6" onSubmit={handleSubmit}>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-gray-300">Full Legal Name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g., John Doe"
                      className="bg-[#0b0c0e] border border-white/[0.1] rounded-lg p-3 text-white focus:outline-none focus:border-[#00D68F] transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-gray-300">Date of Birth</label>
                    <input
                      type="date"
                      required
                      value={dob}
                      onChange={e => setDob(e.target.value)}
                      className="bg-[#0b0c0e] border border-white/[0.1] rounded-lg p-3 text-white focus:outline-none focus:border-[#00D68F] transition-colors [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div className="w-full h-px bg-white/[0.05]" />

                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <IoDocumentTextOutline className="text-[#00D68F]" />
                  Identity Verification
                </h2>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-300">Document Type</label>
                  <select
                    value={documentType}
                    onChange={e => setDocumentType(e.target.value)}
                    className="bg-[#0b0c0e] border border-white/[0.1] rounded-lg p-3 text-white focus:outline-none focus:border-[#00D68F] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="passport">Passport</option>
                    <option value="national_id">National ID Card</option>
                    <option value="driver_license">Driver&apos;s License</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-300">Document Number</label>
                  <input
                    type="text"
                    required
                    value={documentNumber}
                    onChange={e => setDocumentNumber(e.target.value)}
                    placeholder="Enter ID number"
                    className="bg-[#0b0c0e] border border-white/[0.1] rounded-lg p-3 text-white focus:outline-none focus:border-[#00D68F] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-300">Upload Document Proof</label>
                  <div className="border-2 border-dashed border-white/[0.1] rounded-xl p-6 text-center hover:border-[#00D68F]/50 transition-colors bg-[#0b0c0e]/50">
                    <input
                      type="file"
                      required
                      accept=".png,.jpg,.jpeg,.pdf"
                      onChange={e => setFile(e.target.files[0] || null)}
                      className="block w-full text-sm text-gray-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-[#00D68F]/10 file:text-[#00D68F]
                        hover:file:bg-[#00D68F]/20 cursor-pointer"
                    />
                    <p className="text-xs text-gray-500 mt-3">PNG, JPG, or PDF — max 5 MB</p>
                    {file && <p className="text-xs text-[#00D68F] mt-1">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
                    {loading && uploadProgress > 0 && (
                      <div className="mt-3 w-full">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{uploadProgress < 80 ? 'Uploading to S3…' : uploadProgress < 100 ? 'Submitting…' : 'Done!'}</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-1.5">
                          <div
                            className="bg-[#00D68F] h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 bg-[#00D68F] text-black font-bold text-lg py-4 rounded-xl hover:bg-[#00bd7e] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-[0_0_20px_-5px_rgba(0,214,143,0.3)]"
                >
                  {loading ? 'Submitting…' : 'Submit for Verification'}
                </button>
              </form>
            </>
          )}

        </div>
      </div>

      {/* ── Change Password ── */}
      <div className="w-full max-w-3xl mt-6 bg-[#181a20] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <IoLockClosedOutline className="text-[#00D68F]" />
            Change Password
          </h2>

          {pwError && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{pwError}</div>
          )}
          {pwSuccess && (
            <div className="mb-4 px-4 py-3 bg-[#00D68F]/10 border border-[#00D68F]/20 rounded-lg text-[#00D68F] text-sm font-semibold">
              Password changed successfully.
            </div>
          )}

          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-300">Current Password</label>
              <input
                type="password"
                required
                value={pwCurrent}
                onChange={e => setPwCurrent(e.target.value)}
                placeholder="Enter current password"
                className="bg-[#0b0c0e] border border-white/[0.1] rounded-lg p-3 text-white focus:outline-none focus:border-[#00D68F] transition-colors"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-300">New Password</label>
                <input
                  type="password"
                  required
                  value={pwNew}
                  onChange={e => setPwNew(e.target.value)}
                  placeholder="Min 8 chars, uppercase, number, symbol"
                  className="bg-[#0b0c0e] border border-white/[0.1] rounded-lg p-3 text-white focus:outline-none focus:border-[#00D68F] transition-colors"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-300">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  className="bg-[#0b0c0e] border border-white/[0.1] rounded-lg p-3 text-white focus:outline-none focus:border-[#00D68F] transition-colors"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={pwLoading}
              className="mt-2 bg-[#00D68F] text-black font-bold text-base py-3 rounded-xl hover:bg-[#00bd7e] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {pwLoading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>

    </div>
  );
};

export default Account;
