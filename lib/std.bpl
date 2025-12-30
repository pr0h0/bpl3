# BPL Standard Library
# This module re-exports all standard library components for easy access.

# Core Type System
import [Type], [Any] from "std/type.bpl";
export [Type];
export [Any];

# Specs / Interfaces
import [Comparable], [Equatable], [Destructible], [Cloneable] from "std/core_specs.bpl";
import [Iterator], [Iterable] from "std/iter_specs.bpl";

export [Comparable];
export [Equatable];
export [Destructible];
export [Cloneable];
export [Iterator];
export [Iterable];

import [Int], [Double], [Bool], [Long], [Char], [UChar], [Short], [UShort], [UInt], [ULong] from "std/primitives.bpl";
export [Int];
export [Bool];
export [Double];
export [Long];
export [Char];
export [UChar];
export [Short];
export [UShort];
export [UInt];
export [ULong];

import [OptionUnwrapError], [ResultUnwrapError], [IOError], [CastError], [IndexOutOfBoundsError], [EmptyError], [NullAccessError], [DivisionByZeroError], [StackOverflowError] from "std/errors.bpl";
export [OptionUnwrapError];
export [ResultUnwrapError];
export [IOError];
export [CastError];
export [IndexOutOfBoundsError];
export [EmptyError];
export [NullAccessError];
export [DivisionByZeroError];
export [StackOverflowError];

# Data Structures
import [Array] from "std/array.bpl";
export [Array];

import [Map] from "std/map.bpl";
export [Map];

import [String] from "std/string.bpl";
export [String];

import [Stack] from "std/stack.bpl";
export [Stack];

import [Queue] from "std/queue.bpl";
export [Queue];

import [Set] from "std/set.bpl";
export [Set];

import [LinkedList], [ListNode] from "std/linked_list.bpl";
export [LinkedList];
export [ListNode];

import [PriorityQueue] from "std/priority_queue.bpl";
export [PriorityQueue];

import [likely], [unlikely], [prefetch], [trap], [debugtrap] from "std/intrinsics.bpl";
export [likely];
export [unlikely];
export [prefetch];
export [trap];
export [debugtrap];

import [Option] from "std/option.bpl";
export [Option];

import [Result] from "std/result.bpl";
export [Result];

import [Vec2] from "std/vec2.bpl";
export [Vec2];

import [Vec3] from "std/vec3.bpl";
export [Vec3];

# Utilities
import [IO] from "std/io.bpl";
export [IO];

import [FS] from "std/fs.bpl";
export [FS];

import [Path] from "std/path.bpl";
export [Path];

import [Math] from "std/math.bpl";
export [Math];

import [Rand] from "std/rand.bpl";
export [Rand];

import [Time] from "std/time.bpl";
export [Time];

import [Assert] from "std/assert.bpl";
export [Assert];

# Algorithms
import [Algorithm] from "std/algorithm.bpl";
export [Algorithm];

# Additional Utilities
import [Range] from "std/range.bpl";
export [Range];

import [StringBuilder] from "std/string_builder.bpl";
export [StringBuilder];
