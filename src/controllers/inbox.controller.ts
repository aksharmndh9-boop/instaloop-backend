import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../config/db';
import { io } from '../server';

// Default mindful seed data matching Flutter models
const INITIAL_MOCK_MESSAGES = [
  {
    id: 'm1',
    senderId: 'ai-aarya',
    senderName: 'Aarya',
    senderRole: 'AI Mindful Guide',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD3n8mJYq9x0Z3hj1V0pKSHxokroOSrB5eRhM8UikIwPie4J7yns7ANpFY5lPJw09QYzoA1uKT9XJqpXC7-lrJOD7JTmhVaTCkNBA34M9q1k74x4lMINi1A2XeMhshEfmnaftQzJ5HSOFxspHydr1jocDZdoUuNcyBkRPPOybBK4SSkJyHO7sL7aP0Ui4QjSynCDKg_k7pcc1IL_vg3dC-83rP19WQCqxDmW3hTsn_sqMgFyYVIDMeG',
    title: '10-Second Breath Check',
    note: 'Drop your shoulders, inhale calm, exhale urgency.',
    durationSeconds: 10,
    tag: 'Featured',
    isRead: false,
    isCompleted: false,
    steppedAwayEarly: false,
    timestamp: 'Just now',
  },
  {
    id: 'm2',
    senderId: 'friend-alex',
    senderName: 'Alex Rivera',
    senderRole: 'Friend',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAfyYJT2xMkFLSVku_3SkpcUpwAcSiWn2ni6F1Rq8hfVT_NtHiHJSG6J2HqJhu-TlQm6Pf8K-HPj7fdpjf0kjpPxo0RD_QayZWSkP2lJnvwpN1HdbonYyzCrE_lSTQn8epa6euUpIwq3pNUBfO-5wsBYsLdiM789U8EtbViuOO9i0Zjl9gy2KSjN0PDoHekJ2A0ff2oep7jWB9Ocrag9034nrkyux6b4l0wVG7nGwY-Dgjl_r_y2e7p',
    title: 'Gift of Presence (15s)',
    note: 'Sending you 15 seconds of undivided presence without notification clutter.',
    durationSeconds: 15,
    tag: 'Presence Pact',
    isRead: false,
    isCompleted: false,
    steppedAwayEarly: false,
    timestamp: '25m ago',
  },
  {
    id: 'm3',
    senderId: 'ai-kabir',
    senderName: 'Kabir',
    senderRole: 'Doomscroll Intervention',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAHX47poB-2bkPA2inOPdZB_AiAktHe76VyGyBOlXe_khVvRCPpe75MWgSd-7KN_3h6Ar0h1DSRDcEN2-BnZYPokBTv_qOpv-WirxwLzETLS-SWlKibH838aYqniDR7g-Pb8qW7NrCsYaTYYA3BX1QyzuoWIpMEIgqNTP-Uzfo6vju2jS1mm1taoCLCtVdd4Z01ZT2ZTT4IHHsfU7Bwug0bSwEs5QDyrTgVmrHy7ELeUK7A3fECAvg9',
    title: 'Infinite Scroll Interruption',
    note: 'Unclench your jaw. The algorithm has no finish line, but you can choose to stop here.',
    durationSeconds: 15,
    tag: 'Intervention',
    isRead: false,
    isCompleted: false,
    steppedAwayEarly: false,
    timestamp: '1h ago',
  },
];

let inMemoryMessages = [...INITIAL_MOCK_MESSAGES];

export const getInbox = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'demo-elena-vance-id';

    // Attempt DB fetch if connected
    const dbMessages = await prisma.pauseMessage.findMany({
      where: { receiverId: userId },
      include: { sender: { select: { name: true, handle: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    if (dbMessages && dbMessages.length > 0) {
      const formatted = dbMessages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.sender?.name || 'Mindful Friend',
        senderRole: m.sender?.handle || 'Presence Sovereign',
        avatarUrl: m.sender?.avatarUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAfyYJT2xMkFLSVku_3SkpcUpwAcSiWn2ni6F1Rq8hfVT_NtHiHJSG6J2HqJhu-TlQm6Pf8K-HPj7fdpjf0kjpPxo0RD_QayZWSkP2lJnvwpN1HdbonYyzCrE_lSTQn8epa6euUpIwq3pNUBfO-5wsBYsLdiM789U8EtbViuOO9i0Zjl9gy2KSjN0PDoHekJ2A0ff2oep7jWB9Ocrag9034nrkyux6b4l0wVG7nGwY-Dgjl_r_y2e7p',
        title: m.title,
        note: m.note,
        durationSeconds: m.durationSeconds,
        tag: m.tag,
        isRead: m.isRead,
        isCompleted: m.isCompleted,
        steppedAwayEarly: m.steppedAwayEarly,
        timestamp: 'Recently',
        sender: m.sender,
      }));
      return res.json(formatted);
    }

    return res.json(inMemoryMessages);
  } catch (error) {
    return res.json(inMemoryMessages);
  }
};

export const sendPause = async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId, title, note, durationSeconds, tag } = req.body;
    const senderId = req.body.senderId || req.user?.id || 'demo-elena-vance-id';
    const senderName = req.body.senderName || req.user?.handle || 'Elena Vance';
    const senderRole = req.body.senderRole || 'Presence Sovereign';
    const avatarUrl =
      req.body.senderAvatarUrl ||
      req.body.avatarUrl ||
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCmvTvw2vUiNi2t66ONaWIluHLI9OBm4euIQS92BMXtTJsfDOJvur_Mpba2Cc6f2EHULwiVe43Uel0hRAFmMYj68Pa8g2PpXfgJNzAh4l28Mm4PNy4Y-UuDKEH4_yKjVkF9XM-zix8Z-VbIn5qjNQVW7_xxgvBqTz-en8iQoe8g4iCUsUjz6jsgWhkcfCe2NsA9cY2xTcN6HhvG08UJD4AvnBJA3tOIvgLHbwS4CoBIYejaOUVpiBPD';

    const newPause = {
      id: `m-${Date.now()}`,
      senderId,
      receiverId: receiverId || 'all',
      senderName,
      senderRole,
      avatarUrl,
      title: title || 'Gift of Presence',
      note: note || 'A mindful intentional pause sent with care.',
      durationSeconds: Number(durationSeconds) || 15,
      tag: tag || 'Presence Pact',
      isRead: false,
      isCompleted: false,
      steppedAwayEarly: false,
      timestamp: 'Just now',
    };

    inMemoryMessages.unshift(newPause);

    // Save to DB if available
    prisma.pauseMessage.create({
      data: {
        senderId,
        receiverId: receiverId || 'friend-alex',
        title: newPause.title,
        note: newPause.note,
        durationSeconds: newPause.durationSeconds,
        tag: newPause.tag,
      },
    }).catch(() => {});

    // Broadcast in real-time to recipient's room and global mindful channel
    if (io) {
      if (receiverId) {
        io.to(receiverId).emit('new_pause_received', newPause);
      }
      io.to('all').emit('new_pause_received', newPause);
      io.emit('mindful_pause_broadcast', newPause);
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

    prisma.pauseMessage.update({
      where: { id },
      data: { isCompleted: true, isRead: true },
    }).catch(() => {});

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

    prisma.pauseMessage.update({
      where: { id },
      data: { steppedAwayEarly: true, isRead: true },
    }).catch(() => {});

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
    await prisma.pauseMessage.deleteMany({
      where: { id },
    }).catch(() => {});

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

    await prisma.pauseMessage.deleteMany({
      where: { id: { in: Array.from(idsSet) } },
    }).catch(() => {});

    return res.json({
      success: true,
      message: `${ids.length} mindful pauses deleted successfully.`,
      deletedCount: ids.length,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to bulk delete pause messages' });
  }
};
