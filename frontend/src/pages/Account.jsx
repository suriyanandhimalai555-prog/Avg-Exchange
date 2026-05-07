import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  IoShieldCheckmarkOutline,
  IoDocumentTextOutline,
  IoPersonOutline,
  IoTimeOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoLockClosedOutline,
  IoMailOutline,
  IoCalendarOutline,
  IoPeopleOutline,
  IoCopyOutline,
} from 'react-icons/io5';
import API_URL from '../config/api';

const Account = () => {
  const { user } = useSelector((state) => state.auth);

  const [kycStatus, setKycStatus]   = useState('loading');
  const [kycNote, setKycNote]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const [fullName,       setFullName]       = useState('');
  const [dob,            setDob]            = useState('');
  const [documentType,   setDocumentType]   = useState('passport');
  const [documentNumber, setDocumentNumber] = useState('');
  const [file,           setFile]           = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [pwCurrent,  setPwCurrent]  = useState('');
  const [pwNew,      setPwNew]      = useState('');
  const [pwConfirm,  setPwConfirm]  = useState('');
  const [pwLoading,  setPwLoading]  = useState(false);
  const [pwError,    setPwError]    = useState('');
  const [pwSuccess,  setPwSuccess]  = useState(false);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/api/kyc/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setKycStatus(data.status ?? 'none');
        setKycNote(data.reviewer_note ?? '');
      })
      .catch(() => setKycStatus('none'));
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUploadProgress(0);

    if (!file) { setError('Please select a document to upload.'); return; }

    setLoading(true);
    try {
      const urlRes = await fetch(
        `${API_URL}/api/kyc/upload-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        { credentials: 'include' }
      );
      const { uploadUrl, key, error: urlErr } = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlErr || 'Failed to get upload URL');

      setUploadProgress(10);
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('File upload failed');
      setUploadProgress(80);

      const submitRes = await fetch(`${API_URL}/api/kyc/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: fullName, date_of_birth: dob,
          document_type: documentType, document_number: documentNumber,
          document_key: key,
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

  const copyReferral = () => {
    if (!user?.referral_code) return;
    const link = `${window.location.origin}/signup?ref=${user.referral_code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  if (kycStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f0b90b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const KYC_BADGE = {
    approved: { label: 'Verified',   color: 'text-[#0ecb81]', bg: 'bg-[#0ecb81]/10', border: 'border-[#0ecb81]/20', icon: <IoCheckmarkCircle size={14} /> },
    pending:  { label: 'Under Review', color: 'text-[#f0b90b]', bg: 'bg-[#f0b90b]/10', border: 'border-[#f0b90b]/20', icon: <IoTimeOutline size={14} /> },
    rejected: { label: 'Rejected',   color: 'text-[#f6465d]', bg: 'bg-[#f6465d]/10', border: 'border-[#f6465d]/20', icon: <IoCloseCircle size={14} /> },
    none:     { label: 'Not Verified', color: 'text-[#848e9c]', bg: 'bg-[#848e9c]/10', border: 'border-[#848e9c]/20', icon: <IoShieldCheckmarkOutline size={14} /> },
  };
  const badge = KYC_BADGE[kycStatus] || KYC_BADGE.none;

  const inputCls = "w-full bg-[#0b0e11] border border-[#2b3139] rounded-lg px-4 py-3 text-sm text-[#eaecef] placeholder-[#848e9c] outline-none focus:border-[#f0b90b] transition-colors";
  const labelCls = "text-xs font-semibold text-[#848e9c] uppercase tracking-wide mb-1.5 block";

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef]">

      {/* ── PROFILE HEADER ── */}
      <div className="bg-[#1e2329] border-b border-[#2b3139]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#f0b90b] to-[#d4a300] flex items-center justify-center text-black text-2xl font-bold shrink-0 shadow-lg shadow-[#f0b90b]/10">
              {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-[#eaecef] capitalize">
                  {user?.name || user?.email?.split('@')[0] || 'Trader'}
                </h1>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.color} ${badge.bg} ${badge.border}`}>
                  {badge.icon} {badge.label}
                </span>
              </div>

              <div className="flex items-center gap-5 mt-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs text-[#848e9c]">
                  <IoMailOutline size={13} /> {user?.email || '—'}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-[#848e9c]">
                  <IoCalendarOutline size={13} /> Member since {memberSince}
                </span>
                {user?.referral_code && (
                  <button
                    onClick={copyReferral}
                    className="flex items-center gap-1.5 text-xs text-[#848e9c] hover:text-[#f0b90b] transition-colors group"
                  >
                    <IoPeopleOutline size={13} />
                    Referral: <span className="font-mono font-bold text-[#eaecef] group-hover:text-[#f0b90b]">{user.referral_code}</span>
                    <IoCopyOutline size={11} className="opacity-50 group-hover:opacity-100" />
                    {copied && <span className="text-[#0ecb81] text-[10px] font-semibold ml-1">Copied!</span>}
                  </button>
                )}
                {user?.referral_count > 0 && (
                  <span className="text-xs text-[#848e9c]">
                    {user.referral_count} referral{user.referral_count > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5 pb-20">

        {/* ── CARD: KYC VERIFICATION ── */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2b3139]">
            <IoShieldCheckmarkOutline size={18} className="text-[#f0b90b]" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#eaecef]">Identity Verification</h2>
          </div>

          <div className="p-6">

            {/* APPROVED */}
            {kycStatus === 'approved' && (
              <div className="flex items-center gap-4 p-5 rounded-xl bg-[#0ecb81]/5 border border-[#0ecb81]/15">
                <div className="w-14 h-14 rounded-full bg-[#0ecb81]/10 flex items-center justify-center shrink-0">
                  <IoCheckmarkCircle className="text-[#0ecb81]" size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#eaecef]">Identity Verified</h3>
                  <p className="text-sm text-[#848e9c] mt-0.5">
                    Your account is fully verified. You have access to all trading features and higher limits.
                  </p>
                </div>
              </div>
            )}

            {/* PENDING */}
            {kycStatus === 'pending' && (
              <div className="flex items-center gap-4 p-5 rounded-xl bg-[#f0b90b]/5 border border-[#f0b90b]/15">
                <div className="w-14 h-14 rounded-full bg-[#f0b90b]/10 flex items-center justify-center shrink-0">
                  <IoTimeOutline className="text-[#f0b90b]" size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#eaecef]">Verification Under Review</h3>
                  <p className="text-sm text-[#848e9c] mt-0.5">
                    Your documents are being reviewed. This typically takes <strong className="text-[#eaecef]">1-3 business days</strong>. We'll notify you via email.
                  </p>
                </div>
              </div>
            )}

            {/* REJECTED */}
            {kycStatus === 'rejected' && (
              <div className="mb-6 flex items-center gap-4 p-5 rounded-xl bg-[#f6465d]/5 border border-[#f6465d]/15">
                <div className="w-14 h-14 rounded-full bg-[#f6465d]/10 flex items-center justify-center shrink-0">
                  <IoCloseCircle className="text-[#f6465d]" size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#eaecef]">Verification Rejected</h3>
                  <p className="text-sm text-[#848e9c] mt-0.5">
                    {kycNote || 'Your submission was not accepted. Please re-submit with a clear, valid document.'}
                  </p>
                </div>
              </div>
            )}

            {/* KYC FORM */}
            {(kycStatus === 'none' || kycStatus === 'rejected') && (
              <>
                {kycStatus === 'none' && (
                  <p className="text-sm text-[#848e9c] mb-6">
                    Complete identity verification to unlock trading. You'll need a government-issued ID.
                  </p>
                )}

                {error && (
                  <div className="mb-5 px-4 py-3 bg-[#f6465d]/10 border border-[#f6465d]/20 rounded-lg text-[#f6465d] text-sm font-medium">
                    {error}
                  </div>
                )}

                <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                  <div className="flex items-center gap-2 mb-1">
                    <IoPersonOutline size={16} className="text-[#f0b90b]" />
                    <span className="text-xs font-bold uppercase tracking-wide text-[#848e9c]">Personal Information</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Full Legal Name</label>
                      <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                        placeholder="As shown on your ID" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Date of Birth</label>
                      <input type="date" required value={dob} onChange={e => setDob(e.target.value)}
                        className={`${inputCls} [color-scheme:dark]`} />
                    </div>
                  </div>

                  <div className="w-full h-px bg-[#2b3139] my-1" />

                  <div className="flex items-center gap-2 mb-1">
                    <IoDocumentTextOutline size={16} className="text-[#f0b90b]" />
                    <span className="text-xs font-bold uppercase tracking-wide text-[#848e9c]">Document Details</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Document Type</label>
                      <select value={documentType} onChange={e => setDocumentType(e.target.value)}
                        className={`${inputCls} appearance-none cursor-pointer`}>
                        <option value="passport">Passport</option>
                        <option value="national_id">National ID Card</option>
                        <option value="driver_license">Driver's License</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Document Number</label>
                      <input type="text" required value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                        placeholder="Enter ID number" className={inputCls} />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Upload Document</label>
                    <div className="border-2 border-dashed border-[#2b3139] rounded-xl p-6 text-center hover:border-[#f0b90b]/40 transition-colors bg-[#0b0e11]/50">
                      <input
                        type="file" required accept=".png,.jpg,.jpeg,.pdf"
                        onChange={e => setFile(e.target.files[0] || null)}
                        className="block w-full text-sm text-[#848e9c]
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-[#f0b90b]/10 file:text-[#f0b90b]
                          hover:file:bg-[#f0b90b]/20 cursor-pointer"
                      />
                      <p className="text-[11px] text-[#848e9c] mt-3">PNG, JPG, or PDF — max 5 MB</p>
                      {file && <p className="text-[11px] text-[#f0b90b] mt-1 font-medium">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
                      {loading && uploadProgress > 0 && (
                        <div className="mt-3 w-full max-w-xs mx-auto">
                          <div className="flex justify-between text-[11px] text-[#848e9c] mb-1">
                            <span>{uploadProgress < 80 ? 'Uploading…' : uploadProgress < 100 ? 'Submitting…' : 'Done!'}</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-[#2b3139] rounded-full h-1.5">
                            <div className="bg-[#f0b90b] h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit" disabled={loading}
                    className="mt-1 bg-[#f0b90b] hover:bg-[#d4a300] text-black font-bold text-sm py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
                  >
                    {loading ? 'Submitting…' : 'Submit Verification'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* ── CARD: SECURITY ── */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2b3139]">
            <IoLockClosedOutline size={18} className="text-[#f0b90b]" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#eaecef]">Security</h2>
          </div>

          <div className="p-6">
            {pwError && (
              <div className="mb-5 px-4 py-3 bg-[#f6465d]/10 border border-[#f6465d]/20 rounded-lg text-[#f6465d] text-sm font-medium">{pwError}</div>
            )}
            {pwSuccess && (
              <div className="mb-5 px-4 py-3 bg-[#0ecb81]/10 border border-[#0ecb81]/20 rounded-lg text-[#0ecb81] text-sm font-semibold">
                Password changed successfully.
              </div>
            )}

            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>Current Password</label>
                <input type="password" required value={pwCurrent} onChange={e => setPwCurrent(e.target.value)}
                  placeholder="Enter current password" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>New Password</label>
                  <input type="password" required value={pwNew} onChange={e => setPwNew(e.target.value)}
                    placeholder="Min 8 chars, uppercase, number, symbol" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Confirm New Password</label>
                  <input type="password" required value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
                    placeholder="Repeat new password" className={inputCls} />
                </div>
              </div>
              <button
                type="submit" disabled={pwLoading}
                className="mt-1 w-full sm:w-auto sm:self-start bg-[#2b3139] hover:bg-[#363c45] border border-[#363c45] text-[#eaecef] font-bold text-sm px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
              >
                {pwLoading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Account;
