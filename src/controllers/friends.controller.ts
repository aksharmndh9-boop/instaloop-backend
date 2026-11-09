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

// 6. Connect via Secret Invite Link (Instant mutual connection)
export const connectViaSecretInvite = async (req: Request, res: Response) => {
  try {
    const { inviterHandle, userEmail, userHandle } = req.body;
    if (!inviterHandle) {
      return res.status(400).json({ success: false, message: 'Inviter handle is required' });
    }

    const cleanInviter = (inviterHandle as string).trim();
    const inviter = await findUserByEmailOrHandle(cleanInviter);
    if (!inviter) {
      return res.status(404).json({
        success: false,
        message: `Inviter "${cleanInviter}" not found. Please verify the secret link.`,
      });
    }

    // Resolve current user (the invitee)
    let user = await findUserByEmailOrHandle(userEmail || userHandle);
    if (!user && (userEmail || userHandle)) {
      const cleanEmail = (userEmail || `${(userHandle || 'user').replace('@', '')}@instaloop.mindful`).trim().toLowerCase();
      const defaultHandle = userHandle || `@${cleanEmail.split('@')[0]}`;
      user = await prisma.user
        .create({
          data: {
            email: cleanEmail,
            name: defaultHandle.replace('@', ''),
            handle: defaultHandle,
          },
        })
        .catch(() => null);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Your user profile could not be verified. Please log in first.',
      });
    }

    if (inviter.id === user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot invite yourself via your own secret link!',
      });
    }

    // Check if friendship already exists
    let friendship = await prisma.friendship
      .findFirst({
        where: {
          OR: [
            { requesterId: inviter.id, receiverId: user.id },
            { requesterId: user.id, receiverId: inviter.id },
          ],
        },
      })
      .catch(() => null);

    if (friendship) {
      if (friendship.status !== 'accepted') {
        friendship = await prisma.friendship.update({
          where: { id: friendship.id },
          data: { status: 'accepted' },
        });
      }
    } else {
      friendship = await prisma.friendship.create({
        data: {
          requesterId: inviter.id,
          receiverId: user.id,
          status: 'accepted',
        },
      });
    }

    // Real-time notification via WebSockets
    if (io) {
      io.to(inviter.id).emit('friend_connected', {
        friend: {
          id: user.id,
          name: user.name,
          handle: user.handle,
          avatarUrl: user.avatarUrl,
        },
      });
      io.to(user.id).emit('friend_connected', {
        friend: {
          id: inviter.id,
          name: inviter.name,
          handle: inviter.handle,
          avatarUrl: inviter.avatarUrl,
        },
      });
      io.emit('friend_request_accepted');
    }

    return res.json({
      success: true,
      message: `✨ You and ${inviter.name} (${inviter.handle}) are now connected as mindful friends!`,
      friend: {
        id: inviter.id,
        name: inviter.name,
        handle: inviter.handle,
        avatarUrl:
          inviter.avatarUrl ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        quote: inviter.spiritualMantra || 'Mindful intentional pause partner.',
        status: 'Active now • Connected',
        isOnline: true,
        lastPauseTime: 'Just now',
        defaultSeconds: 15,
        syncStreakDays: 1,
        pactActiveToday: true,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to connect via secret invite' });
  }
};

// 7. Web Landing Page for Secret Invite Link (/invite/:handle, /invite, /join)
export const serveInvitePage = async (req: Request, res: Response) => {
  try {
    const rawHandle = (req.params.handle || req.query.from || req.query.handle || '@mindful') as string;
    const cleanHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;

    const inviter = await findUserByEmailOrHandle(cleanHandle);
    const displayName = inviter?.name || cleanHandle.replace('@', '');
    const avatarUrl = inviter?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
    const appDeepLink = `instaloop://invite?from=${encodeURIComponent(cleanHandle)}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Instaloop • Mindful Invitation from ${displayName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0B100C;
      color: #E2E8F0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      position: relative;
      overflow-x: hidden;
    }
    .aura {
      position: absolute;
      top: 15%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 380px;
      height: 380px;
      background: radial-gradient(circle, rgba(52, 211, 153, 0.18) 0%, rgba(16, 185, 129, 0.04) 50%, transparent 70%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      background: rgba(22, 32, 25, 0.88);
      border: 1px solid rgba(52, 211, 153, 0.25);
      border-radius: 28px;
      padding: 32px 24px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(16px);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.3);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      color: #34D399;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    .avatar-wrapper {
      position: relative;
      width: 92px;
      height: 92px;
      margin: 0 auto 16px;
    }
    .avatar-img {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid #34D399;
      box-shadow: 0 8px 24px rgba(52, 211, 153, 0.3);
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      color: #FFFFFF;
      margin-bottom: 6px;
      letter-spacing: -0.4px;
    }
    .subtitle {
      font-size: 14px;
      color: #94A3B8;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .highlight {
      color: #34D399;
      font-weight: 600;
    }
    .btn-app {
      display: block;
      width: 100%;
      padding: 16px 20px;
      background: linear-gradient(135deg, #10B981, #059669);
      color: #062312;
      font-weight: 700;
      font-size: 16px;
      text-decoration: none;
      border-radius: 999px;
      margin-bottom: 12px;
      box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
      transition: all 0.2s ease;
    }
    .btn-app:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 28px rgba(16, 185, 129, 0.4);
    }
    .btn-download {
      display: block;
      width: 100%;
      padding: 14px 20px;
      background: rgba(30, 41, 35, 0.9);
      border: 1px solid rgba(52, 211, 153, 0.4);
      color: #34D399;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      border-radius: 999px;
      margin-bottom: 20px;
      transition: all 0.2s ease;
    }
    .btn-download:hover {
      background: rgba(40, 56, 47, 0.9);
      border-color: #34D399;
    }
    .code-box {
      background: rgba(15, 23, 19, 0.7);
      border: 1px dashed rgba(52, 211, 153, 0.3);
      border-radius: 14px;
      padding: 12px;
      cursor: pointer;
      font-size: 12px;
      color: #94A3B8;
    }
    .code-box strong {
      display: block;
      color: #F8FAFC;
      font-size: 15px;
      font-family: monospace;
      margin: 4px 0;
    }
    .copy-status {
      font-size: 11px;
      color: #34D399;
      font-weight: 600;
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: #64748B;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="aura"></div>
  <div class="card">
    <div class="pill">🌿 Secret Mindful Invite</div>
    <div class="avatar-wrapper">
      <img src="${avatarUrl}" alt="${displayName}" class="avatar-img">
    </div>
    <h1 class="title">${displayName}</h1>
    <p class="subtitle">
      has invited you to escape infinite scrolling and join <span class="highlight">Instaloop</span>.<br/>
      Connect to exchange calming micro-pauses and dual streaks.
    </p>

    <!-- Option A: Open directly in app if installed -->
    <a href="${appDeepLink}" class="btn-app" id="openAppBtn">
      ✨ Open in Instaloop App
    </a>

    <!-- Option B: Download APK if not installed -->
    <a href="/download/apk" class="btn-download">
      📥 Download App (Android APK)
    </a>

    <!-- Option C: Copy code -->
    <div class="code-box" id="codeBox" onclick="copyInviteCode()">
      <span>Secret Invite Handle:</span>
      <strong id="handleText">${cleanHandle}</strong>
      <span class="copy-status" id="copyStatus">Tap to copy code</span>
    </div>
  </div>

  <p class="footer">Instaloop • Anti-Scroll Finite Presence Sanctuary</p>

  <script>
    function copyInviteCode() {
      const text = "${cleanHandle}";
      navigator.clipboard.writeText(text).then(() => {
        document.getElementById('copyStatus').innerText = '✓ Copied to clipboard! Open app to connect.';
      }).catch(() => {
        document.getElementById('copyStatus').innerText = 'Code: ' + text;
      });
    }

    // Try auto-copy on mobile page load so clipboard is primed
    window.addEventListener('load', () => {
      try {
        navigator.clipboard.writeText("${cleanHandle}").then(() => {
          document.getElementById('copyStatus').innerText = '✓ Secret code primed on clipboard!';
        });
      } catch(_) {}
    });
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (error) {
    return res.status(500).send('Error loading invite page');
  }
};
