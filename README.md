# @imqueue/validation

[![License](https://img.shields.io/badge/license-GPL-blue.svg)](https://rawgit.com/imqueue/validation/master/LICENSE)

Zod-backed, field- and method-level validation via native (TC39) decorators for
Node.js & TypeScript back-ends — the input-validation layer of the @imqueue
framework. Declare a validator next to a class field with `@validate`, seal the
class with `@validatable`, and validate method arguments with `@validated`.

**Documentation:** full guides, tutorial and API reference at
[imqueue.org](https://imqueue.org/). Commercial licensing & support for
closed-source products at [imqueue.com](https://imqueue.com/).

**Using an AI assistant?** Point it at [imqueue.org/llms.txt](https://imqueue.org/llms.txt)
for a machine-readable index of the docs, or see [AGENTS.md](./AGENTS.md).

**Related packages:**

- [@imqueue/core](https://github.com/imqueue/core) - Fast JSON message queue
  over Redis for inter-service communication.
- [@imqueue/rpc](https://github.com/imqueue/rpc) - RPC-like client/service
  implementation over @imqueue/core.
- [@imqueue/pg-prisma](https://github.com/imqueue/pg-prisma) - Prisma/Postgres
  toolkit for @imqueue services.

# Features

- **Native TC39 decorators** — no `experimentalDecorators`, no
  `reflect-metadata`. Works under the standard TypeScript decorator emit.
- **Zod schemas** — reuse any `zod` schema as a field or argument validator.
- **Composable** — a `@validatable` class can be used as a validator for a
  field or argument on another class, so nested input shapes validate
  recursively.
- **Method-argument validation** — `@validated(...)` checks positional
  arguments left-to-right; a `null`/`undefined` entry skips that position.
- **TypeScript included!**

# Requirements

Node.js ≥ 22.12. `zod` v4 is a runtime dependency.

# Install

```bash
npm i --save @imqueue/validation
```

# Usage

```typescript
import { z } from 'zod';
import {
    validatable,
    validate,
    validated,
    schemaOf,
} from '@imqueue/validation';

@validatable()
class Credentials {
    @validate(z.string().min(3))
    identifier!: string;

    @validate(z.string().min(8))
    secret!: string;
}

// A schema assembled from the field validators (or `null` if the class has none)
const schema = schemaOf(Credentials); // z.object({ identifier, secret })

class AuthService {
    // Validate positional arguments before the method body runs.
    // Pass a Zod schema, a `@validatable` class, or `null`/`undefined` to skip.
    @validated(Credentials)
    authenticate(creds: Credentials): string {
        return creds.identifier;
    }
}

new AuthService().authenticate({ identifier: 'ab', secret: 'short' });
// → throws ZodError (identifier too short, secret too short)
```

## How it works

TC39 decorator metadata (`Symbol.metadata`) is not populated by every build
tool (esbuild/tsx), so field validators are buffered as each class body
evaluates and **sealed** onto the class by the `@validatable()` class decorator.
Field decorators run before the class decorator and class bodies evaluate
sequentially, so the buffer is always attributed to the right class.
`schemaOf(Class)` then assembles the sealed field validators into a
`z.object(...)`.

## Running Unit Tests

Tests run on the native Node.js test runner (`node:test`) with `node:assert` and
no external test framework:

```bash
git clone git@github.com:imqueue/validation.git
cd validation
npm install
npm test
```

To produce a coverage report use:

```bash
npm run test-coverage        # prints coverage summary to the console
npm run test-lcov            # writes coverage/lcov.info
```

## License

This project is licensed under the GNU General Public License v3.0.
See the [LICENSE](LICENSE)
