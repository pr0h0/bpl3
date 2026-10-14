# BPL web packages

The web stack is split into a small HTTP core and optional extensions. Workspace
imports use these source directories. For another project, install the `.tgz`
archives with `bpl install /absolute/path/package.tgz`. Archive dependencies use
relative sibling archive references, so keep the package directory layout when
installing from a checkout. Repack edited packages with `bun index.ts pack
packages/package-name -o packages/package-name` before distributing them.

| Package | Purpose | Optional native dependency |
| --- | --- | --- |
| [bpl-express](bpl-express/README.md) | Routing, middleware, responses, public assets | Linux socket backend |
| [bpl-http-parser](bpl-http-parser/README.md) | Bounded request framing and decoded queries | None |
| [bpl-http-client](bpl-http-client/README.md) | Synchronous HTTP requests and bounded responses | Linux sockets; no TLS |
| [bpl-templ](bpl-templ/README.md) | Compiled templates and HTML escaping | Native template CLI |
| [bpl-db](bpl-db/README.md) | Typed in-memory tables and trusted snapshots | None |
| [bpl-validation](bpl-validation/README.md) | Input rules and JSON field errors | None |
| [bpl-web-middleware](bpl-web-middleware/README.md) | Headers, explicit CORS, JSON checks, forms | Uses bpl-express |
| [bpl-csv](bpl-csv/README.md) | Optional CSV downloads and reports | None |
| [bpl-sqlite](bpl-sqlite/README.md) | Prepared statements and transactions | Link native SQLite |

Start with the [college task board](../examples/college_web/README.md). Handler
signatures follow the familiar Express/Gin pattern: `frame handler(req:
*Request, res: *Response)`. Send a terminal response to short-circuit middleware;
mount borrowed routers for application modules. Validation records field codes
rather than silently converting invalid input. SQLite provides explicit SQL
and bindings rather than a mandatory ORM.

For optional functionality, publish another BPL package exposing RouteHandler
frames, a router factory, or a service object. Keep database/email/queue/native
library dependencies in that extension's manifest and link instructions. Avoid
loading optional services in the core. Use a wrapper frame when middleware needs
configuration; keep referenced state alive through the server loop. Examples
include application-specific permissions, a mail provider integration, or a job
queue adapter. CSV exports already have an optional writer; the other examples
are extension points, not built-in modules.

Ownership is explicit: copy request data before keeping it, close prepared
statements, release JSON parse results, and destroy validators/builders. BPL
defers capture values. For a mutable owner, defer through a pointer to the live
object (`local owner: *StringBuilder = &sb; defer owner.destroy();`) so cleanup
observes buffer growth and changed fields.

Current limits are material: the HTTP backend is Linux IPv4 and sequential,
without TLS, keep-alive, HTTP/2, or multipart uploads. It does not provide an
authentication/session system, CSRF enforcement, a connection pool, migrations,
or automatic request schemas. HTTP/1.1 transfer-encoded request bodies are
rejected explicitly. These packages improve the existing prototype and provide
a tested project foundation; they do not establish parity with mature frameworks
or guarantee that a complex deployment is ready without further testing.

Run package regressions with:

```bash
bun test tests/WebPackages.test.ts tests/WebCSVPackage.test.ts tests/WebValidationPackage.test.ts tests/WebMiddlewarePackage.test.ts tests/WebSQLitePackage.test.ts tests/WebCollegeExample.test.ts tests/WebPackageCompilerRegressions.test.ts tests/PackageManifestSchema.test.ts
```

Socket tests require Linux; SQLite tests skip when the runtime library is absent.
Template/parsing/validation tests compile and run real native BPL programs.
