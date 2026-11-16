const express = require('express');
const router = express.Router();
const { computePlatformStats } = require('../controller/statsController');

// GET /stats - Returns aggregated stats for the platform
router.get('/', async (req, res) => {
  try {
    const data = await computePlatformStats();
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching stats:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching stats',
    });
  }
});

module.exports = router;
