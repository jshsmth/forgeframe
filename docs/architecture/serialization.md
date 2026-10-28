---
name: architecture/serialization
title: Serialization
desc: Cross-realm values, JSON conversion, caller-data snapshots, and event payload types.
tags: []
sources: []
created: 2026-10-01T01:55:30Z
updated: 2026-10-28T00:00:00Z
---

# Serialization

- **Cross-realm values.** Neutral realm-value helpers recognize genuine `Date` internal branding and ordinary object prototypes across windows. Schemas, output comparisons, array admission, and recursive codecs share these helpers. Class instances are not ordinary records.
- **JSON conversion.** Props and exports cross as JSON through the function bridge. Each object other than an array, a `Date`, or native raw JSON converts once, as native JSON does: a callable `toJSON(key)` with its original receiver, then primitive-wrapper unboxing. Fields and getters are read once, so `Date` encoders run once per occurrence. A native JSON probe with an empty property list unboxes boxed primitives without enumerating ordinary records or running exception-driven brand checks; custom coercion hooks, foreign wrappers, and `BigInt` rejection behave as in native JSON. Native raw JSON, recognized by its brand even from another realm, passes through unchanged, so the message's JSON encoding writes its text and the receiver parses the value it represents.
- **Snapshots of caller data.** Bridge array encoding captures indexed entries once during presence admission, regardless of the array's prototype or overridden methods, and encodes that snapshot, so getters cannot introduce unchecked `undefined` entries on a second read. Object schema shapes, tuple item arrays, union branch arrays, and enum value arrays are shallow-copied at construction; later caller mutation cannot change an established schema, its diagnostics, or its presence clones.
- **Event payloads.** Each event's payload type comes from one event map (`ComponentEvents` for instances, `HostEvents` for hosts), and handlers are removed only through the function their registration returned.
