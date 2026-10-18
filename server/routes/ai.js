const express = require('express');
const { protect } = require('../middleware/auth');
const { generateInsights } = require('../utils/aiInsights');

const router = express.Router();

router.get('/insights', protect, async (req, res) => {
  try {
    const insights = await generateInsights();
    res.json(insights);
  } catch (e) {
    console.error('AI insights error', e);
    res.status(500).json({ message: 'Failed to generate insights' });
  }
});

module.exports = router;
