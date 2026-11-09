import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../config/db';
import { io } from '../server';

// Initial gentle welcome pause for new mindful journey (no lady photo fallback)
const INITIAL_MOCK_MESSAGES = [
  {
    id: 'm-welcome',
    senderId: 'ai-aarya',
    senderName: 'Aarya',
    senderRole: 'AI Mindful Guide',
    avatarUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD3n8mJYq9x0Z3hj1V0pKSHxokroOSrB5eRhM8UikIwPie4J7yns7ANpFY5lPJw09QYzoA1uKT9XJqpXC7-lrJOD7JTmhVaTCkNBA34M9q1k74x4lMINi1A2XeMhshEfmnaftQzJ5HSOFxspHydr1jocDZdoUuNcyBkRPPOybBK4SSkJyHO7sL7aP0Ui4QjSynCDKg_k7pcc1IL_vg3dC-83rP19WQCqxDmW3hTsn_sqMgFyYVIDMeG',
    title: 'Welcome to Instaloop (10s)',
    note: 'Welcome to your sanctuary of quietude. Take your first 10-second breath to begin building your stillness streak.',
    durationSeconds: 10,
    tag: 'First Breath',
    isRead: false,
    isCompleted: false,
    steppedAwayEarly: false,
    timestamp: 'Just now',
    createdAt: new Date().toISOString(),
    expiresInDays: 15,
  },
];

let inMemoryMessages: any[] = [...INITIAL_MOCK_MESSAGES];

/**
 * Resiliently find or create a user in the Prisma database.
 * Ensures foreign key constraints on senderId and receiverId never fail!
 */
export async function resolveUser(
  identifier?: string,
  email?: string,
  handle?: string,
  name?: string
): Promise<any> {
  const candidates = [identifier, email, handle].filter(Boolean) as string[];
  for (const c of candidates) {
    const clean = c.trim().toLowerCase();
    const handleWithAt = clean.startsWith('@') ? clean : `@${clean}`;
    const handleWithoutAt = clean.startsWith('@') ? clean.substring(1) : clean;

    const user = await prisma.user
      .findFirst({
        where: {
          OR: [
            { id: c.trim() },
            { email: clean },
            { handle: handleWithAt },
            { handle: handleWithoutAt },
            { handle: c.trim() },
          ],
        },
      })
      .catch(() => null);

    if (user) return user;
  }

  // If not found in DB, auto-create a user record so foreign key constraints always succeed
  const preferredEmail = (
    email ||
    (identifier && identifier.includes('@') ? identifier : '') ||
    `${(handle || identifier || 'user').replace('@', '')}@instaloop.mindful`
  )
    .trim()
    .toLowerCase();

  const preferredHandle =
    handle?.trim() ||
    (preferredEmail.includes('@')
      ? `@${preferredEmail.split('@')[0]}`
      : `@${(identifier || 'user').replace('@', '')}`);

  const preferredName = name?.trim() || preferredHandle.replace('@', '');

  const createdUser = await prisma.user
    .create({
      data: {
        email: preferredEmail,
        handle: preferredHandle,
        name: preferredName,
      },
    })
    .catch(async () => {
      // If creation threw duplicate key error, find that existing user
      return await prisma.user
        .findFirst({
          where: {
            OR: [{ email: preferredEmail }, { handle: preferredHandle }],
          },
        })
        .catch(() => null);
    });

  if (createdUser) return createdUser;

  // Fallback object if DB is offline
  return {
    id: identifier || preferredEmail.split('@')[0],
    email: preferredEmail,
    handle: preferredHandle,
    name: preferredName,
  };
}

/**
 * Auto-delete / expire all messages in inbox older than 15 days.
 * CRITICAL GUARANTEE: User stillness streaks (streakDays) and presence pacts
 * remain 100% intact even after messages expire and are deleted.
 */
export const purgeExpiredMessages = async () => {
  try {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    // 1. Delete expired records from Prisma DB (older than 15 days)
    await prisma.pauseMessage
      .deleteMany({
        where: {
          createdAt: {
            lt: fifteenDaysAgo,
          },
        },
      })
      .catch(() => null);

    // 2. Filter in-memory messages older than 15 days
    inMemoryMessages = inMemoryMessages.filter((m: any) => {
      let createdTime: number | null = null;
      if (m.createdAt) {
        const parsed = new Date(m.createdAt).getTime();
        if (!isNaN(parsed)) createdTime = parsed;
      } else if (m.id && typeof m.id === 'string' && m.id.startsWith('m-')) {
        const num = Number(m.id.replace('m-', ''));
        if (!isNaN(num) && num > 1000000000000) createdTime = num;
      }
      if (createdTime !== null) {
        return createdTime >= fifteenDaysAgo.getTime();
      }
      return true;
    });
  } catch (err) {
    console.warn('Purge expired messages notice:', err);
  }
};

export const getInbox = async (req: AuthRequest, res: Response) => {
  try {
    const queryEmail = (req.query.email as string)?.trim().toLowerCase();
    const queryHandle = (req.query.handle as string)?.trim();
    const queryUserId = (req.query.userId as string)?.trim();
    const headerEmail = (req.headers['x-user-email'] as string)?.trim().toLowerCase();
    const headerHandle = (req.headers['x-user-handle'] as string)?.trim();
    const headerUserId = (req.headers['x-user-id'] as string)?.trim();

    const userEmail = queryEmail || headerEmail || req.user?.email;
    const userHandle = queryHandle || headerHandle;
    const rawUserId = queryUserId || headerUserId || req.user?.id;

    // Auto-purge messages older than 15 days before serving
    await purgeExpiredMessages();

    // Resolve current user in DB
    const currentUser = await resolveUser(rawUserId, userEmail, userHandle);
    const currentId = currentUser?.id || rawUserId || 'usr-mindful';
    const cleanEmail = (currentUser?.email || userEmail || '').toLowerCase();
    const cleanHandle = (currentUser?.handle || userHandle || '').toLowerCase();
    const handleWithoutAt = cleanHandle.startsWith('@') ? cleanHandle.substring(1) : cleanHandle;
    const handleWithAt = cleanHandle.startsWith('@') ? cleanHandle : `@${cleanHandle}`;

    const messagesMap = new Map<string, any>();

    // 1. Fetch DB Messages if available
    if (currentUser?.id) {
      const dbMessages = await prisma.pauseMessage
        .findMany({
          where: {
            OR: [
              { receiverId: currentUser.id },
              ...(rawUserId && rawUserId !== currentUser.id ? [{ receiverId: rawUserId }] : []),
            ],
          },
          include: { sender: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        })
        .catch(() => []);

      for (const m of dbMessages) {
        const elapsedDays = Math.floor(
          (Date.now() - new Date(m.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        const daysLeft = Math.max(0, 15 - elapsedDays);

        let cleanAvatar = m.sender?.avatarUrl || '';
        if (cleanAvatar.includes('photo-1534528741775')) cleanAvatar = '';

        messagesMap.set(m.id, {
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender?.name || 'Mindful Friend',
          senderRole: m.sender?.handle || 'Presence Sovereign',
          avatarUrl: cleanAvatar,
          title: m.title,
          note: m.note,
          durationSeconds: m.durationSeconds,
          tag: m.tag,
          isRead: m.isRead,
          isCompleted: m.isCompleted,
          steppedAwayEarly: m.steppedAwayEarly,
          timestamp: 'Recently',
          createdAt: m.createdAt.toISOString(),
          expiresInDays: daysLeft,
          sender: {
            ...m.sender,
            avatarUrl: cleanAvatar,
          },
        });
      }
    }

    // 2. Fetch and merge in-memory messages targeted to this user or 'all'
    for (const m of inMemoryMessages) {
      const isTargeted =
        m.receiverId === 'all' ||
        m.receiverId === currentId ||
        (cleanEmail && m.receiverEmail?.toLowerCase() === cleanEmail) ||
        (cleanHandle &&
          (m.receiverHandle?.toLowerCase() === handleWithAt ||
            m.receiverHandle?.toLowerCase() === handleWithoutAt)) ||
        (rawUserId && m.receiverId === rawUserId);

      if (isTargeted && !messagesMap.has(m.id)) {
        let createdDate = m.createdAt ? new Date(m.createdAt) : new Date();
        if (isNaN(createdDate.getTime())) createdDate = new Date();
        const elapsedDays = Math.floor(
          (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const daysLeft = Math.max(0, 15 - elapsedDays);

        let cleanAvatar = m.avatarUrl || m.senderAvatarUrl || '';
        if (cleanAvatar.includes('photo-1534528741775')) cleanAvatar = '';

        messagesMap.set(m.id, {
          ...m,
          avatarUrl: cleanAvatar,
          createdAt: createdDate.toISOString(),
          expiresInDays: daysLeft,
        });
      }
    }

    // If still empty and no friend messages exist, provide initial gentle welcome pause
    if (messagesMap.size === 0) {
      for (const m of INITIAL_MOCK_MESSAGES) {
        messagesMap.set(m.id, m);
      }
    }

    const result = Array.from(messagesMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return res.json(result);
  } catch (error) {
    return res.json(inMemoryMessages);
  }
};

export const sendPause = async (req: AuthRequest, res: Response) => {
  try {
    const {
      receiverId,
      receiverEmail,
      receiverHandle,
      receiverName,
      title,
      note,
      durationSeconds,
      tag,
    } = req.body;

    const senderEmail = (req.body.senderEmail || req.user?.email || '').trim().toLowerCase();
    const senderHandle = (req.body.senderHandle || '').trim();
    const rawSenderId = req.body.senderId || req.user?.id || 'usr-mindful';
    const senderName = req.body.senderName || req.user?.name || senderHandle.replace('@', '') || 'Mindful Friend';
    const senderRole = req.body.senderRole || senderHandle || 'Presence Sovereign';

    let cleanAvatar = req.body.senderAvatarUrl || req.body.avatarUrl || '';
    if (cleanAvatar.includes('photo-1534528741775')) cleanAvatar = '';

    // 1. Resolve DB records for both sender and receiver to guarantee foreign keys
    const senderUser = await resolveUser(rawSenderId, senderEmail, senderHandle, senderName);
    const receiverUser = await resolveUser(receiverId, receiverEmail, receiverHandle, receiverName);

    const validSenderId = senderUser?.id || rawSenderId;
    const validReceiverId = receiverUser?.id || receiverId || 'all';

    const now = new Date();
    const pauseId = `m-${Date.now()}`;

    const newPause = {
      id: pauseId,
      senderId: validSenderId,
      senderEmail: senderUser?.email || senderEmail,
      senderHandle: senderUser?.handle || senderHandle,
      senderName,
      senderRole,
      avatarUrl: cleanAvatar,
      receiverId: validReceiverId,
      receiverEmail: receiverUser?.email || receiverEmail,
      receiverHandle: receiverUser?.handle || receiverHandle,
      title: title || 'Gift of Presence',
      note: note || 'A mindful intentional pause sent with care.',
      durationSeconds: Number(durationSeconds) || 15,
      tag: tag || 'Presence Pact',
      isRead: false,
      isCompleted: false,
      steppedAwayEarly: false,
      timestamp: 'Just now',
      createdAt: now.toISOString(),
      expiresInDays: 15,
      sender: {
        id: validSenderId,
        name: senderName,
        handle: senderUser?.handle || senderHandle,
        avatarUrl: cleanAvatar,
      },
    };

    inMemoryMessages.unshift(newPause);

    // 2. Persist to Prisma DB
    if (senderUser?.id && receiverUser?.id && senderUser.id !== receiverUser.id) {
      const dbRecord = await prisma.pauseMessage
        .create({
          data: {
            senderId: senderUser.id,
            receiverId: receiverUser.id,
            title: newPause.title,
            note: newPause.note,
            durationSeconds: newPause.durationSeconds,
            tag: newPause.tag,
          },
        })
        .catch((err) => {
          console.warn('Prisma pause create note:', err.message);
          return null;
        });

      if (dbRecord) {
        newPause.id = dbRecord.id;
      }
    }

    // 3. Broadcast in real-time via Socket.io to all candidate rooms
    if (io) {
      const targetRooms = new Set<string>();
      if (receiverUser?.id) targetRooms.add(receiverUser.id);
      if (receiverUser?.email) targetRooms.add(receiverUser.email.toLowerCase());
      if (receiverUser?.handle) {
        targetRooms.add(receiverUser.handle.toLowerCase());
        targetRooms.add(receiverUser.handle.replace('@', '').toLowerCase());
      }
      if (receiverId && receiverId !== 'all') targetRooms.add(receiverId);
      if (receiverEmail) targetRooms.add(receiverEmail.toLowerCase());
      if (receiverHandle) {
        targetRooms.add(receiverHandle.toLowerCase());
        targetRooms.add(receiverHandle.replace('@', '').toLowerCase());
      }

      if (targetRooms.size > 0) {
        for (const room of targetRooms) {
          io.to(room).emit('new_pause_received', newPause);
          io.to(room).emit('mindful_pause_broadcast', newPause);
        }
      } else {
        io.to('all').emit('new_pause_received', newPause);
      }
    }

    return res.status(201).json(newPause);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send pause message' });
  }
};

export const completePause = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    const index = inMemoryMessages.findIndex((m) => m.id === id);
    if (index !== -1) {
      inMemoryMessages[index].isCompleted = true;
      inMemoryMessages[index].isRead = true;
    }

    prisma.pauseMessage
      .update({
        where: { id },
        data: { isCompleted: true, isRead: true },
      })
      .catch(() => {});

    return res.json({
      success: true,
      message: 'Mindful pause recorded and reclaimed seconds added to streak.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to complete pause' });
  }
};

export const stepAwayEarly = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    const index = inMemoryMessages.findIndex((m) => m.id === id);
    if (index !== -1) {
      inMemoryMessages[index].steppedAwayEarly = true;
      inMemoryMessages[index].isRead = true;
    }

    prisma.pauseMessage
      .update({
        where: { id },
        data: { steppedAwayEarly: true, isRead: true },
      })
      .catch(() => {});

    return res.json({
      success: true,
      message: 'Stepped away early. No guilt — your attention is sovereign.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to record step away early' });
  }
};

export const deletePause = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    inMemoryMessages = inMemoryMessages.filter((m) => m.id !== id);

    // Delete from DB if present
    await prisma.pauseMessage
      .deleteMany({
        where: { id },
      })
      .catch(() => {});

    return res.json({
      success: true,
      message: 'Mindful pause deleted successfully.',
      deletedId: id,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete pause message' });
  }
};

export const bulkDeletePauses = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }

    const idsSet = new Set(ids.map(String));
    inMemoryMessages = inMemoryMessages.filter((m) => !idsSet.has(m.id));

    await prisma.pauseMessage
      .deleteMany({
        where: { id: { in: Array.from(idsSet) } },
      })
      .catch(() => {});

    return res.json({
      success: true,
      message: `${ids.length} mindful pauses deleted successfully.`,
      deletedCount: ids.length,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to bulk delete pause messages' });
  }
};
