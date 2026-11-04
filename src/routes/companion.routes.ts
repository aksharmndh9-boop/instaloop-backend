import { Router } from 'express';
import {
  getCompanions,
  getCompanionBreathingPrompt,
  getDailyCompanionPause,
} from '../controllers/companion.controller';

const router = Router();

router.get('/', getCompanions);
router.post('/prompt', getCompanionBreathingPrompt);
router.post('/daily-pause', getDailyCompanionPause);

export default router;
