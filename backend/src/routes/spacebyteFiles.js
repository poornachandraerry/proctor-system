const router = require('express').Router();
const { Readable } = require('stream');
const { streamFromSpaceByte } = require('../services/storageService');
const logger = require('../utils/logger');

// Publicly reachable by hash (same trust model as the old express.static
// /uploads route it replaces — the hash itself is unguessable, and it's what
// <audio>/<img> tags need to hit directly without auth headers).
router.get('/:hash', async (req, res) => {
  try {
    const { body, contentType, contentLength } = await streamFromSpaceByte(req.params.hash);
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    Readable.fromWeb(body).pipe(res);
  } catch (err) {
    logger.error('SpaceByte file proxy error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;
