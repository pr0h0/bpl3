# Environment variables utilities

export [Env];

extern getenv(name: string) ret string;
extern setenv(name: string, value: string, overwrite: int) ret int;
extern unsetenv(name: string) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(str: string) ret long;
extern strcpy(dest: string, src: string) ret string;
extern atoi(str: string) ret int;

import [Array] from "std/array.bpl";

struct EnvVar {
    name: string,
    value: string,
}

struct Env {
    # Get an environment variable value
    # Returns nullptr if not found
    frame get(name: string) ret string {
        if (name == nullptr) {
            return nullptr;
        }
        return getenv(name);
    }

    # Get an environment variable with a default value if not found
    frame getOr(name: string, defaultValue: string) ret string {
        local val: string = getenv(name);
        if (val == nullptr) {
            return defaultValue;
        }
        return val;
    }

    # Set an environment variable
    # Returns true on success
    frame set(name: string, value: string) ret bool {
        if ((name == nullptr) || (value == nullptr)) {
            return false;
        }
        return setenv(name, value, 1) == 0;
    }

    # Set an environment variable only if it doesn't exist
    # Returns true on success (including if already set)
    frame setIfAbsent(name: string, value: string) ret bool {
        if ((name == nullptr) || (value == nullptr)) {
            return false;
        }
        return setenv(name, value, 0) == 0;
    }

    # Unset (remove) an environment variable
    # Returns true on success
    frame unset(name: string) ret bool {
        if (name == nullptr) {
            return false;
        }
        return unsetenv(name) == 0;
    }

    # Check if an environment variable exists
    frame has(name: string) ret bool {
        return getenv(name) != nullptr;
    }

    # Check if an environment variable exists and is non-empty
    frame hasValue(name: string) ret bool {
        local val: string = getenv(name);
        if (val == nullptr) {
            return false;
        }
        return strlen(val) > cast<long>(0);
    }

    # Get the PATH environment variable
    frame getPath() ret string {
        return Env.getOr("PATH", "");
    }

    # Get the HOME directory
    frame getHome() ret string {
        return Env.getOr("HOME", "");
    }

    # Get the current user name
    frame getUser() ret string {
        return Env.getOr("USER", "");
    }

    # Get the shell
    frame getShell() ret string {
        return Env.getOr("SHELL", "/bin/sh");
    }

    # Get the TERM variable
    frame getTerm() ret string {
        return Env.getOr("TERM", "");
    }

    # Get the PWD (current working directory from env)
    frame getPwd() ret string {
        return Env.getOr("PWD", "");
    }

    # Get the LANG variable
    frame getLang() ret string {
        return Env.getOr("LANG", "");
    }

    # Get the temporary directory
    frame getTmpDir() ret string {
        local tmp: string = Env.get("TMPDIR");
        if (tmp != nullptr) {
            return tmp;
        }
        tmp = Env.get("TMP");
        if (tmp != nullptr) {
            return tmp;
        }
        tmp = Env.get("TEMP");
        if (tmp != nullptr) {
            return tmp;
        }
        return "/tmp";
    }

    # Check if running in debug mode (various common env vars)
    frame isDebug() ret bool {
        local debug: string = Env.get("DEBUG");
        if ((debug != nullptr) && (strlen(debug) > cast<long>(0))) {
            return true;
        }
        debug = Env.get("BPL_DEBUG");
        if ((debug != nullptr) && (strlen(debug) > cast<long>(0))) {
            return true;
        }
        return false;
    }

    # Get environment variable as integer, with default
    frame getInt(name: string, defaultValue: int) ret int {
        local val: string = getenv(name);
        if (val == nullptr) {
            return defaultValue;
        }
        local ptr: *u8 = cast<*u8>(val);
        local result: int = 0;
        local negative: bool = false;

        # Handle optional sign
        if (*ptr == cast<u8>(45)) {
            # '-'
            negative = true;
            ptr = ptr + 1;
        } else if (*ptr == cast<u8>(43)) {
            # '+'
            ptr = ptr + 1;
        }
        # Parse digits
        loop (*ptr != cast<u8>(0)) {
            local c: u8 = *ptr;
            if ((c >= cast<u8>(48)) && (c <= cast<u8>(57))) {
                result = (result * 10) + cast<int>(c - cast<u8>(48));
            } else {
                # Non-digit encountered
                return defaultValue;
            }
            ptr = ptr + 1;
        }

        if (negative) {
            result = -result;
        }
        return result;
    }

    # Get environment variable as boolean
    # Considers "1", "true", "yes", "on" as true (case insensitive)
    frame getBool(name: string, defaultValue: bool) ret bool {
        local val: string = getenv(name);
        if (val == nullptr) {
            return defaultValue;
        }
        local ptr: *u8 = cast<*u8>(val);
        local c: u8 = *ptr;

        # Check first character
        if (c == cast<u8>(49)) {
            # '1'
            return true;
        }
        if (c == cast<u8>(48)) {
            # '0'
            return false;
        }
        # Check for "true"/"TRUE"
        if (((c == cast<u8>(116)) || (c == cast<u8>(84))) && ((*(ptr + 1) == cast<u8>(114)) || (*(ptr + 1) == cast<u8>(82))) && ((*(ptr + 2) == cast<u8>(117)) || (*(ptr + 2) == cast<u8>(85))) && ((*(ptr + 3) == cast<u8>(101)) || (*(ptr + 3) == cast<u8>(69))) && (*(ptr + 4) == cast<u8>(0))) {
            return true;
        }
        # Check for "false"/"FALSE"
        if (((c == cast<u8>(102)) || (c == cast<u8>(70))) && ((*(ptr + 1) == cast<u8>(97)) || (*(ptr + 1) == cast<u8>(65))) && ((*(ptr + 2) == cast<u8>(108)) || (*(ptr + 2) == cast<u8>(76))) && ((*(ptr + 3) == cast<u8>(115)) || (*(ptr + 3) == cast<u8>(83))) && ((*(ptr + 4) == cast<u8>(101)) || (*(ptr + 4) == cast<u8>(69))) && (*(ptr + 5) == cast<u8>(0))) {
            return false;
        }
        # Check for "yes"/"YES"
        if (((c == cast<u8>(121)) || (c == cast<u8>(89))) && ((*(ptr + 1) == cast<u8>(101)) || (*(ptr + 1) == cast<u8>(69))) && ((*(ptr + 2) == cast<u8>(115)) || (*(ptr + 2) == cast<u8>(83))) && (*(ptr + 3) == cast<u8>(0))) {
            return true;
        }
        # Check for "no"/"NO"
        if (((c == cast<u8>(110)) || (c == cast<u8>(78))) && ((*(ptr + 1) == cast<u8>(111)) || (*(ptr + 1) == cast<u8>(79))) && (*(ptr + 2) == cast<u8>(0))) {
            return false;
        }
        # Check for "on"/"ON"
        if (((c == cast<u8>(111)) || (c == cast<u8>(79))) && ((*(ptr + 1) == cast<u8>(110)) || (*(ptr + 1) == cast<u8>(78))) && (*(ptr + 2) == cast<u8>(0))) {
            return true;
        }
        # Check for "off"/"OFF"
        if (((c == cast<u8>(111)) || (c == cast<u8>(79))) && ((*(ptr + 1) == cast<u8>(102)) || (*(ptr + 1) == cast<u8>(70))) && ((*(ptr + 2) == cast<u8>(102)) || (*(ptr + 2) == cast<u8>(70))) && (*(ptr + 3) == cast<u8>(0))) {
            return false;
        }
        return defaultValue;
    }
}
