/*!
 * @imqueue/validation — Zod-backed decorator validation for @imqueue
 *
 * I'm Queue Software Project
 * Copyright (C) 2025  imqueue.com <support@imqueue.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * If you want to use this code in a closed source (commercial) project, you can
 * purchase a proprietary commercial license. Please contact us at
 * <support@imqueue.com> to get commercial licensing options.
 */

/**
 * Zod-backed input validation for `@imqueue` services, expressed as native (TC39)
 * decorators rather than as a schema kept alongside the class it describes.
 *
 * Declare the rules on the input class itself — {@link validate} on each field,
 * {@link validatable} on the class to seal them — and then either guard a service
 * method's arguments with {@link validated} or fetch the assembled schema with
 * {@link schemaOf} and parse by hand. It is used by `@imqueue/rpc` services and by
 * the model code `@imqueue/pg-prisma` generates.
 *
 * @remarks
 * Two things about the decorators are worth knowing before you rely on them.
 *
 * {@link validatable} is not optional bookkeeping. Field validators are buffered
 * until a class decorator claims them, so a class that uses {@link validate}
 * without it hands its fields to the next class that is sealed — which then rejects
 * valid input over properties it does not declare, while the class with the real
 * mistake validates nothing. Seal every class that carries field validators.
 *
 * {@link validated} checks arguments without replacing them. The method body
 * receives exactly what the caller passed, so transforming schemas —
 * `z.coerce.number()`, `.trim()`, `.default(...)` — validate as expected and change
 * nothing that reaches the method.
 *
 * Failures throw Zod's own `ZodError`, unwrapped — but only in-process. Over RPC it
 * does not arrive as an exception at all: `@imqueue/rpc` converts whatever a method
 * throws into its own error payload, so the remote caller sees the code
 * `IMQ_RPC_CALL_ERROR` (a `ZodError` carries no code of its own) with Zod's issue
 * list as the message string, and `instanceof ZodError` never holds there. Zod is
 * the single runtime dependency.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { validatable, validate, validated } from '@imqueue/validation';
 *
 * @validatable()
 * class Credentials {
 *     @validate(z.string().email())
 *     email!: string;
 *
 *     @validate(z.string().min(8))
 *     password!: string;
 * }
 *
 * class AuthService {
 *     @validated(Credentials)
 *     async signIn(creds: Credentials): Promise<string> {
 *         return `token-for-${creds.email}`;
 *     }
 * }
 * ```
 *
 * @packageDocumentation
 */

export * from './src/index.js';
