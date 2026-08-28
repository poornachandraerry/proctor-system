import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Clock, Users, FileText, Shield, Monitor,
  Play, CheckCircle, FileSpreadsheet, Edit2, Mail,
  Globe, Lock, Building2, Eye, EyeOff, AlertTriangle, XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import ExamAccessPage from './ExamAccessPage';

const ACCESS_INFO = {
  open:             { label:'Open Access',    color:'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', icon: Globe    },
  email_whitelist:  { label:'Invite Only',    color:'text-amber-400 border-amber-500/30 bg-amber-500/10',      icon: Mail     },
  domain_whitelist: { label:'Domain Locked',  color:'text-blue-400 border-blue-500/30 bg-blue-500/10',         icon: Building2},
  invite_only:      { label:'Invite Only',    color:'text-purple-400 border-purple-500/30 bg-purple-500/10',   icon: Lock     },
};

export default function ExamDetailPage() {
  const { id }    = useParams();
  const { user }  = useAuthStore();
  const navigate  = useNavigate();

  const [exam, setExam]           = useState(null);
  const [questions, setQuestions] = useState([]);
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [starting, setStarting]   = useState(false);
  const [downloading, setDl]      = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [access, setAccess]       = useState(null); // { allowed, alreadyAttempted, sessionId, reason }
  const [sessions, setSessions]   = useState([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const isStaff = ['admin','org_admin','examiner'].includes(user?.role);

  useEffect(() => {
    const load = async () => {
      try {
        const [examRes, qRes] = await Promise.all([
          api.get(`/exams/${id}`),
          api.get(`/exams/${id}/questions`),
        ]);
        setExam(examRes.data);
        setQuestions(qRes.data);
        if (isStaff) {
          const sRes = await api.get(`/exams/${id}/stats`);
          setStats(sRes.data);
          try {
            const sessRes = await api.get(`/reports/exam/${id}/sessions`);
            setSessions(sessRes.data);
          } catch {} finally { setSessionsLoaded(true); }
        } else {
          try {
            const aRes = await api.get(`/exam-access/check/${id}`);
            setAccess(aRes.data);
          } catch { /* non-fatal — Start Exam click will re-check anyway */ }
        }
      } catch { toast.error('Failed to load exam'); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  const handlePublish = async () => {
    try {
      await api.patch(`/exams/${id}/publish`);
      setExam(p => ({ ...p, status: 'published' }));
      toast.success('Exam published!');
    } catch (err) { toast.error(err.response?.data?.error || 'Publish failed'); }
  };

  const handleStart = async () => {
    // A quick access check up front lets us bounce straight to the results
    // page for an already-submitted attempt, without asking the candidate
    // for camera/mic permission on the readiness page for nothing. The real
    // fullscreen request + session start happens on the readiness page,
    // where "I'm ready — Start Exam" is itself a fresh user gesture (needed
    // because requestFullscreen() only works inside a direct click handler).
    setStarting(true);
    try {
      const accessRes = await api.get(`/exam-access/check/${id}`);
      if (!accessRes.data.allowed) {
        if (accessRes.data.alreadyAttempted) {
          toast.error(accessRes.data.reason || 'You have already attempted this exam');
          navigate(`/results/${accessRes.data.sessionId}`);
        } else {
          toast.error(accessRes.data.reason || 'You do not have access to this exam');
        }
        setStarting(false);
        return;
      }
      navigate(`/exam/${id}/ready`);
    } catch (err) {
      if (err.response?.data?.code === 'ALREADY_ATTEMPTED') {
        toast.error(err.response.data.error);
        navigate(`/results/${err.response.data.sessionId}`);
      } else {
        toast.error(err.response?.data?.error || 'Failed to check exam access');
      }
      setStarting(false);
    }
  };

  const downloadReport = async () => {
    setDl(true);
    try {
      const res = await api.get(`/reports/exam/${id}/excel`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href = url;
      a.download = `ProctorAIQ_${exam.title.replace(/\s+/g,'_').slice(0,30)}_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded!');
    } catch { toast.error('Failed to download'); }
    finally { setDl(false); }
  };

  const toggleResults = async () => {
    try {
      const newVal = !exam.show_results_to_student;
      await api.put(`/exams/${id}`, { showResultsToStudent: newVal });
      setExam(p => ({ ...p, show_results_to_student: newVal }));
      toast.success(newVal ? 'Results visible to students' : 'Results hidden from students');
    } catch { toast.error('Failed to update'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );
  if (!exam) return <div className="p-6 text-surface-400">Exam not found</div>;

  const settings    = exam.proctoring_settings || {};
  const accessInfo  = ACCESS_INFO[exam.access_type] || ACCESS_INFO.open;
  const AccessIcon  = accessInfo.icon;

  const STAFF_TABS = [
    { id:'overview', label:'Overview'    },
    { id:'access',   label:'Access Control', badge: exam.access_type !== 'open' ? '●' : null },
    { id:'results',  label:'Results'    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/exams" className="p-2 rounded-xl hover:bg-surface-800 text-surface-400 hover:text-white transition-colors">
          <ArrowLeft size={20}/>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="page-title truncate">{exam.title}</h1>
          <p className="text-surface-400 text-sm mt-0.5">{exam.creator_name && `Created by ${exam.creator_name}`}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border flex items-center gap-1 ${accessInfo.color}`}>
            <AccessIcon size={11}/>{accessInfo.label}
          </span>
          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
            exam.status==='published' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
            exam.status==='active'    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
            'bg-surface-700 text-surface-400 border-surface-600'}`}>
            {exam.status}
          </span>
        </div>
      </div>

      {/* Staff tabs */}
      {isStaff && (
        <div className="flex gap-1 bg-surface-900 rounded-xl p-1 mb-5 border border-surface-800 w-fit">
          {STAFF_TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all font-heading ${activeTab===t.id?'bg-primary-600 text-white':'text-surface-400 hover:text-white'}`}>
              {t.label}
              {t.badge && <span className="text-amber-400 text-xs">{t.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* Info card */}
            <div className="card">
              <h2 className="section-title mb-4">Overview</h2>
              {exam.description && <p className="text-surface-300 text-sm mb-4 leading-relaxed">{exam.description}</p>}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon:Clock,    label:'Duration',  value:`${exam.duration_minutes} min` },
                  { icon:FileText, label:'Questions', value:exam.question_count || questions.length },
                  { icon:Users,    label:'Enrolled',  value:exam.enrolled_count || 0 },
                ].map(({ icon:Icon, label, value }) => (
                  <div key={label} className="bg-surface-800 rounded-xl p-3 text-center border border-surface-700">
                    <Icon size={16} className="text-primary-400 mx-auto mb-1.5"/>
                    <div className="text-lg font-bold text-white font-heading">{value}</div>
                    <div className="text-xs text-surface-500">{label}</div>
                  </div>
                ))}
              </div>
              {exam.instructions && (
                <div className="mt-4 pt-4 border-t border-surface-700">
                  <p className="text-xs font-semibold text-surface-400 font-heading mb-2">Instructions</p>
                  <p className="text-sm text-surface-300 leading-relaxed">{exam.instructions}</p>
                </div>
              )}
            </div>

            {/* Questions (staff only) */}
            {isStaff && questions.length > 0 && (
              <div className="card">
                <h2 className="section-title mb-4">Questions ({questions.length})</h2>
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div key={q.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface-800 border border-surface-700">
                      <span className="text-xs font-mono text-primary-400 shrink-0 mt-0.5 w-7">Q{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-surface-200 line-clamp-2">{q.question_text}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-surface-500 capitalize">{q.question_type?.replace(/_/g,' ')}</span>
                          <span className="text-surface-600 text-xs">·</span>
                          <span className="text-xs text-surface-500">{q.marks}m</span>
                          {q.negative_marks > 0 && <span className="text-xs text-red-400">-{q.negative_marks}</span>}
                          <span className={`text-xs capitalize ${q.difficulty==='hard'?'text-red-400':q.difficulty==='medium'?'text-amber-400':'text-emerald-400'}`}>{q.difficulty}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!isStaff && (
              <div className="card text-center py-8">
                <FileText size={32} className="text-surface-600 mx-auto mb-3"/>
                <p className="text-sm text-surface-400">Questions will be shown when you start the exam</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Actions */}
            <div className="card space-y-3">
              {isStaff ? (
                <>
                  {exam.status === 'draft' && (
                    <button onClick={handlePublish} className="btn-primary w-full justify-center">
                      <CheckCircle size={16}/>Publish Exam
                    </button>
                  )}
                  {(exam.status === 'published' || exam.status === 'active') && (
                    <Link to={`/proctor/${exam.id}`} className="btn-primary w-full justify-center">
                      <Monitor size={16}/>Open Proctor Console
                    </Link>
                  )}
                  <button onClick={downloadReport} disabled={downloading} className="btn-success w-full justify-center">
                    {downloading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <FileSpreadsheet size={16}/>}
                    Download Report
                  </button>
                </>
              ) : (
                exam.status === 'published' ? (
                  access?.alreadyAttempted ? (
                    <>
                      <div className="text-center text-sm text-emerald-400 font-semibold py-2 flex items-center justify-center gap-1.5">
                        <CheckCircle size={15}/>Already Submitted
                      </div>
                      <Link to={`/results/${access.sessionId}`} className="btn-secondary w-full justify-center">
                        View Your Result
                      </Link>
                    </>
                  ) : (
                    <button onClick={handleStart} disabled={starting} className="btn-primary w-full justify-center py-3 text-base">
                      {starting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Starting...</> : <><Play size={16}/>Start Exam</>}
                    </button>
                  )
                ) : (
                  <div className="text-center text-sm text-surface-400 py-2">Exam not available yet</div>
                )
              )}
            </div>

            {/* Proctoring rules */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={15} className="text-primary-400"/>
                <h3 className="text-sm font-semibold text-white font-heading">Proctoring Rules</h3>
              </div>
              <div className="space-y-2">
                {[
                  { label:'Webcam Required',       val: settings.webcam_required },
                  { label:'Fullscreen Mode',        val: settings.fullscreen_required },
                  { label:'Screen Share Required',  val: settings.screen_share_required },
                  { label:'Tab Switching Blocked',  val: !settings.tab_switch_allowed },
                  { label:'Copy/Paste Blocked',     val: settings.copy_paste_blocked },
                  { label:'Face Detection',         val: settings.face_detection },
                  { label:'AI Monitoring',          val: settings.ai_analysis },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-surface-400">{label}</span>
                    <span className={val ? 'text-emerald-400 font-medium' : 'text-surface-600'}>{val ? '✓ On' : '✗ Off'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            {isStaff && stats && (
              <div className="card">
                <h3 className="text-sm font-semibold text-white font-heading mb-3">Statistics</h3>
                <div className="space-y-2">
                  {[
                    { label:'Total Sessions',    value: stats.sessions?.total     || 0 },
                    { label:'Completed',         value: stats.sessions?.completed  || 0 },
                    { label:'Avg Risk Score',    value: `${Math.round(stats.sessions?.avg_risk || 0)}/100`, color:'text-orange-400' },
                    { label:'Suspicious Events', value: stats.sessions?.total_events || 0, color:'text-red-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-center py-1 border-b border-surface-800 last:border-0">
                      <span className="text-xs text-surface-400">{label}</span>
                      <span className={`text-sm font-bold font-mono ${color || 'text-white'}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ACCESS CONTROL TAB ──────────────────────────────── */}
      {activeTab === 'access' && isStaff && (
        <ExamAccessPage examId={id}/>
      )}

      {/* ── SETTINGS TAB ────────────────────────────────────── */}
      {activeTab === 'results' && isStaff && (
        <div className="space-y-5">
          <div className="card">
            <h2 className="section-title mb-4">Candidates ({sessions.length})</h2>
            {!sessionsLoaded ? (
              <div className="text-sm text-surface-500 py-6 text-center">Loading...</div>
            ) : sessions.length === 0 ? (
              <div className="text-sm text-surface-500 py-8 text-center">No candidates have attempted this exam yet.</div>
            ) : (
              <div className="divide-y divide-surface-800">
                {sessions.map(s => (
                  <Link key={s.id} to={`/reports/${s.id}`}
                    className="flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-surface-800/60 transition-colors group">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{s.student_name}</div>
                      <div className="text-xs text-surface-500 truncate">{s.email}</div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-3">
                      {Number(s.alert_count) > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertTriangle size={12}/>{s.alert_count}
                        </span>
                      )}
                      <span className="text-xs text-surface-400 w-16 text-right">{s.marks_obtained ?? 0} marks</span>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold border flex items-center gap-1 ${
                        s.status === 'submitted'  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        s.status === 'terminated' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                        s.status === 'active'     ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                        'bg-surface-700 text-surface-400 border-surface-600'}`}>
                        {s.status === 'submitted' && <CheckCircle size={11}/>}
                        {s.status === 'terminated' && <XCircle size={11}/>}
                        {s.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card max-w-lg space-y-4">
            <h2 className="section-title mb-2">Result Settings</h2>
          <div className="flex items-center justify-between p-4 bg-surface-800 rounded-xl border border-surface-700">
            <div>
              <div className="text-sm font-semibold text-white font-heading">Show Results to Students</div>
              <div className="text-xs text-surface-400 mt-0.5">
                {exam.show_results_to_student
                  ? 'Students can see their score and download score card'
                  : 'Results are hidden — students see a "pending" message'}
              </div>
            </div>
            <button onClick={toggleResults}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${exam.show_results_to_student?'bg-emerald-500':'bg-surface-600'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${exam.show_results_to_student?'translate-x-5':''}`}/>
            </button>
          </div>
          <p className="text-xs text-surface-500">
            You can release results after reviewing all sessions. Toggle this on when you're ready for students to see their scores.
          </p>
          </div>
        </div>
      )}
    </div>
  );
}
