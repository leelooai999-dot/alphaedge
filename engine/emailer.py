"""
MonteCarloo Email Module.

Sends transactional emails (password reset, welcome, etc.)
Uses Resend API (free: 100/day) or falls back to SMTP.

Required env var: RESEND_API_KEY (get free at resend.com/signup)
Optional: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS for SMTP fallback
"""

import os
import json
import logging
import urllib.request
import urllib.error
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")

FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@montecarloo.com")
FROM_NAME = os.environ.get("FROM_NAME", "MonteCarloo")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://montecarloo.com")


def send_email(to: str, subject: str, html: str, text: str = "") -> bool:
    """Send an email. Returns True on success."""
    if RESEND_API_KEY:
        return _send_resend(to, subject, html)
    elif SMTP_HOST:
        return _send_smtp(to, subject, html, text)
    else:
        logger.error("No email provider configured (need RESEND_API_KEY or SMTP_HOST)")
        return False


def _send_resend(to: str, subject: str, html: str) -> bool:
    """Send via Resend API."""
    try:
        data = json.dumps({
            "from": f"{FROM_NAME} <{FROM_EMAIL}>",
            "to": [to],
            "subject": subject,
            "html": html,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=data,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "MonteCarloo/1.0",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            logger.info(f"Email sent via Resend to {to}: {result.get('id', 'ok')}")
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        logger.error(f"Resend API error {e.code}: {body}")
        return False
    except Exception as e:
        logger.error(f"Resend error: {e}")
        return False


def _send_smtp(to: str, subject: str, html: str, text: str = "") -> bool:
    """Send via SMTP."""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{FROM_NAME} <{SMTP_USER or FROM_EMAIL}>"
        msg["To"] = to
        msg["Subject"] = subject

        if text:
            msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            if SMTP_USER and SMTP_PASS:
                server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER or FROM_EMAIL, [to], msg.as_string())

        logger.info(f"Email sent via SMTP to {to}")
        return True
    except Exception as e:
        logger.error(f"SMTP error: {e}")
        return False


# ---------------------------------------------------------------------------
# Email templates
# ---------------------------------------------------------------------------

def send_password_reset(to: str, reset_token: str) -> bool:
    """Send password reset email with a link."""
    reset_url = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e0e0e0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #13131a; border: 1px solid #2a2a35; border-radius: 16px; padding: 32px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #22d3ee, #06b6d4); line-height: 40px; font-size: 18px; font-weight: bold; color: #0a0a0f;">M</div>
      <h2 style="margin: 12px 0 0; font-size: 20px; color: #fff;">Reset Your Password</h2>
    </div>
    
    <p style="font-size: 14px; line-height: 1.6; color: #a0a0b0;">
      We received a request to reset your MonteCarloo password. Click the button below to choose a new password.
    </p>
    
    <div style="text-align: center; margin: 28px 0;">
      <a href="{reset_url}" style="display: inline-block; padding: 12px 32px; background: #22d3ee; color: #0a0a0f; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 12px;">
        Reset Password
      </a>
    </div>
    
    <p style="font-size: 12px; color: #666; line-height: 1.5;">
      This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
    </p>
    
    <p style="font-size: 12px; color: #444; margin-top: 24px; padding-top: 16px; border-top: 1px solid #2a2a35;">
      If the button doesn't work, copy and paste this URL:<br>
      <span style="color: #22d3ee; word-break: break-all;">{reset_url}</span>
    </p>
  </div>
</body>
</html>
"""
    text = f"Reset your MonteCarloo password: {reset_url}\n\nThis link expires in 1 hour."

    return send_email(to, "Reset your MonteCarloo password", html, text)


def send_welcome(to: str, display_name: str) -> bool:
    """Send welcome email after registration."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e0e0e0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #13131a; border: 1px solid #2a2a35; border-radius: 16px; padding: 32px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #22d3ee, #06b6d4); line-height: 40px; font-size: 18px; font-weight: bold; color: #0a0a0f;">M</div>
      <h2 style="margin: 12px 0 0; font-size: 20px; color: #fff;">Welcome to MonteCarloo 🎉</h2>
    </div>
    
    <p style="font-size: 14px; line-height: 1.6; color: #a0a0b0;">
      Hey {display_name}! Your account is ready. Start simulating how world events impact your stocks.
    </p>
    
    <div style="text-align: center; margin: 28px 0;">
      <a href="{FRONTEND_URL}/sim/AAPL" style="display: inline-block; padding: 12px 32px; background: #22d3ee; color: #0a0a0f; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 12px;">
        Run Your First Simulation →
      </a>
    </div>
    
    <p style="font-size: 12px; color: #666; line-height: 1.5;">
      💡 Tip: Try adding "Iran-Israel escalation" as an event on any oil stock like CVX or XOM.
    </p>
  </div>
</body>
</html>
"""
    return send_email(to, f"Welcome to MonteCarloo, {display_name}!", html)
