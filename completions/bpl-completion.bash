#!/usr/bin/env bash
# Bash completion script for bpl CLI
# Installation:
#   1. Copy this file to /etc/bash_completion.d/bpl or ~/.local/share/bash-completion/completions/bpl
#   2. Or source it in your ~/.bashrc: source /path/to/bpl-completion.bash
#   3. Reload your shell or run: source ~/.bashrc

_bpl_completion() {
    local cur prev opts base
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    # Main commands
    local commands="format run dev build check lint init pack install list uninstall completion clean new help docs bindgen doctor"

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
    local doctor_opts="--json"

    # Pack command options
    local pack_opts="-v --verbose"

    # Install command options
    local install_opts="-v --verbose"

    # List command options
    local list_opts="-v --verbose"

    # Uninstall command options
    local uninstall_opts="-v --verbose"

    # Completion command options
    local completion_opts="bash zsh"

    # Emit types
    local emit_types="llvm ast tokens formatted"
    local wasm_runtime_modes="freestanding host"

    # Check if we're after a specific option that needs a value
    case "${prev}" in
        -o|--output)
            # Complete with file paths
            COMPREPLY=( $(compgen -f -- "${cur}") )
            return 0
        ;;
        --emit)
            COMPREPLY=( $(compgen -W "${emit_types}" -- "${cur}") )
            return 0
        ;;
        --target)
            # Common target triples
            local targets="x86_64-pc-linux-gnu aarch64-unknown-linux-gnu arm64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-gnu wasm32-unknown-unknown wasm32-wasi"
            COMPREPLY=( $(compgen -W "${targets}" -- "${cur}") )
            return 0
        ;;
        --wasm-runtime)
            COMPREPLY=( $(compgen -W "${wasm_runtime_modes}" -- "${cur}") )
            return 0
        ;;
        --sysroot|--lib-path|-L)
            # Complete with directories
            COMPREPLY=( $(compgen -d -- "${cur}") )
            return 0
        ;;
        --object)
            # Complete with object files
            COMPREPLY=( $(compgen -f -X '!*.@(o|ll|bc)' -- "${cur}") )
            return 0
        ;;
        -l|--lib)
            # Don't complete, let user type library name
            return 0
        ;;
        --template)
            COMPREPLY=( $(compgen -W "${new_templates}" -- "${cur}") )
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
        local word="${COMP_WORDS[i]}"
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
                    COMPREPLY=( $(compgen -W "${format_opts}" -- "${cur}") )
                else
                    # Complete with .bpl files
                    COMPREPLY=( $(compgen -f -X '!*.bpl' -- "${cur}") )
                fi
                return 0
            ;;
            lint)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "${lint_opts}" -- "${cur}") )
                else
                    # Complete with .bpl files
                    COMPREPLY=( $(compgen -f -X '!*.bpl' -- "${cur}") )
                fi
                return 0
            ;;
            init)
                COMPREPLY=( $(compgen -W "${init_opts}" -- "${cur}") )
                return 0
            ;;
            new)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "${new_opts}" -- "${cur}") )
                fi
                return 0
            ;;
            doctor)
                COMPREPLY=( $(compgen -W "${doctor_opts}" -- "${cur}") )
                return 0
            ;;
            pack)
                COMPREPLY=( $(compgen -W "${pack_opts}" -- "${cur}") )
                return 0
            ;;
            install)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "${install_opts}" -- "${cur}") )
                else
                    # Complete with .tar.gz files or directories
                    COMPREPLY=( $(compgen -f -- "${cur}") )
                fi
                return 0
            ;;
            list)
                COMPREPLY=( $(compgen -W "${list_opts}" -- "${cur}") )
                return 0
            ;;
            uninstall)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "${uninstall_opts}" -- "${cur}") )
                fi
                # Could list installed packages here if we had a way to query them
                return 0
            ;;
            completion)
                COMPREPLY=( $(compgen -W "${completion_opts}" -- "${cur}") )
                return 0
            ;;
            help)
                # Complete with commands for help
                COMPREPLY=( $(compgen -W "${commands}" -- "${cur}") )
                return 0
            ;;
        esac
    fi

    # No command yet, complete with commands or options or files
    if [[ "$cur" == -* ]]; then
        # Complete with options
        COMPREPLY=( $(compgen -W "${global_opts}" -- "${cur}") )
    else
        # Complete with commands and .bpl files
        COMPREPLY=( $(compgen -W "${commands}" -- "${cur}") )
        COMPREPLY+=( $(compgen -f -X '!*.bpl' -- "${cur}") )
    fi

    return 0
}

# Register the completion function
complete -F _bpl_completion bpl
