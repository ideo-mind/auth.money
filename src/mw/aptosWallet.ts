import { Context, Next } from 'hono';
import { AptosClient, AptosAccount, HexString } from 'aptos';
import { IRunningContext } from '../lib/context';

/**
 * useAptosWallet Middleware
 * Initializes Aptos client and oracle account for blockchain interactions
 * Includes request throttling to prevent concurrent blockchain operations
 * FAILS THE REQUEST if any critical initialization fails
 */
export const useAptosWallet = async (c: Context<IRunningContext>, next: Next) => {
  // First, apply request throttling for Aptos operations
  const route = c.req.path;
  const env = c.env;

  // Get the Durable Object for this route
  const id = c.env.REQUEST_THROTTLER.idFromName(route);
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
        'X-Route': route
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
      console.error(`Throttler error for route ${route}:`, errorText);
      return c.json({
        error: "Request throttling failed",
        details: errorText,
        requestId
      }, 503);
    }

    console.log(`Request ${requestId} approved by throttler for route ${route}`);
  } catch (error) {
    console.error("Error in request throttler:", error);
    return c.json({
      error: "Request throttling error",
      details: String(error)
    }, 503);
  }

  // Now proceed with Aptos wallet initialization
  try {
    console.log('useAptosWallet middleware called for:', c.req.method, c.req.url);
    const nodeUrl = c.env.APTOS_NODE_URL;
    const oraclePrivateKey = c.env.ORACLE_PRIVATE_KEY;
    
    // Validate required environment variables
    if (!nodeUrl) {
      console.error('APTOS_NODE_URL is not configured');
      return c.json({ error: 'APTOS_NODE_URL not configured' }, 500);
    }
    
    if (!oraclePrivateKey) {
      console.error('ORACLE_PRIVATE_KEY is not configured');
      return c.json({ error: 'ORACLE_PRIVATE_KEY not configured' }, 500);
    }
    
    // Initialize Aptos client - FAIL if this fails
    let aptosClient: AptosClient;
    try {
      aptosClient = new AptosClient(nodeUrl);
      console.log('Aptos client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Aptos client:', error);
      return c.json({ error: 'Failed to initialize Aptos client' }, 500);
    }
    
    // Initialize oracle account - FAIL if this fails
    let oracleAccount: AptosAccount;
    try {
      oracleAccount = new AptosAccount(HexString.ensure(oraclePrivateKey).toUint8Array());
      console.log('Oracle account initialized:', oracleAccount.address().toString());
    } catch (error) {
      console.error('Failed to initialize oracle account:', error);
      return c.json({ error: 'Failed to initialize oracle account' }, 500);
    }
    
    // Add to context - these are now guaranteed to be valid
    c.set('aptosClient', aptosClient);
    c.set('oracleAccount', oracleAccount);
    
    console.log('useAptosWallet middleware completed, calling next()');
    await next();
    console.log('useAptosWallet middleware: next() completed');
  } catch (error) {
    console.error('useAptosWallet middleware error:', error);
    return c.json({ error: 'Middleware initialization failed' }, 500);
  }
};

// Context getters are now in types/context.d.ts for better organization
