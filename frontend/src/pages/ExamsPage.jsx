import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, Search, Clock, Users, FileText, Monitor,
  RefreshCw, FileSpreadsheet, Calendar, Timer, Lock, Globe
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';

const STATUS_STYLE = {
  published: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  draft:     'bg-surface-700/80 text-surface-400 border-surface-600',
  active:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  completed: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  archived:  'bg-surface-800 text-surface-500 border-surface-700',
};

const ACCESS_ICON = {
  open:             { icon: Globe, label: 'Open',          color: 'text-emerald-400' },
  email_whitelist:  { icon: Lock,  label: 'Invite Only',   color: 'text-amber-400'   },
  domain_whitelist: { icon: Lock,  label: 'Domain Locked', color: 'text-blue-400'    },
  invite_only:      { icon: Lock,  label: 'Invite Only',   color: 'text-amber-400'   },
};

// ── Countdown widget ───────────────────────────────────────
function ExamCountdown({ startTime, status }) {
  const [label, setLabel] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!startTime) { setLabel(''); return; }
    const tick = () => {
      const diff = new Date(startTime) - new Date();
      if (diff <= 0) { setLabel('Started'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setUrgent(diff < 3600000);
      if (d > 0)      setLabel(`${d}d ${h}h ${m}m`);
      else if (h > 0) setLabel(`${h}h ${m}m ${s}s`);
      else            setLabel(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  if (!startTime || status !== 'published') return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Timer size={10} className={urgent ? 'text-red-400' : 'text-primary-400'}/>
      <span className={`text-xs font-mono font-bold ${urgent ? 'text-red-400 animate-pulse' : 'text-primary-400'}`}>
        {label}
      </span>
    </div>
  );
}

export default function ExamsPage() {
  const { user }    = useAuthStore();
  const navigate    = useNavigate();
  const [exams, setExams]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [downloading, setDownloading]   = useState(null);
  const isStaff = user?.role === 'admin' || user?.role === 'examiner' || user?.role === 'org_admin';

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 50 });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/exams?${params}`);
      setExams(data.exams || []);
      setTotal(data.total || 0);
    } catch { toast.error('Failed to load exams'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const downloadExamReport = async (e, examId, examTitle) => {
    e.preventDefault(); e.stopPropagation();
    setDownloading(examId);
    try {
      const response = await api.get(`/reports/exam/${examId}/excel`, { responseType: 'blob' });
      const url  = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ProctorAI_${examTitle.replace(/\s+/g,'_').slice(0,30)}_${new Date().toISOString().slice(0,10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded!');
    } catch { toast.error('Failed to download report'); }
    finally { setDownloading(null); }
  };

  const filtered = exams.filter(e =>
    `${e.title} ${e.creator_name || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-title">{isStaff ? 'Exam Management' : 'Available Exams'}</h1>
          <p className="text-surface-400 text-sm mt-1">{total} exam{total !== 1 ? 's' : ''}</p>
        </div>
        {isStaff && (
          <Link to="/exams/create" className="btn-primary"><Plus size={16}/>Create Exam</Link>
        )}
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exams..." className="input pl-9"/>
        </div>
        {isStaff && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-40">
            <option value="">All Status</option>
            {['draft','published','active','completed','archived'].map(s=>(
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
        )}
        <button onClick={fetchExams} className="btn-secondary px-3"><RefreshCw size={15}/></button>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_,i) => <div key={i} className="glass rounded-2xl h-52 animate-pulse"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-16 text-center">
          <FileText size={48} className="text-surface-700 mx-auto mb-4"/>
          <h3 className="font-display text-xl font-semibold text-surface-400 mb-2">No exams found</h3>
          {isStaff && <Link to="/exams/create" className="btn-primary mx-auto w-fit mt-4"><Plus size={15}/>Create First Exam</Link>}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((exam, i) => {
            const accessInfo = ACCESS_ICON[exam.access_type] || ACCESS_ICON.open;
            const AccessIcon = accessInfo.icon;
            return (
              <motion.div key={exam.id} initial={{opacity:0, y:12}} animate={{opacity:1, y:0}} transition={{delay:i*0.04}}>
                <Link to={`/exams/${exam.id}`}
                  className="glass rounded-2xl p-5 border border-surface-700/50 hover:border-primary-500/30 transition-all duration-200 group flex flex-col h-full">
                  {/* Status row */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border capitalize ${STATUS_STYLE[exam.status] || STATUS_STYLE.draft}`}>
                      {exam.status}
                    </span>
                    <span className={`flex items-center gap-1 text-xs ${accessInfo.color}`}>
                      <AccessIcon size={11}/>{accessInfo.label}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-heading font-semibold text-white mb-1.5 leading-snug group-hover:text-primary-300 transition-colors line-clamp-2">
                    {exam.title}
                  </h3>
                  {exam.description && (
                    <p className="text-xs text-surface-400 mb-2 line-clamp-2 leading-relaxed">{exam.description}</p>
                  )}

                  {/* Date + countdown */}
                  {exam.start_time && (
                    <div className="flex items-center gap-1.5 text-xs text-surface-400 mb-1">
                      <Calendar size={11}/>
                      {new Date(exam.start_time).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                    </div>
                  )}
                  <ExamCountdown startTime={exam.start_time} status={exam.status}/>

                  {/* Meta row */}
                  <div className="flex items-center gap-4 mt-auto pt-3 border-t border-surface-800 text-xs text-surface-500">
                    <span className="flex items-center gap-1.5"><Clock size={11}/>{exam.duration_minutes}m</span>
                    <span className="flex items-center gap-1.5"><FileText size={11}/>{exam.question_count || 0}Qs</span>
                    <span className="flex items-center gap-1.5"><Users size={11}/>{exam.enrolled_count || 0}</span>
                    {exam.active_sessions > 0 && (
                      <span className="ml-auto flex items-center gap-1 text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                        {exam.active_sessions} live
                      </span>
                    )}
                  </div>

                  {/* Staff actions */}
                  {isStaff && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-surface-800" onClick={e => e.preventDefault()}>
                      {(exam.status === 'published' || exam.status === 'active') && (
                        <button onClick={e => { e.preventDefault(); navigate(`/proctor/${exam.id}`); }}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-primary-500/15 text-primary-300 hover:bg-primary-500/25 transition-colors border border-primary-500/20 font-medium">
                          <Monitor size={12}/>Proctor
                        </button>
                      )}
                      <button onClick={e => downloadExamReport(e, exam.id, exam.title)}
                        disabled={downloading === exam.id}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors border border-emerald-500/20 font-medium">
                        {downloading === exam.id
                          ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin"/>
                          : <FileSpreadsheet size={12}/>
                        }
                        Report
                      </button>
                    </div>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
