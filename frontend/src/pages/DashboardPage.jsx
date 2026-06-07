import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileText, CheckCircle, Clock, ChevronRight,
  TrendingUp, Award, AlertTriangle, BarChart3,
  Play, Calendar, Timer
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend, ReferenceLine
} from 'recharts';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

// ── Countdown Timer ────────────────────────────────────────
function Countdown({ targetDate }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [urgent, setUrgent]     = useState(false);

  useEffect(() => {
    if (!targetDate) { setTimeLeft('No date set'); return; }
    const tick = () => {
      const diff = new Date(targetDate) - new Date();
      if (diff <= 0) { setTimeLeft('Starting now'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setUrgent(diff < 3600000); // urgent if less than 1 hour
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return (
    <span className={`text-xs font-mono font-bold ${urgent ? 'text-red-400 animate-pulse' : 'text-primary-400'}`}>
      {timeLeft}
    </span>
  );
}

// ── Admin Dashboard ────────────────────────────────────────
function AdminDashboard({ data }) {
  if (!data) return null;
  const { stats, recentActivity } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total Users',       value: stats?.users?.total,           sub:`${stats?.users?.active} active`,     color:'from-primary-500/20 to-primary-600/10 border-primary-500/20 text-primary-400',  to:'/users'    },
          { label:'Total Exams',       value: stats?.exams?.total,           sub:`${stats?.exams?.live||0} live now`,  color:'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20 text-emerald-400', to:'/exams'    },
          { label:'Active Sessions',   value: stats?.sessions?.active,       sub:'students testing now',               color:'from-purple-500/20 to-purple-600/10 border-purple-500/20 text-purple-400',   to:null        },
          { label:'Unreviewed Alerts', value: stats?.alerts?.unreviewed,     sub:'high/critical only',                 color:'from-red-500/20 to-red-600/10 border-red-500/20 text-red-400',             to:'/alerts'   },
        ].map(({ label, value, sub, color, to }) => {
          const card = (
            <div className={`glass rounded-2xl p-5 border bg-gradient-to-br ${color} hover:scale-[1.02] transition-all cursor-pointer`}>
              <div className="font-display text-3xl font-bold text-white mb-0.5">{value ?? '—'}</div>
              <div className="text-sm font-semibold text-surface-300 font-heading">{label}</div>
              {sub && <div className="text-xs text-surface-500 mt-0.5">{sub}</div>}
            </div>
          );
          return to ? <Link key={label} to={to}>{card}</Link> : <div key={label}>{card}</div>;
        })}
      </div>
      {recentActivity?.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4">Recent Activity</h2>
          <div className="space-y-2">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-800 transition-colors">
                <AlertTriangle size={14} className={a.severity==='critical'?'text-red-400':a.severity==='high'?'text-orange-400':'text-yellow-400'}/>
                <span className="text-sm text-surface-300 flex-1 capitalize">{a.title?.replace(/_/g,' ')}</span>
                <span className="text-xs text-surface-500">{a.user_name}</span>
                <span className="text-xs text-surface-600">{new Date(a.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Examiner Dashboard ─────────────────────────────────────
function ExaminerDashboard({ data }) {
  if (!data) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'My Exams',          value: data.stats?.myExams,           color:'from-primary-500/20 to-primary-600/10 border-primary-500/20 text-primary-400', to:'/exams'  },
          { label:'Active Sessions',   value: data.stats?.activeSessions,    color:'from-purple-500/20 to-purple-600/10 border-purple-500/20 text-purple-400',    to:null       },
          { label:'Unreviewed Alerts', value: data.stats?.unreviewedAlerts,  color:'from-red-500/20 to-red-600/10 border-red-500/20 text-red-400',              to:'/alerts'  },
        ].map(({ label, value, color, to }) => {
          const card = (
            <div className={`glass rounded-2xl p-5 border bg-gradient-to-br ${color} hover:scale-[1.02] transition-all`}>
              <div className="font-display text-3xl font-bold text-white mb-0.5">{value ?? '—'}</div>
              <div className="text-sm font-semibold text-surface-300 font-heading">{label}</div>
            </div>
          );
          return to ? <Link key={label} to={to}>{card}</Link> : <div key={label}>{card}</div>;
        })}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/exams/create" className="card border border-primary-500/20 bg-primary-500/5 hover:border-primary-500/40 transition-all flex items-center gap-4 group">
          <div className="p-3 rounded-xl bg-primary-500/20"><FileText size={22} className="text-primary-400"/></div>
          <div>
            <div className="font-semibold text-white font-heading group-hover:text-primary-300 transition-colors">Create New Exam</div>
            <div className="text-sm text-surface-400">AI questions, bulk upload, email invites</div>
          </div>
          <ChevronRight size={18} className="ml-auto text-surface-500 group-hover:text-primary-400"/>
        </Link>
        <Link to="/alerts" className="card border border-orange-500/20 bg-orange-500/5 hover:border-orange-500/40 transition-all flex items-center gap-4 group">
          <div className="p-3 rounded-xl bg-orange-500/20"><AlertTriangle size={22} className="text-orange-400"/></div>
          <div>
            <div className="font-semibold text-white font-heading group-hover:text-orange-300 transition-colors">Review Alerts</div>
            <div className="text-sm text-surface-400">Proctoring flags &amp; incidents</div>
          </div>
          <ChevronRight size={18} className="ml-auto text-surface-500 group-hover:text-orange-400"/>
        </Link>
      </div>
      {data.recentExams?.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4">Recent Exams</h2>
          <div className="space-y-2">
            {data.recentExams.map(e => (
              <Link key={e.id} to={`/exams/${e.id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-800 transition-colors group">
                <div className={`w-2 h-2 rounded-full shrink-0 ${e.status==='published'?'bg-emerald-400':'bg-surface-500'}`}/>
                <span className="text-sm text-white font-medium flex-1 truncate">{e.title}</span>
                <span className="text-xs text-surface-500">{e.session_count} sessions</span>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${e.status==='published'?'bg-emerald-500/20 text-emerald-400':'bg-surface-700 text-surface-500'}`}>{e.status}</span>
                <ChevronRight size={14} className="text-surface-600 group-hover:text-white transition-colors"/>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Student Dashboard ──────────────────────────────────────
function StudentDashboard({ data, performance }) {
  const navigate = useNavigate();
  if (!data) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass rounded-xl p-3 border border-surface-700 text-xs">
        <div className="text-white font-bold mb-1 truncate max-w-[180px]">{label}</div>
        <div className="text-primary-400">Score: {payload[0]?.value}%</div>
        {payload[1] && <div className="text-emerald-400">Marks: {payload[1]?.value}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Enrolled Exams',  value: data.stats?.enrolledExams,  icon: FileText,    color:'text-primary-400'  },
          { label:'Completed',       value: data.stats?.completedExams, icon: CheckCircle, color:'text-emerald-400'  },
          { label:'Avg Score',       value: performance.length
              ? `${Math.round(performance.reduce((s,p)=>s+p.percentage,0)/performance.length)}%`
              : '—',                                                     icon: TrendingUp,  color:'text-amber-400'    },
          { label:'Best Score',      value: performance.length
              ? `${Math.max(...performance.map(p=>p.percentage))}%`
              : '—',                                                     icon: Award,       color:'text-purple-400'   },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass rounded-2xl p-4 border border-surface-700">
            <Icon size={20} className={`${color} mb-2`}/>
            <div className={`text-2xl font-bold font-display ${color}`}>{value}</div>
            <div className="text-xs text-surface-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Performance Chart */}
      {performance.length >= 2 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={18} className="text-primary-400"/>
            <h2 className="section-title">Performance Across Exams</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={performance} margin={{ top:5, right:20, bottom:5, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
              <XAxis dataKey="examTitle" tick={{ fill:'#64748b', fontSize:11 }}
                tickFormatter={v => v.length>15 ? v.slice(0,15)+'…' : v}/>
              <YAxis domain={[0,100]} tick={{ fill:'#64748b', fontSize:11 }} unit="%"/>
              <Tooltip content={<CustomTooltip/>}/>
              <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4" label={{ value:'Pass', fill:'#f59e0b', fontSize:10 }}/>
              <Line type="monotone" dataKey="percentage" stroke="#6366f1" strokeWidth={2.5}
                dot={{ fill:'#6366f1', r:4 }} activeDot={{ r:6 }} name="Score %"/>
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 flex gap-4 flex-wrap">
            {performance.map((p, i) => (
              <button key={i} onClick={() => navigate(`/results/${p.sessionId}`)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  p.passed ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                           : 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25'
                }`}>
                {p.examTitle.slice(0,20)}{p.examTitle.length>20?'…':''} — {p.percentage}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Exams with Countdown */}
      {data.upcomingExams?.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-primary-400"/>
            <h2 className="section-title">Upcoming Exams</h2>
          </div>
          <div className="space-y-3">
            {data.upcomingExams.map(e => (
              <Link key={e.id} to={`/exams/${e.id}`}
                className="flex items-center gap-4 p-4 rounded-xl bg-surface-800 border border-surface-700 hover:border-primary-500/30 transition-all group">
                <div className="p-2.5 rounded-xl bg-primary-500/20 shrink-0">
                  <FileText size={18} className="text-primary-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate font-heading">{e.title}</div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-surface-400 flex items-center gap-1">
                      <Clock size={10}/>
                      {e.duration_minutes} min
                    </span>
                    {e.start_time && (
                      <span className="text-xs text-surface-400 flex items-center gap-1">
                        <Calendar size={10}/>
                        {new Date(e.start_time).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {e.start_time && new Date(e.start_time) > new Date() ? (
                    <div className="flex items-center gap-1.5 text-xs text-surface-500 mb-1">
                      <Timer size={11}/>
                      <span>Starts in</span>
                    </div>
                  ) : null}
                  {e.start_time
                    ? <Countdown targetDate={e.start_time}/>
                    : <span className="text-xs text-emerald-400 font-medium">Available Now</span>
                  }
                </div>
                {(!e.start_time || new Date(e.start_time) <= new Date()) && (
                  <div className="shrink-0 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg font-semibold group-hover:bg-primary-500 transition-colors">
                    Take Exam
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Completed Exams */}
      {data.completedExams?.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4">Completed Exams</h2>
          <div className="space-y-2">
            {data.completedExams.map(e => {
              const perf = performance.find(p => p.sessionId === e.id);
              return (
                <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-800 border border-surface-700">
                  {perf?.passed
                    ? <CheckCircle size={16} className="text-emerald-400 shrink-0"/>
                    : <span className="w-4 h-4 rounded-full border-2 border-surface-600 shrink-0"/>
                  }
                  <span className="text-sm text-white flex-1 truncate">{e.title}</span>
                  {perf && (
                    <span className={`text-sm font-bold font-mono ${perf.passed?'text-emerald-400':'text-red-400'}`}>
                      {perf.percentage}%
                    </span>
                  )}
                  <span className="text-xs text-surface-500">
                    {e.submitted_at ? new Date(e.submitted_at).toLocaleDateString('en-IN') : '—'}
                  </span>
                  {perf && (
                    <Link to={`/results/${perf.sessionId}`}
                      className="text-xs px-2.5 py-1 rounded-lg bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors font-medium">
                      View Result
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(!data.upcomingExams?.length && !data.completedExams?.length) && (
        <div className="card text-center py-16">
          <FileText size={48} className="text-surface-700 mx-auto mb-4"/>
          <h3 className="font-display text-xl font-semibold text-surface-400 mb-2">No exams yet</h3>
          <p className="text-surface-500 text-sm">You have not been enrolled in any exams.</p>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────
export default function DashboardPage() {
  const { user }              = useAuthStore();
  const [data, setData]       = useState(null);
  const [performance, setPerf] = useState([]);
  const [loading, setLoading] = useState(true);
  const role = user?.role;

  useEffect(() => {
    const fetches = [api.get('/dashboard')];
    if (role === 'student') fetches.push(api.get('/reports/my-performance'));
    Promise.all(fetches)
      .then(([dashRes, perfRes]) => {
        setData(dashRes.data);
        if (perfRes) setPerf(perfRes.data || []);
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [role]);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold text-white mb-1">
          {greeting()}, {user?.firstName}.
        </h1>
        <p className="text-surface-400 font-sans">
          {new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>
      {role === 'admin'    && <AdminDashboard    data={data}/>}
      {role === 'examiner' && <ExaminerDashboard data={data}/>}
      {role === 'student'  && <StudentDashboard  data={data} performance={performance}/>}
      {role === 'org_admin'&& <ExaminerDashboard data={data}/>}
    </div>
  );
}
