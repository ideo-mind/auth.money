# 1P Protocol Integration TODOs

This document outlines the remaining work needed to implement the full 1P (One-Letter Password) protocol.

## 🔐 Signature Verification

### Aptos Signature Verification

- [ ] **File**: `src/utils/crypto.ts` - `verifyAptosSignature()`
- [ ] **Task**: Implement proper Aptos signature verification using Aptos SDK
- [ ] **Details**: Verify signature against expected address using the message
- [ ] **Current**: MVP placeholder (always returns true)

### 1FA Signature Verification

- [ ] **File**: `src/routes/authenticate/moneyPot.ts` - `/authenticate/options`
- [ ] **Task**: Implement 1FA private key signature verification
- [ ] **Details**: Verify signature using 1FA private key against the payload
- [ ] **Current**: MVP placeholder (always returns true)

## 🧩 Challenge Generation

### Real 1P Challenge Generation

- [ ] **File**: `src/utils/crypto.ts` - `generateChallengeGrids()`
- [ ] **Task**: Implement real 1P protocol challenge generation
- [ ] **Details**:
  - Generate random grid with characters from allowed domains
  - Place password character at random position
  - Assign colors based on legend mapping
  - Ensure password character is not too obvious
- [ ] **Current**: MVP fake challenges

### Domain Support

- [ ] **File**: `src/config/1p.ts` - `DOMAINS`
- [ ] **Task**: Implement character domain filtering
- [ ] **Details**: Use the defined domains (ASCII, symbols, emojis, etc.) for challenge generation
- [ ] **Current**: Basic ASCII only

## ✅ Solution Verification

### Real 1P Solution Verification

- [ ] **File**: `src/utils/crypto.ts` - `verify1PSolution()`
- [ ] **Task**: Implement actual 1P protocol verification
- [ ] **Details**:
  - Check solutions length matches challenges length
  - For each challenge, find password character position
  - Verify submitted direction matches legend mapping
  - All rounds must be correct for success
- [ ] **Current**: MVP placeholder (always returns true)

## 🎯 Advanced Features

### Difficulty Scaling

- [ ] **File**: `src/routes/authenticate/moneyPot.ts`
- [ ] **Task**: Implement proper difficulty scaling based on attempts
- [ ] **Details**: Use the formula: `min(attempts_count % 11 + 2, attempts_count + 2)`
- [ ] **Current**: Basic difficulty calculation

### Challenge Expiry

- [ ] **File**: `src/db/challengeStore.ts`
- [ ] **Task**: Implement proper challenge expiry handling
- [ ] **Details**: Ensure challenges expire after 5 minutes and are cleaned up
- [ ] **Current**: Basic expiry implementation

### Grid Size Configuration

- [ ] **File**: `src/config/1p.ts`
- [ ] **Task**: Make grid size configurable
- [ ] **Details**: Allow different grid sizes (3x3, 4x4, 5x5, etc.)
- [ ] **Current**: Fixed 5x5 grid

## 🔧 Integration Points

### Blockchain Integration

- [ ] **File**: `src/utils/aptos.ts`
- [ ] **Task**: Verify all blockchain calls are working correctly
- [ ] **Details**: Test pot creation, attempt tracking, and completion updates
- [ ] **Current**: Basic implementation with real Aptos calls

### Error Handling

- [ ] **File**: All route files
- [ ] **Task**: Add comprehensive error handling for 1P protocol failures
- [ ] **Details**: Handle invalid challenges, expired attempts, etc.
- [ ] **Current**: Basic error handling

## 🧪 Testing

### Unit Tests

- [ ] **File**: Create test files
- [ ] **Task**: Write unit tests for all 1P protocol functions
- [ ] **Details**: Test challenge generation, solution verification, signature verification
- [ ] **Current**: No unit tests

### Integration Tests

- [ ] **File**: Create test files
- [ ] **Task**: Write integration tests with real blockchain data
- [ ] **Details**: Test complete flow from pot creation to authentication
- [ ] **Current**: Manual testing only

## 📚 Documentation

### API Documentation

- [ ] **File**: `API_ENDPOINTS.md`
- [ ] **Task**: Update API documentation with real 1P protocol details
- [ ] **Details**: Document actual challenge format, solution format, etc.
- [ ] **Current**: Basic API documentation

### Protocol Documentation

- [ ] **File**: Create new file
- [ ] **Task**: Document the 1P protocol implementation
- [ ] **Details**: Explain how the protocol works, security considerations, etc.
- [ ] **Current**: No protocol documentation

## 🚀 Performance

### Optimization

- [ ] **File**: All files
- [ ] **Task**: Optimize challenge generation and verification
- [ ] **Details**: Ensure fast response times for large grids and high difficulty
- [ ] **Current**: Basic implementation

### Caching

- [ ] **File**: `src/db/` files
- [ ] **Task**: Implement caching for frequently accessed data
- [ ] **Details**: Cache pot configurations, challenge data, etc.
- [ ] **Current**: No caching

## 🔒 Security

### Input Validation

- [ ] **File**: All route files
- [ ] **Task**: Add comprehensive input validation
- [ ] **Details**: Validate all inputs for 1P protocol (solutions, challenges, etc.)
- [ ] **Current**: Basic validation

### Rate Limiting

- [ ] **File**: Add middleware
- [ ] **Task**: Implement rate limiting for authentication attempts
- [ ] **Details**: Prevent brute force attacks on challenges
- [ ] **Current**: No rate limiting

---

## Priority Order

1. **High Priority**: Signature verification, challenge generation, solution verification
2. **Medium Priority**: Domain support, difficulty scaling, error handling
3. **Low Priority**: Advanced features, performance optimization, documentation

## Notes

- All current implementations are MVP placeholders
- Focus on core 1P protocol functionality first
- Ensure compatibility with existing blockchain integration
- Maintain backward compatibility during implementation
