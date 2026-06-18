import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, CheckCircle, XCircle, ChevronLeft, ChevronRight,
  BookOpen, Award, RotateCcw, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function PracticeTestPage() {
  const navigate      = useNavigate();
  const [session, setSession]       = useState(null);
  const [questions, setQuestions]   = useState([]);
  const [currentQ, setCurrentQ]     = useState(0);
  const [answers, setAnswers]       = useState({});
  const [timeLeft, setTimeLeft]     = useState(0);
  const [submitted, setSubmitted]   = useState(false);
  const [results, setResults]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const raw = localStorage.getItem('practiceSession');
    if (!raw) { navigate('/question-banks'); return; }
    try {
      const parsed = JSON.parse(raw);
      setSession(parsed);
      setQuestions(parsed.questions || []);
      setTimeLeft((parsed.durationMinutes || 20) * 60);
    } catch { navigate('/question-banks'); }
  }, []);

  // Countdown
  useEffect(() => {
    if (!session || submitted || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { handleSubmit(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [session, submitted]);

  const formatTime = s => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleAnswer = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting || submitted) return;
    if (!auto && !confirm('Submit the practice test? You cannot change answers after submitting.')) return;
    setSubmitting(true);
    clearInterval(timerRef.current);
    try {
      const { data } = await api.post(
        `/question-banks/practice/${session.sessionId}/submit`,
        { answers }
      );
      setResults(data);
      setSubmitted(true);
      localStorage.removeItem('practiceSession');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed');
    } finally { setSubmitting(false); }
  }, [session, answers, submitting, submitted]);

  if (!session) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  // ── Results screen ─────────────────────────────────────
  if (submitted && results) {
    const pct    = results.percentage;
    const passed = pct >= 60;
    const correct   = Object.values(results.results).filter(r => r.correct).length;
    const wrong     = Object.values(results.results).filter(r => !r.correct).length;

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="space-y-5">
          {/* Hero */}
          <div className={`rounded-2xl p-8 text-center border ${
            passed
              ? 'bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border-emerald-500/30'
              : 'bg-gradient-to-br from-orange-900/40 to-orange-800/20 border-orange-500/30'
          }`}>
            <Award size={52} className={`mx-auto mb-3 ${passed ? 'text-emerald-400' : 'text-orange-400'}`}/>
            <div className={`font-display text-5xl font-bold mb-2 ${passed ? 'text-emerald-400' : 'text-orange-400'}`}>
              {pct}%
            </div>
            <div className="text-xl text-white font-heading mb-1">
              {Math.round(results.score)} / {Math.round(session.totalMarks)} marks
            </div>
            <div className="text-surface-400 text-sm">{session.bankName}</div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label:'Correct',  value: correct,  icon: CheckCircle, color:'text-emerald-400' },
              { label:'Wrong',    value: wrong,     icon: XCircle,     color:'text-red-400'     },
              { label:'Score',    value: `${pct}%`, icon: Award,       color: passed ? 'text-emerald-400' : 'text-orange-400' },
            ].map(({ label, value, icon:Icon, color }) => (
              <div key={label} className="glass rounded-2xl p-4 text-center border border-surface-700">
                <Icon size={22} className={`${color} mx-auto mb-2`}/>
                <div className={`text-2xl font-bold font-display ${color}`}>{value}</div>
                <div className="text-xs text-surface-500">{label}</div>
              </div>
            ))}
          </div>

          {/* Question review */}
          <div className="card">
            <h3 className="section-title mb-4">Question Review</h3>
            <div className="space-y-3">
              {questions.map((q, i) => {
                const r = results.results[q.id];
                return (
                  <div key={q.id} className={`p-3 rounded-xl border text-sm ${
                    r?.correct
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                  }`}>
                    <div className="flex items-start gap-3">
                      {r?.correct
                        ? <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5"/>
                        : <XCircle    size={15} className="text-red-400 shrink-0 mt-0.5"/>
                      }
                      <div className="flex-1">
                        <p className="text-surface-200 mb-1 line-clamp-2">Q{i+1}. {q.question_text}</p>
                        {!r?.correct && r?.correctAnswer && (
                          <p className="text-xs text-emerald-400">
                            Correct: Option {String(r.correctAnswer).toUpperCase()}
                          </p>
                        )}
                        {r?.explanation && (
                          <p className="text-xs text-surface-400 mt-1 italic">{r.explanation}</p>
                        )}
                      </div>
                      <span className={`text-xs font-mono font-bold shrink-0 ${r?.correct ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r?.marks || 0}m
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => navigate('/question-banks')} className="btn-secondary flex-1 justify-center">
              <BookOpen size={15}/>Back to Banks
            </button>
            <button
              onClick={() => navigate('/question-banks')}
              className="btn-primary flex-1 justify-center">
              <RotateCcw size={15}/>New Practice Test
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Test interface ─────────────────────────────────────
  const q      = questions[currentQ];
  const urgent = timeLeft <= 300 && !submitted;

  return (
    <div className="min-h-screen bg-surface-950 bg-dot flex flex-col">
      {/* Top bar */}
      <div className="bg-surface-900 border-b border-surface-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen size={18} className="text-primary-400"/>
          <div>
            <div className="text-sm font-semibold text-white font-heading">Practice Test</div>
            <div className="text-xs text-surface-400">{session.bankName}</div>
          </div>
        </div>
        <div className={`flex items-center gap-2 text-lg font-mono font-bold ${
          urgent ? 'text-red-400 animate-pulse' : 'text-primary-300'
        }`}>
          <Clock size={18}/>
          {formatTime(timeLeft)}
        </div>
        <div className="text-sm text-surface-400">
          Q{currentQ+1}/{questions.length} · {Object.keys(answers).length} answered
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Question area */}
        <div className="flex-1 overflow-y-auto p-6">
          {q && (
            <AnimatePresence mode="wait">
              <motion.div key={currentQ}
                initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}
                exit={{ opacity:0, x:-20 }} transition={{ duration:0.2 }}
                className="max-w-3xl mx-auto">

                {/* Question header */}
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs font-mono text-primary-400">Q{currentQ+1}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    q.difficulty === 'hard'   ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    q.difficulty === 'medium' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  }`}>{q.difficulty}</span>
                  {q.topic && (
                    <span className="text-xs text-surface-500 bg-surface-800 px-2 py-0.5 rounded">{q.topic}</span>
                  )}
                  <span className="text-xs text-surface-500 ml-auto">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                </div>

                {/* Question text */}
                <div className="card mb-5">
                  <p className="text-base text-surface-100 leading-relaxed">{q.question_text}</p>
                </div>

                {/* MCQ options */}
                {(q.question_type === 'mcq' || q.question_type === 'true_false') && q.options && (
                  <div className="space-y-3">
                    {q.options.map(opt => {
                      const selected = answers[q.id] === opt.id;
                      return (
                        <button key={opt.id} onClick={() => handleAnswer(q.id, opt.id)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                            selected
                              ? 'border-primary-500/60 bg-primary-500/15 text-white'
                              : 'border-surface-700 bg-surface-800/50 text-surface-300 hover:border-primary-500/30 hover:bg-primary-500/5'
                          }`}>
                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                            selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-600 text-surface-500'
                          }`}>{opt.id.toUpperCase()}</div>
                          <span className="text-sm">{opt.text}</span>
                          {selected && <CheckCircle size={16} className="text-primary-400 ml-auto shrink-0"/>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Short answer */}
                {q.question_type === 'short_answer' && (
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={e => handleAnswer(q.id, e.target.value)}
                    className="input resize-none w-full" rows={4}
                    placeholder="Type your answer here..."/>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between mt-6">
                  <button onClick={() => setCurrentQ(p => Math.max(0, p-1))}
                    disabled={currentQ === 0} className="btn-secondary disabled:opacity-40">
                    <ChevronLeft size={16}/>Previous
                  </button>
                  {answers[q.id] && (
                    <button
                      onClick={() => setAnswers(p => { const n = {...p}; delete n[q.id]; return n; })}
                      className="text-xs text-surface-500 hover:text-red-400 transition-colors">
                      Clear Answer
                    </button>
                  )}
                  {currentQ < questions.length - 1 ? (
                    <button onClick={() => setCurrentQ(p => p+1)} className="btn-primary">
                      Next<ChevronRight size={16}/>
                    </button>
                  ) : (
                    <button onClick={() => handleSubmit()} disabled={submitting} className="btn-success">
                      {submitting
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                        : <CheckCircle size={16}/>
                      }
                      Submit Test
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Sidebar — question map */}
        <div className="w-52 bg-surface-900 border-l border-surface-800 p-4 overflow-y-auto flex flex-col">
          <p className="text-xs font-semibold text-surface-400 mb-3 font-heading uppercase tracking-wider">
            Navigator
          </p>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {questions.map((_, i) => (
              <button key={i} onClick={() => setCurrentQ(i)}
                className={`h-8 rounded-lg text-xs font-mono font-bold transition-colors ${
                  i === currentQ
                    ? 'bg-primary-600 text-white'
                    : answers[questions[i]?.id]
                    ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                }`}>
                {i+1}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 text-xs mb-auto">
            {[
              { color:'bg-primary-600', label:'Current' },
              { color:'bg-emerald-500/30 border border-emerald-500/30', label:'Answered' },
              { color:'bg-surface-800', label:'Not answered' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${color}`}/>
                <span className="text-surface-500">{label}</span>
              </div>
            ))}
          </div>

          <button onClick={() => handleSubmit()} disabled={submitting}
            className="btn-primary w-full justify-center mt-4 text-sm py-2">
            {submitting
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              : <CheckCircle size={14}/>
            }
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
