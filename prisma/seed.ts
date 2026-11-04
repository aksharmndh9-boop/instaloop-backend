import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Instaloop mindful data...');

  // 1. Elena Vance (Primary user)
  const elena = await prisma.user.upsert({
    where: { email: 'elena.vance@gmail.com' },
    update: {},
    create: {
      id: 'demo-elena-vance-id',
      email: 'elena.vance@gmail.com',
      name: 'Elena Vance',
      handle: '@elena_v',
      avatarUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCmvTvw2vUiNi2t66ONaWIluHLI9OBm4euIQS92BMXtTJsfDOJvur_Mpba2Cc6f2EHULwiVe43Uel0hRAFmMYj68Pa8g2PpXfgJNzAh4l28Mm4PNy4Y-UuDKEH4_yKjVkF9XM-zix8Z-VbIn5qjNQVW7_xxgvBqTz-en8iQoe8g4iCUsUjz6jsgWhkcfCe2NsA9cY2xTcN6HhvG08UJD4AvnBJA3tOIvgLHbwS4CoBIYejaOUVpiBPD',
      streakDays: 19,
      reclaimedToday: 760,
      loopsBrokenToday: 14,
    },
  });

  // 2. Alex Rivera (Mindful Friend)
  const alex = await prisma.user.upsert({
    where: { email: 'alex.rivera@instaloop.mindful' },
    update: {},
    create: {
      id: 'friend-alex',
      email: 'alex.rivera@instaloop.mindful',
      name: 'Alex Rivera',
      handle: '@arivera',
      avatarUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAfyYJT2xMkFLSVku_3SkpcUpwAcSiWn2ni6F1Rq8hfVT_NtHiHJSG6J2HqJhu-TlQm6Pf8K-HPj7fdpjf0kjpPxo0RD_QayZWSkP2lJnvwpN1HdbonYyzCrE_lSTQn8epa6euUpIwq3pNUBfO-5wsBYsLdiM789U8EtbViuOO9i0Zjl9gy2KSjN0PDoHekJ2A0ff2oep7jWB9Ocrag9034nrkyux6b4l0wVG7nGwY-Dgjl_r_y2e7p',
      streakDays: 14,
      reclaimedToday: 540,
      loopsBrokenToday: 9,
    },
  });

  // 3. AI Guide Aarya
  const aarya = await prisma.user.upsert({
    where: { email: 'aarya.guide@instaloop.mindful' },
    update: {},
    create: {
      id: 'ai-aarya',
      email: 'aarya.guide@instaloop.mindful',
      name: 'Aarya',
      handle: '@aarya_mindful',
      avatarUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuD3n8mJYq9x0Z3hj1V0pKSHxokroOSrB5eRhM8UikIwPie4J7yns7ANpFY5lPJw09QYzoA1uKT9XJqpXC7-lrJOD7JTmhVaTCkNBA34M9q1k74x4lMINi1A2XeMhshEfmnaftQzJ5HSOFxspHydr1jocDZdoUuNcyBkRPPOybBK4SSkJyHO7sL7aP0Ui4QjSynCDKg_k7pcc1IL_vg3dC-83rP19WQCqxDmW3hTsn_sqMgFyYVIDMeG',
      streakDays: 120,
      reclaimedToday: 1800,
      loopsBrokenToday: 50,
    },
  });

  // 4. Initial Pauses for Elena's Inbox
  await prisma.pauseMessage.deleteMany({});

  await prisma.pauseMessage.createMany({
    data: [
      {
        id: 'm1',
        senderId: aarya.id,
        receiverId: elena.id,
        title: '10-Second Breath Check',
        note: 'Drop your shoulders, inhale calm, exhale urgency.',
        durationSeconds: 10,
        tag: 'Featured',
        isRead: false,
        isCompleted: false,
        steppedAwayEarly: false,
      },
      {
        id: 'm2',
        senderId: alex.id,
        receiverId: elena.id,
        title: 'Gift of Presence (15s)',
        note: 'Sending you 15 seconds of undivided presence without notification clutter.',
        durationSeconds: 15,
        tag: 'Presence Pact',
        isRead: false,
        isCompleted: false,
        steppedAwayEarly: false,
      },
    ],
  });

  console.log('✨ Seeding complete! Database is populated with mindful presence data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
