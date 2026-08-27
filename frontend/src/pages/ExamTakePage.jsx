import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, ChevronLeft, ChevronRight, CheckCircle,
  Shield, AlertTriangle, Wifi, WifiOff, Mic, MicOff, Maximize
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
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [webcamPermissionDenied, setWebcamPermissionDenied] = useState(false);
  const [webcamRetrying, setWebcamRetrying] = useState(false);
  const [screenSharePermissionDenied, setScreenSharePermissionDenied] = useState(false);
  const [screenShareRetrying, setScreenShareRetrying] = useState(false);

  const timerRef   = useRef(null);
  const webcamRef  = useRef(null);
  const camStream  = useRef(null);
  const screenStream = useRef(null);
  const screenVideoRef = useRef(null); // offscreen <video> fed by the screen-share stream, for frame capture
  const aiTimer    = useRef(null);
  const camCheckTimer = useRef(null);
  const examRootRef = useRef(null);
  const isSubmitExitRef = useRef(false); // true while exitFullscreen() is called as part of a legitimate submit

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

  // ── FULLSCREEN ENFORCEMENT (Issue #1 fix) ───────────────
  // Many mobile browsers — iOS Safari in particular, and some Android
  // in-app/webview browsers — do NOT implement the Fullscreen API for
  // ordinary web content at all (iOS only supports it for <video>
  // playback). On those browsers requestFullscreen() either doesn't
  // exist or silently no-ops, so document.fullscreenElement can never
  // become truthy no matter how many times the candidate taps "Enable
  // Fullscreen" — the browser's address bar auto-hiding on scroll just
  // *looks* like fullscreen, which is why it seems stuck. Gating exam
  // entry on an API the device can't support would lock candidates out
  // permanently, so we detect support up front and skip the requirement
  // (with a one-time heads-up) rather than enforce something impossible.
  const isFullscreenSupported = () => {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
  };

  const requestFullscreen = useCallback(async () => {
    const el = examRootRef.current || document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) await el.msRequestFullscreen();
      setNeedsFullscreen(false);
    } catch (e) {
      console.warn('Fullscreen request failed:', e.message);
    }
  }, []);

  const isFullscreenActive = () =>
    !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);

  // Capture a frame as evidence and upload it, tagged to a violation type.
  // For tab_switch, prefer the screen-share stream (shows the other window
  // the candidate navigated to) when available; otherwise falls back to the
  // webcam, same as every other violation type.
  // Best-effort — never blocks or throws into the caller.
  const captureEvidence = useCallback((alertType) => {
    try {
      const useScreen = alertType === 'tab_switch' && screenVideoRef.current && screenVideoRef.current.videoWidth;
      const source = useScreen ? screenVideoRef.current : webcamRef.current;
      if (!source || !source.videoWidth) return;
      const canvas = document.createElement('canvas');
      canvas.width = useScreen ? 640 : 320;
      canvas.height = useScreen ? 400 : 240;
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      api.post(`/evidence/session/${sessionId}/upload`, { imageBase64: b64, alertType, source: useScreen ? 'screen' : 'webcam' }).catch(() => {});
    } catch {}
  }, [sessionId]);

  const retryWebcamAccess = useCallback(async () => {
    setWebcamRetrying(true);
    try { if (retryWebcamRef.current) await retryWebcamRef.current(); }
    finally { setWebcamRetrying(false); }
  }, []);

  // Require fullscreen at exam start if setting is enabled — only on
  // browsers that can actually grant it (see note above).
  useEffect(() => {
    if (loading || !session || submitted) return;
    if (!session.proctoring_settings?.fullscreen_required) return;
    if (!isFullscreenSupported()) {
      toast('Fullscreen isn\'t supported on this browser — please stay on this tab for the rest of the exam.', { icon: 'ℹ️', duration: 5000 });
      return;
    }
    if (!isFullscreenActive()) setNeedsFullscreen(true);
  }, [loading, session, submitted]);

  // Detect fullscreen exit during exam and log a violation — skipped
  // entirely on browsers where fullscreen was never actually attainable.
  useEffect(() => {
    if (!session?.proctoring_settings?.fullscreen_required || submitted) return;
    if (!isFullscreenSupported()) return;

    const onFsChange = () => {
      if (isSubmitExitRef.current) return; // legitimate exit as part of submitting — not a violation
      if (!isFullscreenActive() && !submitted) {
        setNeedsFullscreen(true);
        setWarnings(w => {
          const nw = w + 1;
          toast.error(`Warning ${nw}: You exited fullscreen mode!`);
          (async () => {
            try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'fullscreen_exit' }); } catch {}
            captureEvidence('fullscreen_exit');
            const max = session.proctoring_settings?.max_warnings || 3;
            if (nw >= max) {
              setTerminated(true);
              try { await api.post(`/sessions/${sessionId}/terminate`, { reason: 'Exceeded fullscreen exit limit' }); } catch {}
            }
          })();
          return nw;
        });
      } else {
        setNeedsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('MSFullscreenChange', onFsChange);
    };
  }, [session, sessionId, submitted]);

  // Webcam + audio start
  const retryWebcamRef = useRef(null);
  useEffect(() => {
    if (loading || !session) return;
    let track = null;
    const onTrackMute   = async () => {
      // Fires when a physical camera shutter is closed or the OS/browser
      // suspends the feed — the pixel-based check below can miss this
      // because no new (blank) frames may even be delivered.
      setCameraBlocked(true);
      setWarnings(w => {
        const nw = w + 1;
        toast.error(`Warning ${nw}: Camera feed was interrupted (shutter closed or camera disabled)!`);
        return nw;
      });
      try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'camera_blocked', data: { reason: 'track_muted' } }); } catch {}
    };
    const onTrackEnded  = async () => {
      toast.error('Camera connection lost — please reconnect your webcam.');
      try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'camera_blocked', data: { reason: 'track_ended' } }); } catch {}
    };
    const onTrackUnmute = () => setCameraBlocked(false);

    const startMedia = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        camStream.current = s;
        if (webcamRef.current) webcamRef.current.srcObject = s;
        track = s.getVideoTracks()[0];
        if (track) {
          track.addEventListener('mute', onTrackMute);
          track.addEventListener('unmute', onTrackUnmute);
          track.addEventListener('ended', onTrackEnded);
        }
        setWebcamPermissionDenied(false);
      } catch {
        toast.error('Webcam access is required for this exam');
        // Only hard-block the exam if the exam is actually configured to require a webcam.
        if (session?.proctoring_settings?.webcam_required) {
          setWebcamPermissionDenied(true);
          try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'camera_blocked', data: { reason: 'permission_denied' } }); } catch {}
        }
      }
      audio.start();
    };
    startMedia();
    retryWebcamRef.current = startMedia;
    return () => {
      if (track) {
        track.removeEventListener('mute', onTrackMute);
        track.removeEventListener('unmute', onTrackUnmute);
        track.removeEventListener('ended', onTrackEnded);
      }
      if (camStream.current) camStream.current.getTracks().forEach(t => t.stop());
      audio.stop();
    };
  }, [loading, session]);

  // ── SCREEN SHARE for tab-switch evidence ────────────────
  const retryScreenShareRef = useRef(null);
  useEffect(() => {
    if (loading || !session || !session.proctoring_settings?.screen_share_required) return;
    let track = null;
    const startScreenShare = async () => {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 } });
        screenStream.current = s;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = s;
        track = s.getVideoTracks()[0];
        if (track) {
          // Fires if the candidate clicks the browser's native "Stop sharing"
          // control mid-exam — treat that as a violation, same as any other
          // attempt to remove proctoring visibility.
          track.addEventListener('ended', async () => {
            setScreenSharePermissionDenied(true);
            try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'camera_blocked', data: { reason: 'screen_share_stopped' } }); } catch {}
          });
        }
        setScreenSharePermissionDenied(false);
      } catch {
        toast.error('Screen sharing is required for this exam');
        setScreenSharePermissionDenied(true);
        try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'camera_blocked', data: { reason: 'screen_share_denied' } }); } catch {}
      }
    };
    startScreenShare();
    retryScreenShareRef.current = startScreenShare;
    return () => {
      if (screenStream.current) screenStream.current.getTracks().forEach(t => t.stop());
    };
  }, [loading, session, sessionId]);

  const retryScreenShareAccess = useCallback(async () => {
    setScreenShareRetrying(true);
    try { if (retryScreenShareRef.current) await retryScreenShareRef.current(); }
    finally { setScreenShareRetrying(false); }
  }, []);

  // ── CAMERA OCCLUSION / DARKNESS DETECTION (Issue #2 fix) ─
  useEffect(() => {
    if (!session?.proctoring_settings?.webcam_required || submitted) return;

    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 60;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let consecutiveBlocked = 0;
    let baseline = null;     // rolling "normal" brightness, adapts to room lighting
    let isCurrentlyBlocked = false;

    const checkFrame = async () => {
      const video = webcamRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

        let sum = 0, sumSq = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
          sum += lum;
          sumSq += lum * lum;
        }
        const mean = sum / n;
        const variance = (sumSq / n) - (mean * mean);

        // Absolute checks: pitch black (shutter/lens cap), or a flat uniform
        // frame (covered lens, even under auto-exposure gain boost).
        const isDark        = mean < 20;
        const isFlatUniform = variance < 10 && mean < 80;

        // Relative check: a sudden large brightness drop from the room's
        // established baseline. This catches a finger over the lens even
        // in bright rooms, where auto-exposure can push mean well above 60 —
        // fixed absolute thresholds alone miss that case.
        let isRelativeDrop = false;
        if (baseline !== null && baseline > 25) {
          isRelativeDrop = mean < baseline * 0.45 && variance < 25;
        }

        const blocked = isDark || isFlatUniform || isRelativeDrop;

        if (blocked) {
          consecutiveBlocked++;
        } else {
          consecutiveBlocked = 0;
          // Only learn the baseline from confirmed-clear frames.
          baseline = baseline === null ? mean : baseline * 0.9 + mean * 0.1;
          if (isCurrentlyBlocked) {
            isCurrentlyBlocked = false;
            setCameraBlocked(false);
          }
        }

        // Fire on first confirmed blocked read for a near-instant warning —
        // the frame is already sampled every 1.5s so noise is minimal.
        if (consecutiveBlocked >= 1 && !isCurrentlyBlocked) {
          isCurrentlyBlocked = true;
          setCameraBlocked(true);
          setWarnings(w => {
            const nw = w + 1;
            toast.error(`Warning ${nw}: Camera appears blocked or covered!`);
            (async () => {
              try {
                await api.post(`/sessions/${sessionId}/events`, {
                  eventType: 'camera_blocked',
                  data: { mean: Math.round(mean), variance: Math.round(variance) },
                });
              } catch {}
              captureEvidence('camera_blocked');
              const max = session.proctoring_settings?.max_warnings || 3;
              if (nw >= max) {
                setTerminated(true);
                try { await api.post(`/sessions/${sessionId}/terminate`, { reason: 'Camera blocked repeatedly' }); } catch {}
              }
            })();
            return nw;
          });
        }
      } catch (e) {
        // ignore — frame not ready yet
      }
    };

    camCheckTimer.current = setInterval(checkFrame, 1500);
    return () => clearInterval(camCheckTimer.current);
  }, [session, sessionId, submitted]);

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
    const onVis = () => {
      if (!document.hidden) return;
      if (isSubmitExitRef.current) return; // tab hidden as a side-effect of submitting — not a violation
      setWarnings(w => {
        const nw = w + 1;
        toast.error(`Warning ${nw}: Tab switching detected!`);
        (async () => {
          try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'tab_switch' }); } catch {}
          captureEvidence('tab_switch');
          const max = session.proctoring_settings?.max_warnings || 3;
          if (nw >= max) {
            setTerminated(true);
            try { await api.post(`/sessions/${sessionId}/terminate`, { reason: 'Exceeded tab switch limit' }); } catch {}
          }
        })();
        return nw;
      });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [session, sessionId, submitted]);

  // Copy/paste detection — always logged as a violation so it shows up in the
  // admin log, regardless of whether the exam is configured to actively block it.
  useEffect(() => {
    if (!session || submitted) return;
    const blockEnabled = !!session.proctoring_settings?.copy_paste_blocked;
    const onCopyPaste = async (e) => {
      if (blockEnabled) e.preventDefault();
      toast.error(blockEnabled ? 'Copy/paste is not allowed' : 'Copy/paste detected');
      try { await api.post(`/sessions/${sessionId}/events`, { eventType: 'copy_paste' }); } catch {}
      captureEvidence('copy_paste');
    };
    document.addEventListener('copy', onCopyPaste);
    document.addEventListener('paste', onCopyPaste);
    return () => { document.removeEventListener('copy', onCopyPaste); document.removeEventListener('paste', onCopyPaste); };
  }, [session, sessionId, submitted]);

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
    isSubmitExitRef.current = true; // mark this exit as intentional BEFORE triggering it
    if (isFullscreenActive() && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch {}
    }
    try {
      const formatted = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer, timeSpent: 0 }));
      await api.post(`/sessions/${sessionId}/submit`, { answers: formatted });
      setSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed');
      isSubmitExitRef.current = false; // submission failed — resume normal violation detection
      if (session?.proctoring_settings?.fullscreen_required && !isFullscreenActive()) {
        setNeedsFullscreen(true);
      }
    }
    finally { setSubmitting(false); }
  }, [sessionId, answers, submitting, submitted, audio, session]);

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

  return (
    <div ref={examRootRef} className="min-h-screen bg-surface-950 flex flex-col relative" style={{ userSelect:'none' }}>

      {/* ── Webcam required overlay (Issue #1) ─────────────── */}
      {webcamPermissionDenied && !terminated && !submitted && (
        <div className="fixed inset-0 z-[110] bg-surface-950/98 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-10 max-w-md text-center border border-red-500/30 bg-red-500/5">
            <AlertTriangle size={48} className="text-red-400 mx-auto mb-4"/>
            <h2 className="font-display text-2xl font-bold text-white mb-3">Camera Access Required</h2>
            <p className="text-surface-400 mb-3">
              This exam requires webcam access for proctoring. You must allow camera permission to continue.
            </p>
            <p className="text-surface-500 text-xs mb-6">
              If nothing happens when you click below, your browser may have permanently blocked the camera for this
              site — check the camera icon in your address bar (or Settings → Site permissions) and allow it, then retry.
            </p>
            <button onClick={retryWebcamAccess} disabled={webcamRetrying} className="btn-primary mx-auto">
              {webcamRetrying
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                : <Shield size={16}/>
              }
              Grant Camera Access &amp; Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Screen share required overlay ───────────────────── */}
      {!webcamPermissionDenied && screenSharePermissionDenied && !terminated && !submitted && (
        <div className="fixed inset-0 z-[109] bg-surface-950/98 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-10 max-w-md text-center border border-red-500/30 bg-red-500/5">
            <AlertTriangle size={48} className="text-red-400 mx-auto mb-4"/>
            <h2 className="font-display text-2xl font-bold text-white mb-3">Screen Sharing Required</h2>
            <p className="text-surface-400 mb-3">
              This exam requires you to share your entire screen for proctoring. You must allow screen sharing to continue.
            </p>
            <p className="text-surface-500 text-xs mb-6">
              When prompted, choose "Entire Screen" (not just this tab) so violations can be properly recorded.
              If you stop sharing during the exam, this screen will reappear.
            </p>
            <button onClick={retryScreenShareAccess} disabled={screenShareRetrying} className="btn-primary mx-auto">
              {screenShareRetrying
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                : <Shield size={16}/>
              }
              Grant Screen Share &amp; Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Fullscreen required overlay (Issue #1) ────────── */}
      {!webcamPermissionDenied && !screenSharePermissionDenied && needsFullscreen && !terminated && !submitted && (
        <div className="fixed inset-0 z-[100] bg-surface-950/98 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-10 max-w-md text-center border border-amber-500/30 bg-amber-500/5">
            <Maximize size={48} className="text-amber-400 mx-auto mb-4"/>
            <h2 className="font-display text-2xl font-bold text-white mb-3">Fullscreen Required</h2>
            <p className="text-surface-400 mb-6">
              This exam must be taken in fullscreen mode. Click below to continue. Exiting fullscreen during the exam counts as a warning.
            </p>
            <button onClick={requestFullscreen} className="btn-primary mx-auto">
              <Maximize size={16}/>Enter Fullscreen &amp; Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Camera blocked banner (Issue #2) ──────────────── */}
      {cameraBlocked && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-semibold animate-pulse">
          <AlertTriangle size={16}/>
          Camera appears blocked — please uncover your webcam
        </div>
      )}

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

      <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
        {/* Question area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
        <div className="w-full lg:w-56 bg-surface-900 border-t lg:border-t-0 lg:border-l border-surface-800 flex flex-col shrink-0">
          {/* Webcam */}
          <div className="p-3 border-b border-surface-800">
            <div className={`relative rounded-xl overflow-hidden bg-surface-800 aspect-video ${cameraBlocked ? 'ring-2 ring-red-500' : ''}`}>
              <video ref={webcamRef} autoPlay muted playsInline className="w-full h-full object-cover"/>
              <video ref={screenVideoRef} autoPlay muted playsInline className="hidden" aria-hidden="true"/>
              <div className={`absolute top-1.5 left-1.5 w-2 h-2 rounded-full ${cameraBlocked ? 'bg-red-500' : 'bg-red-500 animate-pulse'}`}/>
              <div className="absolute bottom-1.5 right-1.5 text-xs text-white bg-black/60 px-1 rounded font-mono">LIVE</div>
              {cameraBlocked && (
                <div className="absolute inset-0 bg-red-900/40 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-300"/>
                </div>
              )}
            </div>
            <p className={`text-xs text-center mt-1.5 ${cameraBlocked ? 'text-red-400 font-semibold' : 'text-surface-500'}`}>
              {cameraBlocked ? 'Camera blocked!' : 'AI Monitoring Active'}
            </p>
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
