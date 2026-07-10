import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Mail, Plus, Trash2, Send, Globe,
  Lock, Building2, CheckCircle, AlertTriangle, Settings,
  Link2, Copy, RefreshCw, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function ExamAccessPage({ examId: propExamId }) {
  const params    = useParams();
  const examId    = propExamId || params.examId;
  const [tab, setTab]           = useState('emails');
  const [emails, setEmails]     = useState([]);
  const [domains, setDomains]   = useState([]);
  const [exam, setExam]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [newEmails, setNewEmails] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showTestEmail, setShowTestEmail] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testing, setTesting]   = useState(false);
  const [smtpStatus, setSmtpStatus] = useState(null);
  const [regeneratingLink, setRegeneratingLink] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [examRes, emailRes, domainRes] = await Promise.all([
        api.get(`/exams/${examId}`),
        api.get(`/exam-access/${examId}/emails`),
        api.get(`/exam-access/${examId}/domains`),
      ]);
      setExam(examRes.data);
      setEmails(emailRes.data || []);
      setDomains(domainRes.data || []);

      // Debug visibility — remove once confirmed working
      console.log('[ExamAccessPage] exam payload:', examRes.data);
      console.log('[ExamAccessPage] access_type:', examRes.data?.access_type);
      console.log('[ExamAccessPage] public_link_token:', examRes.data?.public_link_token);
    } catch { toast.error('Failed to load access settings'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (examId) load(); }, [examId]);

  // ── Normalised access type (handles null/undefined/unexpected values
  //    by treating them as 'open' — same default the backend uses when
  //    creating an exam) ──────────────────────────────────────────────
  const accessType = exam?.access_type || 'open';
  const hasToken = !!exam?.public_link_token;

  // ── Shareable public registration link ─────────────────
  const publicLinkUrl = exam?.public_link_token
    ? `${window.location.origin}/exam-register/${exam.public_link_token}`
    : null;

  const handleCopyLink = () => {
    if (!publicLinkUrl) return;
    navigator.clipboard.writeText(publicLinkUrl);
    toast.success('Registration link copied to clipboard!');
  };

  const handleRegenerateLink = async () => {
    if (!confirm('Regenerate the link? The old link will stop working immediately — anyone who already has it will need the new one.')) return;
    setRegeneratingLink(true);
    try {
      const { data } = await api.post(`/public-exam/exam/${examId}/regenerate`);
      setExam(prev => ({ ...prev, public_link_token: data.publicLinkToken }));
      toast.success('Link generated. Share it with candidates.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate link');
    } finally { setRegeneratingLink(false); }
  };

  const handleToggleRegistration = async () => {
    try {
      const newVal = !(exam.registration_open !== false);
      await api.put(`/exams/${examId}`, { registrationOpen: newVal });
      setExam(prev => ({ ...prev, registration_open: newVal }));
      toast.success(newVal ? 'Registration link is now active' : 'Registration link disabled');
    } catch { toast.error('Failed to update'); }
  };

  // ── Test SMTP configuration ────────────────────────────
  const handleTestEmail = async () => {
    setTesting(true);
    setSmtpStatus(null);
    try {
      const { data } = await api.post('/exam-access/test-email', {
        testRecipient: testRecipient.trim() || undefined,
      });
      setSmtpStatus(data);
      if (data.ok) toast.success(data.message);
      else toast.error(data.message);
    } catch (err) {
      const msg = err.response?.data?.message || 'Test failed';
      setSmtpStatus({ ok: false, message: msg, configured: false });
      toast.error(msg);
    } finally { setTesting(false); }
  };

  const handleAddEmails = async () => {
    const list = newEmails.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'));
    if (!list.length) return toast.error('Enter at least one valid email');
    setSaving(true);
    try {
      const { data } = await api.post(`/exam-access/${examId}/emails`, { emails: list, sendInvite });
      setNewEmails('');
      load();

      if (data.emailSummary) {
        if (data.emailSummary.status === 'sent') {
          toast.success(`${data.added} emails added & invites sent successfully!`);
        } else if (data.emailSummary.status === 'not_configured') {
          toast.error(data.emailSummary.message, { duration: 8000 });
        } else if (data.emailSummary.status === 'failed') {
          toast.error(data.emailSummary.message, { duration: 8000 });
        }
      } else {
        toast.success(`${data.added} emails added (no invite sent — toggle was off)`);
      }
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add emails'); }
    finally { setSaving(false); }
  };

  const handleRemoveEmail = async (email) => {
    try {
      await api.delete(`/exam-access/${examId}/emails/${encodeURIComponent(email)}`);
      toast.success('Email removed');
      setEmails(prev => prev.filter(e => e.email !== email));
    } catch { toast.error('Failed to remove'); }
  };

  const handleResend = async (email) => {
    try {
      const { data } = await api.post(`/exam-access/${examId}/emails/${encodeURIComponent(email)}/resend`);
      if (data.emailStatus?.sent) toast.success('Invite resent and delivered!');
      else toast.error(data.emailStatus?.reason || 'Email could not be delivered — check SMTP settings');
    } catch { toast.error('Failed to resend'); }
  };

  const handleAddDomain = async () => {
    const d = newDomain.trim().replace(/^@/, '').toLowerCase();
    if (!d || !d.includes('.')) return toast.error('Enter a valid domain (e.g. iitb.ac.in)');
    try {
      await api.post(`/exam-access/${examId}/domains`, { domains: [d] });
      toast.success(`@${d} added`);
      setNewDomain('');
      load();
    } catch { toast.error('Failed to add domain'); }
  };

  const handleRemoveDomain = async (domain) => {
    try {
      await api.delete(`/exam-access/${examId}/domains/${encodeURIComponent(domain)}`);
      toast.success('Domain removed');
      setDomains(prev => prev.filter(d => d.domain !== domain));
    } catch { toast.error('Failed to remove'); }
  };

  const handleSetOpen = async () => {
    try {
      await api.put(`/exams/${examId}`, { access_type: 'open' });
      setExam(prev => ({ ...prev, access_type: 'open' }));
      toast.success('Exam set to Open Access');
    } catch { toast.error('Failed to update'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  const ACCESS_LABELS = {
    open:             { label:'Open Access',    color:'text-emerald-400', icon: Globe },
    email_whitelist:  { label:'Email Whitelist',color:'text-amber-400',   icon: Mail  },
    domain_whitelist: { label:'Domain Locked',  color:'text-blue-400',    icon: Building2 },
    invite_only:      { label:'Invite Only',    color:'text-purple-400',  icon: Lock  },
  };
  const current = ACCESS_LABELS[accessType] || ACCESS_LABELS.open;
  const CurrentIcon = current.icon;
  const registrationActive = exam?.registration_open !== false;

  // FIX: previously this check used exam?.access_type directly (could be
  // undefined/null on exams created before the public-link feature shipped,
  // or before the migration ran), which silently hid the panel even though
  // the badge above showed "Open Access" via its fallback default.
  // Now both use the same normalised `accessType` value.
  const showLinkPanel = accessType === 'open' || accessType === 'domain_whitelist';

  return (
    <div className="space-y-5">
      {/* Current access type */}
      <div className="glass rounded-2xl p-4 flex items-center justify-between border border-surface-700">
        <div className="flex items-center gap-3">
          <CurrentIcon size={18} className={current.color}/>
          <div>
            <div className="text-sm font-semibold text-white font-heading">Current Mode: {current.label}</div>
            <div className="text-xs text-surface-400">
              {accessType === 'open' && 'Anyone with the link can register and take this exam'}
              {accessType === 'email_whitelist' && `${emails.length} specific emails invited`}
              {accessType === 'domain_whitelist' && `Only ${domains.map(d=>'@'+d.domain).join(', ')} can self-register via link`}
            </div>
          </div>
        </div>
        {accessType !== 'open' && (
          <button onClick={handleSetOpen} className="btn-secondary text-sm py-2">
            <Globe size={14}/>Set to Open
          </button>
        )}
      </div>

      {/* ── Shareable Registration Link ──────────────────── */}
      {showLinkPanel && (
        <div className="glass rounded-2xl p-4 border border-primary-500/20 bg-primary-500/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-primary-400"/>
              <span className="text-sm font-semibold text-white font-heading">Shareable Registration Link</span>
            </div>
            <button onClick={handleToggleRegistration}
              className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${registrationActive ? 'bg-emerald-500' : 'bg-surface-600'}`}
              title={registrationActive ? 'Click to disable registration' : 'Click to enable registration'}>
              <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${registrationActive ? 'translate-x-4' : ''}`}/>
            </button>
          </div>

          <p className="text-xs text-surface-400 mb-3">
            {accessType === 'open'
              ? 'Anyone who visits this link can create an account and register for the exam.'
              : 'Visitors can self-register, but only if their email matches one of your approved domains below.'}
            {' '}{!registrationActive && <span className="text-amber-400 font-medium">Registration is currently disabled — toggle on to allow new sign-ups.</span>}
          </p>

          {hasToken ? (
            <div className="flex items-center gap-2 bg-surface-800 rounded-lg p-2.5">
              <Link2 size={13} className="text-surface-500 shrink-0"/>
              <code className="text-xs text-primary-300 flex-1 truncate">{publicLinkUrl}</code>
              <button onClick={handleCopyLink} title="Copy link" className="p-1.5 text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg shrink-0">
                <Copy size={13}/>
              </button>
              <a href={publicLinkUrl} target="_blank" rel="noreferrer" title="Open link" className="p-1.5 text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg shrink-0">
                <ExternalLink size={13}/>
              </a>
              <button onClick={handleRegenerateLink} disabled={regeneratingLink} title="Regenerate link (invalidates old one)"
                className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg shrink-0">
                {regeneratingLink ? <div className="w-3.5 h-3.5 border-2 border-surface-400 border-t-transparent rounded-full animate-spin"/> : <RefreshCw size={13}/>}
              </button>
            </div>
          ) : (
            // Exam was created before this feature shipped / before the
            // migration ran, so it has no token yet — let the examiner
            // generate one on demand instead of being stuck with nothing.
            <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <span className="text-xs text-amber-300">This exam doesn't have a registration link yet.</span>
              <button onClick={handleRegenerateLink} disabled={regeneratingLink} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                {regeneratingLink ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Link2 size={12}/>}
                Generate Link
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SMTP test panel ──────────────────────────────── */}
      <div className="glass rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5">
        <button onClick={() => setShowTestEmail(!showTestEmail)} className="flex items-center gap-2 w-full text-left">
          <Settings size={16} className="text-amber-400"/>
          <span className="text-sm font-semibold text-white font-heading">Email Delivery Settings (check before sending invites)</span>
        </button>
        {showTestEmail && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-surface-400">
              Verify your SMTP configuration is working before relying on candidate email invites. If SMTP is not configured, invites will be recorded but no email will actually be delivered.
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                value={testRecipient}
                onChange={e => setTestRecipient(e.target.value)}
                placeholder="your-email@example.com (optional — leave blank to just check connection)"
                className="input flex-1 min-w-[220px] text-sm py-2"
              />
              <button onClick={handleTestEmail} disabled={testing} className="btn-secondary text-sm py-2">
                {testing ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Send size={14}/>}
                Test Configuration
              </button>
            </div>
            {smtpStatus && (
              <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                smtpStatus.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'
              }`}>
                {smtpStatus.ok ? <CheckCircle size={14} className="shrink-0 mt-0.5"/> : <AlertTriangle size={14} className="shrink-0 mt-0.5"/>}
                <span>{smtpStatus.message}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 p-1 rounded-xl border border-surface-800 w-fit">
        {[
          { id:'emails',  label:'Email Invites', icon: Mail      },
          { id:'domains', label:'Domain Lock',   icon: Building2 },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all font-heading ${tab===t.id?'bg-primary-600 text-white':'text-surface-400 hover:text-white'}`}>
            <t.icon size={14}/>{t.label}
          </button>
        ))}
      </div>

      {/* Email Invites Tab */}
      {tab === 'emails' && (
        <div className="space-y-4">
          <div className="card border border-primary-500/20 bg-primary-500/5">
            <h3 className="section-title mb-3">Add Candidate Emails</h3>
            <p className="text-xs text-surface-400 mb-3">Paste emails separated by commas, semicolons or new lines. Invitations will be sent automatically with a personal registration link.</p>
            <textarea
              value={newEmails}
              onChange={e => setNewEmails(e.target.value)}
              className="input resize-none mb-3"
              rows={4}
              placeholder="student1@college.edu&#10;student2@college.edu&#10;student3@college.edu"
            />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sendInvite} onChange={e => setSendInvite(e.target.checked)} className="w-4 h-4 accent-primary-500"/>
                <span className="text-sm text-surface-300">Send email invitation immediately</span>
              </label>
              <button onClick={handleAddEmails} disabled={saving || !newEmails.trim()} className="btn-primary">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Send size={15}/>}
                Add & {sendInvite ? 'Send Invites' : 'Save'}
              </button>
            </div>
          </div>

          {/* Email list */}
          {emails.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-surface-800">
                <span className="text-sm font-semibold text-white font-heading">{emails.length} Invited Candidates</span>
                <span className="text-xs text-emerald-400">{emails.filter(e=>e.registered).length} registered</span>
              </div>
              <div className="divide-y divide-surface-800 max-h-72 overflow-y-auto">
                {emails.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-sm text-white flex-1 truncate">{e.email}</span>
                    {e.registered
                      ? <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-medium">Registered</span>
                      : <span className="text-xs bg-surface-700 text-surface-400 px-2 py-0.5 rounded-full">Invited</span>
                    }
                    <span className="text-xs text-surface-500">{new Date(e.invited_at).toLocaleDateString('en-IN')}</span>
                    <button onClick={() => handleResend(e.email)} title="Resend invite"
                      className="p-1.5 text-surface-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg">
                      <Send size={12}/>
                    </button>
                    <button onClick={() => handleRemoveEmail(e.email)} title="Remove"
                      className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {emails.length === 0 && (
            <div className="text-center py-8 text-surface-500 text-sm">
              No emails added yet. Add emails above to restrict access to specific candidates, or use the shareable link above for open/domain-based registration.
            </div>
          )}
        </div>
      )}

      {/* Domain Lock Tab */}
      {tab === 'domains' && (
        <div className="space-y-4">
          <div className="card border border-blue-500/20 bg-blue-500/5">
            <h3 className="section-title mb-2">Restrict by Email Domain</h3>
            <p className="text-xs text-surface-400 mb-4">Only visitors with email addresses from these domains can self-register via the shareable link above. Example: Add <code className="text-blue-300">iitb.ac.in</code> to allow only @iitb.ac.in addresses.</p>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 text-sm">@</span>
                <input
                  value={newDomain}
                  onChange={e => setNewDomain(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
                  className="input pl-7"
                  placeholder="college.edu.in"
                />
              </div>
              <button onClick={handleAddDomain} disabled={!newDomain.trim()} className="btn-primary">
                <Plus size={15}/>Add Domain
              </button>
            </div>
          </div>

          {domains.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-800">
                <span className="text-sm font-semibold text-white font-heading">{domains.length} Allowed Domain{domains.length!==1?'s':''}</span>
              </div>
              <div className="divide-y divide-surface-800">
                {domains.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <Building2 size={14} className="text-blue-400 shrink-0"/>
                    <span className="text-sm text-white flex-1 font-mono">@{d.domain}</span>
                    <span className="text-xs text-surface-500">{new Date(d.created_at).toLocaleDateString('en-IN')}</span>
                    <button onClick={() => handleRemoveDomain(d.domain)}
                      className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {domains.length === 0 && (
            <div className="text-center py-8 text-surface-500 text-sm">
              No domains added yet. Add a domain above, then switch the exam to "Domain Locked" mode so the shareable link enforces it.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
