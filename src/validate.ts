/*!
 * Field- and method-level validation via native (TC39) decorators
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
 * Field- and method-level validation via native (TC39) decorators.
 *
 * - `@validate(validator)` sits next to `@property` on a class field and records
 *   a validator for it — a Zod schema, or a `@validatable` class whose own field
 *   schema is used (resolved lazily, so nested input classes can be referenced).
 * - `@validatable()` (a class decorator) seals the field schemas onto the class
 *   so `schemaOf` can retrieve them — required because esbuild/tsx does not
 *   populate TC39 decorator metadata (`Symbol.metadata`), so field schemas are
 *   buffered and sealed instead. Field decorators run before the class decorator
 *   and class bodies evaluate sequentially, so the buffer is safe.
 * - `schemaOf(Class)` returns the assembled `z.object(...)`, or null.
 * - `@validated(...)` on a method validates its positional arguments — each entry
 *   is a Zod schema, a `@validatable` class (resolved via `schemaOf`), or
 *   `null`/`undefined` to skip that argument. Invalid input throws the raw
 *   `ZodError` (which surfaces to the RPC caller).
 */

import { z, type ZodType } from 'zod';

type Ctor = abstract new (...args: never[]) => unknown;

/** A validator: a schema, a `@validatable` class, or nothing (skip). */
export type Validator = ZodType | Ctor | null | undefined;

type FieldValidators = Record<string, Validator>;

// Field decorators of one class run (at class-definition time) before that
// class's decorator, and class definitions evaluate sequentially — so this
// module-level buffer safely accumulates a class's field validators until
// `@validatable` seals them into the registry. Held on a const wrapper so the
// buffer can be reset without a reassignable binding.
const buffer: { pending: FieldValidators } = { pending: {} };
const registry = new WeakMap<object, FieldValidators>();

/** Field decorator: attach a validator to a class field (beside `@property`). */
export function validate(validator: Validator) {
    return (_value: undefined, context: ClassFieldDecoratorContext): void => {
        if (context.kind !== 'field') {
            throw new Error('@validate can only decorate a class field');
        }
        buffer.pending[String(context.name)] = validator;
    };
}

/** Class decorator: seal the `@validate` fields declared in this class. */
export function validatable() {
    return (target: Ctor, context: ClassDecoratorContext): void => {
        if (context.kind !== 'class') {
            throw new Error('@validatable can only decorate a class');
        }
        registry.set(target, buffer.pending);
        buffer.pending = {};
    };
}

function toSchema(validator: Validator): ZodType | null {
    if (validator == null) {
        return null;
    }
    // A class constructor → resolve its sealed field schemas; otherwise a schema.
    return typeof validator === 'function' ? schemaOf(validator) : validator;
}

/** The assembled object schema for a `@validatable` class, or null if it has none. */
export function schemaOf(target: Ctor): ZodType | null {
    const fields = registry.get(target);
    if (!fields) {
        return null;
    }
    const shape: Record<string, ZodType> = {};
    for (const [name, validator] of Object.entries(fields)) {
        const schema = toSchema(validator);
        if (schema) {
            shape[name] = schema;
        }
    }

    return Object.keys(shape).length > 0 ? z.object(shape) : null;
}

/**
 * Method decorator: validate positional arguments before the method runs. Pass
 * one validator per argument, left to right; `null`/`undefined` skips that
 * position. Throws the raw `ZodError` on the first failure.
 */
export function validated(...validators: Validator[]) {
    // Resolved lazily on first call (so `@validatable` classes are already
    // sealed) and memoized on a const wrapper — no reassignable binding.
    const cache: { schemas?: (ZodType | null)[] } = {};

    return <T extends (...args: never[]) => unknown>(
        method: T,
        context: ClassMethodDecoratorContext,
    ): T => {
        if (context.kind !== 'method') {
            throw new Error('@validated can only decorate a method');
        }

        return function (this: unknown, ...args: unknown[]): unknown {
            const schemas = (cache.schemas ??= validators.map(toSchema));
            for (const [i, schema] of schemas.entries()) {
                schema?.parse(args[i]);
            }
            const fn = method as unknown as (...a: unknown[]) => unknown;

            return fn.apply(this, args);
        } as unknown as T;
    };
}
