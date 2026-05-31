export interface GitHubRunLocator {
  owner: string;
  repo: string;
  runId: number;
  jobId?: number;
}

export interface GitHubWorkflowStep {
  name: string;
  conclusion: string | null;
  status?: string;
  number?: number;
}

export interface GitHubWorkflowJob {
  id: number;
  name: string;
  conclusion: string | null;
  status?: string;
  html_url?: string;
  steps?: GitHubWorkflowStep[];
}

export interface GitHubWorkflowJobsResponse {
  jobs: GitHubWorkflowJob[];
}

export interface TriageSummary {
  failedJobs: Array<{
    id: number;
    name: string;
    url?: string;
    failedSteps: GitHubWorkflowStep[];
    localCommands: string[];
  }>;
}

const DEFAULT_REPO = "pr0h0/bpl3";

class CliUsageError extends Error {}

const RELEASE_SMOKE_STEP_PATTERN =
  /(?:ReleaseSmoke\.test|release smoke|release:smoke)/i;
const PACKAGE_RESOLVER_STEP_PATTERN = new RegExp(
  [
    "PackageResolver\\.test",
    "CLIJsonParseability\\.test",
    "package resolver",
    "package search directory",
    "global package root failures",
  ].join("|"),
  "i",
);
const PACKAGE_SOURCE_SAFETY_STEP_PATTERN = new RegExp(
  [
    "package source-safety",
    "entrypoint resolves to a symbolic link candidate",
    "subpath .* resolves to a symbolic link candidate",
    "unsafe entrypoint",
    "missing bpl\\.json",
    "invalid bpl\\.json",
    "package manifest symlink",
  ].join("|"),
  "i",
);

const STEP_REPRO_COMMANDS: Array<[RegExp, string]> = [
  [/^Type check$/i, "bun run check"],
  [/^Lint$/i, "bun run lint"],
  [/Run Windows-safe codegen tests/i, "bun run test:codegen-cross-platform"],
  [/Run WebAssembly runtime tests/i, "bun run test:wasm"],
  [/Run CI-safe test suite/i, "bun run test:ci"],
  [RELEASE_SMOKE_STEP_PATTERN, "bun run release:smoke"],
  [RELEASE_SMOKE_STEP_PATTERN, "bun test tests/ReleaseSmoke.test.ts"],
  [RELEASE_SMOKE_STEP_PATTERN, "bun test tests/ReleaseHelperSmoke.test.ts"],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz:repro -- --help",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz:repro -- --input --json",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz -- --iterations --crash-dir fuzz/crashes",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz:replay -- --metadata --mode parser",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz:promote -- --metadata --name bug",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run ci:triage -- --help",
  ],
  [PACKAGE_RESOLVER_STEP_PATTERN, "bun test tests/PackageResolver.test.ts"],
  [
    PACKAGE_RESOLVER_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "package search directory"',
  ],
  [
    PACKAGE_RESOLVER_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "global package root failures"',
  ],
  [
    PACKAGE_SOURCE_SAFETY_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "entrypoint|subpath|manifest"',
  ],
  [
    PACKAGE_SOURCE_SAFETY_STEP_PATTERN,
    "bun test tests/PackageResolver.test.ts",
  ],
  [/Run compiler correctness tests/i, "bun run test:correctness"],
  [/Validate saved fuzz failure artifacts/i, "bun run fuzz:validate-artifacts"],
  [/Run sanitizer-backed runtime tests/i, "bun run test:sanitizers"],
  [/Run deterministic differential compiler fuzz/i, "bun run fuzz:differential"],
  [/Run deterministic compiler fuzz/i, "bun run fuzz:long"],
  [
    /Minimize fuzz crash artifacts/i,
    "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json --minimize",
  ],
];

export function formatCiTriageHelp(): string {
  return [
    "Usage: bun tools/ci_triage.ts [--json] [--repo owner/repo] <run-id-or-actions-url>",
    "",
    "Summarize failed GitHub Actions jobs and print local BPL reproduction commands.",
    "",
    "Options:",
    "  --json             Print machine-readable JSON.",
    "  --repo owner/repo  Default repository for numeric run IDs.",
    "  -h, --help         Show this help without making a GitHub API request.",
    "",
  ].join("\n");
}

export function parseGitHubRunLocator(
  input: string,
  defaultRepo = DEFAULT_REPO,
): GitHubRunLocator {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    const [owner, repo] = parseRepo(defaultRepo);
    return { owner, repo, runId: Number(trimmed) };
  }

  const url = new URL(trimmed);
  if (url.hostname !== "github.com") {
    throw new Error(`Expected a github.com Actions run URL, got ${url.href}`);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const actionsIndex = parts.indexOf("actions");
  const runsIndex = parts.indexOf("runs");
  if (parts.length < 5 || actionsIndex !== 2 || runsIndex !== 3) {
    throw new Error(`Expected a GitHub Actions run URL, got ${url.href}`);
  }

  const owner = parts[0]!;
  const repo = parts[1]!;
  const runId = Number(parts[4]);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new Error(`Invalid GitHub Actions run id in ${url.href}`);
  }

  const jobIndex = parts.indexOf("job");
  const jobId =
    jobIndex >= 0 && parts[jobIndex + 1]
      ? Number(parts[jobIndex + 1])
      : undefined;

  return Number.isSafeInteger(jobId) && jobId! > 0
    ? { owner, repo, runId, jobId }
    : { owner, repo, runId };
}

export function summarizeWorkflowJobs(
  jobs: GitHubWorkflowJob[],
): TriageSummary {
  const failedJobs = jobs
    .filter((job) => job.conclusion === "failure")
    .map((job) => {
      const failedSteps = (job.steps ?? []).filter(
        (step) => step.conclusion === "failure",
      );
      const localCommands = uniqueStrings(
        failedSteps.flatMap((step) => localCommandsForStep(step.name)),
      );

      return {
        id: job.id,
        name: job.name,
        url: job.html_url,
        failedSteps,
        localCommands,
      };
    });

  return { failedJobs };
}

export function localCommandsForStep(stepName: string): string[] {
  return STEP_REPRO_COMMANDS.filter(([pattern]) => pattern.test(stepName)).map(
    ([, command]) => command,
  );
}

export function formatTriageSummary(
  locator: GitHubRunLocator,
  summary: TriageSummary,
): string {
  const lines = [
    `GitHub Actions triage: ${locator.owner}/${locator.repo} run ${locator.runId}`,
  ];

  if (summary.failedJobs.length === 0) {
    lines.push("No failed jobs found.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("", "Failed jobs:");
  for (const job of summary.failedJobs) {
    lines.push(`- ${job.name} (job ${job.id})`);
    if (job.url) {
      lines.push(`  url: ${job.url}`);
    }

    if (job.failedSteps.length > 0) {
      lines.push("  failed steps:");
      for (const step of job.failedSteps) {
        lines.push(`  - ${step.name}`);
      }
    }

    if (job.localCommands.length > 0) {
      lines.push("  local repro:");
      for (const command of job.localCommands) {
        lines.push(`  - ${command}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

async function fetchWorkflowJobs(
  locator: GitHubRunLocator,
): Promise<GitHubWorkflowJob[]> {
  const url = `https://api.github.com/repos/${locator.owner}/${locator.repo}/actions/runs/${locator.runId}/jobs?filter=latest&per_page=100`;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as GitHubWorkflowJobsResponse;
  return body.jobs;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const help = takeFlag(args, "--help") || takeFlag(args, "-h");
  if (help) {
    process.stdout.write(formatCiTriageHelp());
    return;
  }

  const json = takeFlag(args, "--json");
  const repo = takeOption(args, "--repo") ?? DEFAULT_REPO;
  const explicitRun = takeOption(args, "--run");
  const unknownOption = args.find((arg) => arg.startsWith("-"));
  if (unknownOption) {
    throw new CliUsageError(
      `Unknown option ${unknownOption.split("=", 1)[0]}. Use --help for usage.`,
    );
  }

  const run = explicitRun ?? args[0];
  const extraArgument = explicitRun ? args[0] : args[1];
  if (extraArgument) {
    throw new CliUsageError(`Unexpected argument: ${extraArgument}`);
  }

  if (!run) {
    console.error(formatCiTriageHelp().trimEnd());
    process.exit(2);
  }

  const locator = parseGitHubRunLocator(run, repo);
  const jobs = await fetchWorkflowJobs(locator);
  const selectedJobs = locator.jobId
    ? jobs.filter((job) => job.id === locator.jobId)
    : jobs;
  const summary = summarizeWorkflowJobs(selectedJobs);

  if (json) {
    console.log(JSON.stringify({ locator, summary }, null, 2));
  } else {
    process.stdout.write(formatTriageSummary(locator, summary));
  }
}

function parseRepo(repo: string): [string, string] {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`Expected repository as owner/name, got ${repo}`);
  }
  return [owner, name];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function takeOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new CliUsageError(`Missing value for ${flag}`);
  }

  args.splice(index, 2);
  return value;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof CliUsageError ? 2 : 1);
  });
}
