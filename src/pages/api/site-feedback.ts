import type { APIRoute } from 'astro';
import { siteFeedback } from '@/db';
import { access } from '@/lib/runtime-access';
import { getClientIp, createRateLimiter, createCooldownTracker } from '@/lib/api-utils';

interface FeedbackPayload {
  type?: (typeof VALID_TYPES)[number];
  message?: string;
  email?: string;
  userAgent?: string;
  pageUrl?: string;
  'cf-turnstile-response'?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_TYPES = ['general', 'bug'] as const;

// Rate limiting: 5 posts per IP per 10 minutes
const ipRateLimiter = createRateLimiter(5, 10 * 60 * 1000);

// Email cooldown: 5 minutes between submissions per email
const emailCooldown = createCooldownTracker(5 * 60 * 1000);

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Check IP rate limit first (before parsing body)
    const ip = getClientIp(request);
    const ipLimit = ipRateLimiter.check(ip);
    if (ipLimit.limited) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(ipLimit.retryAfter),
          ...corsHeaders,
        },
      });
    }

    const rt = access(locals);
    const db = rt.db('app');
    const turnstileSecret = rt.env('TURNSTILE_SECRET_KEY');

    if (!db) {
      return new Response(JSON.stringify({ error: 'Database not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const body = (await request.json()) as FeedbackPayload;
    const { type, message, email, userAgent, pageUrl, 'cf-turnstile-response': token } = body;

    // Verify Turnstile token if secret is configured
    if (turnstileSecret && token) {
      const turnstileResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: turnstileSecret,
            response: token,
          }),
        }
      );

      const turnstileResult = (await turnstileResponse.json()) as { success?: boolean };

      if (!turnstileResult.success) {
        return new Response(JSON.stringify({ error: 'Captcha verification failed' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    } else if (turnstileSecret && !token) {
      // Turnstile is configured but no token provided
      return new Response(JSON.stringify({ error: 'Missing captcha token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: 'message is required (minimum 10 characters)' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (message.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'message is too long (maximum 5000 characters)' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Check email cooldown (after validation so we have a valid email)
    const emailLimit = emailCooldown.check(email);
    if (emailLimit.limited) {
      return new Response(
        JSON.stringify({ error: 'Please wait before submitting another feedback' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(emailLimit.retryAfter),
            ...corsHeaders,
          },
        }
      );
    }

    const id = crypto.randomUUID();

    await db.insert(siteFeedback).values({
      id,
      type,
      message: message.trim(),
      email,
      userAgent: userAgent || null,
      pageUrl: pageUrl || null,
      createdAt: new Date(),
    });

    // Set email cooldown after successful insert
    emailCooldown.set(email);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('[API/site-feedback] Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to submit feedback' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};
