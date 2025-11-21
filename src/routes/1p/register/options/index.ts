import { COLOR_HEX_CODES, DIRECTION_MAPPINGS, DOMAIN } from "@config/1p";
import { IRunningContext } from "@lib/context";
import { Hono } from "hono";

const router = new Hono<IRunningContext>();

interface IRegisterOptionsResponse {
  domain: typeof DOMAIN;
  colors: Record<string, string>;
  directions: {
    up: string;
    down: string;
    left: string;
    right: string;
    skip: string;
  };
}

interface IRegisterOptionsErrorResponse {
  error: string;
}

/**
 * POST /evm/register/options
 * Get registration options (simplified without RSA)
 */
router.all("/", async (c) => {
  try {
    console.debug("Getting EVM pot registration options...");

    const successResponse: IRegisterOptionsResponse = {
      domain: DOMAIN,
      colors: COLOR_HEX_CODES,
      directions: {
        up: DIRECTION_MAPPINGS.Up,
        down: DIRECTION_MAPPINGS.Down,
        left: DIRECTION_MAPPINGS.Left,
        right: DIRECTION_MAPPINGS.Right,
        skip: DIRECTION_MAPPINGS.Skip,
      },
    };

    return c.json(successResponse);
  } catch (error) {
    console.error("Error getting registration options:", error);
    const errorResponse: IRegisterOptionsErrorResponse = {
      error: "Failed to get registration options",
    };
    return c.json(errorResponse, 500);
  }
});

export default router;
