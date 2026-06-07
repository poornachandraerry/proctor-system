import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Clock, Calendar, CheckCircle, ArrowRight, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function ExamRegisterPage() {
  const { token }     = useParams();
  const navigate      = useNavigate();
  const [invite, setInvite]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [registering, setReg]     = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    api.get(`/exam-access/register/${token}`)
      .then(r => setInvite(r.data.invite))
      .catch(err => setError(err.response?.data?.error || 'Invalid invitation link'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleRegister = async () => {
    setReg(true);
    try {
      await api.post(`/exam-access/register/${token}`);
      setRegistered(true);
      toast.success('Successfully registered!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally { setReg(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-10 max-w-md text-center border border-red-500/20">
        <div className="text-5xl mb-4">🔗</div>
        <h2 className="font-display text-2xl font-bold text-white mb-3">Invalid Link</h2>
        <p className="text-surface-400 mb-6">{error}</p>
        <Link to="/login" className="btn-primary mx-auto w-fit">Go to Login</Link>
      </div>
    </div>
  );

  if (registered) return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}
        className="glass rounded-2xl p-10 max-w-md text-center border border-emerald-500/20 bg-emerald-500/5">
        <CheckCircle size={56} className="text-emerald-400 mx-auto mb-4"/>
        <h2 className="font-display text-2xl font-bold text-white mb-2">Registration Confirmed!</h2>
        <p className="text-surface-400 mb-6">You are registered for <strong className="text-white">{invite?.examTitle}</strong></p>
        {invite?.startTime && (
          <div className="bg-surface-800 rounded-xl p-3 mb-6 text-sm text-surface-300">
            📅 {new Date(invite.startTime).toLocaleString('en-IN', { dateStyle:'full', timeStyle:'short' })}
          </div>
        )}
        <Link to="/login" className="btn-primary mx-auto w-fit"><ArrowRight size={15}/>Go to Login</Link>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/8 rounded-full blur-3xl pointer-events-none"/>
      <motion.div initial={{opacity:0,y:24}} animate={{opacity:1,y:0}}
        className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 mb-4 shadow-2xl shadow-primary-500/25">
            <Shield size={24} className="text-white"/>
          </div>
          <h1 className="font-display text-3xl font-bold text-white">ProctorAI</h1>
          <p className="text-surface-400 text-sm mt-1">Exam Registration</p>
        </div>

        <div className="glass rounded-2xl p-8 border border-surface-700/50">
          <div className="text-center mb-6">
            <h2 className="font-heading text-xl font-bold text-white mb-1">You've been invited</h2>
            <p className="text-surface-400 text-sm">Review the exam details below and confirm your registration</p>
          </div>

          {/* Exam card */}
          <div className="bg-surface-800 rounded-xl p-5 border border-surface-700 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary-500/20 shrink-0">
                <FileText size={18} className="text-primary-400"/>
              </div>
              <div>
                <h3 className="font-heading font-bold text-white">{invite?.examTitle}</h3>
                <p className="text-xs text-surface-400 mt-0.5">{invite?.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              {invite?.startTime && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={14} className="text-primary-400 shrink-0"/>
                  <span className="text-surface-300">
                    {new Date(invite.startTime).toLocaleString('en-IN', { dateStyle:'full', timeStyle:'short' })}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-primary-400 shrink-0"/>
                <span className="text-surface-300">{invite?.duration} minutes duration</span>
              </div>
            </div>
          </div>

          {/* Instructions */}
          {invite?.instructions && (
            <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-4 mb-6">
              <p className="text-xs font-semibold text-primary-400 mb-2">📋 Instructions</p>
              <p className="text-sm text-surface-300 leading-relaxed">{invite.instructions}</p>
            </div>
          )}

          {/* Requirements */}
          <div className="bg-surface-800 rounded-xl p-4 mb-6 border border-surface-700">
            <p className="text-xs font-semibold text-surface-400 mb-2">Requirements</p>
            <ul className="space-y-1 text-xs text-surface-400">
              <li className="flex items-center gap-2"><CheckCircle size={11} className="text-emerald-400"/>Working webcam &amp; microphone</li>
              <li className="flex items-center gap-2"><CheckCircle size={11} className="text-emerald-400"/>Stable internet connection</li>
              <li className="flex items-center gap-2"><CheckCircle size={11} className="text-emerald-400"/>Chrome or Firefox browser</li>
              <li className="flex items-center gap-2"><CheckCircle size={11} className="text-emerald-400"/>Quiet, well-lit environment</li>
            </ul>
          </div>

          <button onClick={handleRegister} disabled={registering} className="btn-primary w-full justify-center py-3 text-base">
            {registering
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Registering...</>
              : <><CheckCircle size={16}/>Confirm Registration</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}
