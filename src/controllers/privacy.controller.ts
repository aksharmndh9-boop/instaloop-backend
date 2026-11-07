import { Request, Response } from 'express';

export const servePrivacyPolicy = (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Instaloop Sanctuary</title>
  <style>
    :root {
      --bg: #0B0E17;
      --card-bg: #121824;
      --accent: #D2F84E;
      --text: #E4E1E9;
      --muted: #9E9AA8;
      --border: rgba(255, 255, 255, 0.08);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 40px 20px 80px;
    }
    .container {
      max-width: 820px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 40px 32px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
    }
    .header {
      text-align: center;
      margin-bottom: 36px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: #10141F;
      border: 1.5px solid rgba(210, 248, 78, 0.4);
      border-radius: 16px;
      margin-bottom: 16px;
    }
    .logo svg { width: 32px; height: 32px; fill: var(--accent); }
    h1 { font-size: 28px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .updated { font-size: 13px; color: var(--muted); }
    h2 { font-size: 19px; font-weight: 700; color: var(--accent); margin-top: 32px; margin-bottom: 12px; }
    p, li { font-size: 14.5px; color: #CBD5E1; margin-bottom: 12px; }
    ul { padding-left: 20px; margin-bottom: 16px; }
    li { margin-bottom: 8px; }
    .highlight-box {
      background: rgba(210, 248, 78, 0.06);
      border: 1px solid rgba(210, 248, 78, 0.25);
      border-radius: 16px;
      padding: 20px;
      margin: 20px 0;
    }
    .highlight-box h3 { font-size: 16px; color: var(--accent); margin-bottom: 6px; }
    .footer {
      text-align: center;
      margin-top: 40px;
      font-size: 13px;
      color: var(--muted);
      border-top: 1px solid var(--border);
      padding-top: 24px;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <svg viewBox="0 0 24 24"><path d="M18.6 6.62c-1.44 0-2.8.56-3.77 1.53L12 10.98l-2.83-2.83c-.97-.97-2.33-1.53-3.77-1.53-2.94 0-5.4 2.46-5.4 5.4s2.46 5.4 5.4 5.4c1.44 0 2.8-.56 3.77-1.53L12 13.02l2.83 2.83c.97.97 2.33 1.53 3.77 1.53 2.94 0 5.4-2.46 5.4-5.4s-2.46-5.4-5.4-5.4zm-13.2 8.8c-1.88 0-3.4-1.52-3.4-3.42s1.52-3.42 3.4-3.42c.92 0 1.79.36 2.42.99l2.21 2.21-2.21 2.21c-.63.63-1.5.43-2.42.43zm13.2 0c-.92 0-1.79-.36-2.42-.99l-2.21-2.21 2.21-2.21c.63-.63 1.5-.99 2.42-.99 1.88 0 3.4 1.52 3.4 3.42s-1.52 3.42-3.4 3.42z"/></svg>
      </div>
      <h1>Instaloop Privacy Policy</h1>
      <p class="updated">Effective Date: November 7, 2026 • Version 1.0.0</p>
    </div>

    <h2>1. Introduction & Anti-Scroll Philosophy</h2>
    <p>Welcome to <strong>Instaloop</strong> (Application ID: <code>com.instaloop.app</code>). We believe your attention, quietude, and mental autonomy are sacred. Unlike infinite-scroll algorithms engineered for surveillance and retention, Instaloop is built from the ground up as a finite, privacy-first sanctuary.</p>

    <div class="highlight-box">
      <h3>🔒 Absolute Privacy Guarantee</h3>
      <p>We do NOT sell, rent, monetize, or harvest your personal data. We do NOT track keystrokes, personal messages, or browsing habits. Your doomscroll shield interventions and mindful stillness pause sessions are processed strictly on-device.</p>
    </div>

    <h2>2. Special Android Permissions & Purpose</h2>
    <p>To deliver conscious digital balance, Instaloop utilizes specific Android permissions in full compliance with Google Play Developer Policies:</p>
    <ul>
      <li><strong>Accessibility Service (<code>BIND_ACCESSIBILITY_SERVICE</code>)</strong>:
        Instaloop uses Android's Accessibility API solely for the <em>Doomscroll Gatekeeper Shield</em> feature. When enabled by the user, it detects when targeted short-video feed applications (such as Instagram Reels, YouTube Shorts, or TikTok) enter the foreground, displaying a non-intrusive 15-second breathing pause overlay to break compulsive loops.
        <br><strong>Declaration:</strong> The Accessibility Service <em>never</em> captures keystrokes, reads personal text, monitors web browsing, intercepts passwords, or transmits screen contents to any server. All evaluations occur strictly in local device RAM.
      </li>
      <li><strong>Usage Access (<code>PACKAGE_USAGE_STATS</code>)</strong>:
        Used strictly on-device to calculate mindful time reclaimed from short-form video feeds and display your daily Circadian Rhythm insights.
      </li>
      <li><strong>Alarms & Notifications (<code>SCHEDULE_EXACT_ALARM</code> & <code>POST_NOTIFICATIONS</code>)</strong>:
        Used to sound your scheduled circadian manifestation alarms and present mindful breathing calls to action.
      </li>
      <li><strong>Internet Access (<code>INTERNET</code>)</strong>:
        Used to synchronize your conscious profile metrics, streak days, accepted friend pacts, and deliver somatic guidance from your AI companions.
      </li>
    </ul>

    <h2>3. Information We Collect</h2>
    <ul>
      <li><strong>Account Credentials</strong>: If you sign in via Google or custom handle, we store your email address, display name, handle, and avatar to identify your account across devices.</li>
      <li><strong>Mindful Metrics</strong>: Aggregated stats such as reclaimed seconds today, streak days, avoided reels, completed pauses, and Bonsai vitality.</li>
      <li><strong>Finite Inbox Messages</strong>: Mindful pause invitations sent between mutual friends. Inactive messages are automatically purged after 30 days.</li>
    </ul>

    <h2>4. Data Storage & Security</h2>
    <p>All network communications between Instaloop and our cloud backend are encrypted using industry-standard TLS 1.3 / HTTPS. Session tokens are securely managed, and database stores utilize encrypted persistent storage on our infrastructure.</p>

    <h2>5. User Rights & Data Deletion</h2>
    <p>You maintain full sovereignty over your data at all times. You may request permanent deletion of your account and all associated metrics directly in the app via <strong>Settings &rarr; Clear Profile</strong>, or by emailing our privacy team at <a href="mailto:privacy@instaloop.app">privacy@instaloop.app</a>. Upon request, all server records are permanently erased within 48 hours.</p>

    <h2>6. Contact Us</h2>
    <p>If you have any questions, suggestions, or concerns regarding your privacy or this policy, please reach out to us:</p>
    <ul>
      <li><strong>Email:</strong> <a href="mailto:support@instaloop.app">support@instaloop.app</a></li>
      <li><strong>Developer Team:</strong> Instaloop Mindful Technologies</li>
      <li><strong>Website:</strong> <a href="https://instaloop-backend.onrender.com">https://instaloop-backend.onrender.com</a></li>
    </ul>

    <div class="footer">
      &copy; 2026 Instaloop. Finite Attention Sovereignty. All rights reserved.
    </div>
  </div>
</body>
</html>`);
};
