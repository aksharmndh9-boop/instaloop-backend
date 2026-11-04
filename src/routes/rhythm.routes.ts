import { Router } from 'express';
import {
  getRhythmStats,
  recordLoopBroken,
  getGeminiRhythmInsight,
  getGeminiSoulMantra,
} from '../controllers/rhythm.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/stats', authenticateToken, getRhythmStats);
router.post('/loop-broken', authenticateToken, recordLoopBroken);
router.post('/insight', authenticateToken, getGeminiRhythmInsight);
router.post('/soul-mantra', authenticateToken, getGeminiSoulMantra);

export default router;
