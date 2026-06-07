import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mail, Plus, Trash2, Send, RefreshCw, Globe,
  Lock, Building2, Upload, CheckCircle, AlertTriangle, Copy
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
  const fileRef = useRef(null);

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
    } catch { toast.error('Failed to load access settings'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (examId) load(); }, [examId]);

  const handleAddEmails = async () => {
    const list = newEmails.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'));
    if (!list.length) return toast.error('Enter at least one valid email');
    setSaving(true);
    try {
      const { data } = await api.post(`/exam-access/${examId}/emails`, { emails: list, sendInvite });
      toast.success(`${data.added} emails added${sendInvite ? ' & invites sent' : ''}`);
      setNewEmails('');
      load();
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
      await api.post(`/exam-access/${examId}/emails/${encodeURIComponent(email)}/resend`);
      toast.success('Invite resent!');
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

  const copyInviteLink = (token) => {
    const url = `${window.location.origin}/exam-register/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Invite link copied!');
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
  const current = ACCESS_LABELS[exam?.access_type] || ACCESS_LABELS.open;
  const CurrentIcon = current.icon;

  return (
    <div className="space-y-5">
      {/* Current access type */}
      <div className="glass rounded-2xl p-4 flex items-center justify-between border border-surface-700">
        <div className="flex items-center gap-3">
          <CurrentIcon size={18} className={current.color}/>
          <div>
            <div className="text-sm font-semibold text-white font-heading">Current Mode: {current.label}</div>
            <div className="text-xs text-surface-400">
              {exam?.access_type === 'open' && 'Anyone can register and take this exam'}
              {exam?.access_type === 'email_whitelist' && `${emails.length} specific emails invited`}
              {exam?.access_type === 'domain_whitelist' && `Only ${domains.map(d=>'@'+d.domain).join(', ')} allowed`}
            </div>
          </div>
        </div>
        {exam?.access_type !== 'open' && (
          <button onClick={handleSetOpen} className="btn-secondary text-sm py-2">
            <Globe size={14}/>Set to Open
          </button>
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
            <p className="text-xs text-surface-400 mb-3">Paste emails separated by commas, semicolons or new lines. Invitations will be sent automatically.</p>
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
              No emails added yet. Add emails above to restrict access to specific candidates.
            </div>
          )}
        </div>
      )}

      {/* Domain Lock Tab */}
      {tab === 'domains' && (
        <div className="space-y-4">
          <div className="card border border-blue-500/20 bg-blue-500/5">
            <h3 className="section-title mb-2">Restrict by Email Domain</h3>
            <p className="text-xs text-surface-400 mb-4">Only students with email addresses from these domains can take the exam. Example: Add <code className="text-blue-300">iitb.ac.in</code> to allow only @iitb.ac.in addresses.</p>
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
              No domains added yet. Add a domain to restrict access to specific institutions.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
