const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function initSocketIO(io) {
  // Auth middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.role = decoded.role;
      next();
    } catch { next(new Error('Invalid token')); }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} user: ${socket.userId}`);

    // Join rooms
    socket.on('join:exam', ({ examId }) => {
      socket.join(`exam:${examId}`);
      socket.examId = examId;
    });

    socket.on('join:session', ({ sessionId }) => {
      socket.join(`session:${sessionId}`);
      socket.sessionId = sessionId;
    });

    socket.on('join:proctor', ({ examId }) => {
      if (['admin', 'examiner'].includes(socket.role)) {
        socket.join(`proctor:${examId}`);
      }
    });

    // Real-time proctor events from student
    socket.on('proctor:event', ({ sessionId, examId, eventType, data }) => {
      // Broadcast to proctors watching this exam
      io.to(`proctor:${examId}`).emit('student:event', {
        sessionId, userId: socket.userId, eventType, data, timestamp: new Date()
      });
    });

    // Proctor sends video frame for display
    socket.on('student:frame', ({ sessionId, examId, frameData }) => {
      io.to(`proctor:${examId}`).emit('session:frame', {
        sessionId, userId: socket.userId, frameData, timestamp: new Date()
      });
    });

    // Proctor sends warning to student
    socket.on('proctor:warning', ({ sessionId, message }) => {
      io.to(`session:${sessionId}`).emit('warning:received', { message, timestamp: new Date() });
    });

    // Proctor terminates session
    socket.on('proctor:terminate', ({ sessionId }) => {
      io.to(`session:${sessionId}`).emit('session:terminated', { reason: 'Terminated by proctor', timestamp: new Date() });
    });

    // Heartbeat
    socket.on('heartbeat', ({ sessionId }) => {
      socket.emit('heartbeat:ack', { timestamp: new Date() });
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
      if (socket.examId) {
        io.to(`proctor:${socket.examId}`).emit('student:disconnected', {
          userId: socket.userId, sessionId: socket.sessionId, timestamp: new Date()
        });
      }
    });
  });

  return io;
}

module.exports = { initSocketIO };
