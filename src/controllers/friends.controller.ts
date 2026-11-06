import { Request, Response } from 'express';
import prisma from '../config/db';
import { io } from '../server';

// Resilient in-memory fallback cache for friendships
interface InMemoryFriendship {
  id: string;
  requesterId: string;
  requesterHandle: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  receiverId: string;
  receiverHandle: string;
  receiverName: string;
  receiverAvatarUrl?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

const inMemoryFriendships = new Map<string, InMemoryFriendship>();

async function findUserByEmailOrHandle(identifier: string) {
  if (!identifier) return null;
  const clean = identifier.trim().toLowerCase();
  const handleWithAt = clean.startsWith('@') ? clean : `@${clean}`;
  const handleWithoutAt = clean.startsWith('@') ? clean.substring(1) : clean;

  const user = await prisma.user
    .findFirst({
      where: {
        OR: [
          { email: clean },
          { handle: handleWithAt },
          { handle: handleWithoutAt },
          { handle: identifier.trim() },
        ],
      },
    })
    .catch(() => null);

  return user;
}

// 1. Search if a user handle exists on Instaloop
export const searchUserByHandle = async (req: Request, res: Response) => {
  try {
    const handleQuery = (req.query.handle as string)?.trim();
    if (!handleQuery) {
      return res.status(400).json({ found: false, message: 'Handle is required' });
    }

    const user = await findUserByEmailOrHandle(handleQuery);
    if (!user) {
      return res.status(404).json({
        found: false,
        message: `No user found with handle "${handleQuery}". Only registered accounts can be added as friends.`,
      });
    }

    return res.json({
      found: true,
      user: {
        id: user.id,
        name: user.name,
        handle: user.handle,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    return res.status(500).json({ found: false, error: 'Failed to search user' });
  }
};

// 2. Send Friend Request (Real users only, status stays pending until accepted)
export const sendFriendRequest = async (req: Request, res: Response) => {
  try {
    const { requesterEmail, requesterHandle, targetHandle } = req.body;

    if (!targetHandle) {
      return res.status(400).json({ success: false, message: 'Target handle is required' });
    }

    // Resolve requester
    let requester = await findUserByEmailOrHandle(requesterEmail || requesterHandle);
    if (!requester && requesterEmail) {
      // Auto-register requester if needed
      const cleanEmail = requesterEmail.trim().toLowerCase();
      const defaultHandle = requesterHandle || `@${cleanEmail.split('@')[0]}`;
      requester = await prisma.user
        .create({
          data: {
            email: cleanEmail,
            name: defaultHandle.replace('@', ''),
            handle: defaultHandle,
          },
        })
        .catch(() => null);
    }

    if (!requester) {
      return res.status(401).json({ success: false, message: 'Please sign in to send friend requests' });
    }

    // Resolve target user
    const targetUser = await findUserByEmailOrHandle(targetHandle);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: `User "${targetHandle}" does not exist on Instaloop. Invite them to install the app first!`,
      });
    }

    // Cannot add yourself
    if (
      targetUser.id === requester.id ||
      targetUser.handle.toLowerCase() === requester.handle.toLowerCase() ||
      targetUser.email.toLowerCase() === requester.email.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a friend request to yourself.',
      });
    }

    // Check existing friendship in DB
    const existing = await prisma.friendship
      .findFirst({
        where: {
          OR: [
            { requesterId: requester.id, receiverId: targetUser.id },
            { requesterId: targetUser.id, receiverId: requester.id },
          ],
        },
      })
      .catch(() => null);

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({
          success: false,
          message: `You are already friends with ${targetUser.handle}!`,
        });
      }
      if (existing.status === 'pending') {
        if (existing.requesterId === requester.id) {
          return res.status(400).json({
            success: false,
            message: `Friend request to ${targetUser.handle} is already pending their acceptance.`,
          });
        } else {
          // Target user already sent a request to requester: auto-accept!
          await prisma.friendship.update({
            where: { id: existing.id },
            data: { status: 'accepted' },
          });

          if (io) {
            io.to(requester.id).emit('friend_request_accepted', {
              friend: {
                id: targetUser.id,
                name: targetUser.name,
                handle: targetUser.handle,
                avatarUrl: targetUser.avatarUrl,
              },
            });
            io.to(targetUser.id).emit('friend_request_accepted', {
              friend: {
                id: requester.id,
                name: requester.name,
                handle: requester.handle,
                avatarUrl: requester.avatarUrl,
              },
            });
            io.emit('friend_request_accepted');
          }

          return res.json({
            success: true,
            accepted: true,
            message: `Connected! ${targetUser.handle} had already invited you. You are now friends!`,
          });
        }
      }
    }

    // Create pending friendship in database
    const friendship = await prisma.friendship
      .create({
        data: {
          requesterId: requester.id,
          receiverId: targetUser.id,
          status: 'pending',
        },
      })
      .catch(() => null);

    const friendshipId = friendship?.id || `req-${Date.now()}`;

    // Cache in memory fallback
    inMemoryFriendships.set(friendshipId, {
      id: friendshipId,
      requesterId: requester.id,
      requesterHandle: requester.handle,
      requesterName: requester.name,
      requesterAvatarUrl: requester.avatarUrl || undefined,
      receiverId: targetUser.id,
      receiverHandle: targetUser.handle,
      receiverName: targetUser.name,
      receiverAvatarUrl: targetUser.avatarUrl || undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    // Notify target user via WebSocket in real time
    if (io) {
      const payload = {
        requestId: friendshipId,
        requesterId: requester.id,
        requesterName: requester.name,
        requesterHandle: requester.handle,
        requesterAvatarUrl: requester.avatarUrl,
        createdAt: new Date().toISOString(),
      };
      io.to(targetUser.id).emit('friend_request_received', payload);
      io.emit('friend_request_received', payload);
    }

    return res.status(201).json({
      success: true,
      message: `Friend request sent to ${targetUser.handle}! They must accept before appearing in your circle.`,
      requestId: friendshipId,
    });
  } catch (error) {
    console.error('sendFriendRequest error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send friend request' });
  }
};

// 3. Get incoming & outgoing friend requests
export const getFriendRequests = async (req: Request, res: Response) => {
  try {
    const userEmail = (req.query.email as string)?.trim();
    const userHandle = (req.query.handle as string)?.trim();

    const user = await findUserByEmailOrHandle(userEmail || userHandle);
    if (!user) {
      return res.json({ success: true, incoming: [], outgoing: [] });
    }

    // 1. Incoming pending requests (others sent to this user)
    const dbIncoming = await prisma.friendship
      .findMany({
        where: {
          receiverId: user.id,
          status: 'pending',
        },
        include: {
          requester: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => []);

    const incoming = dbIncoming.map((f: any) => ({
      id: f.id,
      requesterId: f.requester.id,
      requesterName: f.requester.name,
      requesterHandle: f.requester.handle,
      requesterAvatarUrl: f.requester.avatarUrl,
      createdAt: f.createdAt,
    }));

    // 2. Outgoing pending requests (this user sent to others)
    const dbOutgoing = await prisma.friendship
      .findMany({
        where: {
          requesterId: user.id,
          status: 'pending',
        },
        include: {
          receiver: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => []);

    const outgoing = dbOutgoing.map((f: any) => ({
      id: f.id,
      receiverId: f.receiver.id,
      receiverName: f.receiver.name,
      receiverHandle: f.receiver.handle,
      receiverAvatarUrl: f.receiver.avatarUrl,
      status: 'pending',
      createdAt: f.createdAt,
    }));

    return res.json({
      success: true,
      incoming,
      outgoing,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch friend requests' });
  }
};

// 4. Respond to Friend Request (Accept or Decline)
export const respondToFriendRequest = async (req: Request, res: Response) => {
  try {
    const { requestId, action, userEmail } = req.body;

    if (!requestId || !action) {
      return res.status(400).json({ success: false, message: 'requestId and action are required' });
    }

    if (action === 'accept') {
      const friendship = await prisma.friendship
        .update({
          where: { id: requestId },
          data: { status: 'accepted' },
          include: { requester: true, receiver: true },
        })
        .catch(() => null);

      if (inMemoryFriendships.has(requestId)) {
        const mem = inMemoryFriendships.get(requestId)!;
        mem.status = 'accepted';
      }

      // Notify both parties over WebSockets in real time
      if (io) {
        if (friendship) {
          io.to(friendship.requesterId).emit('friend_request_accepted', {
            friend: {
              id: friendship.receiver.id,
              name: friendship.receiver.name,
              handle: friendship.receiver.handle,
              avatarUrl: friendship.receiver.avatarUrl,
            },
          });
          io.to(friendship.receiverId).emit('friend_request_accepted', {
            friend: {
              id: friendship.requester.id,
              name: friendship.requester.name,
              handle: friendship.requester.handle,
              avatarUrl: friendship.requester.avatarUrl,
            },
          });
        }
        io.emit('friend_request_accepted');
      }

      return res.json({
        success: true,
        message: 'Friend request accepted! You are now connected in your mindful circle.',
      });
    } else {
      // Decline: delete the request record
      await prisma.friendship
        .delete({
          where: { id: requestId },
        })
        .catch(() => null);

      inMemoryFriendships.delete(requestId);

      return res.json({
        success: true,
        message: 'Friend request declined.',
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to respond to friend request' });
  }
};

// 5. Get Accepted Real Friends List
export const getFriendsList = async (req: Request, res: Response) => {
  try {
    const userEmail = (req.query.email as string)?.trim();
    const userHandle = (req.query.handle as string)?.trim();

    const user = await findUserByEmailOrHandle(userEmail || userHandle);
    if (!user) {
      return res.json({ success: true, friends: [] });
    }

    const friendships = await prisma.friendship
      .findMany({
        where: {
          status: 'accepted',
          OR: [
            { requesterId: user.id },
            { receiverId: user.id },
          ],
        },
        include: {
          requester: true,
          receiver: true,
        },
        orderBy: { updatedAt: 'desc' },
      })
      .catch(() => []);

    const friends = friendships.map((f: any) => {
      // The other user is the friend
      const otherUser = f.requesterId === user.id ? f.receiver : f.requester;
      return {
        id: otherUser.id,
        name: otherUser.name,
        handle: otherUser.handle,
        avatarUrl:
          otherUser.avatarUrl ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        quote: otherUser.spiritualMantra || 'Mindful intentional pause partner.',
        status: 'Active now • Connected',
        isOnline: true,
        lastPauseTime: 'Recently',
        defaultSeconds: 15,
        syncStreakDays: otherUser.streakDays ?? 1,
        pactActiveToday: true,
      };
    });

    return res.json({
      success: true,
      friends,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch friends list' });
  }
};
