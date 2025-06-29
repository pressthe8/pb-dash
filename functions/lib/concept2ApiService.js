"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Concept2ApiService = void 0;
const params_1 = require("firebase-functions/params");
const CONCEPT2_BASE_URL = 'https://log-dev.concept2.com/api';
const OAUTH_BASE_URL = 'https://log-dev.concept2.com/oauth';
// Define secrets for v2 functions
const concept2ClientId = (0, params_1.defineSecret)('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = (0, params_1.defineSecret)('CONCEPT2_CLIENT_SECRET');
class Concept2ApiService {
    constructor() {
        // Enhanced error handling for missing configuration
        this.clientId = concept2ClientId.value();
        this.clientSecret = concept2ClientSecret.value();
        if (!this.clientId || !this.clientSecret) {
            throw new Error('Concept2 API credentials not configured. Please set CONCEPT2_CLIENT_ID and CONCEPT2_CLIENT_SECRET secrets.');
        }
        console.log('Concept2ApiService initialized with client ID:', this.clientId ? 'present' : 'missing');
    }
    /**
     * Check if access token is expired or will expire soon
     */
    isTokenExpired(tokens) {
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
    async refreshAccessToken(refreshToken) {
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
                }
                else if (errorData.includes('invalid_grant')) {
                    throw new Error('REFRESH_TOKEN_EXPIRED');
                }
            }
            else if (response.status === 401) {
                throw new Error('INVALID_CLIENT_CREDENTIALS');
            }
            throw new Error(`Token refresh failed (${response.status}): ${errorData}`);
        }
        const tokens = await response.json();
        tokens.created_at = Date.now();
        console.log('Access token refreshed successfully');
        return tokens;
    }
    /**
     * Make an authenticated API request with automatic token refresh
     */
    async makeAuthenticatedRequest(url, tokens, onTokenRefresh, updatedAfter) {
        let currentTokens = tokens;
        // Check if token needs refresh before making the request
        if (this.isTokenExpired(currentTokens)) {
            console.log('Access token expired, refreshing...');
            try {
                const newTokens = await this.refreshAccessToken(currentTokens.refresh_token);
                await onTokenRefresh(newTokens);
                currentTokens = newTokens;
            }
            catch (error) {
                if (error instanceof Error && (error.message === 'REFRESH_TOKEN_EXPIRED' ||
                    error.message === 'INVALID_SCOPE_REAUTH_REQUIRED')) {
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
            }
            catch (error) {
                if (error instanceof Error && (error.message === 'REFRESH_TOKEN_EXPIRED' ||
                    error.message === 'INVALID_SCOPE_REAUTH_REQUIRED')) {
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
    async fetchResults(tokens, onTokenRefresh, page = 1, updatedAfter) {
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
    async fetchAllResults(tokens, onTokenRefresh, updatedAfter) {
        let allResults = [];
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
exports.Concept2ApiService = Concept2ApiService;
//# sourceMappingURL=concept2ApiService.js.map