import type { Bindings } from '../env'
import type { GoogleOAuthBindings } from './googleOAuth'
import { getAuthSecretFromEnv } from './session'
import { IntegrationRepository } from '../repositories/IntegrationRepository'
import {
  selectGoogleOAuthCredential,
  validateGoogleOAuthCredential,
  type GoogleOAuthCredential,
} from './googleOAuthCredential'

export const GOOGLE_OAUTH_PROVIDER = 'google_oauth'
export const GOOGLE_OAUTH_CANDIDATE_PROVIDER = 'google_oauth_candidate'

export function getEnvironmentGoogleOAuthCredential(env: Bindings): GoogleOAuthCredential | null {
  const validation = validateGoogleOAuthCredential({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  })
  return validation.valid ? validation.credential : null
}

export async function getStoredGoogleOAuthCredential(
  env: Bindings,
  provider = GOOGLE_OAUTH_PROVIDER,
): Promise<GoogleOAuthCredential | null> {
  try {
    const repo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
    const summary = await repo.getSummary(provider)
    if (!summary?.connectedAt || summary.status === 'DISCONNECTED') return null
    const validation = validateGoogleOAuthCredential(await repo.getDecryptedCredential(provider))
    return validation.valid ? validation.credential : null
  } catch {
    return null
  }
}

export async function resolveGoogleOAuthCredential(env: Bindings): Promise<GoogleOAuthCredential | null> {
  const environment = getEnvironmentGoogleOAuthCredential(env)
  if (env.FORCE_ENV_GOOGLE_OAUTH === 'true') return environment
  return selectGoogleOAuthCredential(false, await getStoredGoogleOAuthCredential(env), environment)
}

export function toGoogleOAuthBindings(credential: GoogleOAuthCredential): GoogleOAuthBindings {
  return {
    GOOGLE_CLIENT_ID: credential.clientId,
    GOOGLE_CLIENT_SECRET: credential.clientSecret,
  }
}
