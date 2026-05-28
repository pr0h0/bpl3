import [StringBuilder] from "std/string_builder.bpl";
import HTMLEscape_appendEscaped from "bpl-templ";
extern free(ptr: *void);
struct Home {
  frame write(_sb: *StringBuilder, name: string) {
    _sb.append("<html>");
    _sb.append("\n");
    _sb.append("  <body>");
    _sb.append("\n");
    _sb.append("    <h1>Welcome</h1>");
    _sb.append("\n");
    _sb.append("    <p>Hello, ");
    HTMLEscape_appendEscaped(_sb, name);
    _sb.append("!</p>");
    _sb.append("\n");
    _sb.append("    <p>Escaping test: ");
    HTMLEscape_appendEscaped(_sb, "<script>alert('xss')</script>");
    _sb.append("</p>");
    _sb.append("\n");
    _sb.append("  </body>");
    _sb.append("\n");
    _sb.append("</html>");
    _sb.append("\n");
    _sb.append("\n");

  }
  frame render(name: string) ret string {
      local sb: StringBuilder = StringBuilder.new(1024);
      Home.write(&sb, name);
      return sb.toString();
  }
  frame free(str: string) {
      if (str != nullptr) {
          free(cast<*void>(str));
      }
  }
}
export [Home];
