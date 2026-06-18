import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, ChevronLeft, ChevronRight, CheckCircle,
  Shield, AlertTriangle, Wifi, WifiOff, Mic, MicOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';

// ── Inline Behaviour Tracker ───────────────────────────────
function useBehaviourTracker(sessionId) {
  const queue = useRef([]);
  const currentQ = useRef(null);
  const questionStart = useRef(null);

  const getTimeOnQ = () =>
    questionStart.current ? Math.round((Date.now() - questionStart.current) / 1000) : 0;

  const enqueue = useCallback((eventType, eventData = {}) => {
    if (!sessionId) return;
    queue.current.push({
      sessionId, questionId: currentQ.current,
      eventType, eventData,
      timeOnQuestion: getTimeOnQ(),
      timestamp: new Date().toISOString(),
    });
  }, [sessionId]);

  const flush = useCallback(async () => {
    if (!queue.current.length) return;
    const toSend = [...queue.current];
    queue.current = [];
    try { await api.post('/behaviour/bulk-log', { events: toSend }); }
    catch { queue.current = [...toSend, ...queue.current]; }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const id = setInterval(flush, 5000);
    return () => { clearInterval(id); flush(); };
  }, [sessionId, flush]);

  useEffect(() => {
    if (!sessionId) return;
    const onVis   = () => enqueue(document.hidden ? 'tab_blurred' : 'tab_focused');
    const onBlur  = () => enqueue('focus_lost');
    const onFocus = () => enqueue('focus_gained');
    const onCopy  = () => enqueue('copy_attempt');
    const onPaste = () => enqueue('paste_attempt');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [sessionId, enqueue]);

  const onQuestionView = useCallback((questionId) => {
    if (currentQ.current === questionId) return;
    if (currentQ.current) enqueue('time_spent', { timeSpent: getTimeOnQ() });
    currentQ.current = questionId;
    questionStart.current = Date.now();
    enqueue('viewed');
  }, [enqueue]);

  const onAnswer = useCallback((isChange = false) => {
    enqueue(isChange ? 'changed_answer' : 'answered');
  }, [enqueue]);

  return { onQuestionView, onAnswer };
}

// ── Inline Audio Capture ───────────────────────────────────
function useAudioCapture(sessionId, enabled) {
  const stream    = useRef(null);
  const recorder  = useRef(null);
  const chunks    = useRef([]);
  const clipIdx   = useRef(0);
  const interval  = useRef(null);

  const upload = useCallback(async (blob, idx) => {
    if (!blob || blob.size < 1000) return;
    try {
      const fd = new FormData();
      fd.append('audio', blob, `clip_${idx}.webm`);
      fd.append('clipIndex', String(idx));
      fd.append('durationS', '60');
      await api.post(`/audio/session/${sessionId}/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (e) { console.warn('Audio upload skipped:', e.message); }
  }, [sessionId]);

  const startClip = useCallback(() => {
    if (!stream.current || !enabled) return;
    chunks.current = [];
    try {
      const mr = new MediaRecorder(stream.current, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
      });
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        upload(blob, clipIdx.current++);
      };
      mr.start();
      recorder.current = mr;
    } catch (e) { console.warn('Recorder error:', e.message); }
  }, [enabled, upload]);

  const stopClip = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!enabled || !sessionId) return;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      startClip();
      interval.current = setInterval(() => { stopClip(); startClip(); }, 60000);
    } catch (e) { console.warn('Audio capture unavailable:', e.message); }
  }, [enabled, sessionId, startClip, stopClip]);

  const stop = useCallback(() => {
    clearInterval(interval.current);
    stopClip();
    if (stream.current) { stream.current.getTracks().forEach(t => t.stop()); stream.current = null; }
  }, [stopClip]);

  useEffect(() => () => stop(), [stop]);
  return { start, stop };
}

// ── Main ExamTakePage ──────────────────────────────────────
export default function ExamTakePage() {
  const { sessionId } = useParams();
  const { user }      = useAuthStore();
  const navigate      = useNavigate();

  const [session, setSession]     = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ]   = useState(0);
  const [answers, setAnswers]     = useState({});
  const [timeLeft, setTimeLeft]   = useState(0);
  const [loading, setLoading]     = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const [warnings, setWarnings]   = useState(0);
  const [online, setOnline]       = useState(navigator.onLine);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const timerRef  = useRef(null);
  const webcamRef = useRef(null);
  const camStream = useRef(null);
  const aiTimer   = useRef(null);

  const behaviour = useBehaviourTracker(sessionId);
  const audio     = useAudioCapture(sessionId, audioEnabled);

  // Load session + questions
  useEffect(() => {
    const load = async () => {
      try {
        const sRes = await api.get(`/sessions/${sessionId}`);
        const s    = sRes.data;
        setSession(s);
        const qRes = await api.get(`/exams/${s.exam_id}/questions`);
        setQuestions(qRes.data);
        const elapsed  = Math.round((Date.now() - new Date(s.started_at)) / 1000);
        const remaining = (s.duration_minutes * 60) - elapsed;
        setTimeLeft(Math.max(remaining, 0));
      } catch { toast.error('Failed to load exam'); navigate('/dashboard'); }
      finally { setLoading(false); }
    };
    load();
  }, [sessionId]);

  // Notify behaviour tracker of question view
  useEffect(() => {
    if (questions[currentQ]) behaviour.onQuestionView(questions[currentQ].id);
  }, [currentQ, questions]);

  // Webcam + audio start
  useEffect(() => {
    if (loading || !session) return;
    const startMedia = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        camStream.current = s;
        if (webcamRef.current) webcamRef.current.srcObject = s;
      } catch { toast.error('Webcam required for this exam'); }
      audio.start();
    };
    startMedia();
    return () => {
      if (camStream.current) camStream.current.getTracks().forEach(t => t.stop());
      audio.stop();
    };
  }, [loading, session]);

  // AI frame analysis every 30s
  useEffect(() => {
    if (!session?.proctoring_settings?.ai_analysis || submitted) return;
    aiTimer.current = setInterval(async () => {
      if (!webcamRef.current || submitted) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 240;
        canvas.getContext('2d').drawImage(webcamRef.current, 0, 0, 320, 240);
        const b64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        await api.post('/ai/analyze-frame', { sessionId, imageBase64: b64 });
      } catch {}
    }, 30000);
    return () => clearInterval(aiTimer.current);
  }, [session, sessionId, submitted]);

  // Countdown timer
  useEffect(() => {
    if (loading || submitted || terminated || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { handleSubmit(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [loading, submitted, terminated]);

  // Online/offline
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Tab switch detection
  useEffect(() => {
    if (!session || submitted) return;
    const onVis = async () => {
      if (!document.hidden) return;
      const nw = warnings + 1;
      setWarnings(nw);
      toast.error(`Warning ${nw}: Tab switching detected!`);
      try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'tab_switch' }); } catch {}
      const max = session.proctoring_settings?.max_warnings || 3;
      if (nw >= max) {
        setTerminated(true);
        try { await api.post(`/sessions/${sessionId}/terminate`, { reason: 'Exceeded tab switch limit' }); } catch {}
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [warnings, session, sessionId, submitted]);

  // Copy/paste block
  useEffect(() => {
    if (!session?.proctoring_settings?.copy_paste_blocked) return;
    const block = async (e) => {
      e.preventDefault();
      toast.error('Copy/paste is not allowed');
      try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'copy_paste' }); } catch {}
    };
    document.addEventListener('copy', block);
    document.addEventListener('paste', block);
    return () => { document.removeEventListener('copy', block); document.removeEventListener('paste', block); };
  }, [session, sessionId]);

  const formatTime = (s) => {
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
    return `${m}:${sec.toString().padStart(2,'0')}`;
  };

  const handleAnswer = (questionId, answer) => {
    const isChange = !!answers[questionId];
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    behaviour.onAnswer(isChange);
  };

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting || submitted) return;
    if (!auto && !confirm('Submit exam? You cannot change answers after submitting.')) return;
    setSubmitting(true);
    clearInterval(timerRef.current);
    audio.stop();
    try {
      const formatted = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer, timeSpent: 0 }));
      await api.post(`/sessions/${sessionId}/submit`, { answers: formatted });
      setSubmitted(true);
    } catch (err) { toast.error(err.response?.data?.error || 'Submission failed'); }
    finally { setSubmitting(false); }
  }, [sessionId, answers, submitting, submitted, audio]);

  // ── Screens ────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center">
      <div className="w-12 h-12 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (terminated) return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-10 max-w-md text-center border border-red-500/30 bg-red-500/5">
        <AlertTriangle size={52} className="text-red-400 mx-auto mb-4"/>
        <h2 className="font-display text-2xl font-bold text-white mb-3">Session Terminated</h2>
        <p className="text-surface-400 mb-6">Your exam session has been terminated due to repeated violations.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-secondary mx-auto">Back to Dashboard</button>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-surface-950 bg-dot flex items-center justify-center p-4">
      <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }}
        className="glass rounded-2xl p-10 max-w-md text-center border border-emerald-500/30 bg-emerald-500/5">
        <CheckCircle size={56} className="text-emerald-400 mx-auto mb-4"/>
        <h2 className="font-display text-3xl font-bold text-white mb-2">Exam Submitted!</h2>
        <p className="text-surface-400 mb-2">Your answers have been recorded.</p>
        <p className="text-surface-400 mb-8">
          Answered: {Object.keys(answers).length} / {questions.length} questions
        </p>
        <div className="flex flex-col gap-3">
          <button onClick={() => navigate(`/results/${sessionId}`)} className="btn-primary mx-auto">
            <CheckCircle size={16}/>View Your Result
          </button>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary mx-auto">
            Back to Dashboard
          </button>
        </div>
      </motion.div>
    </div>
  );

  const q       = questions[currentQ];
  const urgent  = timeLeft <= 300 && timeLeft > 0;
  const answered = Object.keys(answers).length;

  // ── Main exam UI ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-950 flex flex-col" style={{ userSelect:'none' }}>
      {/* Top bar */}
      <div className="bg-surface-900 border-b border-surface-800 px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-primary-400"/>
          <span className="text-sm font-semibold text-white font-heading truncate max-w-[200px]">
            {session?.exam_title}
          </span>
        </div>
        {warnings > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">
            <AlertTriangle size={12}/>
            {warnings} warning{warnings > 1 ? 's' : ''}
          </div>
        )}
        <div className="ml-auto flex items-center gap-4">
          <div className={`flex items-center gap-1 text-xs ${online ? 'text-emerald-400' : 'text-red-400'}`}>
            {online ? <Wifi size={13}/> : <WifiOff size={13}/>}
          </div>
          <div className={`flex items-center gap-1 text-xs ${audioEnabled ? 'text-primary-400' : 'text-surface-500'}`}>
            {audioEnabled ? <Mic size={13}/> : <MicOff size={13}/>}
          </div>
          <div className={`text-lg font-mono font-bold px-3 py-1 rounded-lg ${
            urgent ? 'text-red-400 bg-red-500/10 animate-pulse border border-red-500/20' : 'text-primary-300'
          }`}>{formatTime(timeLeft)}</div>
          <span className="text-xs text-surface-400">{answered}/{questions.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface-800">
        <div className="h-1 bg-primary-500 transition-all duration-500"
          style={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%` }}/>
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

                <div className="flex items-center gap-3 mb-5">
                  <span className="text-sm font-semibold text-primary-400 font-mono">
                    Q{currentQ+1}/{questions.length}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${
                    q.difficulty === 'hard'   ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    q.difficulty === 'medium' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  }`}>{q.difficulty}</span>
                  {q.topic && (
                    <span className="text-xs text-surface-500 bg-surface-800 px-2 py-0.5 rounded">{q.topic}</span>
                  )}
                  <span className="text-xs text-surface-500 ml-auto">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                </div>

                <div className="glass rounded-2xl p-6 mb-5 border border-surface-700">
                  {q.question_html
                    ? <div className="text-surface-100 leading-relaxed" dangerouslySetInnerHTML={{ __html: q.question_html }}/>
                    : <p className="text-base text-surface-100 leading-relaxed">{q.question_text}</p>
                  }
                </div>

                {(q.question_type === 'mcq' || q.question_type === 'true_false') && q.options && (
                  <div className="space-y-3">
                    {q.options.map(opt => {
                      const selected = answers[q.id] === opt.id;
                      return (
                        <button key={opt.id} onClick={() => handleAnswer(q.id, opt.id)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${
                            selected
                              ? 'border-primary-500/60 bg-primary-500/15 shadow-lg shadow-primary-500/10'
                              : 'border-surface-700 bg-surface-800/50 hover:border-primary-500/30 hover:bg-primary-500/5'
                          }`}>
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                            selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-600 text-surface-400'
                          }`}>{opt.id.toUpperCase()}</div>
                          <span className={`text-sm flex-1 ${selected ? 'text-white' : 'text-surface-300'}`}>{opt.text}</span>
                          {selected && <CheckCircle size={18} className="text-primary-400 shrink-0"/>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.question_type === 'short_answer' && (
                  <textarea value={answers[q.id] || ''}
                    onChange={e => handleAnswer(q.id, e.target.value)}
                    className="input resize-none w-full" rows={4} placeholder="Type your answer here..."/>
                )}

                {q.question_type === 'essay' && (
                  <textarea value={answers[q.id] || ''}
                    onChange={e => handleAnswer(q.id, e.target.value)}
                    className="input resize-none w-full" rows={8} placeholder="Write your detailed answer here..."/>
                )}

                {q.question_type === 'code' && (
                  <textarea value={answers[q.id] || ''}
                    onChange={e => handleAnswer(q.id, e.target.value)}
                    className="input resize-none w-full font-mono text-sm" rows={10} placeholder="// Write your code here..."/>
                )}

                <div className="flex items-center justify-between mt-6">
                  <button onClick={() => setCurrentQ(p => Math.max(0, p-1))}
                    disabled={currentQ === 0} className="btn-secondary disabled:opacity-40">
                    <ChevronLeft size={16}/>Previous
                  </button>
                  {answers[q.id] && (
                    <button onClick={() => setAnswers(p => { const n={...p}; delete n[q.id]; return n; })}
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
                      Submit Exam
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-56 bg-surface-900 border-l border-surface-800 flex flex-col shrink-0">
          {/* Webcam */}
          <div className="p-3 border-b border-surface-800">
            <div className="relative rounded-xl overflow-hidden bg-surface-800 aspect-video">
              <video ref={webcamRef} autoPlay muted playsInline className="w-full h-full object-cover"/>
              <div className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
              <div className="absolute bottom-1.5 right-1.5 text-xs text-white bg-black/60 px-1 rounded font-mono">LIVE</div>
            </div>
            <p className="text-xs text-surface-500 text-center mt-1.5">AI Monitoring Active</p>
          </div>

          {/* Question navigator */}
          <div className="flex-1 overflow-y-auto p-3">
            <p className="text-xs font-semibold text-surface-500 mb-2 font-heading uppercase tracking-wider">Questions</p>
            <div className="grid grid-cols-4 gap-1.5">
              {questions.map((qs, i) => (
                <button key={i} onClick={() => setCurrentQ(i)}
                  className={`h-8 rounded-lg text-xs font-mono font-bold transition-all ${
                    i === currentQ
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                      : answers[qs.id]
                      ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                      : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                  }`}>{i+1}</button>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {[
                { color:'bg-primary-600', label:'Current' },
                { color:'bg-emerald-500/25 border border-emerald-500/30', label:'Answered' },
                { color:'bg-surface-800', label:'Unanswered' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-surface-500">
                  <div className={`w-3 h-3 rounded ${color}`}/>{label}
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="p-3 border-t border-surface-800">
            <button onClick={() => handleSubmit()} disabled={submitting}
              className="btn-primary w-full justify-center text-sm py-2.5">
              {submitting
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                : <CheckCircle size={15}/>
              }
              Submit Exam
            </button>
            <p className="text-xs text-surface-600 text-center mt-1.5">
              {answered} of {questions.length} answered
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
