/**
 * RequestThrottler Durable Object
 *
 * This Durable Object ensures only one request is processed at a time for any route.
 * It uses a simple queue mechanism where requests wait for their turn to be processed.
 * Unlike QuotaManager which tracks call counts, this focuses purely on concurrency control.
 */
export class RequestThrottler {
  private state: DurableObjectState
  private processing: boolean = false
  private requestQueue: Array<{
    resolve: (value: Response) => void
    reject: (error: any) => void
    request: Request
    route: string
    requestId: string
  }> = []

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
  }

  /**
   * Handle incoming requests to the Durable Object
   */
  async fetch(request: Request) {
    const url = new URL(request.url)
    const route = url.pathname
    const requestId = request.headers.get('X-Request-ID') || 'unknown'

    // If we're already processing a request, queue this one
    if (this.processing) {
      return new Promise<Response>((resolve, reject) => {
        this.requestQueue.push({ resolve, reject, request, route, requestId })
      })
    }

    // Start processing this request
    this.processing = true

    try {
      const response = await this.processRequest(request, route, requestId)
      return response
    } finally {
      // Process next request in queue
      this.processNextRequest()
    }
  }

  /**
   * Process a single request
   */
  private async processRequest(request: Request, route: string, requestId: string): Promise<Response> {
    try {
      // Parse the request data from the middleware
      const requestData = await request.json()
      
      // Log the request processing
      console.log(`Processing request ${requestId} for route ${route}`)
      
      // Simulate processing time (you can adjust this based on your needs)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Return a success response indicating the request can proceed
      return new Response(JSON.stringify({ 
        processed: true, 
        route,
        requestId,
        timestamp: Date.now(),
        message: "Request approved for processing"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    } catch (error) {
      console.error(`Error processing request ${requestId}:`, error)
      return new Response(JSON.stringify({
        error: "Failed to process request",
        requestId,
        details: String(error)
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
  }

  /**
   * Process the next request in the queue
   */
  private async processNextRequest() {
    if (this.requestQueue.length === 0) {
      this.processing = false
      return
    }

    const { resolve, reject, request, route, requestId } = this.requestQueue.shift()!

    try {
      const response = await this.processRequest(request, route, requestId)
      resolve(response)
    } catch (error) {
      reject(error)
    } finally {
      // Process next request in queue
      this.processNextRequest()
    }
  }

  /**
   * Get current status of the throttler
   */
  async getStatus() {
    return {
      processing: this.processing,
      queueLength: this.requestQueue.length,
      timestamp: Date.now()
    }
  }

  /**
   * Clear the queue (for debugging/admin purposes)
   */
  async clearQueue() {
    this.requestQueue.forEach(({ reject }) => {
      reject(new Error("Queue cleared by admin"))
    })
    this.requestQueue = []
    this.processing = false
  }
}
