import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

const DEMO_ACCOUNTS = [
  { role: 'Admin',    email: 'admin@proctorAI.co.in',    password: 'Rittan@123',    color: 'text-purple-400 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20' },
  {/*{ role: 'Examiner', email: 'examiner@proctorAI.com', password: 'Exam@123',     color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' },
  { role: 'Student',  email: 'student@proctorAI.com',  password: 'Student@123',  color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20' },*/}
];

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const { login, isLoading }    = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result.success) { toast.success('Welcome back!'); navigate('/dashboard'); }
    else toast.error(result.error || 'Login failed');
  };

  const quickLogin = async (acc) => {
    const result = await login(acc.email, acc.password);
    if (result.success) { toast.success(`Logged in as ${acc.role}`); navigate('/dashboard'); }
    else toast.error(result.error || 'Login failed');
  };

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/8 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo block */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 mb-5 shadow-2xl shadow-primary-500/25">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="font-display text-4xl font-bold text-white mb-1">ProctorAI</h1>
          <p className="text-surface-400 text-sm font-sans">Enterprise Examination Proctoring</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 border border-surface-700/50">
          <h2 className="font-heading text-xl font-semibold text-white mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input pl-9"
                  placeholder="you@organisation.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-9 pr-10"
                  placeholder="Your password"
                  required
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-3 text-base mt-2">
              {isLoading
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Signing in...</>
                : <>Sign In <ArrowRight size={16} /></>
              }
            </button>
          </form>

          {/* Divider */}
          {/* <div className="flex items-center gap-3 my-5"> 
            <div className="flex-1 h-px bg-surface-700" />
            <span className="text-xs text-surface-500 font-medium">Quick demo access</span>
            <div className="flex-1 h-px bg-surface-700" />
          </div>*/}

          {/* Demo buttons */}
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.role}
                onClick={() => quickLogin(acc)}
                disabled={isLoading}
                className={`text-xs py-2 px-3 rounded-xl border font-semibold transition-all font-heading ${acc.color}`}
              >
                {acc.role}
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-surface-500 text-sm mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
            Register here
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
