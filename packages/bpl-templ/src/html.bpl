import [StringBuilder] from "std/string_builder.bpl";

export [HTMLEscape];
struct HTMLEscape {
    # No state
}

extern strlen(s: string) ret int;

export HTMLEscape_appendEscaped;

# For now, let's use a global standalone frame, explicitly exported
frame HTMLEscape_appendEscaped(sb: *StringBuilder, text: string) {
    if (text == nullptr) {
        return;
    }
    local len: int = strlen(text);
    local i: int = 0;
    local ptr: *u8 = cast<*u8>(text);

    loop (i < len) {
        local c: u8 = ptr[i];
        local v: int = cast<int>(c);

        if (v == 60) {
            # <
            sb.append("&lt;");
        } else if (v == 62) {
            # >
            sb.append("&gt;");
        } else if (v == 38) {
            # &
            sb.append("&amp;");
        } else if (v == 34) {
            # "
            sb.append("&quot;");
        } else if (v == 39) {
            # '
            sb.append("&#39;");
        } else {
            sb.appendChar(c);
        }
        i = i + 1;
    }
}

frame appendEscaped(sb: *StringBuilder, text: string) {
    # Helper for the generated code to call directly if imported
    HTMLEscape_appendEscaped(sb, text);
}
