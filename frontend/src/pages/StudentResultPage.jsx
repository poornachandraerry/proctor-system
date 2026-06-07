import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Download, CheckCircle, XCircle, Clock,
  Shield, AlertTriangle, FileText, TrendingUp, Award
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function StudentResultPage() {
  const { sessionId } = useParams();
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [downloading, setDl]      = useState(false);

  useEffect(() => {
    api.get(`/reports/my-result/${sessionId}`)
      .then(r => setResult(r.data))
      .catch(() => toast.error('Failed to load result'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const downloadPDF = async () => {
    setDl(true);
    try {
      const res = await api.get(`/reports/session/${sessionId}/scorecard`, { responseType: 'blob' });
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ScoreCard_${new Date().toISOString().slice(0,10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Score card downloaded!');
    } catch { toast.error('Failed to download score card'); }
    finally { setDl(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (result?.resultsHidden) return (
    <div className="p-6 max-w-lg mx-auto text-center py-24">
      <Clock size={48} className="text-amber-400 mx-auto mb-4"/>
      <h1 className="font-display text-2xl font-bold text-white mb-3">Results Not Yet Released</h1>
      <p className="text-surface-400">{result.message}</p>
      <Link to="/dashboard" className="btn-secondary mt-6 mx-auto w-fit"><ArrowLeft size={15}/>Back to Dashboard</Link>
    </div>
  );

  if (!result) return <div className="p-6 text-surface-400">Result not found</div>;

  const { session, answers, totalMarksObtained, passed } = result;
  const scorePct  = Math.round((totalMarksObtained / session.total_marks) * 100);
  const correct   = answers.filter(a => a.is_correct === true).length;
  const wrong     = answers.filter(a => a.is_correct === false).length;
  const unanswered= answers.filter(a => a.is_correct === null).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/dashboard" className="p-2 rounded-xl hover:bg-surface-800 text-surface-400 hover:text-white transition-colors">
          <ArrowLeft size={20}/>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="page-title">Your Result</h1>
          <p className="text-surface-400 text-sm mt-0.5">{session.exam_title}</p>
        </div>
        <button onClick={downloadPDF} disabled={downloading}
          className="btn-primary">
          {downloading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Generating...</>
            : <><Download size={15}/>Download Score Card</>
          }
        </button>
      </div>

      {/* Result Hero */}
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
        className={`rounded-2xl p-8 mb-6 text-center border ${passed
          ? 'bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border-emerald-500/30'
          : 'bg-gradient-to-br from-red-900/40 to-red-800/20 border-red-500/30'}`}>
        <div className="flex items-center justify-center mb-4">
          {passed
            ? <Award size={56} className="text-emerald-400"/>
            : <XCircle size={56} className="text-red-400"/>
          }
        </div>
        <div className={`font-display text-5xl font-bold mb-2 ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
          {passed ? 'PASSED' : 'FAILED'}
        </div>
        <div className="text-4xl font-bold text-white font-heading mb-1">{scorePct}%</div>
        <div className="text-surface-400">{Math.round(totalMarksObtained)} out of {session.total_marks} marks</div>
        <div className="text-xs text-surface-500 mt-1">Pass mark: {session.pass_percentage}%</div>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label:'Correct',   value: correct,    icon: CheckCircle, color:'text-emerald-400' },
          { label:'Wrong',     value: wrong,      icon: XCircle,     color:'text-red-400'     },
          { label:'Unanswered',value: unanswered, icon: FileText,    color:'text-surface-400' },
          { label:'Duration',  value: session.submitted_at && session.started_at
              ? `${Math.round((new Date(session.submitted_at)-new Date(session.started_at))/60000)} min`
              : '—',           icon: Clock,       color:'text-primary-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass rounded-2xl p-4 text-center border border-surface-700">
            <Icon size={22} className={`${color} mx-auto mb-2`}/>
            <div className={`text-2xl font-bold font-display ${color}`}>{value}</div>
            <div className="text-xs text-surface-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Score progress bar */}
      <div className="glass rounded-2xl p-5 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-surface-400 font-medium">Score Progress</span>
          <span className="text-white font-bold">{scorePct}%</span>
        </div>
        <div className="w-full bg-surface-800 rounded-full h-3 mb-1">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${Math.min(scorePct,100)}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-3 rounded-full ${passed ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
        </div>
        <div className="flex justify-between text-xs text-surface-500">
          <span>0%</span>
          <span className="text-amber-400">Pass: {session.pass_percentage}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Answers breakdown */}
      {answers.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h2 className="section-title mb-4">Answer Breakdown</h2>
          <div className="space-y-2">
            {answers.map((a, i) => (
              <div key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                a.is_correct === true  ? 'bg-emerald-500/5 border-emerald-500/20' :
                a.is_correct === false ? 'bg-red-500/5 border-red-500/20' :
                'bg-surface-800 border-surface-700'
              }`}>
                <span className="text-xs font-mono text-surface-500 w-7 shrink-0">Q{i+1}</span>
                <span className="text-sm text-surface-300 flex-1 line-clamp-1">{a.question_text}</span>
                <span className="text-xs text-surface-500 shrink-0 capitalize hidden md:block">{a.question_type?.replace(/_/g,' ')}</span>
                {a.is_correct === true  && <CheckCircle size={15} className="text-emerald-400 shrink-0"/>}
                {a.is_correct === false && <XCircle    size={15} className="text-red-400 shrink-0"/>}
                <span className={`text-sm font-bold font-mono shrink-0 w-14 text-right ${
                  a.is_correct === true ? 'text-emerald-400' : a.is_correct === false ? 'text-red-400' : 'text-surface-400'
                }`}>{a.marks_obtained || 0}/{a.marks}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
