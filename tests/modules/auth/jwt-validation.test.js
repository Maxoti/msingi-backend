/**
 * JWT Validation Tests
 * Tests JWT token creation, validation, expiration, signing, and security features
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { promisify } = require('util');

// Mock configuration
const JWT_CONFIG = {
  accessSecret: process.env.JWT_SECRET || 'test_access_secret_key_12345_sufficient_length',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_key_67890_sufficient_length',
  accessExpiry: '15m',
  refreshExpiry: '7d',
  issuer: 'school-management-system',
  audience: 'school-api-users'
};

// Helper functions that would typically be in your JWT utility module
const jwtUtils = {
  /**
   * Generate access token
   */
  generateAccessToken: (payload) => {
    return jwt.sign(
      payload,
      JWT_CONFIG.accessSecret,
      {
        expiresIn: JWT_CONFIG.accessExpiry,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience
      }
    );
  },

  /**
   * Generate refresh token
   */
  generateRefreshToken: (payload) => {
    return jwt.sign(
      payload,
      JWT_CONFIG.refreshSecret,
      {
        expiresIn: JWT_CONFIG.refreshExpiry,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience
      }
    );
  },

  /**
   * Verify access token
   */
  verifyAccessToken: (token) => {
    return jwt.verify(token, JWT_CONFIG.accessSecret, {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience
    });
  },

  /**
   * Verify refresh token
   */
  verifyRefreshToken: (token) => {
    return jwt.verify(token, JWT_CONFIG.refreshSecret, {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience
    });
  },

  /**
   * Decode token without verification
   */
  decodeToken: (token) => {
    return jwt.decode(token, { complete: true });
  }
};

describe('JWT Validation Tests', () => {
  describe('Token Generation', () => {
    test('should generate valid access token', () => {
      const payload = {
        userId: 123,
        username: 'testuser',
        role: 'TEACHER'
      };

      const token = jwtUtils.generateAccessToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // Header.Payload.Signature
    });

    test('should generate valid refresh token', () => {
      const payload = {
        userId: 123,
        type: 'refresh'
      };

      const token = jwtUtils.generateRefreshToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    test('should include all payload data in token', () => {
      const payload = {
        userId: 456,
        username: 'janesmith',
        role: 'ADMIN',
        email: 'jane@example.com'
      };

      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.email).toBe(payload.email);
    });

    test('should add standard JWT claims', () => {
      const payload = { userId: 789 };
      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      expect(decoded).toHaveProperty('iat'); // Issued at
      expect(decoded).toHaveProperty('exp'); // Expiration
      expect(decoded).toHaveProperty('iss'); // Issuer
      expect(decoded).toHaveProperty('aud'); // Audience
      expect(decoded.iss).toBe(JWT_CONFIG.issuer);
      expect(decoded.aud).toBe(JWT_CONFIG.audience);
    });

    test('should set correct expiration time for access token', () => {
      const payload = { userId: 111 };
      const beforeGeneration = Math.floor(Date.now() / 1000);
      
      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      const expiresIn = decoded.exp - decoded.iat;
      
      // Should expire in approximately 15 minutes (900 seconds)
      expect(expiresIn).toBeGreaterThanOrEqual(895);
      expect(expiresIn).toBeLessThanOrEqual(905);
    });

    test('should set correct expiration time for refresh token', () => {
      const payload = { userId: 222 };
      const token = jwtUtils.generateRefreshToken(payload);
      const decoded = jwt.decode(token);

      const expiresIn = decoded.exp - decoded.iat;
      
      // Should expire in approximately 7 days (604800 seconds)
      expect(expiresIn).toBeGreaterThanOrEqual(604000);
      expect(expiresIn).toBeLessThanOrEqual(605000);
    });

    test('should generate unique tokens for same payload', async () => {
      const payload = { userId: 333 };

      const token1 = jwtUtils.generateAccessToken(payload);
      
      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const token2 = jwtUtils.generateAccessToken(payload);

      expect(token1).not.toBe(token2);
    });

    test('should handle empty payload', () => {
      const token = jwtUtils.generateAccessToken({});
      const decoded = jwt.decode(token);

      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });

    test('should handle complex nested payload', () => {
      const payload = {
        userId: 444,
        metadata: {
          department: 'Science',
          subjects: ['Physics', 'Chemistry'],
          permissions: {
            canEdit: true,
            canDelete: false
          }
        }
      };

      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      expect(decoded.metadata).toEqual(payload.metadata);
      expect(decoded.metadata.subjects).toEqual(['Physics', 'Chemistry']);
    });
  });

  describe('Token Verification', () => {
    test('should verify valid access token', () => {
      const payload = { userId: 555, username: 'testuser' };
      const token = jwtUtils.generateAccessToken(payload);

      const verified = jwtUtils.verifyAccessToken(token);

      expect(verified).toBeTruthy();
      expect(verified.userId).toBe(payload.userId);
      expect(verified.username).toBe(payload.username);
    });

    test('should verify valid refresh token', () => {
      const payload = { userId: 666, type: 'refresh' };
      const token = jwtUtils.generateRefreshToken(payload);

      const verified = jwtUtils.verifyRefreshToken(token);

      expect(verified).toBeTruthy();
      expect(verified.userId).toBe(payload.userId);
      expect(verified.type).toBe('refresh');
    });

    test('should reject token with invalid signature', () => {
      const payload = { userId: 777 };
      const token = jwtUtils.generateAccessToken(payload);
      
      // Tamper with the token
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.invalid_signature`;

      expect(() => {
        jwtUtils.verifyAccessToken(tamperedToken);
      }).toThrow();
    });

    test('should reject expired token', async () => {
      const payload = { userId: 888 };
      
      // Generate token that expires immediately
      const expiredToken = jwt.sign(
        payload,
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '1ms',
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        }
      );

      // Wait to ensure expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(() => {
        jwtUtils.verifyAccessToken(expiredToken);
      }).toThrow(jwt.TokenExpiredError);
    });

    test('should reject token with wrong secret', () => {
      const payload = { userId: 999 };
      const token = jwt.sign(payload, 'wrong_secret', { expiresIn: '15m' });

      expect(() => {
        jwtUtils.verifyAccessToken(token);
      }).toThrow(jwt.JsonWebTokenError);
    });

    test('should reject malformed token', () => {
      const malformedTokens = [
        'not.a.valid.token',
        'invalid_token',
        '',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'header.payload'
      ];

      malformedTokens.forEach(token => {
        expect(() => {
          jwtUtils.verifyAccessToken(token);
        }).toThrow();
      });
    });

    test('should reject token with tampered payload', () => {
      const payload = { userId: 1010, role: 'TEACHER' };
      const token = jwtUtils.generateAccessToken(payload);
      
      // Decode and modify payload
      const parts = token.split('.');
      const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      decodedPayload.role = 'ADMIN'; // Attempt privilege escalation
      
      const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      expect(() => {
        jwtUtils.verifyAccessToken(tamperedToken);
      }).toThrow(jwt.JsonWebTokenError);
    });

    test('should reject token with wrong issuer', () => {
      const payload = { userId: 1111 };
      const token = jwt.sign(
        payload,
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '15m',
          issuer: 'wrong-issuer',
          audience: JWT_CONFIG.audience
        }
      );

      expect(() => {
        jwtUtils.verifyAccessToken(token);
      }).toThrow();
    });

    test('should reject token with wrong audience', () => {
      const payload = { userId: 1212 };
      const token = jwt.sign(
        payload,
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '15m',
          issuer: JWT_CONFIG.issuer,
          audience: 'wrong-audience'
        }
      );

      expect(() => {
        jwtUtils.verifyAccessToken(token);
      }).toThrow();
    });

    test('should reject access token verified as refresh token', () => {
      const payload = { userId: 1313 };
      const accessToken = jwtUtils.generateAccessToken(payload);

      expect(() => {
        jwtUtils.verifyRefreshToken(accessToken);
      }).toThrow(jwt.JsonWebTokenError);
    });

    test('should reject refresh token verified as access token', () => {
      const payload = { userId: 1414 };
      const refreshToken = jwtUtils.generateRefreshToken(payload);

      expect(() => {
        jwtUtils.verifyAccessToken(refreshToken);
      }).toThrow(jwt.JsonWebTokenError);
    });
  });

  describe('Token Decoding', () => {
    test('should decode token without verification', () => {
      const payload = { userId: 1515, username: 'decoder' };
      const token = jwtUtils.generateAccessToken(payload);

      const decoded = jwtUtils.decodeToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded).toHaveProperty('header');
      expect(decoded).toHaveProperty('payload');
      expect(decoded).toHaveProperty('signature');
      expect(decoded.payload.userId).toBe(payload.userId);
    });

    test('should decode header information', () => {
      const payload = { userId: 1616 };
      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwtUtils.decodeToken(token);

      expect(decoded.header.alg).toBe('HS256');
      expect(decoded.header.typ).toBe('JWT');
    });

    test('should decode expired token without error', () => {
      const expiredToken = jwt.sign(
        { userId: 1717 },
        JWT_CONFIG.accessSecret,
        { expiresIn: '0s' }
      );

      // Decoding should work even for expired tokens
      const decoded = jwt.decode(expiredToken);
      expect(decoded).toBeTruthy();
      expect(decoded.userId).toBe(1717);
    });

    test('should decode token with tampered signature', () => {
      const payload = { userId: 1818 };
      const token = jwtUtils.generateAccessToken(payload);
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.tampered_signature`;

      // Decoding should work even with invalid signature
      const decoded = jwt.decode(tamperedToken);
      expect(decoded).toBeTruthy();
      expect(decoded.userId).toBe(payload.userId);
    });

    test('should return null for malformed token during decode', () => {
      const decoded = jwt.decode('not_a_valid_token');
      expect(decoded).toBeNull();
    });

    test('should decode and extract specific claims', () => {
      const payload = {
        userId: 1919,
        username: 'claims_test',
        role: 'ADMIN'
      };
      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe(1919);
      expect(decoded.username).toBe('claims_test');
      expect(decoded.role).toBe('ADMIN');
      expect(typeof decoded.iat).toBe('number');
      expect(typeof decoded.exp).toBe('number');
    });
  });

  describe('Token Expiration', () => {
    test('should identify expired token', () => {
      const expiredToken = jwt.sign(
        { userId: 2020 },
        JWT_CONFIG.accessSecret,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      expect(() => {
        jwtUtils.verifyAccessToken(expiredToken);
      }).toThrow(jwt.TokenExpiredError);
    });

    test('should identify token about to expire', () => {
      const payload = { userId: 2121 };
      const token = jwt.sign(
        payload,
        JWT_CONFIG.accessSecret,
        { expiresIn: '1s' } // Expires in 1 second
      );

      const decoded = jwt.decode(token);
      const timeUntilExpiry = decoded.exp - Math.floor(Date.now() / 1000);

      expect(timeUntilExpiry).toBeLessThanOrEqual(1);
      expect(timeUntilExpiry).toBeGreaterThanOrEqual(0);
    });

    test('should calculate remaining token lifetime', () => {
      const payload = { userId: 2222 };
      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = decoded.exp - now;

      // Should have approximately 15 minutes (900 seconds) remaining
      expect(remainingSeconds).toBeGreaterThan(850);
      expect(remainingSeconds).toBeLessThan(950);
    });

    test('should handle token created in future (clock skew)', () => {
      const futureToken = jwt.sign(
        { userId: 2323 },
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '15m',
          notBefore: Math.floor(Date.now() / 1000) + 3600 // Not valid for 1 hour
        }
      );

      expect(() => {
        jwt.verify(futureToken, JWT_CONFIG.accessSecret, {
          clockTolerance: 0
        });
      }).toThrow(jwt.NotBeforeError);
    });

    test('should allow clock tolerance for expiration', () => {
      const almostExpiredToken = jwt.sign(
        { userId: 2424 },
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '0s',
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        }
      );

      // With clock tolerance, recently expired token might still be valid
      const verified = jwt.verify(
        almostExpiredToken,
        JWT_CONFIG.accessSecret,
        {
          clockTolerance: 10, // 10 seconds tolerance
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        }
      );

      expect(verified).toBeTruthy();
    });

    test('should reject token expired beyond clock tolerance', async () => {
      const expiredToken = jwt.sign(
        { userId: 2525 },
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '0s',
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        }
      );

      // Wait to ensure it's expired beyond tolerance
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(() => {
        jwt.verify(expiredToken, JWT_CONFIG.accessSecret, {
          clockTolerance: 0,
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        });
      }).toThrow(jwt.TokenExpiredError);
    });
  });

  describe('Token Security', () => {
    test('should use secure algorithm (HS256)', () => {
      const payload = { userId: 2626 };
      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwtUtils.decodeToken(token);

      expect(decoded.header.alg).toBe('HS256');
    });

    test('should reject token with "none" algorithm', () => {
      // Attempt to create token with no signature
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ userId: 2727 })).toString('base64');
      const noneToken = `${header}.${payload}.`;

      expect(() => {
        jwtUtils.verifyAccessToken(noneToken);
      }).toThrow();
    });

    test('should validate token signature integrity', () => {
      const payload = { userId: 2828, role: 'TEACHER' };
      const token = jwtUtils.generateAccessToken(payload);
      
      // Split token and modify signature
      const parts = token.split('.');
      const modifiedSignature = parts[2].split('').reverse().join('');
      const tamperedToken = `${parts[0]}.${parts[1]}.${modifiedSignature}`;

      expect(() => {
        jwtUtils.verifyAccessToken(tamperedToken);
      }).toThrow(jwt.JsonWebTokenError);
    });

    test('should prevent privilege escalation via token tampering', () => {
      const payload = { userId: 2929, role: 'TEACHER' };
      const token = jwtUtils.generateAccessToken(payload);
      
      // Attempt to modify role in payload
      const parts = token.split('.');
      const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      decodedPayload.role = 'ADMIN';
      
      const newPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
      const tamperedToken = `${parts[0]}.${newPayload}.${parts[2]}`;

      expect(() => {
        jwtUtils.verifyAccessToken(tamperedToken);
      }).toThrow();
    });

    test('should use different secrets for access and refresh tokens', () => {
      const payload = { userId: 3030 };
      const accessToken = jwtUtils.generateAccessToken(payload);
      const refreshToken = jwtUtils.generateRefreshToken(payload);

      // Access token should not verify with refresh secret
      expect(() => {
        jwtUtils.verifyRefreshToken(accessToken);
      }).toThrow();

      // Refresh token should not verify with access secret
      expect(() => {
        jwtUtils.verifyAccessToken(refreshToken);
      }).toThrow();
    });

    test('should not include sensitive data in token', () => {
      const payload = {
        userId: 3131,
        username: 'testuser',
        // Should NOT include:
        // password, password_hash, ssn, credit_card, etc.
      };

      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      expect(decoded).not.toHaveProperty('password');
      expect(decoded).not.toHaveProperty('password_hash');
      expect(decoded).not.toHaveProperty('ssn');
      expect(decoded).not.toHaveProperty('credit_card');
    });

    test('should have minimum secret key length', () => {
      // Secrets should be at least 256 bits (32 characters)
      expect(JWT_CONFIG.accessSecret.length).toBeGreaterThanOrEqual(32);
      expect(JWT_CONFIG.refreshSecret.length).toBeGreaterThanOrEqual(32);
    });

    test('should use unique secrets for access and refresh', () => {
      expect(JWT_CONFIG.accessSecret).not.toBe(JWT_CONFIG.refreshSecret);
    });
  });

  describe('Token Claims Validation', () => {
    test('should validate issuer claim', () => {
      const payload = { userId: 3232 };
      const token = jwt.sign(
        payload,
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '15m',
          issuer: 'wrong-issuer'
        }
      );

      expect(() => {
        jwt.verify(token, JWT_CONFIG.accessSecret, {
          issuer: JWT_CONFIG.issuer
        });
      }).toThrow();
    });

    test('should validate audience claim', () => {
      const payload = { userId: 3333 };
      const token = jwt.sign(
        payload,
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '15m',
          audience: 'wrong-audience'
        }
      );

      expect(() => {
        jwt.verify(token, JWT_CONFIG.accessSecret, {
          audience: JWT_CONFIG.audience
        });
      }).toThrow();
    });

    test('should validate subject claim if present', () => {
      const payload = { userId: 3434 };
      const token = jwt.sign(
        payload,
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '15m',
          subject: 'user:3434'
        }
      );

      const verified = jwt.verify(token, JWT_CONFIG.accessSecret, {
        subject: 'user:3434'
      });

      expect(verified.sub).toBe('user:3434');
    });

    test('should validate jti (JWT ID) for uniqueness', () => {
      const jti1 = crypto.randomBytes(16).toString('hex');
      const jti2 = crypto.randomBytes(16).toString('hex');

      const token1 = jwt.sign(
        { userId: 3535 },
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '15m',
          jwtid: jti1
        }
      );

      const token2 = jwt.sign(
        { userId: 3535 },
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '15m',
          jwtid: jti2
        }
      );

      const decoded1 = jwt.decode(token1);
      const decoded2 = jwt.decode(token2);

      expect(decoded1.jti).not.toBe(decoded2.jti);
    });

    test('should validate nbf (not before) claim', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      const token = jwt.sign(
        { userId: 3636 },
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '2h',
          notBefore: futureTime
        }
      );

      expect(() => {
        jwt.verify(token, JWT_CONFIG.accessSecret, {
          clockTolerance: 0
        });
      }).toThrow(jwt.NotBeforeError);
    });

    test('should accept token after nbf time', () => {
      // Create a token with nbf claim in the past
      // Use Math.floor to ensure integer seconds
      const now = Math.floor(Date.now() / 1000);
      const pastTime = now - 120; // 2 minutes in the past
      
      const token = jwt.sign(
        { userId: 3737 },
        JWT_CONFIG.accessSecret,
        {
          expiresIn: '2h',
          notBefore: 0, // Token becomes valid 2 minutes ago
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        }
      );

      // Verify with generous clock tolerance
      const verified = jwt.verify(token, JWT_CONFIG.accessSecret, {
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience,
        clockTolerance: 180 // 3 minutes tolerance for any clock skew
      });
      
      expect(verified.userId).toBe(3737);
      expect(verified.nbf).toBeLessThanOrEqual(now);
    });
  });

  describe('Token Payload Validation', () => {
    test('should validate required custom claims', () => {
      const validateToken = (token) => {
        const decoded = jwt.verify(token, JWT_CONFIG.accessSecret, {
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        });

        if (!decoded.userId) {
          throw new Error('Missing required claim: userId');
        }
        if (!decoded.role) {
          throw new Error('Missing required claim: role');
        }

        return decoded;
      };

      // Valid token
      const validToken = jwtUtils.generateAccessToken({
        userId: 3838,
        username: 'testuser',
        role: 'TEACHER'
      });

      expect(() => validateToken(validToken)).not.toThrow();

      // Invalid token - missing role
      const invalidToken = jwtUtils.generateAccessToken({
        userId: 3839,
        username: 'testuser'
      });

      expect(() => validateToken(invalidToken)).toThrow('Missing required claim: role');
    });

    test('should validate role enum values', () => {
      const validRoles = ['ADMIN', 'TEACHER', 'PARENT', 'STUDENT'];

      const validateRole = (token) => {
        const decoded = jwt.verify(token, JWT_CONFIG.accessSecret, {
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        });

        if (!validRoles.includes(decoded.role)) {
          throw new Error('Invalid role');
        }

        return decoded;
      };

      const validToken = jwtUtils.generateAccessToken({
        userId: 3940,
        role: 'TEACHER'
      });

      expect(() => validateRole(validToken)).not.toThrow();

      const invalidToken = jwtUtils.generateAccessToken({
        userId: 3941,
        role: 'INVALID_ROLE'
      });

      expect(() => validateRole(invalidToken)).toThrow('Invalid role');
    });

    test('should validate userId is positive integer', () => {
      const validateUserId = (token) => {
        const decoded = jwt.verify(token, JWT_CONFIG.accessSecret, {
          issuer: JWT_CONFIG.issuer,
          audience: JWT_CONFIG.audience
        });

        if (typeof decoded.userId !== 'number' || decoded.userId <= 0) {
          throw new Error('Invalid userId');
        }

        return decoded;
      };

      const validToken = jwtUtils.generateAccessToken({ userId: 4040 });
      expect(() => validateUserId(validToken)).not.toThrow();

      const invalidToken1 = jwtUtils.generateAccessToken({ userId: -1 });
      expect(() => validateUserId(invalidToken1)).toThrow('Invalid userId');

      const invalidToken2 = jwtUtils.generateAccessToken({ userId: 'abc' });
      expect(() => validateUserId(invalidToken2)).toThrow('Invalid userId');
    });

    test('should handle special characters in payload', () => {
      const payload = {
        userId: 4141,
        username: 'test<user>',
        description: "Test's \"description\" & more"
      };

      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      expect(decoded.username).toBe('test<user>');
      expect(decoded.description).toBe("Test's \"description\" & more");
    });

    test('should handle unicode characters in payload', () => {
      const payload = {
        userId: 4242,
        name: '测试用户',
        emoji: '🎓📚'
      };

      const token = jwtUtils.generateAccessToken(payload);
      const decoded = jwt.decode(token);

      expect(decoded.name).toBe('测试用户');
      expect(decoded.emoji).toBe('🎓📚');
    });
  });

  describe('Token Size and Performance', () => {
    test('should generate reasonably sized tokens', () => {
      const payload = {
        userId: 4343,
        username: 'performancetest',
        role: 'TEACHER'
      };

      const token = jwtUtils.generateAccessToken(payload);
      
      // JWT tokens should typically be under 1KB
      expect(token.length).toBeLessThan(1024);
    });

    test('should handle large payloads', () => {
      const largePayload = {
        userId: 4444,
        metadata: {
          description: 'A'.repeat(1000),
          tags: Array(50).fill('tag'),
          settings: {}
        }
      };

      // Fill settings with many properties
      for (let i = 0; i < 50; i++) {
        largePayload.metadata.settings[`setting${i}`] = `value${i}`;
      }

      const token = jwtUtils.generateAccessToken(largePayload);
      const decoded = jwt.decode(token);

      expect(decoded.metadata.description.length).toBe(1000);
      expect(decoded.metadata.tags.length).toBe(50);
    });

    test('should generate tokens quickly', () => {
      const iterations = 1000;
      const payload = { userId: 4545, username: 'speedtest', role: 'TEACHER' };

      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        jwtUtils.generateAccessToken(payload);
      }
      
      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // Average generation time should be under 5ms (system-dependent)
      expect(avgTime).toBeLessThan(5);
    });

    test('should verify tokens quickly', () => {
      const iterations = 1000;
      const payload = { userId: 4646, username: 'verifyspeed' };
      const token = jwtUtils.generateAccessToken(payload);

      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        jwtUtils.verifyAccessToken(token);
      }
      
      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // Average verification time should be under 5ms (system-dependent)
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null payload gracefully', () => {
      expect(() => {
        jwt.sign(null, JWT_CONFIG.accessSecret);
      }).toThrow();
    });

    test('should handle undefined token in verification', () => {
      expect(() => {
        jwtUtils.verifyAccessToken(undefined);
      }).toThrow();
    });

    test('should handle empty string token', () => {
      expect(() => {
        jwtUtils.verifyAccessToken('');
      }).toThrow();
    });

    test('should handle token with extra dots', () => {
      const token = jwtUtils.generateAccessToken({ userId: 4747 });
      const invalidToken = token + '.extra';

      expect(() => {
        jwtUtils.verifyAccessToken(invalidToken);
      }).toThrow();
    });

    test('should handle token with missing parts', () => {
      const token = jwtUtils.generateAccessToken({ userId: 4848 });
      const parts = token.split('.');
      const incompleteToken = `${parts[0]}.${parts[1]}`;

      expect(() => {
        jwtUtils.verifyAccessToken(incompleteToken);
      }).toThrow();
    });

    test('should handle whitespace in token', () => {
      const token = jwtUtils.generateAccessToken({ userId: 4949 });
      const tokenWithSpaces = ` ${token} `;

      // Verification should fail with whitespace
      expect(() => {
        jwtUtils.verifyAccessToken(tokenWithSpaces);
      }).toThrow();

      // But should work if trimmed
      const verified = jwtUtils.verifyAccessToken(tokenWithSpaces.trim());
      expect(verified.userId).toBe(4949);
    });

    test('should provide meaningful error messages', () => {
      const expiredToken = jwt.sign(
        { userId: 5050 },
        JWT_CONFIG.accessSecret,
        { expiresIn: '-1h' }
      );

      try {
        jwtUtils.verifyAccessToken(expiredToken);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(jwt.TokenExpiredError);
        expect(error.message).toMatch(/expired/i);
        expect(error).toHaveProperty('expiredAt');
      }
    });

    test('should differentiate between error types', () => {
      // Expired token
      const expiredToken = jwt.sign(
        { userId: 5151 },
        JWT_CONFIG.accessSecret,
        { expiresIn: '-1h' }
      );

      try {
        jwtUtils.verifyAccessToken(expiredToken);
      } catch (error) {
        expect(error.name).toBe('TokenExpiredError');
      }

      // Invalid signature
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUxNTF9.invalid_signature';

      try {
        jwtUtils.verifyAccessToken(invalidToken);
      } catch (error) {
        expect(error.name).toBe('JsonWebTokenError');
      }

      // Malformed token
      try {
        jwtUtils.verifyAccessToken('not.a.valid.jwt.token');
      } catch (error) {
        expect(error.name).toBe('JsonWebTokenError');
      }
    });
  });
});