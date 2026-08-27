import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Camera, Mic, CheckCircle2, XCircle, Loader2, ArrowLeft,
  Play, RefreshCw, AlertTriangle, Maximize, ClipboardList,
  MonitorX, Volume2, Eye, Clock, Copy, ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

// 'checking' | 'ok' | 'denied' | 'error'
const initialStatus = { camera: 'checking', mic: 'checking' };

// Human-readable guideline copy, built dynamically from whichever settings
// this specific exam actually has turned on — a candidate should only be
// asked to agree to rules that actually apply to their exam.
const buildGuidelines = (settings = {}) => {
  const items = [
    { key: 'always', icon: Eye, text: 'Stay visible on camera and remain alone in the room for the entire exam.' },
  ];
  if (settings.fullscreen_required)
    items.push({ key: 'fullscreen', icon: Maximize, text: 'The exam must be taken in fullscreen. Exiting fullscreen will be logged as a violation.' });
  if (settings.webcam_required !== false)
    items.push({ key: 'webcam', icon: Camera, text: 'Do not cover, block, or turn away from your webcam at any point.' });
  items.push({ key: 'talk', icon: Volume2, text: 'Do not talk, read questions aloud, or take help from another person — sustained talking is detected automatically.' });
  if (settings.ai_analysis)
    items.push({ key: 'ai', icon: ShieldAlert, text: 'Your webcam is periodically analyzed to detect multiple people, a missing face, or unauthorized material like phones or notes.' });
  if (settings.screen_share_required)
    items.push({ key: 'screen', icon: MonitorX, text: 'Screen sharing is required on supported devices (desktop/laptop browsers). Do not open other windows, tabs, or applications during the exam.' });
  if (settings.copy_paste_blocked)
    items.push({ key: 'copypaste', icon: Copy, text: 'Copy and paste are disabled during this exam.' });
  items.push({ key: 'tabswitch', icon: ClipboardList, text: 'Switching browser tabs or losing window focus is logged as a violation.' });
  if (settings.max_warnings)
    items.push({ key: 'warnings', icon: AlertTriangle, text: `You will be given up to ${settings.max_warnings} warnings. Exceeding this will end your exam automatically and it cannot be retaken.` });
  else
    items.push({ key: 'warnings', icon: AlertTriangle, text: 'Repeated violations will end your exam automatically and it cannot be retaken.' });
  items.push({ key: 'time', icon: Clock, text: 'Once started, the timer cannot be paused. Make sure you have a stable internet connection before beginning.' });
  return items;
};

export default function ExamReadyPage() {
  const { id } = useParams(); // examId
  const navigate = useNavigate();

  const [exam, setExam]       = useState(null);
  const [status, setStatus]   = useState(initialStatus);
  const [micLevel, setMicLevel] = useState(0);
  const [starting, setStarting] = useState(false);
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);

  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef     = useRef(null);

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
  };

  const stopStream = useCallback(() => {
    stopMeter();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCheck = useCallback(async () => {
    setStatus(initialStatus);
    setMicLevel(0);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      const hasVideo = stream.getVideoTracks().length > 0;
      const hasAudio = stream.getAudioTracks().length > 0;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play?.().catch(() => {});
      }
      setStatus({ camera: hasVideo ? 'ok' : 'error', mic: hasAudio ? 'ok' : 'error' });

      if (hasAudio) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setMicLevel(Math.min(100, Math.round(rms * 400)));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (err) {
      const denied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      setStatus({
        camera: denied ? 'denied' : 'error',
        mic: denied ? 'denied' : 'error',
      });
    }
  }, [stopStream]);

  useEffect(() => {
    api.get(`/exams/${id}`).then(({ data }) => setExam(data)).catch(() => {});
    startCheck();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ready = status.camera === 'ok' && status.mic === 'ok' &&
    (exam?.guidelines_ack_required === false || guidelinesAccepted);

  const handleStartExam = async () => {
    // Fullscreen must be requested synchronously inside this click handler —
    // browsers reject requestFullscreen() once any await has run before it.
    if (exam?.proctoring_settings?.fullscreen_required) {
      try {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen) await el.msRequestFullscreen();
      } catch (e) {
        console.warn('Fullscreen request failed:', e.message);
      }
    }

    // Release this preview stream before ExamTakePage requests its own —
    // permission is already granted so it won't re-prompt, and we avoid
    // holding the camera open twice at once.
    stopStream();

    setStarting(true);
    try {
      const accessRes = await api.get(`/exam-access/check/${id}`);
      if (!accessRes.data.allowed) {
        if (accessRes.data.alreadyAttempted) {
          toast.error(accessRes.data.reason || 'You have already attempted this exam');
          navigate(`/results/${accessRes.data.sessionId}`);
        } else {
          toast.error(accessRes.data.reason || 'You do not have access to this exam');
          navigate(`/exams/${id}`);
        }
        return;
      }
      const { data } = await api.post('/sessions/start', { examId: id, guidelinesAccepted: exam?.guidelines_ack_required === false ? undefined : true });
      navigate(`/exam/${data.sessionId}/take`);
    } catch (err) {
      if (err.response?.data?.code === 'ALREADY_ATTEMPTED') {
        toast.error(err.response.data.error);
        navigate(`/results/${err.response.data.sessionId}`);
      } else {
        toast.error(err.response?.data?.error || 'Failed to start exam');
        setStarting(false);
      }
    }
  };

  const StatusRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-3 bg-surface-800 border border-surface-700 rounded-xl px-4 py-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        value === 'ok' ? 'bg-emerald-500/15 text-emerald-400' :
        value === 'checking' ? 'bg-surface-700 text-surface-400' :
        'bg-red-500/15 text-red-400'
      }`}>
        <Icon size={17}/>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-surface-400">
          {value === 'checking' && 'Checking…'}
          {value === 'ok' && 'Working'}
          {value === 'denied' && 'Permission denied — check your browser settings'}
          {value === 'error' && 'Not detected'}
        </div>
      </div>
      {value === 'checking' && <Loader2 size={18} className="text-surface-400 animate-spin shrink-0"/>}
      {value === 'ok' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0"/>}
      {(value === 'denied' || value === 'error') && <XCircle size={18} className="text-red-400 shrink-0"/>}
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <Link to={`/exams/${id}`} className="inline-flex items-center gap-1.5 text-sm text-surface-400 hover:text-white transition-colors mb-4">
          <ArrowLeft size={15}/>Back to exam details
        </Link>

        <div className="glass rounded-2xl p-5 sm:p-6 border border-surface-700/50">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white mb-1">Getting ready</h1>
          <p className="text-surface-400 text-sm mb-5">
            {exam?.title ? `for ${exam.title} — ` : ''}we need to confirm your camera and microphone are working before you start.
          </p>

          {/* Live video preview */}
          <div className="relative aspect-video bg-surface-900 rounded-xl overflow-hidden border border-surface-700 mb-4">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100"/>
            {status.camera !== 'ok' && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-900/90">
                {status.camera === 'checking'
                  ? <Loader2 size={28} className="text-surface-500 animate-spin"/>
                  : <div className="text-center px-6">
                      <Camera size={28} className="text-surface-600 mx-auto mb-2"/>
                      <p className="text-xs text-surface-500">No camera preview available</p>
                    </div>
                }
              </div>
            )}
          </div>

          {/* Mic level meter */}
          {status.mic === 'ok' && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Mic size={13} className="text-surface-400"/>
                <span className="text-xs text-surface-400">Say something to test your mic</span>
              </div>
              <div className="h-2 bg-surface-800 rounded-full overflow-hidden border border-surface-700">
                <motion.div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                  animate={{ width: `${micLevel}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </div>
          )}

          {/* Status rows */}
          <div className="space-y-2 mb-5">
            <StatusRow icon={Camera} label="Camera" value={status.camera}/>
            <StatusRow icon={Mic} label="Microphone" value={status.mic}/>
            {exam?.proctoring_settings?.fullscreen_required && (
              <div className="flex items-center gap-3 bg-surface-800/60 border border-surface-700/60 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-surface-700 text-surface-400">
                  <Maximize size={17}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">Fullscreen</div>
                  <div className="text-xs text-surface-400">Will be requested when you click Start Exam</div>
                </div>
              </div>
            )}
          </div>

          {(status.camera === 'denied' || status.mic === 'denied') && (
            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 mb-4">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-300 leading-relaxed">
                Access was blocked. Click the camera icon in your browser's address bar (or check Settings → Site permissions), allow camera and microphone, then retry below.
              </p>
            </div>
          )}

          {/* Exam guidelines + acceptance */}
          {exam && exam.guidelines_ack_required !== false && (
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                <ClipboardList size={15} className="text-primary-400"/>Exam Guidelines
              </h2>
              <div className="bg-surface-800/60 border border-surface-700/60 rounded-xl p-4 space-y-2.5 max-h-56 overflow-y-auto mb-3">
                {buildGuidelines(exam.proctoring_settings).map(({ key, icon: Icon, text }) => (
                  <div key={key} className="flex items-start gap-2.5">
                    <Icon size={14} className="text-surface-400 shrink-0 mt-0.5"/>
                    <p className="text-xs text-surface-300 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={guidelinesAccepted}
                  onChange={e => setGuidelinesAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-surface-900 shrink-0"
                />
                <span className="text-xs text-surface-300 leading-relaxed">
                  I have read and agree to follow these exam guidelines. I understand violations are automatically detected and may end my exam.
                </span>
              </label>
            </div>
          )}

          <div className="flex gap-2">
            {!ready && (
              <button onClick={startCheck} className="btn-secondary flex-1 justify-center py-3">
                <RefreshCw size={16}/>Retry Check
              </button>
            )}
            <button
              onClick={handleStartExam}
              disabled={!ready || starting}
              className={`btn-primary justify-center py-3 text-base ${ready ? 'flex-1' : 'flex-1 opacity-40 cursor-not-allowed'}`}
            >
              {starting
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Starting...</>
                : <><Play size={16}/>{
                    status.camera !== 'ok' || status.mic !== 'ok' ? 'Waiting for camera & mic' :
                    !ready ? 'Accept guidelines to continue' :
                    'Start Exam'
                  }</>
              }
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
