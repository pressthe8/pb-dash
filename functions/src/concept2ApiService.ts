import { defineSecret } from 'firebase-functions/params';
import { OAuthTokens, Concept2ApiResponse } from './types';

// Environment-based URL configuration for Cloud Functions
// FIXED: Force development environment for bolt-c2 project
const getEnvironment = (): string => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  
  // CRITICAL: Force development environment for bolt-c2 project
  if (projectId === 'bolt-c2') {
    return 'dev';
  }
  
  // For pb-dash project, use production
  if (projectId === 'pb-dash') {
    return 'prod';
  }
  
  // Default to development for safety
  return 'dev';
};

const environment = getEnvironment();
const isDev = environment === 'dev';
const CONCEPT2_BASE_URL = isDev ? 'https://log-dev.concept2.com/api' : 'https://log.concept2.com/api';
const OAUTH_BASE_URL = isDev ? 'https://log-dev.concept2.com/oauth' : 'https://log.concept2.com/oauth';

// Define secrets for v2 functions
const concept2ClientId = defineSecret('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = defineSecret('CONCEPT2_CLIENT_SECRET');

export class Concept2ApiService {
  private clientId: string;
  private clientSecret: string;

  constructor() {
    // Enhanced error handling for missing configuration
    this.clientId = concept2ClientId.value();
    this.clientSecret = concept2ClientSecret.value();
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Concept2 API credentials not configured. Please set CONCEPT2_CLIENT_ID and CONCEPT2_CLIENT_SECRET secrets.');
    }
    
    console.log('Concept2ApiService initialized with client ID:', this.clientId ? 'present' : 'missing');
    console.log('Environment:', environment);
    console.log('Project ID:', process.env.GCLOUD_PROJECT || 'unknown');
    console.log('Base URL:', CONCEPT2_BASE_URL);
  }

  /**
   * Check if access token is expired or will expire soon
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
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    console.log('Refreshing access token');

    const requestParams = new URLSearchParams();
    requestParams.append('grant_type', 'refresh_token');
    requestParams.append('refresh_token', refreshToken);
    requestParams.append('client_id', this.clientId);
    requestParams.append('client_secret', this.clientSecret);

    // Use Buffer.from instead of btoa for Node.js compatibility
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(`${OAUTH_BASE_URL}/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
      },
      body: requestParams.toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Token refresh failed:', {
        status: response.status,
        statusText: response.statusText,
        errorData: errorData.substring(0, 500)
      });
      
      if (response.status === 400) {
        if (errorData.toLowerCase().includes('scope')) {
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
   */
  async makeAuthenticatedRequest(
    url: string, 
    tokens: OAuthTokens,
    onTokenRefresh: (newTokens: OAuthTokens) => Promise<void>,
    updatedAfter?: string
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
   * Fetch user results from Concept2 API with pagination
   */
  async fetchResults(
    tokens: OAuthTokens, 
    onTokenRefresh: (newTokens: OAuthTokens) => Promise<void>,
    page: number = 1,
    updatedAfter?: string
  ): Promise<Concept2ApiResponse> {
    let url = `${CONCEPT2_BASE_URL}/users/me/results?page=${page}`;
    
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
   * Fetch all results with pagination handling
   */
  async fetchAllResults(
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
}