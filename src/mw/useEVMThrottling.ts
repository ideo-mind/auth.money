import { Context, Next } from 'hono';
import { IRunningContext } from '@lib/context';

/**
 * EVM Request Throttling Middleware
 * Ensures only one EVM request processes at a time per route using Durable Objects
 * Similar to aptosWallet.ts throttling but for EVM routes
 */
export const useEVMThrottling = async (c: Context<IRunningContext>, next: Next) => {
  // Apply request throttling for EVM operations
  const route = c.req.path;
  const env = c.env;

  // Get the Durable Object for this route
  const id = c.env.REQUEST_THROTTLER.idFromName(`evm-${route}`);
  const throttler = c.env.REQUEST_THROTTLER.get(id);

  try {
    // Create a unique request ID for tracking
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // The throttler will handle the queuing and serialization
    const throttlerRequest = new Request(`https://throttler.internal/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-Route': `evm-${route}`
      },
      body: JSON.stringify({
        method: c.req.method,
        url: c.req.url,
        headers: Object.fromEntries(c.req.raw.headers.entries()),
        body: c.req.method !== 'GET' ? await c.req.text() : undefined
      })
    });

    // Send the request to the throttler
    const throttlerResponse = await throttler.fetch(throttlerRequest);

    if (!throttlerResponse.ok) {
      const errorText = await throttlerResponse.text();
      console.error(`EVM Throttler error for route ${route}:`, errorText);
      return c.json({
        error: "EVM request throttling failed",
        details: errorText,
        requestId
      }, 503);
    }

    console.log(`EVM Request ${requestId} approved by throttler for route ${route}`);
  } catch (error) {
    console.error("Error in EVM request throttler:", error);
    return c.json({
      error: "EVM request throttling error",
      details: String(error)
    }, 503);
  }

  // Continue with the request
  await next();
};
