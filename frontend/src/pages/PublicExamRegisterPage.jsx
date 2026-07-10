import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield, Clock, Calendar, CheckCircle, ArrowRight,
  FileText, Lock, Globe, Building2, AlertTriangle, Eye, EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const ACCESS_BADGE = {
  open:             { label:'Open to all',       icon: Globe,    color:'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  domain_whitelist: { label:'Domain restricted',  icon: Building2,color:'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  email_whitelist:  { label:'Invited candidates', icon: Lock,     color:'text-amber-400 bg-amber-500/10 border-amber-500/30' },
};

export default function PublicExamRegisterPage() {
  const { token }  = useParams();
  const navigate    = useNavigate();
  const [exam, setExam]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [showPwd, setShowPwd]     = useState(false);

  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'' });
  const [emailCheck, setEmailCheck] = useState(null); // { allowed, reason } | null while typing
  const [checkingEmail, setCheckingEmail] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get(`/public-exam/${token}`)
      .then(r => setExam(r.data))
      .catch(err => setError(err.response?.data?.error || 'This exam link is invalid or has expired'))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Live email validation as the visitor types (debounced) ──
  const checkEmail = useCallback((email) => {
    if (!email.includes('@') || !exam) { setEmailCheck(null); return; }
    setCheckingEmail(true);
    api.post(`/public-exam/${token}/validate`, { email })
      .then(r => setEmailCheck(r.data))
      .catch(() => setEmailCheck(null))
      .finally(() => setCheckingEmail(false));
  }, [token, exam]);

  const handleEmailChange = (val) => {
    setForm(f => ({ ...f, email: val }));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkEmail(val), 500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (emailCheck && emailCheck.allowed === false) {
      toast.error(emailCheck.reason || 'This email is not eligible for this exam');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/public-exam/${token}/register`, form);
      setDone(true);
      toast.success('Registration successful!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-10 max-w-md text-center border border-red-500/20">
        <AlertTriangle size={48} className="text-red-400 mx-auto mb-4"/>
        <h2 className="font-display text-2xl font-bold text-white mb-3">Link Unavailable</h2>
        <p className="text-surface-400 mb-6">{error}</p>
        <Link to="/login" className="btn-primary mx-auto w-fit">Go to Login</Link>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4">
      <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }}
        className="glass rounded-2xl p-10 max-w-md text-center border border-emerald-500/20 bg-emerald-500/5">
        <CheckCircle size={56} className="text-emerald-400 mx-auto mb-4"/>
        <h2 className="font-display text-2xl font-bold text-white mb-2">You're Registered!</h2>
        <p className="text-surface-400 mb-6">
          You're enrolled in <strong className="text-white">{exam.title}</strong>. Log in with your new account to take the exam when it's available.
        </p>
        <Link to="/login" className="btn-primary mx-auto w-fit"><ArrowRight size={15}/>Go to Login</Link>
      </motion.div>
    </div>
  );

  const accessBadge = ACCESS_BADGE[exam.accessType] || ACCESS_BADGE.open;
  const AccessIcon = accessBadge.icon;
  const formDisabled = emailCheck && emailCheck.allowed === false;

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/8 rounded-full blur-3xl pointer-events-none"/>
      <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 mb-4 shadow-2xl shadow-primary-500/25">
            <Shield size={24} className="text-white"/>
          </div>
          <h1 className="font-display text-3xl font-bold text-white">ProctorAI</h1>
          <p className="text-surface-400 text-sm mt-1">Exam Registration</p>
        </div>

        <div className="glass rounded-2xl p-8 border border-surface-700/50">
          {/* Exam summary */}
          <div className="bg-surface-800 rounded-xl p-5 border border-surface-700 mb-6">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary-500/20 shrink-0">
                <FileText size={18} className="text-primary-400"/>
              </div>
              <div className="flex-1">
                <h3 className="font-heading font-bold text-white">{exam.title}</h3>
                {exam.orgName && <p className="text-xs text-surface-400 mt-0.5">{exam.orgName}</p>}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 shrink-0 ${accessBadge.color}`}>
                <AccessIcon size={11}/>{accessBadge.label}
              </span>
            </div>
            <div className="space-y-1.5">
              {exam.startTime && (
                <div className="flex items-center gap-2 text-sm text-surface-300">
                  <Calendar size={13} className="text-primary-400 shrink-0"/>
                  {new Date(exam.startTime).toLocaleString('en-IN', { dateStyle:'full', timeStyle:'short' })}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-surface-300">
                <Clock size={13} className="text-primary-400 shrink-0"/>
                {exam.durationMinutes} minutes duration
              </div>
            </div>
            {exam.accessType === 'domain_whitelist' && exam.allowedDomains?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-surface-700 text-xs text-blue-300">
                Only emails from: {exam.allowedDomains.map(d => `@${d}`).join(', ')}
              </div>
            )}
          </div>

          <h2 className="font-heading text-lg font-bold text-white mb-1">Create Your Account</h2>
          <p className="text-surface-400 text-sm mb-5">Register below to enroll in this exam.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">First Name *</label>
                <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName:e.target.value }))}
                  className="input" placeholder="Priya" required/>
              </div>
              <div>
                <label className="label text-xs">Last Name *</label>
                <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName:e.target.value }))}
                  className="input" placeholder="Sharma" required/>
              </div>
            </div>

            <div>
              <label className="label text-xs">Email Address *</label>
              <input type="email" value={form.email} onChange={e => handleEmailChange(e.target.value)}
                className="input" placeholder="you@example.com" required/>
              {checkingEmail && <p className="text-xs text-surface-500 mt-1">Checking eligibility...</p>}
              {emailCheck && emailCheck.allowed === false && (
                <p className="text-xs text-red-400 mt-1.5 flex items-start gap-1">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5"/>{emailCheck.reason}
                </p>
              )}
              {emailCheck && emailCheck.allowed === true && (
                <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                  <CheckCircle size={11}/>Eligible to register
                </p>
              )}
            </div>

            <div>
              <label className="label text-xs">Password *</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password:e.target.value }))}
                  className="input pr-10" placeholder="At least 6 characters" minLength={6} required/>
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                  {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
              <p className="text-xs text-surface-500 mt-1">You'll use this to log in and take the exam.</p>
            </div>

            <button type="submit" disabled={submitting || formDisabled} className="btn-primary w-full justify-center py-3 text-base">
              {submitting
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Registering...</>
                : <>Register for Exam <ArrowRight size={16}/></>
              }
            </button>
          </form>

          <p className="text-center text-surface-500 text-xs mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">Log in instead</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
