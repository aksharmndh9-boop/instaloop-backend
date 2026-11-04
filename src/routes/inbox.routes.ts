import { Router } from 'express';
import {
  getInbox,
  sendPause,
  completePause,
  stepAwayEarly,
  deletePause,
  bulkDeletePauses,
} from '../controllers/inbox.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticateToken, getInbox);
router.post('/send', authenticateToken, sendPause);
router.post('/:id/complete', authenticateToken, completePause);
router.post('/:id/step-away', authenticateToken, stepAwayEarly);
router.delete('/:id', authenticateToken, deletePause);
router.post('/bulk-delete', authenticateToken, bulkDeletePauses);
router.delete('/', authenticateToken, bulkDeletePauses);

export default router;
