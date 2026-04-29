import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  IoShieldCheckmarkOutline,
  IoDocumentTextOutline,
  IoPersonOutline,
  IoTimeOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
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
    setLoading(true);

    const formData = new FormData();
    formData.append('full_name',       fullName);
    formData.append('date_of_birth',   dob);
    formData.append('document_type',   documentType);
    formData.append('document_number', documentNumber);
    if (file) formData.append('document', file);

    try {
      const res = await fetch(`${API_URL}/api/kyc/submit`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Submission failed. Please try again.');
      } else {
        setKycStatus('pending');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
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
                    {file && <p className="text-xs text-[#00D68F] mt-1">{file.name}</p>}
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
    </div>
  );
};

export default Account;
