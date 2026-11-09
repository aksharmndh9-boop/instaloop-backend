import { Router } from 'express';
import {
  googleFederatedAuth,
  getProfile,
  updateProfile,
  syncProSubscription,
} from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/google', googleFederatedAuth);
router.get('/profile', authenticateToken, getProfile);
router.post('/profile', authenticateToken, updateProfile);
router.put('/profile', authenticateToken, updateProfile);
router.post('/pro-subscription', syncProSubscription);

export default router;
