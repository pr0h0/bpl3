/**
 * Embedded Completion Scripts
 * Contains bash and zsh completion scripts as strings for the compiled binary
 */

/**
 * Get the embedded bash completion script
 */
export function getBashCompletionScript(): string {
  return `#!/usr/bin/env bash
# Bash completion script for bpl CLI
# Installation:
#   1. Copy this file to /etc/bash_completion.d/bpl or ~/.local/share/bash-completion/completions/bpl
#   2. Or source it in your ~/.bashrc: source /path/to/bpl-completion.bash
#   3. Reload your shell or run: source ~/.bashrc

_bpl_completion() {
    local cur prev opts base
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    # Main commands
    local commands="format run dev build check lint init pack install list uninstall package-cache completion clean new help docs bindgen doctor"

    # Global options (work with file arguments and commands)
    local global_opts="-e --eval --stdin -o --output --emit --target --sysroot --cpu --march --clang-flag --wasm-runtime -l --lib -L --lib-path --object -v --verbose -q --quiet --cache --cache-stats -j --jobs -h --help -V --version -d --dwarf --debug --time --json --color --no-color -O"

    # Format command options
    local format_opts="-w --write -v --verbose"

    # Lint command options
    local lint_opts="-v --verbose"

    # Init command options
    local init_opts="-v --verbose"

    # New command options
    local new_opts="-v --verbose --template --no-git"

    # New command templates
    local new_templates="app library"

    # Doctor command options
    local doctor_opts="packages --json"

    # Package cache subcommands and options
    local package_cache_commands="list verify repair clean"
    local package_cache_opts="list verify repair clean --json --package-version --dry-run"

    # Pack command options
    local pack_opts="-v --verbose"

    # Install command options
    local install_opts="-v --verbose --locked --update --repair-lock"

    # List command options
    local list_opts="-v --verbose"

    # Clean command options
    local clean_opts="-v --verbose --dry-run --json"

    # Uninstall command options
    local uninstall_opts="-v --verbose"

    # Completion command options
    local completion_opts="bash zsh"

    # Emit types
    local emit_types="llvm ast tokens formatted"
    local wasm_runtime_modes="freestanding host"

    # Check if we're after a specific option that needs a value
    case "\${prev}" in
        -o|--output)
            # Complete with file paths
            COMPREPLY=( $(compgen -f -- "\${cur}") )
            return 0
        ;;
        --emit)
            COMPREPLY=( $(compgen -W "\${emit_types}" -- "\${cur}") )
            return 0
        ;;
        --target)
            # Common target triples
            local targets="x86_64-pc-linux-gnu aarch64-unknown-linux-gnu arm64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-gnu wasm32-unknown-unknown wasm32-wasi"
            COMPREPLY=( $(compgen -W "\${targets}" -- "\${cur}") )
            return 0
        ;;
        --wasm-runtime)
            COMPREPLY=( $(compgen -W "\${wasm_runtime_modes}" -- "\${cur}") )
            return 0
        ;;
        --sysroot|--lib-path|-L)
            # Complete with directories
            COMPREPLY=( $(compgen -d -- "\${cur}") )
            return 0
        ;;
        --object)
            # Complete with object files
            COMPREPLY=( $(compgen -f -X '!*.@(o|ll|bc)' -- "\${cur}") )
            return 0
        ;;
        -l|--lib)
            # Don't complete, let user type library name
            return 0
        ;;
        --template)
            COMPREPLY=( $(compgen -W "\${new_templates}" -- "\${cur}") )
            return 0
        ;;
        --cpu|--march|--clang-flag|-e|--eval|-j|--jobs)
            # Don't complete, let user type
            return 0
        ;;
    esac

    # Determine which command we're in (if any)
    local command=""
    local i
    for ((i=1; i<COMP_CWORD; i++)); do
        local word="\${COMP_WORDS[i]}"
        if [[ " $commands " =~ " $word " ]]; then
            command="$word"
            break
        fi
    done

    # If we have a command, complete based on that command
    if [[ -n "$command" ]]; then
        case "$command" in
            format)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "\${format_opts}" -- "\${cur}") )
                else
                    # Complete with .bpl files
                    COMPREPLY=( $(compgen -f -X '!*.bpl' -- "\${cur}") )
                fi
                return 0
            ;;
            lint)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "\${lint_opts}" -- "\${cur}") )
                else
                    # Complete with .bpl files
                    COMPREPLY=( $(compgen -f -X '!*.bpl' -- "\${cur}") )
                fi
                return 0
            ;;
            init)
                COMPREPLY=( $(compgen -W "\${init_opts}" -- "\${cur}") )
                return 0
            ;;
            new)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "\${new_opts}" -- "\${cur}") )
                fi
                return 0
            ;;
            doctor)
                COMPREPLY=( $(compgen -W "\${doctor_opts}" -- "\${cur}") )
                return 0
            ;;
            package-cache)
                COMPREPLY=( $(compgen -W "\${package_cache_opts}" -- "\${cur}") )
                return 0
            ;;
            pack)
                COMPREPLY=( $(compgen -W "\${pack_opts}" -- "\${cur}") )
                return 0
            ;;
            install)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "\${install_opts}" -- "\${cur}") )
                else
                    # Complete with .tar.gz files or directories
                    COMPREPLY=( $(compgen -f -- "\${cur}") )
                fi
                return 0
            ;;
            list)
                COMPREPLY=( $(compgen -W "\${list_opts}" -- "\${cur}") )
                return 0
            ;;
            clean)
                COMPREPLY=( $(compgen -W "\${clean_opts}" -- "\${cur}") )
                return 0
            ;;
            uninstall)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "\${uninstall_opts}" -- "\${cur}") )
                fi
                # Could list installed packages here if we had a way to query them
                return 0
            ;;
            completion)
                COMPREPLY=( $(compgen -W "\${completion_opts}" -- "\${cur}") )
                return 0
            ;;
            help)
                # Complete with commands for help
                COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
                return 0
            ;;
        esac
    fi

    # No command yet, complete with commands or options or files
    if [[ "$cur" == -* ]]; then
        # Complete with options
        COMPREPLY=( $(compgen -W "\${global_opts}" -- "\${cur}") )
    else
        # Complete with commands and .bpl files
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
        COMPREPLY+=( $(compgen -f -X '!*.bpl' -- "\${cur}") )
    fi

    return 0
}

# Register the completion function
complete -F _bpl_completion bpl
`;
}

/**
 * Get the embedded zsh completion script
 */
export function getZshCompletionScript(): string {
  return `#compdef bpl
# Zsh completion script for bpl CLI
# Installation:
#   1. Copy this file to a directory in your $fpath (e.g., /usr/local/share/zsh/site-functions/_bpl)
#   2. Or add the completions directory to your fpath in ~/.zshrc:
#      fpath=(~/.local/share/zsh/completions $fpath)
#   3. Reload completions: rm -f ~/.zcompdump; compinit

_bpl() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    local -a commands
    commands=(
        'run:Compile and execute a BPL program'
        'dev:Development mode with watch and auto-run'
        'build:Compile a BPL program'
        'check:Type check BPL files without generating code'
        'format:Format BPL source files'
        'lint:Lint BPL source files'
        'new:Create a new BPL project with standard structure'
        'clean:Remove build artifacts and caches'
        'init:Initialize a new BPL package'
        'pack:Package a BPL project'
        'install:Install a BPL package'
        'list:List installed BPL packages'
        'uninstall:Uninstall a BPL package'
        'package-cache:List, verify, repair, and clean cached package archives'
        'docs:Generate documentation'
        'bindgen:Generate BPL extern declarations from C headers'
        'doctor:Check local BPL toolchain and runtime setup'
        'completion:Generate shell completion scripts'
        'help:Display help information'
    )

    local -a global_options
    global_options=(
        '-e[Evaluate BPL code passed as string]:code'
        '--eval[Evaluate BPL code passed as string]:code'
        '--stdin[Read BPL code from stdin]'
        '-o[Output file path]:file:_files'
        '--output[Output file path]:file:_files'
        '--emit[Emit type]:type:(llvm ast tokens formatted)'
        '--target[Target triple for clang]:triple:(x86_64-pc-linux-gnu aarch64-unknown-linux-gnu arm64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-gnu wasm32-unknown-unknown wasm32-wasi)'
        '--sysroot[Sysroot path for cross-compilation]:path:_directories'
        '--cpu[Target CPU for clang]:cpu'
        '--march[Target architecture for clang]:arch'
        '--clang-flag[Additional flags for clang]:flag'
        '--wasm-runtime[WebAssembly runtime mode]:mode:(freestanding host)'
        '-l[Libraries to link with]:library'
        '--lib[Libraries to link with]:library'
        '-L[Library search paths]:path:_directories'
        '--lib-path[Library search paths]:path:_directories'
        '--object[Object files to link]:file:_files -g "*.{o,ll,bc}"'
        '-v[Enable verbose output]'
        '--verbose[Enable verbose output]'
        '-q[Suppress non-error output]'
        '--quiet[Suppress non-error output]'
        '--cache[Enable incremental compilation with module caching]'
        '--cache-stats[Show incremental cache hit/miss statistics]'
        '-j[Parallel module compilation jobs for cached builds]:count'
        '--jobs[Parallel module compilation jobs for cached builds]:count'
        '-d[Generate DWARF debug information]'
        '--dwarf[Generate DWARF debug information]'
        '--debug[Generate DWARF debug information (alias for --dwarf)]'
        '--time[Show compilation time statistics]'
        '--json[Output in JSON format]'
        '--color[Force colored output]'
        '--no-color[Disable colored output]'
        '-O[Optimization level]:level:(0 1 2 3)'
        '-h[Display help information]'
        '--help[Display help information]'
        '-V[Display version information]'
        '--version[Display version information]'
    )

    _arguments -C \\
        '1: :->command' \\
        '*::arg:->args' \\
        $global_options

    case $state in
        command)
            _alternative \\
                'commands:command:_describe "command" commands' \\
                'files:BPL file:_files -g "*.bpl"'
            ;;
        args)
            case $words[1] in
                format)
                    _arguments \\
                        '-w[Write formatted output back to file]' \\
                        '--write[Write formatted output back to file]' \\
                        '-v[Enable verbose output]' \\
                        '--verbose[Enable verbose output]' \\
                        '*:file:_files -g "*.bpl"'
                    ;;
                init)
                    _arguments \\
                        '-v[Enable verbose output]' \\
                        '--verbose[Enable verbose output]'
                    ;;
                new)
                    _arguments \\
                        '-v[Enable verbose output]' \\
                        '--verbose[Enable verbose output]' \\
                        '--template[Project template]:template:(app library)' \\
                        '--no-git[Do not initialize git repository]' \\
                        '1:name:'
                    ;;
                doctor)
                    _arguments \\
                        '--json[Output machine-readable diagnostics]' \\
                        '1:scope:(packages)'
                    ;;
                package-cache)
                    _arguments \\
                        '1:subcommand:(list verify repair clean)' \\
                        '--json[Output machine-readable cache entries or verification reports]' \\
                        '--package-version[Only remove a specific package version]:version' \\
                        '--dry-run[Show what would be removed without deleting files]' \\
                        '2:package:'
                    ;;
                pack)
                    _arguments \\
                        '-v[Enable verbose output]' \\
                        '--verbose[Enable verbose output]'
                    ;;
                install)
                    _arguments \\
                        '-v[Enable verbose output]' \\
                        '--verbose[Enable verbose output]' \\
                        '--locked[Verify bpl.lock without changing installed packages]' \\
                        '--update[Re-resolve bpl.json dependencies and rewrite bpl.lock]' \\
                        '--repair-lock[Rewrite bpl.lock from currently installed packages]' \\
                        '1:package:_files'
                    ;;
                list)
                    _arguments \\
                        '-v[Enable verbose output]' \\
                        '--verbose[Enable verbose output]'
                    ;;
                clean)
                    _arguments \\
                        '-v[Enable verbose output]' \\
                        '--verbose[Enable verbose output]' \\
                        '--dry-run[Show what would be deleted]' \\
                        '--json[Output machine-readable cleanup report]'
                    ;;
                uninstall)
                    _arguments \\
                        '-v[Enable verbose output]' \\
                        '--verbose[Enable verbose output]' \\
                        '1:package:'
                    ;;
                completion)
                    _arguments \\
                        '1:shell:(bash zsh)'
                    ;;
                help)
                    _describe 'command' commands
                    ;;
                *)
                    # For file compilation
                    _files -g "*.bpl"
                    ;;
            esac
            ;;
    esac
}

_bpl "$@"
`;
}
