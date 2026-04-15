# FreeLang Nexus 2 🌍

**Multi-language to FreeLang v9 Transpiler**

Write Rust, Go, C, Python in a single `.fl` file, automatically transpile to FreeLang v9, and run with a single runtime.

## Core Idea

Instead of compiling each language natively (requiring rustc, go, gcc, python3 installed), **Nexus 2 transpiles all languages to FreeLang v9**.

```
hello.fl (Rust + Go + C + Python)
    ↓ Nexus 2 Transpiler
unified.fl (Single FreeLang v9)
    ↓ FreeLang v9 Runtime
    Output
```

## What It Solves

❌ **Problem (Nexus 1)**: Each language needs its native compiler installed
- `npm run build` requires rustc + go + gcc + python3 + zig + julia
- 여러 도구체인 설치 필요
- CI/CD 복잡함

✅ **Solution (Nexus 2)**: Only FreeLang v9 runtime needed
- No native compilers required
- Single unified output file
- Portable across any environment with Node.js

## Quick Start

```bash
# Install dependencies
npm install

# Transpile and run
npm run nexus2 build examples/hello-nexus2.fl
```

### Example: hello-nexus2.fl

```fl
@mode(v)

// 🦀 Rust: calculation
@lang("rust")
---
#[no_mangle]
pub extern "C" fn double_it(x: i32) -> i32 { x * 2 }
---

// 🐍 Python: greeting
@mode(python)
def greet(name):
    print("Hello from Python: " + name)

// 🔷 V: orchestrator
@mode(v)
fn main() -> i64 {
  let result = double_it(21)
  greet("Nexus 2")
  println(result)
  return 0
}
```

Output:
```
Hello from Python: Nexus 2
42
```

## How It Works

1. **Parser**: Nexus Lexer + Parser extracts language blocks from `.fl` file
2. **Transpiler**: Each language block → FreeLang v9 function
3. **Codegen**: Generates unified `unified.fl` 
4. **Runtime**: `node ~/freelang-v9/dist/cli.js run unified.fl`

## Type Mapping

| Rust | Go | C | Python | FreeLang v9 |
|------|-----|---|--------|-------------|
| i32/i64 | int/int64 | int/long | int | i64 |
| f32/f64 | float64 | double | float | f64 |
| String/&str | string | char* | str | str |
| bool | bool | bool | bool | bool |
| void/() | — | void | None | void |

## Supported Languages

| Language | Export Marker | Status |
|----------|---------------|--------|
| Rust | `#[no_mangle] pub extern "C" fn` | ✅ MVP |
| Go | `//export funcName` | ✅ MVP |
| C | Function declarations | ✅ MVP |
| Python | `def funcName` | ✅ MVP |
| V | Native | ✅ Passthrough |

## MVP Scope (Phase 1)

### ✅ Implemented
- Function signature transpilation
- Basic type mapping
- Body transpilation (simple operations)
- Unified file generation

### 📋 Future
- Advanced features (generics, closures, pointers)
- Standard library mapping (printf → println, etc.)
- Error handling and diagnostics
- Performance optimization

## Testing

```bash
# Unit tests
npm test

# Specific test
npm test -- transpiler.test.ts

# With coverage
npm test -- --coverage
```

## Project Structure

```
.
├── package.json
├── tsconfig.json
├── jest.config.js
├── src/
│   ├── cli.ts                  # Entry point
│   ├── parser/                 # Lexer/Parser (from Nexus 1)
│   │   ├── nexus-lexer.ts
│   │   └── nexus-parser.ts
│   ├── transpiler/             # Core transpilation
│   │   ├── base.ts             # Common utilities
│   │   └── main.ts             # Main transpiler
│   └── codegen/
│       └── unified.ts          # Code generation
├── examples/
│   └── hello-nexus2.fl         # First example
├── tests/
│   └── transpiler.test.ts      # Unit tests
└── dist/                       # Compiled output
```

## Requirements

- Node.js >= 18.0.0
- FreeLang v9 runtime (set `FREELANG_CLI` env var or install to `~/freelang-v9/dist/cli.js`)
- TypeScript (dev dependency)

## License

MIT

---

**Author**: kimjindol (with Claude Code)  
**Version**: 2.0.0-alpha
