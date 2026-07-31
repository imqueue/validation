/*!
 * Characterization tests for the behaviours the doc-blocks describe
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

// These pin the claims the public doc-blocks make, so that changing any of them
// fails here rather than quietly turning the published API reference into
// fiction. Where a test asserts behaviour that is arguably wrong it says so —
// the point is that the docs and the code agree, not that the behaviour is ideal.
//
// DECLARATION ORDER IN THIS FILE IS LOAD-BEARING. `@validate` buffers into
// module state that the next `@validatable` claims, so the deliberately
// unsealed classes live at the very bottom, after everything that would
// otherwise inherit their fields. That hazard is the subject of the last test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { schemaOf, validatable, validate, validated } from '../../index.js';

// --- inheritance ----------------------------------------------------------
@validatable()
class Base {
    @validate(z.string().min(2))
    baseField!: string;
}

@validatable()
class Derived extends Base {
    @validate(z.number())
    derivedField!: number;
}

class UnsealedDerived extends Base {}

const keysOf = (schema: unknown): string[] =>
    Object.keys((schema as { shape: Record<string, unknown> }).shape).sort();

test("a sealed subclass exposes its own fields only, not the parent's", () => {
    const schema = schemaOf(Derived);

    assert.ok(schema);
    assert.deepEqual(keysOf(schema), ['derivedField']);
});

test('schemaOf does not walk the prototype chain', () => {
    assert.equal(schemaOf(UnsealedDerived), null);
});

// --- @validated checks, it does not convert -------------------------------
class Passthrough {
    @validated(z.string().trim())
    trimmed(s: string): string {
        return s;
    }

    @validated(z.coerce.number())
    coerced(n: unknown): string {
        return typeof n;
    }

    @validated(z.object({ known: z.string() }))
    keys(o: Record<string, unknown>): string[] {
        return Object.keys(o).sort();
    }

    @validated(z.string().min(1), z.number())
    two(a?: string, b?: number): string {
        return `${a}/${b}`;
    }

    @validated(z.string().min(1))
    one(a: string, b: unknown): unknown {
        return b;
    }
}

test("the method receives the caller's argument, not the parsed value", () => {
    // z.string().trim() validates and returns a trimmed copy, which is discarded.
    assert.equal(new Passthrough().trimmed('  padded  '), '  padded  ');
});

test('a coercing schema validates without coercing what the method sees', () => {
    // Accepts '42' because it is coercible, then hands over the string.
    assert.equal(new Passthrough().coerced('42'), 'string');
});

test('an object schema does not strip undeclared properties', () => {
    assert.deepEqual(new Passthrough().keys({ known: 'x', extra: 1 }), [
        'extra',
        'known',
    ]);
});

test('a validator at a position the caller left empty runs against undefined', () => {
    assert.throws(
        () => new Passthrough().two('present'),
        (e: unknown) => e instanceof z.ZodError,
    );
});

test('arguments past the end of the validator list are not checked', () => {
    const anything = { not: 'validated' };

    assert.equal(new Passthrough().one('ok', anything), anything);
});

// --- a sealed class as a validator ----------------------------------------
// Deferred resolution does NOT let this class be declared below `UsesInput`:
// the decorator argument is evaluated when `UsesInput` is defined, so the other
// order is a TS2449 at compile time and a ReferenceError at run time. What is
// actually deferred is the schema assembly, which lazy-resolution.spec.ts pins.
@validatable()
class Input {
    @validate(z.string().min(1))
    value!: string;
}

class UsesInput {
    @validated(Input)
    run(v: Input): string {
        return v.value;
    }
}

test('a sealed class used as a validator validates the argument', () => {
    assert.equal(
        new UsesInput().run({ value: 'resolved' } as Input),
        'resolved',
    );
    assert.throws(
        () => new UsesInput().run({ value: '' } as Input),
        (e: unknown) => e instanceof z.ZodError,
    );
});

// --- the buffer hazard, declared last on purpose --------------------------
// Documented in `validate`: an unsealed class hands its fields to the next
// sealed one. This test pins that, because the published docs now warn about
// it — if the mechanism is ever fixed, this test and those docs change together.
class ForgotToSeal {
    @validate(z.string().min(3))
    strayField!: string;
}

@validatable()
class SealedAfterwards {
    @validate(z.number())
    ownField!: number;
}

test('an unsealed class leaks its fields into the next sealed class', () => {
    assert.equal(
        schemaOf(ForgotToSeal),
        null,
        'the unsealed class gets nothing',
    );

    const schema = schemaOf(SealedAfterwards);

    assert.ok(schema);
    assert.deepEqual(
        keysOf(schema),
        ['ownField', 'strayField'],
        'the stray field lands on the innocent class',
    );
    // ...and the consequence: valid input for SealedAfterwards is rejected,
    // because it is now required to carry a property it never declared.
    assert.throws(
        () => schema.parse({ ownField: 1 }),
        (e: unknown) => e instanceof z.ZodError,
    );
});
