import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Download, Shield, AlertTriangle, CheckCircle,
  XCircle, Clock, FileSpreadsheet, TrendingDown
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function ReportPage() {
  const { sessionId } = useParams();
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get(`/reports/session/${sessionId}`)
      .then(r => setReport(r.data))
      .catch(() => toast.error('Failed to load report'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const response = await api.get(`/reports/session/${sessionId}/excel`, { responseType: 'blob' });
      const url  = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ProctorAI_Report_${report.session.student_name?.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Excel report downloaded!');
    } catch { toast.error('Failed to download report'); }
    finally { setDownloading(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!report) return <div className="p-6 text-surface-400">Report not found</div>;

  const { session, answers, alerts, totalMarksObtained, passed } = report;
  const scorePct  = Math.round((totalMarksObtained / session.total_marks) * 100);
  const riskLevel = session.risk_score >= 75 ? 'critical' : session.risk_score >= 50 ? 'high' : session.risk_score >= 25 ? 'medium' : 'low';
  const riskColor = { critical:'text-red-400', high:'text-orange-400', medium:'text-yellow-400', low:'text-emerald-400' };
  const riskBg    = { critical:'border-red-500/30 bg-red-500/5', high:'border-orange-500/30 bg-orange-500/5', medium:'border-yellow-500/30 bg-yellow-500/5', low:'border-emerald-500/30 bg-emerald-500/5' };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/exams" className="p-2 rounded-xl hover:bg-surface-800 text-surface-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="page-title">Examination Report</h1>
          <p className="text-surface-400 text-sm mt-0.5">{session.student_name} · {session.exam_title}</p>
        </div>
        <button
          onClick={downloadExcel}
          disabled={downloading}
          className="btn-success"
        >
          {downloading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating...</>
            : <><FileSpreadsheet size={16} />Download Excel</>
          }
        </button>
      </div>

      {/* Score + Risk + Alerts row */}
      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        {/* Result */}
        <div className={`card text-center border ${passed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          {passed
            ? <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
            : <XCircle    size={32} className="text-red-400 mx-auto mb-2" />
          }
          <div className={`font-display text-3xl font-bold mb-1 ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
            {passed ? 'PASSED' : 'FAILED'}
          </div>
          <div className="text-2xl font-bold text-white font-heading">{scorePct}%</div>
          <div className="text-sm text-surface-400 mt-1">
            {Math.round(totalMarksObtained)} / {session.total_marks} marks
          </div>
          <div className="text-xs text-surface-500 mt-0.5">Pass mark: {session.pass_percentage}%</div>
        </div>

        {/* Risk */}
        <div className={`card text-center border ${riskBg[riskLevel]}`}>
          <Shield size={32} className={`${riskColor[riskLevel]} mx-auto mb-2`} />
          <div className={`font-display text-3xl font-bold mb-1 ${riskColor[riskLevel]}`}>
            {Math.round(session.risk_score || 0)}
          </div>
          <div className="text-sm text-surface-400">Risk Score / 100</div>
          <div className={`text-sm font-semibold mt-1 capitalize ${riskColor[riskLevel]}`}>{riskLevel} Risk</div>
          {session.is_flagged && (
            <div className="mt-2 text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-full">
              Flagged for Review
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="card text-center border border-surface-700">
          <AlertTriangle size={32} className="text-orange-400 mx-auto mb-2" />
          <div className="font-display text-3xl font-bold text-white mb-1">{alerts.length}</div>
          <div className="text-sm text-surface-400">Proctoring Alerts</div>
          <div className="text-xs text-surface-500 mt-1">
            {session.tab_switches || 0} tab switches · {session.copy_paste_attempts || 0} copy attempts
          </div>
        </div>
      </div>

      {/* Session meta */}
      <div className="glass rounded-2xl p-4 mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:'Student',   value: session.student_name },
          { label:'Email',     value: session.email },
          { label:'Started',   value: session.started_at   ? new Date(session.started_at).toLocaleString()   : '—' },
          { label:'Submitted', value: session.submitted_at ? new Date(session.submitted_at).toLocaleString() : 'Not submitted' },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-xs text-surface-500 font-semibold font-heading mb-0.5">{label}</div>
            <div className="text-sm text-white truncate">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Proctoring summary */}
        <div className="card">
          <h3 className="section-title mb-4">Proctoring Summary</h3>
          <div className="space-y-3">
            {[
              { label:'Tab Switches',            value: session.tab_switches || 0,            warn: 2 },
              { label:'Fullscreen Exits',         value: session.fullscreen_exits || 0,         warn: 1 },
              { label:'Copy / Paste Attempts',    value: session.copy_paste_attempts || 0,      warn: 1 },
              { label:'Multiple Faces Detected',  value: session.multiple_faces_detected || 0,  warn: 1 },
              { label:'Gaze Away Events',         value: session.gaze_away_count || 0,          warn: 5 },
              { label:'Total Suspicious Events',  value: session.total_suspicious_events || 0,  warn: 5 },
            ].map(({ label, value, warn }) => (
              <div key={label} className="flex items-center justify-between py-1 border-b border-surface-800 last:border-0">
                <span className="text-sm text-surface-400">{label}</span>
                <span className={`text-sm font-bold font-mono ${value >= warn ? 'text-red-400' : 'text-emerald-400'}`}>{value}</span>
              </div>
            ))}
          </div>
          {session.ai_analysis_summary && (
            <div className="mt-4 pt-4 border-t border-surface-700">
              <p className="text-xs font-semibold text-primary-400 mb-1.5 font-heading">AI Analysis</p>
              <p className="text-xs text-surface-300 leading-relaxed">{session.ai_analysis_summary}</p>
            </div>
          )}
        </div>

        {/* Alert timeline */}
        <div className="card">
          <h3 className="section-title mb-4">Alert Timeline ({alerts.length})</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={28} className="text-emerald-600 mx-auto mb-2" />
                <p className="text-sm text-surface-500">No alerts — clean session</p>
              </div>
            ) : alerts.map(a => (
              <div key={a.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl text-xs border ${
                a.severity === 'critical' ? 'bg-red-500/10 border-red-500/20' :
                a.severity === 'high'     ? 'bg-orange-500/10 border-orange-500/20' :
                'bg-yellow-500/10 border-yellow-500/20'
              }`}>
                <AlertTriangle size={12} className={`mt-0.5 shrink-0 ${
                  a.severity === 'critical' ? 'text-red-400' :
                  a.severity === 'high'     ? 'text-orange-400' : 'text-yellow-400'
                }`} />
                <div className="flex-1">
                  <span className="text-surface-200 capitalize font-medium">{a.alert_type?.replace(/_/g,' ')}</span>
                  {a.description && <span className="text-surface-400 ml-1">— {a.description}</span>}
                </div>
                <span className="text-surface-500 shrink-0">{new Date(a.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Answers table */}
        {answers.length > 0 && (
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Answer Summary</h3>
              <div className="text-sm text-surface-400">
                <span className="text-white font-bold">{Math.round(totalMarksObtained)}</span> / {session.total_marks} marks
              </div>
            </div>
            <div className="space-y-2">
              {answers.map((a, i) => (
                <div key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                  a.is_correct === true  ? 'bg-emerald-500/5 border-emerald-500/15' :
                  a.is_correct === false ? 'bg-red-500/5 border-red-500/15' :
                  'bg-surface-800 border-surface-700'
                }`}>
                  <span className="text-xs font-mono text-surface-500 w-7 shrink-0">Q{i+1}</span>
                  <span className="text-sm text-surface-300 flex-1 line-clamp-1">{a.question_text}</span>
                  <span className="text-xs text-surface-500 shrink-0 capitalize hidden md:block">{a.question_type?.replace(/_/g,' ')}</span>
                  <span className="flex items-center gap-1 text-xs text-surface-500 shrink-0">
                    <Clock size={10} />{a.time_spent_seconds || 0}s
                  </span>
                  {a.is_correct !== null && (
                    a.is_correct
                      ? <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                      : <XCircle    size={16} className="text-red-400 shrink-0" />
                  )}
                  <span className={`text-sm font-bold font-mono shrink-0 ${
                    a.is_correct === true  ? 'text-emerald-400' :
                    a.is_correct === false ? 'text-red-400' : 'text-surface-300'
                  }`}>
                    {a.marks_obtained || 0}/{a.marks}
                  </span>
                </div>
              ))}
            </div>
            {/* Score bar */}
            <div className="mt-4 pt-4 border-t border-surface-700">
              <div className="flex items-center justify-between text-xs text-surface-400 mb-2">
                <span>Score Progress</span>
                <span>{scorePct}%</span>
              </div>
              <div className="w-full bg-surface-800 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${passed ? 'bg-emerald-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(scorePct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-surface-500 mt-1">
                <span>0</span>
                <span className="text-amber-400">Pass: {session.pass_percentage}%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
