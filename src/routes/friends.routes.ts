import { Router } from 'express';
import {
  searchUserByHandle,
  sendFriendRequest,
  getFriendRequests,
  respondToFriendRequest,
  getFriendsList,
  connectViaSecretInvite,
} from '../controllers/friends.controller';

const router = Router();

// Search user by handle
router.get('/search', searchUserByHandle);

// Send friend request
router.post('/request', sendFriendRequest);

// Get pending incoming and outgoing requests
router.get('/requests', getFriendRequests);

// Respond to friend request (accept / decline)
router.post('/respond', respondToFriendRequest);

// Get accepted real friends list
router.get('/list', getFriendsList);

// Connect via Secret Invite Link (Instant mutual connection)
router.post('/secret-invite-connect', connectViaSecretInvite);

export default router;
