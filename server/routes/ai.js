const express = require('express');
const { protect } = require('../middleware/auth');
const { generateInsights } = require('../utils/aiInsights');

const router = express.Router();

router.get('/insights', protect, async (req, res, next) => {
  try {
    const forceRecommendations = req.query.forceRecommendations === 'true';
    const insights = await generateInsights({ forceRecommendations });
    res.json(insights);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
