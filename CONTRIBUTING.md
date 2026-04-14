# Contributing to FreeLang Nexus

Welcome! We appreciate your interest in contributing to FreeLang Nexus.

## Development Setup

```bash
# Clone and install
git clone https://github.com/kim/freelang-nexus.git
cd freelang-nexus
npm install

# Build and test
npm run build
npm test
```

## Making Changes

### Code Style
- Use TypeScript with strict mode enabled
- Follow existing naming conventions
- Add comments for complex logic

### Testing
- Write tests for new features
- Ensure all tests pass: `npm test`
- Use descriptive test names

### Adding a New Language

1. **Update AST** (`src/nexus/parser/ast.ts`)
   ```typescript
   lang: '...' | 'swift' | '...'  // Add your language
   ```

2. **Update Codegen** (`src/nexus/codegen/nexus-codegen.ts`)
   - Add file extension in `inferSourceName()`
   - Add function extraction pattern in `genLangBlock()`

3. **Update Runtime** (`src/nexus/runtime/nexus-runner.ts`)
   - Add compiler detection: `hasSwift()`
   - Add build command handling in `buildLangBlock()`

4. **Add Example** (`examples/`)
   - Create example using the new language

5. **Add Tests** (`tests/`)
   - Create comprehensive test suite

### Commit Messages

Follow conventional commits:
```
feat: Add Swift language support
fix: Correct FFI binding generation
docs: Update architecture guide
test: Add tests for new feature
```

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes and commit
3. Push to your fork: `git push origin feature/my-feature`
4. Open a Pull Request with a clear description
5. Ensure CI passes
6. Request review

## Reporting Issues

- Use GitHub Issues for bug reports
- Include reproduction steps
- Provide error messages and logs
- Specify your environment (OS, Node version, compiler versions)

## Code of Conduct

- Be respectful and constructive
- Welcome diverse perspectives
- Help others learn and grow

Thank you for contributing! 🎉
