# Keyword Index

Reserved words in BPL (the grammar's `KeywordReserved` rule). None of them can
be used as an identifier, including as a method name (`Config.default` is
invalid; use `Config.defaults`).

- Declarations: `frame`, `ret`, `static`, `struct`, `spec`, `enum`, `type`,
  `Self`
- Variables: `local`, `global`, `const`
- Modules: `import`, `export`, `extern`, `from`, `as`
- Control flow: `if`, `else`, `loop`, `break`, `continue`, `return`,
  `switch`, `case`, `default`, `fallthrough`
- Errors: `try`, `catch`, `throw`
- Expressions: `cast`, `sizeof`, `typeof`, `offsetof`, `match`, `is`
- Types: `Func`, `Lambda`
- Literals: `true`, `false`, `null`, `nullptr`
- Inline assembly: `asm`
