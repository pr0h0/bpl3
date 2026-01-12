# Character classification and utility functions

export [CharUtils];

struct CharUtils {
    # Returns true if c is a decimal digit (0-9)
    frame isDigit(c: char) ret bool {
        return (c >= 48) && (c <= 57);
    }

    # Returns true if c is a hexadecimal digit (0-9, a-f, A-F)
    frame isHexDigit(c: char) ret bool {
        if ((c >= 48) && (c <= 57)) 
            return true;
        # 0-9
        if ((c >= 97) && (c <= 102)) 
            return true;
        # a-f
        if ((c >= 65) && (c <= 70)) 
            return true;
        # A-F
        return false;
    }

    # Returns true if c is an alphabetic letter (a-z, A-Z)
    frame isAlpha(c: char) ret bool {
        if ((c >= 97) && (c <= 122)) 
            return true;
        # a-z
        if ((c >= 65) && (c <= 90)) 
            return true;
        # A-Z
        return false;
    }

    # Returns true if c is alphanumeric (0-9, a-z, A-Z)
    frame isAlphaNumeric(c: char) ret bool {
        return CharUtils.isAlpha(c) || CharUtils.isDigit(c);
    }

    # Returns true if c is whitespace (space, tab, newline, CR)
    frame isWhitespace(c: char) ret bool {
        if (c == 32) 
            return true;
        # space
        if (c == 9) 
            return true;
        # tab
        if (c == 10) 
            return true;
        # \n
        if (c == 13) 
            return true;
        # \r
        return false;
    }

    # Returns true if c can be start of an identifier (a-z, A-Z, _)
    frame isIdentifierStart(c: char) ret bool {
        if (c == 95) 
            return true;
        # _
        return CharUtils.isAlpha(c);
    }

    # Returns true if c can be part of an identifier (a-z, A-Z, 0-9, _)
    frame isIdentifierPart(c: char) ret bool {
        if (c == 95) 
            return true;
        # _
        return CharUtils.isAlphaNumeric(c);
    }

    # Convert to lower case
    frame toLower(c: char) ret char {
        if ((c >= 65) && (c <= 90)) {
            return cast<char>(cast<int>(c) + 32);
        }
        return c;
    }

    # Convert to upper case
    frame toUpper(c: char) ret char {
        if ((c >= 97) && (c <= 122)) {
            return cast<char>(cast<int>(c) - 32);
        }
        return c;
    }
}
