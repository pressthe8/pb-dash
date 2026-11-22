import { defineSecret } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';
import { OAuthTokens, Concept2ApiResponse, Concept2Result } from './types';

export const concept2ClientId = defineSecret('CONCEPT2_CLIENT_ID');
export const concept2ClientSecret = defineSecret('CONCEPT2_CLIENT_SECRET');
export const concept2Secrets = [concept2ClientId, concept2ClientSecret];
export const CONCEPT2_SCOPE = 'user:read,results:read';

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const logbook = projectId === 'pb-dash' ? 'https://log.concept2.com' : 'https://log-dev.concept2.com';

export function reauthRequired(): HttpsError {
  return new HttpsError('failed-precondition', 'Reconnect your Concept2 account.', { reason: 'REAUTH_REQUIRED' });
}

export function concept2AuthorizationUrl(redirectUri: string, state: string): string {
  const clientId = concept2ClientId.value();
  if (!clientId) throw new HttpsError('failed-precondition', 'Concept2 is not configured.');

  const url = new URL('/oauth/authorize', logbook);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CONCEPT2_SCOPE,
    state,
  }).toString();
  return url.toString();
}

export class Concept2ApiService {
  private async requestTokens(params: Record<string, string>, scope: string): Promise<OAuthTokens> {
    const clientId = concept2ClientId.value();
    const secret = concept2ClientSecret.value();
    if (!clientId || !secret) throw new HttpsError('failed-precondition', 'Concept2 is not configured.');

    const response = await fetch(new URL('/oauth/access_token', logbook), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64'),
        'Accept': 'application/json',
      },
      body: new URLSearchParams({ ...params, client_id: clientId, client_secret: secret, scope }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const reason = error?.error;
      console.warn('Concept2 token request rejected', { status: response.status, grant: params.grant_type });
      if (params.grant_type === 'refresh_token' && (reason === 'invalid_grant' || reason === 'invalid_scope')) {
        throw reauthRequired();
      }
      if (params.grant_type === 'authorization_code' && response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new HttpsError('failed-precondition', 'Concept2 could not complete authorization. Start the connection again.');
      }
      throw new HttpsError('unavailable', 'Concept2 token exchange failed. Please try again.');
    }

    const data = await response.json();
    if (typeof data?.access_token !== 'string' || !data.access_token ||
        typeof data?.refresh_token !== 'string' || !data.refresh_token ||
        !Number.isFinite(data?.expires_in) || data.expires_in <= 0) {
      throw new HttpsError('unavailable', 'Concept2 returned an invalid token response.');
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
      scope: typeof data.scope === 'string' && data.scope.trim()
        ? data.scope.trim().split(/[\s,]+/).join(',')
        : scope,
      created_at: Date.now(),
    };
  }

  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    return this.requestTokens({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }, CONCEPT2_SCOPE);
  }

  refreshAccessToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return this.requestTokens({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }, tokens.scope?.trim().split(/[\s,]+/).join(',') || CONCEPT2_SCOPE);
  }

  openSession(tokens: OAuthTokens, refresh: (tokens: OAuthTokens) => Promise<OAuthTokens>) {
    let currentTokens = tokens;

    const request = async (path: string, params?: URLSearchParams) => {
      const url = new URL('/api/users/me' + path, logbook);
      if (params) url.search = params.toString();
      const fetchResult = () => fetch(url, {
        headers: { 'Authorization': 'Bearer ' + currentTokens.access_token, 'Accept': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const expiry = currentTokens.created_at + currentTokens.expires_in * 1000;
      if (!Number.isFinite(expiry) || expiry - 5 * 60 * 1000 <= Date.now()) {
        currentTokens = await refresh(currentTokens);
      }
      let response = await fetchResult();
      if (response.status === 401) {
        currentTokens = await refresh(currentTokens);
        response = await fetchResult();
      }
      return response;
    };

    const requireSuccess = (response: Response) => {
      if (!response.ok) {
        console.warn('Concept2 API request failed', { status: response.status });
        throw new HttpsError('unavailable', 'Concept2 workouts are temporarily unavailable.');
      }
    };

    return {
      getUserId: async (): Promise<number> => {
        const response = await request('');
        requireSuccess(response);
        const id = (await response.json())?.data?.id;
        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new HttpsError('unavailable', 'Could not verify the connected Concept2 account.');
        }
        return id;
      },
      getResult: async (id: number): Promise<Concept2Result | null> => {
        const response = await request('/results/' + id);
        if (response.status === 404) return null;
        requireSuccess(response);
        const result = (await response.json())?.data;
        if (result?.id !== id) {
          throw new HttpsError('unavailable', 'Concept2 returned a mismatched workout.');
        }
        return result;
      },
      fetchAllResults: async (updatedAfter?: string): Promise<Concept2Result[]> => {
        const allResults: Concept2Result[] = [];
        let totalPages = 1;

        for (let page = 1; page <= totalPages; page++) {
          const params = new URLSearchParams({ page: String(page) });
          if (updatedAfter) params.set('updated_after', updatedAfter);
          const response = await request('/results', params);
          requireSuccess(response);
          const result: Concept2ApiResponse = await response.json();
          if (!Array.isArray(result?.data) || !Number.isSafeInteger(result?.meta?.pagination?.total_pages) ||
              result.meta.pagination.total_pages < 0) {
            throw new HttpsError('unavailable', 'Concept2 returned an invalid workout response.');
          }
          allResults.push(...result.data);
          totalPages = result.meta.pagination.total_pages;
        }
        return allResults;
      },
    };
  }
}
