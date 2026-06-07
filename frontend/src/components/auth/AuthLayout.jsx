import { motion } from 'framer-motion';

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-brand-50/30 to-surface-100 flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 relative overflow-hidden flex-col justify-between p-12">
        {/* Background grid */}
        <div className="absolute inset-0 opacity-10">
          <div className="bg-grid absolute inset-0" />
        </div>
        
        {/* Floating orbs */}
        <div className="absolute top-20 right-20 w-72 h-72 bg-brand-400/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-white text-xl font-bold tracking-tight">ProctorAI</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold text-white leading-tight mb-6">
              Intelligent Exam<br />
              <span className="text-brand-300">Proctoring</span><br />
              at Scale
            </h1>
            <p className="text-brand-200 text-lg leading-relaxed max-w-md">
              Enterprise-grade AI proctoring with real-time violation detection, 
              behavioral analytics, and comprehensive reporting.
            </p>
          </motion.div>
        </div>

        {/* Feature list */}
        <div className="relative z-10">
          {[
            { icon: '🤖', text: 'AI-powered face & behavior detection' },
            { icon: '📊', text: 'Real-time violation analytics' },
            { icon: '🔒', text: 'Bank-grade security & encryption' },
            { icon: '📋', text: 'Comprehensive exam reports' },
          ].map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-center gap-3 mb-4"
            >
              <span className="text-xl">{f.icon}</span>
              <span className="text-brand-100 text-sm">{f.text}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-surface-900 text-lg font-bold">ProctorAI</span>
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}
