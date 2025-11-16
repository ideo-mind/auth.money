export interface INonceManager {
  version: string //why? existing DO use the old code until they go idle thats not good , version enables instant migration to newly created DO's
}
export interface NonceDto {
  nonce: number | null
  updatedAt: number // seconds since epoch of last update
}
