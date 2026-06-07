import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertTriangle, Monitor, Users, RefreshCw, Send, X, Shield, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { getSocket } from '../utils/socket';

const SEVERITY_COLOR = { critical: 'text-red-400 bg-red-500/10 border-red-500/30', high: 'text-orange-400 bg-orange-500/10 border-orange-500/30', medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', low: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };

export default function ProctorPage() {
  const { examId } = useParams();
  const { accessToken } = useAuthStore();
  const [sessions, setSessions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [exam, setExam] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [warningMsg, setWarningMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveEvents, setLiveEvents] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [examId]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket(accessToken);
    socketRef.current = socket;
    socket.emit('join:proctor', { examId });

    socket.on('student:event', (data) => {
      setLiveEvents(prev => [{ ...data, id: Date.now() }, ...prev].slice(0, 50));
      if (['tab_switch', 'multiple_faces', 'copy_paste'].includes(data.eventType)) {
        toast.error(`⚠️ ${data.eventType.replace('_', ' ')} — ${data.sessionId?.slice(0, 8)}`, { duration: 5000 });
      }
    });

    socket.on('student:disconnected', (data) => {
      setLiveEvents(prev => [{ ...data, eventType: 'disconnected', severity: 'high', id: Date.now() }, ...prev].slice(0, 50));
    });

    return () => { socket.off('student:event'); socket.off('student:disconnected'); };
  }, [accessToken, examId]);

  const loadData = async () => {
    try {
      const [sessRes, alertRes, examRes] = await Promise.all([
        api.get(`/sessions/active?examId=${examId}`),
        api.get(`/alerts?examId=${examId}&limit=30`),
        api.get(`/exams/${examId}`)
      ]);
      setSessions(sessRes.data);
      setAlerts(alertRes.data.alerts || []);
      setExam(examRes.data);
    } catch { } finally { setLoading(false); }
  };

  const sendWarning = async () => {
    if (!selectedSession || !warningMsg.trim()) return;
    socketRef.current?.emit('proctor:warning', { sessionId: selectedSession.id, message: warningMsg });
    toast.success('Warning sent');
    setWarningMsg('');
  };

  const terminateSession = async (sessionId) => {
    if (!confirm('Terminate this student\'s exam?')) return;
    try {
      await api.post(`/sessions/${sessionId}/terminate`, { reason: 'Terminated by proctor' });
      socketRef.current?.emit('proctor:terminate', { sessionId });
      toast.success('Session terminated');
      loadData();
    } catch { toast.error('Failed to terminate session'); }
  };

  const analyzeSession = async (sessionId) => {
    try {
      const { data } = await api.get(`/ai/analyze-session/${sessionId}`);
      toast.success(`Risk Score: ${data.riskScore}/100 — ${data.isFlagged ? '⚠️ FLAGGED' : '✓ Clean'}`, { duration: 8000 });
    } catch { toast.error('AI analysis failed'); }
  };

  const getRiskColor = (score) => {
    if (score >= 75) return 'text-red-400';
    if (score >= 50) return 'text-orange-400';
    if (score >= 25) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/exams" className="p-2 rounded-xl hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
            <Monitor size={22} className="text-primary-400" />
            Live Proctor — {exam?.title}
          </h1>
          <p className="text-surface-400 text-sm mt-0.5">{sessions.length} active session{sessions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
          </div>
          <button onClick={loadData} className="btn-secondary text-sm py-2"><RefreshCw size={14} />Refresh</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 flex-1 overflow-hidden">
        {/* Students grid */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="card text-center py-12">
              <Users size={40} className="text-surface-600 mx-auto mb-3" />
              <p className="text-surface-400">No active sessions</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {sessions.map((s) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`card cursor-pointer transition-all duration-200 hover:border-primary-500/40 ${selectedSession?.id === s.id ? 'border-primary-500/60 bg-primary-500/5' : ''}`}
                  onClick={() => setSelectedSession(s)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-white text-sm">{s.student_name}</p>
                      <p className="text-xs text-surface-400">{s.email}</p>
                    </div>
                    <span className={`text-xs font-bold ${getRiskColor(s.risk_score || 0)}`}>
                      {Math.round(s.risk_score || 0)}<span className="text-surface-500 font-normal">/100</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div className="bg-surface-800 rounded-lg p-1.5">
                      <div className="text-sm font-bold text-white">{s.tab_switches || 0}</div>
                      <div className="text-xs text-surface-500">Tab sw.</div>
                    </div>
                    <div className="bg-surface-800 rounded-lg p-1.5">
                      <div className="text-sm font-bold text-white">{s.multiple_faces_detected || 0}</div>
                      <div className="text-xs text-surface-500">Faces</div>
                    </div>
                    <div className="bg-surface-800 rounded-lg p-1.5">
                      <div className="text-sm font-bold text-white">{s.alert_count || 0}</div>
                      <div className="text-xs text-surface-500">Alerts</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); analyzeSession(s.id); }} className="btn-secondary text-xs py-1.5 flex-1 justify-center">
                      <Shield size={12} />AI Analyze
                    </button>
                    <Link to={`/reports/${s.id}`} onClick={e => e.stopPropagation()} className="btn-secondary text-xs py-1.5 flex-1 justify-center">Report</Link>
                    <button onClick={(e) => { e.stopPropagation(); terminateSession(s.id); }} className="btn-danger text-xs py-1.5 px-2">
                      <X size={12} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Warning sender */}
          {selectedSession && (
            <div className="card">
              <p className="text-sm font-semibold text-white mb-3">Send Warning to {selectedSession.student_name?.split(' ')[0]}</p>
              <textarea value={warningMsg} onChange={e => setWarningMsg(e.target.value)} className="input text-sm mb-2" rows={2} placeholder="Warning message..." />
              <button onClick={sendWarning} className="btn-primary w-full justify-center text-sm py-2"><Send size={14} />Send Warning</button>
            </div>
          )}

          {/* Live feed */}
          <div className="card flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-primary-400" />
              <p className="text-sm font-semibold text-white">Live Events</p>
              <span className="text-xs text-surface-500 bg-surface-800 px-2 py-0.5 rounded-full ml-auto">{liveEvents.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {liveEvents.length === 0 ? (
                <p className="text-xs text-surface-500 text-center py-4">Waiting for events...</p>
              ) : liveEvents.map(ev => (
                <div key={ev.id} className={`p-2 rounded-lg text-xs border ${SEVERITY_COLOR[ev.severity] || SEVERITY_COLOR.low}`}>
                  <span className="font-medium capitalize">{ev.eventType?.replace('_', ' ')}</span>
                  <span className="text-surface-500 ml-2">{ev.sessionId?.slice(0, 8)}...</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent alerts */}
          <div className="card max-h-72 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white flex items-center gap-2"><AlertTriangle size={14} className="text-red-400" />Recent Alerts</p>
              <Link to="/alerts" className="text-xs text-primary-400">View all</Link>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {alerts.slice(0, 10).map(a => (
                <div key={a.id} className={`p-2 rounded-lg text-xs border ${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.low}`}>
                  <div className="font-medium capitalize">{a.alert_type?.replace('_', ' ')}</div>
                  <div className="text-surface-500">{a.student_name} · {new Date(a.timestamp).toLocaleTimeString()}</div>
                </div>
              ))}
              {alerts.length === 0 && <p className="text-xs text-surface-500 text-center py-4">No alerts yet</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
