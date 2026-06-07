import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, Lock, Mail, User, ArrowRight, Building } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'student', organization: '' });
  const [showPassword, setShowPassword] = useState(false);
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    const result = await register(form);
    if (result.success) { toast.success('Account created!'); navigate('/dashboard'); }
    else toast.error(result.error);
  };

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 mb-4 shadow-2xl shadow-primary-500/30">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="font-display text-3xl font-bold text-white mb-2">ProctorAI</h1>
          <p className="text-surface-400 text-sm">Create your account</p>
        </div>
        <div className="glass rounded-2xl p-8 border border-surface-700/50">
          <h2 className="text-xl font-semibold text-white mb-6">Sign up</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">First Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input type="text" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className="input pl-9" placeholder="John" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">Last Name</label>
                <input type="text" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className="input" placeholder="Doe" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input pl-9" placeholder="you@example.com" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input pl-9 pr-10" placeholder="Min. 8 characters" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="input">
                  <option value="student">Student</option>
                  <option value="examiner">Examiner</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">Organization</label>
                <div className="relative">
                  <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input type="text" value={form.organization} onChange={e => setForm({ ...form, organization: e.target.value })} className="input pl-9" placeholder="Optional" />
                </div>
              </div>
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-3 text-base font-semibold mt-2">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating account...
                </span>
              ) : <span className="flex items-center gap-2">Create Account <ArrowRight size={16} /></span>}
            </button>
          </form>
        </div>
        <p className="text-center text-surface-400 text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
