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

import [printf], [fprintf], [dprintf], [sprintf], [snprintf], [puts], [putchar], [scanf], [gets], [write], [malloc], [free], [memcpy], [memmove], [memset], [strlen], [strcmp], [strncmp], [strcpy], [strcat], [atoi] from "std/c.bpl";
export [printf];
export [fprintf];
export [dprintf];
export [sprintf];
export [snprintf];
export [puts];
export [putchar];
export [scanf];
export [gets];
export [write];
export [malloc];
export [free];
export [memcpy];
export [memmove];
export [memset];
export [strlen];
export [strcmp];
export [strncmp];
export [strcpy];
export [strcat];
export [atoi];

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
import {PI}, {E}, {TAU}, {SQRT2}, {LN2}, {LN10} from "std/math.bpl";
export [Math];
export {PI};
export {E};
export {TAU};
export {SQRT2};
export {LN2};
export {LN10};

import [Rand] from "std/rand.bpl";
export [Rand];

import [Time], [Duration], [Stopwatch] from "std/time.bpl";
export [Time];
export [Duration];
export [Stopwatch];

import [Assert] from "std/assert.bpl";
export [Assert];

# Algorithms
import [Algorithm] from "std/algorithm.bpl";
export [Algorithm];

# UTF-8 Utilities
import [UTF8] from "std/utf8.bpl";
export [UTF8];

# Character Utilities
import [CharUtils] from "std/char_utils.bpl";
export [CharUtils];

# Additional Utilities
import [Range] from "std/range.bpl";
export [Range];

import [StringBuilder] from "std/string_builder.bpl";
export [StringBuilder];

import [Args] from "std/args.bpl";
export [Args];

import [Command], [Flag], [Argument], [ArgParser], [ParsedArgs] from "std/arg_parser.bpl";
export [Command];
export [Flag];
export [Argument];
export [ArgParser];
export [ParsedArgs];

import [JSON], [JsonToResult], [JsonParseResult], [Jsonable] from "std/json.bpl";
export [JSON];
export [JsonToResult];
export [JsonParseResult];
export [Jsonable];

import [Log] from "std/log.bpl";
export [Log];

import exec, execStatus, execOutput, execShell, execSilent, sleep, [ProcessResult] from "std/process.bpl";
export exec;
export execStatus;
export execOutput;
export execShell;
export execSilent;
export sleep;
export [ProcessResult];

# New Utilities
import [BitSet] from "std/bitset.bpl";
export [BitSet];

import [Base64] from "std/base64.bpl";
export [Base64];

import [Hex] from "std/hex.bpl";
export [Hex];

import [Hash] from "std/hash.bpl";
export [Hash];

import [UUID] from "std/uuid.bpl";
export [UUID];

import [Stats] from "std/stats.bpl";
export [Stats];

import [Complex] from "std/complex.bpl";
export [Complex];

import [Rational] from "std/rational.bpl";
export [Rational];

import [Env] from "std/env.bpl";
export [Env];

import [Date], [DateTime] from "std/date.bpl";
export [Date];
export [DateTime];
