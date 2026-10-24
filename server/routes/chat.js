const express = require('express');
const { protect } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { processChatTurn, processSandboxTurn, getProviderConfig } = require('../utils/aiChatbot');
const { CHAT_TOOL_DEFINITIONS } = require('../utils/chatTools');

const router = express.Router();

// Every chatbot endpoint requires a valid JWT (Task 1 Section 4)
router.use(protect);

// Dedicated rate limiter for chatbot requests (default 30 requests / 5 minutes per IP)
const chatRateLimiter = createRateLimiter({
  prefix: 'chat',
  windowMs: 5 * 60 * 1000,
  max: () => Number(process.env.CHAT_RATE_LIMIT_MAX || 30),
  message: 'Too many assistant requests. Please wait a moment before sending another message.',
});

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_ITEMS = 20;

/**
 * GET /api/chat/status
 * Returns whether the external AI provider is configured (without exposing any keys)
 * and lists the approved read-only tools.
 */
router.get('/status', (req, res) => {
  const cfg = getProviderConfig();
  res.json({
    configured: cfg.configured,
    model: cfg.model,
    readOnly: true,
    availableTools: CHAT_TOOL_DEFINITIONS.map(t => t.function.name),
    message: cfg.configured
      ? `StockWise AI Assistant is ready (${cfg.model}).`
      : 'AI Assistant LLM provider is not configured. Set AI_API_KEY in server/.env to enable live AI generation.',
  });
});

/**
 * POST /api/chat
 * Validates user message and bounded history, enforces rate limiting and read-only tool permissions,
 * and returns a PostgreSQL-grounded assistant response.
 */
router.post('/sandbox', chatRateLimiter, async (req, res, next) => {
  try {
    if (process.env.DEMO_READ_ONLY !== 'true') return res.status(403).json({ message: 'Browser demo assistant is not enabled.' });
    const { message, history = [], snapshot } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_LENGTH || !Array.isArray(history) || history.length > MAX_HISTORY_ITEMS || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || JSON.stringify(snapshot).length > 24000) return res.status(400).json({ message: 'Invalid demo assistant request.' });
    const result = await processSandboxTurn({ message: message.trim(), history, snapshot, userContext: { id: req.user.id, role: req.user.role } });
    res.status(result.statusCode).json(result.body);
  } catch (error) { next(error); }
});

router.post('/', chatRateLimiter, async (req, res, next) => {
  try {
    const { message, history } = req.body || {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        message: 'A non-empty message string is required.',
      });
    }

    const trimmed = message.trim();
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `Message is too long (maximum ${MAX_MESSAGE_LENGTH} characters allowed).`,
      });
    }

    if (history !== undefined && !Array.isArray(history)) {
      return res.status(400).json({
        message: 'Conversation history must be an array of messages.',
      });
    }

    if (Array.isArray(history) && history.length > MAX_HISTORY_ITEMS) {
      return res.status(400).json({
        message: `Conversation history cannot exceed ${MAX_HISTORY_ITEMS} messages.`,
      });
    }

    const result = await processChatTurn({
      message: trimmed,
      history: history || [],
      userContext: {
        id: req.user.id,
        role: req.user.role,
        name: req.user.name,
      },
    });

    return res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
