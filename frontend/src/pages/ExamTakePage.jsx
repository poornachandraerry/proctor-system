import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, AlertTriangle, Camera, Shield, ChevronLeft, ChevronRight, Check, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { getSocket } from '../utils/socket';

export default function ExamTakePage() {
  const { sessionId } = useParams();
  const { user, accessToken } = useAuthStore();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [webcamActive, setWebcamActive] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [terminated, setTerminated] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const screenshotRef = useRef(null);
  const socketRef = useRef(null);
  const startTimeRef = useRef({});

  // Load session
  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data: sess } = await api.get(`/sessions/${sessionId}`);
        setSession(sess);
        const { data: qs } = await api.get(`/exams/${sess.exam_id}/questions`);
        setQuestions(qs);
        setTimeLeft(sess.duration_minutes * 60);
        startTimeRef.current[qs[0]?.id] = Date.now();
        setLoading(false);
        setupWebcam();
        requestFullscreen();
        setupEventListeners();
      } catch (err) {
        toast.error('Failed to load exam');
        navigate('/exams');
      }
    };
    loadSession();
    return () => cleanup();
  }, [sessionId]);

  // Socket
  useEffect(() => {
    if (!accessToken || !session) return;
    const socket = getSocket(accessToken);
    socketRef.current = socket;
    socket.emit('join:session', { sessionId });
    socket.on('warning:received', ({ message }) => addWarning(message, true));
    socket.on('session:terminated', ({ reason }) => {
      setTerminated(true);
      toast.error(`Exam terminated: ${reason}`);
    });
    return () => { socket.off('warning:received'); socket.off('session:terminated'); };
  }, [accessToken, session]);

  // Timer
  useEffect(() => {
    if (!timeLeft || loading || terminated || submitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { handleSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [loading, terminated, submitted]);

  // Periodic screenshot
  useEffect(() => {
    if (!session || loading) return;
    const interval = (session.proctoring_settings?.screenshot_interval || 30) * 1000;
    screenshotRef.current = setInterval(() => captureAndAnalyze(), interval);
    return () => clearInterval(screenshotRef.current);
  }, [session, loading]);

  const setupWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setWebcamActive(true);
    } catch {
      addWarning('Webcam access denied. This will be flagged.', true);
      reportEvent('webcam_denied', {});
    }
  };

  const requestFullscreen = () => {
    try { document.documentElement.requestFullscreen?.(); } catch {}
  };

  const setupEventListeners = () => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
  };

  const cleanup = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('copy', handleCopyPaste);
    document.removeEventListener('paste', handleCopyPaste);
    document.removeEventListener('contextmenu', handleContextMenu);
    window.removeEventListener('blur', handleWindowBlur);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    clearInterval(timerRef.current);
    clearInterval(screenshotRef.current);
  };

  const handleVisibilityChange = () => {
    if (document.hidden) { reportEvent('tab_switch', {}); addWarning('Tab switch detected!', false); }
  };
  const handleWindowBlur = () => { reportEvent('focus_lost', {}); };
  const handleCopyPaste = (e) => { e.preventDefault(); reportEvent('copy_paste', {}); addWarning('Copy/paste is not allowed!', true); };
  const handleContextMenu = (e) => e.preventDefault();
  const handleFullscreenChange = () => {
    if (!document.fullscreenElement) { reportEvent('fullscreen_exit', {}); addWarning('Please stay in fullscreen mode!', false); }
  };

  const reportEvent = async (eventType, data) => {
    try {
      await api.post(`/sessions/${sessionId}/events`, { eventType, data });
      socketRef.current?.emit('proctor:event', { sessionId, examId: session?.exam_id, eventType, data });
      setWarningCount(prev => {
        const next = prev + 1;
        const max = session?.proctoring_settings?.max_warnings || 3;
        if (next >= max && !terminated) { setTerminated(true); toast.error('Maximum warnings reached. Exam terminated.'); api.post(`/sessions/${sessionId}/terminate`, { reason: 'Max warnings exceeded' }); }
        return next;
      });
    } catch {}
  };

  const addWarning = (message, isFromProctor = false) => {
    const w = { id: Date.now(), message, isFromProctor, time: new Date().toLocaleTimeString() };
    setWarnings(prev => [w, ...prev].slice(0, 10));
    toast.error(message, { duration: 4000 });
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !webcamActive) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 240;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0, 320, 240);
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      const { data } = await api.post('/ai/analyze-frame', { sessionId, imageBase64 });
      if (!data.safe && data.flags?.length > 0) {
        data.flags.forEach(f => addWarning(`AI Alert: ${f}`, false));
      }
    } catch {}
  };

  const handleAnswer = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const navigateQuestion = (dir) => {
    const q = questions[currentQ];
    if (q) {
      const timeSpent = Math.round((Date.now() - (startTimeRef.current[q.id] || Date.now())) / 1000);
      startTimeRef.current[questions[currentQ + dir]?.id] = Date.now();
    }
    setCurrentQ(prev => Math.max(0, Math.min(questions.length - 1, prev + dir)));
  };

  const handleSubmit = async () => {
    if (submitting || submitted) return;
    if (!confirm('Submit exam? You cannot change your answers after submission.')) return;
    setSubmitting(true);
    try {
      const answerArray = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
        timeSpent: Math.round((Date.now() - (startTimeRef.current[questionId] || Date.now())) / 1000),
      }));
      await api.post(`/sessions/${sessionId}/submit`, { answers: answerArray });
      setSubmitted(true);
      cleanup();
      if (document.fullscreenElement) document.exitFullscreen?.();
    } catch { toast.error('Submission failed. Try again.'); setSubmitting(false); }
  };

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const isLowTime = timeLeft < 300;

  if (loading) return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center">
      <div className="text-center"><div className="w-12 h-12 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-surface-400">Loading exam...</p></div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6 border-2 border-emerald-500">
          <Check size={36} className="text-emerald-400" />
        </div>
        <h1 className="font-display text-3xl font-bold text-white mb-3">Exam Submitted!</h1>
        <p className="text-surface-400 mb-2">Your answers have been recorded.</p>
        <p className="text-surface-400 mb-6">Answered: {Object.keys(answers).length} / {questions.length} questions</p>
        <div className="flex flex-col gap-3 items-center">
          <button onClick={() => navigate(`/results/${sessionId}`)} className="btn-primary mx-auto">
            View Your Result
          </button>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary mx-auto">Back to Dashboard</button>
        </div>
      </motion.div>
    </div>
  );

  if (terminated) return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6 border-2 border-red-500">
          <AlertTriangle size={36} className="text-red-400" />
        </div>
        <h1 className="font-display text-3xl font-bold text-white mb-3">Exam Terminated</h1>
        <p className="text-surface-400 mb-8">Your exam session has been ended due to policy violations.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-secondary mx-auto">Back to Dashboard</button>
      </div>
    </div>
  );

  const currentQuestion = questions[currentQ];

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col" onContextMenu={e => e.preventDefault()}>
      {/* Top bar */}
      <div className="bg-surface-900 border-b border-surface-800 px-6 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-primary-400" />
          <span className="font-display font-semibold text-white text-sm">{session?.exam_title}</span>
        </div>
        <div className={`flex items-center gap-2 ml-auto font-mono font-bold text-lg ${isLowTime ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          <Clock size={18} />{formatTime(timeLeft)}
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${webcamActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
          <Camera size={12} />{webcamActive ? 'Webcam Active' : 'No Webcam'}
        </div>
        {warningCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <AlertTriangle size={12} />{warningCount} warning{warningCount !== 1 ? 's' : ''}
          </div>
        )}
        <button onClick={handleSubmit} disabled={submitting} className="btn-primary text-sm py-2">
          <Send size={14} />{submitting ? 'Submitting...' : 'Submit Exam'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Question panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Question nav */}
          <div className="bg-surface-900/50 border-b border-surface-800 px-6 py-3 flex items-center gap-2 overflow-x-auto shrink-0">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentQ(i)}
                className={`w-8 h-8 rounded-lg text-xs font-medium shrink-0 transition-all ${i === currentQ ? 'bg-primary-600 text-white' : answers[q.id] ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Question content */}
          <div className="flex-1 overflow-y-auto p-8">
            {currentQuestion && (
              <AnimatePresence mode="wait">
                <motion.div key={currentQuestion.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-3 mb-6">
                      <span className="text-xs font-mono text-primary-400 bg-primary-500/10 px-3 py-1 rounded-full">Q{currentQ + 1} of {questions.length}</span>
                      <span className="text-xs text-surface-400">{currentQuestion.marks} mark{currentQuestion.marks !== 1 ? 's' : ''}</span>
                      <span className={`text-xs capitalize ${currentQuestion.difficulty === 'hard' ? 'text-red-400' : currentQuestion.difficulty === 'medium' ? 'text-yellow-400' : 'text-green-400'}`}>{currentQuestion.difficulty}</span>
                    </div>

                    <p className="text-white text-lg leading-relaxed mb-8 font-medium">{currentQuestion.question_text}</p>

                    {/* MCQ options */}
                    {(currentQuestion.question_type === 'mcq' || currentQuestion.question_type === 'true_false') && currentQuestion.options && (
                      <div className="space-y-3">
                        {currentQuestion.options.map((opt) => {
                          const selected = answers[currentQuestion.id] === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => handleAnswer(currentQuestion.id, opt.id)}
                              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-center gap-3 ${selected ? 'bg-primary-600/20 border-primary-500 text-primary-200' : 'bg-surface-800 border-surface-700 text-surface-200 hover:border-primary-500/50 hover:bg-surface-700'}`}
                            >
                              <span className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 ${selected ? 'bg-primary-500 border-primary-500 text-white' : 'border-surface-600 text-surface-400'}`}>{opt.id.toUpperCase()}</span>
                              <span className="text-sm">{opt.text}</span>
                              {selected && <Check size={16} className="ml-auto text-primary-400" />}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Essay */}
                    {currentQuestion.question_type === 'essay' && (
                      <textarea
                        value={answers[currentQuestion.id] || ''}
                        onChange={e => handleAnswer(currentQuestion.id, e.target.value)}
                        className="input w-full"
                        rows={10}
                        placeholder="Write your answer here..."
                      />
                    )}

                    {/* Short answer */}
                    {currentQuestion.question_type === 'short_answer' && (
                      <input
                        type="text"
                        value={answers[currentQuestion.id] || ''}
                        onChange={e => handleAnswer(currentQuestion.id, e.target.value)}
                        className="input w-full"
                        placeholder="Your answer..."
                      />
                    )}

                    {/* Code */}
                    {currentQuestion.question_type === 'code' && (
                      <textarea
                        value={answers[currentQuestion.id] || ''}
                        onChange={e => handleAnswer(currentQuestion.id, e.target.value)}
                        className="w-full bg-surface-900 border border-surface-700 rounded-xl p-4 text-emerald-300 font-mono text-sm focus:outline-none focus:border-primary-500 resize-none"
                        rows={14}
                        placeholder="// Write your code here..."
                        spellCheck={false}
                      />
                    )}

                    {/* Nav */}
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-surface-800">
                      <button onClick={() => navigateQuestion(-1)} disabled={currentQ === 0} className="btn-secondary disabled:opacity-40">
                        <ChevronLeft size={16} /> Previous
                      </button>
                      <span className="text-sm text-surface-500">{Object.keys(answers).length}/{questions.length} answered</span>
                      {currentQ < questions.length - 1 ? (
                        <button onClick={() => navigateQuestion(1)} className="btn-primary"><ChevronRight size={16} /> Next</button>
                      ) : (
                        <button onClick={handleSubmit} disabled={submitting} className="btn-primary bg-emerald-600 hover:bg-emerald-500">
                          <Send size={16} />Submit Exam
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Right panel - webcam + warnings */}
        <div className="w-72 bg-surface-900 border-l border-surface-800 flex flex-col shrink-0">
          {/* Webcam */}
          <div className="p-4 border-b border-surface-800">
            <p className="text-xs text-surface-400 mb-2 flex items-center gap-1.5"><Camera size={12} />Live Monitoring</p>
            <div className="aspect-video bg-surface-800 rounded-xl overflow-hidden relative">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              {!webcamActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center"><Camera size={24} className="text-surface-600 mx-auto mb-1" /><p className="text-xs text-surface-500">No camera</p></div>
                </div>
              )}
              {webcamActive && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />REC
                </div>
              )}
            </div>
          </div>

          {/* Warnings */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs text-surface-400 mb-3 flex items-center gap-1.5"><AlertTriangle size={12} />Alerts ({warnings.length})</p>
            {warnings.length === 0 ? (
              <div className="text-center py-8">
                <Shield size={24} className="text-emerald-600 mx-auto mb-2" />
                <p className="text-xs text-surface-500">No issues detected</p>
              </div>
            ) : (
              <div className="space-y-2">
                {warnings.map(w => (
                  <div key={w.id} className={`p-3 rounded-xl text-xs ${w.isFromProctor ? 'bg-red-500/20 border border-red-500/30 text-red-300' : 'bg-orange-500/10 border border-orange-500/20 text-orange-300'}`}>
                    <p className="font-medium">{w.message}</p>
                    <p className="text-surface-500 mt-0.5">{w.time}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
