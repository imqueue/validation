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

// Implementation notes. The reader-facing overview of the package lives in the
// `@packageDocumentation` block in index.ts; what follows is only about how this
// module is built, which is not something a caller needs to know.
//
// TC39 decorator metadata (`Symbol.metadata`) would be the natural place to hang
// a class's field validators, but esbuild and tsx do not populate it reliably, so
// field decorators write into a module-level buffer that the class decorator then
// claims. That is safe only because field decorators run before their own class
// decorator and class bodies evaluate sequentially — do not introduce anything
// asynchronous between the two, and do not reorder them.

import { z, type ZodType } from 'zod';

/**
 * Any class constructor, abstract ones included.
 *
 * @remarks
 * This is the shape {@link Validator} accepts in place of a Zod schema — a class
 * sealed by {@link validatable}. `never[]` for the constructor parameters is
 * deliberate: nothing in this package ever constructs the class, it serves only
 * as a registry key, so `never[]` accepts every class regardless of what its
 * constructor actually takes.
 */
export type Ctor = abstract new (...args: never[]) => unknown;

/**
 * What {@link validate} and {@link validated} accept for a single value: a Zod
 * schema, a {@link validatable} class whose own field schemas should be used, or
 * `null`/`undefined` to skip validation at that position.
 *
 * @remarks
 * A class is resolved through {@link schemaOf} at the moment it is first needed
 * rather than when the decorator runs. That defers the cost, not the reference: the
 * class still has to be declared above the decorator that names it, which both the
 * compiler and the temporal dead zone enforce, so two input classes cannot be made
 * to reference each other.
 *
 * A class that was never sealed with {@link validatable} resolves to `null`, and
 * the value it was meant to guard is then left unvalidated with no error raised —
 * see {@link validate} for why that mistake usually shows up somewhere else
 * entirely.
 */
export type Validator = ZodType | Ctor | null | undefined;

type FieldValidators = Record<string, Validator>;

// Field decorators of one class run (at class-definition time) before that
// class's decorator, and class definitions evaluate sequentially — so this
// module-level buffer safely accumulates a class's field validators until
// `@validatable` seals them into the registry. Held on a const wrapper so the
// buffer can be reset without a reassignable binding.
const buffer: { pending: FieldValidators } = { pending: {} };
const registry = new WeakMap<object, FieldValidators>();

/**
 * Field decorator that records a validator for one class field, sitting beside
 * `@property` on an `@imqueue/rpc` input class.
 *
 * @remarks
 * The class itself must also carry {@link validatable}, and getting that wrong is
 * worse than it sounds. A field decorated here is buffered until a class
 * decorator claims it, and nothing flushes the buffer when a class body simply
 * ends — so a class that uses {@link validate} without {@link validatable} leaves
 * its fields behind for whichever class is sealed next. That class then demands
 * properties it does not declare and rejects input that was perfectly valid,
 * while the class with the actual mistake still validates nothing. The error
 * surfaces on the innocent one, so treat an unexplained missing-property failure
 * as a missing {@link validatable} somewhere above it.
 *
 * The field name becomes the key in the assembled object schema verbatim, so it
 * has to match the property name the caller sends.
 *
 * @param validator - A Zod schema, a {@link validatable} class for a nested input
 * object, or `null`/`undefined` to record nothing for this field.
 * @returns The TC39 field decorator that records `validator` against the field.
 * @throws Error if applied to anything other than a class field.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { validatable, validate } from '@imqueue/validation';
 *
 * @validatable()
 * class Credentials {
 *     @validate(z.string().email())
 *     email!: string;
 *
 *     @validate(z.string().min(8))
 *     password!: string;
 * }
 * ```
 */
export function validate(validator: Validator) {
    return (_value: undefined, context: ClassFieldDecoratorContext): void => {
        if (context.kind !== 'field') {
            throw new Error('@validate can only decorate a class field');
        }
        buffer.pending[String(context.name)] = validator;
    };
}

/**
 * Class decorator that seals the {@link validate} fields declared in this class,
 * making them retrievable through {@link schemaOf}.
 *
 * @remarks
 * Required on every class whose fields carry {@link validate}, for two
 * independent reasons: without it {@link schemaOf} returns `null`, and the
 * unclaimed fields go on to contaminate the next class that is sealed.
 *
 * It seals the fields declared in this class body and nothing else. Fields
 * inherited from a sealed parent are not included, so `schemaOf(Child)` describes
 * the child's own fields alone and an inherited field is validated only if the
 * subclass re-declares it. {@link schemaOf} does not walk the prototype chain
 * either: an undecorated subclass of a sealed parent resolves to `null` rather
 * than to the parent's schema.
 *
 * @returns The TC39 class decorator that seals the buffered field validators.
 * @throws Error if applied to anything other than a class.
 *
 * @example
 * ```typescript
 * @validatable()
 * class Address {
 *     @validate(z.string().min(1))
 *     city!: string;
 * }
 *
 * // A sealed class is itself usable as a validator for a nested object.
 * @validatable()
 * class Customer {
 *     @validate(z.string().min(1))
 *     name!: string;
 *
 *     @validate(Address)
 *     address!: Address;
 * }
 * ```
 */
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

/**
 * The assembled Zod object schema for a {@link validatable} class, or `null` when
 * the class contributes no validated fields.
 *
 * @remarks
 * Nested {@link validatable} classes are resolved recursively, so a field
 * validated by another input class produces a nested object schema. A nested class
 * that resolves to `null` is dropped from the shape rather than reported, which is
 * the same silent outcome described in {@link validate}.
 *
 * `null` rather than an empty `z.object({})` is deliberate — an empty object schema
 * accepts anything, so callers use `null` to mean there is nothing to check. The
 * cost is that a class with genuinely no rules and a class that forgot
 * {@link validatable} are indistinguishable from the return value alone.
 *
 * The schema does not reject unknown properties: `z.object` strips them, so a
 * caller may send fields the class never declared and validation still passes.
 *
 * @param target - A class sealed with {@link validatable}.
 * @returns A `z.object(...)` over the class's validated fields, or `null` if the
 * class was never sealed, declares no {@link validate} fields, or every one of
 * them resolved to no schema.
 *
 * @example
 * ```typescript
 * const schema = schemaOf(Credentials);
 *
 * if (schema) {
 *     schema.parse(input); // throws ZodError when input is invalid
 * }
 * ```
 */
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
 * Method decorator that checks a method's positional arguments before the method
 * body runs — the usual way to validate an `@imqueue/rpc` service method's input.
 *
 * @remarks
 * One validator per parameter, left to right. `null` or `undefined` skips that
 * position, and any argument past the end of the list is not checked at all. A
 * validator does still run at a position the caller left empty, against
 * `undefined`, so it fails there unless the schema is optional.
 *
 * This validates and nothing more: the method receives the argument the caller
 * passed, never the value Zod returned. A schema that transforms rather than
 * merely checks therefore has no effect on the method body — `z.string().trim()`
 * confirms the string is trimmable and hands over the untrimmed original,
 * `z.coerce.number()` accepts `'42'` while the parameter stays the string `'42'`,
 * `.default(...)` fills nothing in, and an object schema leaves undeclared
 * properties in place instead of stripping them. Where the converted value is what
 * the method needs, parse it in the body.
 *
 * Validators are resolved once, on the first call rather than when the decorator
 * runs, and memoized from then on. What that defers is the schema assembly, not the
 * reference to the class: a {@link validatable} class named here must still be
 * declared above this method, or the decorator argument hits the temporal dead zone
 * and throws `ReferenceError` at class-definition time.
 *
 * @param validators - One {@link Validator} per positional argument, in order.
 * @returns The TC39 method decorator that wraps the method in the check.
 * @throws Error if applied to anything other than a method.
 * @throws ZodError from Zod itself, unwrapped, on the first argument that fails.
 * That instance is what an in-process caller catches. A remote one catches nothing
 * of the kind: `@imqueue/rpc` turns any thrown error into its own payload, so the
 * client sees the code `IMQ_RPC_CALL_ERROR` and Zod's issue list as a message
 * string. Test `instanceof ZodError` locally; read the message remotely.
 *
 * @example
 * ```typescript
 * class UserService {
 *     // Validate the first argument against a sealed input class and the second
 *     // against a bare schema; skip the third.
 *     @validated(Credentials, z.string().min(2), null)
 *     async signUp(creds: Credentials, name: string, meta?: unknown) {
 *         // creds and name are known-good here
 *     }
 * }
 * ```
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
