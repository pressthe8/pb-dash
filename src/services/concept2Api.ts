import { OAuthTokens, Concept2ApiResponse } from '../types/concept2';

// Environment-based URL configuration
const isDev = import.meta.env.VITE_ENVIRONMENT !== 'prod';
const CONCEPT2_BASE_URL = isDev ? 'https://log-dev.concept2.com/api' : 'https://log.concept2.com/api';
const OAUTH_BASE_URL = isDev ? 'https://log-dev.concept2.com/oauth' : 'https://log.concept2.com/oauth';

export class Concept2ApiService {
  private static instance: Concept2ApiService;
  
  private constructor() {}
  
  static getInstance(): Concept2ApiService {
    if (!Concept2ApiService.instance) {
      Concept2ApiService.instance = new Concept2ApiService();
    }
    return Concept2ApiService.instance;
  }

  /**
   * Validate that required environment variables are present
   */
  private validateEnvironmentVariables(): { clientId: string; clientSecret: string } {
    const clientId = import.meta.env.VITE_CONCEPT2_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_CONCEPT2_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Missing Concept2 API credentials');
      throw new Error(`Missing Concept2 API credentials. Please check your .env file for VITE_CONCEPT2_CLIENT_ID and VITE_CONCEPT2_CLIENT_SECRET.`);
    }
    
    // Check for whitespace issues
    const trimmedClientId = clientId.trim();
    const trimmedClientSecret = clientSecret.trim();
    
    if (clientId !== trimmedClientId || clientSecret !== trimmedClientSecret) {
      console.error('Whitespace detected in credentials');
      throw new Error('Concept2 API credentials contain leading/trailing whitespace. Please check your .env file and remove any extra spaces.');
    }
    
    // Check for common formatting issues
    if (clientId.includes('"') || clientId.includes("'") || clientSecret.includes('"') || clientSecret.includes("'")) {
      console.error('Quote characters detected in credentials');
      throw new Error('Concept2 API credentials contain quote characters. Please remove quotes from your .env file values.');
    }
    
    return { clientId: trimmedClientId, clientSecret: trimmedClientSecret };
  }

  /**
   * Generate OAuth2 authorization URL
   */
  generateAuthUrl(): string {
    const { clientId } = this.validateEnvironmentVariables();
    
    // Use the actual WebContainer URL that's registered with Concept2
    const redirectUri = `${window.location.origin}/auth/callback`;
    const scope = 'user:read,results:read';
    const state = this.generateState();
    
    // Store state in both sessionStorage and localStorage for better persistence
    // Reason: Protocol changes (http/https) can cause sessionStorage to be isolated
    sessionStorage.setItem('oauth_state', state);
    localStorage.setItem('oauth_state', state);
    localStorage.setItem('oauth_state_timestamp', Date.now().toString());
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      state: state,
    });

    console.log('Generated OAuth URL for redirect');
    return `${OAUTH_BASE_URL}/authorize?${params.toString()}`;
  }

  /**
   * Check if access token is expired or will expire soon
   * Reason: Check 5 minutes before actual expiry to account for network delays
   */
  isTokenExpired(tokens: OAuthTokens): boolean {
    if (!tokens.created_at || !tokens.expires_in) {
      return true;
    }
    
    const expiryTime = tokens.created_at + (tokens.expires_in * 1000);
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    const now = Date.now();
    
    return (expiryTime - bufferTime) <= now;
  }

  /**
   * Exchange authorization code for access token
   * 
   * CRITICAL IMPLEMENTATION NOTE:
   * The Concept2 API requires BOTH Basic Authentication header AND client credentials 
   * in the request body. This is NOT a duplicate parameter issue - it's a requirement
   * of their OAuth2 implementation.
   * 
   * DO NOT REMOVE client_id and client_secret from the request body!
   * 
   * The API will return a 400 "malformed request" error if these parameters
   * are missing from the body, even when present in the Authorization header.
   */
  async exchangeCodeForToken(code: string, state: string): Promise<OAuthTokens> {
    console.log('Starting token exchange process');
    
    // Try to get state from sessionStorage first, then localStorage as fallback
    let storedState = sessionStorage.getItem('oauth_state');
    if (!storedState) {
      storedState = localStorage.getItem('oauth_state');
      
      // Check if the localStorage state is not too old (max 10 minutes)
      const timestamp = localStorage.getItem('oauth_state_timestamp');
      if (timestamp) {
        const stateAge = Date.now() - parseInt(timestamp);
        const maxAge = 10 * 60 * 1000; // 10 minutes
        if (stateAge > maxAge) {
          // State is too old, clear it and reject
          localStorage.removeItem('oauth_state');
          localStorage.removeItem('oauth_state_timestamp');
          throw new Error('OAuth state expired');
        }
      }
    }
    
    if (state !== storedState) {
      console.error('State validation failed');
      throw new Error('Invalid state parameter');
    }

    const { clientId, clientSecret } = this.validateEnvironmentVariables();
    
    // Use the actual WebContainer URL that's registered with Concept2
    const redirectUri = `${window.location.origin}/auth/callback`;

    // 🚨 CRITICAL: DO NOT REMOVE THESE PARAMETERS! 🚨
    // 
    // The Concept2 API requires client_id and client_secret in BOTH:
    // 1. The Authorization header (Basic Auth)
    // 2. The request body (form parameters)
    // 
    // This is NOT a duplicate parameter issue - it's how their OAuth2 
    // implementation works. Removing these will cause a 400 error:
    // "The request is missing a required parameter, includes an invalid 
    // parameter value, includes a parameter more than once, or is 
    // otherwise malformed. Check the 'code' parameter."
    // 
    // This requirement has been verified through testing and is necessary
    // for successful token exchange with the Concept2 API.

    // Reason: Use explicit parameter construction for better debugging
    const requestBody = new URLSearchParams();
    requestBody.append('grant_type', 'authorization_code');
    requestBody.append('code', code);
    requestBody.append('redirect_uri', redirectUri);
    requestBody.append('client_id', clientId);
    requestBody.append('client_secret', clientSecret);

    // Create Basic Auth header
    const basicAuthHeader = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

    try {
      const response = await fetch(`${OAUTH_BASE_URL}/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': basicAuthHeader,
          'Accept': 'application/json',
        },
        body: requestBody.toString(),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorData: string;
        let errorJson: any = null;
        
        if (contentType && contentType.includes('application/json')) {
          try {
            errorJson = await response.json();
            errorData = JSON.stringify(errorJson);
          } catch (e) {
            errorData = await response.text();
          }
        } else {
          errorData = await response.text();
        }
        
        console.error('Token exchange failed:', {
          status: response.status,
          statusText: response.statusText,
          errorData: errorData.substring(0, 500)
        });
        
        // Reason: Provide more helpful error messages based on common issues
        if (response.status === 401) {
          throw new Error('Invalid Concept2 API credentials. Please verify your VITE_CONCEPT2_CLIENT_ID and VITE_CONCEPT2_CLIENT_SECRET in your .env file are correct and restart your dev server.');
        } else if (response.status === 400) {
          if (errorData.includes('redirect_uri')) {
            throw new Error(`Redirect URI mismatch. Please ensure your Concept2 Developer Portal redirect URI is set to: ${redirectUri}`);
          } else if (errorData.includes('code')) {
            throw new Error(`Invalid authorization code or client credentials. Please check your .env file and ensure VITE_CONCEPT2_CLIENT_ID and VITE_CONCEPT2_CLIENT_SECRET are correct. Then restart your dev server and try the OAuth flow again.`);
          } else {
            throw new Error(`Bad request (400): ${errorData}. This usually indicates incorrect API credentials or configuration.`);
          }
        } else if (contentType && contentType.includes('text/html')) {
          throw new Error('Concept2 API returned an error page. This usually indicates incorrect API credentials or redirect URI mismatch. Please check your .env configuration and restart your dev server.');
        } else {
          throw new Error(`Token exchange failed (${response.status}): ${errorData}`);
        }
      }

      const tokens: OAuthTokens = await response.json();
      tokens.created_at = Date.now();
      
      // Clear state from both storage locations
      sessionStorage.removeItem('oauth_state');
      localStorage.removeItem('oauth_state');
      localStorage.removeItem('oauth_state_timestamp');
      
      console.log('Token exchange successful');
      return tokens;
    } catch (error) {
      console.error('Token exchange request failed:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * 
   * CRITICAL IMPLEMENTATION NOTE:
   * Same as exchangeCodeForToken - the Concept2 API requires client credentials
   * in BOTH the Authorization header AND the request body for refresh token requests.
   * 
   * DO NOT REMOVE client_id and client_secret from the request body!
   * 
   * SCOPE PARAMETER IS NOW REQUIRED:
   * The Concept2 API now requires the scope parameter to be included in refresh token 
   * requests. The scope should match the original granted scopes from the initial 
   * authorization. Without the correct scope, the API will return a 400 error with 
   * "invalid, unknown, or malformed scope".
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = this.validateEnvironmentVariables();

    console.log('Refreshing access token');

    // Reason: Use append() method to ensure all parameters are properly included
    // Create request body parameters - SCOPE IS NOW REQUIRED
    const requestParams = new URLSearchParams();
    requestParams.append('grant_type', 'refresh_token');
    requestParams.append('refresh_token', refreshToken);
    requestParams.append('client_id', clientId);
    requestParams.append('client_secret', clientSecret);
    // Reason: The Concept2 API now requires the scope parameter in refresh requests
    // This must match the original scope granted during initial authorization
    requestParams.append('scope', 'user:read,results:read');

    const response = await fetch(`${OAUTH_BASE_URL}/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Accept': 'application/json',
      },
      body: requestParams.toString(), // Reason: Explicitly convert to string to ensure proper formatting
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorData: string;
      let errorJson: any = null;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          errorJson = await response.json();
          errorData = JSON.stringify(errorJson);
        } catch (e) {
          errorData = await response.text();
        }
      } else {
        errorData = await response.text();
      }
      
      console.error('Token refresh failed:', {
        status: response.status,
        statusText: response.statusText,
        errorData: errorData.substring(0, 500)
      });
      
      // Reason: Enhanced error handling for scope-related errors
      // Check for invalid scope errors in multiple ways to be more robust
      if (response.status === 400) {
        let isScopeError = false;
        
        // Check JSON response message if available
        if (errorJson && errorJson.message) {
          const message = errorJson.message.toLowerCase();
          if (message.includes('invalid') && message.includes('scope')) {
            isScopeError = true;
          }
        }
        
        // Also check raw error data for scope-related errors
        if (!isScopeError && errorData) {
          const lowerErrorData = errorData.toLowerCase();
          if ((lowerErrorData.includes('invalid') || lowerErrorData.includes('unknown') || lowerErrorData.includes('malformed')) && 
              lowerErrorData.includes('scope')) {
            isScopeError = true;
          }
        }
        
        if (isScopeError) {
          console.log('Invalid scope detected in refresh token, requiring re-authentication');
          throw new Error('INVALID_SCOPE_REAUTH_REQUIRED');
        } else if (errorData.includes('invalid_grant')) {
          throw new Error('REFRESH_TOKEN_EXPIRED');
        }
      } else if (response.status === 401) {
        throw new Error('INVALID_CLIENT_CREDENTIALS');
      }
      
      throw new Error(`Token refresh failed (${response.status}): ${errorData}`);
    }

    const tokens: OAuthTokens = await response.json();
    tokens.created_at = Date.now();
    
    console.log('Access token refreshed successfully');
    return tokens;
  }

  /**
   * Make an authenticated API request with automatic token refresh
   * Reason: Centralize token refresh logic to avoid code duplication
   */
  async makeAuthenticatedRequest(
    url: string, 
    tokens: OAuthTokens,
    onTokenRefresh: (newTokens: OAuthTokens) => Promise<void>
  ): Promise<Response> {
    let currentTokens = tokens;
    
    // Check if token needs refresh before making the request
    if (this.isTokenExpired(currentTokens)) {
      console.log('Access token expired, refreshing...');
      try {
        const newTokens = await this.refreshAccessToken(currentTokens.refresh_token);
        await onTokenRefresh(newTokens);
        currentTokens = newTokens;
      } catch (error) {
        if (error instanceof Error && (
          error.message === 'REFRESH_TOKEN_EXPIRED' || 
          error.message === 'INVALID_SCOPE_REAUTH_REQUIRED'
        )) {
          throw new Error('REAUTH_REQUIRED');
        }
        throw error;
      }
    }
    
    // Make the API request
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${currentTokens.access_token}`,
        'Accept': 'application/json',
      },
    });
    
    // If we get a 401, try refreshing the token once more
    if (response.status === 401) {
      console.log('Received 401, attempting token refresh...');
      try {
        const newTokens = await this.refreshAccessToken(currentTokens.refresh_token);
        await onTokenRefresh(newTokens);
        
        // Retry the original request with new token
        return fetch(url, {
          headers: {
            'Authorization': `Bearer ${newTokens.access_token}`,
            'Accept': 'application/json',
          },
        });
      } catch (error) {
        if (error instanceof Error && (
          error.message === 'REFRESH_TOKEN_EXPIRED' || 
          error.message === 'INVALID_SCOPE_REAUTH_REQUIRED'
        )) {
          throw new Error('REAUTH_REQUIRED');
        }
        throw error;
      }
    }
    
    return response;
  }

  /**
   * Fetch user results from Concept2 API with automatic token refresh
   */
  async fetchResults(
    tokens: OAuthTokens, 
    onTokenRefresh: (newTokens: OAuthTokens) => Promise<void>,
    page: number = 1,
    updatedAfter?: string
  ): Promise<Concept2ApiResponse> {
    let url = `${CONCEPT2_BASE_URL}/users/me/results?page=${page}`;
    
    // Add updated_after parameter if provided
    if (updatedAfter) {
      url += `&updated_after=${encodeURIComponent(updatedAfter)}`;
    }
    
    const response = await this.makeAuthenticatedRequest(url, tokens, onTokenRefresh);

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorData}`);
    }

    return response.json();
  }

  /**
   * Fetch all user results (handles pagination) with automatic token refresh
   */
  async fetchAllResults(
    tokens: OAuthTokens,
    onTokenRefresh: (newTokens: OAuthTokens) => Promise<void>
  ): Promise<Concept2ApiResponse> {
    let allResults: any[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const response = await this.fetchResults(tokens, onTokenRefresh, currentPage);
      allResults = allResults.concat(response.data);
      totalPages = response.meta.pagination.total_pages;
      currentPage++;
    } while (currentPage <= totalPages);

    return {
      data: allResults,
      meta: {
        pagination: {
          total: allResults.length,
          count: allResults.length,
          per_page: allResults.length,
          current_page: 1,
          total_pages: 1,
          links: []
        }
      }
    };
  }

  /**
   * Fetch new results since a specific date (for incremental sync)
   * Reason: Use updated_after parameter to only fetch new results, not all historical data
   */
  async fetchNewResults(
    tokens: OAuthTokens,
    onTokenRefresh: (newTokens: OAuthTokens) => Promise<void>,
    updatedAfter?: string
  ): Promise<Concept2ApiResponse> {
    let allResults: any[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const response = await this.fetchResults(tokens, onTokenRefresh, currentPage, updatedAfter);
      allResults = allResults.concat(response.data);
      totalPages = response.meta.pagination.total_pages;
      currentPage++;
    } while (currentPage <= totalPages);

    return {
      data: allResults,
      meta: {
        pagination: {
          total: allResults.length,
          count: allResults.length,
          per_page: allResults.length,
          current_page: 1,
          total_pages: 1,
          links: []
        }
      }
    };
  }

  /**
   * Simple fetch results method for initial auth callback (no refresh logic)
   * Reason: During initial auth, we don't need refresh logic since tokens are brand new
   */
  async fetchAllResultsSimple(accessToken: string): Promise<Concept2ApiResponse> {
    let allResults: any[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const response = await fetch(`${CONCEPT2_BASE_URL}/users/me/results?page=${currentPage}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`API request failed (${response.status}): ${errorData}`);
      }

      const pageData = await response.json();
      allResults = allResults.concat(pageData.data);
      totalPages = pageData.meta.pagination.total_pages;
      currentPage++;
    } while (currentPage <= totalPages);

    return {
      data: allResults,
      meta: {
        pagination: {
          total: allResults.length,
          count: allResults.length,
          per_page: allResults.length,
          current_page: 1,
          total_pages: 1,
          links: []
        }
      }
    };
  }

  /**
   * Generate a random state string for OAuth2
   */
  private generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}